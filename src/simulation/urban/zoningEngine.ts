import { BUILDING_CATALOG, TileData, ZoningType } from '../../types/game';

export function inferBuildingZone(tile: TileData): ZoningType {
  if (!tile.building) return tile.zone ?? 'none';
  const cat = BUILDING_CATALOG[tile.building.type]?.category;
  if (cat === 'residential') return 'residential';
  if (cat === 'commercial') return 'commercial';
  if (cat === 'industrial') return 'industrial';
  if (cat === 'public') return 'civic';
  if (cat === 'leisure') return 'green';
  return 'none';
}

export function refreshCityZones(tiles: TileData[]): void {
  for (const tile of tiles) {
    if (tile.building) {
      tile.zone = inferBuildingZone(tile);
      tile.building.zone = tile.zone;
    } else if (!tile.zone) {
      tile.zone = 'none';
    }
  }
}
