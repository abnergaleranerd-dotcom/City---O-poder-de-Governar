import {
  BUILDING_CATALOG,
  CitizenAgent,
  CitizenBehaviorState,
  CitizenState,
  CityIndicators,
  EconomyState,
  GameTimeConfig,
  GRID_SIZE,
  PathPoint,
  RoadVehicleSim,
  TileData,
} from '../../types/game';
import { computeBuildingAccess } from '../navigation/obstacleSystem';
import {
  findNearestPedestrianNode,
  isCrosswalkPoint,
} from '../navigation/pedestrianGraph';
import { smoothPedestrianPath } from '../navigation/pathfinding';
import { UrbanNavigationCache } from '../navigation/routeCache';
import {
  findAvailableInteractionSpot,
  hasLineOfSight,
  isCircleBlocked,
  recordCollisionEvent,
  releaseCitizenSpots,
  reserveInteractionSpot,
  sweepSegmentCapsule,
} from '../navigation/worldRegistry';
import { getHumanSpeedTilesPerSec, metersToTile, WORLD_SCALE } from '../worldScale';
import { evaluateCitizenIntent, findBuildingTileById, findNearestMatchingBuilding } from './citizenNeeds';
import { getScheduledSlot } from './citizenSchedule';

const PEDESTRIAN_RADIUS = WORLD_SCALE.pedestrianRadiusTile;

function mapBehaviorToLegacyState(b: CitizenBehaviorState): CitizenState {
  switch (b) {
    case 'Working':
      return 'working';
    case 'Studying':
      return 'studying';
    case 'Shopping':
    case 'Eating':
      return 'shopping';
    case 'SeekingJob':
      return 'seeking_job';
    case 'SeekingHome':
      return 'seeking_home';
    case 'Protesting':
      return 'protesting';
    case 'WalkingToDestination':
    case 'WaitingForTransport':
    case 'RidingTransport':
    case 'Driving':
    case 'CrossingStreet':
    case 'ReturningHome':
      return 'commuting';
    default:
      return 'idle';
  }
}

function getTargetBehaviorForGoal(
  goal: ReturnType<typeof evaluateCitizenIntent>['goalType'],
): CitizenBehaviorState {
  switch (goal) {
    case 'sleep':
      return 'Sleeping';
    case 'home':
      return 'AtHome';
    case 'work':
      return 'Working';
    case 'study':
      return 'Studying';
    case 'eat':
      return 'Eating';
    case 'shop':
      return 'Shopping';
    case 'exercise':
      return 'Exercising';
    case 'socialize':
      return 'Socializing';
    case 'health':
      return 'ReceivingMedicalCare';
    case 'seek_job':
      return 'SeekingJob';
    case 'seek_home':
      return 'SeekingHome';
    case 'protest':
      return 'Protesting';
    default:
      return 'AtHome';
  }
}

function mapGoalToUnmetDemand(
  goal: ReturnType<typeof evaluateCitizenIntent>['goalType'],
): NonNullable<CitizenAgent['unmetDemandCategory']> {
  switch (goal) {
    case 'health':
      return 'health';
    case 'study':
      return 'education';
    case 'eat':
    case 'shop':
      return 'food';
    case 'seek_job':
    case 'work':
      return 'work';
    case 'seek_home':
    case 'sleep':
    case 'home':
      return 'housing';
    default:
      return 'leisure';
  }
}

function getUnmetThought(cat: NonNullable<CitizenAgent['unmetDemandCategory']>): string {
  switch (cat) {
    case 'health':
      return 'Preciso de atendimento médico, falta posto de saúde ou hospital acessível!';
    case 'education':
      return 'Falta vaga ou acesso a escola na vizinhança.';
    case 'food':
      return 'Falta padaria, restaurante ou mercado acessível no bairro.';
    case 'work':
      return 'Procuro emprego, mas faltam estabelecimentos ou acesso.';
    case 'housing':
      return 'Falta moradia disponível ou acesso residencial.';
    case 'leisure':
      return 'Seria bom ter uma praça ou parque acessível por perto.';
  }
}

function lerpAngle(current: number, target: number, t: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, t);
}

function angleDiff(a: number, b: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}

function shouldStayInsideBuilding(tile: TileData | null): boolean {
  if (!tile || !tile.building) return false;
  return tile.building.type !== 'praca' && tile.building.type !== 'parque';
}

function recordTrailPoint(c: CitizenAgent): void {
  if (!c.trailHistory) c.trailHistory = [];
  const last = c.trailHistory[c.trailHistory.length - 1];
  if (!last || Math.hypot(c.x - last.x, c.z - last.z) >= 0.18) {
    c.trailHistory.push({ x: c.x, z: c.z });
    if (c.trailHistory.length > 16) {
      c.trailHistory.shift();
    }
  }
}

function assignRouteToTile(
  c: CitizenAgent,
  destTile: TileData,
  tiles: TileData[],
  navCache: UrbanNavigationCache,
): boolean {
  const pedGraph = navCache.pedestrianGraph;
  const registry = navCache.worldRegistry;
  const startNode = findNearestPedestrianNode(
    pedGraph,
    c.x,
    c.z,
    4,
    tiles,
    registry,
    c.insideBuildingId,
  );
  if (!startNode) return false;

  let goalNodeId: string | undefined;
  if (destTile.building) {
    goalNodeId = pedGraph.buildingEntranceNode.get(destTile.building.id);
  }
  if (!goalNodeId) {
    const nearestDest = findNearestPedestrianNode(pedGraph, destTile.x, destTile.z, 3, tiles, registry);
    goalNodeId = nearestDest?.id;
  }
  if (!goalNodeId) return false;

  const res = navCache.getPedestrianPath(startNode.id, goalNodeId);
  if (!res.found || res.points.length === 0) {
    return false;
  }

  // Smooth intermediate waypoints ONLY when physically obstacle-free (no wall tunneling)
  const smoothed = smoothPedestrianPath(res.points, (ax, az, bx, bz) =>
    hasLineOfSight(registry, tiles, ax, az, bx, bz, PEDESTRIAN_RADIUS * 0.92, {
      allowedBuildingId: destTile.building?.id ?? null,
    }),
  );

  // If heading to a plaza/park, reserve an unoccupied reachable bench seat spot (never teleporting)
  const finalPoints = [...smoothed];
  if (
    destTile.building &&
    (destTile.building.type === 'praca' || destTile.building.type === 'parque')
  ) {
    const seat = findAvailableInteractionSpot(registry, destTile.building.id, 'seat', c.id);
    if (seat) {
      const last = finalPoints[finalPoints.length - 1];
      const approachNode = findNearestPedestrianNode(pedGraph, seat.approachX, seat.approachZ, 1, tiles, registry);
      let seatPathAdded = false;
      if (hasLineOfSight(registry, tiles, last.x, last.z, seat.approachX, seat.approachZ, PEDESTRIAN_RADIUS * 0.8)) {
        finalPoints.push({ x: seat.approachX, z: seat.approachZ });
        seatPathAdded = true;
      } else if (approachNode) {
        const sub = navCache.getPedestrianPath(goalNodeId, approachNode.id);
        if (sub.found && sub.points.length > 0) {
          for (let i = 1; i < sub.points.length; i++) {
            finalPoints.push(sub.points[i]);
          }
          const subLast = finalPoints[finalPoints.length - 1];
          if (hasLineOfSight(registry, tiles, subLast.x, subLast.z, seat.approachX, seat.approachZ, PEDESTRIAN_RADIUS * 0.78)) {
            finalPoints.push({ x: seat.approachX, z: seat.approachZ });
            seatPathAdded = true;
          }
        }
      }
      if (seatPathAdded && reserveInteractionSpot(registry, seat.id, c.id)) {
        c.occupiedSpotId = seat.id;
        c.sittingYaw = seat.yaw;
        c.benchPhase = null;
        c.benchTimer = 0;
      }
    }
  }

  c.path = finalPoints;
  c.pathIndex = 0;
  const finalPt = finalPoints[finalPoints.length - 1];
  c.targetX = finalPt.x;
  c.targetZ = finalPt.z;
  c.targetBuildingId = destTile.building?.id ?? null;
  return true;
}

function stepBenchSequence(
  c: CitizenAgent,
  registry: UrbanNavigationCache['worldRegistry'],
  tiles: TileData[],
  physicalDt: number,
  calendarHoursDelta: number,
): boolean {
  if (!c.benchPhase || !c.occupiedSpotId) return false;
  const seat = registry.spotById.get(c.occupiedSpotId);
  if (!seat) {
    // Bench or park was removed while interacting: cleanly exit bench state
    releaseCitizenSpots(registry, c.id);
    c.occupiedSpotId = null;
    c.sittingYaw = undefined;
    c.benchPhase = null;
    c.benchTimer = 0;
    c.animState = 'Idle';
    c.movementState = 'stopped';
    return false;
  }

  if (c.benchPhase === 'approaching') {
    const dx = seat.x - c.x;
    const dz = seat.z - c.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= 0.032) {
      c.x = seat.x;
      c.z = seat.z;
      c.lastValidX = seat.x;
      c.lastValidZ = seat.z;
      c.currentSpeed = 0;
      c.benchPhase = 'turning';
      c.benchTimer = 0.28;
      c.animState = 'Idle';
      c.movementState = 'stopped';
    } else if (physicalDt > 0) {
      const spd = metersToTile(0.85);
      const step = Math.min(dist, spd * physicalDt);
      const nx = c.x + (dx / dist) * step;
      const nz = c.z + (dz / dist) * step;
      const swept = sweepSegmentCapsule(registry, tiles, c.x, c.z, nx, nz, PEDESTRIAN_RADIUS * 0.72, {
        allowedBenchBuildingId: seat.buildingId ?? null,
      });
      if (!swept.hit) {
        c.x = nx;
        c.z = nz;
        c.lastValidX = nx;
        c.lastValidZ = nz;
      } else {
        c.x = swept.safeX;
        c.z = swept.safeZ;
        c.benchPhase = 'turning';
        c.benchTimer = 0.28;
      }
      c.yaw = lerpAngle(c.yaw ?? seat.yaw, Math.atan2(dx, dz), physicalDt * 9);
      c.currentSpeed = spd;
      c.movementState = 'walking';
      c.animState = 'WalkSlow';
    }
    return true;
  }

  if (c.benchPhase === 'turning') {
    c.currentSpeed = 0;
    c.movementState = 'stopped';
    c.animState = 'Idle';
    c.yaw = lerpAngle(c.yaw ?? seat.yaw, seat.yaw, Math.max(0.15, physicalDt * 8));
    c.benchTimer = Math.max(0, (c.benchTimer ?? 0.25) - physicalDt);
    if (angleDiff(c.yaw ?? seat.yaw, seat.yaw) < 0.12 || c.benchTimer <= 0) {
      c.yaw = seat.yaw;
      c.benchPhase = 'sitting';
      c.animState = 'Sit';
    }
    return true;
  }

  if (c.benchPhase === 'sitting') {
    c.currentSpeed = 0;
    c.movementState = 'stopped';
    c.animState = 'Sit';
    c.yaw = lerpAngle(c.yaw ?? seat.yaw, seat.yaw, Math.max(0.1, physicalDt * 6));
    if ((c.activityUntilHour ?? 0) > 0) {
      c.activityUntilHour = Math.max(0, (c.activityUntilHour ?? 0) - calendarHoursDelta);
    }
    if ((c.activityUntilHour ?? 0) <= 0.02) {
      c.benchPhase = 'standing_up';
      c.benchTimer = 0.52;
      c.animState = 'StandUp';
    }
    return true;
  }

  if (c.benchPhase === 'standing_up') {
    c.animState = 'StandUp';
    c.benchTimer = Math.max(0, (c.benchTimer ?? 0.5) - physicalDt);
    // Smoothly step forward off bench planks back onto approach point
    const dx = seat.approachX - c.x;
    const dz = seat.approachZ - c.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.015 && physicalDt > 0 && c.benchTimer < 0.35) {
      const spd = metersToTile(0.75);
      const step = Math.min(dist, spd * physicalDt);
      const nx = c.x + (dx / dist) * step;
      const nz = c.z + (dz / dist) * step;
      const swept = sweepSegmentCapsule(registry, tiles, c.x, c.z, nx, nz, PEDESTRIAN_RADIUS * 0.72, {
        allowedBenchBuildingId: seat.buildingId ?? null,
      });
      if (!swept.hit) {
        c.x = nx;
        c.z = nz;
        c.lastValidX = nx;
        c.lastValidZ = nz;
      }
      c.movementState = 'walking';
      c.currentSpeed = spd;
    } else {
      c.movementState = 'stopped';
      c.currentSpeed = 0;
    }

    if ((c.benchTimer ?? 0) <= 0) {
      c.benchPhase = null;
      c.benchTimer = 0;
      releaseCitizenSpots(registry, c.id);
      c.occupiedSpotId = null;
      c.sittingYaw = undefined;
      c.animState = 'Idle';
      c.movementState = 'stopped';
      c.currentSpeed = 0;
      c.decisionCooldown = 0;
      return false;
    }
    return true;
  }

  return false;
}

export function stepCitizenBehaviorAndMotion(
  c: CitizenAgent,
  allCitizens: CitizenAgent[],
  tiles: TileData[],
  navCache: UrbanNavigationCache,
  hourOfDay: number,
  day: number,
  physicalDt: number,
  calendarHoursDelta: number,
  timeConfig: GameTimeConfig,
  indicators: CityIndicators,
  economy: EconomyState,
  hasActiveConflict: boolean,
  canMakeDecisionNow: boolean,
  vehicles: RoadVehicleSim[] = [],
): void {
  // Freeze completely when simulation is paused
  if (physicalDt <= 0 && calendarHoursDelta <= 0) {
    return;
  }

  const registry = navCache.worldRegistry;
  const isWeekend = day % 7 === 6 || day % 7 === 0;
  const currentBuilding = findBuildingTileById(tiles, c.insideBuildingId);

  // Initialize lastValid anchor safely on first step without bypassing building walls
  if (c.lastValidX === undefined || c.lastValidZ === undefined) {
    if (
      !c.insideBuildingId &&
      isCircleBlocked(registry, tiles, c.x, c.z, PEDESTRIAN_RADIUS * 0.85, {
        allowedBuildingId: c.targetBuildingId,
        allowedBenchBuildingId: c.benchPhase ? c.targetBuildingId : null,
      }).blocked
    ) {
      const safeNode = findNearestPedestrianNode(navCache.pedestrianGraph, c.x, c.z, 3, tiles, registry);
      if (safeNode) {
        c.x = safeNode.x;
        c.z = safeNode.z;
      }
    }
    c.lastValidX = c.x;
    c.lastValidZ = c.z;
  }

  // If citizen was inside a building that got demolished, eject safely onto nearest clear sidewalk
  if (c.insideBuildingId && !currentBuilding) {
    releaseCitizenSpots(registry, c.id);
    c.occupiedSpotId = null;
    c.sittingYaw = undefined;
    c.benchPhase = null;
    c.benchTimer = 0;
    const safeNode = findNearestPedestrianNode(navCache.pedestrianGraph, c.x, c.z, 3, tiles, registry);
    if (safeNode) {
      c.x = safeNode.x;
      c.z = safeNode.z;
      c.lastValidX = safeNode.x;
      c.lastValidZ = safeNode.z;
    }
    c.insideBuildingId = null;
    c.behaviorState = 'AtHome';
    c.movementState = 'stopped';
    c.animState = 'Idle';
    c.currentSpeed = 0;
    c.decisionCooldown = 0;
  }

  // Decrement decision cooldown
  if ((c.decisionCooldown ?? 0) > 0) {
    c.decisionCooldown = Math.max(0, (c.decisionCooldown ?? 0) - calendarHoursDelta);
  }

  // Run explicit Bench FSM (approach -> turn -> sit -> stand_up -> release) if active
  if (stepBenchSequence(c, registry, tiles, physicalDt, calendarHoursDelta)) {
    c.state = mapBehaviorToLegacyState(c.behaviorState ?? 'Socializing');
    return;
  }

  // Check if current inside-building or stationary activity is still in progress
  const activityRemaining = c.activityUntilHour ?? 0;
  if (c.insideBuildingId || (c.movementState === 'stopped' && (!c.path || c.pathIndex === undefined || c.pathIndex >= c.path.length))) {
    if (activityRemaining > 0) {
      c.activityUntilHour = Math.max(0, activityRemaining - calendarHoursDelta);
    }

    if ((c.activityUntilHour ?? 0) > 0.02) {
      c.currentSpeed = 0;
      if (c.insideBuildingId && currentBuilding) {
        c.x = currentBuilding.x;
        c.z = currentBuilding.z;
        c.movementState = 'stopped';
        c.animState = c.behaviorState === 'Working' ? 'Work' : c.behaviorState === 'Shopping' ? 'Shop' : 'Idle';
      } else if (c.behaviorState === 'Socializing' && c.talkingWithId) {
        const partner = allCitizens.find((o) => o.id === c.talkingWithId);
        if (partner && Math.hypot(partner.x - c.x, partner.z - c.z) < 1.3) {
          c.yaw = lerpAngle(c.yaw ?? 0, Math.atan2(partner.x - c.x, partner.z - c.z), physicalDt * 6);
          c.animState = 'Talk';
        } else {
          c.talkingWithId = null;
          c.animState = 'Idle';
        }
      }
      c.state = mapBehaviorToLegacyState(c.behaviorState ?? 'AtHome');
      return;
    }
  }

  // Decide next goal when ready (no active path, finished activity, cooldown expired)
  const hasActivePath = Boolean(c.path && c.pathIndex !== undefined && c.pathIndex < c.path.length);
  if (!hasActivePath && (c.decisionCooldown ?? 0) <= 0 && (canMakeDecisionNow || (c.activityUntilHour ?? 0) <= 0.02)) {
    releaseCitizenSpots(registry, c.id);
    c.occupiedSpotId = null;
    c.sittingYaw = undefined;
    c.benchPhase = null;
    c.benchTimer = 0;

    const slot = getScheduledSlot(c.scheduleProfile ?? 'clt', hourOfDay, c.staggerMinutes ?? 0, day);
    const intent = evaluateCitizenIntent(c, hourOfDay, isWeekend, slot, indicators, economy, hasActiveConflict);

    // Choose strict category-matched destination tile
    let destTile: TileData | null = null;
    if (intent.goalType === 'sleep' || intent.goalType === 'home') {
      destTile = findBuildingTileById(tiles, c.residenceBuildingId);
    } else if (intent.goalType === 'work') {
      destTile = findBuildingTileById(tiles, c.employedAtId);
    }
    if (!destTile && intent.preferredBuildingTypes.length > 0) {
      destTile = findNearestMatchingBuilding(tiles, c.x, c.z, intent.preferredBuildingTypes);
    }
    // If hungry and no padaria/mercado/restaurante exists, only eat at own residence (never fallback to praca/prefeitura!)
    if (!destTile && intent.goalType === 'eat' && c.residenceBuildingId) {
      destTile = findBuildingTileById(tiles, c.residenceBuildingId);
    }

    if (!destTile) {
      // Record unmet demand transparently to mayor instead of routing to unrelated buildings
      const unmet = mapGoalToUnmetDemand(intent.goalType);
      c.unmetDemandCategory = unmet;
      c.behaviorState = 'WaitingForPath';
      c.movementState = 'stopped';
      c.animState = 'Wait';
      c.currentSpeed = 0;
      c.blockedReason = getUnmetThought(unmet);
      c.thought = c.blockedReason;
      c.decisionCooldown = 0.85;
      c.state = mapBehaviorToLegacyState(c.behaviorState);
      return;
    }

    c.unmetDemandCategory = null;

    if (destTile.building) {
      const access = computeBuildingAccess(tiles, destTile);
      const nearFrontDoor = Math.hypot(c.x - access.entrancePoint.x, c.z - access.entrancePoint.z) < 0.24;
      const isAlreadyAtDestination =
        c.insideBuildingId === destTile.building.id ||
        (nearFrontDoor &&
          hasLineOfSight(registry, tiles, c.x, c.z, access.entrancePoint.x, access.entrancePoint.z, PEDESTRIAN_RADIUS * 0.72, {
            allowedBuildingId: destTile.building.id,
          }));

      if (isAlreadyAtDestination) {
        const nextBehavior = getTargetBehaviorForGoal(intent.goalType);
        c.behaviorState = nextBehavior;
        c.intent = intent.goalType;
        c.activity = intent.thought;
        c.thought = intent.thought;
        c.talkingWithId = null;
        c.currentSpeed = 0;
        const dur =
          intent.minDurationHours +
          Math.random() * Math.max(0.2, intent.maxDurationHours - intent.minDurationHours);
        c.activityUntilHour = dur;
        c.decisionCooldown = 0.25;
        if (shouldStayInsideBuilding(destTile)) {
          c.insideBuildingId = destTile.building.id;
          c.x = destTile.x;
          c.z = destTile.z;
          c.movementState = 'stopped';
          c.animState = nextBehavior === 'Working' ? 'Work' : nextBehavior === 'Shopping' ? 'Shop' : 'Idle';
        } else {
          c.insideBuildingId = null;
          c.movementState = 'stopped';
          const seat = findAvailableInteractionSpot(registry, destTile.building.id, 'seat', c.id);
          if (seat && reserveInteractionSpot(registry, seat.id, c.id)) {
            c.occupiedSpotId = seat.id;
            c.sittingYaw = seat.yaw;
            c.targetBuildingId = destTile.building.id;
            // Walk smoothly to approach then step onto bench (no teleport)
            if (hasLineOfSight(registry, tiles, c.x, c.z, seat.approachX, seat.approachZ, PEDESTRIAN_RADIUS * 0.75)) {
              c.path = [{ x: seat.approachX, z: seat.approachZ }];
              c.pathIndex = 0;
              c.activityMinDurationHours = dur;
              c.behaviorState = 'WalkingToDestination';
            } else {
              c.benchPhase = 'approaching';
              c.benchTimer = 0.9;
            }
          } else {
            c.animState = nextBehavior === 'Protesting' ? 'Talk' : 'Idle';
          }
        }
        c.state = mapBehaviorToLegacyState(c.behaviorState);
        return;
      }

      // Exit current building onto its clear front entrance before routing
      if (c.insideBuildingId && currentBuilding) {
        const curAccess = computeBuildingAccess(tiles, currentBuilding);
        c.x = curAccess.entrancePoint.x;
        c.z = curAccess.entrancePoint.z;
        c.lastValidX = c.x;
        c.lastValidZ = c.z;
        c.insideBuildingId = null;
      }

      const routed = assignRouteToTile(c, destTile, tiles, navCache);
      if (routed) {
        c.intent = intent.goalType;
        c.activity = intent.thought;
        c.thought = intent.thought;
        c.talkingWithId = null;
        c.blockedTicks = 0;
        c.blockedReason = undefined;
        c.behaviorState =
          intent.goalType === 'home' || intent.goalType === 'sleep'
            ? 'ReturningHome'
            : 'WalkingToDestination';
        c.activityMinDurationHours =
          intent.minDurationHours +
          Math.random() * Math.max(0.2, intent.maxDurationHours - intent.minDurationHours);
        const pathDist = c.path ? c.path.length : 1;
        c.transportMode = pathDist > 18 && tiles.some((t) => t.busStop) ? 'bus' : 'walk';
        c.decisionCooldown = 0.4;
      } else {
        const unmet = mapGoalToUnmetDemand(intent.goalType);
        c.unmetDemandCategory = unmet;
        c.behaviorState = 'WaitingForPath';
        c.movementState = 'waiting';
        c.animState = 'Wait';
        c.currentSpeed = 0;
        c.blockedTicks = (c.blockedTicks ?? 0) + 1;
        c.unreachableCount = (c.unreachableCount ?? 0) + 1;
        c.blockedReason = 'Sem calçada conectada';
        c.thought = 'Sem acesso viário ou calçada conectada até o destino.';
        c.decisionCooldown = 0.8;
        c.state = mapBehaviorToLegacyState(c.behaviorState);
        return;
      }
    }
  }

  // Follow active A* pedestrian path with continuous swept collision, braking & natural steering
  if (c.path && c.pathIndex !== undefined && c.pathIndex < c.path.length) {
    const wp: PathPoint = c.path[c.pathIndex];
    const dx = wp.x - c.x;
    const dz = wp.z - c.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.08) {
      c.pathIndex += 1;
      if (c.pathIndex >= c.path.length) {
        c.path = [];
        c.pathIndex = 0;
        c.currentSpeed = 0;
        c.movementState = 'stopped';
        c.blockedReason = undefined;

        const destBuilding = findBuildingTileById(tiles, c.targetBuildingId);
        const goalType = (c.intent as ReturnType<typeof evaluateCitizenIntent>['goalType']) ?? 'home';
        const arrivedBehavior = getTargetBehaviorForGoal(goalType);
        c.behaviorState = arrivedBehavior;
        c.activityUntilHour = c.activityMinDurationHours ?? 1.5;

        if (destBuilding && destBuilding.building && shouldStayInsideBuilding(destBuilding)) {
          c.insideBuildingId = destBuilding.building.id;
          c.x = destBuilding.x;
          c.z = destBuilding.z;
          c.animState = arrivedBehavior === 'Working' ? 'Work' : arrivedBehavior === 'Shopping' ? 'Shop' : 'Idle';
        } else {
          c.insideBuildingId = null;
          if (c.occupiedSpotId && c.sittingYaw !== undefined) {
            // Transition smoothly into approaching -> turning -> sitting (NEVER teleport)
            c.benchPhase = 'approaching';
            c.benchTimer = 0.9;
            c.animState = 'WalkSlow';
          } else {
            c.animState =
              arrivedBehavior === 'Socializing' || arrivedBehavior === 'Protesting' ? 'Talk' : 'Idle';
          }
        }
        c.state = mapBehaviorToLegacyState(c.behaviorState);
        return;
      }
    } else if (physicalDt > 0) {
      const dirX = dx / dist;
      const dirZ = dz / dist;

      // Crosswalk & near-field vehicle safety: yield cleanly if an active vehicle is approaching
      const crossingNow = isCrosswalkPoint(navCache.pedestrianGraph, wp) || isCrosswalkPoint(navCache.pedestrianGraph, { x: c.x, z: c.z });
      if (vehicles.length > 0) {
        for (let i = 0; i < vehicles.length; i++) {
          const v = vehicles[i];
          if (v.speed < 0.04) continue;
          const vx = c.x - v.x;
          const vz = c.z - v.z;
          const vDist = Math.hypot(vx, vz);
          const checkRange = crossingNow ? 0.56 : 0.36;
          if (vDist < checkRange) {
            const vDirX = Math.sin(v.yaw);
            const vDirZ = Math.cos(v.yaw);
            if (vx * vDirX + vz * vDirZ > -0.05) {
              c.currentSpeed = 0;
              c.movementState = 'waiting';
              c.animState = 'Wait';
              if (crossingNow) c.behaviorState = 'CrossingStreet';
              c.blockedReason = 'Aguardando veículo na faixa';
              c.state = mapBehaviorToLegacyState(c.behaviorState ?? 'CrossingStreet');
              return;
            }
          }
        }
      }

      // Metric physical speed calibrated to human pace (0.7–1.0 m/s elderly, 1.0–1.5 m/s adult, 1.6–1.8 brisk, 2.5–3.0 run)
      const isJogging = c.intent === 'exercise' && (c.personality === 'aventureiro' || (c.needs.energy ?? 70) > 65);
      const isBrisk =
        !isJogging &&
        (c.intent === 'work' || c.intent === 'health') &&
        c.age < 64 &&
        (c.personality === 'trabalhador' || c.personality === 'organizado' || c.personality === 'ambicioso');
      const baseSpeed = getHumanSpeedTilesPerSec(
        c.age,
        isJogging ? 'run' : isBrisk ? 'brisk' : 'normal',
        c.appearanceSeed ?? 0,
      );
      const clampedTuning = Math.min(1.35, Math.max(0.75, timeConfig.npcSpeedMultiplier));
      let targetSpeed = baseSpeed * clampedTuning;

      // Progressive deceleration near final destination or tight direction changes
      if (dist < 0.28 && c.pathIndex === c.path.length - 1) {
        targetSpeed *= Math.max(0.45, dist / 0.28);
      }

      // Personal-space lateral avoidance, right-hand pass deflection, queue braking, and pace sync
      let steerX = dirX;
      let steerZ = dirZ;
      const rightX = -dirZ;
      const rightZ = dirX;
      for (let i = 0; i < allCitizens.length; i++) {
        const other = allCitizens[i];
        if (other.id === c.id || other.insideBuildingId) continue;
        const ox = c.x - other.x;
        const oz = c.z - other.z;
        const od = Math.hypot(ox, oz);
        if (od > 0.0005 && od < 0.3) {
          const towardOtherDot = ((-ox / od) * dirX) + ((-oz / od) * dirZ);
          const otherFacingDot =
            Math.sin(other.yaw ?? 0) * dirX + Math.cos(other.yaw ?? 0) * dirZ;
          if (towardOtherDot > 0.35) {
            if (od < PEDESTRIAN_RADIUS * 1.75) {
              targetSpeed *= 0.25;
            } else if ((other.currentSpeed ?? 0) < 0.03 && od < 0.17) {
              targetSpeed *= 0.3;
            } else {
              targetSpeed = Math.min(targetSpeed, Math.max(metersToTile(0.65), (other.currentSpeed ?? baseSpeed) * 0.96));
            }
            if (otherFacingDot < -0.35) {
              const passWeight = ((0.3 - od) / 0.3) * 0.85;
              steerX += rightX * passWeight;
              steerZ += rightZ * passWeight;
            }
          }
          const push = ((0.3 - od) / 0.3) * (od < PEDESTRIAN_RADIUS * 1.9 ? 1.15 : 0.48);
          steerX += (ox / od) * push;
          steerZ += (oz / od) * push;
        }
      }

      // Strict collision options: front door corridor ONLY when on final waypoint toward target building
      const isFinalWaypoint = c.pathIndex === c.path.length - 1;
      const collisionOpts = {
        allowedBuildingId: isFinalWaypoint ? c.targetBuildingId : null,
      };
      const lookX = c.x + dirX * 0.2;
      const lookZ = c.z + dirZ * 0.2;
      if (isCircleBlocked(registry, tiles, lookX, lookZ, PEDESTRIAN_RADIUS, collisionOpts).blocked) {
        targetSpeed *= 0.55;
      }

      const curSpd = c.currentSpeed ?? 0;
      const accel = targetSpeed > curSpd ? metersToTile(3.2) : metersToTile(6.0);
      const nextSpd =
        curSpd + Math.sign(targetSpeed - curSpd) * Math.min(Math.abs(targetSpeed - curSpd), accel * physicalDt);
      c.currentSpeed = nextSpd;

      const steerLen = Math.hypot(steerX, steerZ) || 1;
      steerX /= steerLen;
      steerZ /= steerLen;

      const step = Math.min(dist, nextSpd * physicalDt);
      const candX = Math.min(GRID_SIZE - 0.55, Math.max(0.55, c.x + steerX * step));
      const candZ = Math.min(GRID_SIZE - 0.55, Math.max(0.55, c.z + steerZ * step));

      // Continuous swept-segment capsule check: NEVER allow entering solid obstacles or non-door walls
      const swept = sweepSegmentCapsule(
        registry,
        tiles,
        c.x,
        c.z,
        candX,
        candZ,
        PEDESTRIAN_RADIUS,
        collisionOpts,
      );

      let finalX = candX;
      let finalZ = candZ;
      let moved = true;

      if (swept.hit) {
        const tryAngles = [0.55, -0.55, 1.05, -1.05];
        let foundSlide = false;
        const baseAngle = Math.atan2(dirZ, dirX);
        for (const aOff of tryAngles) {
          const sx = Math.cos(baseAngle + aOff);
          const sz = Math.sin(baseAngle + aOff);
          const altX = Math.min(GRID_SIZE - 0.55, Math.max(0.55, c.x + sx * step * 0.72));
          const altZ = Math.min(GRID_SIZE - 0.55, Math.max(0.55, c.z + sz * step * 0.72));
          const altSwept = sweepSegmentCapsule(
            registry,
            tiles,
            c.x,
            c.z,
            altX,
            altZ,
            PEDESTRIAN_RADIUS,
            collisionOpts,
          );
          if (!altSwept.hit) {
            finalX = altX;
            finalZ = altZ;
            foundSlide = true;
            break;
          }
        }

        if (!foundSlide) {
          moved = false;
          c.x = c.lastValidX ?? swept.safeX;
          c.z = c.lastValidZ ?? swept.safeZ;
          c.currentSpeed = 0;
          c.movementState = 'waiting';
          c.animState = 'Wait';
          c.blockedTicks = (c.blockedTicks ?? 0) + 1;
          c.lastCollisionAt = Date.now();
          c.blockedReason = swept.reason ?? 'Obstáculo à frente';
          recordCollisionEvent(
            registry,
            swept.safeX,
            swept.safeZ,
            swept.hitObjectId ?? 'obstacle',
            c.blockedReason,
          );

          if ((c.blockedTicks ?? 0) >= 4) {
            c.path = [];
            c.pathIndex = 0;
            c.decisionCooldown = 0.2;
          }
          c.state = mapBehaviorToLegacyState(c.behaviorState ?? 'WalkingToDestination');
          return;
        }
      }

      if (moved) {
        c.x = finalX;
        c.z = finalZ;
        c.lastValidX = finalX;
        c.lastValidZ = finalZ;
        c.blockedTicks = 0;
        c.blockedReason = undefined;
        recordTrailPoint(c);
      }

      if (dist > 0.015) {
        const targetYaw = Math.atan2(dx, dz);
        c.yaw = lerpAngle(c.yaw ?? targetYaw, targetYaw, physicalDt * 8.5);
      }

      if (crossingNow) {
        c.behaviorState = 'CrossingStreet';
      } else if (c.intent === 'home' || c.intent === 'sleep') {
        c.behaviorState = 'ReturningHome';
      } else {
        c.behaviorState = 'WalkingToDestination';
      }

      c.movementState = isJogging ? 'jogging' : 'walking';
      // Synchronize animation state strictly with real metric speed (m/s -> tiles/s)
      if (nextSpd < metersToTile(0.25)) {
        c.movementState = 'waiting';
        c.animState = 'Wait';
      } else if (nextSpd < metersToTile(1.02)) {
        c.animState = 'WalkSlow';
      } else if (nextSpd < metersToTile(1.56)) {
        c.animState = 'Walk';
      } else if (nextSpd < metersToTile(2.15)) {
        c.animState = 'WalkFast';
      } else {
        c.animState = 'Run';
      }
    }
  } else {
    c.currentSpeed = 0;
    c.movementState = 'stopped';
    c.animState = c.behaviorState === 'WaitingForPath' ? 'Wait' : 'Idle';
  }

  c.state = mapBehaviorToLegacyState(c.behaviorState ?? 'AtHome');
  void BUILDING_CATALOG;
}
