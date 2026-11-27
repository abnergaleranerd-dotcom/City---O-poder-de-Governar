import type { GraphicsQuality } from '../types/game';

export interface GraphicsCapabilities {
  isSoftwareGl: boolean;
  gpuRenderer: string;
  maxTextureSize: number;
  devicePixelRatio: number;
  recommendedQuality: GraphicsQuality;
}

export interface QualityProfile {
  quality: GraphicsQuality;
  textureSize: 512 | 1024;
  shadowMapSize: 512 | 1024 | 2048 | 4096;
  shadowsEnabled: boolean;
  pixelRatioCap: number;
  vegetationDensity: number;
  enableWindSway: boolean;
  enablePostProcessing: boolean;
  enableBloom: boolean;
  citizenDetailDistance: number;
  fogDensity: number;
  anisotropyCap: number;
}

export function detectGraphicsCapabilities(): GraphicsCapabilities {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return {
      isSoftwareGl: true,
      gpuRenderer: 'Headless',
      maxTextureSize: 1024,
      devicePixelRatio: 1,
      recommendedQuality: 'low',
    };
  }

  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) {
      return {
        isSoftwareGl: true,
        gpuRenderer: 'Unavailable',
        maxTextureSize: 1024,
        devicePixelRatio: 1,
        recommendedQuality: 'low',
      };
    }

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpuRenderer = String(gl.getParameter(param) || 'WebGL');
    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048);
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpuRenderer);
    gl.getExtension('WEBGL_lose_context')?.loseContext();

    const dpr = window.devicePixelRatio || 1;
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);

    let recommendedQuality: GraphicsQuality = 'high';
    if (isSoftwareGl || maxTextureSize < 2048) {
      recommendedQuality = 'low';
    } else if (isMobile) {
      recommendedQuality = 'medium';
    } else if (/RTX|RX 6|RX 7|Apple M|Iris Xe|Arc|GeForce|Radeon/i.test(gpuRenderer) && maxTextureSize >= 8192) {
      recommendedQuality = 'ultra';
    }

    return {
      isSoftwareGl,
      gpuRenderer,
      maxTextureSize,
      devicePixelRatio: dpr,
      recommendedQuality,
    };
  } catch {
    return {
      isSoftwareGl: true,
      gpuRenderer: 'Fallback',
      maxTextureSize: 1024,
      devicePixelRatio: 1,
      recommendedQuality: 'low',
    };
  }
}

export function getQualityProfile(
  quality: GraphicsQuality,
  isSoftwareGl: boolean,
): QualityProfile {
  if (isSoftwareGl) {
    return {
      quality,
      textureSize: 512,
      shadowMapSize: 1024,
      shadowsEnabled: false,
      pixelRatioCap: 1,
      vegetationDensity: quality === 'low' ? 0.5 : 0.85,
      enableWindSway: false,
      enablePostProcessing: false,
      enableBloom: false,
      citizenDetailDistance: 24,
      fogDensity: 0.0058,
      anisotropyCap: 2,
    };
  }

  switch (quality) {
    case 'low':
      return {
        quality,
        textureSize: 512,
        shadowMapSize: 1024,
        shadowsEnabled: true,
        pixelRatioCap: 1.25,
        vegetationDensity: 0.45,
        enableWindSway: false,
        enablePostProcessing: false,
        enableBloom: false,
        citizenDetailDistance: 16,
        fogDensity: 0.0068,
        anisotropyCap: 2,
      };
    case 'medium':
      return {
        quality,
        textureSize: 512,
        shadowMapSize: 1024,
        shadowsEnabled: true,
        pixelRatioCap: 1.5,
        vegetationDensity: 0.72,
        enableWindSway: true,
        enablePostProcessing: false,
        enableBloom: false,
        citizenDetailDistance: 24,
        fogDensity: 0.006,
        anisotropyCap: 4,
      };
    case 'high':
      return {
        quality,
        textureSize: 1024,
        shadowMapSize: 2048,
        shadowsEnabled: true,
        pixelRatioCap: 2,
        vegetationDensity: 0.92,
        enableWindSway: true,
        enablePostProcessing: false,
        enableBloom: false,
        citizenDetailDistance: 34,
        fogDensity: 0.0054,
        anisotropyCap: 8,
      };
    case 'ultra':
      return {
        quality,
        textureSize: 1024,
        shadowMapSize: 4096,
        shadowsEnabled: true,
        pixelRatioCap: 2,
        vegetationDensity: 1.0,
        enableWindSway: true,
        enablePostProcessing: true,
        enableBloom: true,
        citizenDetailDistance: 44,
        fogDensity: 0.0048,
        anisotropyCap: 16,
      };
  }
}
