import * as THREE from 'three';
import {
  CitizenAgent,
  CitizenAnimState,
  GRID_SIZE,
  RoadVehicleSim,
  TileData,
  TrafficSignalNode,
} from '../types/game';
import { getTilePadElevation, tileToWorld, worldToTile } from './terrainAndRoads';
import { getSignalAspectForDirection } from '../simulation/traffic/trafficSignals';
import { WORLD_SCALE, getCitizenHeightWorld } from '../simulation/worldScale';

export type VehicleKind =
  | 'hatch'
  | 'sedan'
  | 'suv'
  | 'moto'
  | 'bus'
  | 'truck'
  | 'ambulance'
  | 'fire'
  | 'police';

export interface VehicleEntity {
  id: string;
  kind: VehicleKind;
  x: number; // world X
  z: number; // world Z
  rotY: number;
  currentSpeed: number;
  braking: boolean;
  color: number;
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

const SKIN_TONES = [0xf2c9ac, 0xdca57d, 0xb87b52, 0x7c4d30, 0xe8b996, 0x9b6440];
const PANTS_TONES = [0x1e293b, 0x334155, 0x3f3f46, 0x1e3a5f, 0x4b5563, 0x57534e];
const HAIR_TONES = [0x1c1917, 0x443226, 0x785a3c, 0x52525b, 0x27272a, 0x92400e];
const HAT_TONES = [0x496b57, 0x283b49, 0xd2a97b, 0xb45309, 0x475569];
const BACKPACK_TONES = [0x334155, 0x496b57, 0x9a3412, 0x1e3a5f, 0x57534e];

interface VehicleDimensions {
  bodyW: number;
  bodyH: number;
  bodyL: number;
  cabW: number;
  cabH: number;
  cabL: number;
  cabZOffset: number;
  wheelR: number;
  wheelW: number;
  axleSpread: number;
}

const VS = WORLD_SCALE.vehicleSpecs;

const VEHICLE_SPECS: Record<VehicleKind, VehicleDimensions> = {
  hatch: {
    bodyW: VS.hatch.width,
    bodyH: VS.hatch.height * 0.43,
    bodyL: VS.hatch.length,
    cabW: VS.hatch.width * 0.85,
    cabH: VS.hatch.height * 0.35,
    cabL: VS.hatch.length * 0.56,
    cabZOffset: -0.04,
    wheelR: 0.054,
    wheelW: 0.038,
    axleSpread: VS.hatch.length * 0.3,
  },
  sedan: {
    bodyW: VS.sedan.width,
    bodyH: VS.sedan.height * 0.42,
    bodyL: VS.sedan.length,
    cabW: VS.sedan.width * 0.84,
    cabH: VS.sedan.height * 0.35,
    cabL: VS.sedan.length * 0.48,
    cabZOffset: -0.03,
    wheelR: 0.056,
    wheelW: 0.038,
    axleSpread: VS.sedan.length * 0.31,
  },
  suv: {
    bodyW: VS.suv.width,
    bodyH: VS.suv.height * 0.42,
    bodyL: VS.suv.length,
    cabW: VS.suv.width * 0.87,
    cabH: VS.suv.height * 0.35,
    cabL: VS.suv.length * 0.56,
    cabZOffset: -0.06,
    wheelR: 0.066,
    wheelW: 0.044,
    axleSpread: VS.suv.length * 0.3,
  },
  moto: {
    bodyW: VS.moto.width,
    bodyH: VS.moto.height * 0.44,
    bodyL: VS.moto.length,
    cabW: VS.moto.width * 0.84,
    cabH: VS.moto.height * 0.3,
    cabL: VS.moto.length * 0.36,
    cabZOffset: 0.02,
    wheelR: 0.052,
    wheelW: 0.026,
    axleSpread: VS.moto.length * 0.34,
  },
  bus: {
    bodyW: VS.bus.width,
    bodyH: VS.bus.height * 0.65,
    bodyL: VS.bus.length,
    cabW: VS.bus.width * 0.94,
    cabH: VS.bus.height * 0.21,
    cabL: VS.bus.length * 0.92,
    cabZOffset: 0.0,
    wheelR: 0.072,
    wheelW: 0.048,
    axleSpread: VS.bus.length * 0.3,
  },
  truck: {
    bodyW: VS.truck.width,
    bodyH: VS.truck.height * 0.55,
    bodyL: VS.truck.length,
    cabW: VS.truck.width * 0.92,
    cabH: VS.truck.height * 0.3,
    cabL: VS.truck.length * 0.28,
    cabZOffset: VS.truck.length * 0.32,
    wheelR: 0.072,
    wheelW: 0.048,
    axleSpread: VS.truck.length * 0.29,
  },
  ambulance: {
    bodyW: VS.ambulance.width,
    bodyH: VS.ambulance.height * 0.56,
    bodyL: VS.ambulance.length,
    cabW: VS.ambulance.width * 0.88,
    cabH: VS.ambulance.height * 0.28,
    cabL: VS.ambulance.length * 0.32,
    cabZOffset: VS.ambulance.length * 0.28,
    wheelR: 0.064,
    wheelW: 0.044,
    axleSpread: VS.ambulance.length * 0.3,
  },
  fire: {
    bodyW: VS.fire.width,
    bodyH: VS.fire.height * 0.57,
    bodyL: VS.fire.length,
    cabW: VS.fire.width * 0.9,
    cabH: VS.fire.height * 0.29,
    cabL: VS.fire.length * 0.28,
    cabZOffset: VS.fire.length * 0.3,
    wheelR: 0.07,
    wheelW: 0.048,
    axleSpread: VS.fire.length * 0.3,
  },
  police: {
    bodyW: VS.police.width,
    bodyH: VS.police.height * 0.42,
    bodyL: VS.police.length,
    cabW: VS.police.width * 0.84,
    cabH: VS.police.height * 0.36,
    cabL: VS.police.length * 0.48,
    cabZOffset: -0.02,
    wheelR: 0.056,
    wheelW: 0.04,
    axleSpread: VS.police.length * 0.31,
  },
};

export interface TrafficAndCitizenSystem {
  vehicles: VehicleEntity[];
  syncRoads: (tiles: TileData[]) => void;
  update: (
    dt: number,
    simPaused: boolean,
    speedMultiplier: number,
    nightGlow: number,
    tiles: TileData[],
    citizens: CitizenAgent[],
    simVehicles: RoadVehicleSim[],
    signals: TrafficSignalNode[],
    pedestrianDensity: number,
    cameraTarget: THREE.Vector3,
    detailDistance: number,
  ) => void;
  pickVehicleAt: (wx: number, wz: number) => VehicleEntity | null;
  getVehicleById: (id: string) => VehicleEntity | null;
  dispose: () => void;
}

interface HumanoidRig {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<CitizenAnimState, THREE.AnimationAction>;
  activeState: CitizenAnimState;
  citizenId: string;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  headMesh: THREE.Mesh;
  hairMesh: THREE.Mesh;
  bunMesh: THREE.Mesh;
  hatBrimMesh: THREE.Mesh;
  hatCrownMesh: THREE.Mesh;
  backpackMesh: THREE.Mesh;
  torsoMesh: THREE.Mesh;
  leftLegMesh: THREE.Mesh;
  rightLegMesh: THREE.Mesh;
  leftArmMesh: THREE.Mesh;
  rightArmMesh: THREE.Mesh;
  hatMat: THREE.MeshStandardMaterial;
  backpackMat: THREE.MeshStandardMaterial;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildHumanoidAnimationClips(): Record<CitizenAnimState, THREE.AnimationClip> {
  const times3 = [0, 0.25, 0.5, 0.75, 1.0];
  const makeCycle = (
    name: string,
    legAmp: number,
    armAmp: number,
    bobAmp: number,
    armBias = 0,
    legBias = 0,
    bodyBaseY = 0,
  ) => {
    const lLeg = new THREE.NumberKeyframeTrack('leftLeg.rotation[x]', times3, [
      legBias,
      legBias + legAmp,
      legBias,
      legBias - legAmp,
      legBias,
    ]);
    const rLeg = new THREE.NumberKeyframeTrack('rightLeg.rotation[x]', times3, [
      legBias,
      legBias - legAmp,
      legBias,
      legBias + legAmp,
      legBias,
    ]);
    const lArm = new THREE.NumberKeyframeTrack('leftArm.rotation[x]', times3, [
      armBias,
      armBias - armAmp,
      armBias,
      armBias + armAmp,
      armBias,
    ]);
    const rArm = new THREE.NumberKeyframeTrack('rightArm.rotation[x]', times3, [
      armBias,
      armBias + armAmp,
      armBias,
      armBias - armAmp,
      armBias,
    ]);
    const bodyBob = new THREE.NumberKeyframeTrack('bodyRoot.position[y]', times3, [
      bodyBaseY,
      bodyBaseY + bobAmp,
      bodyBaseY,
      bodyBaseY + bobAmp,
      bodyBaseY,
    ]);
    return new THREE.AnimationClip(name, 1.0, [lLeg, rLeg, lArm, rArm, bodyBob]);
  };

  return {
    Idle: makeCycle('Idle', 0.015, 0.035, 0.004, 0),
    Wait: makeCycle('Wait', 0.0, 0.045, 0.003, -0.14),
    Sit: makeCycle('Sit', 0.0, 0.03, 0.0, -0.35, -1.35, -0.02),
    WalkSlow: makeCycle('WalkSlow', 0.4, 0.32, 0.012, 0),
    Walk: makeCycle('Walk', 0.58, 0.48, 0.018, 0),
    WalkFast: makeCycle('WalkFast', 0.74, 0.65, 0.024, 0),
    Run: makeCycle('Run', 0.92, 0.85, 0.035, -0.2),
    Talk: makeCycle('Talk', 0.025, 0.26, 0.005, -0.45),
    Shop: makeCycle('Shop', 0.03, 0.2, 0.005, -0.3),
    Work: makeCycle('Work', 0.03, 0.34, 0.007, -0.55),
  };
}

function mapRoleToVehicleKind(sim: RoadVehicleSim, seed: number): VehicleKind {
  if (sim.role === 'bus') return 'bus';
  if (sim.role === 'cargo') return 'truck';
  if (sim.role === 'ambulance') return 'ambulance';
  if (sim.role === 'fire') return 'fire';
  if (sim.role === 'police') return 'police';
  const r = seed % 5;
  if (r === 0) return 'suv';
  if (r === 1) return 'hatch';
  if (r === 2) return 'moto';
  return 'sedan';
}

export function createTrafficAndCitizenSystem(
  scene: THREE.Scene,
  isSoftwareGl: boolean,
): TrafficAndCitizenSystem {
  const maxVehicles = 52;
  const maxSignals = 48;
  const maxDetailedCitizens = isSoftwareGl ? 24 : 44;
  const maxFarCitizens = 120;

  // --- 1. Multi-Part Instanced Vehicles + Traffic Signals ---
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
  wheelGeo.rotateZ(Math.PI / 2);

  const carPaintMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.28,
    metalness: 0.45,
    clearcoat: isSoftwareGl ? 0.25 : 0.85,
    clearcoatRoughness: 0.14,
  });
  const cabinGlassMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.14,
    metalness: 0.35,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.88,
    metalness: 0.08,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: new THREE.Color(0xfffbeb),
    emissiveIntensity: 0.2,
    roughness: 0.2,
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: new THREE.Color(0xef4444),
    emissiveIntensity: 0.25,
    roughness: 0.3,
  });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: new THREE.Color(0xef4444),
    emissiveIntensity: 0.65,
  });
  const signalPoleMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.55,
    metalness: 0.4,
  });
  const signalLensMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(0x22c55e),
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });

  const bodyInst = new THREE.InstancedMesh(unitBox, carPaintMat, maxVehicles);
  const cabInst = new THREE.InstancedMesh(unitBox, cabinGlassMat, maxVehicles);
  const wheelInst = new THREE.InstancedMesh(wheelGeo, tireMat, maxVehicles * 4);
  const headLightInst = new THREE.InstancedMesh(unitBox, headlightMat, maxVehicles * 2);
  const tailLightInst = new THREE.InstancedMesh(unitBox, taillightMat, maxVehicles * 2);
  const beaconInst = new THREE.InstancedMesh(unitBox, beaconMat, maxVehicles);
  const signalPoleInst = new THREE.InstancedMesh(unitBox, signalPoleMat, maxSignals * 2);
  const signalLensInst = new THREE.InstancedMesh(unitBox, signalLensMat, maxSignals * 2);

  bodyInst.castShadow = !isSoftwareGl;
  bodyInst.receiveShadow = true;
  [
    bodyInst,
    cabInst,
    wheelInst,
    headLightInst,
    tailLightInst,
    beaconInst,
    signalPoleInst,
    signalLensInst,
  ].forEach((inst) => {
    inst.frustumCulled = false;
    scene.add(inst);
  });

  const vehicles: VehicleEntity[] = [];
  const vehicleWheelPhase = new Map<string, number>();

  // --- 2. Articulated Pooled 3D Humanoids with AnimationMixer ---
  const clips = buildHumanoidAnimationClips();
  const limbGeo = new THREE.BoxGeometry(0.055, 0.17, 0.055);
  limbGeo.translate(0, -0.085, 0);
  const shoeGeo = new THREE.BoxGeometry(0.06, 0.035, 0.082);
  const torsoGeo = new THREE.BoxGeometry(0.145, 0.19, 0.088);
  const backpackGeo = new THREE.BoxGeometry(0.105, 0.135, 0.055);
  const headGeo = new THREE.SphereGeometry(0.055, 10, 8);
  const hairGeo = new THREE.SphereGeometry(0.059, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const bunGeo = new THREE.SphereGeometry(0.028, 7, 6);
  const hatBrimGeo = new THREE.CylinderGeometry(0.078, 0.078, 0.012, 10);
  const hatCrownGeo = new THREE.CylinderGeometry(0.052, 0.058, 0.04, 10);
  const sharedShoeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75 });

  const detailedGroup = new THREE.Group();
  scene.add(detailedGroup);
  const humanPool: HumanoidRig[] = [];

  for (let i = 0; i < maxDetailedCitizens; i++) {
    const group = new THREE.Group();
    group.visible = false;

    const bodyRoot = new THREE.Group();
    bodyRoot.name = 'bodyRoot';
    group.add(bodyRoot);

    const torsoMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.72 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xdca57d, roughness: 0.68 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.82 });
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x496b57, roughness: 0.78 });
    const backpackMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78 });

    const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
    torsoMesh.position.y = 0.27;
    torsoMesh.castShadow = !isSoftwareGl;
    bodyRoot.add(torsoMesh);

    const backpackMesh = new THREE.Mesh(backpackGeo, backpackMat);
    backpackMesh.position.set(0, 0.275, -0.068);
    backpackMesh.castShadow = !isSoftwareGl;
    bodyRoot.add(backpackMesh);

    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.position.y = 0.42;
    headMesh.castShadow = !isSoftwareGl;
    bodyRoot.add(headMesh);

    const hairMesh = new THREE.Mesh(hairGeo, hairMat);
    hairMesh.position.y = 0.425;
    bodyRoot.add(hairMesh);

    const bunMesh = new THREE.Mesh(bunGeo, hairMat);
    bunMesh.position.set(0, 0.44, -0.05);
    bodyRoot.add(bunMesh);

    const hatBrimMesh = new THREE.Mesh(hatBrimGeo, hatMat);
    hatBrimMesh.position.set(0, 0.455, 0.01);
    bodyRoot.add(hatBrimMesh);

    const hatCrownMesh = new THREE.Mesh(hatCrownGeo, hatMat);
    hatCrownMesh.position.set(0, 0.478, 0);
    bodyRoot.add(hatCrownMesh);

    const leftLegPivot = new THREE.Group();
    leftLegPivot.name = 'leftLeg';
    leftLegPivot.position.set(-0.036, 0.175, 0);
    const leftLegMesh = new THREE.Mesh(limbGeo, pantsMat);
    const leftShoeMesh = new THREE.Mesh(shoeGeo, sharedShoeMat);
    leftShoeMesh.position.set(0, -0.158, 0.014);
    leftLegPivot.add(leftLegMesh, leftShoeMesh);
    bodyRoot.add(leftLegPivot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.name = 'rightLeg';
    rightLegPivot.position.set(0.036, 0.175, 0);
    const rightLegMesh = new THREE.Mesh(limbGeo, pantsMat);
    const rightShoeMesh = new THREE.Mesh(shoeGeo, sharedShoeMat);
    rightShoeMesh.position.set(0, -0.158, 0.014);
    rightLegPivot.add(rightLegMesh, rightShoeMesh);
    bodyRoot.add(rightLegPivot);

    const leftArmPivot = new THREE.Group();
    leftArmPivot.name = 'leftArm';
    leftArmPivot.position.set(-0.098, 0.35, 0);
    const leftArmMesh = new THREE.Mesh(limbGeo, torsoMat);
    leftArmMesh.scale.set(0.8, 0.9, 0.8);
    leftArmPivot.add(leftArmMesh);
    bodyRoot.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.name = 'rightArm';
    rightArmPivot.position.set(0.098, 0.35, 0);
    const rightArmMesh = new THREE.Mesh(limbGeo, torsoMat);
    rightArmMesh.scale.set(0.8, 0.9, 0.8);
    rightArmPivot.add(rightArmMesh);
    bodyRoot.add(rightArmPivot);

    const mixer = new THREE.AnimationMixer(group);
    const actions = {} as Record<CitizenAnimState, THREE.AnimationAction>;
    (Object.keys(clips) as CitizenAnimState[]).forEach((stateKey) => {
      const action = mixer.clipAction(clips[stateKey]);
      action.setLoop(THREE.LoopRepeat, Infinity);
      actions[stateKey] = action;
    });
    actions.Idle.play();

    detailedGroup.add(group);
    humanPool.push({
      group,
      mixer,
      actions,
      activeState: 'Idle',
      citizenId: '',
      leftLegPivot,
      rightLegPivot,
      leftArmPivot,
      rightArmPivot,
      headMesh,
      hairMesh,
      bunMesh,
      hatBrimMesh,
      hatCrownMesh,
      backpackMesh,
      torsoMesh,
      leftLegMesh,
      rightLegMesh,
      leftArmMesh,
      rightArmMesh,
      hatMat,
      backpackMat,
    });
  }

  // Far LOD instanced multi-part humanoids
  const farLegsGeo = new THREE.BoxGeometry(0.11, 0.17, 0.06);
  const farTorsoMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  const farLegsMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.82 });
  const farHeadMat = new THREE.MeshStandardMaterial({ color: 0xdca57d, roughness: 0.72 });

  const farLegsInst = new THREE.InstancedMesh(farLegsGeo, farLegsMat, maxFarCitizens);
  const farTorsoInst = new THREE.InstancedMesh(torsoGeo, farTorsoMat, maxFarCitizens);
  const farHeadInst = new THREE.InstancedMesh(headGeo, farHeadMat, maxFarCitizens);
  [farLegsInst, farTorsoInst, farHeadInst].forEach((inst) => {
    inst.frustumCulled = false;
    scene.add(inst);
  });

  const syncRoads = (_tiles: TileData[]) => {
    // Authoritative vehicles come from simulation TrafficEngine; nothing needed here.
  };

  let animTime = 0;

  const update = (
    dt: number,
    simPaused: boolean,
    speedMultiplier: number,
    nightGlow: number,
    tiles: TileData[],
    citizens: CitizenAgent[],
    simVehicles: RoadVehicleSim[],
    signals: TrafficSignalNode[],
    pedestrianDensity: number,
    cameraTarget: THREE.Vector3,
    detailDistance: number,
  ) => {
    if (!simPaused) {
      animTime += dt * Math.max(0.5, Math.min(2.2, speedMultiplier));
    }

    headlightMat.emissiveIntensity = 0.18 + nightGlow * 2.3;
    taillightMat.emissiveIntensity = 0.25 + nightGlow * 1.4;
    beaconMat.emissiveIntensity = !simPaused && Math.sin(animTime * 14) > 0 ? 1.85 : 0.25;
    beaconMat.emissive.setHex(Math.sin(animTime * 14) > 0 ? 0xef4444 : 0x3b82f6);

    // --- 1. Render Traffic Signal Poles & LEDs ---
    const sigCount = Math.min(maxSignals, signals.length);
    let poleIdx = 0;
    let lensIdx = 0;
    for (let i = 0; i < sigCount; i++) {
      const sig = signals[i];
      const [wx, wz] = tileToWorld(sig.x, sig.z);
      const tile = tiles[sig.z * GRID_SIZE + sig.x];
      const baseY = (tile ? getTilePadElevation(tile) : 0.06) + 0.05;

      // Two corner posts per signalized intersection (NS & EW)
      const nsAspect = getSignalAspectForDirection(sig, 0, 1);
      const ewAspect = getSignalAspectForDirection(sig, 1, 0);

      const roadW = tile?.road === 'avenida' ? WORLD_SCALE.avenueAsphaltWidthU : WORLD_SCALE.streetAsphaltWidthU;
      const sigOff = roadW / 2 + WORLD_SCALE.signalCurbGapU;
      const corners: Array<[number, number, 'green' | 'yellow' | 'red']> = [
        [wx - sigOff, wz - sigOff, nsAspect],
        [wx + sigOff, wz + sigOff, ewAspect],
      ];

      for (const [cx, cz, aspect] of corners) {
        _dummy.position.set(cx, baseY + 0.24, cz);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(0.035, 0.48, 0.035);
        _dummy.updateMatrix();
        signalPoleInst.setMatrixAt(poleIdx++, _dummy.matrix);

        _dummy.position.set(cx, baseY + 0.47, cz);
        _dummy.scale.set(0.075, 0.09, 0.075);
        _dummy.updateMatrix();
        signalLensInst.setMatrixAt(lensIdx, _dummy.matrix);
        _color.setHex(aspect === 'green' ? 0x22c55e : aspect === 'yellow' ? 0xf59e0b : 0xef4444);
        signalLensInst.setColorAt(lensIdx, _color);
        lensIdx++;
      }
    }
    signalPoleInst.count = poleIdx;
    signalLensInst.count = lensIdx;
    signalPoleInst.instanceMatrix.needsUpdate = true;
    signalLensInst.instanceMatrix.needsUpdate = true;
    if (signalLensInst.instanceColor) signalLensInst.instanceColor.needsUpdate = true;

    // --- 2. Render Simulation-Driven Vehicles ---
    vehicles.length = 0;
    const vCount = Math.min(maxVehicles, simVehicles.length);
    let wheelCount = 0;
    let hlCount = 0;
    let tlCount = 0;
    let beaconCount = 0;

    for (let i = 0; i < vCount; i++) {
      const sv = simVehicles[i];
      const seed = hashStr(sv.id);
      const kind = mapRoleToVehicleKind(sv, seed);
      const spec = VEHICLE_SPECS[kind];

      const [wxCenter, wzCenter] = tileToWorld(sv.x, sv.z);
      const coords = worldToTile(wxCenter, wzCenter);
      const tile = coords ? tiles[coords[1] * GRID_SIZE + coords[0]] : null;
      const roadBaseY = (tile ? getTilePadElevation(tile) : 0.06) + 0.058;

      const dirX = Math.sin(sv.yaw);
      const dirZ = Math.cos(sv.yaw);
      const laneOff =
        kind === 'moto'
          ? 0.17
          : kind === 'bus' || kind === 'truck' || kind === 'fire'
            ? 0.27
            : 0.24;
      const px = wxCenter - dirZ * laneOff;
      const pz = wzCenter + dirX * laneOff;

      const isBraking = sv.braking || sv.waitingAtSignal || sv.waitingForCrosswalk || sv.speed < 0.05;

      vehicles.push({
        id: sv.id,
        kind,
        x: px,
        z: pz,
        rotY: sv.yaw,
        currentSpeed: sv.speed,
        braking: isBraking,
        color: sv.color,
      });

      if (!simPaused) {
        const prevPhase = vehicleWheelPhase.get(sv.id) ?? 0;
        vehicleWheelPhase.set(sv.id, prevPhase + (sv.speed * dt * 2) / Math.max(0.03, spec.wheelR));
      }
      const wheelRotX = vehicleWheelPhase.get(sv.id) ?? 0;

      // Body
      _dummy.position.set(px, roadBaseY + spec.wheelR + spec.bodyH * 0.5, pz);
      _dummy.rotation.set(0, sv.yaw, 0);
      _dummy.scale.set(spec.bodyW, spec.bodyH, spec.bodyL);
      _dummy.updateMatrix();
      bodyInst.setMatrixAt(i, _dummy.matrix);
      _color.setHex(sv.color);
      bodyInst.setColorAt(i, _color);

      // Cabin
      const cabX = px + dirX * spec.cabZOffset;
      const cabZ = pz + dirZ * spec.cabZOffset;
      _dummy.position.set(cabX, roadBaseY + spec.wheelR + spec.bodyH + spec.cabH * 0.45, cabZ);
      _dummy.rotation.set(0, sv.yaw, 0);
      _dummy.scale.set(spec.cabW, spec.cabH, spec.cabL);
      _dummy.updateMatrix();
      cabInst.setMatrixAt(i, _dummy.matrix);

      // 4 Wheels rotating cleanly with traveled distance
      const wxOff = spec.bodyW * 0.48;
      const wzOff = spec.axleSpread;
      const wheelOffsets: [number, number][] = [
        [-wxOff, wzOff],
        [wxOff, wzOff],
        [-wxOff, -wzOff],
        [wxOff, -wzOff],
      ];
      for (const [lx, lz] of wheelOffsets) {
        const wpx = px + lx * dirZ + lz * dirX;
        const wpz = pz - lx * dirX + lz * dirZ;
        _dummy.position.set(wpx, roadBaseY + spec.wheelR, wpz);
        _dummy.rotation.set(wheelRotX, sv.yaw, 0);
        _dummy.scale.set(spec.wheelW, spec.wheelR, spec.wheelR);
        _dummy.updateMatrix();
        wheelInst.setMatrixAt(wheelCount++, _dummy.matrix);
      }

      // Headlights & Taillights
      const lightW = spec.bodyW * 0.34;
      const halfL = spec.bodyL * 0.502;
      const lightY = roadBaseY + spec.wheelR + spec.bodyH * 0.48;
      for (const side of [-1, 1]) {
        const lx = side * lightW;
        _dummy.position.set(px + lx * dirZ + halfL * dirX, lightY, pz - lx * dirX + halfL * dirZ);
        _dummy.rotation.set(0, sv.yaw, 0);
        _dummy.scale.set(0.05, 0.035, 0.02);
        _dummy.updateMatrix();
        headLightInst.setMatrixAt(hlCount++, _dummy.matrix);

        const tlScale = isBraking ? 1.55 : 1.0;
        _dummy.position.set(px + lx * dirZ - halfL * dirX, lightY, pz - lx * dirX - halfL * dirZ);
        _dummy.scale.set(0.055 * tlScale, 0.038 * tlScale, 0.02);
        _dummy.updateMatrix();
        tailLightInst.setMatrixAt(tlCount++, _dummy.matrix);
      }

      // Emergency lightbar
      if (kind === 'police' || kind === 'ambulance' || kind === 'fire') {
        _dummy.position.set(cabX, roadBaseY + spec.wheelR + spec.bodyH + spec.cabH + 0.025, cabZ);
        _dummy.rotation.set(0, sv.yaw, 0);
        _dummy.scale.set(spec.cabW * 0.68, 0.035, 0.065);
        _dummy.updateMatrix();
        beaconInst.setMatrixAt(beaconCount++, _dummy.matrix);
      }
    }

    bodyInst.count = vCount;
    cabInst.count = vCount;
    wheelInst.count = wheelCount;
    headLightInst.count = hlCount;
    tailLightInst.count = tlCount;
    beaconInst.count = beaconCount;

    bodyInst.instanceMatrix.needsUpdate = true;
    if (bodyInst.instanceColor) bodyInst.instanceColor.needsUpdate = true;
    cabInst.instanceMatrix.needsUpdate = true;
    wheelInst.instanceMatrix.needsUpdate = true;
    headLightInst.instanceMatrix.needsUpdate = true;
    tailLightInst.instanceMatrix.needsUpdate = true;
    beaconInst.instanceMatrix.needsUpdate = true;

    // --- 3. Articulated Citizens with AnimationMixer & Building Hiding ---
    let nearIdx = 0;
    let farIdx = 0;
    const densityCap = Math.max(
      12,
      Math.round(citizens.length * Math.min(1.5, Math.max(0.2, pedestrianDensity))),
    );
    const citTotal = Math.min(maxFarCitizens, densityCap, citizens.length);

    for (let i = 0; i < citTotal; i++) {
      const cit = citizens[i];
      // Hide citizen cleanly when inside a building
      if (cit.insideBuildingId) continue;

      const [wx, wz] = tileToWorld(cit.x, cit.z);
      const coords = worldToTile(wx, wz);
      const tile = coords ? tiles[coords[1] * GRID_SIZE + coords[0]] : null;
      const groundY = (tile ? getTilePadElevation(tile) : 0.06) + (tile && tile.road !== 'none' ? 0.052 : 0.01);

      const camDist = Math.hypot(wx - cameraTarget.x, wz - cameraTarget.z);
      const seed = cit.appearanceSeed ?? hashStr(cit.id);
      const shirtHex = cit.behaviorState === 'Protesting' || cit.state === 'protesting' ? 0xef4444 : cit.shirtColor;
      const targetHeightU = getCitizenHeightWorld(cit.age, seed);
      const heightScale = targetHeightU / 0.475;
      const spd = cit.currentSpeed ?? 0;

      if (camDist <= detailDistance && nearIdx < maxDetailedCitizens) {
        const rig = humanPool[nearIdx++];
        rig.group.visible = true;
        const rawAnim: CitizenAnimState = cit.animState ?? 'Idle';
        let desiredAnim: CitizenAnimState = rawAnim;
        if (
          rawAnim !== 'Sit' &&
          rawAnim !== 'Talk' &&
          rawAnim !== 'Work' &&
          rawAnim !== 'Shop' &&
          (cit.movementState === 'stopped' || cit.movementState === 'waiting' || spd < 0.015)
        ) {
          desiredAnim = cit.movementState === 'waiting' ? 'Wait' : 'Idle';
        }

        const sitElevation = desiredAnim === 'Sit' ? 0.082 : 0;
        rig.group.position.set(wx, groundY + sitElevation, wz);
        rig.group.rotation.y = desiredAnim === 'Sit' ? (cit.sittingYaw ?? cit.yaw ?? 0) : (cit.yaw ?? 0);
        rig.group.scale.setScalar(heightScale);

        if (rig.activeState !== desiredAnim) {
          const prevAction = rig.actions[rig.activeState];
          const nextAction = rig.actions[desiredAnim];
          if (nextAction) {
            nextAction.reset().fadeIn(0.18).play();
            if (prevAction && prevAction !== nextAction) {
              prevAction.fadeOut(0.18);
            }
            rig.activeState = desiredAnim;
          }
        }

        // Couple gait playback rate strictly to physical speed (eliminates foot sliding!)
        const isLocomoting =
          desiredAnim === 'Run' ||
          desiredAnim === 'WalkFast' ||
          desiredAnim === 'Walk' ||
          desiredAnim === 'WalkSlow';
        const speedRatio = isLocomoting ? Math.max(0.35, Math.min(2.2, spd / 0.16)) : 1.0;

        if (!simPaused) {
          rig.mixer.update(dt * speedRatio);
        }

        // Persistent appearance variety (hairstyle, hat, backpack, skin/pants palette)
        const hairVariant = Math.abs(seed) % 4;
        rig.hairMesh.visible = hairVariant !== 3;
        rig.bunMesh.visible = hairVariant === 1;
        const hasHat = hairVariant === 2 || hairVariant === 3;
        rig.hatBrimMesh.visible = hasHat;
        rig.hatCrownMesh.visible = hasHat;
        rig.backpackMesh.visible = cit.age <= 22 || (Math.abs(seed >> 4) % 5 === 0);

        (rig.torsoMesh.material as THREE.MeshStandardMaterial).color.setHex(shirtHex);
        (rig.leftArmMesh.material as THREE.MeshStandardMaterial).color.setHex(shirtHex);
        (rig.rightArmMesh.material as THREE.MeshStandardMaterial).color.setHex(shirtHex);
        (rig.leftLegMesh.material as THREE.MeshStandardMaterial).color.setHex(
          PANTS_TONES[Math.abs(seed) % PANTS_TONES.length],
        );
        (rig.headMesh.material as THREE.MeshStandardMaterial).color.setHex(
          SKIN_TONES[Math.abs(seed >> 3) % SKIN_TONES.length],
        );
        (rig.hairMesh.material as THREE.MeshStandardMaterial).color.setHex(
          HAIR_TONES[Math.abs(seed >> 6) % HAIR_TONES.length],
        );
        rig.hatMat.color.setHex(HAT_TONES[Math.abs(seed >> 9) % HAT_TONES.length]);
        rig.backpackMat.color.setHex(BACKPACK_TONES[Math.abs(seed >> 11) % BACKPACK_TONES.length]);
      } else if (farIdx < maxFarCitizens) {
        const isMoving =
          (cit.movementState === 'walking' || cit.movementState === 'jogging') && spd >= 0.015;
        const bob = !simPaused && isMoving ? Math.abs(Math.sin(animTime * 6 + i)) * 0.016 : 0;
        const sitElevation = cit.animState === 'Sit' ? 0.075 : 0;

        _dummy.position.set(wx, groundY + sitElevation + (0.085 + bob) * heightScale, wz);
        _dummy.rotation.set(0, cit.yaw ?? 0, 0);
        _dummy.scale.setScalar(heightScale);
        _dummy.updateMatrix();
        farLegsInst.setMatrixAt(farIdx, _dummy.matrix);

        _dummy.position.set(wx, groundY + sitElevation + (0.265 + bob) * heightScale, wz);
        _dummy.updateMatrix();
        farTorsoInst.setMatrixAt(farIdx, _dummy.matrix);
        _color.setHex(shirtHex);
        farTorsoInst.setColorAt(farIdx, _color);

        _dummy.position.set(wx, groundY + sitElevation + (0.415 + bob) * heightScale, wz);
        _dummy.updateMatrix();
        farHeadInst.setMatrixAt(farIdx, _dummy.matrix);
        farIdx++;
      }
    }

    for (let k = nearIdx; k < maxDetailedCitizens; k++) {
      humanPool[k].group.visible = false;
    }

    farLegsInst.count = farIdx;
    farTorsoInst.count = farIdx;
    farHeadInst.count = farIdx;
    farLegsInst.instanceMatrix.needsUpdate = true;
    farTorsoInst.instanceMatrix.needsUpdate = true;
    farHeadInst.instanceMatrix.needsUpdate = true;
    if (farTorsoInst.instanceColor) farTorsoInst.instanceColor.needsUpdate = true;
  };

  const pickVehicleAt = (wx: number, wz: number): VehicleEntity | null => {
    let best: VehicleEntity | null = null;
    let bestDist = 0.72;
    for (const v of vehicles) {
      const d = Math.hypot(v.x - wx, v.z - wz);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    return best;
  };

  const getVehicleById = (id: string) => vehicles.find((v) => v.id === id) || null;

  return {
    vehicles,
    syncRoads,
    update,
    pickVehicleAt,
    getVehicleById,
    dispose: () => {
      [
        bodyInst,
        cabInst,
        wheelInst,
        headLightInst,
        tailLightInst,
        beaconInst,
        signalPoleInst,
        signalLensInst,
      ].forEach((inst) => {
        scene.remove(inst);
      });
      [farLegsInst, farTorsoInst, farHeadInst].forEach((inst) => {
        scene.remove(inst);
      });
      scene.remove(detailedGroup);
      humanPool.forEach((rig) => {
        rig.mixer.stopAllAction();
        (rig.torsoMesh.material as THREE.Material).dispose();
        (rig.leftLegMesh.material as THREE.Material).dispose();
        (rig.headMesh.material as THREE.Material).dispose();
        (rig.hairMesh.material as THREE.Material).dispose();
        rig.hatMat.dispose();
        rig.backpackMat.dispose();
      });
      unitBox.dispose();
      wheelGeo.dispose();
      limbGeo.dispose();
      shoeGeo.dispose();
      torsoGeo.dispose();
      backpackGeo.dispose();
      headGeo.dispose();
      hairGeo.dispose();
      bunGeo.dispose();
      hatBrimGeo.dispose();
      hatCrownGeo.dispose();
      sharedShoeMat.dispose();
      farLegsGeo.dispose();
      carPaintMat.dispose();
      cabinGlassMat.dispose();
      tireMat.dispose();
      headlightMat.dispose();
      taillightMat.dispose();
      beaconMat.dispose();
      signalPoleMat.dispose();
      signalLensMat.dispose();
      farTorsoMat.dispose();
      farLegsMat.dispose();
      farHeadMat.dispose();
    },
  };
}
