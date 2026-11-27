import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { BuildingTypeId } from '../types/game';
export {
  detectGraphicsCapabilities,
  getQualityProfile,
  type GraphicsCapabilities,
  type QualityProfile,
} from './graphicsConfig';

export interface LocalAssetManifest {
  buildings: Partial<Record<BuildingTypeId, string>>;
  vehicles: Record<string, string>;
  characters: Record<string, string>;
  vegetation: Record<string, string>;
  urban: Record<string, string>;
  environmentHdr: string | null;
}

/**
 * Local verified GLB/GLTF/HDR manifest.
 * Register files placed under public/assets/... here so the loader only requests
 * assets that exist locally (zero 404s; procedural PBR models serve as active fallback).
 */
export const LOCAL_ASSET_MANIFEST: LocalAssetManifest = {
  buildings: {},
  vehicles: {},
  characters: {},
  vegetation: {},
  urban: {},
  environmentHdr: null,
};

/**
 * Recommended open-license asset drop-in slots (PolyHaven HDRIs, Kenney / Mixamo GLBs).
 * Kept out of LOCAL_ASSET_MANIFEST until files are placed under public/assets/ to prevent 404s.
 */
export const EXTERNAL_ASSET_RECOMMENDATIONS = {
  environmentHdr: '/assets/hdri/sunlit_suburb_1k.hdr',
  characters: {
    adultRigged: '/assets/characters/citizen_adult_rigged.glb',
    childRigged: '/assets/characters/citizen_child_rigged.glb',
  },
  vehicles: {
    hatch: '/assets/vehicles/hatchback.glb',
    sedan: '/assets/vehicles/sedan.glb',
    bus: '/assets/vehicles/city_bus.glb',
  },
} as const;

export interface LoadedGltfAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

/**
 * Safely clones a loaded GLTF scene including SkinnedMesh skeletons and bone bindings.
 */
export function cloneGltfAsset(asset: LoadedGltfAsset): LoadedGltfAsset {
  const clonedScene = SkeletonUtils.clone(asset.scene) as THREE.Group;
  clonedScene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return {
    scene: clonedScene,
    animations: asset.animations,
  };
}

/**
 * Asynchronous 3D asset loader (GLB/GLTF + Draco + KTX2 + HDR) with caching and clean disposal.
 */
export class CityAssetManager {
  private readonly manager = new THREE.LoadingManager();
  private readonly gltfLoader: GLTFLoader;
  private readonly dracoLoader: DRACOLoader;
  private readonly ktx2Loader: KTX2Loader;
  private readonly rgbeLoader: RGBELoader;
  private readonly models = new Map<string, LoadedGltfAsset>();
  private readonly hdrTextures = new Map<string, THREE.Texture>();
  private readonly pendingLoads = new Map<string, Promise<LoadedGltfAsset | null>>();
  private disposed = false;

  constructor(renderer?: THREE.WebGLRenderer) {
    this.dracoLoader = new DRACOLoader(this.manager);
    this.dracoLoader.setDecoderPath('/assets/decoders/draco/');

    this.ktx2Loader = new KTX2Loader(this.manager);
    this.ktx2Loader.setTranscoderPath('/assets/decoders/basis/');
    if (renderer) {
      try {
        this.ktx2Loader.detectSupport(renderer);
      } catch {
        // KTX2 optional when transcoder assets aren't present
      }
    }

    this.gltfLoader = new GLTFLoader(this.manager);
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.gltfLoader.setKTX2Loader(this.ktx2Loader);

    this.rgbeLoader = new RGBELoader(this.manager);
  }

  hasRegisteredAsset(url: string | undefined | null): url is string {
    return typeof url === 'string' && url.trim().length > 0;
  }

  async loadGltf(key: string, url: string): Promise<LoadedGltfAsset | null> {
    if (this.disposed || !this.hasRegisteredAsset(url)) return null;
    const cached = this.models.get(key);
    if (cached) {
      return cloneGltfAsset(cached);
    }

    const existingPromise = this.pendingLoads.get(key);
    if (existingPromise) {
      const res = await existingPromise;
      return res ? cloneGltfAsset(res) : null;
    }

    const promise = new Promise<LoadedGltfAsset | null>((resolve) => {
      this.gltfLoader.load(
        url,
        (gltf: GLTF) => {
          const root = gltf.scene;
          root.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              const mesh = obj as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
            }
          });
          const asset: LoadedGltfAsset = {
            scene: root,
            animations: gltf.animations || [],
          };
          this.models.set(key, asset);
          resolve(asset);
        },
        undefined,
        () => {
          resolve(null);
        },
      );
    }).finally(() => {
      this.pendingLoads.delete(key);
    });

    this.pendingLoads.set(key, promise);
    const loaded = await promise;
    return loaded ? cloneGltfAsset(loaded) : null;
  }

  async loadEnvironmentHdr(
    url: string | null,
    renderer: THREE.WebGLRenderer,
  ): Promise<THREE.Texture | null> {
    if (this.disposed || !this.hasRegisteredAsset(url)) return null;
    const cached = this.hdrTextures.get(url);
    if (cached) return cached;

    return new Promise<THREE.Texture | null>((resolve) => {
      this.rgbeLoader.load(
        url,
        (rawTex) => {
          if (this.disposed) {
            rawTex.dispose();
            resolve(null);
            return;
          }
          const pmrem = new THREE.PMREMGenerator(renderer);
          pmrem.compileEquirectangularShader();
          const env = pmrem.fromEquirectangular(rawTex).texture;
          rawTex.dispose();
          pmrem.dispose();
          this.hdrTextures.set(url, env);
          resolve(env);
        },
        undefined,
        () => resolve(null),
      );
    });
  }

  dispose(): void {
    this.disposed = true;
    this.models.forEach((asset) => {
      asset.scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material?.dispose();
          }
        }
      });
    });
    this.models.clear();
    this.hdrTextures.forEach((tex) => tex.dispose());
    this.hdrTextures.clear();
    this.dracoLoader.dispose();
    this.ktx2Loader.dispose();
  }
}
