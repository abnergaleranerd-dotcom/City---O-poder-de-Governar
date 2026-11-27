import * as THREE from 'three';
import { BuildingLifecycleStage, BuildingTypeId } from '../types/game';
import { ProceduralTextureSet } from './proceduralTextures';

export interface BuildingVisualContext {
  seed?: number;
  condition?: number; // 0..100
  pollution?: number; // 0..100
  powered?: boolean;
  watered?: boolean;
  plannedDistrict?: boolean;
  landValue?: number;
  constructionStage?: BuildingLifecycleStage;
  constructionProgress?: number;
}

export interface BuildingMaterialLibrary {
  concreteMat: THREE.MeshStandardMaterial;
  darkConcreteMat: THREE.MeshStandardMaterial;
  weatheredConcreteMat: THREE.MeshStandardMaterial;
  stuccoWarmMats: THREE.MeshStandardMaterial[];
  terracottaRoofMat: THREE.MeshStandardMaterial;
  slateRoofMat: THREE.MeshStandardMaterial;
  metalSteelMat: THREE.MeshStandardMaterial;
  metalCorrugatedMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshPhysicalMaterial;
  facadeWindowMat: THREE.MeshStandardMaterial;
  facadeUnlitMat: THREE.MeshStandardMaterial;
  brickMat: THREE.MeshStandardMaterial;
  woodMat: THREE.MeshStandardMaterial;
  goldAccentMat: THREE.MeshStandardMaterial;
  parkGrassMat: THREE.MeshStandardMaterial;
  waterPoolMat: THREE.MeshPhysicalMaterial;
  redAccentMat: THREE.MeshStandardMaterial;
  blueAccentMat: THREE.MeshStandardMaterial;
  amberAccentMat: THREE.MeshStandardMaterial;
  emeraldAccentMat: THREE.MeshStandardMaterial;
  nightGlowMat: THREE.MeshStandardMaterial;
  coolNightGlowMat: THREE.MeshStandardMaterial;
  shadowPlaneMat: THREE.MeshBasicMaterial;
  dispose: () => void;
}

export function createBuildingMaterialLibrary(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): BuildingMaterialLibrary {
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xe6e8ec,
    map: textures.concrete.map,
    normalMap: textures.concrete.normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughnessMap: textures.concrete.roughnessMap,
    roughness: 0.86,
    metalness: 0.04,
  });

  const darkConcreteMat = new THREE.MeshStandardMaterial({
    color: 0x525d6d,
    map: textures.concrete.map,
    normalMap: textures.concrete.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.88,
    metalness: 0.08,
  });

  const weatheredConcreteMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0a6,
    map: textures.stucco.map,
    normalMap: textures.stucco.normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 0.94,
    metalness: 0.03,
  });

  const stuccoColors = [0xf2ece1, 0xe8d7bd, 0xd8e0d5, 0xe9cfc4, 0xd4dfe8, 0xe5dfd5];
  const stuccoWarmMats = stuccoColors.map(
    (col) =>
      new THREE.MeshStandardMaterial({
        color: col,
        map: textures.stucco.map,
        normalMap: textures.stucco.normalMap,
        normalScale: new THREE.Vector2(0.42, 0.42),
        roughnessMap: textures.stucco.roughnessMap,
        roughness: 0.86,
        metalness: 0.02,
      }),
  );

  const terracottaRoofMat = new THREE.MeshStandardMaterial({
    color: 0xc86446,
    map: textures.roofTile.map,
    normalMap: textures.roofTile.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: textures.roofTile.roughnessMap,
    roughness: 0.76,
    metalness: 0.05,
  });

  const slateRoofMat = new THREE.MeshStandardMaterial({
    color: 0x3b4554,
    map: textures.roofTile.map,
    normalMap: textures.roofTile.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.72,
    metalness: 0.14,
  });

  const metalSteelMat = new THREE.MeshStandardMaterial({
    color: 0x9aa5b4,
    roughness: 0.3,
    metalness: 0.82,
  });

  const metalCorrugatedMat = new THREE.MeshStandardMaterial({
    color: 0xb6c0cc,
    map: textures.metal.map,
    normalMap: textures.metal.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: textures.metal.roughnessMap,
    roughness: 0.42,
    metalness: 0.68,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x7ab8d9,
    roughness: 0.08,
    metalness: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity: isSoftwareGl ? 0.58 : 0.76,
  });

  const facadeWindowMat = new THREE.MeshStandardMaterial({
    map: textures.facadeDay,
    roughnessMap: textures.facadeRoughness,
    emissiveMap: textures.facadeNightEmissive,
    emissive: new THREE.Color(0xffd796),
    emissiveIntensity: 0.0,
    roughness: 0.75,
    metalness: 0.24,
  });

  const facadeUnlitMat = new THREE.MeshStandardMaterial({
    color: 0x9aa3ad,
    map: textures.facadeDay,
    roughness: 0.72,
    metalness: 0.12,
  });

  const brickMat = new THREE.MeshStandardMaterial({
    color: 0xd9b3a3,
    map: textures.brick.map,
    normalMap: textures.brick.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: textures.brick.roughnessMap,
    roughness: 0.86,
    metalness: 0.03,
  });

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x9c6b3f,
    map: textures.wood.map,
    normalMap: textures.wood.normalMap,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughness: 0.8,
    metalness: 0.02,
  });

  const goldAccentMat = new THREE.MeshStandardMaterial({
    color: 0xd99b26,
    roughness: 0.26,
    metalness: 0.86,
  });

  const parkGrassMat = new THREE.MeshStandardMaterial({
    color: 0x4f843e,
    map: textures.terrain.map,
    normalMap: textures.terrain.normalMap,
    roughness: 0.92,
    metalness: 0.0,
  });

  const waterPoolMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b84ad,
    normalMap: textures.waterNormal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.1,
    metalness: 0.1,
    clearcoat: 1.0,
  });

  const redAccentMat = new THREE.MeshStandardMaterial({
    color: 0xc2362b,
    roughness: 0.46,
    metalness: 0.18,
  });

  const blueAccentMat = new THREE.MeshStandardMaterial({
    color: 0x2463a6,
    roughness: 0.48,
    metalness: 0.18,
  });

  const amberAccentMat = new THREE.MeshStandardMaterial({
    color: 0xc97b22,
    roughness: 0.5,
    metalness: 0.14,
  });

  const emeraldAccentMat = new THREE.MeshStandardMaterial({
    color: 0x2d7a53,
    roughness: 0.56,
    metalness: 0.1,
  });

  const nightGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: new THREE.Color(0xffbe55),
    emissiveIntensity: 0.15,
    roughness: 0.3,
  });

  const coolNightGlowMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: new THREE.Color(0x93c5fd),
    emissiveIntensity: 0.08,
    roughness: 0.3,
  });

  const shadowPlaneMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.48,
  });

  const all: THREE.Material[] = [
    concreteMat,
    darkConcreteMat,
    weatheredConcreteMat,
    ...stuccoWarmMats,
    terracottaRoofMat,
    slateRoofMat,
    metalSteelMat,
    metalCorrugatedMat,
    glassMat,
    facadeWindowMat,
    facadeUnlitMat,
    brickMat,
    woodMat,
    goldAccentMat,
    parkGrassMat,
    waterPoolMat,
    redAccentMat,
    blueAccentMat,
    amberAccentMat,
    emeraldAccentMat,
    nightGlowMat,
    coolNightGlowMat,
    shadowPlaneMat,
  ];

  return {
    concreteMat,
    darkConcreteMat,
    weatheredConcreteMat,
    stuccoWarmMats,
    terracottaRoofMat,
    slateRoofMat,
    metalSteelMat,
    metalCorrugatedMat,
    glassMat,
    facadeWindowMat,
    facadeUnlitMat,
    brickMat,
    woodMat,
    goldAccentMat,
    parkGrassMat,
    waterPoolMat,
    redAccentMat,
    blueAccentMat,
    amberAccentMat,
    emeraldAccentMat,
    nightGlowMat,
    coolNightGlowMat,
    shadowPlaneMat,
    dispose: () => {
      all.forEach((m) => m.dispose());
    },
  };
}

// Create shared beveled pitched gable roof geometry (triangular prism with overhanging eaves)
function createGableRoofGeo(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.52, -0.02);
  shape.lineTo(0.52, -0.02);
  shape.lineTo(0, 0.52);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.5);
  geo.computeVertexNormals();
  return geo;
}

// Chamfered architectural volume for stylized non-boxy facades, eaves, and balconies
function createBeveledBoxGeo(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const r = 0.04;
  const hw = 0.46;
  const hh = 0.46;
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.92,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.46);
  geo.computeVertexNormals();
  return geo;
}

// Shared primitive geometries (cached for high performance and zero leaks)
const _box1 = new THREE.BoxGeometry(1, 1, 1);
const _bevelBox1 = createBeveledBoxGeo();
const _cyl1 = new THREE.CylinderGeometry(1, 1, 1, 12);
const _cone4 = new THREE.ConeGeometry(1, 1, 4);
const _coneRound = new THREE.ConeGeometry(1, 1, 10);
const _gable1 = createGableRoofGeo();
const _plane1 = new THREE.PlaneGeometry(1, 1);
const _sphere1 = new THREE.SphereGeometry(0.5, 10, 8);

function addPart(
  group: THREE.Group,
  geom: THREE.BufferGeometry,
  mat: THREE.Material,
  px: number,
  py: number,
  pz: number,
  sx: number,
  sy: number,
  sz: number,
  ry = 0,
  castShadow = true,
) {
  const m = new THREE.Mesh(geom, mat);
  m.position.set(px, py, pz);
  m.scale.set(sx, sy, sz);
  if (ry !== 0) m.rotation.y = ry;
  m.castShadow = castShadow;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

function addContactShadow(group: THREE.Group, mat: THREE.Material, size = 1.9) {
  const m = new THREE.Mesh(_plane1, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.scale.set(size, size, 1);
  m.receiveShadow = false;
  m.castShadow = false;
  group.add(m);
}

function addPerimeterWallAndGate(
  group: THREE.Group,
  mats: BuildingMaterialLibrary,
  wallMat: THREE.Material,
  w = 1.66,
  d = 1.66,
  wallH = 0.2,
) {
  const halfW = w / 2;
  const halfD = d / 2;
  addPart(group, _box1, wallMat, 0, wallH / 2 + 0.04, -halfD, w, wallH, 0.05);
  addPart(group, _box1, wallMat, -halfW, wallH / 2 + 0.04, 0, 0.05, wallH, d);
  addPart(group, _box1, wallMat, halfW, wallH / 2 + 0.04, 0, 0.05, wallH, d);

  // Front wall segments leaving central entrance open (|x| <= 0.28u matching worldRegistry)
  const gateHalf = 0.28;
  const segLen = Math.max(0.18, halfW - gateHalf);
  const segCenter = gateHalf + segLen * 0.5;
  addPart(group, _box1, wallMat, -segCenter, wallH / 2 + 0.04, halfD, segLen, wallH, 0.05);
  addPart(group, _box1, wallMat, segCenter, wallH / 2 + 0.04, halfD, segLen, wallH, 0.05);

  // Stone gate pillars & open sliding gate parked neatly along left front wall
  addPart(group, _box1, mats.concreteMat, -gateHalf, wallH * 0.65 + 0.04, halfD, 0.075, wallH * 1.3, 0.075);
  addPart(group, _box1, mats.concreteMat, gateHalf, wallH * 0.65 + 0.04, halfD, 0.075, wallH * 1.3, 0.075);
  addPart(
    group,
    _box1,
    mats.metalSteelMat,
    -gateHalf - 0.24,
    wallH * 0.48 + 0.04,
    halfD + 0.032,
    0.46,
    wallH * 0.9,
    0.025,
  );
}

function addBrazilianTree(
  group: THREE.Group,
  mats: BuildingMaterialLibrary,
  x: number,
  y: number,
  z: number,
  scale = 1,
) {
  const tree = new THREE.Group();
  tree.position.set(x, y, z);

  // Tapered main trunk
  const trunk = new THREE.Mesh(_cyl1, mats.woodMat);
  trunk.position.set(0, 0.16 * scale, 0);
  trunk.scale.set(0.042 * scale, 0.34 * scale, 0.042 * scale);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  // Two angled structural branch limbs
  const limbA = new THREE.Mesh(_cyl1, mats.woodMat);
  limbA.position.set(0.045 * scale, 0.27 * scale, 0.02 * scale);
  limbA.rotation.z = -0.48;
  limbA.rotation.x = 0.22;
  limbA.scale.set(0.022 * scale, 0.16 * scale, 0.022 * scale);
  limbA.castShadow = true;
  tree.add(limbA);

  const limbB = new THREE.Mesh(_cyl1, mats.woodMat);
  limbB.position.set(-0.04 * scale, 0.26 * scale, -0.025 * scale);
  limbB.rotation.z = 0.45;
  limbB.rotation.x = -0.24;
  limbB.scale.set(0.02 * scale, 0.15 * scale, 0.02 * scale);
  limbB.castShadow = true;
  tree.add(limbB);

  // 4 overlapping irregular foliage canopy clusters
  addPart(tree, _sphere1, mats.parkGrassMat, 0, 0.4 * scale, 0, 0.32 * scale, 0.24 * scale, 0.31 * scale);
  addPart(
    tree,
    _sphere1,
    mats.emeraldAccentMat,
    0.095 * scale,
    0.37 * scale,
    0.05 * scale,
    0.23 * scale,
    0.19 * scale,
    0.22 * scale,
  );
  addPart(
    tree,
    _sphere1,
    mats.parkGrassMat,
    -0.085 * scale,
    0.38 * scale,
    -0.06 * scale,
    0.22 * scale,
    0.18 * scale,
    0.22 * scale,
  );
  addPart(
    tree,
    _sphere1,
    mats.emeraldAccentMat,
    0.01 * scale,
    0.47 * scale,
    -0.02 * scale,
    0.21 * scale,
    0.17 * scale,
    0.2 * scale,
  );

  group.add(tree);
}

function addParkBench(
  group: THREE.Group,
  mats: BuildingMaterialLibrary,
  x: number,
  y: number,
  z: number,
  ry = 0,
) {
  const bench = new THREE.Group();
  bench.position.set(x, y, z);
  bench.rotation.y = ry;

  // Seat planks aligned to WORLD_SCALE.benchSeatHeightU (~0.075u)
  addPart(bench, _box1, mats.woodMat, 0, 0.072, -0.01, 0.25, 0.024, 0.085);
  // Slatted backrest on +Z outer side so seated citizens face -Z
  addPart(bench, _box1, mats.woodMat, 0, 0.125, 0.038, 0.24, 0.06, 0.02);
  // Steel frame legs & side armrests
  addPart(bench, _box1, mats.metalSteelMat, -0.098, 0.036, 0, 0.024, 0.072, 0.082);
  addPart(bench, _box1, mats.metalSteelMat, 0.098, 0.036, 0, 0.024, 0.072, 0.082);
  addPart(bench, _box1, mats.metalSteelMat, -0.115, 0.098, 0.004, 0.02, 0.018, 0.082);
  addPart(bench, _box1, mats.metalSteelMat, 0.115, 0.098, 0.004, 0.02, 0.018, 0.082);

  group.add(bench);
}

function addHedgeAndFlowerbed(
  group: THREE.Group,
  mats: BuildingMaterialLibrary,
  x: number,
  y: number,
  z: number,
  w = 0.42,
  d = 0.14,
  withFlowers = true,
) {
  addPart(group, _bevelBox1, mats.parkGrassMat, x, y + 0.06, z, w, 0.11, d);
  if (withFlowers) {
    addPart(group, _sphere1, mats.amberAccentMat, x - w * 0.22, y + 0.12, z, 0.06, 0.05, 0.06);
    addPart(group, _sphere1, mats.redAccentMat, x + w * 0.2, y + 0.12, z, 0.06, 0.05, 0.06);
  }
}

function addWindowWithTrim(
  group: THREE.Group,
  mats: BuildingMaterialLibrary,
  winMat: THREE.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  shutterMat?: THREE.Material,
) {
  addPart(group, _box1, mats.concreteMat, x, y - h * 0.52, z + 0.015, w + 0.06, 0.03, 0.05);
  addPart(group, _box1, mats.concreteMat, x, y + h * 0.52, z + 0.012, w + 0.05, 0.024, 0.042);
  addPart(group, _box1, winMat, x, y, z, w, h, 0.035);
  if (shutterMat) {
    addPart(group, _box1, shutterMat, x - w * 0.62, y, z + 0.006, 0.055, h, 0.025);
    addPart(group, _box1, shutterMat, x + w * 0.62, y, z + 0.006, 0.055, h, 0.025);
  }
}

function buildConstructionSiteGroup(
  g: THREE.Group,
  mats: BuildingMaterialLibrary,
  stage: BuildingLifecycleStage,
  progress: number,
) {
  addPart(g, _box1, mats.darkConcreteMat, 0, 0.04, 0, 1.78, 0.08, 1.78);
  // Safety fencing (tapume)
  addPart(g, _box1, mats.amberAccentMat, 0, 0.14, 0.84, 1.66, 0.16, 0.04);
  addPart(g, _box1, mats.amberAccentMat, 0, 0.14, -0.84, 1.66, 0.16, 0.04);
  addPart(g, _box1, mats.amberAccentMat, -0.84, 0.14, 0, 0.04, 0.16, 1.66);
  addPart(g, _box1, mats.amberAccentMat, 0.84, 0.14, 0, 0.04, 0.16, 1.66);

  // Foundation slab & scaffolding poles
  addPart(g, _bevelBox1, mats.concreteMat, 0, 0.12, 0, 1.24, 0.1, 1.18);
  const frameH = stage === 'under_construction' ? 0.55 + (progress / 100) * 0.75 : 0.42;
  for (const [px, pz] of [
    [-0.55, -0.5],
    [0.55, -0.5],
    [-0.55, 0.5],
    [0.55, 0.5],
  ]) {
    addPart(g, _cyl1, mats.metalSteelMat, px, 0.12 + frameH * 0.5, pz, 0.032, frameH, 0.032);
  }
  if (stage === 'under_construction') {
    addPart(g, _bevelBox1, mats.brickMat, 0, 0.12 + frameH * 0.4, 0, 1.02, frameH * 0.72, 0.94);
    addPart(g, _box1, mats.woodMat, 0, 0.14 + frameH * 0.82, 0.52, 1.16, 0.04, 0.14);
  } else {
    // Stacked materials & mini site shed
    addPart(g, _box1, mats.brickMat, -0.34, 0.24, 0.22, 0.34, 0.2, 0.28);
    addPart(g, _box1, mats.woodMat, 0.32, 0.24, -0.22, 0.36, 0.22, 0.26);
  }
  // Small tower crane mast
  addPart(g, _box1, mats.amberAccentMat, 0.44, 0.65, -0.35, 0.08, 1.15, 0.08);
  addPart(g, _box1, mats.amberAccentMat, 0.18, 1.22, -0.35, 0.92, 0.06, 0.06);
}

/**
 * Creates a detailed Brazilian architectural 3D building group grounded at y = 0.
 * Deterministic seeded variations prevent flickering across grid updates.
 */
export function buildProceduralBuildingMesh(
  type: BuildingTypeId,
  level: 1 | 2 | 3,
  mats: BuildingMaterialLibrary,
  ctx?: BuildingVisualContext,
): THREE.Group {
  const g = new THREE.Group();
  const seed = Math.abs(Math.round(ctx?.seed ?? 17));
  const cond = ctx?.condition ?? 90;
  const pollution = ctx?.pollution ?? 5;
  const operational = (ctx?.powered ?? true) && (ctx?.watered ?? true);
  const degraded = cond < 48 || pollution > 36;
  const lvlBonus = (level - 1) * 0.34;

  const wallMat = degraded
    ? mats.weatheredConcreteMat
    : mats.stuccoWarmMats[seed % mats.stuccoWarmMats.length];
  const roofMat = seed % 3 === 0 ? mats.slateRoofMat : mats.terracottaRoofMat;
  const winMat = operational ? mats.facadeWindowMat : mats.facadeUnlitMat;
  const lawnMat = degraded ? mats.weatheredConcreteMat : mats.parkGrassMat;

  addContactShadow(g, mats.shadowPlaneMat, 1.9);

  if (
    ctx?.constructionStage === 'construction_site' ||
    ctx?.constructionStage === 'under_construction'
  ) {
    buildConstructionSiteGroup(g, mats, ctx.constructionStage, ctx.constructionProgress ?? 30);
    return g;
  }

  switch (type) {
    case 'prefeitura': {
      // Civic Palace: granite plinth, portico columns, grand glazed hall, modernist clock/dome tower, Brazilian flag
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.06, 0, 1.84, 0.12, 1.72);
      addPart(g, _box1, mats.concreteMat, 0, 0.14, 0.78, 0.9, 0.06, 0.24);
      addPart(g, _box1, mats.concreteMat, 0, 0.62, -0.08, 1.54, 0.88, 1.12);
      addPart(g, _box1, winMat, 0, 0.66, 0.49, 1.4, 0.68, 0.05);
      addPart(g, _box1, mats.glassMat, 0, 0.34, 0.52, 0.46, 0.44, 0.06);
      for (const cx of [-0.56, -0.22, 0.22, 0.56]) {
        addPart(g, _cyl1, mats.concreteMat, cx, 0.6, 0.6, 0.055, 0.84, 0.055);
      }
      addPart(g, _box1, mats.slateRoofMat, 0, 1.1, 0.06, 1.66, 0.1, 1.38);
      addPart(g, _cyl1, mats.concreteMat, 0, 1.38, -0.06, 0.32, 0.46, 0.32);
      addPart(g, _cyl1, mats.goldAccentMat, 0, 1.7, -0.06, 0.26, 0.24, 0.26);
      addPart(g, _cyl1, mats.metalSteelMat, 0, 2.02, -0.06, 0.022, 0.48, 0.022);
      addPart(g, _box1, mats.emeraldAccentMat, 0.12, 2.16, -0.06, 0.24, 0.15, 0.02);
      addPart(g, _box1, mats.goldAccentMat, 0.12, 2.16, -0.058, 0.11, 0.08, 0.025);
      break;
    }

    case 'rede_energia': {
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.05, 0, 1.78, 0.1, 1.78);
      addPerimeterWallAndGate(g, mats, mats.concreteMat, 1.7, 1.7, 0.26);
      addPart(g, _box1, mats.concreteMat, -0.42, 0.38, -0.35, 0.66, 0.56, 0.66);
      addPart(g, _box1, mats.metalCorrugatedMat, -0.42, 0.68, -0.35, 0.7, 0.06, 0.7);
      // HV Transformers with radiator fins & ceramic bushings
      for (const tz of [-0.36, 0.24]) {
        addPart(g, _box1, mats.metalSteelMat, 0.34, 0.4, tz, 0.42, 0.54, 0.34);
        addPart(g, _cyl1, mats.amberAccentMat, 0.24, 0.74, tz, 0.03, 0.16, 0.03);
        addPart(g, _cyl1, mats.amberAccentMat, 0.42, 0.74, tz, 0.03, 0.16, 0.03);
      }
      addPart(g, _cyl1, mats.metalSteelMat, -0.05, 0.96, 0.36, 0.05, 1.56, 0.05);
      addPart(g, _box1, mats.goldAccentMat, -0.05, 1.5, 0.36, 1.15, 0.07, 0.07);
      break;
    }

    case 'saneamento': {
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.05, 0, 1.8, 0.1, 1.8);
      addPerimeterWallAndGate(g, mats, mats.concreteMat, 1.72, 1.72, 0.2);
      // Twin circular clarifier tanks with scraper bridge
      for (const tx of [-0.38, 0.38]) {
        addPart(g, _cyl1, mats.concreteMat, tx, 0.26, 0.28, 0.38, 0.34, 0.38);
        addPart(g, _cyl1, mats.waterPoolMat, tx, 0.44, 0.28, 0.33, 0.03, 0.33);
        addPart(g, _box1, mats.metalSteelMat, tx, 0.47, 0.28, 0.68, 0.04, 0.08);
      }
      addPart(g, _box1, mats.blueAccentMat, -0.34, 0.38, -0.4, 0.72, 0.54, 0.56);
      addPart(g, _cyl1, mats.metalSteelMat, 0.42, 0.74, -0.4, 0.11, 1.28, 0.11);
      addPart(g, _cyl1, mats.blueAccentMat, 0.42, 1.42, -0.4, 0.3, 0.4, 0.3);
      break;
    }

    case 'casa_popular': {
      // Pilot Neighborhood Home: masonry base plinth, framed door + stoop, flowerbox, veranda eaves & multi-cluster tree
      const h = 0.54 + lvlBonus * 0.42;
      const variant = seed % 4;
      const xShift = variant === 0 ? -0.08 : variant === 1 ? 0.08 : 0;
      addPart(g, _bevelBox1, lawnMat, 0, 0.03, 0, 1.72, 0.06, 1.72);
      addPart(g, _box1, mats.concreteMat, xShift * 0.5, 0.055, 0.38, 0.46, 0.045, 0.94); // Front walkway to open gate
      addPerimeterWallAndGate(g, mats, wallMat, 1.62, 1.62, 0.18);

      // Masonry plinth & main beveled house volume
      addPart(g, _box1, mats.brickMat, xShift, 0.09, -0.08, 1.1, 0.08, 0.96);
      addPart(g, _bevelBox1, wallMat, xShift, 0.08 + h / 2, -0.08, 1.08, h, 0.94);

      if (variant === 2 || variant === 0) {
        // Front shaded veranda porch with timber posts
        addPart(g, _bevelBox1, mats.concreteMat, xShift, 0.085, 0.45, 0.92, 0.055, 0.24);
        addPart(g, _cyl1, mats.woodMat, xShift - 0.38, 0.27, 0.52, 0.028, 0.34, 0.028);
        addPart(g, _cyl1, mats.woodMat, xShift + 0.38, 0.27, 0.52, 0.028, 0.34, 0.028);
        addPart(g, _box1, roofMat, xShift, 0.45, 0.46, 0.98, 0.045, 0.28);
      }

      // Eaves cornice trim + pitched roof
      addPart(g, _box1, mats.concreteMat, xShift, 0.075 + h, -0.08, 1.18, 0.04, 1.02);
      if (variant % 2 === 0) {
        addPart(g, _gable1, roofMat, xShift, 0.08 + h, -0.08, 1.24, 0.4, 1.08);
      } else {
        addPart(g, _cone4, roofMat, xShift, 0.08 + h + 0.2, -0.08, 0.94, 0.42, 0.88, Math.PI / 4);
      }

      // Framed doorway (~2.1m real height) & front stoop step
      addPart(g, _box1, mats.concreteMat, xShift - 0.18, 0.09, 0.44, 0.26, 0.05, 0.14);
      addPart(g, _box1, mats.concreteMat, xShift - 0.18, 0.26, 0.385, 0.24, 0.37, 0.03);
      addPart(g, _box1, mats.woodMat, xShift - 0.18, 0.255, 0.395, 0.19, 0.34, 0.035);

      // Window with shutters & flowerbox planter
      addWindowWithTrim(
        g,
        mats,
        operational ? mats.nightGlowMat : mats.darkConcreteMat,
        xShift + 0.2,
        0.31,
        0.39,
        0.24,
        0.19,
        variant === 3 ? mats.blueAccentMat : mats.woodMat,
      );
      addPart(g, _box1, mats.brickMat, xShift + 0.2, 0.17, 0.425, 0.26, 0.05, 0.07);
      addPart(g, _sphere1, mats.amberAccentMat, xShift + 0.15, 0.205, 0.425, 0.05, 0.04, 0.05);
      addPart(g, _sphere1, mats.redAccentMat, xShift + 0.25, 0.205, 0.425, 0.05, 0.04, 0.05);

      if (seed % 2 === 1) {
        addPart(g, _box1, mats.concreteMat, xShift + 0.54, 0.34, -0.1, 0.08, 0.11, 0.14); // AC unit
      }
      addPart(g, _cyl1, mats.blueAccentMat, xShift + 0.32, 0.08 + h + 0.14, -0.32, 0.12, 0.2, 0.12);
      addHedgeAndFlowerbed(g, mats, -0.52, 0.05, 0.58, 0.34, 0.12, true);
      if (seed % 3 !== 2) {
        addBrazilianTree(g, mats, -0.56, 0.05, -0.46, 0.78);
      }
      break;
    }

    case 'casa_media': {
      // Pilot Neighborhood Residence: two-tone warm facade, cornice trim, garage wing, upper glass balcony & pergola
      const h = 0.8 + lvlBonus * 0.52;
      const variant = seed % 3;
      addPart(g, _bevelBox1, lawnMat, 0, 0.03, 0, 1.78, 0.06, 1.78);
      addPart(g, _box1, mats.concreteMat, 0.45, 0.055, 0.24, 0.56, 0.05, 1.22); // Driveway
      addPart(g, _box1, mats.concreteMat, -0.08, 0.055, 0.56, 0.42, 0.045, 0.58); // Walk to front gate
      addPerimeterWallAndGate(g, mats, mats.concreteMat, 1.74, 1.74, 0.2);

      // Lower masonry plinth + main upper facade
      addPart(g, _box1, mats.brickMat, -0.18, 0.12, -0.06, 1.1, 0.12, 1.1);
      addPart(g, _bevelBox1, wallMat, -0.18, 0.08 + h / 2, -0.06, 1.08, h, 1.08);
      addPart(g, _box1, mats.concreteMat, -0.18, 0.08 + h, -0.06, 1.16, 0.045, 1.16);

      // Framed wooden entry door on ground floor
      addPart(g, _box1, mats.concreteMat, -0.18, 0.26, 0.485, 0.24, 0.38, 0.03);
      addPart(g, _box1, mats.woodMat, -0.18, 0.255, 0.495, 0.19, 0.35, 0.035);

      // Garage wing with ribbed metallic door
      addPart(g, _bevelBox1, mats.brickMat, 0.48, 0.27, 0.06, 0.48, 0.44, 0.86);
      addPart(g, _box1, mats.metalSteelMat, 0.48, 0.24, 0.5, 0.38, 0.34, 0.04);
      addPart(g, _box1, mats.concreteMat, 0.48, 0.495, 0.06, 0.52, 0.04, 0.9);

      // Upper balcony with glass railing & shuttered window
      addPart(g, _bevelBox1, mats.concreteMat, -0.18, 0.08 + h * 0.54, 0.54, 0.82, 0.06, 0.24);
      addPart(g, _box1, mats.glassMat, -0.18, 0.08 + h * 0.64, 0.65, 0.78, 0.14, 0.025);
      addWindowWithTrim(g, mats, winMat, -0.18, 0.08 + h * 0.72, 0.48, 0.74, h * 0.32, mats.woodMat);

      if (variant === 0) {
        addPart(g, _gable1, roofMat, -0.18, 0.08 + h, -0.06, 1.22, 0.42, 1.2);
      } else if (variant === 1) {
        addPart(g, _bevelBox1, mats.slateRoofMat, -0.18, 0.08 + h + 0.06, -0.06, 1.2, 0.12, 1.2);
      } else {
        addPart(g, _gable1, mats.terracottaRoofMat, -0.18, 0.08 + h, -0.06, 1.22, 0.34, 1.2);
        addPart(g, _box1, mats.woodMat, 0.48, 0.53, 0.06, 0.5, 0.04, 0.9); // Pergola terrace
      }
      addHedgeAndFlowerbed(g, mats, -0.58, 0.05, 0.56, 0.4, 0.14, true);
      addBrazilianTree(g, mats, -0.64, 0.05, -0.54, 0.88);
      break;
    }

    case 'condominio': {
      // Pilot Neighborhood Condominium: portal entrance + guardhouse, twin balcony towers, pool deck with loungers & trees
      const h = 1.08 + lvlBonus * 0.82;
      addPart(g, _box1, mats.concreteMat, 0, 0.04, 0, 1.84, 0.08, 1.84);
      addPerimeterWallAndGate(g, mats, mats.concreteMat, 1.8, 1.8, 0.24);

      // Guardhouse (guarita) with glass booth & canopy
      addPart(g, _box1, mats.concreteMat, 0, 0.22, 0.72, 0.38, 0.28, 0.24);
      addPart(g, _box1, mats.glassMat, 0, 0.26, 0.84, 0.28, 0.14, 0.025);
      addPart(g, _box1, mats.slateRoofMat, 0, 0.38, 0.74, 0.46, 0.05, 0.32);

      for (const sx of [-0.46, 0.46]) {
        addPart(g, _box1, winMat, sx, 0.08 + h / 2, -0.12, 0.58, h, 1.18);
        addPart(g, _box1, wallMat, sx, 0.08 + h / 2, -0.12, 0.62, h * 0.96, 0.22);
        addPart(g, _box1, mats.concreteMat, sx, 0.08 + h * 0.48, 0.5, 0.44, 0.05, 0.12);
        addPart(g, _box1, mats.glassMat, sx, 0.08 + h * 0.55, 0.55, 0.42, 0.09, 0.02);
        addPart(g, _box1, roofMat, sx, 0.08 + h + 0.07, -0.12, 0.64, 0.14, 1.26);
        addPart(g, _cyl1, mats.blueAccentMat, sx + 0.1, 0.08 + h + 0.2, -0.35, 0.12, 0.16, 0.12);
      }

      // Central pool deck with water + loungers & parasol
      addPart(g, _box1, mats.waterPoolMat, 0, 0.09, 0.06, 0.26, 0.03, 0.54);
      addPart(g, _box1, mats.woodMat, -0.07, 0.095, -0.32, 0.1, 0.03, 0.16);
      addPart(g, _box1, mats.woodMat, 0.08, 0.095, -0.32, 0.1, 0.03, 0.16);
      addBrazilianTree(g, mats, 0, 0.07, -0.62, 0.88);
      break;
    }

    case 'predio_residencial': {
      // Contemporary Brazilian High-Rise Apartment Building: garage podium, recessed balconies, concrete fins, rooftop penthouses & water tank
      const h = 1.95 + lvlBonus * 1.45;
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.12, 0, 1.72, 0.24, 1.72);
      addPart(g, _box1, mats.glassMat, 0, 0.16, 0.87, 0.7, 0.22, 0.04); // Lobby entrance
      addPart(g, _box1, winMat, 0, 0.24 + h / 2, 0, 1.24, h, 1.24);
      // Structural concrete vertical fins & protruding balconies
      addPart(g, _box1, wallMat, 0, 0.24 + h / 2, 0, 1.32, h * 0.98, 0.22);
      addPart(g, _box1, wallMat, 0, 0.24 + h / 2, 0, 0.22, h * 0.98, 1.32);
      for (const by of [0.32, 0.56, 0.8]) {
        addPart(g, _box1, mats.concreteMat, 0, 0.24 + h * by, 0.66, 0.86, 0.06, 0.14);
        addPart(g, _box1, mats.glassMat, 0, 0.24 + h * by + 0.08, 0.72, 0.84, 0.1, 0.02);
      }
      // Rooftop mechanical crown & elevated water reservoir
      addPart(g, _box1, mats.slateRoofMat, 0, 0.24 + h + 0.12, 0, 0.88, 0.24, 0.88);
      addPart(g, _box1, mats.concreteMat, 0.18, 0.24 + h + 0.34, -0.18, 0.38, 0.26, 0.38);
      addPart(g, _box1, mats.metalSteelMat, -0.22, 0.24 + h + 0.3, 0.18, 0.24, 0.16, 0.24);
      break;
    }

    case 'padaria': {
      // Pilot Neighborhood Bakery: warm brick & stucco body, striped awning, glazed storefront, café terrace umbrella & oven chimney
      const h = 0.66 + lvlBonus * 0.35;
      addPart(g, _box1, mats.concreteMat, 0, 0.04, 0, 1.72, 0.08, 1.72);
      addPart(g, _box1, mats.brickMat, 0, 0.08 + h / 2, -0.08, 1.34, h, 1.08);
      addPart(g, _box1, mats.stuccoWarmMats[0], 0, 0.08 + h * 0.72, -0.08, 1.37, h * 0.34, 1.11);

      // Striped terracotta/cream storefront awning & warm lit display window
      addPart(g, _box1, mats.amberAccentMat, 0, 0.39, 0.56, 1.24, 0.08, 0.26);
      addPart(g, _box1, mats.stuccoWarmMats[0], -0.32, 0.395, 0.56, 0.22, 0.085, 0.265);
      addPart(g, _box1, mats.stuccoWarmMats[0], 0.32, 0.395, 0.56, 0.22, 0.085, 0.265);
      addPart(g, _box1, operational ? mats.nightGlowMat : mats.glassMat, -0.14, 0.24, 0.47, 0.68, 0.26, 0.04);
      addPart(g, _box1, mats.woodMat, 0.38, 0.24, 0.47, 0.2, 0.34, 0.04); // Framed bakery entrance door
      addPart(g, _box1, mats.redAccentMat, 0, 0.53, 0.51, 0.9, 0.12, 0.05); // Signboard
      addPart(g, _gable1, mats.terracottaRoofMat, 0, 0.08 + h, -0.08, 1.42, 0.32, 1.18);
      addPart(g, _cyl1, mats.brickMat, -0.4, 0.08 + h + 0.24, -0.32, 0.11, 0.38, 0.11);

      // Sidewalk café bistro table & umbrella on front terrace
      addPart(g, _cyl1, mats.woodMat, -0.44, 0.14, 0.68, 0.13, 0.025, 0.13);
      addPart(g, _cyl1, mats.metalSteelMat, -0.44, 0.22, 0.68, 0.022, 0.28, 0.022);
      addPart(g, _coneRound, mats.redAccentMat, -0.44, 0.38, 0.68, 0.22, 0.11, 0.22);
      break;
    }

    case 'mercado': {
      const h = 0.76 + lvlBonus * 0.4;
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.04, 0, 1.82, 0.08, 1.82); // Parking apron
      addPart(g, _box1, wallMat, 0, 0.08 + h / 2, -0.08, 1.54, h, 1.28);
      addPart(g, _box1, mats.blueAccentMat, 0, 0.08 + h + 0.09, -0.08, 1.6, 0.16, 1.36);
      addPart(g, _box1, mats.glassMat, 0, 0.36, 0.58, 1.14, 0.46, 0.08);
      addPart(g, _box1, mats.amberAccentMat, 0, 0.72, 0.6, 0.92, 0.14, 0.06);
      addPart(g, _box1, mats.metalSteelMat, -0.58, 0.26, -0.68, 0.34, 0.34, 0.2); // Loading dock
      break;
    }

    case 'restaurante': {
      const h = 0.68 + lvlBonus * 0.38;
      addPart(g, _box1, mats.woodMat, 0, 0.04, 0, 1.76, 0.08, 1.76);
      addPart(g, _box1, mats.brickMat, 0, 0.08 + h / 2, -0.22, 1.4, h, 0.96);
      addPart(g, _gable1, mats.terracottaRoofMat, 0, 0.08 + h, -0.22, 1.48, 0.32, 1.06);
      addPart(g, _box1, operational ? mats.nightGlowMat : mats.glassMat, 0, 0.36, 0.27, 1.12, 0.38, 0.05);
      for (const ux of [-0.46, 0, 0.46]) {
        addPart(g, _cyl1, mats.metalSteelMat, ux, 0.28, 0.58, 0.025, 0.42, 0.025);
        addPart(g, _coneRound, ux === 0 ? mats.amberAccentMat : mats.redAccentMat, ux, 0.5, 0.58, 0.24, 0.13, 0.24);
      }
      break;
    }

    case 'loja': {
      const h = 1.08 + lvlBonus * 0.62;
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.04, 0, 1.72, 0.08, 1.72);
      addPart(g, _box1, winMat, 0, 0.08 + h / 2, 0, 1.42, h, 1.3);
      addPart(g, _box1, mats.glassMat, 0, 0.28, 0.67, 1.28, 0.4, 0.08);
      addPart(g, _box1, seed % 2 === 0 ? mats.amberAccentMat : mats.blueAccentMat, 0, 0.56, 0.69, 1.18, 0.13, 0.06);
      addPart(g, _box1, mats.slateRoofMat, 0, 0.08 + h + 0.08, 0, 1.5, 0.14, 1.38);
      addPart(g, _box1, mats.metalSteelMat, 0.45, 0.08 + h + 0.2, -0.25, 0.26, 0.14, 0.26);
      break;
    }

    case 'shopping': {
      const h = 1.42 + lvlBonus * 0.84;
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.06, 0, 1.9, 0.12, 1.9);
      addPart(g, _box1, mats.concreteMat, 0, 0.12 + h * 0.44, 0, 1.7, h * 0.86, 1.54);
      addPart(g, _box1, mats.glassMat, 0, 0.12 + h * 0.54, 0, 0.88, h * 0.94, 1.62);
      addPart(g, _box1, mats.amberAccentMat, 0, 0.46, 0.82, 1.2, 0.14, 0.26);
      addPart(g, _box1, operational ? mats.coolNightGlowMat : mats.glassMat, 0, 0.92, 0.8, 0.95, 0.18, 0.05);
      addPart(g, _box1, mats.metalSteelMat, -0.5, 0.12 + h * 0.94, -0.35, 0.38, 0.18, 0.46);
      addPart(g, _box1, mats.metalSteelMat, 0.5, 0.12 + h * 0.94, -0.35, 0.38, 0.18, 0.46);
      break;
    }

    case 'fabrica_pequena': {
      const h = 0.74 + lvlBonus * 0.36;
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.04, 0, 1.78, 0.08, 1.78);
      addPart(g, _box1, mats.brickMat, 0, 0.08 + h / 2, -0.05, 1.44, h, 1.24);
      // Sawtooth industrial roof ridges
      addPart(g, _gable1, mats.metalCorrugatedMat, -0.34, 0.08 + h, -0.05, 0.62, 0.26, 1.24);
      addPart(g, _gable1, mats.metalCorrugatedMat, 0.34, 0.08 + h, -0.05, 0.62, 0.26, 1.24);
      addPart(g, _cyl1, mats.darkConcreteMat, 0.52, 0.08 + h + 0.5, -0.44, 0.13, 0.98, 0.13);
      addPart(g, _box1, mats.metalSteelMat, -0.32, 0.28, 0.58, 0.44, 0.38, 0.06); // Dock gate
      break;
    }

    case 'galpao': {
      const h = 0.86 + lvlBonus * 0.4;
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.04, 0, 1.84, 0.08, 1.84);
      addPart(g, _box1, mats.metalCorrugatedMat, 0, 0.08 + h / 2, -0.1, 1.56, h, 1.26);
      addPart(g, _gable1, mats.slateRoofMat, 0, 0.08 + h, -0.1, 1.62, 0.28, 1.32);
      addPart(g, _box1, mats.amberAccentMat, -0.38, 0.28, 0.54, 0.38, 0.44, 0.06);
      addPart(g, _box1, mats.amberAccentMat, 0.38, 0.28, 0.54, 0.38, 0.44, 0.06);
      // Parked freight container
      addPart(g, _box1, mats.blueAccentMat, -0.42, 0.22, 0.74, 0.48, 0.24, 0.22);
      break;
    }

    case 'centro_logistico': {
      const h = 0.92 + lvlBonus * 0.45;
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.04, 0, 1.88, 0.08, 1.88);
      addPart(g, _box1, mats.metalCorrugatedMat, -0.12, 0.08 + h / 2, -0.18, 1.52, h, 1.12);
      addPart(g, _box1, mats.blueAccentMat, 0.54, 0.46, 0.36, 0.52, 0.74, 0.56);
      addPart(g, _box1, winMat, 0.54, 0.52, 0.65, 0.42, 0.52, 0.04);
      addPart(g, _box1, mats.slateRoofMat, -0.12, 0.08 + h + 0.06, -0.18, 1.58, 0.12, 1.18);
      for (const bx of [-0.62, -0.22, 0.18]) {
        addPart(g, _box1, mats.concreteMat, bx, 0.24, 0.46, 0.22, 0.28, 0.36); // Docked trailers
        addPart(g, _box1, mats.redAccentMat, bx, 0.22, 0.7, 0.2, 0.22, 0.14); // Truck cab
      }
      break;
    }

    case 'industria': {
      const h = 1.08 + lvlBonus * 0.55;
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.05, 0, 1.9, 0.1, 1.9);
      addPart(g, _box1, mats.metalCorrugatedMat, -0.24, 0.1 + h / 2, 0, 1.08, h, 1.36);
      addPart(g, _cyl1, mats.metalSteelMat, 0.54, 0.68, -0.36, 0.26, 1.2, 0.26);
      addPart(g, _cyl1, mats.metalSteelMat, 0.54, 0.68, 0.36, 0.26, 1.2, 0.26);
      addPart(g, _cyl1, mats.brickMat, -0.5, 0.1 + h + 0.58, -0.44, 0.13, 1.2, 0.13);
      addPart(g, _cyl1, mats.brickMat, -0.1, 0.1 + h + 0.58, -0.44, 0.13, 1.2, 0.13);
      addPart(g, _box1, mats.amberAccentMat, 0.15, 0.96, 0, 0.72, 0.12, 0.16);
      break;
    }

    case 'posto_saude': {
      addPart(g, _box1, mats.concreteMat, 0, 0.04, 0, 1.7, 0.08, 1.7);
      addPart(g, _box1, mats.stuccoWarmMats[0], 0, 0.38, 0, 1.4, 0.58, 1.12);
      addPart(g, _box1, mats.redAccentMat, 0, 0.72, 0, 1.46, 0.1, 1.18);
      addPart(g, _box1, mats.glassMat, 0, 0.32, 0.57, 0.65, 0.34, 0.06);
      addPart(g, _box1, mats.redAccentMat, 0, 0.54, 0.58, 0.1, 0.28, 0.04);
      addPart(g, _box1, mats.redAccentMat, 0, 0.54, 0.58, 0.28, 0.1, 0.04);
      break;
    }

    case 'escola': {
      const h = 0.72 + lvlBonus * 0.35;
      addPart(g, _box1, mats.concreteMat, 0, 0.04, 0, 1.82, 0.08, 1.82);
      addPart(g, _box1, wallMat, -0.5, 0.08 + h / 2, 0, 0.52, h, 1.4);
      addPart(g, _box1, wallMat, 0.5, 0.08 + h / 2, 0, 0.52, h, 1.4);
      addPart(g, _box1, winMat, 0, 0.08 + h / 2, -0.46, 0.74, h, 0.48);
      addPart(g, _gable1, mats.terracottaRoofMat, -0.5, 0.08 + h, 0, 0.58, 0.24, 1.46);
      addPart(g, _gable1, mats.terracottaRoofMat, 0.5, 0.08 + h, 0, 0.58, 0.24, 1.46);
      // School quadra poliesportiva
      addPart(g, _box1, mats.blueAccentMat, 0, 0.09, 0.26, 0.48, 0.03, 0.68);
      break;
    }

    case 'delegacia': {
      const h = 0.76 + lvlBonus * 0.35;
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.04, 0, 1.74, 0.08, 1.74);
      addPart(g, _box1, mats.concreteMat, 0, 0.08 + h / 2, 0, 1.42, h, 1.2);
      addPart(g, _box1, mats.blueAccentMat, 0, 0.08 + h - 0.1, 0, 1.46, 0.18, 1.24);
      addPart(g, _box1, mats.glassMat, 0, 0.34, 0.62, 0.68, 0.38, 0.08);
      addPart(g, _cyl1, mats.metalSteelMat, 0.46, 0.08 + h + 0.36, -0.36, 0.035, 0.72, 0.035);
      addPart(g, _box1, mats.blueAccentMat, -0.48, 0.18, 0.74, 0.36, 0.14, 0.18); // Viatura estacionada
      break;
    }

    case 'bombeiros': {
      const h = 0.74 + lvlBonus * 0.3;
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.04, 0, 1.78, 0.08, 1.78);
      addPart(g, _box1, mats.brickMat, -0.14, 0.08 + h / 2, 0, 1.18, h, 1.28);
      addPart(g, _box1, mats.redAccentMat, -0.36, 0.3, 0.66, 0.36, 0.44, 0.06);
      addPart(g, _box1, mats.redAccentMat, 0.12, 0.3, 0.66, 0.36, 0.44, 0.06);
      addPart(g, _box1, mats.concreteMat, 0.56, 0.76, -0.24, 0.4, 1.42, 0.4);
      addPart(g, _box1, mats.redAccentMat, 0.56, 1.52, -0.24, 0.46, 0.12, 0.46);
      break;
    }

    case 'hospital': {
      const h = 1.7 + lvlBonus * 0.9;
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.06, 0, 1.86, 0.12, 1.86);
      addPart(g, _box1, mats.concreteMat, 0, 0.36, 0, 1.6, 0.52, 1.5);
      addPart(g, _box1, mats.redAccentMat, 0, 0.32, 0.78, 0.56, 0.16, 0.18); // Emergency entrance canopy
      addPart(g, _box1, winMat, 0, 0.5 + h / 2, 0, 0.66, h, 1.26);
      addPart(g, _box1, winMat, 0, 0.5 + h / 2, 0, 1.26, h, 0.66);
      addPart(g, _cyl1, mats.darkConcreteMat, 0, 0.5 + h + 0.05, 0, 0.48, 0.08, 0.48); // Helipad
      addPart(g, _box1, mats.redAccentMat, 0, 0.5 + h + 0.11, 0, 0.35, 0.03, 0.08);
      addPart(g, _box1, mats.redAccentMat, 0, 0.5 + h + 0.11, 0, 0.08, 0.03, 0.35);
      break;
    }

    case 'centro_profissionalizante': {
      const h = 1.0 + lvlBonus * 0.5;
      addPart(g, _box1, mats.concreteMat, 0, 0.05, 0, 1.82, 0.1, 1.82);
      addPart(g, _box1, winMat, -0.24, 0.1 + h / 2, -0.16, 1.16, h, 1.02);
      addPart(g, _box1, mats.blueAccentMat, 0.48, 0.42, 0.32, 0.64, 0.66, 0.78);
      addPart(g, _box1, mats.glassMat, -0.24, 0.1 + h + 0.1, -0.16, 0.96, 0.18, 0.78);
      break;
    }

    case 'praca': {
      // Pilot Neighborhood Plaza: stone crosspaths, tiered fountain, slatted benches & 4 organic multi-cluster trees
      addPart(g, _bevelBox1, mats.concreteMat, 0, 0.04, 0, 1.86, 0.08, 1.86);
      addPart(g, _bevelBox1, lawnMat, 0, 0.082, 0, 1.48, 0.028, 1.48);
      // Stone crosspaths connecting all 4 street edges to central fountain circle
      addPart(g, _box1, mats.concreteMat, 0, 0.095, 0, 0.34, 0.018, 1.82);
      addPart(g, _box1, mats.concreteMat, 0, 0.095, 0, 1.82, 0.018, 0.34);
      addPart(g, _cyl1, mats.concreteMat, 0, 0.096, 0, 0.42, 0.02, 0.42);
      // Tiered central stone fountain
      addPart(g, _cyl1, mats.concreteMat, 0, 0.16, 0, 0.38, 0.14, 0.38);
      addPart(g, _cyl1, mats.waterPoolMat, 0, 0.24, 0, 0.31, 0.036, 0.31);
      addPart(g, _cyl1, mats.concreteMat, 0, 0.36, 0, 0.085, 0.24, 0.085);
      addPart(g, _cyl1, mats.concreteMat, 0, 0.43, 0, 0.15, 0.03, 0.15);
      // Park benches facing central fountain (aligned with worldRegistry InteractionSpots)
      addParkBench(g, mats, 0, 0.09, 0.5, 0);
      addParkBench(g, mats, 0, 0.09, -0.5, Math.PI);
      addParkBench(g, mats, 0.5, 0.09, 0, Math.PI / 2);
      addParkBench(g, mats, -0.5, 0.09, 0, -Math.PI / 2);
      addHedgeAndFlowerbed(g, mats, -0.55, 0.08, 0.24, 0.22, 0.12, true);
      addHedgeAndFlowerbed(g, mats, 0.55, 0.08, -0.24, 0.22, 0.12, true);
      for (const [tx, tz] of [
        [-0.6, -0.6],
        [0.6, -0.6],
        [-0.6, 0.6],
        [0.6, 0.6],
      ]) {
        addBrazilianTree(g, mats, tx, 0.08, tz, 1.05);
      }
      break;
    }

    case 'parque': {
      addPart(g, _bevelBox1, lawnMat, 0, 0.05, 0, 1.9, 0.1, 1.9);
      addPart(g, _cyl1, mats.waterPoolMat, 0.3, 0.11, 0.28, 0.5, 0.03, 0.44);
      addPart(g, _cyl1, mats.woodMat, -0.35, 0.24, -0.25, 0.28, 0.3, 0.28);
      addPart(g, _coneRound, mats.terracottaRoofMat, -0.35, 0.46, -0.25, 0.36, 0.22, 0.36);
      addParkBench(g, mats, 0.02, 0.1, 0.54, -0.35);
      addParkBench(g, mats, 0.52, 0.1, -0.18, Math.PI * 0.45);
      for (const [tx, tz, sc] of [
        [-0.65, 0.48, 1.05],
        [-0.18, 0.62, 0.9],
        [0.62, -0.55, 1.2],
        [0.18, -0.62, 0.95],
        [-0.68, -0.62, 1.1],
      ]) {
        addBrazilianTree(g, mats, tx, 0.09, tz, sc);
      }
      break;
    }

    case 'centro_esportivo': {
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.04, 0, 1.84, 0.08, 1.84);
      addPart(g, _box1, mats.concreteMat, 0, 0.42, -0.28, 1.5, 0.64, 0.92);
      addPart(g, _box1, mats.blueAccentMat, 0, 0.78, -0.28, 1.56, 0.16, 0.98);
      addPart(g, _box1, mats.terracottaRoofMat, 0, 0.09, 0.48, 1.4, 0.03, 0.66);
      break;
    }

    case 'estadio': {
      addPart(g, _box1, mats.darkConcreteMat, 0, 0.06, 0, 1.92, 0.12, 1.92);
      addPart(g, _box1, mats.concreteMat, 0, 0.38, -0.68, 1.74, 0.58, 0.38);
      addPart(g, _box1, mats.concreteMat, 0, 0.38, 0.68, 1.74, 0.58, 0.38);
      addPart(g, _box1, mats.concreteMat, -0.68, 0.38, 0, 0.38, 0.58, 1.15);
      addPart(g, _box1, mats.concreteMat, 0.68, 0.38, 0, 0.38, 0.58, 1.15);
      addPart(g, _box1, mats.emeraldAccentMat, 0, 0.13, 0, 1.0, 0.04, 0.96);
      for (const [fx, fz] of [
        [-0.78, -0.78],
        [0.78, -0.78],
        [-0.78, 0.78],
        [0.78, 0.78],
      ]) {
        addPart(g, _cyl1, mats.metalSteelMat, fx, 0.64, fz, 0.04, 1.08, 0.04);
        addPart(g, _box1, mats.coolNightGlowMat, fx, 1.2, fz, 0.2, 0.12, 0.08);
      }
      break;
    }

    default: {
      addPart(g, _box1, mats.concreteMat, 0, 0.35, 0, 1.2, 0.7, 1.2);
      break;
    }
  }

  return g;
}

/**
 * Small procedural camp / protest tents when a tile has an active land conflict.
 */
export function buildConflictMarkerMesh(mats: BuildingMaterialLibrary): THREE.Group {
  const g = new THREE.Group();
  addContactShadow(g, mats.shadowPlaneMat, 1.4);
  addPart(g, _cone4, mats.amberAccentMat, -0.35, 0.22, -0.2, 0.32, 0.42, 0.32, Math.PI / 4);
  addPart(g, _cone4, mats.blueAccentMat, 0.32, 0.2, 0.25, 0.28, 0.38, 0.28, 0.2);
  addPart(g, _cyl1, mats.woodMat, 0, 0.45, -0.45, 0.03, 0.9, 0.03);
  addPart(g, _box1, mats.redAccentMat, 0.18, 0.8, -0.45, 0.36, 0.2, 0.03);
  return g;
}
