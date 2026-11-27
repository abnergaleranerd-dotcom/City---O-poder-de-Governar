import { BUILDING_CATALOG, PlacedBuilding, TileData } from '../../types/game';

/**
 * Advances constructionProgress for newly placed buildings through realistic visual stages:
 * 'construction_site' (0-30%) -> 'under_construction' (30-99%) -> 'operational' (100%).
 * Creative instant build or starter buildings skip straight to 'operational'.
 */
export function initializeBuildingLifecycle(
  building: PlacedBuilding,
  instantOperational: boolean,
): PlacedBuilding {
  const def = BUILDING_CATALOG[building.type];
  const isInstantType = Boolean(def?.isRoad) || building.type === 'praca' || building.type === 'parque';
  if (instantOperational || isInstantType) {
    return {
      ...building,
      constructionStage: 'operational',
      constructionProgress: 100,
    };
  }
  return {
    ...building,
    constructionStage: 'construction_site',
    constructionProgress: 10,
  };
}

export function stepBuildingLifecycles(
  tiles: TileData[],
  calendarHoursDelta: number,
  creativeInstantBuild: boolean,
): boolean {
  let anyCompleted = false;
  if (calendarHoursDelta <= 0 && !creativeInstantBuild) return false;

  for (const tile of tiles) {
    const b = tile.building;
    if (!b) continue;
    if (!b.constructionStage) {
      b.constructionStage = 'operational';
      b.constructionProgress = 100;
      continue;
    }
    if (b.constructionStage === 'operational' || b.constructionStage === 'abandoned') continue;

    if (creativeInstantBuild) {
      b.constructionStage = 'operational';
      b.constructionProgress = 100;
      anyCompleted = true;
      continue;
    }

    const def = BUILDING_CATALOG[b.type];
    const hoursNeeded = Math.max(4, Math.min(18, (def?.unlockLevel ?? 1) * 3.5));
    const gain = (calendarHoursDelta / hoursNeeded) * 100;
    const nextProgress = Math.min(100, (b.constructionProgress ?? 10) + gain);
    b.constructionProgress = nextProgress;

    if (nextProgress >= 100) {
      b.constructionStage = 'operational';
      anyCompleted = true;
    } else if (nextProgress >= 35) {
      b.constructionStage = 'under_construction';
    } else {
      b.constructionStage = 'construction_site';
    }
  }

  return anyCompleted;
}
