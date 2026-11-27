import { TileData } from '../../types/game';
import { WORLD_SCALE } from '../worldScale';
import { CARDINAL_DIRS, tileAt, tileKey } from './obstacleSystem';

export interface RoadNode {
  id: string;
  x: number;
  z: number;
  roadType: 'rua' | 'avenida';
  speedLimit: number; // tiles/sec
  isIntersection: boolean;
  isSignalized: boolean;
  neighbors: string[];
}

export interface RoadGraph {
  nodes: Map<string, RoadNode>;
  signalCandidates: Array<{ tileKey: string; x: number; z: number }>;
  allRoadTileKeys: string[];
}

/**
 * Builds the vehicular road network graph from all road tiles ('rua' & 'avenida').
 * Identifies intersections & signalized crossings cleanly.
 */
export function buildRoadGraph(tiles: TileData[]): RoadGraph {
  const nodes = new Map<string, RoadNode>();
  const signalCandidates: Array<{ tileKey: string; x: number; z: number }> = [];
  const allRoadTileKeys: string[] = [];

  for (const tile of tiles) {
    if (tile.road === 'none') continue;
    const key = tileKey(tile.x, tile.z);
    allRoadTileKeys.push(key);

    const neighbors: string[] = [];
    for (const dir of CARDINAL_DIRS) {
      const nb = tileAt(tiles, tile.x + dir.dx, tile.z + dir.dz);
      if (nb && nb.road !== 'none') {
        neighbors.push(tileKey(nb.x, nb.z));
      }
    }

    const north = tileAt(tiles, tile.x, tile.z - 1)?.road !== 'none';
    const south = tileAt(tiles, tile.x, tile.z + 1)?.road !== 'none';
    const east = tileAt(tiles, tile.x + 1, tile.z)?.road !== 'none';
    const west = tileAt(tiles, tile.x - 1, tile.z)?.road !== 'none';

    const hasNS = north || south;
    const hasEW = east || west;
    const isIntersection = neighbors.length >= 3 || (hasNS && hasEW && neighbors.length >= 2);
    const isSignalized =
      neighbors.length >= 3 &&
      (tile.road === 'avenida' ||
        neighbors.length === 4 ||
        (tile.x % 2 === 0 && tile.z % 2 === 0));

    if (isSignalized) {
      signalCandidates.push({ tileKey: key, x: tile.x, z: tile.z });
    }

    nodes.set(key, {
      id: key,
      x: tile.x,
      z: tile.z,
      roadType: tile.road,
      speedLimit:
        tile.road === 'avenida'
          ? WORLD_SCALE.vehicleSpeedsTile.avenidaLimit
          : WORLD_SCALE.vehicleSpeedsTile.ruaLimit,
      isIntersection,
      isSignalized,
      neighbors,
    });
  }

  return {
    nodes,
    signalCandidates,
    allRoadTileKeys,
  };
}
