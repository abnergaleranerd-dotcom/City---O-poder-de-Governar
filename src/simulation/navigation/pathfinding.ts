import { PathPoint } from '../../types/game';
import { PedestrianGraph } from './pedestrianGraph';
import { RoadGraph } from './roadGraph';

export interface PathResult {
  found: boolean;
  points: PathPoint[];
  nodeIds: string[];
  totalCost: number;
}

interface HeapItem {
  id: string;
  f: number;
}

class MinHeap {
  private items: HeapItem[] = [];

  public get size(): number {
    return this.items.length;
  }

  public push(item: HeapItem): void {
    this.items.push(item);
    let idx = this.items.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.items[parent].f <= this.items[idx].f) break;
      const tmp = this.items[parent];
      this.items[parent] = this.items[idx];
      this.items[idx] = tmp;
      idx = parent;
    }
  }

  public pop(): HeapItem | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let idx = 0;
      const len = this.items.length;
      while (true) {
        const left = idx * 2 + 1;
        const right = idx * 2 + 2;
        let smallest = idx;
        if (left < len && this.items[left].f < this.items[smallest].f) smallest = left;
        if (right < len && this.items[right].f < this.items[smallest].f) smallest = right;
        if (smallest === idx) break;
        const tmp = this.items[idx];
        this.items[idx] = this.items[smallest];
        this.items[smallest] = tmp;
        idx = smallest;
      }
    }
    return top;
  }
}

export function findPedestrianPath(
  graph: PedestrianGraph,
  startId: string,
  goalId: string,
  maxIterations = 2400,
): PathResult {
  const start = graph.nodes.get(startId);
  const goal = graph.nodes.get(goalId);
  if (!start || !goal) {
    return { found: false, points: [], nodeIds: [], totalCost: Infinity };
  }
  if (startId === goalId) {
    return {
      found: true,
      points: [{ x: start.x, z: start.z }],
      nodeIds: [startId],
      totalCost: 0,
    };
  }

  const open = new MinHeap();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const closed = new Set<string>();

  gScore.set(startId, 0);
  open.push({ id: startId, f: Math.hypot(goal.x - start.x, goal.z - start.z) });

  let iterations = 0;
  while (open.size > 0 && iterations < maxIterations) {
    iterations++;
    const current = open.pop()!;
    if (current.id === goalId) {
      const nodeIds: string[] = [];
      let cur: string | undefined = goalId;
      while (cur) {
        nodeIds.push(cur);
        cur = cameFrom.get(cur);
      }
      nodeIds.reverse();
      const points = nodeIds.map((nid) => {
        const n = graph.nodes.get(nid)!;
        return { x: n.x, z: n.z };
      });
      return {
        found: true,
        points,
        nodeIds,
        totalCost: gScore.get(goalId) ?? 0,
      };
    }

    if (closed.has(current.id)) continue;
    closed.add(current.id);

    const node = graph.nodes.get(current.id);
    if (!node) continue;
    const baseG = gScore.get(current.id) ?? Infinity;

    for (const edge of node.edges) {
      if (closed.has(edge.to)) continue;
      const nextNode = graph.nodes.get(edge.to);
      if (!nextNode) continue;

      const tentativeG = baseG + edge.cost;
      if (tentativeG < (gScore.get(edge.to) ?? Infinity)) {
        cameFrom.set(edge.to, current.id);
        gScore.set(edge.to, tentativeG);
        const h = Math.hypot(goal.x - nextNode.x, goal.z - nextNode.z);
        open.push({ id: edge.to, f: tentativeG + h });
      }
    }
  }

  return { found: false, points: [], nodeIds: [], totalCost: Infinity };
}

export function findRoadPath(
  graph: RoadGraph,
  startKey: string,
  goalKey: string,
  maxIterations = 1200,
): PathResult {
  const start = graph.nodes.get(startKey);
  const goal = graph.nodes.get(goalKey);
  if (!start || !goal) {
    return { found: false, points: [], nodeIds: [], totalCost: Infinity };
  }
  if (startKey === goalKey) {
    return {
      found: true,
      points: [{ x: start.x, z: start.z }],
      nodeIds: [startKey],
      totalCost: 0,
    };
  }

  const open = new MinHeap();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const closed = new Set<string>();

  gScore.set(startKey, 0);
  open.push({ id: startKey, f: Math.abs(goal.x - start.x) + Math.abs(goal.z - start.z) });

  let iterations = 0;
  while (open.size > 0 && iterations < maxIterations) {
    iterations++;
    const current = open.pop()!;
    if (current.id === goalKey) {
      const nodeIds: string[] = [];
      let cur: string | undefined = goalKey;
      while (cur) {
        nodeIds.push(cur);
        cur = cameFrom.get(cur);
      }
      nodeIds.reverse();
      const points = nodeIds.map((nid) => {
        const n = graph.nodes.get(nid)!;
        return { x: n.x, z: n.z };
      });
      return {
        found: true,
        points,
        nodeIds,
        totalCost: gScore.get(goalKey) ?? 0,
      };
    }

    if (closed.has(current.id)) continue;
    closed.add(current.id);

    const node = graph.nodes.get(current.id);
    if (!node) continue;
    const baseG = gScore.get(current.id) ?? Infinity;

    for (const nbKey of node.neighbors) {
      if (closed.has(nbKey)) continue;
      const nb = graph.nodes.get(nbKey);
      if (!nb) continue;
      // Prefer avenues over local streets slightly
      const stepCost = nb.roadType === 'avenida' ? 0.82 : 1.0;
      const tentativeG = baseG + stepCost;
      if (tentativeG < (gScore.get(nbKey) ?? Infinity)) {
        cameFrom.set(nbKey, current.id);
        gScore.set(nbKey, tentativeG);
        const h = (Math.abs(goal.x - nb.x) + Math.abs(goal.z - nb.z)) * 0.85;
        open.push({ id: nbKey, f: tentativeG + h });
      }
    }
  }

  return { found: false, points: [], nodeIds: [], totalCost: Infinity };
}

/**
 * String-pulling smoother that only removes intermediate waypoints when
 * the straight segment is 100% obstacle-free (no building/wall/pole clipping).
 */
export function smoothPedestrianPath(
  points: PathPoint[],
  isClear: (ax: number, az: number, bx: number, bz: number) => boolean,
): PathPoint[] {
  if (points.length <= 2) return points;
  const smoothed: PathPoint[] = [points[0]];
  let anchor = 0;

  while (anchor < points.length - 1) {
    let farthest = anchor + 1;
    // Try skipping up to 3 intermediate nodes when obstacle-free
    const limit = Math.min(points.length - 1, anchor + 4);
    for (let cand = limit; cand > anchor + 1; cand--) {
      if (isClear(points[anchor].x, points[anchor].z, points[cand].x, points[cand].z)) {
        farthest = cand;
        break;
      }
    }
    smoothed.push(points[farthest]);
    anchor = farthest;
  }

  return smoothed;
}

