import { GRID_SIZE, PathPoint, TileData } from '../../types/game';
import {
  CARDINAL_DIRS,
  SW_OFF,
  computeBuildingAccess,
  isBuildingSolidObstacle,
  isWaterObstacle,
  tileAt,
  tileKey,
} from './obstacleSystem';
import {
  UrbanWorldRegistry,
  buildUrbanWorldRegistry,
  hasLineOfSight,
  isCircleBlocked,
} from './worldRegistry';

export interface PedestrianEdge {
  to: string;
  cost: number;
  isCrosswalk: boolean;
}

export interface PedestrianNode {
  id: string;
  x: number;
  z: number;
  tileX: number;
  tileZ: number;
  kind: 'sidewalk' | 'lot' | 'entrance' | 'plaza';
  buildingId?: string;
  edges: PedestrianEdge[];
}

export interface PedestrianGraph {
  nodes: Map<string, PedestrianNode>;
  buildingEntranceNode: Map<string, string>;
  tileNodes: Map<string, string[]>;
  crosswalkSegments: Array<{ ax: number; az: number; bx: number; bz: number; tileX: number; tileZ: number }>;
}

function addNode(graph: PedestrianGraph, node: PedestrianNode): PedestrianNode {
  const existing = graph.nodes.get(node.id);
  if (existing) return existing;
  graph.nodes.set(node.id, node);
  const tk = tileKey(node.tileX, node.tileZ);
  const list = graph.tileNodes.get(tk) ?? [];
  list.push(node.id);
  graph.tileNodes.set(tk, list);
  return node;
}

function connectNodes(
  graph: PedestrianGraph,
  aId: string,
  bId: string,
  costMultiplier = 1.0,
  isCrosswalk = false,
  tiles?: TileData[],
  registry?: UrbanWorldRegistry,
  allowedBuildingId?: string,
): void {
  const a = graph.nodes.get(aId);
  const b = graph.nodes.get(bId);
  if (!a || !b || aId === bId) return;

  // Validate non-crosswalk edges physically against UrbanWorldRegistry so edges never cut corners/walls/fountains
  if (!isCrosswalk && tiles && registry) {
    const clear = hasLineOfSight(registry, tiles, a.x, a.z, b.x, b.z, 0.045, {
      allowedBuildingId,
    });
    if (!clear) return;
  }

  // Validate crosswalk segments against poles/signals/buildings (never clip into furniture/walls)
  if (isCrosswalk && tiles && registry) {
    const clear = hasLineOfSight(registry, tiles, a.x, a.z, b.x, b.z, 0.036, {
      allowedBuildingId,
    });
    if (!clear) return;
  }

  const dist = Math.hypot(a.x - b.x, a.z - b.z) * costMultiplier;
  if (!a.edges.some((e) => e.to === bId)) {
    a.edges.push({ to: bId, cost: dist, isCrosswalk });
  }
  if (!b.edges.some((e) => e.to === aId)) {
    b.edges.push({ to: aId, cost: dist, isCrosswalk });
  }
}

/**
 * Builds an urban pedestrian graph derived from rendered sidewalks, crosswalks,
 * plaza walkways around fountains/benches, and front entrances.
 * Every edge (including crosswalks) is validated against UrbanWorldRegistry via hasLineOfSight.
 */
export function buildPedestrianGraph(
  tiles: TileData[],
  providedRegistry?: UrbanWorldRegistry,
): PedestrianGraph {
  const registry = providedRegistry ?? buildUrbanWorldRegistry(tiles);

  const graph: PedestrianGraph = {
    nodes: new Map(),
    buildingEntranceNode: new Map(),
    tileNodes: new Map(),
    crosswalkSegments: [],
  };

  const tryAddCrosswalk = (tileX: number, tileZ: number, nAId: string, nBId: string) => {
    const a = graph.nodes.get(nAId);
    const b = graph.nodes.get(nBId);
    if (!a || !b) return;
    if (!hasLineOfSight(registry, tiles, a.x, a.z, b.x, b.z, 0.036)) return;
    connectNodes(graph, nAId, nBId, 1.7, true, tiles, registry);
    if (a.edges.some((e) => e.to === nBId)) {
      graph.crosswalkSegments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, tileX, tileZ });
    }
  };

  // 1. Road sidewalk corner nodes & intra-tile sidewalk edges
  for (const tile of tiles) {
    if (tile.road === 'none') continue;
    const { x, z } = tile;
    const nw = `sw:${x},${z}:nw`;
    const ne = `sw:${x},${z}:ne`;
    const sw = `sw:${x},${z}:sw`;
    const se = `sw:${x},${z}:se`;

    addNode(graph, { id: nw, x: x - SW_OFF, z: z - SW_OFF, tileX: x, tileZ: z, kind: 'sidewalk', edges: [] });
    addNode(graph, { id: ne, x: x + SW_OFF, z: z - SW_OFF, tileX: x, tileZ: z, kind: 'sidewalk', edges: [] });
    addNode(graph, { id: sw, x: x - SW_OFF, z: z + SW_OFF, tileX: x, tileZ: z, kind: 'sidewalk', edges: [] });
    addNode(graph, { id: se, x: x + SW_OFF, z: z + SW_OFF, tileX: x, tileZ: z, kind: 'sidewalk', edges: [] });

    const northRoad = tileAt(tiles, x, z - 1)?.road !== 'none';
    const southRoad = tileAt(tiles, x, z + 1)?.road !== 'none';
    const westRoad = tileAt(tiles, x - 1, z)?.road !== 'none';
    const eastRoad = tileAt(tiles, x + 1, z)?.road !== 'none';

    const roadNeighbors =
      (northRoad ? 1 : 0) + (southRoad ? 1 : 0) + (westRoad ? 1 : 0) + (eastRoad ? 1 : 0);
    const isIntersection = roadNeighbors >= 3 || (northRoad !== southRoad && westRoad !== eastRoad);

    // Sidewalks along edges WITHOUT continuing perpendicular roads
    if (!northRoad) connectNodes(graph, nw, ne, 1.0, false, tiles, registry);
    if (!southRoad) connectNodes(graph, sw, se, 1.0, false, tiles, registry);
    if (!westRoad) connectNodes(graph, nw, sw, 1.0, false, tiles, registry);
    if (!eastRoad) connectNodes(graph, ne, se, 1.0, false, tiles, registry);

    // Crosswalks across street at intersections OR straight stretches every 2 tiles (validated against poles/furniture)
    if (northRoad || isIntersection || (!northRoad && !southRoad && (x + z) % 2 === 0)) {
      tryAddCrosswalk(x, z, nw, ne);
    }
    if (southRoad || isIntersection) {
      tryAddCrosswalk(x, z, sw, se);
    }
    if (westRoad || isIntersection || (!westRoad && !eastRoad && (x + z) % 2 === 0)) {
      tryAddCrosswalk(x, z, nw, sw);
    }
    if (eastRoad || isIntersection) {
      tryAddCrosswalk(x, z, ne, se);
    }
  }

  // 2. Connect adjacent road tile sidewalks seamlessly across tile seams
  for (const tile of tiles) {
    if (tile.road === 'none') continue;
    const { x, z } = tile;
    const east = tileAt(tiles, x + 1, z);
    if (east && east.road !== 'none') {
      connectNodes(graph, `sw:${x},${z}:ne`, `sw:${x + 1},${z}:nw`, 1.0, false, tiles, registry);
      connectNodes(graph, `sw:${x},${z}:se`, `sw:${x + 1},${z}:sw`, 1.0, false, tiles, registry);
    }
    const south = tileAt(tiles, x, z + 1);
    if (south && south.road !== 'none') {
      connectNodes(graph, `sw:${x},${z}:sw`, `sw:${x},${z + 1}:nw`, 1.0, false, tiles, registry);
      connectNodes(graph, `sw:${x},${z}:se`, `sw:${x},${z + 1}:ne`, 1.0, false, tiles, registry);
    }
  }

  // 3. Plaza / Park walkable path rings + public empty grass lots (never private fenced yards)
  for (const tile of tiles) {
    if (tile.road !== 'none') continue;
    if (isWaterObstacle(tile)) continue;
    if (isBuildingSolidObstacle(tile)) continue;

    if (tile.building?.type === 'praca' || tile.building?.type === 'parque') {
      // Create 4 walkable plaza ring nodes circling center fountain/lake & connecting to benches
      const ring = 0.21;
      const pN = `plz:${tile.x},${tile.z}:n`;
      const pS = `plz:${tile.x},${tile.z}:s`;
      const pW = `plz:${tile.x},${tile.z}:w`;
      const pE = `plz:${tile.x},${tile.z}:e`;
      const ringCoords: Array<[string, number, number]> = [
        [pN, tile.x, tile.z - ring],
        [pS, tile.x, tile.z + ring],
        [pW, tile.x - ring, tile.z],
        [pE, tile.x + ring, tile.z],
      ];
      const activeRing: string[] = [];
      for (const [id, rx, rz] of ringCoords) {
        if (!isCircleBlocked(registry, tiles, rx, rz, 0.045).blocked) {
          addNode(graph, {
            id,
            x: rx,
            z: rz,
            tileX: tile.x,
            tileZ: tile.z,
            kind: 'plaza',
            buildingId: tile.building.id,
            edges: [],
          });
          activeRing.push(id);
        }
      }
      // Connect adjacent ring corners around obstacle center
      const pairs = [
        [pN, pW],
        [pN, pE],
        [pS, pW],
        [pS, pE],
      ];
      for (const [a, b] of pairs) {
        connectNodes(graph, a, b, 1.0, false, tiles, registry);
      }
      // Also connect outer perimeter corners for smooth entry from any street side
      const cOff = 0.4;
      const cNW = `plz:${tile.x},${tile.z}:cnw`;
      const cNE = `plz:${tile.x},${tile.z}:cne`;
      const cSW = `plz:${tile.x},${tile.z}:csw`;
      const cSE = `plz:${tile.x},${tile.z}:cse`;
      for (const [id, cx, cz, nearA, nearB] of [
        [cNW, tile.x - cOff, tile.z - cOff, pN, pW],
        [cNE, tile.x + cOff, tile.z - cOff, pN, pE],
        [cSW, tile.x - cOff, tile.z + cOff, pS, pW],
        [cSE, tile.x + cOff, tile.z + cOff, pS, pE],
      ] as const) {
        if (!isCircleBlocked(registry, tiles, cx, cz, 0.045).blocked) {
          addNode(graph, {
            id,
            x: cx,
            z: cz,
            tileX: tile.x,
            tileZ: tile.z,
            kind: 'plaza',
            buildingId: tile.building.id,
            edges: [],
          });
          connectNodes(graph, id, nearA, 1.05, false, tiles, registry);
          connectNodes(graph, id, nearB, 1.05, false, tiles, registry);
        }
      }
      continue;
    }

    // Empty lots: keep walkable only if unblocked (public parkway / open terrain), with higher cost than sidewalks
    const lotId = `lot:${tile.x},${tile.z}`;
    addNode(graph, {
      id: lotId,
      x: tile.x,
      z: tile.z,
      tileX: tile.x,
      tileZ: tile.z,
      kind: 'lot',
      edges: [],
    });
  }

  // Connect plazas and open lots to adjacent sidewalks & walkable neighbors (strictly LOS-validated!)
  for (const tile of tiles) {
    if (tile.road !== 'none') continue;
    const isPlaza = tile.building?.type === 'praca' || tile.building?.type === 'parque';
    const lotId = `lot:${tile.x},${tile.z}`;
    if (!isPlaza && !graph.nodes.has(lotId)) continue;

    for (const dir of CARDINAL_DIRS) {
      const nb = tileAt(tiles, tile.x + dir.dx, tile.z + dir.dz);
      if (!nb) continue;

      if (isPlaza) {
        const pId =
          dir.dz === -1
            ? `plz:${tile.x},${tile.z}:n`
            : dir.dz === 1
            ? `plz:${tile.x},${tile.z}:s`
            : dir.dx === -1
            ? `plz:${tile.x},${tile.z}:w`
            : `plz:${tile.x},${tile.z}:e`;
        if (nb.road !== 'none') {
          const roadKey = `sw:${nb.x},${nb.z}`;
          const corners =
            dir.dx === 1
              ? [`${roadKey}:nw`, `${roadKey}:sw`]
              : dir.dx === -1
              ? [`${roadKey}:ne`, `${roadKey}:se`]
              : dir.dz === 1
              ? [`${roadKey}:nw`, `${roadKey}:ne`]
              : [`${roadKey}:sw`, `${roadKey}:se`];
          for (const c of corners) {
            connectNodes(graph, pId, c, 1.05, false, tiles, registry);
          }
        } else {
          const nbLot = `lot:${nb.x},${nb.z}`;
          if (graph.nodes.has(nbLot)) {
            connectNodes(graph, pId, nbLot, 1.25, false, tiles, registry);
          }
        }
        continue;
      }

      if (nb.road !== 'none') {
        const roadKey = `sw:${nb.x},${nb.z}`;
        const corners =
          dir.dx === 1
            ? [`${roadKey}:nw`, `${roadKey}:sw`]
            : dir.dx === -1
            ? [`${roadKey}:ne`, `${roadKey}:se`]
            : dir.dz === 1
            ? [`${roadKey}:nw`, `${roadKey}:ne`]
            : [`${roadKey}:sw`, `${roadKey}:se`];
        for (const c of corners) {
          connectNodes(graph, lotId, c, 1.45, false, tiles, registry);
        }
      } else {
        const nbLot = `lot:${nb.x},${nb.z}`;
        if (graph.nodes.has(nbLot)) {
          connectNodes(graph, lotId, nbLot, 1.85, false, tiles, registry);
        }
      }
    }
  }

  // 4. Dedicated front entrance nodes for every building
  for (const tile of tiles) {
    if (!tile.building) continue;
    const access = computeBuildingAccess(tiles, tile);
    const entId = `ent:${tile.building.id}`;
    addNode(graph, {
      id: entId,
      x: access.entrancePoint.x,
      z: access.entrancePoint.z,
      tileX: tile.x,
      tileZ: tile.z,
      kind: 'entrance',
      buildingId: tile.building.id,
      edges: [],
    });
    graph.buildingEntranceNode.set(tile.building.id, entId);

    // Connect entrance to adjacent road sidewalks (strongly preferred)
    if (access.adjacentRoadTile) {
      const rx = access.adjacentRoadTile.x;
      const rz = access.adjacentRoadTile.z;
      const dx = rx - tile.x;
      const dz = rz - tile.z;
      const base = `sw:${rx},${rz}`;
      const corners =
        dx === 1
          ? [`${base}:nw`, `${base}:sw`]
          : dx === -1
          ? [`${base}:ne`, `${base}:se`]
          : dz === 1
          ? [`${base}:nw`, `${base}:ne`]
          : [`${base}:sw`, `${base}:se`];
      for (const c of corners) {
        connectNodes(graph, entId, c, 1.0, false, tiles, registry, tile.building.id);
      }
    }

    // For parks/plazas, connect entrance to internal plaza walkway nodes
    for (const suffix of ['n', 's', 'w', 'e', 'cnw', 'cne', 'csw', 'cse']) {
      const pNode = `plz:${tile.x},${tile.z}:${suffix}`;
      if (graph.nodes.has(pNode)) {
        connectNodes(graph, entId, pNode, 1.0, false, tiles, registry, tile.building.id);
      }
    }

    // Fallback connection if building has no road yet: connect to adjacent open walkable lot
    if (!access.adjacentRoadTile) {
      for (const dir of CARDINAL_DIRS) {
        const nbLot = `lot:${tile.x + dir.dx},${tile.z + dir.dz}`;
        if (graph.nodes.has(nbLot)) {
          connectNodes(graph, entId, nbLot, 1.35, false, tiles, registry, tile.building.id);
        }
      }
    }
  }

  return graph;
}

export function findNearestPedestrianNode(
  graph: PedestrianGraph,
  x: number,
  z: number,
  maxRadius = 3,
  tiles?: TileData[],
  registry?: UrbanWorldRegistry,
  allowedBuildingId?: string | null,
): PedestrianNode | null {
  const cx = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(x)));
  const cz = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(z)));

  let bestClear: PedestrianNode | null = null;
  let bestClearDist = Infinity;
  let bestAny: PedestrianNode | null = null;
  let bestAnyDist = Infinity;

  for (let r = 0; r <= maxRadius; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const list = graph.tileNodes.get(tileKey(cx + dx, cz + dz));
        if (!list) continue;
        for (const nid of list) {
          const node = graph.nodes.get(nid);
          if (!node || node.edges.length === 0) continue;
          const d = Math.hypot(node.x - x, node.z - z);
          if (d < bestAnyDist) {
            bestAnyDist = d;
            bestAny = node;
          }
          if (tiles && registry) {
            if (d < bestClearDist && hasLineOfSight(registry, tiles, x, z, node.x, node.z, 0.045, { allowedBuildingId })) {
              bestClearDist = d;
              bestClear = node;
            }
          }
        }
      }
    }
    if (bestClear) return bestClear;
    if (!registry && bestAny) return bestAny;
  }
  return bestClear ?? bestAny;
}

export function isCrosswalkPoint(graph: PedestrianGraph, point: PathPoint): boolean {
  for (const cw of graph.crosswalkSegments) {
    const midX = (cw.ax + cw.bx) * 0.5;
    const midZ = (cw.az + cw.bz) * 0.5;
    if (Math.hypot(point.x - midX, point.z - midZ) < 0.48) return true;
  }
  return false;
}
