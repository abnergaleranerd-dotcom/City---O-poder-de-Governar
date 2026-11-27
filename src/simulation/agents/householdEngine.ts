import { BUILDING_CATALOG, CitizenAgent, Household, TileData } from '../../types/game';
import { tileKey } from '../navigation/obstacleSystem';

const SURNAMES = [
  'Silva',
  'Santos',
  'Oliveira',
  'Souza',
  'Pereira',
  'Costa',
  'Rodrigues',
  'Almeida',
  'Nascimento',
  'Lima',
  'Araújo',
  'Fernandes',
  'Carvalho',
  'Gomes',
  'Martins',
  'Rocha',
];

export function getResidenceCapacity(tile: TileData): number {
  const b = tile.building;
  if (!b) return 0;
  if (b.constructionStage && b.constructionStage !== 'operational') return 0;
  const def = BUILDING_CATALOG[b.type];
  if (!def || def.category !== 'residential' || def.housingCapacity <= 0) return 0;
  const levelMult = b.level === 1 ? 1 : b.level === 2 ? 1.3 : 1.65;
  return Math.max(2, Math.round((def.housingCapacity * levelMult) / 8));
}

/**
 * Reconciles Household entities & strictly enforces residential capacity limits.
 * Never allows a building to hold more citizen agents than its capacity permits.
 * Unlinks citizens cleanly when their residence was demolished/abandoned.
 */
export function reconcileHouseholds(
  tiles: TileData[],
  citizens: CitizenAgent[],
  existingHouseholds: Household[],
): Household[] {
  const residences = new Map<string, { tile: TileData; cap: number; currentIds: string[] }>();

  for (const tile of tiles) {
    const cap = getResidenceCapacity(tile);
    if (cap > 0 && tile.building) {
      residences.set(tile.building.id, { tile, cap, currentIds: [] });
    }
  }

  // First pass: validate existing citizen -> residence links strictly
  for (const c of citizens) {
    let validRes = c.residenceBuildingId ? residences.get(c.residenceBuildingId) : undefined;
    if (!validRes && c.homeTileKey) {
      for (const entry of residences.values()) {
        if (tileKey(entry.tile.x, entry.tile.z) === c.homeTileKey) {
          validRes = entry;
          break;
        }
      }
    }

    if (validRes && validRes.currentIds.length < validRes.cap) {
      validRes.currentIds.push(c.id);
      c.residenceBuildingId = validRes.tile.building!.id;
      c.homeTileKey = tileKey(validRes.tile.x, validRes.tile.z);
    } else {
      c.residenceBuildingId = null;
      c.homeTileKey = null;
      c.householdId = null;
    }
  }

  // Second pass: assign unhoused citizens to available residence capacity
  for (const c of citizens) {
    if (c.residenceBuildingId) continue;
    for (const [bId, res] of residences.entries()) {
      if (res.currentIds.length < res.cap) {
        res.currentIds.push(c.id);
        c.residenceBuildingId = bId;
        c.homeTileKey = tileKey(res.tile.x, res.tile.z);
        c.needs.housing = Math.max(c.needs.housing, 72);
        break;
      }
    }
    if (!c.residenceBuildingId) {
      c.needs.housing = Math.min(c.needs.housing, 25);
    }
  }

  // Group into Households (1-3 members sharing a residence or surname)
  const existingById = new Map(existingHouseholds.map((h) => [h.id, h]));
  const householdMap = new Map<string, Household>();

  for (const c of citizens) {
    const surname = c.name.split(' ').slice(-1)[0] || SURNAMES[0];
    if (!c.residenceBuildingId) {
      c.householdId = null;
      continue;
    }

    // Check if an existing household in the same building can host this citizen (max 3 per family unit)
    let assignedHh: Household | undefined;
    if (c.householdId) {
      const candidate = householdMap.get(c.householdId) ?? existingById.get(c.householdId);
      if (candidate && candidate.residenceBuildingId === c.residenceBuildingId && candidate.memberIds.length < 3) {
        assignedHh = {
          ...candidate,
          memberIds: candidate.memberIds.includes(c.id) ? candidate.memberIds : [...candidate.memberIds, c.id],
        };
      }
    }

    if (!assignedHh) {
      for (const hh of householdMap.values()) {
        if (hh.residenceBuildingId === c.residenceBuildingId && hh.memberIds.length < 3) {
          assignedHh = hh;
          hh.memberIds.push(c.id);
          break;
        }
      }
    }

    if (!assignedHh) {
      const res = residences.get(c.residenceBuildingId)!;
      const hhId = `hh_${c.residenceBuildingId}_${householdMap.size + 1}`;
      assignedHh = {
        id: hhId,
        surname,
        residenceBuildingId: c.residenceBuildingId,
        homeTileKey: c.homeTileKey,
        memberIds: [c.id],
        monthlyRent: Math.round(res.tile.landValue * 0.015),
        happiness: c.happiness,
      };
    }

    householdMap.set(assignedHh.id, assignedHh);
    c.householdId = assignedHh.id;
  }

  for (const hh of householdMap.values()) {
    const members = citizens.filter((m) => hh.memberIds.includes(m.id));
    if (members.length > 0) {
      hh.happiness = Math.round(members.reduce((acc, m) => acc + m.happiness, 0) / members.length);
    }
  }

  return Array.from(householdMap.values());
}
