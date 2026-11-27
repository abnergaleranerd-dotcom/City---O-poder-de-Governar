import * as THREE from 'three';
import { GRID_SIZE, TileData } from '../types/game';
import type { QualityProfile } from './graphicsConfig';
import type { ProceduralTextureSet } from './proceduralTextures';
import { groundHeightAt, tileToWorld } from './terrainAndRoads';

export interface NaturalEnvironmentRig {
  syncVegetationForTiles: (tiles: TileData[]) => void;
  update: (
    timeSec: number,
    daylight: number,
    sunsetFactor: number,
    nightGlow: number,
    skyColor: THREE.Color,
    sunDir: THREE.Vector3,
  ) => void;
  dispose: () => void;
}

function hashTile(x: number, z: number, salt = 17): number {
  let n = Math.imul(x + 31, 374761393) + Math.imul(z + 53, 668265263) + Math.imul(salt, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

const SKY_VERT = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uNightFactor;
  uniform float uSunsetFactor;
  varying vec3 vWorldDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float h = clamp(dir.y, 0.0, 1.0);
    float horizonPow = pow(1.0 - h, 2.6);
    vec3 col = mix(uZenithColor, uHorizonColor, horizonPow);

    // Subtle atmospheric sun halo & disc
    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    float halo = pow(sunDot, 12.0) * (0.28 + uSunsetFactor * 0.45);
    float disc = smoothstep(0.9965, 0.9992, sunDot) * (1.0 - uNightFactor * 0.8);
    col += uSunColor * (halo + disc * 1.4);

    // Crisp stars only at night high above horizon
    if (uNightFactor > 0.15 && dir.y > 0.08) {
      vec2 starUv = floor(dir.xz / max(0.15, dir.y + 0.35) * 140.0);
      float r = hash(starUv);
      if (r > 0.9945) {
        float twinkle = (r - 0.9945) * 180.0 * uNightFactor * smoothstep(0.08, 0.45, dir.y);
        col += vec3(0.85, 0.92, 1.0) * twinkle;
      }
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createNaturalEnvironment(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
  profile: QualityProfile,
  isSoftwareGl: boolean,
  initialTiles: TileData[],
): NaturalEnvironmentRig {
  const windUniform = { value: 0 };

  const attachWindSway = (mat: THREE.MeshStandardMaterial, amplitude: number) => {
    if (!profile.enableWindSway) return;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = windUniform;
      shader.vertexShader =
        `uniform float uWindTime;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          float swayHeight = max(0.0, transformed.y + 0.4);
          vec4 instPos = vec4(0.0);
          #ifdef USE_INSTANCING
            instPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          #endif
          float phase = instPos.x * 0.45 + instPos.z * 0.35 + uWindTime * 1.85;
          transformed.x += sin(phase) * swayHeight * ${amplitude.toFixed(4)};
          transformed.z += cos(phase * 0.85) * swayHeight * ${(amplitude * 0.65).toFixed(4)};
          `,
        );
    };
    mat.customProgramCacheKey = () => `wind_sway_${amplitude.toFixed(3)}`;
  };

  // 1. Atmospheric Sky Dome
  const skyGeo = new THREE.SphereGeometry(185, 28, 18);
  const skyUniforms = {
    uZenithColor: { value: new THREE.Color(0x4b89c8) },
    uHorizonColor: { value: new THREE.Color(0xb6d6ea) },
    uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.4).normalize() },
    uSunColor: { value: new THREE.Color(0xfff1d0) },
    uNightFactor: { value: 0.0 },
    uSunsetFactor: { value: 0.0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.frustumCulled = false;
  scene.add(skyDome);

  // 2. Animated Coastal Bay & Horizon Water
  const bayGeo = new THREE.PlaneGeometry(240, 120, isSoftwareGl ? 16 : 40, isSoftwareGl ? 12 : 24);
  bayGeo.rotateX(-Math.PI / 2);

  const bayMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b5f7a,
    normalMap: textures.waterNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.14,
    metalness: 0.18,
    clearcoat: isSoftwareGl ? 0.25 : 0.92,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 0.93,
  });

  if (profile.enableWindSway && !isSoftwareGl) {
    bayMat.onBeforeCompile = (shader) => {
      shader.uniforms.uWaveTime = windUniform;
      shader.vertexShader =
        `uniform float uWaveTime;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          float w = sin(transformed.x * 0.32 + uWaveTime * 1.4) * 0.045
                  + cos(transformed.z * 0.44 - uWaveTime * 1.1) * 0.035;
          transformed.y += w;
          `,
        );
    };
    bayMat.customProgramCacheKey = () => 'bay_wave_v1';
  }

  const bayMesh = new THREE.Mesh(bayGeo, bayMat);
  bayMesh.position.set(0, -0.02, 82.2);
  bayMesh.receiveShadow = profile.shadowsEnabled;
  scene.add(bayMesh);

  // Subtle translucent shallow-water strip hugging the southern beach
  const shallowGeo = new THREE.PlaneGeometry(240, 5.2);
  shallowGeo.rotateX(-Math.PI / 2);
  const shallowMat = new THREE.MeshStandardMaterial({
    color: 0x2299ad,
    roughness: 0.22,
    metalness: 0.05,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  const shallowMesh = new THREE.Mesh(shallowGeo, shallowMat);
  shallowMesh.position.set(0, 0.005, 24.4);
  scene.add(shallowMesh);

  // 3. Multi-Species Brazilian Vegetation (Broad-canopy Ipês/Forest + Palms + Perimeter Rocks)
  const maxWildTrees = Math.round(520 * profile.vegetationDensity);
  const maxPalms = Math.round(130 * profile.vegetationDensity);
  const maxRocks = Math.round(70 * profile.vegetationDensity);

  const barkMat = new THREE.MeshStandardMaterial({ color: 0x62442c, roughness: 0.92, metalness: 0.02 });
  const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5c3e, roughness: 0.9, metalness: 0.02 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, metalness: 0.02 });
  const palmFrondMat = new THREE.MeshStandardMaterial({ color: 0x4b7f36, roughness: 0.78, metalness: 0.02 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d726e, roughness: 0.92, metalness: 0.04 });

  attachWindSway(crownMat, 0.045);
  attachWindSway(palmFrondMat, 0.065);

  const trunkGeo = new THREE.CylinderGeometry(0.065, 0.115, 0.72, 6);
  const crownGeoA = new THREE.IcosahedronGeometry(0.38, 1);
  const crownGeoB = new THREE.IcosahedronGeometry(0.28, 1);
  const palmFrondGeo = new THREE.ConeGeometry(0.46, 0.22, 6);
  const rockGeo = new THREE.DodecahedronGeometry(0.32, 0);

  const trunkInst = new THREE.InstancedMesh(trunkGeo, barkMat, Math.max(1, maxWildTrees));
  const crownAInst = new THREE.InstancedMesh(crownGeoA, crownMat, Math.max(1, maxWildTrees));
  const crownBInst = new THREE.InstancedMesh(crownGeoB, crownMat, Math.max(1, maxWildTrees));
  const palmTrunkInst = new THREE.InstancedMesh(trunkGeo, palmTrunkMat, Math.max(1, maxPalms));
  const palmFrondInst = new THREE.InstancedMesh(palmFrondGeo, palmFrondMat, Math.max(1, maxPalms));
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(1, maxRocks));

  [trunkInst, crownAInst, crownBInst, palmTrunkInst, palmFrondInst, rockInst].forEach((inst) => {
    inst.castShadow = profile.shadowsEnabled;
    inst.receiveShadow = profile.shadowsEnabled;
    scene.add(inst);
  });
  rockInst.castShadow = false;

  // Precompute deterministic outer highland trees & coastal rocks (static across tile edits)
  interface TreeSpot {
    wx: number;
    wy: number;
    wz: number;
    sc: number;
    rot: number;
    colorHex: number;
  }
  const outerTrees: TreeSpot[] = [];
  const outerRocks: { wx: number; wy: number; wz: number; sx: number; sy: number; sz: number; rot: number }[] = [];

  const canopyPalette = [
    0x3a6e34, // Mata Atlântica deep green
    0x4a7f3c, // Tropical mid green
    0x558c42, // Sunlit canopy
    0x3f6939, // Olive highland green
    0xe0b422, // Ipê Amarelo (sparse blossom)
    0xd66d93, // Ipê Rosa (sparse blossom)
  ];

  const halfPlayable = (GRID_SIZE * 2) / 2; // 24
  for (let i = 0; i < 950 && outerTrees.length < Math.round(maxWildTrees * 0.72); i++) {
    const angle = (i * 2.3999632) % (Math.PI * 2);
    const radius = 26.5 + Math.pow((i * 19 % 100) / 100, 0.85) * 48;
    const wx = Math.cos(angle) * radius;
    const wz = Math.sin(angle) * radius;
    if (wz > 21.8) continue; // Keep southern bay & beach open
    if (Math.abs(wx) <= halfPlayable + 0.6 && wz >= -halfPlayable - 0.6) continue;

    const wy = groundHeightAt(wx, wz, initialTiles);
    if (wy > 13.5) continue; // Rocky mountain peaks stay bare above treeline

    const r1 = hashTile(Math.round(wx), Math.round(wz), 71);
    const sc = 0.85 + r1 * 0.75;
    const colIdx = r1 > 0.94 ? 4 : r1 > 0.89 ? 5 : Math.floor(r1 * 12) % 4;
    outerTrees.push({
      wx,
      wy,
      wz,
      sc,
      rot: r1 * Math.PI * 2,
      colorHex: canopyPalette[colIdx],
    });
  }

  for (let i = 0; i < maxRocks; i++) {
    const r1 = hashTile(i, 9, 103);
    const r2 = hashTile(i, 21, 137);
    const isShoreRock = i % 2 === 0;
    const wx = isShoreRock
      ? -42 + r1 * 84
      : (r1 < 0.5 ? -1 : 1) * (27 + r2 * 24);
    const wz = isShoreRock
      ? 22.8 + (r2 - 0.5) * 2.2
      : -46 + r2 * 64;
    const wy = groundHeightAt(wx, wz, initialTiles);
    outerRocks.push({
      wx,
      wy: wy + 0.05,
      wz,
      sx: 0.8 + r1 * 1.6,
      sy: 0.45 + r2 * 0.85,
      sz: 0.75 + ((r1 + r2) * 0.5) * 1.4,
      rot: r1 * Math.PI * 2,
    });
  }

  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  // Populate static rocks once
  let rockCount = 0;
  for (const rk of outerRocks) {
    if (rockCount >= maxRocks) break;
    dummy.position.set(rk.wx, rk.wy, rk.wz);
    dummy.rotation.set(rk.rot * 0.2, rk.rot, rk.rot * 0.15);
    dummy.scale.set(rk.sx, rk.sy, rk.sz);
    dummy.updateMatrix();
    rockInst.setMatrixAt(rockCount++, dummy.matrix);
  }
  rockInst.count = rockCount;
  rockInst.instanceMatrix.needsUpdate = true;
  rockInst.computeBoundingSphere();

  const syncVegetationForTiles = (tiles: TileData[]) => {
    let tCount = 0;
    let pCount = 0;

    // 1. Place outer highland trees
    for (const ot of outerTrees) {
      if (tCount >= maxWildTrees) break;
      dummy.position.set(ot.wx, ot.wy + 0.34 * ot.sc, ot.wz);
      dummy.rotation.set(0, ot.rot, 0);
      dummy.scale.set(ot.sc, ot.sc, ot.sc);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(tCount, dummy.matrix);

      dummy.position.set(ot.wx, ot.wy + 0.76 * ot.sc, ot.wz);
      dummy.scale.set(ot.sc * 1.08, ot.sc * 0.92, ot.sc * 1.05);
      dummy.updateMatrix();
      crownAInst.setMatrixAt(tCount, dummy.matrix);

      dummy.position.set(
        ot.wx + Math.cos(ot.rot) * 0.14 * ot.sc,
        ot.wy + 0.94 * ot.sc,
        ot.wz + Math.sin(ot.rot) * 0.14 * ot.sc,
      );
      dummy.scale.set(ot.sc * 0.9, ot.sc * 0.82, ot.sc * 0.9);
      dummy.updateMatrix();
      crownBInst.setMatrixAt(tCount, dummy.matrix);

      tmpColor.setHex(ot.colorHex);
      crownAInst.setColorAt(tCount, tmpColor);
      tmpColor.offsetHSL(0, 0, 0.04);
      crownBInst.setColorAt(tCount, tmpColor);
      tCount++;
    }

    // 2. Organic vegetation on vacant playable tiles (clear automatically when built upon!)
    for (const tile of tiles) {
      if (tile.building || tile.road !== 'none' || tile.conflict) continue;
      const [wx, wz] = tileToWorld(tile.x, tile.z);
      const r = hashTile(tile.x, tile.z, 311);

      if (tile.terrain === 'waterfront') {
        if (r > 0.48 && pCount < maxPalms) {
          const wy = groundHeightAt(wx, wz, tiles);
          const ox = (hashTile(tile.x, tile.z, 401) - 0.5) * 0.9;
          const oz = (hashTile(tile.x, tile.z, 409) - 0.5) * 0.7;
          const sc = 0.85 + r * 0.45;
          dummy.position.set(wx + ox, wy + 0.45 * sc, wz + oz);
          dummy.rotation.set((r - 0.5) * 0.12, r * Math.PI * 2, (r - 0.5) * 0.12);
          dummy.scale.set(sc * 0.75, sc * 1.45, sc * 0.75);
          dummy.updateMatrix();
          palmTrunkInst.setMatrixAt(pCount, dummy.matrix);

          dummy.position.set(wx + ox, wy + 0.98 * sc, wz + oz);
          dummy.rotation.set(0, r * Math.PI * 2, 0);
          dummy.scale.set(sc * 1.15, sc * 0.95, sc * 1.15);
          dummy.updateMatrix();
          palmFrondInst.setMatrixAt(pCount, dummy.matrix);
          pCount++;
        }
        continue;
      }

      // Coastal avenue or inner vacant greens get sparse Brazilian trees
      const spawnThreshold = tile.terrain === 'hill' ? 0.44 : tile.terrain === 'fertile' ? 0.64 : 0.78;
      if (r > spawnThreshold && tCount < maxWildTrees) {
        const subCount = tile.terrain === 'hill' && r > 0.78 ? 2 : 1;
        for (let k = 0; k < subCount && tCount < maxWildTrees; k++) {
          const r2 = hashTile(tile.x * 7 + k, tile.z * 11 + k, 503);
          const ox = (r2 - 0.5) * 1.1;
          const oz = (hashTile(tile.x + k, tile.z * 3, 521) - 0.5) * 1.1;
          const px = wx + ox;
          const pz = wz + oz;
          const wy = groundHeightAt(px, pz, tiles);
          const sc = 0.68 + r2 * 0.45;

          dummy.position.set(px, wy + 0.34 * sc, pz);
          dummy.rotation.set(0, r2 * Math.PI * 2, 0);
          dummy.scale.set(sc, sc, sc);
          dummy.updateMatrix();
          trunkInst.setMatrixAt(tCount, dummy.matrix);

          dummy.position.set(px, wy + 0.74 * sc, pz);
          dummy.scale.set(sc * 1.05, sc * 0.9, sc * 1.05);
          dummy.updateMatrix();
          crownAInst.setMatrixAt(tCount, dummy.matrix);

          dummy.position.set(px + 0.1 * sc, wy + 0.9 * sc, pz + 0.08 * sc);
          dummy.scale.set(sc * 0.85, sc * 0.8, sc * 0.85);
          dummy.updateMatrix();
          crownBInst.setMatrixAt(tCount, dummy.matrix);

          const colIdx = r2 > 0.92 ? 4 : r2 > 0.86 ? 5 : Math.floor(r2 * 10) % 4;
          tmpColor.setHex(canopyPalette[colIdx]);
          crownAInst.setColorAt(tCount, tmpColor);
          tmpColor.offsetHSL(0, 0, 0.05);
          crownBInst.setColorAt(tCount, tmpColor);
          tCount++;
        }
      }
    }

    // Coastal avenue ornamental palms
    for (const tile of tiles) {
      if (tile.road === 'avenida' && (tile.x + tile.z) % 3 === 0 && pCount < maxPalms) {
        const [wx, wz] = tileToWorld(tile.x, tile.z);
        const wy = groundHeightAt(wx, wz, tiles) + 0.06;
        const sc = 0.72;
        dummy.position.set(wx, wy + 0.4 * sc, wz);
        dummy.rotation.set(0, (tile.x + tile.z) * 0.8, 0);
        dummy.scale.set(sc * 0.65, sc * 1.35, sc * 0.65);
        dummy.updateMatrix();
        palmTrunkInst.setMatrixAt(pCount, dummy.matrix);

        dummy.position.set(wx, wy + 0.9 * sc, wz);
        dummy.scale.set(sc * 0.95, sc * 0.85, sc * 0.95);
        dummy.updateMatrix();
        palmFrondInst.setMatrixAt(pCount, dummy.matrix);
        pCount++;
      }
    }

    trunkInst.count = tCount;
    crownAInst.count = tCount;
    crownBInst.count = tCount;
    palmTrunkInst.count = pCount;
    palmFrondInst.count = pCount;

    [trunkInst, crownAInst, crownBInst, palmTrunkInst, palmFrondInst].forEach((inst) => {
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
    });
    if (crownAInst.instanceColor) crownAInst.instanceColor.needsUpdate = true;
    if (crownBInst.instanceColor) crownBInst.instanceColor.needsUpdate = true;
  };

  syncVegetationForTiles(initialTiles);

  const zenithDay = new THREE.Color(0x3a7bc8);
  const zenithSunset = new THREE.Color(0x4b4275);
  const zenithNight = new THREE.Color(0x060c1a);
  const sunWarm = new THREE.Color(0xffdfa8);
  const sunSunsetCol = new THREE.Color(0xff8c42);
  const sunMoonCol = new THREE.Color(0x9fb8df);
  const waterDay = new THREE.Color(0x0d6b86);
  const waterSunset = new THREE.Color(0x2d4f6e);
  const waterNight = new THREE.Color(0x071929);

  const update = (
    timeSec: number,
    daylight: number,
    sunsetFactor: number,
    nightGlow: number,
    skyColor: THREE.Color,
    sunDir: THREE.Vector3,
  ) => {
    windUniform.value = timeSec;

    // Gentle scrolling of normal maps across bay water
    textures.waterNormal.offset.x = (timeSec * 0.015) % 1;
    textures.waterNormal.offset.y = (timeSec * 0.009) % 1;

    bayMat.color
      .copy(waterNight)
      .lerp(waterDay, daylight)
      .lerp(waterSunset, sunsetFactor * 0.45);
    shallowMat.opacity = 0.22 + daylight * 0.34;

    skyUniforms.uZenithColor.value
      .copy(zenithNight)
      .lerp(zenithDay, daylight)
      .lerp(zenithSunset, sunsetFactor * 0.55);
    skyUniforms.uHorizonColor.value.copy(skyColor);
    skyUniforms.uSunDir.value.copy(sunDir).normalize();
    skyUniforms.uSunColor.value
      .copy(sunMoonCol)
      .lerp(sunWarm, daylight)
      .lerp(sunSunsetCol, sunsetFactor * 0.8);
    skyUniforms.uNightFactor.value = nightGlow;
    skyUniforms.uSunsetFactor.value = sunsetFactor;
  };

  return {
    syncVegetationForTiles,
    update,
    dispose: () => {
      [
        skyDome,
        bayMesh,
        shallowMesh,
        trunkInst,
        crownAInst,
        crownBInst,
        palmTrunkInst,
        palmFrondInst,
        rockInst,
      ].forEach((m) => scene.remove(m));
      skyGeo.dispose();
      skyMat.dispose();
      bayGeo.dispose();
      bayMat.dispose();
      shallowGeo.dispose();
      shallowMat.dispose();
      trunkGeo.dispose();
      crownGeoA.dispose();
      crownGeoB.dispose();
      palmFrondGeo.dispose();
      rockGeo.dispose();
      barkMat.dispose();
      palmTrunkMat.dispose();
      crownMat.dispose();
      palmFrondMat.dispose();
      rockMat.dispose();
    },
  };
}
