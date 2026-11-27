import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFreshCityState,
  hydrateFromSnapshot,
  useGameStore,
} from '../src/store/useGameStore';
import { getTile, processMonthlyCycle, recomputeCityGridMetrics } from '../src/simulation/tickEngine';
import { BUILDING_CATALOG, GRID_SIZE, GameEvent } from '../src/types/game';

function resetStore() {
  useGameStore.getState().startNewCity('Cidade Teste', 'Prefeito Teste');
}

function findPublicEmptyGrassTile() {
  const tiles = useGameStore.getState().tiles;
  const found = tiles.find(
    (t) =>
      t.ownerType === 'public' &&
      !t.building &&
      t.road === 'none' &&
      !t.conflict &&
      !t.concessionActive &&
      t.terrain !== 'waterfront',
  );
  assert.ok(found, 'Expected an empty public non-waterfront tile in starter city');
  return found;
}

function findAvailableEmptyTile() {
  const tiles = useGameStore.getState().tiles;
  const found = tiles.find(
    (t) =>
      t.ownerType === 'available' &&
      !t.building &&
      t.road === 'none' &&
      !t.conflict &&
      t.terrain !== 'waterfront',
  );
  assert.ok(found, 'Expected an empty available non-waterfront tile');
  return found;
}

test('Construção, melhoria, movimentação e demolição funcionam e validam pré-condições', () => {
  resetStore();
  const lot = findPublicEmptyGrassTile();
  const initialTreasury = useGameStore.getState().economy.treasury;

  // Build padaria
  useGameStore.getState().setActiveTool('build', 'padaria');
  useGameStore.getState().interactWithTile(lot.x, lot.z);

  let state = useGameStore.getState();
  let updatedLot = getTile(state.tiles, lot.x, lot.z)!;
  assert.equal(updatedLot.building?.type, 'padaria');
  assert.equal(updatedLot.building?.level, 1);
  assert.equal(state.economy.treasury, initialTreasury - BUILDING_CATALOG.padaria.cost);

  // Cannot build second Prefeitura
  const emptyLot2 = findPublicEmptyGrassTile();
  useGameStore.getState().setActiveTool('build', 'prefeitura');
  useGameStore.getState().interactWithTile(emptyLot2.x, emptyLot2.z);
  assert.equal(getTile(useGameStore.getState().tiles, emptyLot2.x, emptyLot2.z)?.building, null);

  // Upgrade padaria to level 2
  const upgradeCost = Math.round(BUILDING_CATALOG.padaria.cost * 0.75);
  const treasuryBeforeUpgrade = useGameStore.getState().economy.treasury;
  useGameStore.getState().upgradeBuilding(lot.x, lot.z);
  state = useGameStore.getState();
  updatedLot = getTile(state.tiles, lot.x, lot.z)!;
  assert.equal(updatedLot.building?.level, 2);
  assert.equal(state.economy.treasury, treasuryBeforeUpgrade - upgradeCost);

  // Move padaria to emptyLot2
  const treasuryBeforeMove = useGameStore.getState().economy.treasury;
  useGameStore.getState().startMoveBuilding(lot.x, lot.z);
  useGameStore.getState().interactWithTile(emptyLot2.x, emptyLot2.z);
  state = useGameStore.getState();
  assert.equal(getTile(state.tiles, lot.x, lot.z)?.building, null);
  assert.equal(getTile(state.tiles, emptyLot2.x, emptyLot2.z)?.building?.type, 'padaria');
  assert.equal(state.economy.treasury, treasuryBeforeMove - 6000);

  // Cannot demolish Prefeitura
  const prefTile = state.tiles.find((t) => t.building?.type === 'prefeitura')!;
  useGameStore.getState().demolishAt(prefTile.x, prefTile.z);
  assert.equal(getTile(useGameStore.getState().tiles, prefTile.x, prefTile.z)?.building?.type, 'prefeitura');

  // Demolish padaria and refund 25%
  const treasuryBeforeDemolish = useGameStore.getState().economy.treasury;
  useGameStore.getState().demolishAt(emptyLot2.x, emptyLot2.z);
  state = useGameStore.getState();
  assert.equal(getTile(state.tiles, emptyLot2.x, emptyLot2.z)?.building, null);
  assert.equal(
    state.economy.treasury,
    treasuryBeforeDemolish + Math.round(BUILDING_CATALOG.padaria.cost * 0.25),
  );
});

test('grantConcession impede concessões repetidas, terrenos privados, em conflito ou orla', () => {
  resetStore();
  const publicLot = findPublicEmptyGrassTile();
  const fee = Math.round(publicLot.landValue * 0.45);
  const startTreasury = useGameStore.getState().economy.treasury;

  // First concession succeeds
  useGameStore.getState().grantConcession(publicLot.x, publicLot.z);
  let state = useGameStore.getState();
  let tileAfter = getTile(state.tiles, publicLot.x, publicLot.z)!;
  assert.equal(tileAfter.concessionActive, true);
  assert.equal(tileAfter.ownerType, 'private');
  assert.equal(state.economy.treasury, startTreasury + fee);

  // Repeated concession on same tile must be rejected (no extra money!)
  useGameStore.getState().grantConcession(publicLot.x, publicLot.z);
  state = useGameStore.getState();
  assert.equal(state.economy.treasury, startTreasury + fee);

  // Private/available lot cannot receive concession
  const availLot = findAvailableEmptyTile();
  useGameStore.getState().grantConcession(availLot.x, availLot.z);
  assert.equal(useGameStore.getState().economy.treasury, startTreasury + fee);

  // Conflicted public lot cannot receive concession
  const conflictLot = findPublicEmptyGrassTile();
  useGameStore.setState((s) => ({
    tiles: s.tiles.map((t) =>
      t.x === conflictLot.x && t.z === conflictLot.z
        ? {
            ...t,
            conflict: {
              id: 'conf_test',
              title: 'Ocupação',
              groupName: 'Grupo',
              severity: 2,
              daysActive: 0,
              type: 'occupation',
            },
          }
        : t,
    ),
  }));
  useGameStore.getState().grantConcession(conflictLot.x, conflictLot.z);
  assert.equal(getTile(useGameStore.getState().tiles, conflictLot.x, conflictLot.z)?.concessionActive, false);
  assert.equal(useGameStore.getState().economy.treasury, startTreasury + fee);

  // Waterfront lot cannot receive concession even if public
  const waterfrontLot = useGameStore.getState().tiles.find((t) => t.terrain === 'waterfront')!;
  useGameStore.setState((s) => ({
    tiles: s.tiles.map((t) =>
      t.x === waterfrontLot.x && t.z === waterfrontLot.z ? { ...t, ownerType: 'public' } : t,
    ),
  }));
  useGameStore.getState().grantConcession(waterfrontLot.x, waterfrontLot.z);
  assert.equal(
    getTile(useGameStore.getState().tiles, waterfrontLot.x, waterfrontLot.z)?.concessionActive,
    false,
  );
});

test('openAuction e completeAuction validam elegibilidade, leilão ativo, comprador e lance mínimo', () => {
  resetStore();
  const availLot = findAvailableEmptyTile();
  // Cannot open auction on non-public land
  useGameStore.getState().openAuction(availLot.x, availLot.z);
  assert.equal(useGameStore.getState().auctionTile, null);

  // Cannot complete auction when no auction is active
  const publicLot = findPublicEmptyGrassTile();
  const minBid = Math.round(publicLot.landValue);
  const startTreasury = useGameStore.getState().economy.treasury;
  useGameStore.getState().completeAuction(publicLot.x, publicLot.z, minBid + 5000, 'Construtora X');
  assert.equal(useGameStore.getState().economy.treasury, startTreasury);

  // Open valid auction
  useGameStore.getState().openAuction(publicLot.x, publicLot.z);
  assert.deepEqual(useGameStore.getState().auctionTile, { x: publicLot.x, z: publicLot.z });

  // Reject mismatched tile coordinates
  useGameStore.getState().completeAuction(publicLot.x + 1, publicLot.z, minBid + 5000, 'Construtora X');
  assert.notEqual(useGameStore.getState().auctionTile, null);

  // Reject bid below minimum
  useGameStore.getState().completeAuction(publicLot.x, publicLot.z, minBid - 1, 'Construtora X');
  assert.equal(useGameStore.getState().economy.treasury, startTreasury);
  assert.notEqual(useGameStore.getState().auctionTile, null);

  // Reject empty buyer name
  useGameStore.getState().completeAuction(publicLot.x, publicLot.z, minBid + 5000, '   ');
  assert.equal(useGameStore.getState().economy.treasury, startTreasury);

  // Valid completion
  const bid = minBid + 10000;
  const expectedItbi = Math.round(bid * (useGameStore.getState().economy.itbiRate / 100));
  useGameStore.getState().completeAuction(publicLot.x, publicLot.z, bid, 'Incorporadora Horizonte');
  const state = useGameStore.getState();
  assert.equal(state.auctionTile, null);
  assert.equal(state.economy.treasury, startTreasury + bid + expectedItbi);
  assert.equal(state.economy.settledItbiThisMonth, expectedItbi);
  assert.equal(getTile(state.tiles, publicLot.x, publicLot.z)?.ownerType, 'private');
});

test('togglePlannedDistrict impede cobranças duplicadas e saldo negativo', () => {
  resetStore();
  const lot = findPublicEmptyGrassTile();

  // Insufficient funds cannot go negative
  useGameStore.setState((s) => ({ economy: { ...s.economy, treasury: 10000 } }));
  useGameStore.getState().togglePlannedDistrict(lot.x, lot.z);
  assert.equal(useGameStore.getState().economy.treasury, 10000);
  assert.equal(getTile(useGameStore.getState().tiles, lot.x, lot.z)?.plannedDistrict, false);

  // Sufficient funds charges once
  useGameStore.setState((s) => ({ economy: { ...s.economy, treasury: 100000 } }));
  useGameStore.getState().togglePlannedDistrict(lot.x, lot.z);
  assert.equal(useGameStore.getState().economy.treasury, 75000);
  assert.equal(getTile(useGameStore.getState().tiles, lot.x, lot.z)?.plannedDistrict, true);

  // Second call on already planned district must not charge again
  useGameStore.getState().togglePlannedDistrict(lot.x, lot.z);
  assert.equal(useGameStore.getState().economy.treasury, 75000);
});

test('buyLand e sellLand bloqueiam terrenos incompatíveis, ocupados ou em conflito', () => {
  resetStore();
  const availLot = findAvailableEmptyTile();
  const publicLot = findPublicEmptyGrassTile();

  // Cannot buy public land
  const t0 = useGameStore.getState().economy.treasury;
  useGameStore.getState().buyLand(publicLot.x, publicLot.z);
  assert.equal(useGameStore.getState().economy.treasury, t0);

  // Cannot buy land with conflict
  useGameStore.setState((s) => ({
    tiles: s.tiles.map((t) =>
      t.x === availLot.x && t.z === availLot.z
        ? {
            ...t,
            conflict: {
              id: 'c1',
              title: 'Disputa',
              groupName: 'Movimento',
              severity: 1,
              daysActive: 0,
              type: 'dispute',
            },
          }
        : t,
    ),
  }));
  useGameStore.getState().buyLand(availLot.x, availLot.z);
  assert.equal(getTile(useGameStore.getState().tiles, availLot.x, availLot.z)?.ownerType, 'available');

  // Clear conflict and buy
  useGameStore.setState((s) => ({
    tiles: s.tiles.map((t) =>
      t.x === availLot.x && t.z === availLot.z ? { ...t, conflict: null } : t,
    ),
  }));
  const buyPrice = Math.round(getTile(useGameStore.getState().tiles, availLot.x, availLot.z)!.landValue);
  useGameStore.getState().buyLand(availLot.x, availLot.z);
  assert.equal(getTile(useGameStore.getState().tiles, availLot.x, availLot.z)?.ownerType, 'public');
  assert.equal(useGameStore.getState().economy.treasury, t0 - buyPrice);

  // Cannot sell waterfront land even if public
  const waterfrontLot = useGameStore.getState().tiles.find((t) => t.terrain === 'waterfront')!;
  useGameStore.setState((s) => ({
    tiles: s.tiles.map((t) =>
      t.x === waterfrontLot.x && t.z === waterfrontLot.z ? { ...t, ownerType: 'public' } : t,
    ),
  }));
  const beforeWaterfrontSell = useGameStore.getState().economy.treasury;
  useGameStore.getState().sellLand(waterfrontLot.x, waterfrontLot.z);
  assert.equal(useGameStore.getState().economy.treasury, beforeWaterfrontSell);

  // Sell valid public lot once, then block repeat sale (now private + concessionActive)
  const saleVal = Math.round(getTile(useGameStore.getState().tiles, availLot.x, availLot.z)!.landValue * 1.15);
  const saleItbi = Math.round(saleVal * (useGameStore.getState().economy.itbiRate / 100));
  useGameStore.getState().sellLand(availLot.x, availLot.z);
  const afterSell = useGameStore.getState().economy.treasury;
  assert.equal(afterSell, beforeWaterfrontSell + saleVal + saleItbi);
  useGameStore.getState().sellLand(availLot.x, availLot.z);
  assert.equal(useGameStore.getState().economy.treasury, afterSell);
});

test('tickEngine: não fabrica empregos artificiais, recalcula métricas após obras privadas e não duplica ITBI', () => {
  // 1. Zero jobs when no job-providing buildings exist
  const fresh = buildFreshCityState('Zero Empregos', 'Prefeito');
  for (const t of fresh.tiles) {
    if (t.building && BUILDING_CATALOG[t.building.type].jobsProvided > 0) {
      t.building = null;
    }
  }
  const zeroJobResult = processMonthlyCycle({
    ...fresh,
    day: 1,
    month: 2,
    year: 1,
  });
  assert.equal(zeroJobResult.indicators.jobsTotal, 0);
  assert.equal(zeroJobResult.indicators.employed, 0);
  assert.equal(zeroJobResult.citizens.every((c) => c.employedAtId === null), true);

  // 2. Monthly ITBI is NOT double-counted or compounded after sellLand
  resetStore();
  const publicLot = findPublicEmptyGrassTile();
  useGameStore.getState().sellLand(publicLot.x, publicLot.z);
  const sAfterSell = useGameStore.getState();
  const settledItbi = sAfterSell.economy.settledItbiThisMonth || 0;
  assert.ok(settledItbi > 0);
  const treasuryBeforeMonthEnd = sAfterSell.economy.treasury;

  const month1 = processMonthlyCycle({
    tiles: sAfterSell.tiles,
    economy: sAfterSell.economy,
    indicators: sAfterSell.indicators,
    politics: sAfterSell.politics,
    citizens: sAfterSell.citizens,
    achievements: sAfterSell.achievements,
    developmentLevel: sAfterSell.developmentLevel,
    decisionLogs: sAfterSell.decisionLogs,
    day: 1,
    month: 2,
    year: 1,
    cityName: sAfterSell.cityName,
    hadDebtBefore: sAfterSell.hadDebtBefore,
  });

  // Treasury change equals lastMonthlyNet (which excludes already-settled ITBI!)
  assert.equal(month1.economy.treasury - treasuryBeforeMonthEnd, month1.economy.lastMonthlyNet);
  assert.equal(month1.economy.settledItbiThisMonth, 0);
  // Reported revenue includes settledItbi for the month, while recurring net excluded it
  assert.equal(
    month1.economy.lastMonthlyRevenue - month1.economy.lastMonthlyExpense - settledItbi,
    month1.economy.lastMonthlyNet,
  );

  // Month 2 must NOT compound Month 1's settled ITBI
  const month2 = processMonthlyCycle({
    tiles: month1.tiles,
    economy: month1.economy,
    indicators: month1.indicators,
    politics: month1.politics,
    citizens: month1.citizens,
    achievements: month1.achievements,
    developmentLevel: month1.developmentLevel,
    decisionLogs: month1.decisionLogs,
    day: 1,
    month: 3,
    year: 1,
    cityName: sAfterSell.cityName,
    hadDebtBefore: sAfterSell.hadDebtBefore,
  });
  const expectedMonth2Itbi = Math.round(
    month2.indicators.population * 18 * (month2.economy.itbiRate / 2),
  );
  assert.equal(month2.economy.revenueBreakdown.itbi, expectedMonth2Itbi);

  // 3. Concession build during monthly cycle updates grid metrics before financial closure
  const concessionState = buildFreshCityState('Concessão Teste', 'Prefeito');
  const lot = concessionState.tiles.find(
    (t) => t.ownerType === 'public' && !t.building && t.road === 'none' && t.terrain !== 'waterfront',
  )!;
  lot.concessionActive = true;
  lot.ownerType = 'private';
  const origRandom = Math.random;
  Math.random = () => 0.01; // forces private concession build & avoids random negative noise
  try {
    const res = processMonthlyCycle({
      ...concessionState,
      day: 1,
      month: 2,
      year: 1,
    });
    const rebuiltGrid = recomputeCityGridMetrics(res.tiles, res.economy, res.politics);
    assert.equal(res.indicators.housingCapacity, rebuiltGrid.housingCapacity);
    assert.equal(res.indicators.jobsTotal, rebuiltGrid.jobsTotal);
  } finally {
    Math.random = origRandom;
  }
});

test('Passagem do tempo respeita pausa/eventos/fim de mandato e mapas temáticos atualizam com investimentos', () => {
  resetStore();
  const beforeThematic = useGameStore.getState().thematicVersion;
  useGameStore.getState().updateBudgets({ budgetSafety: 1.6 });
  assert.equal(useGameStore.getState().thematicVersion, beforeThematic + 1);

  const beforeBillThematic = useGameStore.getState().thematicVersion;
  useGameStore.getState().proposeBill('bill_lights');
  assert.equal(useGameStore.getState().thematicVersion, beforeBillThematic + 1);

  // Time stops when activeEvent is open
  const sampleEvent: GameEvent = {
    id: 'evt_test',
    title: 'Evento Político Teste',
    description: 'Teste de bloqueio temporal',
    type: 'political',
    choices: [
      {
        id: 'opt1',
        label: 'Aprovar',
        cost: 10000,
        description: 'Teste',
        effects: { treasury: -10000, popularity: 2 },
      },
    ],
  };
  useGameStore.setState({ activeEvent: sampleEvent, speed: 4 });
  const hourBefore = useGameStore.getState().hourOfDay;
  useGameStore.getState().advanceSimulation(1.0);
  assert.equal(useGameStore.getState().hourOfDay, hourBefore);

  // Resolving event appends decision log and resumes simulation
  useGameStore.getState().resolveEventChoice('opt1');
  assert.equal(useGameStore.getState().activeEvent, null);
  assert.ok(useGameStore.getState().decisionLogs.some((d) => d.text.includes('Evento Político Teste')));

  // Resigning freezes simulation
  useGameStore.getState().resignMayor();
  assert.notEqual(useGameStore.getState().endGameReport, null);
  const hourAfterResign = useGameStore.getState().hourOfDay;
  useGameStore.getState().advanceSimulation(1.0);
  assert.equal(useGameStore.getState().hourOfDay, hourAfterResign);
});

test('hydrateFromSnapshot preserva progresso, decisões e eventos pendentes e rejeita saves corrompidos', () => {
  resetStore();
  const sampleEvent: GameEvent = {
    id: 'evt_saved',
    title: 'Dilema Preservado',
    description: 'Deve sobreviver ao salvamento.',
    type: 'land_conflict',
    tileX: 5,
    tileZ: 5,
    choices: [
      {
        id: 'ok',
        label: 'Mediar',
        cost: 20000,
        description: 'Resolve',
        effects: { treasury: -20000, resolveConflictTile: true },
      },
    ],
  };
  useGameStore.getState().proposeBill('bill_lights');
  useGameStore.setState({ activeEvent: sampleEvent, day: 14, month: 6, year: 3 });

  const snapshot = useGameStore.getState().exportSnapshot();
  const hydrated = hydrateFromSnapshot(snapshot);
  assert.ok(hydrated, 'Valid snapshot should hydrate');
  assert.equal(hydrated.day, 14);
  assert.equal(hydrated.month, 6);
  assert.equal(hydrated.year, 3);
  assert.equal(hydrated.activeEvent?.id, 'evt_saved');
  assert.ok(hydrated.politics.activePolicies.includes('bill_lights'));
  assert.ok(hydrated.decisionLogs.some((d) => d.text.includes('Programa Cidade Iluminada')));

  // Corrupted tile count
  assert.equal(hydrateFromSnapshot({ ...snapshot, tiles: [] }), null);

  // Corrupted tile coordinates
  const badCoordTiles = (snapshot.tiles as Record<string, unknown>[]).map((t, idx) =>
    idx === 0 ? { ...t, x: 99 } : t,
  );
  assert.equal(hydrateFromSnapshot({ ...snapshot, tiles: badCoordTiles }), null);

  // Corrupted building type
  const badBuildingTiles = (snapshot.tiles as Record<string, unknown>[]).map((t, idx) =>
    idx === 15
      ? {
          ...t,
          road: 'none',
          building: {
            id: 'b_bad',
            type: 'alien_pyramid',
            level: 1,
            rotation: 0,
            ownerType: 'public',
            ownerName: 'X',
            powered: true,
            watered: true,
            connectedRoad: true,
            builtAtDay: 1,
            condition: 100,
          },
        }
      : t,
  );
  assert.equal(hydrateFromSnapshot({ ...snapshot, tiles: badBuildingTiles }), null);

  // Corrupted economy (NaN treasury)
  assert.equal(
    hydrateFromSnapshot({
      ...snapshot,
      economy: { ...(snapshot.economy as Record<string, unknown>), treasury: Number.NaN },
    }),
    null,
  );

  // importSnapshot must reject corrupted data without mutating active state
  const currentYearBeforeBadImport = useGameStore.getState().year;
  assert.equal(useGameStore.getState().importSnapshot({ broken: true }), false);
  assert.equal(useGameStore.getState().year, currentYearBeforeBadImport);

  // Grid size sanity check
  assert.equal(hydrated.tiles.length, GRID_SIZE * GRID_SIZE);
});
