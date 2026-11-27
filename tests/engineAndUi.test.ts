import test from 'node:test';
import assert from 'node:assert/strict';
import { getQualityProfile, detectGraphicsCapabilities } from '../src/engine/graphicsConfig';
import {
  getTilePadElevation,
  groundHeightAt,
  tileToWorld,
  worldToTile,
} from '../src/engine/terrainAndRoads';
import { createInitialTiles } from '../src/simulation/cityGenerator';
import { useGameStore } from '../src/store/useGameStore';

test('Perfis gráficos respeitam limites de hardware e fallback de software WebGL', () => {
  const caps = detectGraphicsCapabilities();
  assert.ok(['low', 'medium', 'high', 'ultra'].includes(caps.recommendedQuality));

  const ultraGpu = getQualityProfile('ultra', false);
  assert.equal(ultraGpu.enablePostProcessing, true);
  assert.equal(ultraGpu.enableBloom, true);
  assert.equal(ultraGpu.shadowMapSize, 4096);
  assert.equal(ultraGpu.textureSize, 1024);

  const highGpu = getQualityProfile('high', false);
  assert.equal(highGpu.enablePostProcessing, false);
  assert.equal(highGpu.shadowMapSize, 2048);

  const softwareUltra = getQualityProfile('ultra', true);
  assert.equal(softwareUltra.enablePostProcessing, false);
  assert.equal(softwareUltra.shadowsEnabled, false);
  assert.equal(softwareUltra.enableWindSway, false);
});

test('Terreno contínuo e conversões de coordenadas mantêm consistência e alinhamento', () => {
  const tiles = createInitialTiles();

  const [wx, wz] = tileToWorld(12, 12);
  const back = worldToTile(wx, wz);
  assert.deepEqual(back, [12, 12]);
  assert.equal(worldToTile(100, 100), null);

  // Highland mountains outside playable area rise smoothly above sea level
  const outerMountainY = groundHeightAt(-48, -48, tiles);
  assert.ok(outerMountainY > 2.0, `Expected mountain elevation > 2.0, got ${outerMountainY}`);

  // Bay water drops smoothly below 0 along +Z shoreline
  const bayDepthY = groundHeightAt(0, 38, tiles);
  assert.ok(bayDepthY < 0, `Expected bay depth < 0, got ${bayDepthY}`);

  // Road/developed tiles match deterministic pad elevation
  const roadTile = tiles.find((t) => t.road !== 'none')!;
  const [rwx, rwz] = tileToWorld(roadTile.x, roadTile.z);
  assert.equal(groundHeightAt(rwx, rwz, tiles), getTilePadElevation(roadTile));
});

test('Store gerencia modos de câmera, qualidade gráfica e acompanhamento sem afetar snapshot', () => {
  useGameStore.getState().startNewCity('Teste Visual', 'Prefeito Visual');
  const store = useGameStore.getState();

  store.setCameraMode('drone');
  assert.equal(useGameStore.getState().cameraMode, 'drone');

  store.followVehicle('veh_0');
  assert.equal(useGameStore.getState().cameraMode, 'follow');
  assert.equal(useGameStore.getState().followedVehicleId, 'veh_0');

  store.selectTile(10, 10);
  assert.equal(useGameStore.getState().followedVehicleId, null);
  assert.equal(useGameStore.getState().cameraMode, 'strategic');

  store.setGraphicsQuality('high');
  assert.equal(useGameStore.getState().graphicsQuality, 'high');

  const snap = useGameStore.getState().exportSnapshot();
  assert.equal('graphicsQuality' in snap, false);
  assert.equal('cameraMode' in snap, false);
});
