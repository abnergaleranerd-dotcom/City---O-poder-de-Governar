import { TILE_WORLD_SIZE } from '../types/game';

/**
 * Canonical metric scale normalizing Three.js world units, tile grid units,
 * human proportions, architectural heights, vehicles, and street furniture.
 *
 * Calibration:
 *   1 tile = 2.0 Three.js world units = 12.0 physical meters
 *   1 Three.js world unit = 6.0 physical meters
 *   1 physical meter = 1/6 world unit (~0.1667u) = 1/12 tile (~0.0833 tiles)
 */
export const METERS_PER_TILE = 12;
export const METERS_PER_WORLD_UNIT = METERS_PER_TILE / TILE_WORLD_SIZE; // 6.0 m/u
export const WORLD_UNITS_PER_METER = 1 / METERS_PER_WORLD_UNIT; // 0.16667 u/m
export const TILES_PER_METER = 1 / METERS_PER_TILE; // 0.08333 tiles/m

export function metersToWorld(meters: number): number {
  return meters * WORLD_UNITS_PER_METER;
}

export function metersToTile(meters: number): number {
  return meters * TILES_PER_METER;
}

export function worldToTileOffset(worldOffset: number): number {
  return worldOffset / TILE_WORLD_SIZE;
}

export function tileOffsetToWorld(tileOffset: number): number {
  return tileOffset * TILE_WORLD_SIZE;
}

export const WORLD_SCALE = {
  tileWorldSize: TILE_WORLD_SIZE,
  metersPerTile: METERS_PER_TILE,
  metersPerWorldUnit: METERS_PER_WORLD_UNIT,

  // Human proportions (adults 1.55–1.90 m, children ~1.25–1.35 m)
  adultMinHeightM: 1.58,
  adultAvgHeightM: 1.72,
  adultMaxHeightM: 1.88,
  childAvgHeightM: 1.28,
  pedestrianCollisionRadiusM: 0.72, // comfortable personal envelope (~0.06 tiles = 0.12u radius)
  pedestrianRadiusTile: 0.06,
  pedestrianRadiusWorld: 0.12,

  // Architecture reference heights
  doorHeightM: 2.15, // ~0.358u
  doorWidthM: 0.95, // ~0.158u
  storyHeightM: 2.95, // ~0.492u

  // Vehicles (real meters converted cleanly to world units)
  vehicleSpecs: {
    moto: { length: metersToWorld(2.2), width: metersToWorld(0.85), height: metersToWorld(1.2) },
    hatch: { length: metersToWorld(3.9), width: metersToWorld(1.75), height: metersToWorld(1.48) },
    sedan: { length: metersToWorld(4.5), width: metersToWorld(1.82), height: metersToWorld(1.46) },
    suv: { length: metersToWorld(4.75), width: metersToWorld(1.92), height: metersToWorld(1.72) },
    pickup: { length: metersToWorld(5.1), width: metersToWorld(1.94), height: metersToWorld(1.82) },
    van: { length: metersToWorld(5.2), width: metersToWorld(1.98), height: metersToWorld(2.25) },
    truck: { length: metersToWorld(7.8), width: metersToWorld(2.35), height: metersToWorld(2.95) },
    bus: { length: metersToWorld(9.4), width: metersToWorld(2.42), height: metersToWorld(3.15) },
    police: { length: metersToWorld(4.6), width: metersToWorld(1.86), height: metersToWorld(1.56) },
    ambulance: { length: metersToWorld(5.6), width: metersToWorld(2.05), height: metersToWorld(2.45) },
    fire: { length: metersToWorld(8.1), width: metersToWorld(2.4), height: metersToWorld(3.05) },
  },

  // Human locomotion speeds in physical meters/second
  humanSpeedsMps: {
    elderlyMin: 0.7,
    elderlyMax: 1.0,
    adultMin: 1.0,
    adultMax: 1.5,
    briskMin: 1.6,
    briskMax: 1.8,
    runMin: 2.5,
    runMax: 3.0,
  },

  // Calibrated vehicle speeds in tiles/second (street ~26 km/h visual scale, avenue ~34 km/h)
  vehicleSpeedsTile: {
    ruaLimit: 0.56,
    avenidaLimit: 0.72,
    commuterMax: 0.68,
    cargoMax: 0.52,
    busMax: 0.56,
    policeMax: 0.78,
    emergencyMax: 0.9,
  },

  // Streetscape & Urban Furniture
  streetAsphaltWidthU: 1.18, // 7.08 m two-way street
  avenueAsphaltWidthU: 1.48, // 8.88 m avenue with median
  sidewalkWalkableOffsetTile: 0.445, // sits centered on sidewalk slab outside curb poles
  lampCurbGapU: 0.055, // pole distance outside asphalt edge (0.645u street / 0.795u ave)
  signalCurbGapU: 0.06,
  busStopCurbGapU: 0.21, // shelter placed on outer sidewalk edge so pedestrians walk cleanly in front
  benchSeatHeightU: metersToWorld(0.46), // ~0.077u
  streetLampHeightU: metersToWorld(4.6), // ~0.77u
} as const;

export type HumanPace = 'normal' | 'brisk' | 'run';

export function getHumanSpeedMps(age: number, pace: HumanPace = 'normal', seed = 0): number {
  const t = (Math.abs(seed * 29 + 7) % 100) / 100;
  const s = WORLD_SCALE.humanSpeedsMps;
  if (pace === 'run') {
    if (age >= 64) return s.briskMin + t * (s.briskMax - s.briskMin);
    return s.runMin + t * (s.runMax - s.runMin);
  }
  if (pace === 'brisk') {
    if (age >= 64) return s.adultMin + t * 0.25;
    return s.briskMin + t * (s.briskMax - s.briskMin);
  }
  if (age >= 64) {
    return s.elderlyMin + t * (s.elderlyMax - s.elderlyMin);
  }
  return s.adultMin + t * (s.adultMax - s.adultMin);
}

export function getHumanSpeedTilesPerSec(age: number, pace: HumanPace = 'normal', seed = 0): number {
  return metersToTile(getHumanSpeedMps(age, pace, seed));
}

export function getCitizenHeightWorld(age: number, seed = 0): number {
  if (age <= 13) {
    const t = ((Math.abs(seed) % 11) / 10) * 0.14;
    return metersToWorld(1.22 + t);
  }
  if (age <= 17) {
    const t = ((Math.abs(seed) % 11) / 10) * 0.16;
    return metersToWorld(1.48 + t);
  }
  const t = (Math.abs(seed * 37 + 13) % 100) / 100;
  return metersToWorld(WORLD_SCALE.adultMinHeightM + t * (WORLD_SCALE.adultMaxHeightM - WORLD_SCALE.adultMinHeightM));
}
