import * as THREE from 'three';
import { BUILDING_CATALOG, BuildingTypeId } from '../types/game';
import { createProceduralTextures } from './proceduralTextures';
import { buildProceduralBuildingMesh, createBuildingMaterialLibrary } from './buildingModels';

let cachedThumbnails: Partial<Record<BuildingTypeId, string>> | null = null;

function createFallbackThumbnail(type: BuildingTypeId): string {
  const def = BUILDING_CATALOG[type];
  const palette: Record<string, [string, string]> = {
    infra: ['#475569', '#38bdf8'],
    residential: ['#d97706', '#fde68a'],
    commercial: ['#0284c7', '#bae6fd'],
    industrial: ['#64748b', '#cbd5e1'],
    public: ['#0f766e', '#99f6e4'],
    leisure: ['#15803d', '#bbf7d0'],
  };
  const [bg, fg] = palette[def.category] || ['#334155', '#e2e8f0'];

  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const ctx = c.getContext('2d');
  if (!ctx) return '';

  const grad = ctx.createLinearGradient(0, 0, 96, 96);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(1, '#1e293b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 96, 96);

  // Clean isometric miniature silhouette
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(48, 22);
  ctx.lineTo(76, 36);
  ctx.lineTo(76, 66);
  ctx.lineTo(48, 80);
  ctx.lineTo(20, 66);
  ctx.lineTo(20, 36);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(48, 22);
  ctx.lineTo(76, 36);
  ctx.lineTo(48, 50);
  ctx.lineTo(20, 36);
  ctx.closePath();
  ctx.fill();

  return c.toDataURL('image/png');
}

/**
 * Captures genuine 3D isometric thumbnails of all 28 catalog items using a single
 * short-lived offscreen WebGLRenderer that disposes immediately (zero lingering contexts).
 */
export function getBuildingThumbnails(): Partial<Record<BuildingTypeId, string>> {
  if (cachedThumbnails) return cachedThumbnails;
  const result: Partial<Record<BuildingTypeId, string>> = {};
  const allTypes = Object.keys(BUILDING_CATALOG) as BuildingTypeId[];

  if (typeof document === 'undefined') {
    return result;
  }

  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(96, 96);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.2, 40);
    camera.position.set(2.9, 2.55, 2.9);
    camera.lookAt(0, 0.38, 0);

    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x3f4e37, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.85);
    sun.position.set(4, 7, 5);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x93c5fd, 0.55);
    fill.position.set(-4, 3, -3);
    scene.add(fill);

    const textures = createProceduralTextures(2, 512);
    const mats = createBuildingMaterialLibrary(textures, true);
    const roadAsphaltMat = new THREE.MeshStandardMaterial({
      map: textures.asphalt.map,
      roughness: 0.85,
      color: 0x334155,
    });
    const roadSidewalkMat = new THREE.MeshStandardMaterial({
      map: textures.concrete.map,
      roughness: 0.86,
      color: 0xdbe2ea,
    });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.6 });
    const medianMat = new THREE.MeshStandardMaterial({ color: 0x4d7c3f, roughness: 0.9 });

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    for (const type of allTypes) {
      let subject: THREE.Group;
      if (BUILDING_CATALOG[type].isRoad) {
        subject = new THREE.Group();
        const isAve = type === 'avenida';
        const base = new THREE.Mesh(boxGeo, roadSidewalkMat);
        base.scale.set(1.85, 0.08, 1.85);
        base.position.y = 0.04;
        const asp = new THREE.Mesh(boxGeo, roadAsphaltMat);
        asp.scale.set(isAve ? 1.38 : 1.1, 0.04, 1.85);
        asp.position.y = 0.09;
        subject.add(base, asp);
        if (isAve) {
          const med = new THREE.Mesh(boxGeo, medianMat);
          med.scale.set(0.16, 0.05, 1.82);
          med.position.y = 0.12;
          subject.add(med);
        } else {
          for (const z of [-0.55, 0, 0.55]) {
            const stripe = new THREE.Mesh(boxGeo, yellowMat);
            stripe.scale.set(0.06, 0.01, 0.28);
            stripe.position.set(0, 0.115, z);
            subject.add(stripe);
          }
        }
      } else {
        subject = buildProceduralBuildingMesh(type, 1, mats, {
          seed: type.length * 19,
          condition: 96,
          powered: true,
          watered: true,
        });
      }

      // Auto-fit tall towers cleanly inside the 96x96 frame
      const box = new THREE.Box3().setFromObject(subject);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const maxDim = Math.max(size.x, size.y, size.z, 1.4);
      const scale = 1.65 / maxDim;
      subject.scale.setScalar(scale);
      subject.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      camera.lookAt(0, (size.y * scale) * 0.42, 0);

      scene.add(subject);
      renderer.render(scene, camera);
      result[type] = renderer.domElement.toDataURL('image/png');
      scene.remove(subject);
    }

    boxGeo.dispose();
    roadAsphaltMat.dispose();
    roadSidewalkMat.dispose();
    yellowMat.dispose();
    medianMat.dispose();
    mats.dispose();
    textures.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  } catch {
    if (renderer) {
      try {
        renderer.dispose();
      } catch {
        // Ignore cleanup failure
      }
    }
    for (const type of allTypes) {
      if (!result[type]) {
        result[type] = createFallbackThumbnail(type);
      }
    }
  }

  for (const type of allTypes) {
    if (!result[type]) {
      result[type] = createFallbackThumbnail(type);
    }
  }

  cachedThumbnails = result;
  return cachedThumbnails;
}
