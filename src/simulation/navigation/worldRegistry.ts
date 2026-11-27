import {
  BUILDING_CATALOG,
  BuildingTypeId,
  GRID_SIZE,
  TILE_WORLD_SIZE,
  TileData,
} from '../../types/game';
import { WORLD_SCALE, worldToTileOffset } from '../worldScale';
import {
  CARDINAL_DIRS,
  computeBuildingAccess,
  isBuildingSolidObstacle,
  isWaterObstacle,
  tileAt,
  tileKey,
} from './obstacleSystem';

export type WorldObjectKind =
  | 'building'
  | 'perimeter_wall'
  | 'tree'
  | 'bench'
  | 'fountain'
  | 'hedge'
  | 'street_lamp'
  | 'traffic_signal'
  | 'bus_shelter'
  | 'water_shore';

export type WorldObjectCategory =
  | 'architecture'
  | 'fence'
  | 'vegetation'
  | 'furniture'
  | 'infrastructure'
  | 'terrain';

export interface UrbanWorldObject {
  id: string;
  kind: WorldObjectKind;
  category: WorldObjectCategory;
  tileX: number;
  tileZ: number;
  x: number; // Tile-space center X
  z: number; // Tile-space center Z
  rotationRad: number;
  shape: 'box' | 'circle';
  halfW: number; // Tile-space half width (for 'box')
  halfD: number; // Tile-space half depth (for 'box')
  radius: number; // Tile-space radius (for 'circle' or bounding radius)
  walkable: boolean;
  buildingId?: string;
  buildingType?: BuildingTypeId;
  label?: string;
}

export type InteractionSpotKind = 'seat' | 'entrance' | 'bus_wait' | 'fountain_edge';

export interface InteractionSpot {
  id: string;
  kind: InteractionSpotKind;
  buildingId?: string;
  tileX: number;
  tileZ: number;
  x: number;
  z: number;
  approachX: number;
  approachZ: number;
  yaw: number;
  occupiedByCitizenId: string | null;
}

export interface CollisionMarker {
  x: number;
  z: number;
  reason: string;
  objectId: string;
  timestamp: number;
}

export interface DoorCorridorSpec {
  localCenterX: number;
  halfW: number;
  minLocalZ: number;
  maxLocalZ: number;
}

export interface DoorCorridorInstance {
  buildingId: string;
  tileX: number;
  tileZ: number;
  rotationRad: number;
  corridor: DoorCorridorSpec;
}

export interface UrbanWorldRegistry {
  objects: UrbanWorldObject[];
  spatialBuckets: Map<string, UrbanWorldObject[]>;
  interactionSpots: InteractionSpot[];
  spotById: Map<string, InteractionSpot>;
  spotsByBuildingId: Map<string, InteractionSpot[]>;
  doorCorridorsByBuildingId: Map<string, DoorCorridorInstance>;
  collisionHits: number;
  recentCollisions: CollisionMarker[];
}

export interface CollisionQueryOptions {
  allowedBuildingId?: string | null;
  allowedBenchBuildingId?: string | null;
  ignoreWalkable?: boolean;
}

export interface CollisionHitInfo {
  blocked: boolean;
  objectId?: string;
  kind?: WorldObjectKind;
  reason?: string;
  normalX: number;
  normalZ: number;
}

export interface SweptCapsuleResult {
  hit: boolean;
  safeX: number;
  safeZ: number;
  hitObjectId?: string;
  hitKind?: WorldObjectKind;
  reason?: string;
  normalX: number;
  normalZ: number;
}

function rotateLocalTileOffset(lx: number, lz: number, rotSteps: number): [number, number] {
  const r = ((rotSteps % 4) + 4) % 4;
  if (r === 1) return [lz, -lx]; // rotY = +90deg -> local +Z maps to +X? Let's verify Three.js Y rotation!
  if (r === 2) return [-lx, -lz];
  if (r === 3) return [-lz, lx];
  return [lx, lz];
}

/**
 * Matches Three.js `group.rotation.y = rot * (Math.PI / 2)` right-handed coordinates:
 * worldX = localX * cos(a) + localZ * sin(a)
 * worldZ = -localX * sin(a) + localZ * cos(a)
 */
function rotateLocalOffsetRad(lx: number, lz: number, rad: number): [number, number] {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [lx * c + lz * s, -lx * s + lz * c];
}

function addObjectToBuckets(registry: UrbanWorldRegistry, obj: UrbanWorldObject): void {
  registry.objects.push(obj);
  const extent = obj.shape === 'circle' ? obj.radius : Math.hypot(obj.halfW, obj.halfD);
  const minTx = Math.max(0, Math.floor(obj.x - extent - 0.5));
  const maxTx = Math.min(GRID_SIZE - 1, Math.ceil(obj.x + extent + 0.5));
  const minTz = Math.max(0, Math.floor(obj.z - extent - 0.5));
  const maxTz = Math.min(GRID_SIZE - 1, Math.ceil(obj.z + extent + 0.5));

  for (let tz = minTz; tz <= maxTz; tz++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      const k = tileKey(tx, tz);
      const bucket = registry.spatialBuckets.get(k);
      if (bucket) {
        bucket.push(obj);
      } else {
        registry.spatialBuckets.set(k, [obj]);
      }
    }
  }
}

function addInteractionSpot(registry: UrbanWorldRegistry, spot: InteractionSpot): void {
  registry.interactionSpots.push(spot);
  registry.spotById.set(spot.id, spot);
  if (spot.buildingId) {
    const list = registry.spotsByBuildingId.get(spot.buildingId) ?? [];
    list.push(spot);
    registry.spotsByBuildingId.set(spot.buildingId, list);
  }
}

interface BuildingColliderSpec {
  // Main structural body in local building space (world units converted to tile offsets)
  bodyCenterX: number;
  bodyCenterZ: number;
  bodyHalfW: number;
  bodyHalfD: number;
  doorLocalX?: number;
  doorHalfW?: number;
  hasPerimeterFence?: boolean;
  fenceHalfSpan?: number;
}

function getBuildingColliderSpec(type: BuildingTypeId): BuildingColliderSpec {
  switch (type) {
    case 'casa_popular':
      return {
        bodyCenterX: 0,
        bodyCenterZ: -0.04,
        bodyHalfW: 0.28,
        bodyHalfD: 0.25,
        doorLocalX: 0,
        doorHalfW: 0.14,
        hasPerimeterFence: true,
        fenceHalfSpan: 0.405,
      };
    case 'casa_media':
      return {
        bodyCenterX: 0.04,
        bodyCenterZ: -0.02,
        bodyHalfW: 0.36,
        bodyHalfD: 0.28,
        doorLocalX: 0,
        doorHalfW: 0.14,
        hasPerimeterFence: true,
        fenceHalfSpan: 0.435,
      };
    case 'condominio':
      return {
        bodyCenterX: 0,
        bodyCenterZ: -0.06,
        bodyHalfW: 0.39,
        bodyHalfD: 0.31,
        doorLocalX: 0,
        doorHalfW: 0.14,
        hasPerimeterFence: true,
        fenceHalfSpan: 0.45,
      };
    case 'predio_residencial':
      return {
        bodyCenterX: 0,
        bodyCenterZ: 0,
        bodyHalfW: 0.42,
        bodyHalfD: 0.42,
        doorLocalX: 0,
        doorHalfW: 0.16,
      };
    case 'padaria':
      return {
        bodyCenterX: 0,
        bodyCenterZ: -0.04,
        bodyHalfW: 0.34,
        bodyHalfD: 0.28,
        doorLocalX: 0.04,
        doorHalfW: 0.16,
      };
    case 'restaurante':
      return {
        bodyCenterX: 0,
        bodyCenterZ: -0.11,
        bodyHalfW: 0.35,
        bodyHalfD: 0.24,
        doorLocalX: 0,
        doorHalfW: 0.15,
      };
    case 'mercado':
    case 'loja':
      return {
        bodyCenterX: 0,
        bodyCenterZ: -0.04,
        bodyHalfW: 0.39,
        bodyHalfD: 0.33,
        doorLocalX: 0,
        doorHalfW: 0.16,
      };
    case 'escola':
      return {
        bodyCenterX: 0,
        bodyCenterZ: -0.02,
        bodyHalfW: 0.42,
        bodyHalfD: 0.39,
        doorLocalX: 0,
        doorHalfW: 0.16,
      };
    case 'prefeitura':
      return {
        bodyCenterX: 0,
        bodyCenterZ: -0.04,
        bodyHalfW: 0.39,
        bodyHalfD: 0.3,
        doorLocalX: 0,
        doorHalfW: 0.16,
      };
    case 'shopping':
    case 'estadio':
    case 'industria':
      return {
        bodyCenterX: 0,
        bodyCenterZ: 0,
        bodyHalfW: 0.45,
        bodyHalfD: 0.44,
        doorLocalX: 0,
        doorHalfW: 0.18,
      };
    case 'rede_energia':
    case 'saneamento':
      return {
        bodyCenterX: 0,
        bodyCenterZ: 0,
        bodyHalfW: 0.36,
        bodyHalfD: 0.36,
        doorLocalX: 0,
        doorHalfW: 0.13,
        hasPerimeterFence: true,
        fenceHalfSpan: 0.43,
      };
    default:
      return {
        bodyCenterX: 0,
        bodyCenterZ: 0,
        bodyHalfW: 0.38,
        bodyHalfD: 0.36,
        doorLocalX: 0,
        doorHalfW: 0.15,
      };
  }
}

export function buildUrbanWorldRegistry(tiles: TileData[]): UrbanWorldRegistry {
  const registry: UrbanWorldRegistry = {
    objects: [],
    spatialBuckets: new Map(),
    interactionSpots: [],
    spotById: new Map(),
    spotsByBuildingId: new Map(),
    doorCorridorsByBuildingId: new Map(),
    collisionHits: 0,
    recentCollisions: [],
  };

  const hasRoad = (tx: number, tz: number) => {
    const t = tileAt(tiles, tx, tz);
    return Boolean(t && t.road !== 'none');
  };

  for (const tile of tiles) {
    // 1. Coastal bay water barrier
    if (isWaterObstacle(tile)) {
      addObjectToBuckets(registry, {
        id: `water_${tile.x}_${tile.z}`,
        kind: 'water_shore',
        category: 'terrain',
        tileX: tile.x,
        tileZ: tile.z,
        x: tile.x,
        z: tile.z,
        rotationRad: 0,
        shape: 'box',
        halfW: 0.49,
        halfD: 0.49,
        radius: 0.69,
        walkable: false,
        label: 'Orla Marítima',
      });
    }

    // 2. Road street furniture matching terrainAndRoads.ts exact geometry
    if (tile.road !== 'none') {
      const isAve = tile.road === 'avenida';
      const roadW = isAve ? WORLD_SCALE.avenueAsphaltWidthU : WORLD_SCALE.streetAsphaltWidthU;
      const lampDistTile = worldToTileOffset(roadW / 2 + WORLD_SCALE.lampCurbGapU);
      const sigDistTile = worldToTileOffset(roadW / 2 + WORLD_SCALE.signalCurbGapU);
      const busDistTile = worldToTileOffset(roadW / 2 + WORLD_SCALE.busStopCurbGapU);

      const n = hasRoad(tile.x, tile.z - 1);
      const s = hasRoad(tile.x, tile.z + 1);
      const w = hasRoad(tile.x - 1, tile.z);
      const e = hasRoad(tile.x + 1, tile.z);
      const degree = (n ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0) + (e ? 1 : 0);
      const isStraightNS = (n || s) && !w && !e;
      const isStraightEW = (w || e) && !n && !s;

      if (isStraightNS || degree === 0) {
        if ((tile.x + tile.z) % 2 === 0) {
          addObjectToBuckets(registry, {
            id: `lamp_${tile.x}_${tile.z}`,
            kind: 'street_lamp',
            category: 'infrastructure',
            tileX: tile.x,
            tileZ: tile.z,
            x: tile.x + lampDistTile,
            z: tile.z,
            rotationRad: 0,
            shape: 'circle',
            halfW: 0.025,
            halfD: 0.025,
            radius: 0.025,
            walkable: false,
            label: 'Poste de Iluminação',
          });
        }
        if (isAve && ((tile.x * 3 + tile.z) % 5 === 0 || tile.busStop)) {
          const bx = tile.x - busDistTile;
          const bz = tile.z;
          addObjectToBuckets(registry, {
            id: `busstop_${tile.x}_${tile.z}`,
            kind: 'bus_shelter',
            category: 'furniture',
            tileX: tile.x,
            tileZ: tile.z,
            x: bx,
            z: bz,
            rotationRad: 0,
            shape: 'box',
            halfW: 0.032,
            halfD: 0.11,
            radius: 0.115,
            walkable: false,
            label: 'Abrigo de Ônibus',
          });
          addInteractionSpot(registry, {
            id: `spot_bus_${tile.x}_${tile.z}`,
            kind: 'bus_wait',
            tileX: tile.x,
            tileZ: tile.z,
            x: bx + 0.07,
            z: bz,
            approachX: bx + 0.09,
            approachZ: bz,
            yaw: Math.PI / 2,
            occupiedByCitizenId: null,
          });
        }
      } else if (isStraightEW) {
        if ((tile.x + tile.z) % 2 === 0) {
          addObjectToBuckets(registry, {
            id: `lamp_${tile.x}_${tile.z}`,
            kind: 'street_lamp',
            category: 'infrastructure',
            tileX: tile.x,
            tileZ: tile.z,
            x: tile.x,
            z: tile.z - lampDistTile,
            rotationRad: 0,
            shape: 'circle',
            halfW: 0.025,
            halfD: 0.025,
            radius: 0.025,
            walkable: false,
            label: 'Poste de Iluminação',
          });
        }
        if (isAve && ((tile.x + tile.z * 3) % 5 === 0 || tile.busStop)) {
          const bx = tile.x;
          const bz = tile.z + busDistTile;
          addObjectToBuckets(registry, {
            id: `busstop_${tile.x}_${tile.z}`,
            kind: 'bus_shelter',
            category: 'furniture',
            tileX: tile.x,
            tileZ: tile.z,
            x: bx,
            z: bz,
            rotationRad: 0,
            shape: 'box',
            halfW: 0.11,
            halfD: 0.032,
            radius: 0.115,
            walkable: false,
            label: 'Abrigo de Ônibus',
          });
          addInteractionSpot(registry, {
            id: `spot_bus_${tile.x}_${tile.z}`,
            kind: 'bus_wait',
            tileX: tile.x,
            tileZ: tile.z,
            x: bx,
            z: bz - 0.07,
            approachX: bx,
            approachZ: bz - 0.09,
            yaw: Math.PI,
            occupiedByCitizenId: null,
          });
        }
      } else if (degree >= 3) {
        addObjectToBuckets(registry, {
          id: `signal_${tile.x}_${tile.z}`,
          kind: 'traffic_signal',
          category: 'infrastructure',
          tileX: tile.x,
          tileZ: tile.z,
          x: tile.x + sigDistTile,
          z: tile.z + sigDistTile,
          rotationRad: 0,
          shape: 'circle',
          halfW: 0.025,
          halfD: 0.025,
          radius: 0.025,
          walkable: false,
          label: 'Semáforo',
        });
      } else if (degree === 2 && (tile.x + tile.z) % 2 === 0) {
        addObjectToBuckets(registry, {
          id: `lamp_${tile.x}_${tile.z}`,
          kind: 'street_lamp',
          category: 'infrastructure',
          tileX: tile.x,
          tileZ: tile.z,
          x: tile.x + (e ? -lampDistTile : lampDistTile),
          z: tile.z + (s ? -lampDistTile : lampDistTile),
          rotationRad: 0,
          shape: 'circle',
          halfW: 0.025,
          halfD: 0.025,
          radius: 0.025,
          walkable: false,
          label: 'Poste de Iluminação',
        });
      }
    }

    // 3. Buildings, Perimeter Walls, Trees, Benches, Fountains, and Interaction Spots
    if (!tile.building) continue;
    const b = tile.building;
    const def = BUILDING_CATALOG[b.type];
    const rotRad = ((b.rotation % 4) + 4) % 4 * (Math.PI / 2);
    const access = computeBuildingAccess(tiles, tile);

    // Register primary entrance InteractionSpot for every building
    addInteractionSpot(registry, {
      id: `spot_ent_${b.id}`,
      kind: 'entrance',
      buildingId: b.id,
      tileX: tile.x,
      tileZ: tile.z,
      x: access.entrancePoint.x,
      z: access.entrancePoint.z,
      approachX: access.sidewalkPoint.x,
      approachZ: access.sidewalkPoint.z,
      yaw: rotRad,
      occupiedByCitizenId: null,
    });

    if (b.type === 'praca') {
      // Central fountain (circle matching 0.38u diameter -> 0.095 tiles radius)
      addObjectToBuckets(registry, {
        id: `fountain_${b.id}`,
        kind: 'fountain',
        category: 'furniture',
        tileX: tile.x,
        tileZ: tile.z,
        x: tile.x,
        z: tile.z,
        rotationRad: 0,
        shape: 'circle',
        halfW: 0.095,
        halfD: 0.095,
        radius: 0.095,
        walkable: false,
        buildingId: b.id,
        buildingType: b.type,
        label: 'Chafariz da Praça',
      });

      // 4 park benches matching buildingModels.ts at local (0, ±0.5u) & (±0.5u, 0)
      // Approach stands in front of bench planks on plaza stone ring (away from backrest)
      const benchDefs = [
        { lx: 0, lz: 0.25, localRy: 0, ax: 0, az: 0.16, faceYaw: Math.PI },
        { lx: 0, lz: -0.25, localRy: Math.PI, ax: 0, az: -0.16, faceYaw: 0 },
        { lx: 0.25, lz: 0, localRy: Math.PI / 2, ax: 0.16, az: 0, faceYaw: -Math.PI / 2 },
        { lx: -0.25, lz: 0, localRy: -Math.PI / 2, ax: -0.16, az: 0, faceYaw: Math.PI / 2 },
      ];
      benchDefs.forEach((bd, idx) => {
        const [ox, oz] = rotateLocalOffsetRad(bd.lx, bd.lz, rotRad);
        const [apX, apZ] = rotateLocalOffsetRad(bd.ax, bd.az, rotRad);
        const bx = tile.x + ox;
        const bz = tile.z + oz;
        addObjectToBuckets(registry, {
          id: `bench_${b.id}_${idx}`,
          kind: 'bench',
          category: 'furniture',
          tileX: tile.x,
          tileZ: tile.z,
          x: bx,
          z: bz,
          rotationRad: rotRad + bd.localRy,
          shape: 'box',
          halfW: 0.065,
          halfD: 0.026,
          radius: 0.07,
          walkable: false,
          buildingId: b.id,
          buildingType: b.type,
          label: 'Banco da Praça',
        });
        addInteractionSpot(registry, {
          id: `spot_seat_${b.id}_${idx}`,
          kind: 'seat',
          buildingId: b.id,
          tileX: tile.x,
          tileZ: tile.z,
          x: bx,
          z: bz,
          approachX: tile.x + apX,
          approachZ: tile.z + apZ,
          yaw: rotRad + bd.faceYaw,
          occupiedByCitizenId: null,
        });
      });

      // Plaza flowerbeds (matching buildingModels.ts lines 1038-1039)
      for (const [flx, flz] of [
        [-0.275, 0.12],
        [0.275, -0.12],
      ]) {
        const [ox, oz] = rotateLocalOffsetRad(flx, flz, rotRad);
        addObjectToBuckets(registry, {
          id: `hedge_${b.id}_${flx}_${flz}`,
          kind: 'hedge',
          category: 'vegetation',
          tileX: tile.x,
          tileZ: tile.z,
          x: tile.x + ox,
          z: tile.z + oz,
          rotationRad: rotRad,
          shape: 'box',
          halfW: 0.055,
          halfD: 0.032,
          radius: 0.064,
          walkable: false,
          buildingId: b.id,
          buildingType: b.type,
          label: 'Canteiro da Praça',
        });
      }

      // 4 plaza corner trees matching buildingModels.ts at (±0.6u, ±0.6u) -> (±0.30, ±0.30)
      for (const [tlx, tlz] of [
        [-0.3, -0.3],
        [0.3, -0.3],
        [-0.3, 0.3],
        [0.3, 0.3],
      ]) {
        const [ox, oz] = rotateLocalOffsetRad(tlx, tlz, rotRad);
        addObjectToBuckets(registry, {
          id: `tree_${b.id}_${tlx}_${tlz}`,
          kind: 'tree',
          category: 'vegetation',
          tileX: tile.x,
          tileZ: tile.z,
          x: tile.x + ox,
          z: tile.z + oz,
          rotationRad: 0,
          shape: 'circle',
          halfW: 0.045,
          halfD: 0.045,
          radius: 0.045,
          walkable: false,
          buildingId: b.id,
          buildingType: b.type,
          label: 'Árvore Urbana',
        });
      }
      continue;
    }

    if (b.type === 'parque') {
      // Pond & Gazebo
      const [px, pz] = rotateLocalOffsetRad(0.15, 0.14, rotRad);
      addObjectToBuckets(registry, {
        id: `pond_${b.id}`,
        kind: 'fountain',
        category: 'terrain',
        tileX: tile.x,
        tileZ: tile.z,
        x: tile.x + px,
        z: tile.z + pz,
        rotationRad: 0,
        shape: 'circle',
        halfW: 0.125,
        halfD: 0.125,
        radius: 0.125,
        walkable: false,
        buildingId: b.id,
        buildingType: b.type,
        label: 'Lago do Parque',
      });
      const [gx, gz] = rotateLocalOffsetRad(-0.175, -0.125, rotRad);
      addObjectToBuckets(registry, {
        id: `gazebo_${b.id}`,
        kind: 'building',
        category: 'architecture',
        tileX: tile.x,
        tileZ: tile.z,
        x: tile.x + gx,
        z: tile.z + gz,
        rotationRad: 0,
        shape: 'circle',
        halfW: 0.088,
        halfD: 0.088,
        radius: 0.088,
        walkable: false,
        buildingId: b.id,
        buildingType: b.type,
        label: 'Coreto do Parque',
      });
      // 2 park benches with front-side approach points aligned to bench orientation
      const parkBenches = [
        { lx: 0.01, lz: 0.27, localRy: -0.35, ax: 0.045, az: 0.176, faceYaw: Math.PI - 0.35 },
        { lx: 0.26, lz: -0.09, localRy: Math.PI * 0.45, ax: 0.161, az: -0.106, faceYaw: -Math.PI * 0.55 },
      ];
      parkBenches.forEach((bd, idx) => {
        const [ox, oz] = rotateLocalOffsetRad(bd.lx, bd.lz, rotRad);
        const [apX, apZ] = rotateLocalOffsetRad(bd.ax, bd.az, rotRad);
        const bx = tile.x + ox;
        const bz = tile.z + oz;
        addObjectToBuckets(registry, {
          id: `bench_${b.id}_${idx}`,
          kind: 'bench',
          category: 'furniture',
          tileX: tile.x,
          tileZ: tile.z,
          x: bx,
          z: bz,
          rotationRad: rotRad + bd.localRy,
          shape: 'box',
          halfW: 0.065,
          halfD: 0.026,
          radius: 0.07,
          walkable: false,
          buildingId: b.id,
          buildingType: b.type,
          label: 'Banco do Parque',
        });
        addInteractionSpot(registry, {
          id: `spot_seat_${b.id}_${idx}`,
          kind: 'seat',
          buildingId: b.id,
          tileX: tile.x,
          tileZ: tile.z,
          x: bx,
          z: bz,
          approachX: tile.x + apX,
          approachZ: tile.z + apZ,
          yaw: rotRad + bd.faceYaw,
          occupiedByCitizenId: null,
        });
      });
      for (const [tlx, tlz] of [
        [-0.32, 0.24],
        [-0.09, 0.31],
        [0.31, -0.27],
        [0.09, -0.31],
        [-0.34, -0.31],
      ]) {
        const [ox, oz] = rotateLocalOffsetRad(tlx, tlz, rotRad);
        addObjectToBuckets(registry, {
          id: `tree_${b.id}_${tlx}_${tlz}`,
          kind: 'tree',
          category: 'vegetation',
          tileX: tile.x,
          tileZ: tile.z,
          x: tile.x + ox,
          z: tile.z + oz,
          rotationRad: 0,
          shape: 'circle',
          halfW: 0.042,
          halfD: 0.042,
          radius: 0.042,
          walkable: false,
          buildingId: b.id,
          buildingType: b.type,
          label: 'Árvore do Parque',
        });
      }
      continue;
    }

    if (!isBuildingSolidObstacle(tile)) continue;

    // Solid building physical body + explicit oriented front door corridor
    const spec = getBuildingColliderSpec(b.type);
    const [bcx, bcz] = rotateLocalOffsetRad(spec.bodyCenterX, spec.bodyCenterZ, rotRad);
    addObjectToBuckets(registry, {
      id: `bldg_${b.id}`,
      kind: 'building',
      category: 'architecture',
      tileX: tile.x,
      tileZ: tile.z,
      x: tile.x + bcx,
      z: tile.z + bcz,
      rotationRad: rotRad,
      shape: 'box',
      halfW: spec.bodyHalfW,
      halfD: spec.bodyHalfD,
      radius: Math.hypot(spec.bodyHalfW, spec.bodyHalfD),
      walkable: false,
      buildingId: b.id,
      buildingType: b.type,
      label: def?.name ?? b.type,
    });

    registry.doorCorridorsByBuildingId.set(b.id, {
      buildingId: b.id,
      tileX: tile.x,
      tileZ: tile.z,
      rotationRad: rotRad,
      corridor: {
        localCenterX: spec.doorLocalX ?? 0,
        halfW: spec.doorHalfW ?? 0.14,
        minLocalZ: spec.bodyCenterZ + spec.bodyHalfD - 0.14,
        maxLocalZ: 0.54,
      },
    });

    // Bakery sidewalk terrace umbrella/table collider
    if (b.type === 'padaria') {
      const [tx, tz] = rotateLocalOffsetRad(-0.22, 0.34, rotRad);
      addObjectToBuckets(registry, {
        id: `cafe_${b.id}`,
        kind: 'bench',
        category: 'furniture',
        tileX: tile.x,
        tileZ: tile.z,
        x: tile.x + tx,
        z: tile.z + tz,
        rotationRad: rotRad,
        shape: 'circle',
        halfW: 0.055,
        halfD: 0.055,
        radius: 0.055,
        walkable: false,
        buildingId: b.id,
        buildingType: b.type,
        label: 'Mesa da Padaria',
      });
    }

    // Perimeter walls & front fence segments (leaving explicit center gate opening around local x=0, z=+half)
    if (spec.hasPerimeterFence && spec.fenceHalfSpan) {
      const hs = spec.fenceHalfSpan;
      const wallThick = 0.018;
      // Back wall
      const [bwX, bwZ] = rotateLocalOffsetRad(0, -hs, rotRad);
      addObjectToBuckets(registry, {
        id: `wall_${b.id}_back`,
        kind: 'perimeter_wall',
        category: 'fence',
        tileX: tile.x,
        tileZ: tile.z,
        x: tile.x + bwX,
        z: tile.z + bwZ,
        rotationRad: rotRad,
        shape: 'box',
        halfW: hs,
        halfD: wallThick,
        radius: hs,
        walkable: false,
        buildingId: b.id,
        label: 'Muro Posterior',
      });
      // Left & Right side walls
      for (const side of [-1, 1]) {
        const [swX, swZ] = rotateLocalOffsetRad(side * hs, 0, rotRad);
        addObjectToBuckets(registry, {
          id: `wall_${b.id}_side_${side}`,
          kind: 'perimeter_wall',
          category: 'fence',
          tileX: tile.x,
          tileZ: tile.z,
          x: tile.x + swX,
          z: tile.z + swZ,
          rotationRad: rotRad,
          shape: 'box',
          halfW: wallThick,
          halfD: hs,
          radius: hs,
          walkable: false,
          buildingId: b.id,
          label: 'Muro Lateral',
        });
      }
      // Front left & right segments leaving central gate open (|x| <= 0.14)
      const segHalf = (hs - 0.14) * 0.5;
      const segCenter = 0.14 + segHalf;
      if (segHalf > 0.04) {
        for (const side of [-1, 1]) {
          const [fwX, fwZ] = rotateLocalOffsetRad(side * segCenter, hs, rotRad);
          addObjectToBuckets(registry, {
            id: `wall_${b.id}_front_${side}`,
            kind: 'perimeter_wall',
            category: 'fence',
            tileX: tile.x,
            tileZ: tile.z,
            x: tile.x + fwX,
            z: tile.z + fwZ,
            rotationRad: rotRad,
            shape: 'box',
            halfW: segHalf,
            halfD: wallThick,
            radius: segHalf,
            walkable: false,
            buildingId: b.id,
            label: 'Muro Frontal',
          });
        }
      }
    }
  }

  void CARDINAL_DIRS;
  void rotateLocalTileOffset;
  void TILE_WORLD_SIZE;
  return registry;
}

function testCircleVsObject(
  px: number,
  pz: number,
  radius: number,
  obj: UrbanWorldObject,
): { hit: boolean; normalX: number; normalZ: number } {
  if (obj.shape === 'circle') {
    const dx = px - obj.x;
    const dz = pz - obj.z;
    const minDist = radius + obj.radius;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDist * minDist) {
      const d = Math.sqrt(dSq) || 0.0001;
      return { hit: true, normalX: dx / d, normalZ: dz / d };
    }
    return { hit: false, normalX: 0, normalZ: 0 };
  }

  // Transform point into object's local frame (inverse rotation -obj.rotationRad)
  const relX = px - obj.x;
  const relZ = pz - obj.z;
  const c = Math.cos(obj.rotationRad);
  const s = Math.sin(obj.rotationRad);
  // Inverse of rotateLocalOffsetRad: lx = relX * c - relZ * s, lz = relX * s + relZ * c
  const lx = relX * c - relZ * s;
  const lz = relX * s + relZ * c;

  const clampedX = Math.max(-obj.halfW, Math.min(obj.halfW, lx));
  const clampedZ = Math.max(-obj.halfD, Math.min(obj.halfD, lz));
  const dlx = lx - clampedX;
  const dlz = lz - clampedZ;
  const dSq = dlx * dlx + dlz * dlz;

  if (dSq >= radius * radius) {
    return { hit: false, normalX: 0, normalZ: 0 };
  }

  let lnx = 0;
  let lnz = 0;
  if (dSq > 1e-8) {
    const d = Math.sqrt(dSq);
    lnx = dlx / d;
    lnz = dlz / d;
  } else {
    // Center of circle inside OBB: pick shortest exit axis
    const penX = obj.halfW - Math.abs(lx);
    const penZ = obj.halfD - Math.abs(lz);
    if (penX < penZ) {
      lnx = lx >= 0 ? 1 : -1;
    } else {
      lnz = lz >= 0 ? 1 : -1;
    }
  }

  // Rotate local normal back to tile-space
  const [nx, nz] = rotateLocalOffsetRad(lnx, lnz, obj.rotationRad);
  return { hit: true, normalX: nx, normalZ: nz };
}

export function isCircleBlocked(
  registry: UrbanWorldRegistry,
  tiles: TileData[],
  x: number,
  z: number,
  radius: number,
  opts?: CollisionQueryOptions,
): CollisionHitInfo {
  if (x < 0.08 || z < 0.08 || x > GRID_SIZE - 1.08 || z > GRID_SIZE - 1.08) {
    // Allow staying inside playable margins [0..GRID_SIZE-1] padded cleanly
    if (x < -0.35 || z < -0.35 || x > GRID_SIZE - 0.65 || z > GRID_SIZE - 0.65) {
      return {
        blocked: true,
        objectId: 'world_border',
        kind: 'water_shore',
        reason: 'Limite urbano',
        normalX: x < 0 ? 1 : x > GRID_SIZE - 1 ? -1 : 0,
        normalZ: z < 0 ? 1 : z > GRID_SIZE - 1 ? -1 : 0,
      };
    }
  }

  const cx = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(x)));
  const cz = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(z)));
  const checked = new Set<string>();

  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = cx + dx;
      const tz = cz + dz;
      if (tx < 0 || tz < 0 || tx >= GRID_SIZE || tz >= GRID_SIZE) continue;
      const bucket = registry.spatialBuckets.get(tileKey(tx, tz));
      if (!bucket) continue;

      for (let i = 0; i < bucket.length; i++) {
        const obj = bucket[i];
        if (checked.has(obj.id)) continue;
        checked.add(obj.id);
        if (obj.walkable) continue;

        if (opts?.allowedBenchBuildingId && obj.kind === 'bench' && obj.buildingId === opts.allowedBenchBuildingId) {
          continue;
        }

        if (opts?.allowedBuildingId && obj.buildingId === opts.allowedBuildingId && obj.kind === 'building') {
          const dc = registry.doorCorridorsByBuildingId.get(obj.buildingId);
          if (dc) {
            const relX = x - dc.tileX;
            const relZ = z - dc.tileZ;
            const c = Math.cos(dc.rotationRad);
            const s = Math.sin(dc.rotationRad);
            const lx = relX * c - relZ * s;
            const lz = relX * s + relZ * c;
            if (
              Math.abs(lx - dc.corridor.localCenterX) <= dc.corridor.halfW &&
              lz >= dc.corridor.minLocalZ &&
              lz <= dc.corridor.maxLocalZ
            ) {
              continue;
            }
          }
        }

        const res = testCircleVsObject(x, z, radius, obj);
        if (res.hit) {
          return {
            blocked: true,
            objectId: obj.id,
            kind: obj.kind,
            reason: obj.label ?? obj.kind,
            normalX: res.normalX,
            normalZ: res.normalZ,
          };
        }
      }
    }
  }

  void tiles;
  return { blocked: false, normalX: 0, normalZ: 0 };
}

/**
 * Continuous swept-segment capsule check between (ax, az) and (bx, bz).
 * Ensures fast speeds or small dt never tunnel through thin walls, poles, or corners.
 */
export function sweepSegmentCapsule(
  registry: UrbanWorldRegistry,
  tiles: TileData[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  radius: number,
  opts?: CollisionQueryOptions,
): SweptCapsuleResult {
  const dx = bx - ax;
  const dz = bz - az;
  const dist = Math.hypot(dx, dz);
  const stepSize = Math.max(0.018, radius * 0.45);
  const steps = Math.max(1, Math.ceil(dist / stepSize));

  let prevX = ax;
  let prevZ = az;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cx = ax + dx * t;
    const cz = az + dz * t;
    const check = isCircleBlocked(registry, tiles, cx, cz, radius, opts);
    if (check.blocked) {
      return {
        hit: true,
        safeX: prevX,
        safeZ: prevZ,
        hitObjectId: check.objectId,
        hitKind: check.kind,
        reason: check.reason,
        normalX: check.normalX,
        normalZ: check.normalZ,
      };
    }
    prevX = cx;
    prevZ = cz;
  }

  return {
    hit: false,
    safeX: bx,
    safeZ: bz,
    normalX: 0,
    normalZ: 0,
  };
}

export function hasLineOfSight(
  registry: UrbanWorldRegistry,
  tiles: TileData[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  radius = WORLD_SCALE.pedestrianRadiusTile * 0.85,
  opts?: CollisionQueryOptions,
): boolean {
  const res = sweepSegmentCapsule(registry, tiles, ax, az, bx, bz, radius, opts);
  return !res.hit;
}

export function recordCollisionEvent(
  registry: UrbanWorldRegistry,
  x: number,
  z: number,
  objectId: string,
  reason: string,
): void {
  registry.collisionHits += 1;
  registry.recentCollisions.push({
    x,
    z,
    objectId,
    reason,
    timestamp: Date.now(),
  });
  if (registry.recentCollisions.length > 48) {
    registry.recentCollisions.shift();
  }
}

export function releaseCitizenSpots(registry: UrbanWorldRegistry, citizenId: string): void {
  for (const spot of registry.interactionSpots) {
    if (spot.occupiedByCitizenId === citizenId) {
      spot.occupiedByCitizenId = null;
    }
  }
}

export function findAvailableInteractionSpot(
  registry: UrbanWorldRegistry,
  buildingId: string,
  kind: InteractionSpotKind,
  citizenId: string,
): InteractionSpot | null {
  const list = registry.spotsByBuildingId.get(buildingId);
  if (!list || list.length === 0) return null;
  for (const spot of list) {
    if (spot.kind !== kind) continue;
    if (spot.occupiedByCitizenId === null || spot.occupiedByCitizenId === citizenId) {
      return spot;
    }
  }
  return null;
}

export function reserveInteractionSpot(
  registry: UrbanWorldRegistry,
  spotId: string,
  citizenId: string,
): boolean {
  const spot = registry.spotById.get(spotId);
  if (!spot) return false;
  if (spot.occupiedByCitizenId !== null && spot.occupiedByCitizenId !== citizenId) {
    return false;
  }
  releaseCitizenSpots(registry, citizenId);
  spot.occupiedByCitizenId = citizenId;
  return true;
}

/**
 * After UrbanWorldRegistry is rebuilt on map edits, re-bind surviving citizen spot reservations
 * uniquely and clear orphaned reservations whose benches/buildings were removed.
 */
export function reconcileInteractionSpotReservations(
  registry: UrbanWorldRegistry,
  citizens: Array<{ id: string; occupiedSpotId?: string | null; benchPhase?: string | null; sittingYaw?: number }>,
): void {
  for (const spot of registry.interactionSpots) {
    spot.occupiedByCitizenId = null;
  }
  for (const c of citizens) {
    if (!c.occupiedSpotId) continue;
    const spot = registry.spotById.get(c.occupiedSpotId);
    if (spot && spot.occupiedByCitizenId === null) {
      spot.occupiedByCitizenId = c.id;
      c.sittingYaw = spot.yaw;
    } else {
      c.occupiedSpotId = null;
      c.sittingYaw = undefined;
      c.benchPhase = null;
    }
  }
}
