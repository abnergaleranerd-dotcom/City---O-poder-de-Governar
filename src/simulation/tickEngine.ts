import {
  Achievement,
  BUILDING_CATALOG,
  BuildingTypeId,
  CitizenAgent,
  CitizenState,
  CityIndicators,
  DecisionLogEntry,
  DEVELOPMENT_LEVELS,
  EconomyState,
  EndGameReport,
  GameEvent,
  GRID_SIZE,
  NewsArticle,
  PoliticsState,
  TileData,
} from '../types/game';
import { createCitizenAgent } from './cityGenerator';
import { computeBuildingAccess, computeFacingRoadRotation } from './navigation/obstacleSystem';
import { inferBuildingZone } from './urban/zoningEngine';

export function getTile(tiles: TileData[], x: number, z: number): TileData | null {
  if (x < 0 || z < 0 || x >= GRID_SIZE || z >= GRID_SIZE) return null;
  return tiles[z * GRID_SIZE + x] || null;
}

export function hasAdjacentRoad(tiles: TileData[], x: number, z: number): boolean {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dz] of dirs) {
    const n = getTile(tiles, x + dx, z + dz);
    if (n && n.road !== 'none') return true;
  }
  return false;
}

export function recomputeCityGridMetrics(
  tiles: TileData[],
  economy: EconomyState,
  politics: PoliticsState,
): {
  totalPowerCapacity: number;
  totalPowerDemand: number;
  totalWaterCapacity: number;
  totalWaterDemand: number;
  housingCapacity: number;
  jobsTotal: number;
  avgSafety: number;
  avgHealth: number;
  avgEducation: number;
  avgPollution: number;
  avgHappiness: number;
  avgTraffic: number;
} {
  let totalPowerCapacity = 0;
  let totalPowerDemand = 0;
  let totalWaterCapacity = 0;
  let totalWaterDemand = 0;
  let housingCapacity = 0;
  let jobsTotal = 0;

  const emitters: {
    x: number;
    z: number;
    radius: number;
    power: number;
    water: number;
    safety: number;
    health: number;
    education: number;
    happiness: number;
    pollution: number;
    landBoost: number;
  }[] = [];

  for (const tile of tiles) {
    tile.hasPower = false;
    tile.hasWater = false;
    tile.pollution = tile.road === 'avenida' ? 3 : tile.road === 'rua' ? 1.5 : 0;
    tile.safetyCoverage = 22 * economy.budgetSafety;
    tile.healthCoverage = 20 * economy.budgetHealth;
    tile.educationCoverage = 20 * economy.budgetEducation;
    tile.leisureCoverage = tile.terrain === 'waterfront' ? 22 : 12;
    tile.trafficLoad = tile.road !== 'none' ? 15 : 0;

    if (tile.building) {
      const def = BUILDING_CATALOG[tile.building.type];
      const lvlMult = tile.building.level === 1 ? 1 : tile.building.level === 2 ? 1.55 : 2.2;
      totalPowerCapacity += def.powerProvided * lvlMult;
      totalPowerDemand += def.powerDemand * lvlMult;
      totalWaterCapacity += def.waterProvided * lvlMult;
      totalWaterDemand += def.waterDemand * lvlMult;

      emitters.push({
        x: tile.x,
        z: tile.z,
        radius: def.radius + (tile.building.level - 1),
        power: def.powerProvided,
        water: def.waterProvided,
        safety: def.safetyBonus * economy.budgetSafety,
        health: def.healthBonus * economy.budgetHealth,
        education: def.educationBonus * economy.budgetEducation,
        happiness: def.happinessBonus,
        pollution: def.pollution * lvlMult,
        landBoost: def.landValueBoost,
      });
    }
  }

  const hasLedPolicy = politics.activePolicies.includes('bill_lights');
  const hasGuardaPolicy = politics.activePolicies.includes('bill_guarda');
  const hasHealthPolicy = politics.activePolicies.includes('bill_preventive_health');
  const hasEduPolicy = politics.activePolicies.includes('bill_school_full');

  // Apply radial effects
  for (const em of emitters) {
    const r = Math.max(1, em.radius);
    const minX = Math.max(0, Math.floor(em.x - r));
    const maxX = Math.min(GRID_SIZE - 1, Math.ceil(em.x + r));
    const minZ = Math.max(0, Math.floor(em.z - r));
    const maxZ = Math.min(GRID_SIZE - 1, Math.ceil(em.z + r));

    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const dist = Math.hypot(x - em.x, z - em.z);
        if (dist > r) continue;
        const falloff = 1 - dist / (r + 0.5);
        const t = tiles[z * GRID_SIZE + x];
        if (em.power > 0) t.hasPower = true;
        if (em.water > 0) t.hasWater = true;
        t.safetyCoverage += em.safety * falloff;
        t.healthCoverage += em.health * falloff;
        t.educationCoverage += em.education * falloff;
        t.leisureCoverage += em.happiness * falloff;
        t.pollution += em.pollution * falloff;
      }
    }
  }

  const powerOk = totalPowerCapacity >= totalPowerDemand * 0.9;
  const waterOk = totalWaterCapacity >= totalWaterDemand * 0.9;

  let sumSafety = 0;
  let sumHealth = 0;
  let sumEdu = 0;
  let sumPollution = 0;
  let sumHappy = 0;
  let sumTraffic = 0;
  let urbanTileCount = 0;

  for (const tile of tiles) {
    if (hasLedPolicy && tile.road !== 'none') tile.safetyCoverage += 12;
    if (hasGuardaPolicy) tile.safetyCoverage += 10;
    if (hasHealthPolicy) tile.healthCoverage += 10;
    if (hasEduPolicy) tile.educationCoverage += 11;

    // Road network connectivity check
    const adjRoad = tile.road !== 'none' || hasAdjacentRoad(tiles, tile.x, tile.z);
    if (tile.building) {
      const def = BUILDING_CATALOG[tile.building.type];
      tile.building.connectedRoad = def.isRoad ? true : adjRoad;
      tile.building.powered = def.powerDemand === 0 || (tile.hasPower && powerOk);
      tile.building.watered = def.waterDemand === 0 || (tile.hasWater && waterOk);

      const operational = tile.building.powered && tile.building.watered && (tile.building.connectedRoad || def.id === 'rede_energia' || def.id === 'saneamento');
      const lvlMult = tile.building.level === 1 ? 1 : tile.building.level === 2 ? 1.55 : 2.2;
      if (operational) {
        housingCapacity += Math.round(def.housingCapacity * lvlMult);
        jobsTotal += Math.round(def.jobsProvided * lvlMult);
      } else {
        housingCapacity += Math.round(def.housingCapacity * 0.45);
        jobsTotal += Math.round(def.jobsProvided * 0.45);
      }
      urbanTileCount++;
    }

    // Traffic load on road tiles based on nearby buildings
    if (tile.road !== 'none') {
      let nearbyBuildings = 0;
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nt = getTile(tiles, tile.x + dx, tile.z + dz);
          if (nt?.building) nearbyBuildings++;
        }
      }
      const roadCap = tile.road === 'avenida' ? 1.85 : 1.0;
      const transitBonus = 0.7 + 0.3 * economy.budgetTransit;
      tile.trafficLoad = Math.min(100, Math.round((12 + nearbyBuildings * 7.5) / (roadCap * transitBonus)));
    }

    tile.pollution = Math.max(0, Math.min(100, Math.round(tile.pollution)));
    tile.safetyCoverage = Math.max(5, Math.min(100, Math.round(tile.safetyCoverage)));
    tile.healthCoverage = Math.max(5, Math.min(100, Math.round(tile.healthCoverage)));
    tile.educationCoverage = Math.max(5, Math.min(100, Math.round(tile.educationCoverage)));
    tile.leisureCoverage = Math.max(5, Math.min(100, Math.round(tile.leisureCoverage)));

    // Crime risk is inverse of safety + slightly affected by active conflicts
    const conflictPenalty = tile.conflict ? tile.conflict.severity * 12 : 0;
    tile.crimeRisk = Math.max(2, Math.min(95, Math.round(62 - tile.safetyCoverage * 0.58 + conflictPenalty)));

    // Dynamic land valuation (Banco Imobiliário)
    const baseTerrainVal =
      tile.terrain === 'waterfront' ? 42000 : tile.terrain === 'fertile' ? 25000 : tile.terrain === 'hill' ? 21000 : 24000;
    const roadBonus = tile.road === 'avenida' ? 22000 : tile.road === 'rua' ? 9500 : adjRoad ? 7000 : 0;
    const utilBonus = (tile.hasPower ? 6000 : 0) + (tile.hasWater ? 6000 : 0);
    const serviceBonus =
      tile.safetyCoverage * 140 +
      tile.educationCoverage * 130 +
      tile.healthCoverage * 110 +
      tile.leisureCoverage * 180;
    const pollutionPenalty = tile.pollution * 420 + tile.crimeRisk * 220;
    const plannedBonus = tile.plannedDistrict ? 26000 : 0;
    const buildingAssetVal = tile.building
      ? Math.round(BUILDING_CATALOG[tile.building.type].cost * (0.65 + tile.building.level * 0.35))
      : 0;

    tile.landValue = Math.max(
      12000,
      Math.round(baseTerrainVal + roadBonus + utilBonus + serviceBonus - pollutionPenalty + plannedBonus + buildingAssetVal * 0.35),
    );

    if (tile.building || tile.road !== 'none') {
      sumSafety += tile.safetyCoverage;
      sumHealth += tile.healthCoverage;
      sumEdu += tile.educationCoverage;
      sumPollution += tile.pollution;
      sumHappy += tile.leisureCoverage;
      sumTraffic += tile.trafficLoad;
    }
  }

  const denom = Math.max(1, urbanTileCount + 12);
  return {
    totalPowerCapacity: Math.round(totalPowerCapacity),
    totalPowerDemand: Math.round(totalPowerDemand),
    totalWaterCapacity: Math.round(totalWaterCapacity),
    totalWaterDemand: Math.round(totalWaterDemand),
    housingCapacity,
    jobsTotal,
    avgSafety: Math.min(100, Math.round(sumSafety / denom + 18)),
    avgHealth: Math.min(100, Math.round(sumHealth / denom + 18)),
    avgEducation: Math.min(100, Math.round(sumEdu / denom + 15)),
    avgPollution: Math.min(100, Math.round(sumPollution / denom)),
    avgHappiness: Math.min(100, Math.round(sumHappy / denom + 22)),
    avgTraffic: Math.min(100, Math.round(sumTraffic / denom + 12)),
  };
}

export function stepCitizensMotion(
  citizens: CitizenAgent[],
  tiles: TileData[],
  hourOfDay: number,
  dt: number,
): void {
  const commercialTiles = tiles.filter(
    (t) => t.building && BUILDING_CATALOG[t.building.type].category === 'commercial',
  );
  const schoolTiles = tiles.filter(
    (t) =>
      t.building &&
      (t.building.type === 'escola' || t.building.type === 'centro_profissionalizante'),
  );
  const parkTiles = tiles.filter(
    (t) => t.building && BUILDING_CATALOG[t.building.type].category === 'leisure',
  );
  const cityHall = tiles.find((t) => t.building?.type === 'prefeitura');

  for (let i = 0; i < citizens.length; i++) {
    const c = citizens[i];
    const dx = c.targetX - c.x;
    const dz = c.targetZ - c.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 0.12) {
      const naturalSpeed = Math.min(0.24, Math.max(0.14, c.speed * 0.165));
      const step = Math.min(dist, naturalSpeed * dt);
      c.x += (dx / dist) * step;
      c.z += (dz / dist) * step;
      c.yaw = Math.atan2(dx, dz);
      c.currentSpeed = naturalSpeed;
    } else {
      // Pick next destination based on state machine & time of day
      let destX = c.x;
      let destZ = c.z;

      if (c.state === 'protesting' && cityHall) {
        destX = cityHall.x + (Math.random() - 0.5) * 1.4;
        destZ = cityHall.z + (Math.random() - 0.5) * 1.4;
      } else if (hourOfDay >= 8 && hourOfDay < 17) {
        if (c.employedAtId) {
          const workTile = tiles.find((t) => t.building?.id === c.employedAtId);
          if (workTile) {
            c.state = Math.random() < 0.35 ? 'commuting' : 'working';
            destX = workTile.x + (Math.random() - 0.5) * 0.7;
            destZ = workTile.z + (Math.random() - 0.5) * 0.7;
          }
        } else if (c.age < 26 && schoolTiles.length > 0) {
          const sc = schoolTiles[i % schoolTiles.length];
          c.state = 'studying';
          destX = sc.x + (Math.random() - 0.5) * 0.7;
          destZ = sc.z + (Math.random() - 0.5) * 0.7;
        } else if (commercialTiles.length > 0) {
          const shop = commercialTiles[i % commercialTiles.length];
          c.state = 'seeking_job';
          destX = shop.x + (Math.random() - 0.5) * 0.8;
          destZ = shop.z + (Math.random() - 0.5) * 0.8;
        }
      } else if (hourOfDay >= 17 && hourOfDay < 21) {
        if (Math.random() < 0.5 && commercialTiles.length > 0) {
          const shop = commercialTiles[Math.floor(Math.random() * commercialTiles.length)];
          c.state = 'shopping';
          destX = shop.x + (Math.random() - 0.5) * 0.8;
          destZ = shop.z + (Math.random() - 0.5) * 0.8;
        } else if (parkTiles.length > 0) {
          const park = parkTiles[Math.floor(Math.random() * parkTiles.length)];
          c.state = 'idle';
          destX = park.x + (Math.random() - 0.5) * 0.9;
          destZ = park.z + (Math.random() - 0.5) * 0.9;
        }
      } else {
        if (c.homeTileKey) {
          const [hx, hz] = c.homeTileKey.split(',').map(Number);
          if (!Number.isNaN(hx) && !Number.isNaN(hz)) {
            c.state = 'idle';
            destX = hx + (Math.random() - 0.5) * 0.6;
            destZ = hz + (Math.random() - 0.5) * 0.6;
          }
        } else {
          c.state = 'seeking_home';
          destX = 11 + (Math.random() - 0.5) * 6;
          destZ = 11 + (Math.random() - 0.5) * 6;
        }
      }

      c.targetX = Math.max(1, Math.min(GRID_SIZE - 2, destX));
      c.targetZ = Math.max(1, Math.min(GRID_SIZE - 2, destZ));
    }
  }
}

export function updateCitizenAttributesAndThoughts(
  citizens: CitizenAgent[],
  tiles: TileData[],
  indicators: CityIndicators,
  economy: EconomyState,
): void {
  const homes = tiles.filter((t) => t.building && BUILDING_CATALOG[t.building.type].housingCapacity > 0);
  const workplaces = tiles.filter(
    (t) =>
      t.building &&
      BUILDING_CATALOG[t.building.type].jobsProvided > 0 &&
      t.building.powered &&
      t.building.watered,
  );

  const laborForce = Math.max(1, Math.round(indicators.population * 0.62));
  const targetEmployedRatio =
    indicators.jobsTotal > 0 ? Math.min(1, indicators.employed / laborForce) : 0;
  const maxEmployedAgents =
    indicators.jobsTotal <= 0 || workplaces.length === 0
      ? 0
      : Math.min(citizens.length, indicators.jobsTotal, Math.round(citizens.length * targetEmployedRatio));

  // Clear invalid/non-operational homes and jobs first
  let employedAgentsCount = 0;
  for (let i = 0; i < citizens.length; i++) {
    const c = citizens[i];
    if (c.homeTileKey) {
      const [hx, hz] = c.homeTileKey.split(',').map(Number);
      const hTile = getTile(tiles, hx, hz);
      if (!hTile?.building || BUILDING_CATALOG[hTile.building.type].housingCapacity <= 0) {
        c.homeTileKey = null;
      }
    }
    if (c.employedAtId) {
      const wTile = tiles.find((t) => t.building?.id === c.employedAtId);
      const stillOperational = Boolean(
        wTile?.building &&
          BUILDING_CATALOG[wTile.building.type].jobsProvided > 0 &&
          wTile.building.powered &&
          wTile.building.watered,
      );
      if (!stillOperational || employedAgentsCount >= maxEmployedAgents) {
        c.employedAtId = null;
        c.employedAtName = null;
        c.income = 0;
      } else {
        employedAgentsCount++;
      }
    }
  }

  for (let i = 0; i < citizens.length; i++) {
    const c = citizens[i];

    // Assign home if missing and capacity exists
    if (!c.homeTileKey && homes.length > 0 && indicators.housingDeficit <= 20) {
      const h = homes[(i + Math.floor(Math.random() * homes.length)) % homes.length];
      c.homeTileKey = `${h.x},${h.z}`;
    }

    // Assign job only if real capacity allows
    if (!c.employedAtId && workplaces.length > 0 && employedAgentsCount < maxEmployedAgents) {
      const w = workplaces[i % workplaces.length];
      if (w.building) {
        c.employedAtId = w.building.id;
        c.employedAtName = BUILDING_CATALOG[w.building.type].name;
        c.income = c.education === 'Básico' ? 1950 : c.education === 'Médio' ? 3600 : 7500;
        employedAgentsCount++;
      }
    }

    const homeTile = c.homeTileKey
      ? (() => {
          const [hx, hz] = c.homeTileKey.split(',').map(Number);
          return getTile(tiles, hx, hz);
        })()
      : null;

    const localHealth = homeTile ? homeTile.healthCoverage : indicators.health;
    const localEdu = homeTile ? homeTile.educationCoverage : indicators.education;
    const localSafety = homeTile ? homeTile.safetyCoverage : indicators.safety;
    const localPollution = homeTile ? homeTile.pollution : indicators.pollution;

    c.needs.housing = c.homeTileKey ? Math.max(35, 92 - indicators.housingDeficit * 0.4) : 15;
    c.needs.job = c.employedAtId ? 88 : 18;
    c.needs.health = Math.round(localHealth);
    c.needs.education = Math.round(localEdu);
    c.needs.safety = Math.round(localSafety);

    c.health = Math.round(
      Math.max(20, Math.min(100, localHealth * 0.75 + 25 - localPollution * 0.35)),
    );

    const taxPenalty = Math.max(0, (economy.iptuRate - 2.0) * 8);
    const happyScore =
      (c.needs.housing * 0.25 +
        c.needs.job * 0.28 +
        c.needs.health * 0.16 +
        c.needs.education * 0.13 +
        c.needs.safety * 0.18) -
      taxPenalty -
      localPollution * 0.2;

    c.happiness = Math.round(Math.max(10, Math.min(100, happyScore)));
    c.opinion = Math.round(
      Math.max(5, Math.min(100, c.happiness * 0.65 + indicators.popularity * 0.35)),
    );

    if (c.happiness < 36 && Math.random() < 0.35) {
      c.state = 'protesting';
    } else if (c.state === 'protesting' && c.happiness >= 48) {
      c.state = 'idle';
    }

    // Rule-based local thought generation (zero external AI)
    if (!c.employedAtId) {
      c.thought = 'Preciso encontrar um emprego.';
    } else if (!c.homeTileKey || indicators.housingDeficit > 25) {
      c.thought = 'Os aluguéis estão muito caros e falta moradia.';
    } else if (economy.iptuRate > 2.6) {
      c.thought = 'Os impostos municipais estão pesando no orçamento.';
    } else if (localSafety < 42) {
      c.thought = 'Nosso bairro precisa de mais iluminação e segurança.';
    } else if (localEdu < 45) {
      c.thought = 'A escola do meu bairro precisa de investimentos.';
    } else if (localHealth < 45) {
      c.thought = 'Faltam vagas e atendimento rápido no posto de saúde.';
    } else if (localPollution > 35) {
      c.thought = 'A poluição industrial está incomodando a vizinhança.';
    } else if (indicators.mobility > 75 && c.happiness > 72) {
      c.thought = 'O transporte público e as ruas melhoraram bastante.';
    } else if (c.opinion >= 72) {
      c.thought = 'Estou satisfeito com a administração municipal.';
    } else {
      c.thought = 'Espero novos investimentos públicos neste ano.';
    }
  }
}

export interface MonthlySimulationResult {
  tiles: TileData[];
  economy: EconomyState;
  indicators: CityIndicators;
  politics: PoliticsState;
  citizens: CitizenAgent[];
  newsToAdd: NewsArticle[];
  triggeredEvent: GameEvent | null;
  achievements: Achievement[];
  developmentLevel: number;
  decisionLogs: DecisionLogEntry[];
  endGameReport: EndGameReport | null;
  developmentChangedTo: string | null;
}

export function processMonthlyCycle(params: {
  tiles: TileData[];
  economy: EconomyState;
  indicators: CityIndicators;
  politics: PoliticsState;
  citizens: CitizenAgent[];
  achievements: Achievement[];
  developmentLevel: number;
  decisionLogs: DecisionLogEntry[];
  day: number;
  month: number;
  year: number;
  cityName: string;
  hadDebtBefore: boolean;
}): MonthlySimulationResult {
  const tiles = params.tiles.map((t) => ({
    ...t,
    building: t.building ? { ...t.building } : null,
    conflict: t.conflict ? { ...t.conflict, daysActive: t.conflict.daysActive + 30 } : null,
  }));
  const economy: EconomyState = {
    ...params.economy,
    revenueBreakdown: { ...params.economy.revenueBreakdown },
    expenseBreakdown: { ...params.economy.expenseBreakdown },
  };
  const politics: PoliticsState = {
    ...params.politics,
    councilors: params.politics.councilors.map((c) => ({ ...c })),
    bills: params.politics.bills.map((b) => ({ ...b })),
    impeachment: { ...params.politics.impeachment },
    activePolicies: [...params.politics.activePolicies],
  };
  let citizens = params.citizens.map((c) => ({ ...c, needs: { ...c.needs } }));
  const achievements = params.achievements.map((a) => ({ ...a }));
  const decisionLogs = [...params.decisionLogs];
  const newsToAdd: NewsArticle[] = [];
  let triggeredEvent: GameEvent | null = null;
  let endGameReport: EndGameReport | null = null;

  recomputeCityGridMetrics(tiles, economy, politics);

  // 1. Private building evolution & organic concession construction
  let upgradedCount = 0;
  for (const tile of tiles) {
    if (
      tile.building &&
      tile.building.ownerType === 'private' &&
      tile.building.powered &&
      tile.building.watered &&
      tile.building.connectedRoad &&
      tile.building.level < 3
    ) {
      const def = BUILDING_CATALOG[tile.building.type];
      const threshold = tile.building.level === 1 ? 52000 : 88000;
      const taxFactor = economy.iptuRate <= 2.0 ? 0.16 : 0.05;
      if (tile.landValue >= threshold && Math.random() < taxFactor && def.category !== 'infra') {
        tile.building.level = (tile.building.level + 1) as 1 | 2 | 3;
        upgradedCount++;
      }
    } else if (
      !tile.building &&
      tile.road === 'none' &&
      tile.concessionActive &&
      tile.terrain !== 'waterfront' &&
      !tile.conflict &&
      Math.random() < 0.25
    ) {
      // Private developer builds on granted concession lot
      const candidateTypes: BuildingTypeId[] =
        params.indicators.housingDeficit > 10
          ? ['casa_media', 'condominio']
          : ['loja', 'mercado', 'restaurante'];
      const chosen = candidateTypes[Math.floor(Math.random() * candidateTypes.length)];
      tile.ownerType = 'private';
      tile.concessionActive = false;
      tile.ownerName = 'Incorporadora Horizonte';
      const facingRot = computeFacingRoadRotation(tiles, tile.x, tile.z, 0);
      tile.building = {
        id: `b_priv_${tile.x}_${tile.z}_${Date.now().toString(36)}`,
        type: chosen,
        level: 1,
        rotation: facingRot,
        ownerType: 'private',
        ownerName: 'Incorporadora Horizonte',
        powered: tile.hasPower,
        watered: tile.hasWater,
        connectedRoad: true,
        builtAtDay: params.day,
        condition: 100,
        constructionStage: 'construction_site',
        constructionProgress: 18,
        occupantIds: [],
        variantSeed: tile.x * 41 + tile.z * 83 + params.day,
      };
      const access = computeBuildingAccess(tiles, tile);
      tile.building.entranceTile = access.adjacentRoadTile ?? { x: tile.x, z: tile.z };
      tile.zone = inferBuildingZone(tile);
      tile.building.zone = tile.zone;
    }
  }

  // Recompute urban grid metrics after private upgrades and constructions, before monthly finance & indicators
  const grid = recomputeCityGridMetrics(tiles, economy, politics);

  // 2. Population growth / migration
  const currentPop = params.indicators.population;
  const housingGap = grid.housingCapacity - currentPop;
  const jobPull = grid.jobsTotal - currentPop * 0.72;
  const taxDrag = (economy.iptuRate - 1.5) * 6 + (economy.issRate - 2.5) * 4;
  const qolPull = (params.indicators.qualityOfLife - 50) * 0.55;
  let popDelta = Math.round(
    Math.max(-35, Math.min(85, housingGap * 0.18 + jobPull * 0.12 + qolPull - taxDrag)),
  );
  if (currentPop + popDelta < 30) popDelta = 30 - currentPop;
  const newPop = Math.max(30, currentPop + popDelta);

  // Scale visible 3D citizen agents smoothly (between 24 and 110)
  const targetAgentCount = Math.min(110, Math.max(24, Math.round(18 + Math.sqrt(newPop) * 1.45)));
  const homes = tiles.filter((t) => t.building && BUILDING_CATALOG[t.building.type].housingCapacity > 0);
  const workplaces = tiles.filter(
    (t) =>
      t.building &&
      BUILDING_CATALOG[t.building.type].jobsProvided > 0 &&
      t.building.powered &&
      t.building.watered,
  );

  if (citizens.length < targetAgentCount && homes.length > 0) {
    const toAdd = Math.min(8, targetAgentCount - citizens.length);
    for (let k = 0; k < toAdd; k++) {
      const h = homes[Math.floor(Math.random() * homes.length)];
      const canHaveJob = grid.jobsTotal > 0 && workplaces.length > 0 && k < grid.jobsTotal;
      const w = canHaveJob ? workplaces[Math.floor(Math.random() * workplaces.length)] : null;
      const access = computeBuildingAccess(tiles, h);
      citizens.push(
        createCitizenAgent(
          citizens.length + k + params.year * 100 + params.month * 10,
          `${h.x},${h.z}`,
          w?.building?.id || null,
          w ? BUILDING_CATALOG[w.building!.type].name : null,
          access.sidewalkPoint.x,
          access.sidewalkPoint.z,
          h.building?.id || null,
        ),
      );
    }
  } else if (citizens.length > targetAgentCount) {
    citizens = citizens.slice(0, targetAgentCount);
  }

  // 3. Economy calculations
  let iptu = 0;
  let iss = 0;
  let servicesAndConcessions = 0;
  let buildingMaintenance = 0;
  let industrialCount = 0;
  let commercialRevenueBase = 0;

  for (const tile of tiles) {
    if (tile.concessionActive) servicesAndConcessions += 4500;
    if (tile.road === 'rua') buildingMaintenance += BUILDING_CATALOG.rua.monthlyMaintenance;
    if (tile.road === 'avenida') buildingMaintenance += BUILDING_CATALOG.avenida.monthlyMaintenance;
    if (tile.building) {
      const def = BUILDING_CATALOG[tile.building.type];
      const lvlMult = tile.building.level === 1 ? 1 : tile.building.level === 2 ? 1.55 : 2.2;
      const opFactor = tile.building.powered && tile.building.watered ? 1 : 0.45;
      if (tile.building.ownerType === 'private') {
        iptu += (tile.landValue * (economy.iptuRate / 100)) * 0.042 * lvlMult;
        if (def.category === 'commercial' || def.category === 'industrial') {
          const baseRev = def.monthlyRevenue * lvlMult * opFactor;
          commercialRevenueBase += baseRev;
          iss += baseRev * (economy.issRate / 2.5);
        }
      } else {
        buildingMaintenance += def.monthlyMaintenance;
        servicesAndConcessions += def.monthlyRevenue * opFactor;
      }
      if (def.category === 'industrial') industrialCount++;
    }
  }

  // Tax compliance/recession dampening if taxes are punitive
  const overTaxFactor = economy.iptuRate > 2.8 || economy.issRate > 4.5 ? 0.85 : 1.0;
  iptu = Math.round(iptu * overTaxFactor);
  iss = Math.round(iss * overTaxFactor);
  const transfers = Math.round(28000 + newPop * 145 + params.developmentLevel * 12000);
  // Recurring secondary real estate market ITBI (never compounds prior months or double-counts settled ITBI)
  const recurringMarketItbi = Math.round(newPop * 18 * (economy.itbiRate / 2));
  const settledItbiThisMonth = Math.max(0, Math.round(economy.settledItbiThisMonth || 0));

  const recurringRevenue = Math.round(
    iptu + iss + recurringMarketItbi + transfers + servicesAndConcessions,
  );
  const totalReportedRevenue = recurringRevenue + settledItbiThisMonth;

  const payroll = Math.round(14000 + buildingMaintenance * 0.65);
  const healthExp = Math.round((6500 + newPop * 28) * economy.budgetHealth);
  const eduExp = Math.round((6500 + newPop * 30) * economy.budgetEducation);
  const safetyExp = Math.round((5500 + newPop * 22) * economy.budgetSafety);
  const transitExp = Math.round((buildingMaintenance * 0.45 + newPop * 12) * economy.budgetTransit);
  const socialExp = Math.round((3500 + newPop * 18) * economy.budgetSocial);
  const policyExp = politics.activePolicies.length * 3800;
  const debtInterest = economy.debt > 0 ? Math.round(economy.debt * 0.025) : 0;

  const totalExpense = Math.round(
    payroll + healthExp + eduExp + safetyExp + transitExp + socialExp + policyExp + debtInterest,
  );
  // Only unsettled recurring revenues enter treasury at month close
  const monthlyRecurringNet = recurringRevenue - totalExpense;

  economy.treasury += monthlyRecurringNet;
  if (economy.treasury < 0) {
    economy.debt += Math.abs(economy.treasury);
    economy.treasury = 0;
  } else if (economy.debt > 0 && economy.treasury > 50000) {
    const paydown = Math.min(economy.debt, Math.round(economy.treasury * 0.15));
    economy.debt -= paydown;
    economy.treasury -= paydown;
  }

  economy.settledItbiThisMonth = 0;
  economy.lastMonthlyRevenue = totalReportedRevenue;
  economy.lastMonthlyExpense = totalExpense;
  economy.lastMonthlyNet = monthlyRecurringNet;
  economy.revenueBreakdown = {
    iptu,
    iss,
    itbi: recurringMarketItbi + settledItbiThisMonth,
    transfers,
    servicesAndConcessions: Math.round(servicesAndConcessions),
  };
  economy.expenseBreakdown = {
    payroll,
    health: healthExp,
    education: eduExp,
    safety: safetyExp,
    transitAndInfra: transitExp + policyExp,
    socialPrograms: socialExp,
    debtInterest,
  };

  // 4. City Indicators
  const laborForce = Math.round(newPop * 0.62);
  const effectiveJobs = Math.max(0, grid.jobsTotal);
  const employed =
    effectiveJobs === 0
      ? 0
      : Math.min(laborForce, effectiveJobs, Math.max(0, Math.round(effectiveJobs * 0.96)));
  const unemploymentRate =
    laborForce <= 0
      ? 0
      : Number(
          Math.max(0, Math.min(100, ((laborForce - employed) / laborForce) * 100)).toFixed(1),
        );
  const housingDeficit = Math.max(0, newPop - grid.housingCapacity);
  const housingIndex = Math.max(10, Math.min(100, Math.round(100 - (housingDeficit / Math.max(1, newPop)) * 120)));
  const mobility = Math.max(15, Math.min(100, Math.round(100 - grid.avgTraffic * 0.65 + (economy.budgetTransit - 1) * 18)));
  const safety = Math.max(
    10,
    Math.min(100, Math.round(grid.avgSafety - unemploymentRate * 0.35 + economy.budgetSocial * 6)),
  );
  const health = Math.max(10, Math.min(100, Math.round(grid.avgHealth - grid.avgPollution * 0.35)));
  const education = Math.max(10, Math.min(100, Math.round(grid.avgEducation)));
  const qualityOfLife = Math.round(
    safety * 0.2 + health * 0.22 + education * 0.18 + housingIndex * 0.2 + mobility * 0.1 + grid.avgHappiness * 0.1,
  );
  const economicDevelopment = Math.min(
    100,
    Math.round(20 + Math.sqrt(commercialRevenueBase / 1200) * 6 + (100 - unemploymentRate) * 0.25),
  );
  const inequality = Math.max(
    12,
    Math.min(85, Math.round(32 + unemploymentRate * 0.7 - economy.budgetSocial * 10 - housingIndex * 0.12)),
  );

  const taxPopImpact = (1.6 - economy.iptuRate) * 2.5 + (2.6 - economy.issRate) * 1.5;
  const debtPenalty = economy.debt > 500000 ? 3.5 : economy.debt > 0 ? 1.2 : 0;
  const targetPopularity = Math.max(
    5,
    Math.min(99, qualityOfLife * 0.72 + (100 - unemploymentRate) * 0.22 + taxPopImpact - debtPenalty),
  );
  const popularity = Math.round(params.indicators.popularity * 0.65 + targetPopularity * 0.35);

  const indicators: CityIndicators = {
    population: newPop,
    jobsTotal: grid.jobsTotal,
    employed,
    unemploymentRate,
    housingCapacity: grid.housingCapacity,
    housingDeficit,
    popularity,
    safety,
    health,
    education,
    housingIndex,
    mobility,
    qualityOfLife,
    pollution: grid.avgPollution,
    economicDevelopment,
    inequality,
  };

  // Update citizens based on new indicators
  updateCitizenAttributesAndThoughts(citizens, tiles, indicators, economy);

  // 5. Politics, Câmara Municipal & Impeachment
  const avgCouncilorSupport = Math.round(
    politics.councilors.reduce((acc, c) => {
      const delta =
        c.alignment === 'base'
          ? (popularity - 50) * 0.12
          : c.alignment === 'centro'
          ? (popularity - 55) * 0.14
          : (popularity - 65) * 0.08;
      c.support = Math.max(10, Math.min(98, Math.round(c.support * 0.85 + (c.support + delta) * 0.15)));
      return acc + c.support;
    }, 0) / politics.councilors.length,
  );
  politics.councilSupport = avgCouncilorSupport;

  // Impeachment trigger / progression
  if (!politics.impeachment.active) {
    if (popularity < 24 && politics.councilSupport < 36 && economy.debt > 250000) {
      politics.impeachment = {
        active: true,
        stage: 1,
        reason: 'Crise orçamentária grave, déficit contínuo e perda de maioria na Câmara Municipal.',
        daysInStage: 0,
        supportNeededToSurvive: 42,
      };
      newsToAdd.push({
        id: `news_imp_${params.year}_${params.month}`,
        day: params.day,
        month: params.month,
        year: params.year,
        category: 'Política',
        headline: 'Câmara Municipal protocola pedido de abertura de processo de impeachment',
        summary:
          'Vereadores citam desequilíbrio fiscal e queda nos serviços públicos como fundamentos da denúncia.',
      });
    }
  } else {
    politics.impeachment.daysInStage += 30;
    if (politics.councilSupport >= 54 && popularity >= 42) {
      politics.impeachment = {
        active: false,
        stage: 0,
        reason: '',
        daysInStage: 0,
        supportNeededToSurvive: 42,
      };
      newsToAdd.push({
        id: `news_imp_arch_${params.year}_${params.month}`,
        day: params.day,
        month: params.month,
        year: params.year,
        category: 'Política',
        headline: 'Comissão arquiva processo após recuperação fiscal e diálogo político',
        summary: 'A base na Câmara recompôs maioria e encerrou a crise institucional.',
      });
    } else if (politics.impeachment.stage < 4) {
      politics.impeachment.stage = (politics.impeachment.stage + 1) as 1 | 2 | 3 | 4;
    } else {
      // Stage 4 final vote!
      if (politics.councilSupport < politics.impeachment.supportNeededToSurvive) {
        endGameReport = buildEndGameReport('impeached', indicators, economy, politics, params.year, decisionLogs);
      } else {
        politics.impeachment = {
          active: false,
          stage: 0,
          reason: '',
          daysInStage: 0,
          supportNeededToSurvive: 42,
        };
        newsToAdd.push({
          id: `news_imp_surv_${params.year}_${params.month}`,
          day: params.day,
          month: params.month,
          year: params.year,
          category: 'Política',
          headline: 'Prefeitura sobrevive à votação na Câmara Municipal por maioria simples',
          summary: 'Apesar da tensão política, o mandato foi preservado em plenário.',
        });
      }
    }
  }

  // 6. 4-Year Municipal Election Check (Month 12 of election year)
  if (!endGameReport && params.month === 12 && params.year >= politics.nextElectionYear) {
    const winProb = popularity * 0.75 + qualityOfLife * 0.25;
    if (winProb >= 48) {
      politics.termsServed += 1;
      politics.nextElectionYear += 4;
      decisionLogs.push({
        day: params.day,
        year: params.year,
        text: `Reeleito(a) para novo mandato de 4 anos com ${popularity}% de popularidade.`,
      });
      newsToAdd.push({
        id: `news_elec_win_${params.year}`,
        day: 30,
        month: 12,
        year: params.year,
        category: 'Política',
        headline: `${politics.mayorName} vence eleições municipais e garante novo mandato`,
        summary: `Com ${popularity}% de aprovação e ${newPop.toLocaleString('pt-BR')} habitantes, a chapa governista foi reeleita nas urnas.`,
      });
      const reelecAch = achievements.find((a) => a.id === 'ach_reelection');
      if (reelecAch && !reelecAch.unlocked) {
        reelecAch.unlocked = true;
        reelecAch.unlockedAtYear = params.year;
      }
    } else {
      endGameReport = buildEndGameReport('election_loss', indicators, economy, politics, params.year, decisionLogs);
    }
  }

  // Extreme Administrative Collapse check
  if (!endGameReport && economy.debt > 12000000 && popularity <= 8) {
    endGameReport = buildEndGameReport('collapsed', indicators, economy, politics, params.year, decisionLogs);
  }

  // 7. Land Conflicts & Random Dilemmas
  if (!endGameReport && Math.random() < 0.34) {
    triggeredEvent = generateDynamicEvent(tiles, indicators, economy, params.cityName);
  }

  // 8. Dynamic Cidade News Generation
  if (upgradedCount > 0) {
    newsToAdd.push({
      id: `news_upg_${params.year}_${params.month}`,
      day: params.day,
      month: params.month,
      year: params.year,
      category: 'Cidade',
      headline: `Valorização imobiliária impulsiona modernização de ${upgradedCount} edifício(s)`,
      summary: 'Com infraestrutura ativa e demanda crescente, proprietários ampliaram imóveis na região central.',
    });
  }
  if (newsToAdd.length === 0) {
    newsToAdd.push(generateRoutineNews(indicators, economy, params.day, params.month, params.year));
  }

  // 9. Development Level Progression & Achievements
  let newDevLevel = params.developmentLevel;
  let developmentChangedTo: string | null = null;
  for (const dl of DEVELOPMENT_LEVELS) {
    if (newPop >= dl.minPop && dl.level > newDevLevel) {
      newDevLevel = dl.level;
      developmentChangedTo = dl.name;
    }
  }

  const unlockAch = (id: string) => {
    const a = achievements.find((x) => x.id === id);
    if (a && !a.unlocked) {
      a.unlocked = true;
      a.unlockedAtYear = params.year;
    }
  };
  if (economy.treasury >= 6000000 && economy.debt === 0) unlockAch('ach_million');
  if (economy.lastMonthlyNet > 0 && popularity >= 70) unlockAch('ach_fiscal');
  if (industrialCount >= 4) unlockAch('ach_industry');
  if (education >= 82) unlockAch('ach_education');
  if (qualityOfLife >= 80 && indicators.pollution < 15) unlockAch('ach_sustainable');
  if (qualityOfLife >= 85 && newPop >= 1000) unlockAch('ach_qol');
  if (params.hadDebtBefore && economy.debt === 0 && economy.treasury > 100000) unlockAch('ach_recovery');

  return {
    tiles,
    economy,
    indicators,
    politics,
    citizens,
    newsToAdd,
    triggeredEvent,
    achievements,
    developmentLevel: newDevLevel,
    decisionLogs,
    endGameReport,
    developmentChangedTo,
  };
}

function generateRoutineNews(
  indicators: CityIndicators,
  economy: EconomyState,
  day: number,
  month: number,
  year: number,
): NewsArticle {
  const id = `news_${year}_${month}_${Math.floor(Math.random() * 999)}`;
  if (indicators.unemploymentRate > 16) {
    return {
      id,
      day,
      month,
      year,
      category: 'Economia',
      headline: `Taxa de desemprego atinge ${indicators.unemploymentRate}% e pressiona setor produtivo`,
      summary: 'Comerciantes e sindicatos cobram incentivos para atração de novas indústrias e empregos.',
    };
  }
  if (indicators.housingDeficit > 25) {
    return {
      id,
      day,
      month,
      year,
      category: 'Habitação',
      headline: `Crescimento populacional amplia demanda por ${indicators.housingDeficit} moradias`,
      summary: 'Moradores pedem novos loteamentos residenciais e controle na alta dos aluguéis.',
    };
  }
  if (economy.lastMonthlyNet < 0) {
    return {
      id,
      day,
      month,
      year,
      category: 'Economia',
      headline: 'Prefeitura registra déficit mensal e debate ajuste orçamentário',
      summary: 'Secretaria da Fazenda avalia equilíbrio entre custeio de serviços e arrecadação de IPTU/ISS.',
    };
  }
  if (indicators.safety < 48) {
    return {
      id,
      day,
      month,
      year,
      category: 'Segurança',
      headline: 'Moradores cobram reforço na iluminação pública e presença da Guarda Municipal',
      summary: 'Associações de bairro apontam necessidade de políticas preventivas e recuperação de praças.',
    };
  }
  return {
    id,
    day,
    month,
    year,
    category: 'Cidade',
    headline: `Município alcança ${indicators.population.toLocaleString('pt-BR')} habitantes com saldo positivo`,
    summary: `Qualidade de vida marca ${indicators.qualityOfLife}/100 e mercado imobiliário segue aquecido.`,
  };
}

function generateDynamicEvent(
  tiles: TileData[],
  indicators: CityIndicators,
  economy: EconomyState,
  cityName: string,
): GameEvent {
  const availableLots = tiles.filter(
    (t) => !t.building && t.road === 'none' && t.terrain !== 'waterfront' && !t.conflict,
  );
  const roll = Math.random();

  // Land Conflict Event
  if (roll < 0.25 && availableLots.length > 0 && (indicators.housingDeficit > 5 || Math.random() < 0.45)) {
    const target = availableLots[Math.floor(Math.random() * availableLots.length)];
    target.conflict = {
      id: `conf_${Date.now().toString(36)}`,
      title: 'Ocupação por Moradia Digna',
      groupName: 'Movimento Horizonte Livre',
      severity: 2,
      daysActive: 0,
      type: 'occupation',
    };
    return {
      id: `evt_land_${Date.now().toString(36)}`,
      title: 'Conflito Fundiário: Ocupação de Lote Urbano',
      description: `Famílias ligadas ao grupo fictício "Movimento Horizonte Livre" ocuparam o terreno (${target.x}, ${target.z}) reivindicando moradia popular e regularização.`,
      type: 'land_conflict',
      tileX: target.x,
      tileZ: target.z,
      choices: [
        {
          id: 'mediate',
          label: 'Criar mesa de mediação e regularização',
          cost: 65000,
          description: 'Respeita o devido processo, reduz tensão social e eleva apoio comunitário.',
          effects: { popularity: 5, treasury: -65000, safety: 4, resolveConflictTile: true },
        },
        {
          id: 'housing_program',
          label: 'Lançar mutirão habitacional no setor',
          cost: 110000,
          description: 'Investe diretamente em infraestrutura e reduz conflitos futuros.',
          effects: { popularity: 8, treasury: -110000, councilSupport: 4, resolveConflictTile: true },
        },
        {
          id: 'judicial',
          label: 'Encaminhar disputa às instituições jurídicas',
          cost: 15000,
          description: 'Baixo custo imediato, mas prolonga tensão e reduz popularidade local.',
          effects: { popularity: -5, treasury: -15000, councilSupport: 3 },
        },
      ],
    };
  }

  // Positive Investment Event
  if (roll < 0.5) {
    return {
      id: `evt_pos_${Date.now().toString(36)}`,
      title: `Novo Polo Tecnológico quer investir em ${cityName}`,
      description:
        'Um consórcio privado propõe instalar escritórios e gerar empregos, pedindo contrapartida em infraestrutura ou isenção temporária.',
      type: 'positive',
      choices: [
        {
          id: 'partner',
          label: 'Investir em contrapartida viária e digital',
          cost: 90000,
          description: 'Aumenta desenvolvimento econômico, empregos e receita futura.',
          effects: { treasury: -90000, economy: 10, popularity: 5, councilSupport: 4 },
        },
        {
          id: 'standard_tax',
          label: 'Aprovar sem subsídios extras (tributação padrão)',
          cost: 0,
          description: 'Preserva o caixa público com ganho moderado de arrecadação.',
          effects: { treasury: 45000, economy: 4, popularity: 2 },
        },
      ],
    };
  }

  // Flood / Climate Event
  if (roll < 0.72) {
    return {
      id: `evt_flood_${Date.now().toString(36)}`,
      title: 'Chuvas Intensas e Alagamentos nos Bairros Baixos',
      description:
        'Temporais provocaram transtornos perto da orla e exigem resposta rápida da Defesa Civil e obras de drenagem.',
      type: 'negative',
      choices: [
        {
          id: 'drainage',
          label: 'Obra emergencial de drenagem e assistência',
          cost: 115000,
          description: 'Protege moradores e fortalece a infraestrutura contra futuras enchentes.',
          effects: { treasury: -115000, popularity: 4, health: 4 },
        },
        {
          id: 'emergency_only',
          label: 'Atuar apenas com limpeza básica',
          cost: 35000,
          description: 'Economiza recursos agora, mas gera insatisfação e queda na saúde urbana.',
          effects: { treasury: -35000, popularity: -6, health: -5 },
        },
      ],
    };
  }

  // Security / Illicit Market Event (abstract & policy-focused)
  if (roll < 0.88) {
    return {
      id: `evt_sec_${Date.now().toString(36)}`,
      title: 'Alerta de Insegurança e Vandalismo em Área Pouco Iluminada',
      description:
        'Relatórios comunitários apontam aumento de furtos e atuação de grupos ilícitos em áreas com baixa cobertura de serviços.',
      type: 'negative',
      choices: [
        {
          id: 'prevention_combo',
          label: 'Programa integrado: iluminação, guarda e assistência social',
          cost: 95000,
          description: 'Ataca causas sociais e amplia prevenção comunitária com cooperação estadual.',
          effects: { treasury: -95000, safety: 10, popularity: 5, health: 3 },
        },
        {
          id: 'patrol_only',
          label: 'Reforçar rondas ostensivas temporárias',
          cost: 40000,
          description: 'Alívio curto no indicador de segurança sem resolver a raiz social.',
          effects: { treasury: -40000, safety: 4, popularity: 1 },
        },
      ],
    };
  }

  // Political Press Investigation
  return {
    id: `evt_pol_${Date.now().toString(36)}`,
    title: 'Oposição questiona contratos de manutenção na Câmara',
    description:
      'A imprensa local cobra transparência sobre gastos públicos e aditivos contratuais da administração.',
    type: 'political',
    choices: [
      {
        id: 'audit',
        label: 'Abrir auditoria pública e Portal de Transparência',
        cost: 40000,
        description: 'Mostra integridade institucional e fortalece apoio popular.',
        effects: { treasury: -40000, popularity: 5, councilSupport: 6 },
      },
      {
        id: 'negotiate',
        label: 'Articular diálogo direto com líderes da Câmara',
        cost: economy.treasury > 60000 ? 25000 : 0,
        description: 'Estabiliza a base parlamentar, mas divide a opinião pública.',
        effects: { treasury: -25000, councilSupport: 8, popularity: -3 },
      },
    ],
  };
}

export function buildEndGameReport(
  outcome: EndGameReport['outcome'],
  indicators: CityIndicators,
  economy: EconomyState,
  politics: PoliticsState,
  year: number,
  logs: DecisionLogEntry[],
): EndGameReport {
  const titles: Record<EndGameReport['outcome'], string> = {
    election_loss: 'Derrota nas Eleições Municipais',
    impeached: 'Mandato Cassado pela Câmara Municipal',
    resigned: 'Renúncia ao Cargo de Prefeito(a)',
    collapsed: 'Colapso Administrativo e Fiscal',
  };

  const reasons: Record<EndGameReport['outcome'], string> = {
    election_loss: `Com ${indicators.popularity}% de aprovação no fechamento do ciclo eleitoral, a oposição venceu a eleição municipal.`,
    impeached: `A Câmara Municipal aprovou o processo de impeachment após desgaste político e crise fiscal (${politics.councilSupport}% de apoio).`,
    resigned: 'Você optou por encerrar voluntariamente a administração e transmitir o cargo.',
    collapsed: 'O acúmulo severo de dívida municipal inviabilizou os serviços públicos essenciais.',
  };

  const legacySummary =
    indicators.qualityOfLife >= 72
      ? 'Apesar do desfecho político, a cidade herdou boa infraestrutura e qualidade de vida.'
      : economy.debt > 500000
      ? 'A administração enfrentou forte desequilíbrio fiscal e deixa desafios orçamentários.'
      : 'Gestão marcada por disputas urbanas, ajustes fiscais e aprendizado institucional.';

  return {
    outcome,
    title: titles[outcome],
    reason: reasons[outcome],
    yearsServed: year,
    finalPopulation: indicators.population,
    finalTreasury: economy.treasury,
    finalDebt: economy.debt,
    finalPopularity: indicators.popularity,
    qualityOfLife: indicators.qualityOfLife,
    economicDevelopment: indicators.economicDevelopment,
    legacySummary,
    highlights: logs.slice(-6).map((l) => `Ano ${l.year}: ${l.text}`),
  };
}
