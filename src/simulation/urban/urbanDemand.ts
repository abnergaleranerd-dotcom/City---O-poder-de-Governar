import { CityIndicators } from '../../types/game';

export interface UrbanDemandBars {
  residential: number; // 0..100
  commercial: number; // 0..100
  industrial: number; // 0..100
}

export function computeUrbanDemand(indicators: CityIndicators): UrbanDemandBars {
  const residential = Math.max(
    10,
    Math.min(100, Math.round(45 + indicators.housingDeficit * 0.45 + (100 - indicators.unemploymentRate) * 0.2)),
  );
  const commercial = Math.max(
    15,
    Math.min(100, Math.round(30 + indicators.population * 0.04 + indicators.qualityOfLife * 0.3)),
  );
  const industrial = Math.max(
    15,
    Math.min(100, Math.round(35 + indicators.unemploymentRate * 1.8 - indicators.pollution * 0.25)),
  );
  return { residential, commercial, industrial };
}
