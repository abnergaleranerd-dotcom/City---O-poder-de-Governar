import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFreshCityState,
  evaluateBuildPlacement,
  hydrateFromSnapshot,
  useGameStore,
} from '../src/store/useGameStore';
import { getTile } from '../src/simulation/tickEngine';
import { UrbanNavigationCache } from '../src/simulation/navigation/routeCache';
import { findNearestPedestrianNode } from '../src/simulation/navigation/pedestrianGraph';
import { isPointBlockedForPedestrian, tileKey } from '../src/simulation/navigation/obstacleSystem';
import {
  findAvailableInteractionSpot,
  reserveInteractionSpot,
  sweepSegmentCapsule,
} from '../src/simulation/navigation/worldRegistry';
import { WORLD_SCALE, getCitizenHeightWorld } from '../src/simulation/worldScale';
import { reconcileHouseholds, getResidenceCapacity } from '../src/simulation/agents/householdEngine';
import { reconcileWorkplaces, getWorkplaceSlotCapacity } from '../src/simulation/agents/employmentEngine';
import { stepCitizenEcosystem } from '../src/simulation/agents/citizenEngine';
import { stepCitizenBehaviorAndMotion } from '../src/simulation/agents/citizenStateMachine';
import {
  createInitialTrafficState,
  stepTrafficEngine,
} from '../src/simulation/traffic/trafficEngine';
import { createDefaultTimeConfig } from '../src/simulation/core/simulationClock';
import { CitizenAgent } from '../src/types/game';

function resetStore() {
  useGameStore.getState().startNewCity('Aurora Viva', 'Prefeito Teste');
}

test('1. A* PedestrianGraph evita água e prédios sólidos no caminho entre residência e trabalho', () => {
  const fresh = buildFreshCityState('Teste A*', 'Prefeito');
  const cache = new UrbanNavigationCache();
  cache.ensureFresh(fresh.tiles, 1);

  assert.ok(cache.pedestrianGraph.nodes.size > 50, 'PedestrianGraph deve possuir nós de calçada');
  assert.ok(cache.roadGraph.nodes.size > 10, 'RoadGraph deve possuir nós viários');

  const residence = fresh.tiles.find(
    (t) => t.building && (t.building.type === 'casa_popular' || t.building.type === 'casa_media'),
  );
  const workplace = fresh.tiles.find(
    (t) => t.building && (t.building.type === 'padaria' || t.building.type === 'prefeitura'),
  );
  assert.ok(residence?.building && workplace?.building);

  const startId = cache.pedestrianGraph.buildingEntranceNode.get(residence.building.id)!;
  const goalId = cache.pedestrianGraph.buildingEntranceNode.get(workplace.building.id)!;
  assert.ok(startId && goalId);

  const route = cache.getPedestrianPath(startId, goalId);
  assert.equal(route.found, true);
  assert.ok(route.points.length >= 2);

  for (const pt of route.points) {
    assert.equal(
      isPointBlockedForPedestrian(fresh.tiles, pt.x, pt.z),
      false,
      `Ponto (${pt.x.toFixed(2)}, ${pt.z.toFixed(2)}) não pode atravessar água ou prédio sólido`,
    );
  }
});

test('2. Demolir via intermediária força recálculo de rota ou WaitingForPath sem teleporte', () => {
  const fresh = buildFreshCityState('Teste Rota', 'Prefeito');
  const cache = new UrbanNavigationCache();
  cache.ensureFresh(fresh.tiles, 1);

  const citizen: CitizenAgent = {
    ...fresh.citizens[0],
    insideBuildingId: null,
    behaviorState: 'WalkingToDestination',
    movementState: 'walking',
  };
  const startNode = findNearestPedestrianNode(cache.pedestrianGraph, citizen.x, citizen.z, 3)!;
  citizen.x = startNode.x;
  citizen.z = startNode.z;

  // Find another road tile far from startNode and path to it
  const roadTiles = fresh.tiles.filter((t) => t.road !== 'none');
  const destRoad = roadTiles[roadTiles.length - 1];
  const destNode = findNearestPedestrianNode(cache.pedestrianGraph, destRoad.x, destRoad.z, 2)!;
  const pathRes = cache.getPedestrianPath(startNode.id, destNode.id);
  assert.equal(pathRes.found, true);
  assert.ok(pathRes.points.length > 4);

  citizen.path = pathRes.points;
  citizen.pathIndex = 1;

  // Turn an upcoming road tile along the path into a solid building and water barrier
  const midPt = pathRes.points[Math.min(2, pathRes.points.length - 1)];
  const midTile = getTile(fresh.tiles, Math.round(midPt.x), Math.round(midPt.z));
  assert.ok(midTile);
  midTile.road = 'none';
  midTile.terrain = 'waterfront';

  // Rebuild navigation cache after grid change
  cache.ensureFresh(fresh.tiles, 2);
  const xBefore = citizen.x;
  const zBefore = citizen.z;

  stepCitizenEcosystem({
    tiles: fresh.tiles,
    citizens: [citizen],
    households: fresh.households,
    workplaces: fresh.workplaces,
    navCache: cache,
    hourOfDay: 10,
    day: 2,
    year: 1,
    physicalDt: 0.1,
    calendarHoursDelta: 0.01,
    timeConfig: createDefaultTimeConfig(),
    indicators: fresh.indicators,
    economy: fresh.economy,
    batchCursor: 0,
    runNeedsAndStructure: false,
  });

  // Citizen must NOT teleport to destination
  const jumpedDist = Math.hypot(citizen.x - xBefore, citizen.z - zBefore);
  assert.ok(jumpedDist < 1.0, `Cidadão não deve teleportar após bloqueio (deslocou ${jumpedDist})`);
});

test('3. Entrada e saída de edifícios oculta NPC dentro do prédio (occupantIds) e respeita permanência', () => {
  const fresh = buildFreshCityState('Teste Entrada', 'Prefeito');
  const cache = new UrbanNavigationCache();
  cache.ensureFresh(fresh.tiles, 1);

  const workTile = fresh.tiles.find((t) => t.building?.type === 'padaria')!;
  const workplace = workTile.building!;
  const c: CitizenAgent = {
    ...fresh.citizens[0],
    employedAtId: workplace.id,
    employedAtName: 'Padaria',
    scheduleProfile: 'clt',
    staggerMinutes: 0,
    insideBuildingId: null,
    x: workTile.x + 0.1,
    z: workTile.z + 0.1,
    path: [{ x: workTile.x, z: workTile.z }],
    pathIndex: 0,
    targetBuildingId: workplace.id,
    behaviorState: 'WalkingToDestination',
    intent: 'work',
    activityUntilHour: 0,
    decisionCooldown: 0,
  };

  // Step during work hour (09:30 on day 2 - weekday) until citizen completes final 0.14-tile step to entrance
  for (let i = 0; i < 4; i++) {
    stepCitizenEcosystem({
      tiles: fresh.tiles,
      citizens: [c],
      households: [],
      workplaces: [],
      navCache: cache,
      hourOfDay: 9.5 + i * 0.02,
      day: 2,
      year: 1,
      physicalDt: 0.25,
      calendarHoursDelta: 0.02,
      timeConfig: createDefaultTimeConfig(),
      indicators: fresh.indicators,
      economy: fresh.economy,
      batchCursor: 0,
      runNeedsAndStructure: i === 0,
    });
  }

  assert.equal(c.insideBuildingId, workplace.id);
  assert.ok(workTile.building!.occupantIds?.includes(c.id));
  assert.ok((c.activityUntilHour ?? 0) > 1.0, 'Deve manter janela de permanência mínima');

  // Remain inside on subsequent short ticks
  stepCitizenEcosystem({
    tiles: fresh.tiles,
    citizens: [c],
    households: [],
    workplaces: [],
    navCache: cache,
    hourOfDay: 9.6,
    day: 2,
    year: 1,
    physicalDt: 0.25,
    calendarHoursDelta: 0.05,
    timeConfig: createDefaultTimeConfig(),
    indicators: fresh.indicators,
    economy: fresh.economy,
    batchCursor: 0,
    runNeedsAndStructure: false,
  });
  assert.equal(c.insideBuildingId, workplace.id);
});

test('4. reconcileHouseholds respeita capacidade residencial estrita e desvincula após demolição', () => {
  const fresh = buildFreshCityState('Teste Residência', 'Prefeito');
  // Keep only ONE casa_popular
  let keptHouseId = '';
  let keptHouseTile = fresh.tiles[0];
  for (const t of fresh.tiles) {
    if (t.building && getResidenceCapacity(t) > 0) {
      if (!keptHouseId) {
        keptHouseId = t.building.id;
        keptHouseTile = t;
      } else {
        t.building = null;
      }
    }
  }
  const cap = getResidenceCapacity(keptHouseTile);
  assert.ok(cap > 0);

  const households = reconcileHouseholds(fresh.tiles, fresh.citizens, []);
  const housedCount = fresh.citizens.filter((c) => c.residenceBuildingId === keptHouseId).length;
  assert.ok(housedCount <= cap, `Moradores (${housedCount}) não podem exceder capacidade (${cap})`);
  assert.ok(households.every((h) => h.memberIds.length <= 3));

  // Demolish the last house -> all citizens must be cleanly unlinked
  keptHouseTile.building = null;
  const afterDemolish = reconcileHouseholds(fresh.tiles, fresh.citizens, households);
  assert.equal(afterDemolish.length, 0);
  assert.equal(fresh.citizens.every((c) => c.residenceBuildingId === null && c.homeTileKey === null), true);
});

test('5. reconcileWorkplaces limita trabalhadores às vagas reais e demite ao demolir empresa', () => {
  const fresh = buildFreshCityState('Teste Empregos', 'Prefeito');
  let keptWpId = '';
  let keptWpTile = fresh.tiles[0];
  for (const t of fresh.tiles) {
    if (t.building && getWorkplaceSlotCapacity(t) > 0) {
      if (!keptWpId) {
        keptWpId = t.building.id;
        keptWpTile = t;
      } else {
        t.building = null;
      }
    }
  }
  const cap = getWorkplaceSlotCapacity(keptWpTile);
  assert.ok(cap > 0);

  const workplaces = reconcileWorkplaces(fresh.tiles, fresh.citizens);
  assert.equal(workplaces.length, 1);
  assert.ok(workplaces[0].workerIds.length <= cap);
  const employedCount = fresh.citizens.filter((c) => c.employedAtId === keptWpId).length;
  assert.equal(employedCount, workplaces[0].workerIds.length);

  // Demolish workplace -> all workers must become unemployed cleanly
  keptWpTile.building = null;
  const afterDemolish = reconcileWorkplaces(fresh.tiles, fresh.citizens);
  assert.equal(afterDemolish.length, 0);
  assert.equal(fresh.citizens.every((c) => c.employedAtId === null && c.income === 0), true);
});

test('6. TrafficEngine mantém veículos nas vias, alterna semáforos, freia no vermelho e evita teleporte', () => {
  const fresh = buildFreshCityState('Teste Trânsito', 'Prefeito');
  const cache = new UrbanNavigationCache();
  cache.ensureFresh(fresh.tiles, 1);
  const traffic = createInitialTrafficState();
  const cfg = createDefaultTimeConfig();

  // Warm up traffic spawning
  for (let i = 0; i < 6; i++) {
    stepTrafficEngine(traffic, fresh.tiles, fresh.citizens, cache, 0.25, cfg);
  }
  assert.ok(traffic.vehicles.length >= 4, 'Deve gerar frota de veículos com origem/destino');
  assert.ok(traffic.signals.length >= 1, 'Deve detectar cruzamentos semaforizados');

  // Verify vehicles are on/near valid road tiles and signals change phases over time
  const initialPhase = traffic.signals[0].phase;
  let phaseChanged = false;
  for (let i = 0; i < 60; i++) {
    stepTrafficEngine(traffic, fresh.tiles, fresh.citizens, cache, 0.25, cfg);
    if (traffic.signals[0]?.phase !== initialPhase) {
      phaseChanged = true;
    }
  }
  assert.equal(phaseChanged, true, 'Semáforos devem alternar de fase com o tempo');

  for (const v of traffic.vehicles) {
    assert.ok(Number.isFinite(v.x) && Number.isFinite(v.z));
    assert.ok(v.originTileKey.includes(',') && v.destTileKey.includes(','));
    const curKey = tileKey(Math.round(v.x), Math.round(v.z));
    assert.ok(cache.roadGraph.nodes.has(curKey), `Veículo ${v.id} deve permanecer sobre via (${curKey})`);
  }

  // Demolish road under first vehicle -> safely despawns/reroutes without teleporting off-road
  const v0 = traffic.vehicles[0];
  const v0Tile = getTile(fresh.tiles, Math.round(v0.x), Math.round(v0.z))!;
  v0Tile.road = 'none';
  cache.ensureFresh(fresh.tiles, 2);
  stepTrafficEngine(traffic, fresh.tiles, fresh.citizens, cache, 0.1, cfg);
  for (const v of traffic.vehicles) {
    const k = tileKey(Math.round(v.x), Math.round(v.z));
    assert.ok(cache.roadGraph.nodes.has(k), 'Nenhum veículo deve permanecer em tile sem via');
  }
});

test('7. Velocidade 0 (Pausa) congela tempo, cidadãos e veículos completamente', () => {
  resetStore();
  useGameStore.getState().setSpeed(1);
  useGameStore.getState().advanceSimulation(0.2);

  useGameStore.getState().setSpeed(0);
  const before = useGameStore.getState();
  const h0 = before.hourOfDay;
  const d0 = before.day;
  const citizensBefore = before.citizens.map((c) => ({ id: c.id, x: c.x, z: c.z }));
  const vehiclesBefore = before.vehicles.map((v) => ({ id: v.id, x: v.x, z: v.z }));

  useGameStore.getState().advanceSimulation(2.0);
  const after = useGameStore.getState();

  assert.equal(after.hourOfDay, h0);
  assert.equal(after.day, d0);
  assert.deepEqual(
    after.citizens.map((c) => ({ id: c.id, x: c.x, z: c.z })),
    citizensBefore,
  );
  assert.deepEqual(
    after.vehicles.map((v) => ({ id: v.id, x: v.x, z: v.z })),
    vehiclesBefore,
  );
});

test('8. Fixed-timestep mantém consistência temporal entre 30 FPS e 60 FPS', () => {
  resetStore();
  useGameStore.getState().setTimeConfig({ secondsPerDay: 180 });
  useGameStore.getState().setSpeed(1);
  useGameStore.setState({ hourOfDay: 8.0, day: 1, dayAccumulator: 0 });

  // Simulate 3 seconds at 30 FPS (90 frames of 1/30)
  for (let i = 0; i < 90; i++) {
    useGameStore.getState().advanceSimulation(1 / 30);
  }
  const hour30 = useGameStore.getState().hourOfDay;

  resetStore();
  useGameStore.getState().setTimeConfig({ secondsPerDay: 180 });
  useGameStore.getState().setSpeed(1);
  useGameStore.setState({ hourOfDay: 8.0, day: 1, dayAccumulator: 0 });

  // Simulate 3 seconds at 60 FPS (180 frames of 1/60)
  for (let i = 0; i < 180; i++) {
    useGameStore.getState().advanceSimulation(1 / 60);
  }
  const hour60 = useGameStore.getState().hourOfDay;

  assert.ok(
    Math.abs(hour30 - hour60) < 0.05,
    `Relógio a 30 FPS (${hour30}) e 60 FPS (${hour60}) deve permanecer consistente`,
  );
});

test('9. Padrão temporal de 180s/dia, presets e avanços rápidos (+1d / fim de mês) funcionam', () => {
  resetStore();
  const s0 = useGameStore.getState();
  assert.equal(s0.timeConfig.secondsPerDay, 180);
  assert.equal(s0.timeConfig.preset, 'balanced');

  s0.setTimePreset('relaxed');
  assert.equal(useGameStore.getState().timeConfig.secondsPerDay, 300);

  s0.setTimePreset('strategic');
  assert.equal(useGameStore.getState().timeConfig.secondsPerDay, 60);

  // Advance +1d
  const dBefore = useGameStore.getState().day;
  useGameStore.getState().advanceToNextDay();
  assert.equal(useGameStore.getState().day, dBefore + 1);
  assert.equal(useGameStore.getState().hourOfDay, 7.0);

  // Advance to month end
  const mBefore = useGameStore.getState().month;
  useGameStore.getState().advanceToMonthEnd();
  assert.equal(useGameStore.getState().day, 1);
  assert.equal(useGameStore.getState().month, mBefore + 1);
});

test('10. Retrocompatibilidade: hydrateFromSnapshot aceita saves legados v2 sem campos do Mundo Vivo', () => {
  resetStore();
  const v3Snap = useGameStore.getState().exportSnapshot();

  // Strip v3 Living World fields to simulate an older v2 save
  const legacyTiles = (v3Snap.tiles as Record<string, unknown>[]).map((t) => {
    const copy = { ...t };
    delete copy.zone;
    delete copy.busStop;
    if (copy.building && typeof copy.building === 'object') {
      const b = { ...(copy.building as Record<string, unknown>) };
      delete b.constructionStage;
      delete b.constructionProgress;
      delete b.occupantIds;
      delete b.entranceTile;
      delete b.variantSeed;
      delete b.zone;
      copy.building = b;
    }
    return copy;
  });

  const legacyCitizens = (v3Snap.citizens as Record<string, unknown>[]).map((c) => {
    const copy = { ...c };
    delete copy.personality;
    delete copy.scheduleProfile;
    delete copy.behaviorState;
    delete copy.animState;
    delete copy.insideBuildingId;
    delete copy.birthDay;
    delete copy.birthYear;
    delete copy.history;
    return copy;
  });

  const legacySnapshot: Record<string, unknown> = {
    version: 2,
    cityName: v3Snap.cityName,
    day: v3Snap.day,
    month: v3Snap.month,
    year: v3Snap.year,
    hourOfDay: v3Snap.hourOfDay,
    speed: 2,
    developmentLevel: v3Snap.developmentLevel,
    hadDebtBefore: false,
    tiles: legacyTiles,
    citizens: legacyCitizens,
    economy: v3Snap.economy,
    indicators: v3Snap.indicators,
    politics: v3Snap.politics,
    news: v3Snap.news,
    achievements: v3Snap.achievements,
    decisionLogs: v3Snap.decisionLogs,
    activeEvent: null,
  };

  const hydrated = hydrateFromSnapshot(legacySnapshot);
  assert.ok(hydrated, 'Snapshot legado v2 deve ser restaurado sem falhas');
  assert.equal(hydrated.timeConfig.secondsPerDay, 180);
  assert.ok(hydrated.households.length >= 1, 'Households devem ser reconstruídos no hydrate');
  assert.ok(hydrated.citizens.every((c) => Boolean(c.personality && c.scheduleProfile)));
});

test('11. SweepSegmentCapsule garante trajeto casa-trabalho sem atravessar muros, árvores, postes ou prédios', () => {
  const fresh = buildFreshCityState('Teste Colisão Contínua', 'Prefeito');
  const cache = new UrbanNavigationCache();
  cache.ensureFresh(fresh.tiles, 1);

  const residence = fresh.tiles.find((t) => t.building?.type === 'casa_popular')!;
  const workplace = fresh.tiles.find((t) => t.building?.type === 'padaria')!;
  const startId = cache.pedestrianGraph.buildingEntranceNode.get(residence.building!.id)!;
  const goalId = cache.pedestrianGraph.buildingEntranceNode.get(workplace.building!.id)!;
  const route = cache.getPedestrianPath(startId, goalId);
  assert.equal(route.found, true);
  assert.ok(route.points.length >= 2);

  for (let i = 0; i < route.points.length - 1; i++) {
    const a = route.points[i];
    const b = route.points[i + 1];
    const swept = sweepSegmentCapsule(
      cache.worldRegistry,
      fresh.tiles,
      a.x,
      a.z,
      b.x,
      b.z,
      WORLD_SCALE.pedestrianRadiusTile * 0.85,
      {
        allowedBuildingId: i === 0 ? residence.building!.id : workplace.building!.id,
        allowDirectCenterEntry: i === 0 || i === route.points.length - 2,
      },
    );
    assert.equal(
      swept.hit,
      false,
      `Segmento ${i} (${a.x.toFixed(2)},${a.z.toFixed(2)})->(${b.x.toFixed(2)},${b.z.toFixed(2)}) colidiu com ${swept.hitObjectId} (${swept.reason})`,
    );
  }
});

test('12. Dois pedestres em sentido oposto mantêm separação e não se atravessam', () => {
  const fresh = buildFreshCityState('Teste Separação NPCs', 'Prefeito');
  const cache = new UrbanNavigationCache();
  cache.ensureFresh(fresh.tiles, 1);
  const cfg = createDefaultTimeConfig();

  // Clear avenue sidewalk stretch along z=11 (x=9 -> x=13)
  const a: CitizenAgent = {
    ...fresh.citizens[0],
    id: 'ped_sep_a',
    insideBuildingId: null,
    x: 10.0,
    z: 11 + WORLD_SCALE.sidewalkWalkableOffsetTile,
    lastValidX: 10.0,
    lastValidZ: 11 + WORLD_SCALE.sidewalkWalkableOffsetTile,
    path: [{ x: 11.2, z: 11 + WORLD_SCALE.sidewalkWalkableOffsetTile }],
    pathIndex: 0,
    behaviorState: 'WalkingToDestination',
    movementState: 'walking',
    animState: 'Walk',
    currentSpeed: 0.18,
    decisionCooldown: 5,
    activityUntilHour: 0,
  };
  const b: CitizenAgent = {
    ...fresh.citizens[1],
    id: 'ped_sep_b',
    insideBuildingId: null,
    x: 10.42,
    z: 11 + WORLD_SCALE.sidewalkWalkableOffsetTile,
    lastValidX: 10.42,
    lastValidZ: 11 + WORLD_SCALE.sidewalkWalkableOffsetTile,
    path: [{ x: 9.2, z: 11 + WORLD_SCALE.sidewalkWalkableOffsetTile }],
    pathIndex: 0,
    behaviorState: 'WalkingToDestination',
    movementState: 'walking',
    animState: 'Walk',
    currentSpeed: 0.18,
    decisionCooldown: 5,
    activityUntilHour: 0,
  };

  let minSeparation = Infinity;
  for (let step = 0; step < 30; step++) {
    stepCitizenBehaviorAndMotion(
      a,
      [a, b],
      fresh.tiles,
      cache,
      10,
      2,
      0.08,
      0.002,
      cfg,
      fresh.indicators,
      fresh.economy,
      false,
      false,
      [],
    );
    stepCitizenBehaviorAndMotion(
      b,
      [a, b],
      fresh.tiles,
      cache,
      10,
      2,
      0.08,
      0.002,
      cfg,
      fresh.indicators,
      fresh.economy,
      false,
      false,
      [],
    );
    const sep = Math.hypot(a.x - b.x, a.z - b.z);
    if (sep < minSeparation) minSeparation = sep;
  }

  assert.ok(
    minSeparation >= 0.08,
    `Pedestres devem manter separação mínima sem sobreposição severa (mínimo observado: ${minSeparation.toFixed(3)})`,
  );
});

test('13. Banco de praça usa InteractionSpot exclusivo e ativa animação Sit ao sentar', () => {
  const fresh = buildFreshCityState('Teste Banco Praça', 'Prefeito');
  const cache = new UrbanNavigationCache();
  cache.ensureFresh(fresh.tiles, 1);
  const cfg = createDefaultTimeConfig();

  const pracaTile = fresh.tiles.find((t) => t.building?.type === 'praca')!;
  const pracaId = pracaTile.building!.id;
  const spot1 = findAvailableInteractionSpot(cache.worldRegistry, pracaId, 'seat', 'cit_bench_1')!;
  assert.ok(spot1, 'Praça deve possuir assentos registrados');
  assert.equal(reserveInteractionSpot(cache.worldRegistry, spot1.id, 'cit_bench_1'), true);
  // Second citizen cannot steal the exact same reserved seat
  const spot2 = findAvailableInteractionSpot(cache.worldRegistry, pracaId, 'seat', 'cit_bench_2')!;
  assert.ok(spot2 && spot2.id !== spot1.id, 'Segundo cidadão deve receber outro banco livre');

  const sitter: CitizenAgent = {
    ...fresh.citizens[0],
    id: 'cit_bench_1',
    insideBuildingId: null,
    targetBuildingId: pracaId,
    occupiedSpotId: spot1.id,
    sittingYaw: spot1.yaw,
    intent: 'socialize',
    activityMinDurationHours: 1.2,
    x: spot1.approachX,
    z: spot1.approachZ,
    lastValidX: spot1.approachX,
    lastValidZ: spot1.approachZ,
    path: [{ x: spot1.approachX, z: spot1.approachZ }],
    pathIndex: 0,
    behaviorState: 'WalkingToDestination',
    movementState: 'walking',
    animState: 'Walk',
    currentSpeed: 0.14,
    decisionCooldown: 5,
  };

  stepCitizenBehaviorAndMotion(
    sitter,
    [sitter],
    fresh.tiles,
    cache,
    15,
    2,
    0.1,
    0.005,
    cfg,
    fresh.indicators,
    fresh.economy,
    false,
    false,
    [],
  );

  assert.equal(sitter.animState, 'Sit');
  assert.equal(sitter.insideBuildingId, null);
  assert.equal(sitter.movementState, 'stopped');
  assert.ok(Math.hypot(sitter.x - spot1.x, sitter.z - spot1.z) < 0.05);
});

test('14. Pedestre na faixa reduz velocidade e aguarda veículo próximo', () => {
  const fresh = buildFreshCityState('Teste Faixa Pedestre', 'Prefeito');
  const cache = new UrbanNavigationCache();
  cache.ensureFresh(fresh.tiles, 1);
  const cfg = createDefaultTimeConfig();

  const cwSeg = cache.pedestrianGraph.crosswalkSegments[0];
  assert.ok(cwSeg, 'Deve existir segmento de faixa de pedestre');
  const cwX = (cwSeg.ax + cwSeg.bx) * 0.5;
  const cwZ = (cwSeg.az + cwSeg.bz) * 0.5;

  const ped: CitizenAgent = {
    ...fresh.citizens[0],
    id: 'ped_cw',
    insideBuildingId: null,
    x: cwX,
    z: cwZ,
    lastValidX: cwX,
    lastValidZ: cwZ,
    path: [{ x: cwSeg.bx, z: cwSeg.bz }],
    pathIndex: 0,
    behaviorState: 'WalkingToDestination',
    movementState: 'walking',
    animState: 'Walk',
    currentSpeed: 0.18,
    decisionCooldown: 5,
  };

  const oncomingVehicle = {
    id: 'veh_cw_test',
    role: 'commuter' as const,
    color: 0x3b82f6,
    x: cwX,
    z: cwZ - 0.3,
    yaw: 0, // Moving toward +Z (+dirZ) right into pedestrian
    speed: 0.85,
    maxSpeed: 1.0,
    originTileKey: '11,9',
    destTileKey: '11,13',
    path: [],
    pathIndex: 0,
    waitingAtSignal: false,
    waitingForCrosswalk: false,
    braking: false,
    stoppedTime: 0,
  };

  stepCitizenBehaviorAndMotion(
    ped,
    [ped],
    fresh.tiles,
    cache,
    10,
    2,
    0.1,
    0.005,
    cfg,
    fresh.indicators,
    fresh.economy,
    false,
    false,
    [oncomingVehicle],
  );

  assert.equal(ped.animState, 'Wait');
  assert.equal(ped.behaviorState, 'CrossingStreet');
  assert.equal(ped.currentSpeed, 0);
});

test('15. Build UX: evaluateBuildPlacement, Undo anti-exploit e confirmação de demolição funcionam', () => {
  resetStore();
  const s0 = useGameStore.getState();
  // Find an empty lot adjacent to a starter road
  const emptyLot = s0.tiles.find(
    (t) =>
      !t.building &&
      t.road === 'none' &&
      t.terrain !== 'waterfront' &&
      !t.conflict &&
      (t.ownerType === 'available' || t.ownerType === 'public') &&
      s0.tiles.some((nb) => nb.road !== 'none' && Math.abs(nb.x - t.x) + Math.abs(nb.z - t.z) === 1),
  )!;
  assert.ok(emptyLot, 'Deve existir lote livre adjacente a via para teste');

  const evalRes = evaluateBuildPlacement(
    s0.tiles,
    emptyLot.x,
    emptyLot.z,
    'casa_popular',
    s0.economy.treasury,
    s0.developmentLevel,
    false,
    0,
  );
  assert.equal(evalRes.valid, true);
  assert.ok(evalRes.totalCost > 0);

  const treasuryBefore = s0.economy.treasury;
  s0.setActiveTool('build', 'casa_popular');
  s0.interactWithTile(emptyLot.x, emptyLot.z);

  const afterBuild = useGameStore.getState();
  const builtTile = getTile(afterBuild.tiles, emptyLot.x, emptyLot.z)!;
  assert.equal(builtTile.building?.type, 'casa_popular');
  assert.equal(afterBuild.buildUndoStack.length, 1);
  assert.equal(afterBuild.economy.treasury, treasuryBefore - evalRes.totalCost);

  // Undo immediately refunds exact amount
  afterBuild.undoLastBuild();
  const afterUndo = useGameStore.getState();
  assert.equal(getTile(afterUndo.tiles, emptyLot.x, emptyLot.z)!.building, null);
  assert.equal(afterUndo.economy.treasury, treasuryBefore);

  // Rebuild and advance day -> anti-exploit clears Undo stack
  afterUndo.setActiveTool('build', 'casa_popular');
  afterUndo.interactWithTile(emptyLot.x, emptyLot.z);
  assert.equal(useGameStore.getState().buildUndoStack.length, 1);
  useGameStore.getState().advanceToNextDay();
  assert.equal(useGameStore.getState().buildUndoStack.length, 0);
  useGameStore.getState().undoLastBuild();
  assert.equal(getTile(useGameStore.getState().tiles, emptyLot.x, emptyLot.z)!.building?.type, 'casa_popular');

  // Request & confirm demolition modal flow
  useGameStore.getState().requestDemolition(emptyLot.x, emptyLot.z);
  assert.ok(useGameStore.getState().pendingDemolition);
  useGameStore.getState().confirmDemolition();
  assert.equal(useGameStore.getState().pendingDemolition, null);
  assert.equal(getTile(useGameStore.getState().tiles, emptyLot.x, emptyLot.z)!.building, null);
});

test('16. Escala métrica e estado inicial humanizado mantêm viewport aberto (>= 80%) e proporções reais', () => {
  resetStore();
  const s = useGameStore.getState();
  assert.equal(s.activeLeftTab, null, 'Dock esquerdo inicia fechado para viewport >= 80% livre');
  const adultH = getCitizenHeightWorld(30, 17);
  const childH = getCitizenHeightWorld(10, 17);
  assert.ok(adultH > childH, 'Adulto deve ser mais alto que criança em metros');
  assert.ok(
    adultH >= 0.24 && adultH <= 0.34,
    `Altura adulta em unidades Three.js (${adultH.toFixed(3)}u) deve respeitar escala 1u=6m`,
  );
  assert.ok(WORLD_SCALE.vehicleSpecs.bus.length > WORLD_SCALE.vehicleSpecs.sedan.length);
});

