import { CitizenAgent, RoadVehicleSim, TileData } from '../../types/game';
import { WORLD_SCALE } from '../worldScale';
import { tileKey } from './obstacleSystem';
import { buildPedestrianGraph, PedestrianGraph } from './pedestrianGraph';
import { buildRoadGraph, RoadGraph } from './roadGraph';
import { findPedestrianPath, findRoadPath, PathResult } from './pathfinding';
import {
  buildUrbanWorldRegistry,
  reconcileInteractionSpotReservations,
  sweepSegmentCapsule,
  UrbanWorldRegistry,
} from './worldRegistry';

const MAX_CACHED_ROUTES = 1200;

/**
 * Holds compiled UrbanWorldRegistry, PedestrianGraph & RoadGraph alongside an LRU path cache.
 * Automatically rebuilds, reconciles InteractionSpots, and invalidates broken routes on grid changes.
 */
export class UrbanNavigationCache {
  public builtVersion = -1;
  public worldRegistry: UrbanWorldRegistry = {
    objects: [],
    spatialBuckets: new Map(),
    interactionSpots: [],
    spotById: new Map(),
    spotsByBuildingId: new Map(),
    doorCorridorsByBuildingId: new Map(),
    collisionHits: 0,
    recentCollisions: [],
  };
  public pedestrianGraph: PedestrianGraph = {
    nodes: new Map(),
    buildingEntranceNode: new Map(),
    tileNodes: new Map(),
    crosswalkSegments: [],
  };
  public roadGraph: RoadGraph = {
    nodes: new Map(),
    signalCandidates: [],
    allRoadTileKeys: [],
  };

  private pedRouteCache = new Map<string, PathResult>();
  private roadRouteCache = new Map<string, PathResult>();

  public ensureFresh(
    tiles: TileData[],
    version: number,
    citizens?: CitizenAgent[],
    vehicles?: RoadVehicleSim[],
  ): boolean {
    if (this.builtVersion === version && this.pedestrianGraph.nodes.size > 0) return false;
    this.worldRegistry = buildUrbanWorldRegistry(tiles);
    this.pedestrianGraph = buildPedestrianGraph(tiles, this.worldRegistry);
    this.roadGraph = buildRoadGraph(tiles);
    this.pedRouteCache.clear();
    this.roadRouteCache.clear();
    this.builtVersion = version;

    if (citizens) {
      reconcileInteractionSpotReservations(this.worldRegistry, citizens);
      this.invalidateBrokenCitizenRoutes(tiles, citizens);
    }
    if (vehicles) {
      this.invalidateBrokenVehicleRoutes(vehicles);
    }
    return true;
  }

  public invalidateBrokenCitizenRoutes(tiles: TileData[], citizens: CitizenAgent[]): void {
    const r = WORLD_SCALE.pedestrianRadiusTile * 0.85;
    for (const c of citizens) {
      if (!c.path || c.path.length === 0 || c.pathIndex === undefined || c.pathIndex >= c.path.length) {
        continue;
      }
      if (c.targetBuildingId && !this.pedestrianGraph.buildingEntranceNode.has(c.targetBuildingId)) {
        c.path = [];
        c.pathIndex = 0;
        c.targetBuildingId = null;
        c.decisionCooldown = 0;
        continue;
      }
      let prevX = c.x;
      let prevZ = c.z;
      let broken = false;
      for (let i = c.pathIndex; i < c.path.length; i++) {
        const wp = c.path[i];
        const isLast = i === c.path.length - 1;
        const swept = sweepSegmentCapsule(this.worldRegistry, tiles, prevX, prevZ, wp.x, wp.z, r, {
          allowedBuildingId: isLast ? c.targetBuildingId : null,
          allowedBenchBuildingId: isLast && c.occupiedSpotId ? c.targetBuildingId : null,
        });
        if (swept.hit) {
          broken = true;
          break;
        }
        prevX = wp.x;
        prevZ = wp.z;
      }
      if (broken) {
        c.path = [];
        c.pathIndex = 0;
        c.decisionCooldown = 0;
      }
    }
  }

  public invalidateBrokenVehicleRoutes(vehicles: RoadVehicleSim[]): void {
    for (const v of vehicles) {
      if (!v.path || v.pathIndex >= v.path.length) continue;
      for (let i = v.pathIndex; i < v.path.length; i++) {
        const wp = v.path[i];
        if (!this.roadGraph.nodes.has(tileKey(Math.round(wp.x), Math.round(wp.z)))) {
          const curKey = tileKey(Math.round(v.x), Math.round(v.z));
          const reroute =
            this.roadGraph.nodes.has(curKey) && this.roadGraph.nodes.has(v.destTileKey)
              ? this.getRoadPath(curKey, v.destTileKey)
              : null;
          if (reroute?.found && reroute.points.length >= 2) {
            v.path = reroute.points;
            v.pathIndex = 1;
          } else {
            v.path = [];
            v.pathIndex = 0;
          }
          break;
        }
      }
    }
  }

  public get cacheCount(): number {
    return this.pedRouteCache.size + this.roadRouteCache.size;
  }

  public getPedestrianPath(startNodeId: string, goalNodeId: string): PathResult {
    const key = `${startNodeId}->${goalNodeId}`;
    const hit = this.pedRouteCache.get(key);
    if (hit) {
      this.pedRouteCache.delete(key);
      this.pedRouteCache.set(key, hit);
      return hit;
    }
    const res = findPedestrianPath(this.pedestrianGraph, startNodeId, goalNodeId);
    if (this.pedRouteCache.size >= MAX_CACHED_ROUTES) {
      const oldest = this.pedRouteCache.keys().next().value;
      if (oldest) this.pedRouteCache.delete(oldest);
    }
    this.pedRouteCache.set(key, res);
    return res;
  }

  public getRoadPath(startTileKey: string, goalTileKey: string): PathResult {
    const key = `${startTileKey}->${goalTileKey}`;
    const hit = this.roadRouteCache.get(key);
    if (hit) {
      this.roadRouteCache.delete(key);
      this.roadRouteCache.set(key, hit);
      return hit;
    }
    const res = findRoadPath(this.roadGraph, startTileKey, goalTileKey);
    if (this.roadRouteCache.size >= MAX_CACHED_ROUTES) {
      const oldest = this.roadRouteCache.keys().next().value;
      if (oldest) this.roadRouteCache.delete(oldest);
    }
    this.roadRouteCache.set(key, res);
    return res;
  }
}
