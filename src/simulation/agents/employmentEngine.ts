import { BUILDING_CATALOG, CitizenAgent, TileData, Workplace } from '../../types/game';
import { tileKey } from '../navigation/obstacleSystem';

function getRequiredEducation(type: string): 'Básico' | 'Médio' | 'Superior' {
  if (
    type === 'hospital' ||
    type === 'prefeitura' ||
    type === 'centro_profissionalizante' ||
    type === 'escola'
  ) {
    return 'Superior';
  }
  if (type === 'shopping' || type === 'centro_logistico' || type === 'delegacia' || type === 'bombeiros') {
    return 'Médio';
  }
  return 'Básico';
}

function educationRank(ed: 'Básico' | 'Médio' | 'Superior'): number {
  if (ed === 'Superior') return 3;
  if (ed === 'Médio') return 2;
  return 1;
}

export function getWorkplaceSlotCapacity(tile: TileData): number {
  const b = tile.building;
  if (!b) return 0;
  if (b.constructionStage && b.constructionStage !== 'operational') return 0;
  const def = BUILDING_CATALOG[b.type];
  if (!def || def.jobsProvided <= 0) return 0;
  const levelMult = b.level === 1 ? 1 : b.level === 2 ? 1.25 : 1.55;
  // Agent slots represent individual simulated workers proportional to real macro jobs
  return Math.max(1, Math.round((def.jobsProvided * levelMult) / 6));
}

/**
 * Reconciles Workplaces with active buildings and strictly bounds assigned workers
 * to available slots. Automatically lays off workers when a building closes or is demolished.
 */
export function reconcileWorkplaces(tiles: TileData[], citizens: CitizenAgent[]): Workplace[] {
  const workplaces = new Map<string, Workplace>();

  for (const tile of tiles) {
    const b = tile.building;
    if (!b) continue;
    const cap = getWorkplaceSlotCapacity(tile);
    if (cap <= 0) continue;
    const def = BUILDING_CATALOG[b.type];
    const operational =
      (!b.constructionStage || b.constructionStage === 'operational') &&
      b.connectedRoad &&
      (def.powerDemand === 0 || b.powered);

    workplaces.set(b.id, {
      buildingId: b.id,
      tileKey: tileKey(tile.x, tile.z),
      type: b.type,
      name: def.name,
      capacity: cap,
      workerIds: [],
      requiredEducation: getRequiredEducation(b.type),
      averageWage: Math.round(1600 + def.unlockLevel * 650 + b.level * 400),
      operational,
    });
  }

  // First pass: keep valid existing employments within capacity
  for (const c of citizens) {
    if (!c.employedAtId) continue;
    const wp = workplaces.get(c.employedAtId);
    if (!wp || !wp.operational || wp.workerIds.length >= wp.capacity) {
      // Lay off cleanly if workplace demolished/closed/overcapacity
      c.employedAtId = null;
      c.employedAtName = null;
      c.income = 0;
      c.jobSatisfaction = 25;
      if (c.history) {
        c.history = [...c.history.slice(-7), 'Perdeu o vínculo de trabalho após fechamento do local.'];
      }
      continue;
    }
    wp.workerIds.push(c.id);
    c.employedAtName = wp.name;
    c.income = Math.max(c.income, wp.averageWage);
  }

  // Second pass: match unemployed adult citizens to open operational workplaces
  for (const c of citizens) {
    if (c.employedAtId) continue;
    if (c.age < 18 || c.age >= 64) continue;

    let bestWp: Workplace | null = null;
    let bestScore = -Infinity;

    for (const wp of workplaces.values()) {
      if (!wp.operational || wp.workerIds.length >= wp.capacity) continue;
      const [wx, wz] = wp.tileKey.split(',').map(Number);
      const dist = Math.hypot(wx - c.x, wz - c.z);
      const edDiff = educationRank(c.education) - educationRank(wp.requiredEducation);
      const edScore = edDiff >= 0 ? 20 : -18;
      const score = edScore + wp.averageWage * 0.004 - dist * 1.4;
      if (score > bestScore) {
        bestScore = score;
        bestWp = wp;
      }
    }

    if (bestWp && bestScore > -15) {
      bestWp.workerIds.push(c.id);
      c.employedAtId = bestWp.buildingId;
      c.employedAtName = bestWp.name;
      c.income = bestWp.averageWage;
      c.jobSatisfaction = 72;
      c.needs.job = 86;
      if (c.history) {
        c.history = [...c.history.slice(-7), `Contratado(a) em ${bestWp.name}.`];
      }
    }
  }

  return Array.from(workplaces.values());
}
