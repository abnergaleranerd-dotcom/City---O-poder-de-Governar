import * as THREE from 'three';

export interface PbrTextureGroup {
  map: THREE.CanvasTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
}

export interface ProceduralTextureSet {
  asphalt: PbrTextureGroup;
  concrete: PbrTextureGroup;
  brick: PbrTextureGroup;
  roofTile: PbrTextureGroup;
  stucco: PbrTextureGroup;
  wood: PbrTextureGroup;
  metal: PbrTextureGroup;
  terrain: PbrTextureGroup;
  waterNormal: THREE.DataTexture;
  facadeDay: THREE.CanvasTexture;
  facadeNightEmissive: THREE.CanvasTexture;
  facadeRoughness: THREE.DataTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function hash2D(x: number, y: number, seed = 1337): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise2D(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const x0 = ((xi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y0 = ((yi % period) + period) % period;
  const y1 = (y0 + 1) % period;

  const n00 = hash2D(x0, y0, seed);
  const n10 = hash2D(x1, y0, seed);
  const n01 = hash2D(x0, y1, seed);
  const n11 = hash2D(x1, y1, seed);

  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return nx0 + (nx1 - nx0) * v;
}

function fbmTileable(u: number, v: number, baseFreq: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = baseFreq;
  for (let i = 0; i < octaves; i++) {
    sum += smoothNoise2D(u * freq, v * freq, freq, seed + i * 97) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function finalizeColorTex(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

function buildNormalAndRoughnessFromHeight(
  heights: Float32Array,
  roughBase: Float32Array,
  size: number,
  strength: number,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): { normalMap: THREE.DataTexture; roughnessMap: THREE.DataTexture } {
  const normData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const hL = heights[y * size + xm];
      const hR = heights[y * size + xp];
      const hD = heights[ym * size + x];
      const hU = heights[yp * size + x];

      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);

      const idx = (y * size + x) * 4;
      normData[idx] = Math.round((dx * invLen * 0.5 + 0.5) * 255);
      normData[idx + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      normData[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      normData[idx + 3] = 255;

      const rv = Math.min(255, Math.max(0, Math.round(roughBase[y * size + x] * 255)));
      roughData[idx] = rv;
      roughData[idx + 1] = rv;
      roughData[idx + 2] = rv;
      roughData[idx + 3] = 255;
    }
  }

  const normalMap = new THREE.DataTexture(normData, size, size, THREE.RGBAFormat);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(repeatX, repeatY);
  normalMap.anisotropy = anisotropy;
  normalMap.generateMipmaps = true;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.magFilter = THREE.LinearFilter;
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.DataTexture(roughData, size, size, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(repeatX, repeatY);
  roughnessMap.anisotropy = anisotropy;
  roughnessMap.generateMipmaps = true;
  roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.magFilter = THREE.LinearFilter;
  roughnessMap.needsUpdate = true;

  return { normalMap, roughnessMap };
}

function writeCanvasFromGenerator(
  size: number,
  anisotropy: number,
  strength: number,
  repeatX: number,
  repeatY: number,
  pixelFn: (
    x: number,
    y: number,
    u: number,
    v: number,
  ) => { r: number; g: number; b: number; h: number; rough: number },
): PbrTextureGroup {
  const [canvas, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  const roughs = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const res = pixelFn(x, y, u, v);
      const p = (y * size + x) * 4;
      img.data[p] = Math.min(255, Math.max(0, Math.round(res.r)));
      img.data[p + 1] = Math.min(255, Math.max(0, Math.round(res.g)));
      img.data[p + 2] = Math.min(255, Math.max(0, Math.round(res.b)));
      img.data[p + 3] = 255;
      heights[y * size + x] = res.h;
      roughs[y * size + x] = res.rough;
    }
  }
  ctx.putImageData(img, 0, 0);

  const map = finalizeColorTex(canvas, anisotropy, repeatX, repeatY);
  const { normalMap, roughnessMap } = buildNormalAndRoughnessFromHeight(
    heights,
    roughs,
    size,
    strength,
    anisotropy,
    repeatX,
    repeatY,
  );
  return { map, normalMap, roughnessMap };
}

export function createProceduralTextures(
  maxAnisotropy: number,
  targetSize: 512 | 1024 = 512,
): ProceduralTextureSet {
  const aniso = Math.min(16, Math.max(1, maxAnisotropy));
  const detailSize = targetSize === 1024 ? 512 : 256; // Fast high-res procedural synthesis
  const facadeSize = targetSize; // 512 or 1024 for crisp architectural windows

  // 1. Realistic Brazilian Asphalt (aggregate speckle + subtle wear)
  const asphalt = writeCanvasFromGenerator(detailSize, aniso, 2.4, 2, 2, (x, y, u, v) => {
    const macro = fbmTileable(u, v, 4, 3, 101);
    const grain = hash2D(x, y, 202);
    const wear = Math.sin(u * Math.PI * 2) * 0.04;
    const base = 44 + macro * 18 + (grain - 0.5) * 20 - wear * 18;
    return {
      r: base,
      g: base + 2,
      b: base + 6,
      h: grain * 0.45 + macro * 0.55,
      rough: 0.72 + (1 - macro) * 0.18 + wear,
    };
  });

  // 2. Concrete / Calçada (Brazilian precast concrete pavers + expansion seams)
  const concrete = writeCanvasFromGenerator(detailSize, aniso, 2.2, 2, 2, (x, y, u, v) => {
    const macro = fbmTileable(u, v, 6, 3, 303);
    const grain = hash2D(x, y, 404);
    const gridU = (u * 4) % 1;
    const gridV = (v * 4) % 1;
    const seam = gridU < 0.035 || gridV < 0.035 ? 1 : 0;
    const base = (seam ? 148 : 196) + (macro - 0.5) * 24 + (grain - 0.5) * 10;
    return {
      r: base + 2,
      g: base + 1,
      b: base - 3,
      h: seam ? 0.15 : 0.72 + macro * 0.18 + grain * 0.1,
      rough: seam ? 0.96 : 0.8 + macro * 0.14,
    };
  });

  // 3. Clay Brick Masonry (Tijolinho cerâmico aparente)
  const brick = writeCanvasFromGenerator(detailSize, aniso, 3.6, 2, 2, (x, y, u, v) => {
    const rows = 8;
    const cols = 4;
    const rowIdx = Math.floor(v * rows);
    const vInRow = (v * rows) % 1;
    const offset = rowIdx % 2 === 0 ? 0 : 0.5;
    const colCoord = u * cols + offset;
    const colIdx = Math.floor(colCoord);
    const uInCol = colCoord % 1;
    const isMortar = vInRow < 0.11 || uInCol < 0.06;
    const tileRand = hash2D(colIdx, rowIdx, 505);
    const grain = hash2D(x, y, 606);
    const fbm = fbmTileable(u, v, 8, 2, 707);

    if (isMortar) {
      const m = 198 + (grain - 0.5) * 14;
      return { r: m, g: m - 5, b: m - 12, h: 0.25 + grain * 0.1, rough: 0.94 };
    }
    const r = 158 + tileRand * 34 + (fbm - 0.5) * 22 + (grain - 0.5) * 12;
    const g = 86 + tileRand * 22 + (fbm - 0.5) * 14;
    const b = 64 + tileRand * 14 + (fbm - 0.5) * 10;
    return {
      r,
      g,
      b,
      h: 0.75 + fbm * 0.18 + grain * 0.07,
      rough: 0.8 + tileRand * 0.12,
    };
  });

  // 4. Brazilian Ceramic Roof Tiles (Telha Colonial)
  const roofTile = writeCanvasFromGenerator(detailSize, aniso, 4.2, 3, 3, (x, y, u, v) => {
    const cols = 10;
    const rows = 8;
    const wave = Math.sin(u * Math.PI * 2 * cols) * 0.5 + 0.5;
    const rowStep = (v * rows) % 1;
    const colIdx = Math.floor(u * cols);
    const rowIdx = Math.floor(v * rows);
    const tileVar = hash2D(colIdx, rowIdx, 808);
    const grain = hash2D(x, y, 909);
    const ridgeEdge = rowStep < 0.09 ? 0.55 : 1.0;

    const r = (164 + tileVar * 26) * (0.8 + wave * 0.24) * ridgeEdge + (grain - 0.5) * 8;
    const g = (84 + tileVar * 16) * (0.78 + wave * 0.24) * ridgeEdge + (grain - 0.5) * 6;
    const b = (56 + tileVar * 12) * (0.78 + wave * 0.22) * ridgeEdge;
    return {
      r,
      g,
      b,
      h: wave * 0.7 + (1 - rowStep) * 0.3,
      rough: 0.68 + (1 - wave) * 0.18,
    };
  });

  // 5. Architectural Stucco / Reboco
  const stucco = writeCanvasFromGenerator(detailSize, aniso, 1.5, 2, 2, (x, y, u, v) => {
    const fbm = fbmTileable(u, v, 8, 3, 1111);
    const grain = hash2D(x, y, 1212);
    const val = 232 + (fbm - 0.5) * 18 + (grain - 0.5) * 10;
    return {
      r: val,
      g: val - 2,
      b: val - 6,
      h: 0.5 + fbm * 0.35 + grain * 0.15,
      rough: 0.84 + fbm * 0.12,
    };
  });

  // 6. Tropical Timber / Madeira
  const wood = writeCanvasFromGenerator(detailSize, aniso, 2.0, 1, 2, (x, y, u, v) => {
    const fbm = fbmTileable(u * 2, v * 0.5, 6, 3, 1313);
    const rings = Math.sin((u * 16 + fbm * 3.5) * Math.PI) * 0.5 + 0.5;
    const plankEdge = (u * 5) % 1 < 0.04 ? 0.65 : 1.0;
    const r = (128 + rings * 36) * plankEdge;
    const g = (84 + rings * 24) * plankEdge;
    const b = (52 + rings * 14) * plankEdge;
    return {
      r,
      g,
      b,
      h: 0.5 + rings * 0.35 + (plankEdge < 1 ? -0.35 : 0),
      rough: 0.74 + (1 - rings) * 0.16,
    };
  });

  // 7. Corrugated Industrial Metal (Chapa metálica)
  const metal = writeCanvasFromGenerator(detailSize, aniso, 3.8, 2, 2, (x, y, u, v) => {
    const rib = Math.sin(u * Math.PI * 2 * 16) * 0.5 + 0.5;
    const fbm = fbmTileable(u, v, 6, 2, 1414);
    const base = 148 + rib * 38 + (fbm - 0.5) * 16;
    return {
      r: base,
      g: base + 4,
      b: base + 10,
      h: rib * 0.85 + fbm * 0.15,
      rough: 0.28 + (1 - rib) * 0.18 + fbm * 0.12,
    };
  });

  // 8. Continuous Natural Terrain Micro-Detail (grass / soil / rock variation)
  const terrain = writeCanvasFromGenerator(detailSize, aniso, 2.6, 16, 16, (x, y, u, v) => {
    const macro = fbmTileable(u, v, 6, 4, 1515);
    const micro = hash2D(x, y, 1616);
    const blade = fbmTileable(u, v, 18, 2, 1717);
    const shade = 0.84 + macro * 0.26 + (blade - 0.5) * 0.14 + (micro - 0.5) * 0.08;
    return {
      r: 222 * shade,
      g: 228 * shade,
      b: 214 * shade,
      h: macro * 0.65 + blade * 0.25 + micro * 0.1,
      rough: 0.86 + (1 - macro) * 0.12,
    };
  });

  // 9. Tileable Water Wave Normal Map
  const waterSize = 256;
  const waterHeights = new Float32Array(waterSize * waterSize);
  const waterRoughs = new Float32Array(waterSize * waterSize);
  for (let y = 0; y < waterSize; y++) {
    const v = y / waterSize;
    for (let x = 0; x < waterSize; x++) {
      const u = x / waterSize;
      const w1 = Math.sin((u * 4 + v * 2) * Math.PI * 2) * 0.35;
      const w2 = Math.cos((u * 3 - v * 5) * Math.PI * 2) * 0.3;
      const f = fbmTileable(u, v, 8, 3, 1919) * 0.6;
      waterHeights[y * waterSize + x] = 0.5 + w1 + w2 + f;
      waterRoughs[y * waterSize + x] = 0.08;
    }
  }
  const { normalMap: waterNormal } = buildNormalAndRoughnessFromHeight(
    waterHeights,
    waterRoughs,
    waterSize,
    2.4,
    aniso,
    10,
    6,
  );

  // 10. High-resolution Architectural Window Facade (Day Albedo, Night Emissive, Roughness)
  const [fdc, fdctx] = makeCanvas(facadeSize, facadeSize);
  const [fnc, fnctx] = makeCanvas(facadeSize, facadeSize);
  const roughGlassData = new Uint8Array(facadeSize * facadeSize * 4);

  fdctx.fillStyle = '#dde2e8';
  fdctx.fillRect(0, 0, facadeSize, facadeSize);
  fnctx.fillStyle = '#000000';
  fnctx.fillRect(0, 0, facadeSize, facadeSize);

  // Base concrete/mullion roughness (high), window glass roughness (low)
  for (let i = 0; i < facadeSize * facadeSize; i++) {
    const p = i * 4;
    roughGlassData[p] = 205;
    roughGlassData[p + 1] = 205;
    roughGlassData[p + 2] = 205;
    roughGlassData[p + 3] = 255;
  }

  const rows = 8;
  const cols = 6;
  const cellW = facadeSize / cols;
  const cellH = facadeSize / rows;
  const padX = cellW * 0.14;
  const padY = cellH * 0.16;

  for (let row = 0; row < rows; row++) {
    // Subtle slab floor divider line
    fdctx.fillStyle = '#b4bec9';
    fdctx.fillRect(0, Math.round(row * cellH), facadeSize, Math.max(2, Math.round(cellH * 0.06)));

    for (let col = 0; col < cols; col++) {
      const wx = Math.round(col * cellW + padX);
      const wy = Math.round(row * cellH + padY);
      const ww = Math.round(cellW - padX * 2);
      const wh = Math.round(cellH - padY * 2);

      // Window frame
      fdctx.fillStyle = '#334155';
      fdctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);

      // Sky-reflective glass interior gradient
      const gGrad = fdctx.createLinearGradient(wx, wy, wx, wy + wh);
      const blindSeed = hash2D(col, row, 2121);
      if (blindSeed > 0.65) {
        gGrad.addColorStop(0, '#475569');
        gGrad.addColorStop(0.55, '#64748b');
        gGrad.addColorStop(1, '#334155');
      } else {
        gGrad.addColorStop(0, '#5b8fb9');
        gGrad.addColorStop(0.55, '#3b6998');
        gGrad.addColorStop(1, '#233b54');
      }
      fdctx.fillStyle = gGrad;
      fdctx.fillRect(wx, wy, ww, wh);

      // Center mullion
      fdctx.fillStyle = '#475569';
      fdctx.fillRect(Math.round(wx + ww * 0.5 - 1), wy, 2, wh);

      // Mark glass region low-roughness in roughnessMap
      const maxX = Math.min(facadeSize, wx + ww);
      const maxY = Math.min(facadeSize, wy + wh);
      for (let py = Math.max(0, wy); py < maxY; py++) {
        for (let px = Math.max(0, wx); px < maxX; px++) {
          const idx = (py * facadeSize + px) * 4;
          roughGlassData[idx] = 28;
          roughGlassData[idx + 1] = 28;
          roughGlassData[idx + 2] = 28;
        }
      }

      // Multi-temperature night illumination (~64% occupied at night)
      const litRoll = hash2D(col, row, 3131);
      if (litRoll > 0.36) {
        const warmColors = ['#ffdf9a', '#ffd089', '#fff1cf', '#bfe6ff'];
        fnctx.fillStyle = warmColors[Math.floor(litRoll * 17) % warmColors.length];
        fnctx.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
      }
    }
  }

  const facadeDay = finalizeColorTex(fdc, aniso, 1, 1);
  const facadeNightEmissive = finalizeColorTex(fnc, aniso, 1, 1);
  const facadeRoughness = new THREE.DataTexture(
    roughGlassData,
    facadeSize,
    facadeSize,
    THREE.RGBAFormat,
  );
  facadeRoughness.wrapS = THREE.RepeatWrapping;
  facadeRoughness.wrapT = THREE.RepeatWrapping;
  facadeRoughness.anisotropy = aniso;
  facadeRoughness.generateMipmaps = true;
  facadeRoughness.minFilter = THREE.LinearMipmapLinearFilter;
  facadeRoughness.magFilter = THREE.LinearFilter;
  facadeRoughness.needsUpdate = true;

  // 11. 512x512 Soft Ambient Contact Shadow
  const [sc, sctx] = makeCanvas(512, 512);
  const grad = sctx.createRadialGradient(256, 256, 48, 256, 256, 244);
  grad.addColorStop(0, 'rgba(8, 12, 20, 0.56)');
  grad.addColorStop(0.58, 'rgba(8, 12, 20, 0.22)');
  grad.addColorStop(1, 'rgba(8, 12, 20, 0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 512, 512);
  const contactShadow = finalizeColorTex(sc, aniso);

  const disposeGroup = (g: PbrTextureGroup) => {
    g.map.dispose();
    g.normalMap.dispose();
    g.roughnessMap.dispose();
  };

  return {
    asphalt,
    concrete,
    brick,
    roofTile,
    stucco,
    wood,
    metal,
    terrain,
    waterNormal,
    facadeDay,
    facadeNightEmissive,
    facadeRoughness,
    contactShadow,
    dispose: () => {
      disposeGroup(asphalt);
      disposeGroup(concrete);
      disposeGroup(brick);
      disposeGroup(roofTile);
      disposeGroup(stucco);
      disposeGroup(wood);
      disposeGroup(metal);
      disposeGroup(terrain);
      waterNormal.dispose();
      facadeDay.dispose();
      facadeNightEmissive.dispose();
      facadeRoughness.dispose();
      contactShadow.dispose();
    },
  };
}
