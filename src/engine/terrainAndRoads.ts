import * as THREE from 'three';
import {
  GRID_SIZE,
  TILE_WORLD_SIZE,
  ThematicMapMode,
  TileData,
  BUILDING_CATALOG,
} from '../types/game';
import { WORLD_SCALE } from '../simulation/worldScale';
import { ProceduralTextureSet } from './proceduralTextures';
import { BuildingMaterialLibrary } from './buildingModels';

export function tileToWorld(tx: number, tz: number): [number, number] {
  return [
    (tx - (GRID_SIZE - 1) / 2) * TILE_WORLD_SIZE,
    (tz - (GRID_SIZE - 1) / 2) * TILE_WORLD_SIZE,
  ];
}

export function worldToTile(wx: number, wz: number): [number, number] | null {
  const tx = Math.round(wx / TILE_WORLD_SIZE + (GRID_SIZE - 1) / 2);
  const tz = Math.round(wz / TILE_WORLD_SIZE + (GRID_SIZE - 1) / 2);
  if (tx < 0 || tz < 0 || tx >= GRID_SIZE || tz >= GRID_SIZE) return null;
  return [tx, tz];
}

function hashCoord(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);

  const a = hashCoord(xi, zi);
  const b = hashCoord(xi + 1, zi);
  const c = hashCoord(xi, zi + 1);
  const d = hashCoord(xi + 1, zi + 1);

  return (a + (b - a) * u) + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Deterministic natural terrain height at any world (wx, wz).
 * Flattens cleanly on developed/road tiles so buildings & cars sit flush.
 */
export function getTilePadElevation(tile: TileData): number {
  if (tile.terrain === 'waterfront') return 0.04;
  if (tile.terrain === 'hill') {
    const hillWave = 0.24 + smoothNoise(tile.x * 0.25, tile.z * 0.25) * 0.28;
    return tile.road !== 'none' ? Math.min(0.26, hillWave * 0.6) : hillWave;
  }
  return 0.06;
}

export function groundHeightAt(wx: number, wz: number, tiles: TileData[]): number {
  const halfPlayable = (GRID_SIZE * TILE_WORLD_SIZE) / 2; // 24

  // Bay shoreline drop along +Z
  if (wz > halfPlayable - 1.5) {
    const shoreDist = wz - (halfPlayable - 1.5);
    const shoreDrop = Math.min(1.4, shoreDist * 0.14);
    const waveNoise = (smoothNoise(wx * 0.15, wz * 0.15) - 0.5) * 0.12;
    return Math.max(-1.1, 0.04 - shoreDrop + waveNoise);
  }

  // Natural continuous noise outside playable area (rolling Brazilian highlands / serras)
  if (Math.abs(wx) > halfPlayable || wz < -halfPlayable) {
    const dx = Math.max(0, Math.abs(wx) - halfPlayable);
    const dz = Math.max(0, -halfPlayable - wz);
    const distOut = Math.hypot(dx, dz);
    const ridge1 = smoothNoise(wx * 0.045 + 3.1, wz * 0.045 - 1.7);
    const ridge2 = smoothNoise(wx * 0.11 - 4.2, wz * 0.11 + 2.4);
    const serraRise = Math.pow(Math.min(1, distOut / 68), 1.35) * (12 + ridge1 * 18);
    const localHill = (ridge1 * 2.2 + ridge2 * 0.85) * Math.min(1, distOut / 10);
    // Taper down smoothly near the southern bay edge
    const bayTaper = THREE.MathUtils.clamp((halfPlayable + 2 - wz) / 14, 0, 1);
    return 0.06 + (serraRise + localHill) * bayTaper;
  }

  // Inside playable 24x24 area: bilinear/smooth blend around tile pads
  const gx = wx / TILE_WORLD_SIZE + (GRID_SIZE - 1) / 2;
  const gz = wz / TILE_WORLD_SIZE + (GRID_SIZE - 1) / 2;
  const tx = THREE.MathUtils.clamp(Math.round(gx), 0, GRID_SIZE - 1);
  const tz = THREE.MathUtils.clamp(Math.round(gz), 0, GRID_SIZE - 1);
  const tile = tiles[tz * GRID_SIZE + tx];

  const basePad = getTilePadElevation(tile);
  const micro = (smoothNoise(wx * 0.35, wz * 0.35) - 0.5) * 0.08;

  if (tile.building || tile.road !== 'none') {
    return basePad;
  }
  if (tile.terrain === 'waterfront') {
    const edgeT = THREE.MathUtils.clamp((wz - (halfPlayable - 3.6)) / 3.2, 0, 1);
    return THREE.MathUtils.lerp(0.06 + micro * 0.5, -0.04, edgeT);
  }
  return basePad + micro;
}

export interface ContinuousTerrainRig {
  terrainMesh: THREE.Mesh;
  gridOverlayInst: THREE.InstancedMesh;
  hitPlaneInst: THREE.InstancedMesh;
  updateTerrainForTiles: (tiles: TileData[]) => void;
  updateGridOverlay: (
    tiles: TileData[],
    mode: ThematicMapMode,
    showGridLines: boolean,
  ) => void;
  dispose: () => void;
}

function createGridCellTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(15,23,42,0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 124);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function getThematicTileColor(
  tile: TileData,
  mode: ThematicMapMode,
  out: THREE.Color,
): THREE.Color {
  if (mode === 'normal') {
    if (tile.plannedDistrict) return out.setHex(0x38bdf8);
    if (tile.concessionActive) return out.setHex(0xa855f7);
    if (tile.ownerType === 'public') return out.setHex(0x22c55e);
    if (tile.ownerType === 'available') return out.setHex(0xf59e0b);
    return out.setHex(0x64748b);
  }

  let t = 0.5;
  if (mode === 'landValue') {
    t = Math.min(1, Math.max(0, (tile.landValue - 15000) / 95000));
    return out.setHSL(0.32 * t + 0.02, 0.72, 0.45);
  }
  if (mode === 'safety') {
    t = Math.min(1, Math.max(0, tile.safetyCoverage / 100));
    return out.setHSL(0.34 * t, 0.75, 0.44);
  }
  if (mode === 'traffic') {
    if (tile.road === 'none') return out.setHex(0x475569);
    t = Math.min(1, Math.max(0, 1 - tile.trafficLoad / 100));
    return out.setHSL(0.34 * t, 0.78, 0.48);
  }
  if (mode === 'pollution') {
    t = Math.min(1, Math.max(0, 1 - tile.pollution / 60));
    return out.setHSL(0.34 * t, 0.74, 0.45);
  }
  if (mode === 'education') {
    t = Math.min(1, Math.max(0, tile.educationCoverage / 100));
    return out.setHSL(0.56 - (1 - t) * 0.48, 0.72, 0.46);
  }
  if (mode === 'health') {
    t = Math.min(1, Math.max(0, tile.healthCoverage / 100));
    return out.setHSL(0.38 * t, 0.72, 0.46);
  }
  if (mode === 'employment') {
    const jobs = tile.building ? BUILDING_CATALOG[tile.building.type].jobsProvided : 0;
    return jobs > 0 ? out.setHex(0x10b981) : out.setHex(0x475569);
  }
  if (mode === 'happiness') {
    t = Math.min(1, Math.max(0, tile.leisureCoverage / 90));
    return out.setHSL(0.35 * t, 0.75, 0.46);
  }
  if (mode === 'coverage') {
    const ok = tile.hasPower && tile.hasWater ? 1 : tile.hasPower || tile.hasWater ? 0.5 : 0;
    return ok === 1 ? out.setHex(0x0ea5e9) : ok === 0.5 ? out.setHex(0xf59e0b) : out.setHex(0xef4444);
  }
  return out.setHex(0x5a8e4b);
}

export function createContinuousTerrain(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
  initialTiles: TileData[],
): ContinuousTerrainRig {
  const segs = 128;
  const worldSpan = 240;
  const terrainGeo = new THREE.PlaneGeometry(worldSpan, worldSpan, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);

  const count = terrainGeo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: textures.terrain.map,
    normalMap: textures.terrain.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: textures.terrain.roughnessMap,
    roughness: 0.92,
    metalness: 0.02,
  });

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = false;
  scene.add(terrainMesh);

  // Invisible raycast plane per tile (layer 1) so tile picking remains 100% accurate
  const totalTiles = GRID_SIZE * GRID_SIZE;
  const cellGeo = new THREE.PlaneGeometry(TILE_WORLD_SIZE, TILE_WORLD_SIZE);
  cellGeo.rotateX(-Math.PI / 2);

  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitPlaneInst = new THREE.InstancedMesh(cellGeo, hitMat, totalTiles);
  hitPlaneInst.layers.set(1);

  const gridCellTex = createGridCellTexture();
  const overlayMat = new THREE.MeshBasicMaterial({
    map: gridCellTex,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const gridOverlayInst = new THREE.InstancedMesh(cellGeo, overlayMat, totalTiles);
  gridOverlayInst.visible = false;
  gridOverlayInst.renderOrder = 3;

  const dummy = new THREE.Object3D();
  for (let z = 0; z < GRID_SIZE; z++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const idx = z * GRID_SIZE + x;
      const [wx, wz] = tileToWorld(x, z);
      const y = getTilePadElevation(initialTiles[idx]) + 0.018;
      dummy.position.set(wx, y, wz);
      dummy.updateMatrix();
      hitPlaneInst.setMatrixAt(idx, dummy.matrix);
      gridOverlayInst.setMatrixAt(idx, dummy.matrix);
    }
  }
  hitPlaneInst.instanceMatrix.needsUpdate = true;
  gridOverlayInst.instanceMatrix.needsUpdate = true;
  hitPlaneInst.computeBoundingSphere();
  gridOverlayInst.computeBoundingSphere();
  scene.add(hitPlaneInst);
  scene.add(gridOverlayInst);

  const colGrass = new THREE.Color(0x527d41);
  const colFertile = new THREE.Color(0x5d8d45);
  const colHill = new THREE.Color(0x63784e);
  const colRock = new THREE.Color(0x6c6e66);
  const colSand = new THREE.Color(0xcab68b);
  const colEarth = new THREE.Color(0x74624a);
  const colUrban = new THREE.Color(0x6b7760);
  const tmpColor = new THREE.Color();

  const updateTerrainForTiles = (tiles: TileData[]) => {
    const pos = terrainGeo.attributes.position as THREE.BufferAttribute;
    const colAttr = terrainGeo.attributes.color as THREE.BufferAttribute;
    const halfPlayable = (GRID_SIZE * TILE_WORLD_SIZE) / 2;

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const vy = groundHeightAt(vx, vz, tiles);
      pos.setY(i, vy);

      // Organic color blending
      const n1 = smoothNoise(vx * 0.14 + 5, vz * 0.14 - 3);
      const n2 = smoothNoise(vx * 0.32 - 2, vz * 0.32 + 7);

      if (vz > halfPlayable - 2.6) {
        const beachT = THREE.MathUtils.clamp((vz - (halfPlayable - 2.6)) / 2.2, 0, 1);
        tmpColor.copy(colGrass).lerp(colSand, beachT);
        if (vy < -0.15) tmpColor.lerp(colEarth, 0.55);
      } else if (Math.abs(vx) <= halfPlayable && vz >= -halfPlayable) {
        const tx = THREE.MathUtils.clamp(Math.round(vx / TILE_WORLD_SIZE + (GRID_SIZE - 1) / 2), 0, GRID_SIZE - 1);
        const tz = THREE.MathUtils.clamp(Math.round(vz / TILE_WORLD_SIZE + (GRID_SIZE - 1) / 2), 0, GRID_SIZE - 1);
        const t = tiles[tz * GRID_SIZE + tx];

        if (t.terrain === 'fertile') tmpColor.copy(colFertile);
        else if (t.terrain === 'hill') tmpColor.copy(colHill).lerp(colRock, n1 * 0.42);
        else if (t.terrain === 'waterfront') tmpColor.copy(colSand).lerp(colGrass, 0.25);
        else tmpColor.copy(colGrass);

        // Earth/urban transition under structures or polluted industrial areas
        if (t.building || t.road !== 'none') {
          tmpColor.lerp(colUrban, 0.42);
        } else if (t.pollution > 18) {
          tmpColor.lerp(colEarth, Math.min(0.45, (t.pollution - 18) / 50));
        }
        tmpColor.offsetHSL((n1 - 0.5) * 0.025, (n2 - 0.5) * 0.06, (n1 - 0.5) * 0.05);
      } else {
        // Outer wilderness & mountains
        tmpColor.copy(colGrass).lerp(colHill, THREE.MathUtils.clamp(vy / 5, 0, 1));
        if (vy > 4.5) {
          tmpColor.lerp(colRock, THREE.MathUtils.clamp((vy - 4.5) / 8, 0, 0.72));
        }
        tmpColor.offsetHSL((n1 - 0.5) * 0.02, 0, (n2 - 0.5) * 0.05);
      }

      colAttr.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
    }

    pos.needsUpdate = true;
    colAttr.needsUpdate = true;
    terrainGeo.computeVertexNormals();

    // Refresh hit/overlay pad heights to match developed tiles
    for (let z = 0; z < GRID_SIZE; z++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const idx = z * GRID_SIZE + x;
        const [wx, wz] = tileToWorld(x, z);
        const y = getTilePadElevation(tiles[idx]) + 0.018;
        dummy.position.set(wx, y, wz);
        dummy.updateMatrix();
        hitPlaneInst.setMatrixAt(idx, dummy.matrix);
        gridOverlayInst.setMatrixAt(idx, dummy.matrix);
      }
    }
    hitPlaneInst.instanceMatrix.needsUpdate = true;
    gridOverlayInst.instanceMatrix.needsUpdate = true;
  };

  const updateGridOverlay = (
    tiles: TileData[],
    mode: ThematicMapMode,
    showGridLines: boolean,
  ) => {
    const shouldShow = mode !== 'normal' || showGridLines;
    gridOverlayInst.visible = shouldShow;
    if (!shouldShow) return;

    overlayMat.opacity = mode !== 'normal' ? 0.64 : 0.28;
    for (let i = 0; i < tiles.length; i++) {
      getThematicTileColor(tiles[i], mode, tmpColor);
      gridOverlayInst.setColorAt(i, tmpColor);
    }
    if (gridOverlayInst.instanceColor) {
      gridOverlayInst.instanceColor.needsUpdate = true;
    }
  };

  updateTerrainForTiles(initialTiles);

  return {
    terrainMesh,
    gridOverlayInst,
    hitPlaneInst,
    updateTerrainForTiles,
    updateGridOverlay,
    dispose: () => {
      scene.remove(terrainMesh);
      scene.remove(hitPlaneInst);
      scene.remove(gridOverlayInst);
      terrainGeo.dispose();
      terrainMat.dispose();
      cellGeo.dispose();
      hitMat.dispose();
      gridCellTex.dispose();
      overlayMat.dispose();
    },
  };
}

export interface RoadNetworkBuildResult {
  dispose: () => void;
}

// Shared primitive geometries for smart connected roads & street furniture
const _box1 = new THREE.BoxGeometry(1, 1, 1);
const _cyl1 = new THREE.CylinderGeometry(1, 1, 1, 8);
const _plane1 = new THREE.PlaneGeometry(1, 1);

/**
 * Builds connected seamless asphalt segments, curbs, sidewalks, crosswalks,
 * streetlights, traffic lights, storm drains, and avenue bus stops.
 */
export function buildConnectedRoadNetwork(
  targetGroup: THREE.Group,
  tiles: TileData[],
  textures: ProceduralTextureSet,
  mats: BuildingMaterialLibrary,
  transitBudget: number,
): RoadNetworkBuildResult {
  while (targetGroup.children.length > 0) {
    targetGroup.remove(targetGroup.children[0]);
  }

  const asphaltMat = new THREE.MeshStandardMaterial({
    map: textures.asphalt.map,
    normalMap: textures.asphalt.normalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: textures.asphalt.roughnessMap,
    color: transitBudget < 0.75 ? 0xb8bec6 : 0xffffff,
    roughness: 0.85,
    metalness: 0.06,
  });

  const sidewalkMat = new THREE.MeshStandardMaterial({
    map: textures.concrete.map,
    normalMap: textures.concrete.normalMap,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughnessMap: textures.concrete.roughnessMap,
    color: transitBudget < 0.75 ? 0xbab6ac : 0xe2e6eb,
    roughness: 0.84,
    metalness: 0.03,
  });

  const curbMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.78,
    metalness: 0.05,
  });

  const yellowPaintMat = new THREE.MeshStandardMaterial({
    color: 0xeab308,
    roughness: 0.65,
    metalness: 0.05,
  });

  const whitePaintMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.65,
    metalness: 0.05,
  });

  const medianGrassMat = new THREE.MeshStandardMaterial({
    color: 0x4d7c3f,
    roughness: 0.9,
  });

  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.38,
    metalness: 0.78,
  });

  const greenSignalMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    emissive: new THREE.Color(0x16a34a),
    emissiveIntensity: 0.85,
  });

  const redSignalMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: new THREE.Color(0xdc2626),
    emissiveIntensity: 0.7,
  });

  // Count road tiles to size instanced furniture pools
  const roadTiles: TileData[] = [];
  for (const t of tiles) {
    if (t.road !== 'none') roadTiles.push(t);
  }
  if (roadTiles.length === 0) {
    return {
      dispose: () => {
        asphaltMat.dispose();
        sidewalkMat.dispose();
        curbMat.dispose();
        yellowPaintMat.dispose();
        whitePaintMat.dispose();
        medianGrassMat.dispose();
        poleMat.dispose();
        greenSignalMat.dispose();
        redSignalMat.dispose();
      },
    };
  }

  // Gather instance transforms for sidewalks, asphalt strips, markings, and props
  const sidewalkMatrices: THREE.Matrix4[] = [];
  const asphaltMatrices: THREE.Matrix4[] = [];
  const yellowMatrices: THREE.Matrix4[] = [];
  const whiteMatrices: THREE.Matrix4[] = [];
  const curbMatrices: THREE.Matrix4[] = [];
  const medianMatrices: THREE.Matrix4[] = [];
  const lampPostCoords: { wx: number; wy: number; wz: number; rotY: number }[] = [];
  const trafficLightCoords: { wx: number; wy: number; wz: number }[] = [];
  const busStopCoords: { wx: number; wy: number; wz: number; rotY: number }[] = [];

  const dummy = new THREE.Object3D();
  const pushBox = (
    list: THREE.Matrix4[],
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    list.push(dummy.matrix.clone());
  };

  const hasRoad = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= GRID_SIZE || z >= GRID_SIZE) return false;
    return tiles[z * GRID_SIZE + x].road !== 'none';
  };

  for (const tile of roadTiles) {
    const [wx, wz] = tileToWorld(tile.x, tile.z);
    const baseY = getTilePadElevation(tile);
    const isAve = tile.road === 'avenida';

    const n = hasRoad(tile.x, tile.z - 1);
    const s = hasRoad(tile.x, tile.z + 1);
    const w = hasRoad(tile.x - 1, tile.z);
    const e = hasRoad(tile.x + 1, tile.z);
    const degree = (n ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0) + (e ? 1 : 0);

    // Sidewalk base slab filling full 2x2 footprint cleanly
    pushBox(sidewalkMatrices, wx, baseY + 0.025, wz, TILE_WORLD_SIZE, 0.05, TILE_WORLD_SIZE);

    const roadW = isAve ? WORLD_SCALE.avenueAsphaltWidthU : WORLD_SCALE.streetAsphaltWidthU;
    const lampGap = WORLD_SCALE.lampCurbGapU;
    const busGap = WORLD_SCALE.busStopCurbGapU;
    const sigGap = WORLD_SCALE.signalCurbGapU;
    const halfSpan = TILE_WORLD_SIZE / 2; // 1.0
    const armLen = (TILE_WORLD_SIZE - roadW) / 2;

    // Central asphalt square (connects seamlessly to neighbors)
    pushBox(asphaltMatrices, wx, baseY + 0.042, wz, roadW, 0.032, roadW);

    // Directional asphalt arms to tile border (no artificial gap!)
    if (n) {
      pushBox(asphaltMatrices, wx, baseY + 0.042, wz - (roadW / 2 + armLen / 2), roadW, 0.032, armLen + 0.02);
    } else {
      pushBox(curbMatrices, wx, baseY + 0.052, wz - roadW / 2 - 0.03, roadW + 0.08, 0.04, 0.06);
    }
    if (s) {
      pushBox(asphaltMatrices, wx, baseY + 0.042, wz + (roadW / 2 + armLen / 2), roadW, 0.032, armLen + 0.02);
    } else {
      pushBox(curbMatrices, wx, baseY + 0.052, wz + roadW / 2 + 0.03, roadW + 0.08, 0.04, 0.06);
    }
    if (w) {
      pushBox(asphaltMatrices, wx - (roadW / 2 + armLen / 2), baseY + 0.042, wz, armLen + 0.02, 0.032, roadW);
    } else {
      pushBox(curbMatrices, wx - roadW / 2 - 0.03, baseY + 0.052, wz, 0.06, 0.04, roadW + 0.08);
    }
    if (e) {
      pushBox(asphaltMatrices, wx + (roadW / 2 + armLen / 2), baseY + 0.042, wz, armLen + 0.02, 0.032, roadW);
    } else {
      pushBox(curbMatrices, wx + roadW / 2 + 0.03, baseY + 0.052, wz, 0.06, 0.04, roadW + 0.08);
    }

    // Center markings, medians & crosswalks
    const isStraightNS = (n || s) && !w && !e;
    const isStraightEW = (w || e) && !n && !s;

    if (isStraightNS || degree === 0) {
      if (isAve) {
        pushBox(medianMatrices, wx, baseY + 0.075, wz, 0.14, 0.06, TILE_WORLD_SIZE * 0.92);
        for (const zOff of [-0.45, 0.45]) {
          pushBox(whiteMatrices, wx - 0.4, baseY + 0.06, wz + zOff, 0.035, 0.004, 0.34);
          pushBox(whiteMatrices, wx + 0.4, baseY + 0.06, wz + zOff, 0.035, 0.004, 0.34);
        }
      } else {
        for (const zOff of [-0.55, 0.0, 0.55]) {
          pushBox(yellowMatrices, wx, baseY + 0.06, wz + zOff, 0.045, 0.004, 0.28);
        }
      }
      // Alternating streetlamp on sidewalk curb
      if ((tile.x + tile.z) % 2 === 0) {
        lampPostCoords.push({
          wx: wx + roadW / 2 + lampGap,
          wy: baseY + 0.05,
          wz,
          rotY: Math.PI,
        });
      }
      if (isAve && ((tile.x * 3 + tile.z) % 5 === 0 || tile.busStop)) {
        busStopCoords.push({
          wx: wx - roadW / 2 - busGap,
          wy: baseY + 0.05,
          wz,
          rotY: Math.PI / 2,
        });
      }
    } else if (isStraightEW) {
      if (isAve) {
        pushBox(medianMatrices, wx, baseY + 0.075, wz, TILE_WORLD_SIZE * 0.92, 0.06, 0.14);
        for (const xOff of [-0.45, 0.45]) {
          pushBox(whiteMatrices, wx + xOff, baseY + 0.06, wz - 0.4, 0.34, 0.004, 0.035);
          pushBox(whiteMatrices, wx + xOff, baseY + 0.06, wz + 0.4, 0.34, 0.004, 0.035);
        }
      } else {
        for (const xOff of [-0.55, 0.0, 0.55]) {
          pushBox(yellowMatrices, wx + xOff, baseY + 0.06, wz, 0.28, 0.004, 0.045);
        }
      }
      if ((tile.x + tile.z) % 2 === 0) {
        lampPostCoords.push({
          wx,
          wy: baseY + 0.05,
          wz: wz - roadW / 2 - lampGap,
          rotY: -Math.PI / 2,
        });
      }
      if (isAve && ((tile.x + tile.z * 3) % 5 === 0 || tile.busStop)) {
        busStopCoords.push({
          wx,
          wy: baseY + 0.05,
          wz: wz + roadW / 2 + busGap,
          rotY: Math.PI,
        });
      }
    } else if (degree >= 3) {
      // Crosswalks (faixas de pedestres) at 3-way & 4-way intersections
      const barOffsets = [-0.36, -0.18, 0.0, 0.18, 0.36];
      if (n) {
        for (const bx of barOffsets) {
          pushBox(whiteMatrices, wx + bx, baseY + 0.061, wz - halfSpan + 0.16, 0.08, 0.004, 0.24);
        }
      }
      if (s) {
        for (const bx of barOffsets) {
          pushBox(whiteMatrices, wx + bx, baseY + 0.061, wz + halfSpan - 0.16, 0.08, 0.004, 0.24);
        }
      }
      if (w) {
        for (const bz of barOffsets) {
          pushBox(whiteMatrices, wx - halfSpan + 0.16, baseY + 0.061, wz + bz, 0.24, 0.004, 0.08);
        }
      }
      if (e) {
        for (const bz of barOffsets) {
          pushBox(whiteMatrices, wx + halfSpan - 0.16, baseY + 0.061, wz + bz, 0.24, 0.004, 0.08);
        }
      }
      // Traffic light on corner
      trafficLightCoords.push({
        wx: wx + roadW / 2 + sigGap,
        wy: baseY + 0.05,
        wz: wz + roadW / 2 + sigGap,
      });
    } else if (degree === 2) {
      // Curve / corner sidewalk accent lamp
      if ((tile.x + tile.z) % 2 === 0) {
        lampPostCoords.push({
          wx: wx + (e ? -roadW / 2 - lampGap : roadW / 2 + lampGap),
          wy: baseY + 0.05,
          wz: wz + (s ? -roadW / 2 - lampGap : roadW / 2 + lampGap),
          rotY: 0,
        });
      }
    }
  }

  const addInstancedBoxes = (
    matrices: THREE.Matrix4[],
    mat: THREE.Material,
    receiveShadow = true,
    castShadow = false,
  ) => {
    if (matrices.length === 0) return null;
    const inst = new THREE.InstancedMesh(_box1, mat, matrices.length);
    for (let i = 0; i < matrices.length; i++) {
      inst.setMatrixAt(i, matrices[i]);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.receiveShadow = receiveShadow;
    inst.castShadow = castShadow;
    inst.computeBoundingSphere();
    targetGroup.add(inst);
    return inst;
  };

  addInstancedBoxes(sidewalkMatrices, sidewalkMat, true, false);
  addInstancedBoxes(asphaltMatrices, asphaltMat, true, false);
  addInstancedBoxes(curbMatrices, curbMat, true, false);
  addInstancedBoxes(yellowMatrices, yellowPaintMat, false, false);
  addInstancedBoxes(whiteMatrices, whitePaintMat, false, false);
  addInstancedBoxes(medianMatrices, medianGrassMat, true, false);

  // Instanced Streetlights (Pole + Arm + Emissive Lamp Head)
  if (lampPostCoords.length > 0) {
    const poleInst = new THREE.InstancedMesh(_cyl1, poleMat, lampPostCoords.length);
    const armInst = new THREE.InstancedMesh(_box1, poleMat, lampPostCoords.length);
    const bulbInst = new THREE.InstancedMesh(_box1, mats.nightGlowMat, lampPostCoords.length);
    poleInst.castShadow = true;

    lampPostCoords.forEach((lp, idx) => {
      dummy.position.set(lp.wx, lp.wy + 0.38, lp.wz);
      dummy.rotation.set(0, lp.rotY, 0);
      dummy.scale.set(0.028, 0.76, 0.028);
      dummy.updateMatrix();
      poleInst.setMatrixAt(idx, dummy.matrix);

      const armOffX = Math.cos(lp.rotY) * 0.14;
      const armOffZ = -Math.sin(lp.rotY) * 0.14;
      dummy.position.set(lp.wx + armOffX, lp.wy + 0.74, lp.wz + armOffZ);
      dummy.rotation.set(0, lp.rotY, 0);
      dummy.scale.set(0.28, 0.024, 0.024);
      dummy.updateMatrix();
      armInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(lp.wx + armOffX * 1.8, lp.wy + 0.71, lp.wz + armOffZ * 1.8);
      dummy.scale.set(0.09, 0.03, 0.06);
      dummy.updateMatrix();
      bulbInst.setMatrixAt(idx, dummy.matrix);
    });
    poleInst.instanceMatrix.needsUpdate = true;
    armInst.instanceMatrix.needsUpdate = true;
    bulbInst.instanceMatrix.needsUpdate = true;
    poleInst.computeBoundingSphere();
    armInst.computeBoundingSphere();
    bulbInst.computeBoundingSphere();
    targetGroup.add(poleInst, armInst, bulbInst);
  }

  // Instanced Traffic Lights at intersections
  if (trafficLightCoords.length > 0) {
    const tPoleInst = new THREE.InstancedMesh(_cyl1, poleMat, trafficLightCoords.length);
    const tBoxInst = new THREE.InstancedMesh(_box1, poleMat, trafficLightCoords.length);
    const tGreenInst = new THREE.InstancedMesh(_box1, greenSignalMat, trafficLightCoords.length);
    const tRedInst = new THREE.InstancedMesh(_box1, redSignalMat, trafficLightCoords.length);
    trafficLightCoords.forEach((tl, idx) => {
      dummy.position.set(tl.wx, tl.wy + 0.34, tl.wz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.026, 0.68, 0.026);
      dummy.updateMatrix();
      tPoleInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(tl.wx, tl.wy + 0.62, tl.wz);
      dummy.scale.set(0.08, 0.18, 0.08);
      dummy.updateMatrix();
      tBoxInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(tl.wx - 0.044, tl.wy + 0.57, tl.wz);
      dummy.scale.set(0.015, 0.04, 0.04);
      dummy.updateMatrix();
      tGreenInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(tl.wx, tl.wy + 0.66, tl.wz - 0.044);
      dummy.scale.set(0.04, 0.04, 0.015);
      dummy.updateMatrix();
      tRedInst.setMatrixAt(idx, dummy.matrix);
    });
    tPoleInst.instanceMatrix.needsUpdate = true;
    tBoxInst.instanceMatrix.needsUpdate = true;
    tGreenInst.instanceMatrix.needsUpdate = true;
    tRedInst.instanceMatrix.needsUpdate = true;
    targetGroup.add(tPoleInst, tBoxInst, tGreenInst, tRedInst);
  }

  // Instanced Bus Stops along Avenues
  if (busStopCoords.length > 0) {
    const shelterRoofInst = new THREE.InstancedMesh(_box1, mats.glassMat, busStopCoords.length);
    const shelterBackInst = new THREE.InstancedMesh(_box1, mats.blueAccentMat, busStopCoords.length);
    busStopCoords.forEach((bs, idx) => {
      dummy.position.set(bs.wx, bs.wy + 0.34, bs.wz);
      dummy.rotation.set(0, bs.rotY, 0);
      dummy.scale.set(0.26, 0.03, 0.44);
      dummy.updateMatrix();
      shelterRoofInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(bs.wx, bs.wy + 0.18, bs.wz);
      dummy.scale.set(0.04, 0.32, 0.36);
      dummy.updateMatrix();
      shelterBackInst.setMatrixAt(idx, dummy.matrix);
    });
    shelterRoofInst.instanceMatrix.needsUpdate = true;
    shelterBackInst.instanceMatrix.needsUpdate = true;
    targetGroup.add(shelterRoofInst, shelterBackInst);
  }

  return {
    dispose: () => {
      while (targetGroup.children.length > 0) {
        targetGroup.remove(targetGroup.children[0]);
      }
      asphaltMat.dispose();
      sidewalkMat.dispose();
      curbMat.dispose();
      yellowPaintMat.dispose();
      whitePaintMat.dispose();
      medianGrassMat.dispose();
      poleMat.dispose();
      greenSignalMat.dispose();
      redSignalMat.dispose();
    },
  };
}
