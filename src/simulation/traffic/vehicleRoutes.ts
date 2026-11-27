import {
  BUILDING_CATALOG,
  EmergencyDispatch,
  RoadVehicleSim,
  TileData,
  VehicleRole,
} from '../../types/game';
import { computeBuildingAccess, tileKey } from '../navigation/obstacleSystem';
import { UrbanNavigationCache } from '../navigation/routeCache';
import { WORLD_SCALE } from '../worldScale';

const COMMUTER_COLORS = [0x334155, 0x475569, 0x1e40af, 0x0f766e, 0x991b1b, 0x78350f, 0xd97706, 0xe2e8f0];
const CARGO_COLORS = [0x64748b, 0x0369a1, 0xb45309];

export function pickVehicleEndpointTiles(tiles: TileData[], role: VehicleRole): {
  origins: string[];
  destinations: string[];
} {
  const resRoads: string[] = [];
  const workRoads: string[] = [];
  const cargoOrigins: string[] = [];
  const cargoDests: string[] = [];
  const policeStations: string[] = [];
  const anyRoads: string[] = [];

  for (const t of tiles) {
    if (t.road !== 'none') anyRoads.push(tileKey(t.x, t.z));
    if (!t.building) continue;
    const access = computeBuildingAccess(tiles, t);
    if (!access.adjacentRoadTile) continue;
    const rk = tileKey(access.adjacentRoadTile.x, access.adjacentRoadTile.z);
    const cat = BUILDING_CATALOG[t.building.type].category;

    if (cat === 'residential') resRoads.push(rk);
    if (cat === 'commercial' || cat === 'public') workRoads.push(rk);
    if (cat === 'industrial') cargoOrigins.push(rk);
    if (cat === 'commercial') cargoDests.push(rk);
    if (t.building.type === 'delegacia') policeStations.push(rk);
  }

  if (role === 'cargo') {
    return {
      origins: cargoOrigins.length > 0 ? cargoOrigins : anyRoads,
      destinations: cargoDests.length > 0 ? cargoDests : anyRoads,
    };
  }
  if (role === 'police') {
    return {
      origins: policeStations.length > 0 ? policeStations : anyRoads,
      destinations: anyRoads,
    };
  }
  return {
    origins: resRoads.length > 0 ? resRoads : anyRoads,
    destinations: workRoads.length > 0 ? workRoads : anyRoads,
  };
}

export function spawnPurposefulVehicle(
  id: string,
  role: VehicleRole,
  tiles: TileData[],
  navCache: UrbanNavigationCache,
  seedHint: number,
): RoadVehicleSim | null {
  const { origins, destinations } = pickVehicleEndpointTiles(tiles, role);
  if (origins.length === 0 || destinations.length === 0) return null;

  for (let attempt = 0; attempt < 6; attempt++) {
    const oKey = origins[(seedHint + attempt * 5) % origins.length];
    const dKey = destinations[(seedHint * 3 + attempt * 7 + 1) % destinations.length];
    if (oKey === dKey) continue;

    const route = navCache.getRoadPath(oKey, dKey);
    if (!route.found || route.points.length < 2) continue;

    const p0 = route.points[0];
    const p1 = route.points[1];
    const yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);

    let color = COMMUTER_COLORS[seedHint % COMMUTER_COLORS.length];
    let maxSpeed: number = WORLD_SCALE.vehicleSpeedsTile.commuterMax;
    if (role === 'cargo') {
      color = CARGO_COLORS[seedHint % CARGO_COLORS.length];
      maxSpeed = WORLD_SCALE.vehicleSpeedsTile.cargoMax;
    } else if (role === 'police') {
      color = 0x1e293b;
      maxSpeed = WORLD_SCALE.vehicleSpeedsTile.policeMax;
    } else if (role === 'ambulance') {
      color = 0xf8fafc;
      maxSpeed = WORLD_SCALE.vehicleSpeedsTile.emergencyMax;
    } else if (role === 'fire') {
      color = 0xdc2626;
      maxSpeed = WORLD_SCALE.vehicleSpeedsTile.emergencyMax;
    }

    return {
      id,
      role,
      color,
      x: p0.x,
      z: p0.z,
      prevX: p0.x,
      prevZ: p0.z,
      yaw,
      prevYaw: yaw,
      speed: 0.25,
      maxSpeed,
      originTileKey: oKey,
      destTileKey: dKey,
      path: route.points,
      pathIndex: 1,
      waitingAtSignal: false,
      waitingForCrosswalk: false,
      braking: false,
      stoppedTime: 0,
    };
  }
  return null;
}

export function dispatchEmergencyIfNeeded(
  tiles: TileData[],
  vehicles: RoadVehicleSim[],
  dispatches: EmergencyDispatch[],
  navCache: UrbanNavigationCache,
): void {
  if (dispatches.length >= 2) return;

  // Check for real city incidents: conflict/fire risk OR low-health neighborhoods
  const conflictTile = tiles.find((t) => t.conflict !== null);
  const sickTile = tiles.find((t) => t.building && t.healthCoverage < 35);

  const tryCreate = (
    kind: 'ambulance' | 'fire' | 'police',
    stationTypes: string[],
    targetTile: TileData | undefined,
    desc: string,
  ) => {
    if (!targetTile) return;
    const station = tiles.find((t) => t.building && stationTypes.includes(t.building.type));
    if (!station) return;
    const stAccess = computeBuildingAccess(tiles, station);
    const tgAccess = computeBuildingAccess(tiles, targetTile);
    const stKey = stAccess.adjacentRoadTile ? tileKey(stAccess.adjacentRoadTile.x, stAccess.adjacentRoadTile.z) : null;
    const tgKey = tgAccess.adjacentRoadTile ? tileKey(tgAccess.adjacentRoadTile.x, tgAccess.adjacentRoadTile.z) : null;
    if (!stKey || !tgKey || stKey === tgKey) return;
    if (dispatches.some((d) => d.kind === kind)) return;

    const route = navCache.getRoadPath(stKey, tgKey);
    if (!route.found || route.points.length < 2) return;

    const vehicleId = `emg_${kind}_${Date.now().toString(36).slice(-4)}`;
    const p0 = route.points[0];
    const p1 = route.points[1];
    const yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    vehicles.push({
      id: vehicleId,
      role: kind,
      color: kind === 'fire' ? 0xdc2626 : kind === 'ambulance' ? 0xf8fafc : 0x1e293b,
      x: p0.x,
      z: p0.z,
      prevX: p0.x,
      prevZ: p0.z,
      yaw,
      prevYaw: yaw,
      speed: 0.45,
      maxSpeed: WORLD_SCALE.vehicleSpeedsTile.emergencyMax,
      originTileKey: stKey,
      destTileKey: tgKey,
      path: route.points,
      pathIndex: 1,
      waitingAtSignal: false,
      waitingForCrosswalk: false,
      braking: false,
      stoppedTime: 0,
      incidentTileKey: tgKey,
      returningToBase: false,
    });

    dispatches.push({
      id: `disp_${vehicleId}`,
      kind,
      stationTileKey: stKey,
      targetTileKey: tgKey,
      vehicleId,
      status: 'en_route',
      timer: 0,
      description: desc,
    });
  };

  if (conflictTile) {
    tryCreate('police', ['delegacia'], conflictTile, 'Viatura em atendimento a ocorrência urbana.');
    tryCreate('fire', ['bombeiros'], conflictTile, 'Caminhão dos bombeiros em deslocamento preventivo.');
  }
  if (sickTile) {
    tryCreate('ambulance', ['hospital', 'posto_saude'], sickTile, 'Ambulância em atendimento domiciliar.');
  }
}
