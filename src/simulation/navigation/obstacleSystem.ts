import { BUILDING_CATALOG, GRID_SIZE, PathPoint, TileData } from '../../types/game';
import { WORLD_SCALE } from '../worldScale';

export const CARDINAL_DIRS = [
  { dx: 0, dz: 1, rotation: 0 }, // South (+Z)
  { dx: 1, dz: 0, rotation: 1 }, // East (+X)
  { dx: 0, dz: -1, rotation: 2 }, // North (-Z)
  { dx: -1, dz: 0, rotation: 3 }, // West (-X)
] as const;

export function tileAt(tiles: TileData[], x: number, z: number): TileData | null {
  if (x < 0 || z < 0 || x >= GRID_SIZE || z >= GRID_SIZE) return null;
  return tiles[z * GRID_SIZE + x] ?? null;
}

export function tileKey(x: number, z: number): string {
  return `${x},${z}`;
}

export function parseTileKey(key: string | null | undefined): { x: number; z: number } | null {
  if (!key) return null;
  const parts = key.split(',');
  if (parts.length !== 2) return null;
  const x = Number(parts[0]);
  const z = Number(parts[1]);
  if (!Number.isInteger(x) || !Number.isInteger(z)) return null;
  if (x < 0 || z < 0 || x >= GRID_SIZE || z >= GRID_SIZE) return null;
  return { x, z };
}

/**
 * Determines if a tile interior is physically solid / unwalkable for pedestrians.
 * Parks and plazas remain walkable across their paths; solid buildings block interiors.
 */
export function isBuildingSolidObstacle(tile: TileData | null): boolean {
  if (!tile || !tile.building) return false;
  const def = BUILDING_CATALOG[tile.building.type];
  if (!def) return true;
  if (tile.building.type === 'praca' || tile.building.type === 'parque') return false;
  return true;
}

/**
 * Water shoreline cells (outer bay edge along z === GRID_SIZE - 1 when waterfront and undeveloped)
 * cannot be walked through unless a road or plaza boardwalk exists.
 */
export function isWaterObstacle(tile: TileData | null): boolean {
  if (!tile) return true;
  if (tile.terrain === 'waterfront' && tile.z >= GRID_SIZE - 1 && tile.road === 'none' && !tile.building) {
    return true;
  }
  return false;
}

export function isPointBlockedForPedestrian(tiles: TileData[], x: number, z: number): boolean {
  const tx = Math.round(x);
  const tz = Math.round(z);
  const tile = tileAt(tiles, tx, tz);
  if (!tile) return true;
  if (isWaterObstacle(tile)) return true;
  if (isBuildingSolidObstacle(tile)) {
    // Allow brief entry/exit step right at front porch edge
    const lx = x - tx;
    const lz = z - tz;
    const distCenter = Math.hypot(lx, lz);
    if (distCenter < 0.34) return true;
  }
  return false;
}

/**
 * Computes rotation (0..3) so a building's local +Z front facade faces the nearest adjacent road.
 * Priority: Avenida > Rua, otherwise preserves fallbackRotation.
 */
export function computeFacingRoadRotation(
  tiles: TileData[],
  x: number,
  z: number,
  fallbackRotation = 0,
): number {
  let bestRot = ((fallbackRotation % 4) + 4) % 4;
  let bestScore = -1;

  for (const dir of CARDINAL_DIRS) {
    const neighbor = tileAt(tiles, x + dir.dx, z + dir.dz);
    if (!neighbor || neighbor.road === 'none') continue;
    const score = neighbor.road === 'avenida' ? 2 : 1;
    if (score > bestScore) {
      bestScore = score;
      bestRot = dir.rotation;
    }
  }

  return bestRot;
}

export const SW_OFF = WORLD_SCALE.sidewalkWalkableOffsetTile; // 0.445 tiles from road center

export interface BuildingAccessInfo {
  entrancePoint: PathPoint; // Front porch right outside gate/door
  sidewalkPoint: PathPoint; // Nearest sidewalk connection point
  adjacentRoadTile: { x: number; z: number } | null;
}

/**
 * Calculates valid pedestrian entrance & sidewalk drop-off points for any building.
 */
export function computeBuildingAccess(tiles: TileData[], tile: TileData): BuildingAccessInfo {
  const rot = tile.building ? ((tile.building.rotation % 4) + 4) % 4 : 0;
  const facing = CARDINAL_DIRS.find((d) => d.rotation === rot) ?? CARDINAL_DIRS[0];

  // Check if facing direction has a road; otherwise look for any adjacent road
  let adjRoad: { x: number; z: number } | null = null;
  const frontNeighbor = tileAt(tiles, tile.x + facing.dx, tile.z + facing.dz);
  if (frontNeighbor && frontNeighbor.road !== 'none') {
    adjRoad = { x: frontNeighbor.x, z: frontNeighbor.z };
  } else {
    for (const d of CARDINAL_DIRS) {
      const nb = tileAt(tiles, tile.x + d.dx, tile.z + d.dz);
      if (nb && nb.road !== 'none') {
        adjRoad = { x: nb.x, z: nb.z };
        break;
      }
    }
  }

  const dx = adjRoad ? adjRoad.x - tile.x : facing.dx;
  const dz = adjRoad ? adjRoad.z - tile.z : facing.dz;

  // Front porch sits right outside the front fence gate facing the street
  const entrancePoint: PathPoint = {
    x: tile.x + dx * 0.46,
    z: tile.z + dz * 0.46,
  };

  const sidewalkPoint: PathPoint = adjRoad
    ? {
        x: adjRoad.x - dx * SW_OFF,
        z: adjRoad.z - dz * SW_OFF,
      }
    : {
        x: Math.min(GRID_SIZE - 0.6, Math.max(0.6, tile.x + dx * 0.62)),
        z: Math.min(GRID_SIZE - 0.6, Math.max(0.6, tile.z + dz * 0.62)),
      };

  return {
    entrancePoint,
    sidewalkPoint,
    adjacentRoadTile: adjRoad,
  };
}
