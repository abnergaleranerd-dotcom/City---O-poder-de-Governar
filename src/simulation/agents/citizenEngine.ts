import {
  CitizenAgent,
  CityIndicators,
  EconomyState,
  GameTimeConfig,
  Household,
  TileData,
  Workplace,
} from '../../types/game';
import { getBatchSlice } from '../core/simulationScheduler';
import { tileAt } from '../navigation/obstacleSystem';
import { UrbanNavigationCache } from '../navigation/routeCache';
import { normalizeCitizenNeeds, stepCitizenNeeds } from './citizenNeeds';
import { assignPersonality, assignScheduleProfile } from './citizenSchedule';
import { stepCitizenBehaviorAndMotion } from './citizenStateMachine';
import { reconcileWorkplaces } from './employmentEngine';
import { reconcileHouseholds } from './householdEngine';

/**
 * Ensures any legacy-loaded or freshly generated CitizenAgent has all Living World fields populated.
 */
export function normalizeCitizensForLivingWorld(
  citizens: CitizenAgent[],
  currentYear: number,
  currentDay: number,
): void {
  for (let i = 0; i < citizens.length; i++) {
    const c = citizens[i];
    normalizeCitizenNeeds(c);
    if (!c.personality) c.personality = assignPersonality(i);
    if (!c.scheduleProfile) c.scheduleProfile = assignScheduleProfile(c, i);
    if (c.staggerMinutes === undefined) c.staggerMinutes = ((i * 13) % 50) - 25;
    if (c.birthYear === undefined) c.birthYear = Math.max(1, currentYear - c.age);
    if (c.birthDay === undefined) c.birthDay = ((i * 7 + currentDay) % 30) + 1;
    if (c.yaw === undefined) c.yaw = 0;
    if (c.currentSpeed === undefined) c.currentSpeed = 0;
    if (!c.behaviorState) c.behaviorState = c.insideBuildingId ? 'AtHome' : 'WalkingToDestination';
    if (!c.movementState) c.movementState = 'stopped';
    if (!c.animState) c.animState = 'Idle';
    if (!c.transportMode) c.transportMode = 'walk';
    if (!c.history) c.history = ['Cidadão(ã) registrado(a) no município.'];
    if (c.blockedTicks === undefined) c.blockedTicks = 0;
    if (c.unreachableCount === undefined) c.unreachableCount = 0;
    if (c.decisionCooldown === undefined) c.decisionCooldown = (i % 6) * 0.08;
    if (c.appearanceSeed === undefined) c.appearanceSeed = i * 97 + c.age * 13;
    if (c.lastValidX === undefined) c.lastValidX = c.x;
    if (c.lastValidZ === undefined) c.lastValidZ = c.z;
    if (c.prevX === undefined) c.prevX = c.x;
    if (c.prevZ === undefined) c.prevZ = c.z;
    if (c.prevYaw === undefined) c.prevYaw = c.yaw;
    if (c.benchPhase === undefined) c.benchPhase = null;
  }
}

function syncBuildingOccupants(tiles: TileData[], citizens: CitizenAgent[]): void {
  const byBuilding = new Map<string, string[]>();
  for (const c of citizens) {
    if (!c.insideBuildingId) continue;
    const list = byBuilding.get(c.insideBuildingId) ?? [];
    list.push(c.id);
    byBuilding.set(c.insideBuildingId, list);
  }
  for (const tile of tiles) {
    if (!tile.building) continue;
    tile.building.occupantIds = byBuilding.get(tile.building.id) ?? [];
  }
}

function pairSocializingNeighbors(citizens: CitizenAgent[]): void {
  const candidates = citizens.filter(
    (c) =>
      !c.insideBuildingId &&
      c.behaviorState === 'Socializing' &&
      !c.talkingWithId &&
      !c.occupiedSpotId &&
      !c.benchPhase &&
      c.movementState === 'stopped',
  );
  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    if (a.talkingWithId) continue;
    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j];
      if (b.talkingWithId) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) < 1.15) {
        a.talkingWithId = b.id;
        b.talkingWithId = a.id;
        a.animState = 'Talk';
        b.animState = 'Talk';
        a.activityUntilHour = Math.max(a.activityUntilHour ?? 1.0, 1.0);
        b.activityUntilHour = Math.max(b.activityUntilHour ?? 1.0, 1.0);
        a.thought = `Conversando com ${b.name.split(' ')[0]} na praça.`;
        b.thought = `Trocando ideias com ${a.name.split(' ')[0]}.`;
        break;
      }
    }
  }
}

export interface CitizenStepContext {
  tiles: TileData[];
  citizens: CitizenAgent[];
  households: Household[];
  workplaces: Workplace[];
  navCache: UrbanNavigationCache;
  hourOfDay: number;
  day: number;
  year: number;
  physicalDt: number;
  calendarHoursDelta: number;
  timeConfig: GameTimeConfig;
  indicators: CityIndicators;
  economy: EconomyState;
  batchCursor: number;
  runNeedsAndStructure: boolean;
  vehicles?: import('../../types/game').RoadVehicleSim[];
}

export function stepCitizenEcosystem(ctx: CitizenStepContext): {
  households: Household[];
  workplaces: Workplace[];
  nextBatchCursor: number;
} {
  normalizeCitizensForLivingWorld(ctx.citizens, ctx.year, ctx.day);

  let households = ctx.households;
  let workplaces = ctx.workplaces;
  if (ctx.runNeedsAndStructure || households.length === 0 || workplaces.length === 0) {
    households = reconcileHouseholds(ctx.tiles, ctx.citizens, households);
    workplaces = reconcileWorkplaces(ctx.tiles, ctx.citizens);
  }

  const hasActiveConflict = ctx.tiles.some((t) => Boolean(t.conflict));
  const { slice: decisionBatch, nextCursor } = getBatchSlice(
    ctx.citizens,
    ctx.batchCursor,
    Math.max(8, Math.ceil(ctx.citizens.length / 4)),
  );
  const batchIds = new Set(decisionBatch.map((c) => c.id));

  for (const c of ctx.citizens) {
    const tileUnder = tileAt(ctx.tiles, Math.round(c.x), Math.round(c.z));
    if (ctx.runNeedsAndStructure) {
      stepCitizenNeeds(c, ctx.calendarHoursDelta * 4, tileUnder, ctx.indicators);
    }
    stepCitizenBehaviorAndMotion(
      c,
      ctx.citizens,
      ctx.tiles,
      ctx.navCache,
      ctx.hourOfDay,
      ctx.day,
      ctx.physicalDt,
      ctx.calendarHoursDelta,
      ctx.timeConfig,
      ctx.indicators,
      ctx.economy,
      hasActiveConflict,
      batchIds.has(c.id),
      ctx.vehicles ?? [],
    );
  }

  if (ctx.runNeedsAndStructure) {
    pairSocializingNeighbors(ctx.citizens);
  }
  syncBuildingOccupants(ctx.tiles, ctx.citizens);

  return {
    households,
    workplaces,
    nextBatchCursor: nextCursor,
  };
}
