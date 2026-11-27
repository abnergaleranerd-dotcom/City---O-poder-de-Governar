import { CitizenAgent, RoadVehicleSim, TileData, TransitLine } from '../../types/game';
import { tileKey } from '../navigation/obstacleSystem';
import { UrbanNavigationCache } from '../navigation/routeCache';
import { WORLD_SCALE } from '../worldScale';

export function buildTransitLines(tiles: TileData[], navCache: UrbanNavigationCache): TransitLine[] {
  const explicitStops = tiles.filter((t) => t.busStop && t.road !== 'none');
  const avenues = tiles.filter((t) => t.road === 'avenida');
  const fallbackRoads = tiles.filter((t) => t.road !== 'none');

  const sourceStops =
    explicitStops.length >= 3
      ? explicitStops
      : avenues.length >= 4
      ? avenues.filter((_, idx) => idx % 4 === 0).slice(0, 6)
      : fallbackRoads.filter((_, idx) => idx % 8 === 0).slice(0, 4);

  if (sourceStops.length < 2) return [];

  // Order stops along a loop so bus pathing is continuous
  const stopKeys = sourceStops.map((s) => tileKey(s.x, s.z));
  const waitingByStop: Record<string, string[]> = {};
  for (const k of stopKeys) {
    waitingByStop[k] = [];
  }

  // Mark selected stop tiles cleanly if none explicitly tagged
  if (explicitStops.length === 0) {
    for (const st of sourceStops) {
      st.busStop = true;
    }
  }

  // Validate connectivity between consecutive stops
  const connectedStops: string[] = [stopKeys[0]];
  for (let i = 1; i < stopKeys.length; i++) {
    const res = navCache.getRoadPath(connectedStops[connectedStops.length - 1], stopKeys[i]);
    if (res.found) connectedStops.push(stopKeys[i]);
  }
  if (connectedStops.length < 2) return [];

  return [
    {
      id: 'linha_circular_1',
      name: 'Linha 101 — Circular Central',
      color: 0x0284c7,
      stopTileKeys: connectedStops,
      waitingByStop,
      activeBusIds: [],
    },
  ];
}

export function stepPublicTransport(
  lines: TransitLine[],
  vehicles: RoadVehicleSim[],
  citizens: CitizenAgent[],
  navCache: UrbanNavigationCache,
): void {
  if (lines.length === 0) return;

  for (const line of lines) {
    if (line.stopTileKeys.length < 2) continue;

    // Update waiting lists from citizens who selected bus transport near stops
    for (const k of line.stopTileKeys) {
      line.waitingByStop[k] = [];
    }
    for (const c of citizens) {
      if (c.transportMode === 'bus' && !c.insideBuildingId && c.behaviorState === 'WalkingToDestination') {
        const nearestStop = line.stopTileKeys.find((sk) => {
          const [sx, sz] = sk.split(',').map(Number);
          return Math.hypot(c.x - sx, c.z - sz) < 2.2;
        });
        if (nearestStop) {
          line.waitingByStop[nearestStop].push(c.id);
        }
      }
    }

    // Ensure at least 1-2 buses operate on the circular line
    const lineBuses = vehicles.filter((v) => v.role === 'bus' && v.lineId === line.id);
    line.activeBusIds = lineBuses.map((b) => b.id);

    if (lineBuses.length === 0) {
      const originKey = line.stopTileKeys[0];
      const destKey = line.stopTileKeys[1];
      const route = navCache.getRoadPath(originKey, destKey);
      if (route.found && route.points.length > 0) {
        const startPt = route.points[0];
        const nextPt = route.points[1] ?? startPt;
        const yaw = Math.atan2(nextPt.x - startPt.x, nextPt.z - startPt.z);
        const bus: RoadVehicleSim = {
          id: `bus_${line.id}_1`,
          role: 'bus',
          color: line.color,
          x: startPt.x,
          z: startPt.z,
          prevX: startPt.x,
          prevZ: startPt.z,
          yaw,
          prevYaw: yaw,
          speed: 0.28,
          maxSpeed: WORLD_SCALE.vehicleSpeedsTile.busMax,
          originTileKey: originKey,
          destTileKey: destKey,
          path: route.points,
          pathIndex: 0,
          waitingAtSignal: false,
          waitingForCrosswalk: false,
          braking: false,
          stoppedTime: 0,
          lineId: line.id,
          passengerIds: [],
          passengerCapacity: 18,
        };
        vehicles.push(bus);
        line.activeBusIds.push(bus.id);
      }
    }

    // Handle bus boarding/alighting when a bus arrives at a stop
    for (const bus of lineBuses) {
      const atStop = line.stopTileKeys.find((sk) => {
        const [sx, sz] = sk.split(',').map(Number);
        return Math.hypot(bus.x - sx, bus.z - sz) < 0.45;
      });
      if (!atStop) continue;
      const cap = bus.passengerCapacity ?? 18;
      const pax = bus.passengerIds ?? [];
      // Alight a fraction of passengers & board waiting ones
      if (pax.length > 0) {
        bus.passengerIds = pax.slice(Math.floor(pax.length / 2));
      }
      const waiting = line.waitingByStop[atStop] ?? [];
      for (const cid of waiting) {
        if ((bus.passengerIds?.length ?? 0) >= cap) break;
        if (!bus.passengerIds?.includes(cid)) {
          bus.passengerIds = [...(bus.passengerIds ?? []), cid];
        }
      }
    }
  }
}
