import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  BUILDING_CATALOG,
  CameraMode,
  GRID_SIZE,
  TILE_WORLD_SIZE,
  ThematicMapMode,
  TileData,
} from '../types/game';
import { evaluateBuildPlacement, getNavigationCache, useGameStore } from '../store/useGameStore';
import {
  CityAssetManager,
  LOCAL_ASSET_MANIFEST,
  detectGraphicsCapabilities,
  getQualityProfile,
} from './assetLoader';
import { createProceduralTextures } from './proceduralTextures';
import {
  buildConflictMarkerMesh,
  buildProceduralBuildingMesh,
  createBuildingMaterialLibrary,
} from './buildingModels';
import {
  buildConnectedRoadNetwork,
  createContinuousTerrain,
  getTilePadElevation,
  groundHeightAt,
  tileToWorld,
  worldToTile,
} from './terrainAndRoads';
import { createTrafficAndCitizenSystem } from './entities3D';
import { createNaturalEnvironment } from './environment3D';
import { ambientAudioEngine } from '../audio/ambientAudio';

// Module-scope reusable math objects for zero GC inside render loop
const _vec3 = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _sunDir = new THREE.Vector3(0.4, 0.75, 0.3);
const _skyColor = new THREE.Color();

// 6-phase realistic Brazilian sky & sun palette
const _skyMadrugada = new THREE.Color(0x091326);
const _skyAmanhecer = new THREE.Color(0xd99b7e);
const _skyManha = new THREE.Color(0x8ec3e8);
const _skyMeioDia = new THREE.Color(0x9bd0f2);
const _skyEntardecer = new THREE.Color(0xdf885f);
const _skyAnoitecer = new THREE.Color(0x1f2b4d);

const _sunMadrugada = new THREE.Color(0x6988bd);
const _sunAmanhecer = new THREE.Color(0xffb47a);
const _sunManha = new THREE.Color(0xfff5e4);
const _sunMeioDia = new THREE.Color(0xfffaf0);
const _sunEntardecer = new THREE.Color(0xff8e4c);
const _sunAnoitecer = new THREE.Color(0x7c8db8);

function sampleSixPhaseAtmosphere(hourOfDay: number): {
  sky: THREE.Color;
  sun: THREE.Color;
  daylight: number;
  sunsetFactor: number;
  nightGlow: number;
} {
  const h = ((hourOfDay % 24) + 24) % 24;

  // Determine 6 phases:
  // 0..5 Madrugada | 5..7 Amanhecer | 7..11 Manhã | 11..15 Meio-dia | 15..18.5 Entardecer | 18.5..21 Anoitecer | 21..24 Madrugada
  const sky = _skyColor;
  const sun = new THREE.Color();
  let daylight = 1;
  let sunsetFactor = 0;

  if (h < 5) {
    sky.copy(_skyMadrugada);
    sun.copy(_sunMadrugada);
    daylight = 0.0;
  } else if (h < 7) {
    const t = (h - 5) / 2;
    if (t < 0.5) {
      sky.copy(_skyMadrugada).lerp(_skyAmanhecer, t * 2);
      sun.copy(_sunMadrugada).lerp(_sunAmanhecer, t * 2);
    } else {
      sky.copy(_skyAmanhecer).lerp(_skyManha, (t - 0.5) * 2);
      sun.copy(_sunAmanhecer).lerp(_sunManha, (t - 0.5) * 2);
    }
    daylight = THREE.MathUtils.smoothstep(h, 5, 7.2) * 0.78;
    sunsetFactor = Math.sin(t * Math.PI) * 0.85;
  } else if (h < 11) {
    const t = (h - 7) / 4;
    sky.copy(_skyManha).lerp(_skyMeioDia, t);
    sun.copy(_sunManha).lerp(_sunMeioDia, t);
    daylight = 0.78 + t * 0.22;
  } else if (h < 15) {
    sky.copy(_skyMeioDia);
    sun.copy(_sunMeioDia);
    daylight = 1.0;
  } else if (h < 18.5) {
    const t = (h - 15) / 3.5;
    if (t < 0.65) {
      const k = t / 0.65;
      sky.copy(_skyMeioDia).lerp(_skyEntardecer, k);
      sun.copy(_sunMeioDia).lerp(_sunEntardecer, k);
      sunsetFactor = k;
    } else {
      const k = (t - 0.65) / 0.35;
      sky.copy(_skyEntardecer).lerp(_skyAnoitecer, k);
      sun.copy(_sunEntardecer).lerp(_sunAnoitecer, k);
      sunsetFactor = 1 - k * 0.35;
    }
    daylight = 1.0 - t * 0.75;
  } else if (h < 21) {
    const t = (h - 18.5) / 2.5;
    sky.copy(_skyAnoitecer).lerp(_skyMadrugada, t);
    sun.copy(_sunAnoitecer).lerp(_sunMadrugada, t);
    daylight = (1 - t) * 0.25;
    sunsetFactor = (1 - t) * 0.35;
  } else {
    sky.copy(_skyMadrugada);
    sun.copy(_sunMadrugada);
    daylight = 0.0;
  }

  const nightGlow = THREE.MathUtils.clamp((0.46 - daylight) * 2.25, 0, 1);
  return { sky, sun, daylight, sunsetFactor, nightGlow };
}

function getCameraLimits(mode: CameraMode, isSoftwareGl: boolean) {
  if (mode === 'drone') {
    return {
      minDistance: 4.5,
      maxDistance: 52,
      minPolarAngle: 0.14,
      maxPolarAngle: Math.PI * 0.47,
      dampingFactor: isSoftwareGl ? 0.12 : 0.06,
    };
  }
  if (mode === 'follow') {
    return {
      minDistance: 3.8,
      maxDistance: 24,
      minPolarAngle: 0.22,
      maxPolarAngle: Math.PI * 0.45,
      dampingFactor: 0.08,
    };
  }
  return {
    minDistance: 10,
    maxDistance: 78,
    minPolarAngle: 0.25,
    maxPolarAngle: Math.PI * 0.42,
    dampingFactor: isSoftwareGl ? 0.12 : 0.07,
  };
}

export const CityViewport: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [recoveryEpoch, setRecoveryEpoch] = useState(0);
  const graphicsQuality = useGameStore((s) => s.graphicsQuality);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const caps = detectGraphicsCapabilities();
    const isSoftwareGl = caps.isSoftwareGl;
    const profile = getQualityProfile(graphicsQuality, isSoftwareGl);

    // 1. Initialize Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setContextLost(true);
      return;
    }

    const initW = Math.max(1, container.clientWidth);
    const initH = Math.max(1, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap));
    renderer.setSize(initW, initH);
    renderer.shadowMap.enabled = profile.shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    let rafId = 0;
    let timeoutId = 0;
    let disposed = false;
    let isContextLost = false;

    const onContextLost = (e: Event) => {
      e.preventDefault();
      isContextLost = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      setContextLost(true);
    };
    const onContextRestored = () => {
      if (disposed) return;
      isContextLost = false;
      setContextLost(false);
      setRecoveryEpoch((v) => v + 1);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8ec3e8);
    scene.fog = new THREE.FogExp2(0x8ec3e8, profile.fogDensity);

    // 2. HDRI / IBL Environment Lighting
    const assetManager = new CityAssetManager(renderer);
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    let envTexture: THREE.Texture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.72;
    pmremGenerator.dispose();

    if (LOCAL_ASSET_MANIFEST.environmentHdr) {
      void assetManager.loadEnvironmentHdr(LOCAL_ASSET_MANIFEST.environmentHdr, renderer).then((hdr) => {
        if (hdr && !disposed) {
          envTexture.dispose();
          envTexture = hdr;
          scene.environment = hdr;
        }
      });
    }

    const camera = new THREE.PerspectiveCamera(42, initW / initH, 0.4, 280);
    camera.position.set(24, 23, 24);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !isSoftwareGl;
    const initLimits = getCameraLimits(useGameStore.getState().cameraMode, isSoftwareGl);
    controls.dampingFactor = initLimits.dampingFactor;
    controls.minDistance = initLimits.minDistance;
    controls.maxDistance = initLimits.maxDistance;
    controls.minPolarAngle = initLimits.minPolarAngle;
    controls.maxPolarAngle = initLimits.maxPolarAngle;
    controls.target.set(0, 0.1, 0);
    controls.update();

    // 3. Selective Post-Processing (GPU-gated on Ultra only)
    let composer: EffectComposer | null = null;
    let bloomPass: UnrealBloomPass | null = null;
    if (profile.enablePostProcessing && !isSoftwareGl) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(initW, initH), 0.28, 0.55, 0.88);
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
    }

    // 4. Outdoor Sun, Sky Hemisphere & Rim Lighting
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x3b4d34, 0.82);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff4de, 1.9);
    sunLight.position.set(28, 38, 22);
    sunLight.castShadow = profile.shadowsEnabled;
    sunLight.shadow.mapSize.width = profile.shadowMapSize;
    sunLight.shadow.mapSize.height = profile.shadowMapSize;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 125;
    const d = 34;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.00045;
    sunLight.shadow.normalBias = 0.025;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0xbfdbfe, 0.38);
    rimLight.position.set(-24, 18, -26);
    scene.add(rimLight);

    // 5. Textures, PBR Material Library, Terrain, Roads, Environment & Entities
    const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), profile.anisotropyCap);
    const textures = createProceduralTextures(maxAniso, profile.textureSize);
    const mats = createBuildingMaterialLibrary(textures, isSoftwareGl);

    const initialState = useGameStore.getState();
    const terrainRig = createContinuousTerrain(scene, textures, initialState.tiles);
    const envRig = createNaturalEnvironment(scene, textures, profile, isSoftwareGl, initialState.tiles);
    const trafficAndCitizens = createTrafficAndCitizenSystem(scene, isSoftwareGl);

    const roadGroup = new THREE.Group();
    scene.add(roadGroup);
    let roadBuildResult = buildConnectedRoadNetwork(
      roadGroup,
      initialState.tiles,
      textures,
      mats,
      initialState.economy.budgetTransit,
    );

    const buildingsGroup = new THREE.Group();
    scene.add(buildingsGroup);

    // 6. Selection Rings & Placement Ghost Preview
    const ringGeo = new THREE.RingGeometry(0.84, 0.98, 4);
    const selectRingMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const selectRing = new THREE.Mesh(ringGeo, selectRingMat);
    selectRing.rotation.x = -Math.PI / 2;
    selectRing.rotation.z = Math.PI / 4;
    selectRing.visible = false;
    scene.add(selectRing);

    const citizenRingGeo = new THREE.RingGeometry(0.22, 0.34, 24);
    const citizenRing = new THREE.Mesh(citizenRingGeo, selectRingMat);
    citizenRing.rotation.x = -Math.PI / 2;
    citizenRing.visible = false;
    scene.add(citizenRing);

    const ghostHolder = new THREE.Group();
    ghostHolder.visible = false;
    scene.add(ghostHolder);
    const ghostPadGeo = new THREE.PlaneGeometry(TILE_WORLD_SIZE * 0.94, TILE_WORLD_SIZE * 0.94);
    const ghostPadMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const ghostPad = new THREE.Mesh(ghostPadGeo, ghostPadMat);
    ghostPad.rotation.x = -Math.PI / 2;
    ghostPad.position.y = 0.03;
    ghostHolder.add(ghostPad);

    const halfPad = TILE_WORLD_SIZE * 0.48;
    const ghostOutlineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-halfPad, 0.055, -halfPad),
      new THREE.Vector3(halfPad, 0.055, -halfPad),
      new THREE.Vector3(halfPad, 0.055, halfPad),
      new THREE.Vector3(-halfPad, 0.055, halfPad),
    ]);
    const ghostOutlineMat = new THREE.LineBasicMaterial({ color: 0x22c55e });
    const ghostOutline = new THREE.LineLoop(ghostOutlineGeo, ghostOutlineMat);
    ghostHolder.add(ghostOutline);

    // 3D Facade Orientation Arrow (points out of front entrance +Z in local mesh space)
    const ghostArrowGroup = new THREE.Group();
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const arrowShaftGeo = new THREE.BoxGeometry(0.11, 0.05, 0.36);
    const arrowShaft = new THREE.Mesh(arrowShaftGeo, arrowMat);
    arrowShaft.position.set(0, 0.08, halfPad + 0.14);
    const arrowHeadGeo = new THREE.ConeGeometry(0.16, 0.28, 4);
    const arrowHead = new THREE.Mesh(arrowHeadGeo, arrowMat);
    arrowHead.rotation.x = Math.PI / 2;
    arrowHead.rotation.y = Math.PI / 4;
    arrowHead.position.set(0, 0.08, halfPad + 0.42);
    ghostArrowGroup.add(arrowShaft, arrowHead);
    ghostHolder.add(ghostArrowGroup);

    const ghostBuildingGroup = new THREE.Group();
    ghostHolder.add(ghostBuildingGroup);
    const ghostClonedMaterials: THREE.Material[] = [];

    // Citizen planned route visual ribbon
    const routeGeo = new THREE.BufferGeometry();
    const routeMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
    });
    const routeLine = new THREE.Line(routeGeo, routeMat);
    routeLine.visible = false;
    scene.add(routeLine);

    // Optional Diagnostics Overlay (WorldRegistry Colliders, Graphs, Spots, NPC Capsules & Trails)
    const debugGroup = new THREE.Group();
    debugGroup.visible = false;
    scene.add(debugGroup);
    const debugDynamicGroup = new THREE.Group();
    debugGroup.add(debugDynamicGroup);

    const pedDebugMat = new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.65 });
    const roadDebugMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.72 });
    const colliderDebugMat = new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.78 });
    const spotDebugMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 });
    const npcCapsuleDebugMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.85 });
    const npcTrailDebugMat = new THREE.LineBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.75 });
    const collisionHitDebugMat = new THREE.LineBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.95 });

    const dynNpcGeo = new THREE.BufferGeometry();
    const dynTrailGeo = new THREE.BufferGeometry();
    const dynHitGeo = new THREE.BufferGeometry();
    const dynNpcLines = new THREE.LineSegments(dynNpcGeo, npcCapsuleDebugMat);
    const dynTrailLines = new THREE.LineSegments(dynTrailGeo, npcTrailDebugMat);
    const dynHitLines = new THREE.LineSegments(dynHitGeo, collisionHitDebugMat);
    dynNpcLines.frustumCulled = false;
    dynTrailLines.frustumCulled = false;
    dynHitLines.frustumCulled = false;
    debugDynamicGroup.add(dynNpcLines, dynTrailLines, dynHitLines);

    let lastDebugGridVersion = -1;

    const rebuildDebugGraphLines = () => {
      // Remove static debug line segments while keeping debugDynamicGroup
      for (let i = debugGroup.children.length - 1; i >= 0; i--) {
        const ch = debugGroup.children[i];
        if (ch === debugDynamicGroup) continue;
        if ((ch as THREE.LineSegments).geometry) {
          (ch as THREE.LineSegments).geometry.dispose();
        }
        debugGroup.remove(ch);
      }

      const nav = getNavigationCache();
      const pedVerts: number[] = [];
      for (const node of nav.pedestrianGraph.nodes.values()) {
        const [ax, az] = tileToWorld(node.x, node.z);
        for (const edge of node.edges) {
          const nb = nav.pedestrianGraph.nodes.get(edge.to);
          if (!nb || node.id > nb.id) continue;
          const [bx, bz] = tileToWorld(nb.x, nb.z);
          pedVerts.push(ax, 0.22, az, bx, 0.22, bz);
        }
      }
      if (pedVerts.length > 0) {
        const gPed = new THREE.BufferGeometry();
        gPed.setAttribute('position', new THREE.Float32BufferAttribute(pedVerts, 3));
        debugGroup.add(new THREE.LineSegments(gPed, pedDebugMat));
      }

      const roadVerts: number[] = [];
      for (const rn of nav.roadGraph.nodes.values()) {
        const [ax, az] = tileToWorld(rn.x, rn.z);
        for (const nk of rn.neighbors) {
          const nb = nav.roadGraph.nodes.get(nk);
          if (!nb || rn.id > nb.id) continue;
          const [bx, bz] = tileToWorld(nb.x, nb.z);
          roadVerts.push(ax, 0.27, az, bx, 0.27, bz);
        }
      }
      if (roadVerts.length > 0) {
        const gRoad = new THREE.BufferGeometry();
        gRoad.setAttribute('position', new THREE.Float32BufferAttribute(roadVerts, 3));
        debugGroup.add(new THREE.LineSegments(gRoad, roadDebugMat));
      }

      // WorldRegistry solid physical colliders (OBBs & circles)
      const colVerts: number[] = [];
      for (const obj of nav.worldRegistry.objects) {
        if (obj.walkable) continue;
        const [wx, wz] = tileToWorld(obj.x, obj.z);
        const y = 0.26;
        if (obj.shape === 'circle') {
          const r = obj.radius * TILE_WORLD_SIZE;
          const segs = 12;
          for (let i = 0; i < segs; i++) {
            const a0 = (i / segs) * Math.PI * 2;
            const a1 = ((i + 1) / segs) * Math.PI * 2;
            colVerts.push(
              wx + Math.cos(a0) * r, y, wz + Math.sin(a0) * r,
              wx + Math.cos(a1) * r, y, wz + Math.sin(a1) * r,
            );
          }
        } else {
          const hw = obj.halfW * TILE_WORLD_SIZE;
          const hd = obj.halfD * TILE_WORLD_SIZE;
          const c = Math.cos(obj.rotationRad);
          const s = Math.sin(obj.rotationRad);
          const rotPt = (lx: number, lz: number): [number, number] => [
            wx + lx * c + lz * s,
            wz - lx * s + lz * c,
          ];
          const p0 = rotPt(-hw, -hd);
          const p1 = rotPt(hw, -hd);
          const p2 = rotPt(hw, hd);
          const p3 = rotPt(-hw, hd);
          colVerts.push(
            p0[0], y, p0[1], p1[0], y, p1[1],
            p1[0], y, p1[1], p2[0], y, p2[1],
            p2[0], y, p2[1], p3[0], y, p3[1],
            p3[0], y, p3[1], p0[0], y, p0[1],
          );
        }
      }
      if (colVerts.length > 0) {
        const gCol = new THREE.BufferGeometry();
        gCol.setAttribute('position', new THREE.Float32BufferAttribute(colVerts, 3));
        debugGroup.add(new THREE.LineSegments(gCol, colliderDebugMat));
      }

      // InteractionSpots (seats, entrances, bus stops)
      const spotVerts: number[] = [];
      for (const sp of nav.worldRegistry.interactionSpots) {
        const [sx, sz] = tileToWorld(sp.x, sp.z);
        const r = 0.1;
        const y = 0.3;
        spotVerts.push(
          sx - r, y, sz, sx, y, sz + r,
          sx, y, sz + r, sx + r, y, sz,
          sx + r, y, sz, sx, y, sz - r,
          sx, y, sz - r, sx - r, y, sz,
        );
      }
      if (spotVerts.length > 0) {
        const gSpot = new THREE.BufferGeometry();
        gSpot.setAttribute('position', new THREE.Float32BufferAttribute(spotVerts, 3));
        debugGroup.add(new THREE.LineSegments(gSpot, spotDebugMat));
      }
    };

    const updateDynamicDebugOverlay = (
      citizens: typeof initialState.citizens,
    ) => {
      const npcVerts: number[] = [];
      const trailVerts: number[] = [];
      const hitVerts: number[] = [];
      const capR = 0.06 * TILE_WORLD_SIZE;
      const segs = 10;

      for (let ci = 0; ci < citizens.length; ci++) {
        const cit = citizens[ci];
        if (cit.insideBuildingId) continue;
        const [wx, wz] = tileToWorld(cit.x, cit.z);
        const y = 0.25;
        for (let s = 0; s < segs; s++) {
          const a0 = (s / segs) * Math.PI * 2;
          const a1 = ((s + 1) / segs) * Math.PI * 2;
          npcVerts.push(
            wx + Math.cos(a0) * capR, y, wz + Math.sin(a0) * capR,
            wx + Math.cos(a1) * capR, y, wz + Math.sin(a1) * capR,
          );
        }
        if ((cit.blockedTicks ?? 0) > 0) {
          hitVerts.push(
            wx - 0.14, 0.45, wz - 0.14, wx + 0.14, 0.45, wz + 0.14,
            wx + 0.14, 0.45, wz - 0.14, wx - 0.14, 0.45, wz + 0.14,
          );
        }
        if (cit.trailHistory && cit.trailHistory.length >= 2) {
          for (let ti = 0; ti < cit.trailHistory.length - 1; ti++) {
            const [ax, az] = tileToWorld(cit.trailHistory[ti].x, cit.trailHistory[ti].z);
            const [bx, bz] = tileToWorld(cit.trailHistory[ti + 1].x, cit.trailHistory[ti + 1].z);
            trailVerts.push(ax, 0.2, az, bx, 0.2, bz);
          }
        }
        if (cit.path && cit.pathIndex !== undefined && cit.pathIndex < cit.path.length) {
          let px = wx;
          let pz = wz;
          for (let pi = cit.pathIndex; pi < Math.min(cit.path.length, cit.pathIndex + 8); pi++) {
            const [nx, nz] = tileToWorld(cit.path[pi].x, cit.path[pi].z);
            trailVerts.push(px, 0.32, pz, nx, 0.32, nz);
            px = nx;
            pz = nz;
          }
        }
      }

      const nav = getNavigationCache();
      for (const col of nav.worldRegistry.recentCollisions) {
        const [hx, hz] = tileToWorld(col.x, col.z);
        hitVerts.push(
          hx - 0.12, 0.36, hz - 0.12, hx + 0.12, 0.36, hz + 0.12,
          hx + 0.12, 0.36, hz - 0.12, hx - 0.12, 0.36, hz + 0.12,
        );
      }

      dynNpcGeo.setAttribute('position', new THREE.Float32BufferAttribute(npcVerts, 3));
      dynNpcGeo.computeBoundingSphere();
      dynTrailGeo.setAttribute('position', new THREE.Float32BufferAttribute(trailVerts, 3));
      dynTrailGeo.computeBoundingSphere();
      dynHitGeo.setAttribute('position', new THREE.Float32BufferAttribute(hitVerts, 3));
      dynHitGeo.computeBoundingSphere();
    };

    let lastGhostKey = '';
    let lastGridVersion = -1;
    let lastThematicVersion = -1;
    let lastThematicMode: ThematicMapMode = initialState.thematicMode;
    let lastShowGridLines = false;
    let lastCameraMode: CameraMode = initialState.cameraMode;
    let gridSyncSerial = 0;

    const syncGridVisuals = (tiles: TileData[], thematicMode: ThematicMapMode, showGridLines: boolean) => {
      const currentSerial = ++gridSyncSerial;
      const latestEconomy = useGameStore.getState().economy;

      terrainRig.updateTerrainForTiles(tiles);
      terrainRig.updateGridOverlay(tiles, thematicMode, showGridLines);

      roadBuildResult.dispose();
      roadBuildResult = buildConnectedRoadNetwork(
        roadGroup,
        tiles,
        textures,
        mats,
        latestEconomy.budgetTransit,
      );

      envRig.syncVegetationForTiles(tiles);
      trafficAndCitizens.syncRoads(tiles);

      while (buildingsGroup.children.length > 0) {
        buildingsGroup.remove(buildingsGroup.children[0]);
      }

      for (const tile of tiles) {
        const [wx, wz] = tileToWorld(tile.x, tile.z);
        const padY = getTilePadElevation(tile);

        if (tile.building) {
          const b = tile.building;
          const bGroup = buildProceduralBuildingMesh(b.type, b.level, mats, {
            seed: b.variantSeed ?? tile.x * 37 + tile.z * 97 + b.rotation * 13,
            condition: b.condition,
            pollution: tile.pollution,
            powered: b.powered,
            watered: b.watered,
            plannedDistrict: tile.plannedDistrict,
            landValue: tile.landValue,
            constructionStage: b.constructionStage,
            constructionProgress: b.constructionProgress,
          });
          bGroup.position.set(wx, padY, wz);
          bGroup.rotation.y = b.rotation * (Math.PI / 2);
          bGroup.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const m = child as THREE.Mesh;
              if (m.material !== mats.shadowPlaneMat) {
                m.castShadow = profile.shadowsEnabled;
                m.receiveShadow = profile.shadowsEnabled;
              }
            }
          });
          buildingsGroup.add(bGroup);

          // Optional registered local GLTF override (never fires 404 if manifest entry is absent)
          const gltfUrl = LOCAL_ASSET_MANIFEST.buildings[b.type];
          if (assetManager.hasRegisteredAsset(gltfUrl)) {
            void assetManager.loadGltf(`bldg_${b.type}`, gltfUrl).then((loaded) => {
              if (!loaded || disposed || currentSerial !== gridSyncSerial) return;
              buildingsGroup.remove(bGroup);
              loaded.scene.position.set(wx, padY, wz);
              loaded.scene.rotation.y = b.rotation * (Math.PI / 2);
              buildingsGroup.add(loaded.scene);
            });
          }
        } else if (tile.conflict) {
          const cGroup = buildConflictMarkerMesh(mats);
          cGroup.position.set(wx, padY, wz);
          buildingsGroup.add(cGroup);
        }
      }
    };

    // 7. Pointer Raycasting (Click to select tile/citizen/vehicle, Hover for placement preview)
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointerNdc = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let pointerDownButton = -1;
    let lastHoverTime = 0;
    let hoveredTile: [number, number] | null = null;

    const updatePointerNdc = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) {
        pointerDownButton = e.button;
        return;
      }
      pointerDownButton = 0;
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerCancel = () => {
      pointerDownButton = -1;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverTime < 35) return;
      lastHoverTime = now;

      updatePointerNdc(e);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(terrainRig.hitPlaneInst, false);
      const prev = hoveredTile;
      if (hits.length > 0) {
        hoveredTile = worldToTile(hits[0].point.x, hits[0].point.z);
      } else {
        hoveredTile = null;
      }
      const changed =
        (prev === null) !== (hoveredTile === null) ||
        (prev !== null && hoveredTile !== null && (prev[0] !== hoveredTile[0] || prev[1] !== hoveredTile[1]));
      if (changed) {
        useGameStore
          .getState()
          .setHoveredTileCoords(hoveredTile ? { x: hoveredTile[0], z: hoveredTile[1] } : null);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0 || pointerDownButton !== 0) {
        pointerDownButton = -1;
        return;
      }
      pointerDownButton = -1;

      const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moved > 6) return;

      updatePointerNdc(e);
      const state = useGameStore.getState();

      // Check citizen or vehicle proximity picking when in select mode
      if (state.activeTool === 'select') {
        raycaster.setFromCamera(pointerNdc, camera);
        const hits = raycaster.intersectObject(terrainRig.hitPlaneInst, false);
        const hitPoint = hits.length > 0 ? hits[0].point : null;

        if (hitPoint) {
          let closestCitizenId: string | null = null;
          let bestCitizenDist = 0.72;
          for (const cit of state.citizens) {
            if (cit.insideBuildingId) continue;
            const [cx, cz] = tileToWorld(cit.x, cit.z);
            const dist = Math.hypot(hitPoint.x - cx, hitPoint.z - cz);
            if (dist < bestCitizenDist) {
              bestCitizenDist = dist;
              closestCitizenId = cit.id;
            }
          }
          if (closestCitizenId) {
            state.selectCitizen(closestCitizenId);
            return;
          }

          const pickedVehicle = trafficAndCitizens.pickVehicleAt(hitPoint.x, hitPoint.z);
          if (pickedVehicle) {
            state.followVehicle(pickedVehicle.id);
            state.showToast('Acompanhando veículo no trânsito (clique em outro lote ou M para sair).', 'info');
            return;
          }
        }
      }

      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(terrainRig.hitPlaneInst, false);
      if (hits.length > 0) {
        const coords = worldToTile(hits[0].point.x, hits[0].point.z);
        if (coords) {
          state.interactWithTile(coords[0], coords[1]);
        }
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);

    // 8. Keyboard Controls (WASD pan, Space pause, R rotate, Ctrl+Z undo, H Zen, M Drone, Esc cancel)
    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      keys[e.code] = true;
      const store = useGameStore.getState();

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        store.undoLastBuild();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        store.setSpeed(store.speed === 0 ? 1 : 0);
      } else if (e.code === 'KeyR') {
        store.rotateBuildPreview();
      } else if (e.code === 'KeyH') {
        store.toggleZenMode();
      } else if (e.code === 'KeyM') {
        const cur = store.cameraMode;
        store.setCameraMode(cur === 'drone' ? 'strategic' : 'drone');
      } else if (e.code === 'Escape') {
        if (store.pendingDemolition) {
          store.cancelDemolition();
          return;
        }
        store.setActiveTool('select', null);
        store.followVehicle(null);
        store.followCitizen(null);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let activeCamGoal: { target: THREE.Vector3; pos?: THREE.Vector3 } | null = null;
    let lastCamNonce = 0;
    let lastMinimapSyncTime = 0;

    controls.addEventListener('start', () => {
      activeCamGoal = null;
    });

    const onResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (composer) {
        composer.setSize(w, h);
      }
      if (bloomPass) {
        bloomPass.setSize(w, h);
      }
    };
    window.addEventListener('resize', onResize);

    // 9. Main 4D Game & Render Loop
    const clock = new THREE.Clock();
    let elapsedSec = 0;
    let fpsAccumulator = 0;
    let fpsFrames = 0;

    const afterDraw = (cb: () => void) => {
      if (disposed || isContextLost) return;
      const gl = renderer.getContext() as WebGL2RenderingContext | null;
      if (!gl || gl.isContextLost()) return;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed || isContextLost || gl.isContextLost()) {
          if (sync) {
            try {
              gl.deleteSync(sync);
            } catch {
              // Ignore sync cleanup on lost context
            }
          }
          return;
        }
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          timeoutId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          timeoutId = window.setTimeout(cb, 75);
        }
      };
      timeoutId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed || isContextLost) return;
      if (renderer.getContext().isContextLost()) {
        isContextLost = true;
        setContextLost(true);
        return;
      }

      const dt = Math.min(0.1, clock.getDelta());
      elapsedSec += dt;
      const state = useGameStore.getState();

      // Advance simulation
      state.advanceSimulation(dt);
      const updated = useGameStore.getState();

      const showGridLines =
        updated.thematicMode !== 'normal' || updated.activeTool !== 'select';

      // Sync grid, continuous terrain, connected roads, vegetation & buildings when changed
      if (updated.gridVersion !== lastGridVersion) {
        syncGridVisuals(updated.tiles, updated.thematicMode, showGridLines);
        lastGridVersion = updated.gridVersion;
        lastThematicVersion = updated.thematicVersion;
        lastThematicMode = updated.thematicMode;
        lastShowGridLines = showGridLines;
      } else if (
        updated.thematicVersion !== lastThematicVersion ||
        updated.thematicMode !== lastThematicMode ||
        showGridLines !== lastShowGridLines
      ) {
        terrainRig.updateGridOverlay(updated.tiles, updated.thematicMode, showGridLines);
        lastThematicVersion = updated.thematicVersion;
        lastThematicMode = updated.thematicMode;
        lastShowGridLines = showGridLines;
      }

      // 6-Phase Day/Night Atmosphere & Dynamic Sun
      const h = updated.hourOfDay;
      const dayAngle = ((h - 6) / 24) * Math.PI * 2;
      const sunY = Math.sin(dayAngle) * 44;
      const sunX = Math.cos(dayAngle) * 44;
      const sunZ = 18 + Math.cos(dayAngle * 0.5) * 8;
      sunLight.position.set(sunX, Math.max(8, sunY), sunZ);
      _sunDir.set(sunX, Math.max(-6, sunY), sunZ).normalize();

      const atmo = sampleSixPhaseAtmosphere(h);
      (scene.background as THREE.Color).copy(atmo.sky);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(atmo.sky);
        scene.fog.density = profile.fogDensity * (1 + atmo.nightGlow * 0.25);
      }

      sunLight.intensity = 0.28 + atmo.daylight * 1.75;
      sunLight.color.copy(atmo.sun);
      hemiLight.intensity = 0.28 + atmo.daylight * 0.58;
      rimLight.intensity = 0.22 + atmo.daylight * 0.25 + atmo.nightGlow * 0.18;
      scene.environmentIntensity = 0.36 + atmo.daylight * 0.44;

      mats.facadeWindowMat.emissiveIntensity = atmo.nightGlow * 1.25;
      mats.nightGlowMat.emissiveIntensity = 0.1 + atmo.nightGlow * 1.65;
      mats.coolNightGlowMat.emissiveIntensity = 0.15 + atmo.nightGlow * 1.45;
      if (bloomPass) {
        bloomPass.strength = 0.18 + atmo.nightGlow * 0.22 + atmo.sunsetFactor * 0.08;
      }

      envRig.update(elapsedSec, atmo.daylight, atmo.sunsetFactor, atmo.nightGlow, atmo.sky, _sunDir);

      // Pause sync for vehicles and animated citizens
      const simPaused =
        updated.speed === 0 || updated.activeEvent !== null || updated.endGameReport !== null;
      const speedMult = simPaused ? 0 : Math.min(2.5, Math.max(0.5, updated.speed));
      trafficAndCitizens.update(
        dt,
        simPaused,
        speedMult,
        atmo.nightGlow,
        updated.tiles,
        updated.citizens,
        updated.vehicles,
        updated.trafficSignals,
        updated.timeConfig.pedestrianDensity,
        controls.target,
        profile.citizenDetailDistance,
      );

      // Update optional procedural ambient audio
      ambientAudioEngine.update(
        updated.timeConfig.ambientAudioEnabled,
        updated.timeConfig.ambientVolume,
        updated.hourOfDay,
        dt,
        updated.tiles.filter((t) => t.building?.type === 'praca' || t.building?.type === 'parque').length,
      );

      // FPS reporting for diagnostics HUD
      fpsAccumulator += dt;
      fpsFrames += 1;
      if (fpsAccumulator >= 1.2) {
        updated.reportRenderFps(fpsFrames / fpsAccumulator);
        fpsAccumulator = 0;
        fpsFrames = 0;
      }

      // Debug Overlay visibility & sync
      debugGroup.visible = updated.timeConfig.debugOverlay;
      if (debugGroup.visible) {
        if (lastDebugGridVersion !== updated.gridVersion) {
          rebuildDebugGraphLines();
          lastDebugGridVersion = updated.gridVersion;
        }
        updateDynamicDebugOverlay(updated.citizens);
      }

      // Selection Rings & Citizen Planned Route Line
      if (updated.selectedTileCoords) {
        const st = updated.tiles[updated.selectedTileCoords.z * GRID_SIZE + updated.selectedTileCoords.x];
        const [wx, wz] = tileToWorld(updated.selectedTileCoords.x, updated.selectedTileCoords.z);
        const sy = (st ? getTilePadElevation(st) : 0.06) + 0.045;
        selectRing.position.set(wx, sy, wz);
        selectRing.visible = true;
      } else {
        selectRing.visible = false;
      }

      if (updated.selectedCitizenId) {
        const cit = updated.citizens.find((c) => c.id === updated.selectedCitizenId);
        if (cit) {
          const [wx, wz] = tileToWorld(cit.x, cit.z);
          const cy = groundHeightAt(wx, wz, updated.tiles) + 0.05;
          citizenRing.position.set(wx, cy, wz);
          citizenRing.visible = !cit.insideBuildingId;

          if (updated.showCitizenRoute && cit.path && cit.path.length > 0 && !cit.insideBuildingId) {
            const idxStart = Math.max(0, cit.pathIndex ?? 0);
            const pts: number[] = [wx, cy + 0.14, wz];
            for (let pi = idxStart; pi < cit.path.length; pi++) {
              const [px, pz] = tileToWorld(cit.path[pi].x, cit.path[pi].z);
              pts.push(px, groundHeightAt(px, pz, updated.tiles) + 0.19, pz);
            }
            routeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            routeGeo.computeBoundingSphere();
            routeLine.visible = pts.length >= 6;
          } else {
            routeLine.visible = false;
          }
        } else {
          citizenRing.visible = false;
          routeLine.visible = false;
        }
      } else {
        citizenRing.visible = false;
        routeLine.visible = false;
      }

      // Placement Ghost Preview (Translucent 3D Mesh + Green/Red Outline + Facade Arrow)
      if (
        hoveredTile &&
        ((updated.activeTool === 'build' && updated.selectedBuildType) ||
          (updated.activeTool === 'move' && updated.moveSourceTile))
      ) {
        const [hx, hz] = hoveredTile;
        const [wx, wz] = tileToWorld(hx, hz);
        const tile = updated.tiles[hz * GRID_SIZE + hx];
        const previewType =
          updated.activeTool === 'build'
            ? updated.selectedBuildType!
            : updated.tiles[updated.moveSourceTile!.z * GRID_SIZE + updated.moveSourceTile!.x]?.building?.type;

        if (previewType) {
          const placement =
            updated.activeTool === 'build'
              ? evaluateBuildPlacement(
                  updated.tiles,
                  hx,
                  hz,
                  previewType,
                  updated.economy.treasury,
                  updated.developmentLevel,
                  updated.manualBuildRotated,
                  updated.buildRotation,
                )
              : null;

          const effectiveRotation = placement ? placement.effectiveRotation : updated.buildRotation;
          const ghostKey = `${previewType}_${effectiveRotation}`;
          if (ghostKey !== lastGhostKey) {
            while (ghostBuildingGroup.children.length > 0) {
              ghostBuildingGroup.remove(ghostBuildingGroup.children[0]);
            }
            while (ghostClonedMaterials.length > 0) {
              ghostClonedMaterials.pop()?.dispose();
            }
            if (!BUILDING_CATALOG[previewType].isRoad) {
              const previewMesh = buildProceduralBuildingMesh(previewType, 1, mats);
              previewMesh.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                  const m = child as THREE.Mesh;
                  m.castShadow = false;
                  m.receiveShadow = false;
                  if (Array.isArray(m.material)) {
                    m.material = m.material.map((mat) => {
                      const cloned = mat.clone();
                      cloned.transparent = true;
                      cloned.opacity = 0.56;
                      cloned.depthWrite = false;
                      ghostClonedMaterials.push(cloned);
                      return cloned;
                    });
                  } else if (m.material) {
                    const cloned = m.material.clone();
                    cloned.transparent = true;
                    cloned.opacity = 0.56;
                    cloned.depthWrite = false;
                    ghostClonedMaterials.push(cloned);
                    m.material = cloned;
                  }
                }
              });
              previewMesh.rotation.y = effectiveRotation * (Math.PI / 2);
              ghostBuildingGroup.add(previewMesh);
            }
            lastGhostKey = ghostKey;
          }

          const isValid = placement
            ? placement.valid
            : Boolean(
                tile &&
                  !tile.building &&
                  !tile.conflict &&
                  tile.road === 'none' &&
                  (tile.terrain !== 'waterfront' || BUILDING_CATALOG[previewType].category === 'leisure'),
              );

          const statusHex = isValid ? 0x22c55e : 0xef4444;
          (ghostPad.material as THREE.MeshBasicMaterial).color.setHex(statusHex);
          ghostOutlineMat.color.setHex(statusHex);
          ghostArrowGroup.visible = !BUILDING_CATALOG[previewType].isRoad;
          ghostArrowGroup.rotation.y = effectiveRotation * (Math.PI / 2);
          arrowMat.color.setHex(isValid ? 0xf59e0b : 0xef4444);

          const padY = tile ? getTilePadElevation(tile) + 0.025 : 0.06;
          ghostHolder.position.set(wx, padY, wz);
          ghostHolder.visible = true;
        }
      } else {
        ghostHolder.visible = false;
      }

      // Update OrbitControls limits when cameraMode changes
      if (updated.cameraMode !== lastCameraMode) {
        lastCameraMode = updated.cameraMode;
        const lim = getCameraLimits(updated.cameraMode, isSoftwareGl);
        controls.minDistance = lim.minDistance;
        controls.maxDistance = lim.maxDistance;
        controls.minPolarAngle = lim.minPolarAngle;
        controls.maxPolarAngle = lim.maxPolarAngle;
        controls.dampingFactor = lim.dampingFactor;

        if (updated.cameraMode === 'drone' && !updated.followedCitizenId && !updated.followedVehicleId) {
          const dir = camera.position.clone().sub(controls.target);
          dir.y = Math.max(4.5, Math.min(9.5, dir.y * 0.55));
          dir.setLength(Math.min(18, Math.max(8, dir.length() * 0.65)));
          activeCamGoal = {
            target: controls.target.clone(),
            pos: controls.target.clone().add(dir),
          };
        } else if (updated.cameraMode === 'strategic' && !updated.followedCitizenId && !updated.followedVehicleId) {
          const dir = camera.position.clone().sub(controls.target);
          dir.y = Math.max(14, dir.y * 1.25);
          dir.setLength(Math.max(24, Math.min(42, dir.length() * 1.2)));
          activeCamGoal = {
            target: controls.target.clone(),
            pos: controls.target.clone().add(dir),
          };
        }
      }

      // WASD / Arrow-Key Camera Panning (scaled by user cameraSpeed setting)
      const panSpeed =
        (updated.cameraMode === 'drone' ? 14 : 20) * dt * (updated.timeConfig.cameraSpeed || 1);
      if (
        keys['KeyW'] ||
        keys['KeyS'] ||
        keys['KeyA'] ||
        keys['KeyD'] ||
        keys['ArrowUp'] ||
        keys['ArrowDown'] ||
        keys['ArrowLeft'] ||
        keys['ArrowRight']
      ) {
        activeCamGoal = null;
        camera.getWorldDirection(_vec3);
        _vec3.y = 0;
        if (_vec3.lengthSq() > 0.0001) _vec3.normalize();
        _vec3B.crossVectors(_vec3, camera.up).normalize();
        let dx = 0;
        let dz = 0;
        if (keys['KeyW'] || keys['ArrowUp']) {
          dx += _vec3.x * panSpeed;
          dz += _vec3.z * panSpeed;
        }
        if (keys['KeyS'] || keys['ArrowDown']) {
          dx -= _vec3.x * panSpeed;
          dz -= _vec3.z * panSpeed;
        }
        if (keys['KeyD'] || keys['ArrowRight']) {
          dx += _vec3B.x * panSpeed;
          dz += _vec3B.z * panSpeed;
        }
        if (keys['KeyA'] || keys['ArrowLeft']) {
          dx -= _vec3B.x * panSpeed;
          dz -= _vec3B.z * panSpeed;
        }
        const nextTx = THREE.MathUtils.clamp(controls.target.x + dx, -28, 28);
        const nextTz = THREE.MathUtils.clamp(controls.target.z + dz, -28, 28);
        const clampedDx = nextTx - controls.target.x;
        const clampedDz = nextTz - controls.target.z;
        camera.position.x += clampedDx;
        camera.position.z += clampedDz;
        controls.target.x = nextTx;
        controls.target.z = nextTz;
      }

      // Explicit Camera Commands & Presets
      if (updated.cameraCommand && updated.cameraCommand.nonce !== lastCamNonce) {
        lastCamNonce = updated.cameraCommand.nonce;
        const cmd = updated.cameraCommand;
        if (cmd.type === 'reset') {
          activeCamGoal = {
            target: new THREE.Vector3(0, 0.1, 0),
            pos: new THREE.Vector3(22, 21, 22),
          };
        } else if (cmd.type === 'preset' && cmd.preset) {
          const anchor = controls.target.clone();
          if (cmd.preset === 'aerial') {
            activeCamGoal = {
              target: anchor,
              pos: anchor.clone().add(new THREE.Vector3(22, 21, 22)),
            };
          } else if (cmd.preset === 'neighborhood') {
            activeCamGoal = {
              target: anchor,
              pos: anchor.clone().add(new THREE.Vector3(10.5, 9.8, 10.5)),
            };
          } else if (cmd.preset === 'close') {
            activeCamGoal = {
              target: anchor,
              pos: anchor.clone().add(new THREE.Vector3(6.0, 4.8, 6.0)),
            };
          } else if (cmd.preset === 'contemplative') {
            activeCamGoal = {
              target: anchor,
              pos: anchor.clone().add(new THREE.Vector3(15.5, 5.8, -12.5)),
            };
          }
        } else if (cmd.type === 'focus_tile' && cmd.x !== undefined && cmd.z !== undefined) {
          const [wx, wz] = tileToWorld(cmd.x, cmd.z);
          const gy = groundHeightAt(wx, wz, updated.tiles);
          activeCamGoal = {
            target: new THREE.Vector3(wx, gy + 0.2, wz),
            pos: new THREE.Vector3(wx + 11, gy + 12, wz + 11),
          };
        } else if (cmd.type === 'rotate_left' || cmd.type === 'rotate_right') {
          const angle = cmd.type === 'rotate_left' ? Math.PI / 4 : -Math.PI / 4;
          const offset = camera.position.clone().sub(controls.target);
          offset.applyAxisAngle(camera.up, angle);
          activeCamGoal = {
            target: controls.target.clone(),
            pos: controls.target.clone().add(offset),
          };
        } else if (cmd.type === 'tilt_up' || cmd.type === 'tilt_down') {
          const offset = camera.position.clone().sub(controls.target);
          offset.y = THREE.MathUtils.clamp(offset.y + (cmd.type === 'tilt_up' ? 5 : -5), 4.5, 46);
          activeCamGoal = {
            target: controls.target.clone(),
            pos: controls.target.clone().add(offset),
          };
        } else if (cmd.type === 'zoom_in' || cmd.type === 'zoom_out') {
          const offset = camera.position.clone().sub(controls.target);
          offset.multiplyScalar(cmd.type === 'zoom_in' ? 0.78 : 1.25);
          const lim = getCameraLimits(updated.cameraMode, isSoftwareGl);
          if (offset.length() >= lim.minDistance && offset.length() <= lim.maxDistance) {
            activeCamGoal = {
              target: controls.target.clone(),
              pos: controls.target.clone().add(offset),
            };
          }
        }
      }

      // Follow Mode (Citizen or Vehicle) vs Goal Transition
      if (updated.followedCitizenId) {
        const cit = updated.citizens.find((c) => c.id === updated.followedCitizenId);
        if (cit) {
          const [wx, wz] = tileToWorld(cit.x, cit.z);
          const gy = groundHeightAt(wx, wz, updated.tiles);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, wx, 6, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, gy + 0.3, 6, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, wz, 6, dt);
          camera.position.x = THREE.MathUtils.damp(camera.position.x, wx + 6.5, 4, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, gy + 7.2, 4, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, wz + 6.5, 4, dt);
        }
      } else if (updated.followedVehicleId) {
        const veh = trafficAndCitizens.getVehicleById(updated.followedVehicleId);
        if (veh) {
          const gy = groundHeightAt(veh.x, veh.z, updated.tiles);
          const vDirX = Math.sin(veh.rotY);
          const vDirZ = Math.cos(veh.rotY);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, veh.x, 7, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, gy + 0.25, 7, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, veh.z, 7, dt);
          camera.position.x = THREE.MathUtils.damp(camera.position.x, veh.x - vDirX * 5.2 + 3.2, 4.5, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, gy + 5.2, 4.5, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, veh.z - vDirZ * 5.2 + 3.2, 4.5, dt);
        }
      } else if (activeCamGoal) {
        controls.target.x = THREE.MathUtils.damp(controls.target.x, activeCamGoal.target.x, 6, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, activeCamGoal.target.y, 6, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, activeCamGoal.target.z, 6, dt);
        if (activeCamGoal.pos) {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, activeCamGoal.pos.x, 6, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, activeCamGoal.pos.y, 6, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, activeCamGoal.pos.z, 6, dt);
          if (camera.position.distanceTo(activeCamGoal.pos) < 0.15) {
            activeCamGoal = null;
          }
        }
      }

      controls.update();

      // Prevent camera from clipping below terrain, coastal bay, or building roofs
      let minCamY = groundHeightAt(camera.position.x, camera.position.z, updated.tiles) + 1.15;
      const camTileCoords = worldToTile(camera.position.x, camera.position.z);
      if (camTileCoords) {
        const camTile = updated.tiles[camTileCoords[1] * GRID_SIZE + camTileCoords[0]];
        if (camTile?.building) {
          const roofClearance = 1.25 + (camTile.building.level ?? 1) * 0.95;
          minCamY = Math.max(minCamY, getTilePadElevation(camTile) + roofClearance);
        }
      }
      if (camera.position.y < minCamY) {
        camera.position.y = minCamY;
      }

      // Throttled camera tile sync for the 2D tactical minimap
      const nowMs = performance.now();
      if (nowMs - lastMinimapSyncTime > 220) {
        lastMinimapSyncTime = nowMs;
        const focusCoords = worldToTile(controls.target.x, controls.target.z);
        if (
          focusCoords &&
          (focusCoords[0] !== updated.cameraFocusTile.x ||
            focusCoords[1] !== updated.cameraFocusTile.z)
        ) {
          updated.setCameraFocusTile(focusCoords[0], focusCoords[1]);
        }
      }

      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);

      while (roadGroup.children.length > 0) roadGroup.remove(roadGroup.children[0]);
      while (buildingsGroup.children.length > 0) buildingsGroup.remove(buildingsGroup.children[0]);
      while (ghostBuildingGroup.children.length > 0) {
        ghostBuildingGroup.remove(ghostBuildingGroup.children[0]);
      }
      while (ghostClonedMaterials.length > 0) {
        ghostClonedMaterials.pop()?.dispose();
      }
      while (ghostHolder.children.length > 0) ghostHolder.remove(ghostHolder.children[0]);
      for (let i = debugGroup.children.length - 1; i >= 0; i--) {
        const ch = debugGroup.children[i];
        if ((ch as THREE.LineSegments).geometry) {
          (ch as THREE.LineSegments).geometry.dispose();
        }
        debugGroup.remove(ch);
      }

      roadBuildResult.dispose();
      terrainRig.dispose();
      envRig.dispose();
      trafficAndCitizens.dispose();
      assetManager.dispose();
      ambientAudioEngine.dispose();

      if (composer) {
        composer.dispose();
      }
      if (bloomPass) {
        bloomPass.dispose();
      }
      controls.dispose();
      envTexture.dispose();
      textures.dispose();
      mats.dispose();
      ringGeo.dispose();
      citizenRingGeo.dispose();
      selectRingMat.dispose();
      ghostPadGeo.dispose();
      ghostPadMat.dispose();
      ghostOutlineGeo.dispose();
      ghostOutlineMat.dispose();
      arrowShaftGeo.dispose();
      arrowHeadGeo.dispose();
      arrowMat.dispose();
      routeGeo.dispose();
      routeMat.dispose();
      dynNpcGeo.dispose();
      dynTrailGeo.dispose();
      dynHitGeo.dispose();
      pedDebugMat.dispose();
      roadDebugMat.dispose();
      colliderDebugMat.dispose();
      spotDebugMat.dispose();
      npcCapsuleDebugMat.dispose();
      npcTrailDebugMat.dispose();
      collisionHitDebugMat.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, [recoveryEpoch, graphicsQuality]);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      {contextLost && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/92 text-slate-200 p-6 text-center">
          <p className="font-display text-xl font-semibold text-amber-400">
            Contexto Gráfico 3D Interrompido
          </p>
          <p className="text-sm text-slate-400 mt-2 max-w-md">
            O navegador suspendeu temporariamente o WebGL. Aguardando restauração automática ou clique abaixo para reiniciar o renderizador 3D sem perder o progresso da cidade.
          </p>
          <button
            onClick={() => {
              setContextLost(false);
              setRecoveryEpoch((v) => v + 1);
            }}
            className="mt-4 px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold"
          >
            Restaurar Cidade 3D
          </button>
        </div>
      )}
    </div>
  );
};
