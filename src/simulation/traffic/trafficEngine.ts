import {
  CitizenAgent,
  EmergencyDispatch,
  GameTimeConfig,
  RoadVehicleSim,
  TileData,
  TrafficSignalNode,
  TransitLine,
} from '../../types/game';
import { tileKey } from '../navigation/obstacleSystem';
import { UrbanNavigationCache } from '../navigation/routeCache';
import { WORLD_SCALE } from '../worldScale';
import { buildTransitLines, stepPublicTransport } from './publicTransport';
import { getSignalAspectForDirection, reconcileTrafficSignals, stepTrafficSignals } from './trafficSignals';
import { dispatchEmergencyIfNeeded, spawnPurposefulVehicle } from './vehicleRoutes';

function lerpAngle(current: number, target: number, t: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, t);
}

export interface TrafficSystemState {
  vehicles: RoadVehicleSim[];
  signals: TrafficSignalNode[];
  transitLines: TransitLine[];
  dispatches: EmergencyDispatch[];
  spawnCursor: number;
}

export function createInitialTrafficState(): TrafficSystemState {
  return {
    vehicles: [],
    signals: [],
    transitLines: [],
    dispatches: [],
    spawnCursor: 1,
  };
}

export function stepTrafficEngine(
  state: TrafficSystemState,
  tiles: TileData[],
  citizens: CitizenAgent[],
  navCache: UrbanNavigationCache,
  physicalDt: number,
  timeConfig: GameTimeConfig,
): void {
  const roadGraph = navCache.roadGraph;
  if (roadGraph.nodes.size === 0) {
    state.vehicles = [];
    state.signals = [];
    state.transitLines = [];
    return;
  }

  // Reconcile intersection signals & public transit lines
  state.signals = reconcileTrafficSignals(roadGraph, state.signals);
  if (state.transitLines.length === 0) {
    state.transitLines = buildTransitLines(tiles, navCache);
  }

  stepTrafficSignals(state.signals, physicalDt);
  const signalMap = new Map(state.signals.map((s) => [s.tileKey, s]));

  // Target active vehicle pool: moderate, realistic Pilot Neighborhood & city flow
  const roadCount = roadGraph.nodes.size;
  const desiredCount = Math.min(
    26,
    Math.max(4, Math.round((roadCount * 0.22 + citizens.length * 0.1) * timeConfig.trafficIntensity)),
  );

  // Maintain bus line & spawn purposeful vehicles up to desiredCount
  stepPublicTransport(state.transitLines, state.vehicles, citizens, navCache);
  dispatchEmergencyIfNeeded(tiles, state.vehicles, state.dispatches, navCache);

  let guard = 0;
  while (state.vehicles.length < desiredCount && guard < 6) {
    guard++;
    const idx = state.spawnCursor++;
    const role = idx % 5 === 0 ? 'cargo' : idx % 11 === 0 ? 'police' : 'commuter';
    const v = spawnPurposefulVehicle(`veh_${idx}`, role, tiles, navCache, idx);
    if (v) state.vehicles.push(v);
  }
  if (state.vehicles.length > desiredCount + 4) {
    state.vehicles = state.vehicles.filter((v, i) => v.role !== 'commuter' || i < desiredCount);
  }

  if (physicalDt <= 0) return;

  // Step each vehicle along its RoadGraph path with signals, spacing, and crosswalk yielding
  const surviving: RoadVehicleSim[] = [];

  for (const v of state.vehicles) {
    const currentRoadKey = tileKey(Math.round(v.x), Math.round(v.z));
    if (!roadGraph.nodes.has(currentRoadKey)) {
      // Road beneath vehicle was demolished: cleanly despawn without off-road teleporting
      continue;
    }

    // Verify current road node or next waypoint is still valid road (never teleport off-road)
    if (!v.path || v.path.length < 2 || v.pathIndex >= v.path.length) {
      // Handle bus loop continuation
      if (v.role === 'bus' && v.lineId) {
        const line = state.transitLines.find((l) => l.id === v.lineId);
        if (line && line.stopTileKeys.length >= 2) {
          const curIdx = Math.max(0, line.stopTileKeys.indexOf(v.destTileKey));
          const nextIdx = (curIdx + 1) % line.stopTileKeys.length;
          const nextRoute = navCache.getRoadPath(v.destTileKey, line.stopTileKeys[nextIdx]);
          if (nextRoute.found && nextRoute.points.length >= 2) {
            v.originTileKey = v.destTileKey;
            v.destTileKey = line.stopTileKeys[nextIdx];
            v.path = nextRoute.points;
            v.pathIndex = 1;
            surviving.push(v);
            continue;
          }
        }
      }

      // Handle emergency return-to-base or completion
      if (v.role === 'ambulance' || v.role === 'fire' || (v.role === 'police' && v.incidentTileKey)) {
        const disp = state.dispatches.find((d) => d.vehicleId === v.id);
        if (disp && !v.returningToBase) {
          disp.status = 'returning';
          v.returningToBase = true;
          const retRoute = navCache.getRoadPath(v.destTileKey, v.originTileKey);
          if (retRoute.found && retRoute.points.length >= 2) {
            v.destTileKey = v.originTileKey;
            v.path = retRoute.points;
            v.pathIndex = 1;
            surviving.push(v);
            continue;
          }
        }
        state.dispatches = state.dispatches.filter((d) => d.vehicleId !== v.id);
        continue;
      }

      // Assign return trip home or next purposeful trip
      const nextTrip = navCache.getRoadPath(v.destTileKey, v.originTileKey);
      if (nextTrip.found && nextTrip.points.length >= 2) {
        const prevOrigin = v.originTileKey;
        v.originTileKey = v.destTileKey;
        v.destTileKey = prevOrigin;
        v.path = nextTrip.points;
        v.pathIndex = 1;
        surviving.push(v);
      }
      continue;
    }

    const wp = v.path[v.pathIndex];
    const wpKey = tileKey(Math.round(wp.x), Math.round(wp.z));
    if (!roadGraph.nodes.has(wpKey)) {
      // Road ahead was demolished: try re-routing cleanly from current nearest road tile
      const curKey = tileKey(Math.round(v.x), Math.round(v.z));
      if (!roadGraph.nodes.has(curKey)) {
        // Safely park/despawn disconnected vehicle without teleporting
        continue;
      }
      const reroute = navCache.getRoadPath(curKey, v.destTileKey);
      if (reroute.found && reroute.points.length >= 2) {
        v.path = reroute.points;
        v.pathIndex = 1;
      } else {
        v.speed = 0;
        v.braking = true;
        v.stoppedTime += physicalDt;
        if (v.stoppedTime < 4.0) surviving.push(v);
        continue;
      }
    }

    const dx = wp.x - v.x;
    const dz = wp.z - v.z;
    const distToWp = Math.hypot(dx, dz);

    if (distToWp < 0.14) {
      v.pathIndex += 1;
      surviving.push(v);
      continue;
    }

    const dirX = dx / distToWp;
    const dirZ = dz / distToWp;

    // 1. Check traffic signal ahead (emergencies ignore red with caution)
    let mustStopSignal = false;
    const nextNode = roadGraph.nodes.get(wpKey);
    if (nextNode?.isSignalized && distToWp < 0.72 && distToWp > 0.25 && v.role !== 'ambulance' && v.role !== 'fire') {
      const sig = signalMap.get(wpKey);
      const aspect = getSignalAspectForDirection(sig, dirX, dirZ);
      if (aspect === 'red' || (aspect === 'yellow' && distToWp > 0.42)) {
        mustStopSignal = true;
      }
    }

    // 2. Yield for pedestrians crossing street ahead
    let mustYieldPed = false;
    for (let i = 0; i < citizens.length; i++) {
      const ped = citizens[i];
      if (ped.insideBuildingId || ped.behaviorState !== 'CrossingStreet') continue;
      const px = ped.x - v.x;
      const pz = ped.z - v.z;
      const pDist = Math.hypot(px, pz);
      if (pDist < 0.85 && px * dirX + pz * dirZ > 0.05) {
        mustYieldPed = true;
        break;
      }
    }

    // 3. Maintain safe following gap behind vehicle in same lane/direction
    let mustBrakeAhead = false;
    for (let i = 0; i < state.vehicles.length; i++) {
      const other = state.vehicles[i];
      if (other.id === v.id) continue;
      const ox = other.x - v.x;
      const oz = other.z - v.z;
      const oDist = Math.hypot(ox, oz);
      if (oDist < 0.78 && ox * dirX + oz * dirZ > 0.15) {
        const sameHeading = Math.cos(other.yaw - v.yaw) > 0.55;
        if (sameHeading) {
          mustBrakeAhead = true;
          break;
        }
      }
    }

    v.waitingAtSignal = mustStopSignal;
    v.waitingForCrosswalk = mustYieldPed;
    v.braking = mustStopSignal || mustYieldPed || mustBrakeAhead;

    const roadLimit = nextNode?.speedLimit ?? WORLD_SCALE.vehicleSpeedsTile.ruaLimit;
    const targetSpeed = v.braking ? 0 : Math.min(v.maxSpeed, roadLimit);

    const accel = v.braking ? 1.85 : 0.95;
    if (v.speed < targetSpeed) {
      v.speed = Math.min(targetSpeed, v.speed + accel * physicalDt);
    } else {
      v.speed = Math.max(targetSpeed, v.speed - accel * physicalDt);
    }

    if (v.speed < 0.02) {
      v.stoppedTime += physicalDt;
    } else {
      v.stoppedTime = 0;
    }

    const moveStep = Math.min(distToWp, v.speed * physicalDt);
    v.x += dirX * moveStep;
    v.z += dirZ * moveStep;

    const desiredYaw = Math.atan2(dirX, dirZ);
    v.yaw = lerpAngle(v.yaw, desiredYaw, physicalDt * 7.5);

    surviving.push(v);
  }

  state.vehicles = surviving;
}
