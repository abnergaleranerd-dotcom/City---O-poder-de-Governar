import {
  BUILDING_CATALOG,
  CitizenAgent,
  CitizenPersonality,
  CityIndicators,
  EconomyState,
  TileData,
} from '../../types/game';
import { tileKey } from '../navigation/obstacleSystem';

export interface EvaluatedIntent {
  goalType:
    | 'sleep'
    | 'home'
    | 'work'
    | 'study'
    | 'eat'
    | 'shop'
    | 'leisure'
    | 'exercise'
    | 'socialize'
    | 'health'
    | 'seek_job'
    | 'seek_home'
    | 'protest';
  thought: string;
  minDurationHours: number;
  maxDurationHours: number;
  preferredBuildingTypes: string[];
}

export function normalizeCitizenNeeds(c: CitizenAgent): void {
  if (c.needs.energy === undefined) c.needs.energy = 78;
  if (c.needs.hunger === undefined) c.needs.hunger = 76;
  if (c.needs.leisure === undefined) c.needs.leisure = 68;
  if (c.needs.transport === undefined) c.needs.transport = 72;
  if (c.balance === undefined) c.balance = Math.max(250, Math.round(c.income * 0.45));
  if (c.monthlyExpenses === undefined) c.monthlyExpenses = Math.max(600, Math.round(c.income * 0.65));
  if (c.jobSatisfaction === undefined) c.jobSatisfaction = c.employedAtId ? 70 : 35;
}

export function stepCitizenNeeds(
  c: CitizenAgent,
  calendarHoursDelta: number,
  tileUnder: TileData | null,
  indicators: CityIndicators,
): void {
  normalizeCitizenNeeds(c);
  if (calendarHoursDelta <= 0) return;

  const h = calendarHoursDelta;
  const b = c.behaviorState ?? 'AtHome';

  let energyDelta = -3.2 * h;
  let hungerDelta = -4.2 * h;
  let leisureDelta = -2.2 * h;

  if (b === 'Sleeping') {
    energyDelta = 15.5 * h;
    hungerDelta = -1.8 * h;
  } else if (b === 'AtHome') {
    energyDelta = 5.0 * h;
    hungerDelta = 4.5 * h;
    leisureDelta = 2.0 * h;
  } else if (b === 'Eating') {
    hungerDelta = 48.0 * h;
    leisureDelta = 6.0 * h;
  } else if (b === 'Working' || b === 'Studying') {
    energyDelta = -4.8 * h;
    hungerDelta = -4.6 * h;
    leisureDelta = -3.0 * h;
  } else if (b === 'Exercising') {
    energyDelta = -6.0 * h;
    leisureDelta = 18.0 * h;
    c.health = Math.min(100, c.health + 1.4 * h);
  } else if (b === 'Socializing' || b === 'Shopping') {
    leisureDelta = 16.0 * h;
    energyDelta = -2.4 * h;
  } else if (b === 'ReceivingMedicalCare') {
    c.health = Math.min(100, c.health + 14.0 * h);
    energyDelta = 4.0 * h;
  }

  c.needs.energy = Math.max(0, Math.min(100, (c.needs.energy ?? 75) + energyDelta));
  c.needs.hunger = Math.max(0, Math.min(100, (c.needs.hunger ?? 75) + hungerDelta));
  c.needs.leisure = Math.max(0, Math.min(100, (c.needs.leisure ?? 65) + leisureDelta));

  if (tileUnder) {
    c.needs.safety = Math.round(c.needs.safety * 0.92 + tileUnder.safetyCoverage * 0.08);
    c.needs.health = Math.round(c.needs.health * 0.92 + tileUnder.healthCoverage * 0.08);
    c.needs.education = Math.round(c.needs.education * 0.92 + tileUnder.educationCoverage * 0.08);
  }

  const mobScore = Math.max(20, indicators.mobility - (c.unreachableCount ?? 0) * 8);
  c.needs.transport = Math.round((c.needs.transport ?? 70) * 0.9 + mobScore * 0.1);
}

const PERSONALITY_WEIGHTS: Record<
  CitizenPersonality,
  { social: number; work: number; exercise: number; shop: number; home: number }
> = {
  sociavel: { social: 1.45, work: 0.95, exercise: 1.0, shop: 1.15, home: 0.85 },
  reservado: { social: 0.55, work: 1.05, exercise: 0.9, shop: 0.85, home: 1.35 },
  organizado: { social: 0.95, work: 1.25, exercise: 1.1, shop: 1.0, home: 1.05 },
  aventureiro: { social: 1.2, work: 0.9, exercise: 1.4, shop: 1.1, home: 0.75 },
  trabalhador: { social: 0.85, work: 1.45, exercise: 0.85, shop: 0.95, home: 0.95 },
  tranquilo: { social: 1.1, work: 0.9, exercise: 1.05, shop: 1.0, home: 1.25 },
  ambicioso: { social: 1.0, work: 1.4, exercise: 1.0, shop: 1.25, home: 0.85 },
  comunitario: { social: 1.4, work: 1.0, exercise: 1.1, shop: 1.05, home: 0.95 },
};

/**
 * Utility AI scorer combining schedule expectations, biological needs, personality,
 * and city issues (protests) into a coherent, non-erratic next intention.
 */
export function evaluateCitizenIntent(
  c: CitizenAgent,
  hourOfDay: number,
  isWeekend: boolean,
  scheduleSlot: 'sleep' | 'work' | 'study' | 'lunch' | 'evening' | 'free',
  indicators: CityIndicators,
  economy: EconomyState,
  hasActiveConflict: boolean,
): EvaluatedIntent {
  normalizeCitizenNeeds(c);
  const p = PERSONALITY_WEIGHTS[c.personality ?? 'tranquilo'];
  const energy = c.needs.energy ?? 75;
  const hunger = c.needs.hunger ?? 75;
  const leisure = c.needs.leisure ?? 65;

  // Critical needs override schedule gently
  if (c.health < 36) {
    return {
      goalType: 'health',
      thought: 'Preciso passar no posto de saúde ou hospital.',
      minDurationHours: 1.2,
      maxDurationHours: 2.4,
      preferredBuildingTypes: ['posto_saude', 'hospital'],
    };
  }

  if (scheduleSlot === 'sleep' || energy < 18) {
    if (c.homeTileKey) {
      return {
        goalType: 'sleep',
        thought: 'Hora de descansar em casa.',
        minDurationHours: 5.5,
        maxDurationHours: 8.5,
        preferredBuildingTypes: ['casa_popular', 'casa_media', 'condominio', 'predio_residencial'],
      };
    }
    return {
      goalType: 'seek_home',
      thought: 'Preciso de moradia disponível no bairro.',
      minDurationHours: 1.5,
      maxDurationHours: 3.0,
      preferredBuildingTypes: ['casa_popular', 'casa_media', 'condominio', 'predio_residencial'],
    };
  }

  if (!c.homeTileKey && hourOfDay >= 19) {
    return {
      goalType: 'seek_home',
      thought: 'O déficit habitacional está difícil, faltam moradias disponíveis.',
      minDurationHours: 1.2,
      maxDurationHours: 2.5,
      preferredBuildingTypes: ['casa_popular', 'casa_media', 'condominio', 'predio_residencial'],
    };
  }

  if (hunger < 30 || (scheduleSlot === 'lunch' && hunger < 62)) {
    return {
      goalType: 'eat',
      thought: 'Vou comer alguma coisa na padaria ou mercado.',
      minDurationHours: 0.75,
      maxDurationHours: 1.4,
      preferredBuildingTypes: ['padaria', 'restaurante', 'mercado'],
    };
  }

  // Genuine civic protest when deeply dissatisfied
  const discontent =
    c.happiness < 34 &&
    c.opinion < 36 &&
    (indicators.unemploymentRate > 18 || indicators.housingDeficit > 40 || hasActiveConflict || economy.iptuRate > 3.1);
  if (discontent && hourOfDay >= 9 && hourOfDay <= 19 && (c.personality === 'comunitario' || c.opinion < 28)) {
    return {
      goalType: 'protest',
      thought: 'A gestão precisa ouvir a população na praça!',
      minDurationHours: 1.5,
      maxDurationHours: 3.2,
      preferredBuildingTypes: ['prefeitura', 'praca'],
    };
  }

  if (scheduleSlot === 'work' && !isWeekend) {
    if (c.employedAtId) {
      return {
        goalType: 'work',
        thought: `Indo para meu turno em ${c.employedAtName ?? 'trabalho'}.`,
        minDurationHours: 3.2,
        maxDurationHours: 5.5,
        preferredBuildingTypes: [],
      };
    }
    return {
      goalType: 'seek_job',
      thought: 'Procurando uma oportunidade de emprego na cidade.',
      minDurationHours: 1.4,
      maxDurationHours: 2.8,
      preferredBuildingTypes: [
        'mercado',
        'loja',
        'padaria',
        'restaurante',
        'centro_profissionalizante',
        'fabrica_pequena',
        'galpao',
      ],
    };
  }

  if (scheduleSlot === 'study' && !isWeekend) {
    return {
      goalType: 'study',
      thought: 'Indo estudar para me qualificar melhor.',
      minDurationHours: 3.0,
      maxDurationHours: 4.8,
      preferredBuildingTypes: ['escola', 'centro_profissionalizante'],
    };
  }

  // Score discretionary free-time options
  const scores: Array<{ goal: EvaluatedIntent; score: number }> = [
    {
      goal: {
        goalType: 'home',
        thought: 'Curtindo a tranquilidade do meu lar.',
        minDurationHours: 1.4,
        maxDurationHours: 3.0,
        preferredBuildingTypes: ['casa_popular', 'casa_media', 'condominio', 'predio_residencial'],
      },
      score: (100 - energy) * 0.45 * p.home + (hourOfDay >= 20 ? 32 : 10),
    },
    {
      goal: {
        goalType: 'shop',
        thought: 'Fazendo compras no comércio local.',
        minDurationHours: 0.85,
        maxDurationHours: 1.6,
        preferredBuildingTypes: ['mercado', 'loja', 'shopping', 'padaria'],
      },
      score: ((c.balance ?? 500) > 180 ? 28 : 8) * p.shop + (100 - hunger) * 0.25,
    },
    {
      goal: {
        goalType: 'socialize',
        thought: 'Conversando e passeando pela praça.',
        minDurationHours: 1.0,
        maxDurationHours: 2.2,
        preferredBuildingTypes: ['praca', 'parque', 'restaurante'],
      },
      score: (100 - leisure) * 0.65 * p.social + (isWeekend ? 18 : 6),
    },
    {
      goal: {
        goalType: 'exercise',
        thought: 'Praticando atividade física ao ar livre.',
        minDurationHours: 1.0,
        maxDurationHours: 2.0,
        preferredBuildingTypes: ['parque', 'centro_esportivo', 'praca'],
      },
      score: (100 - leisure) * 0.45 * p.exercise + (energy > 45 ? 16 : -20),
    },
  ];

  // Commercial / freelancer weekend shift option
  if (
    isWeekend &&
    c.employedAtId &&
    (c.scheduleProfile === 'comerciante' || c.scheduleProfile === 'saude') &&
    hourOfDay >= 9 &&
    hourOfDay <= 17
  ) {
    scores.push({
      goal: {
        goalType: 'work',
        thought: `Atendendo no plantão em ${c.employedAtName ?? 'serviço'}.`,
        minDurationHours: 3.0,
        maxDurationHours: 4.5,
        preferredBuildingTypes: [],
      },
      score: 48 * p.work,
    });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores[0].goal;
}

export function findBuildingTileById(tiles: TileData[], buildingId: string | null | undefined): TileData | null {
  if (!buildingId) return null;
  for (const t of tiles) {
    if (t.building && t.building.id === buildingId) return t;
  }
  return null;
}

export function findNearestMatchingBuilding(
  tiles: TileData[],
  originX: number,
  originZ: number,
  preferredTypes: string[],
): TileData | null {
  if (preferredTypes.length === 0) return null;
  let best: TileData | null = null;
  let bestDist = Infinity;

  for (const tile of tiles) {
    const b = tile.building;
    if (!b) continue;
    if (b.constructionStage && b.constructionStage !== 'operational') continue;
    if (!preferredTypes.includes(b.type)) continue;
    const def = BUILDING_CATALOG[b.type];
    if (!def) continue;
    const d = Math.hypot(tile.x - originX, tile.z - originZ);
    // Slight preference for active/powered places
    const penalty = b.powered || def.category === 'leisure' ? 0 : 4;
    if (d + penalty < bestDist) {
      bestDist = d + penalty;
      best = tile;
    }
  }
  return best;
}

export function formatCitizenTileLocation(x: number, z: number): string {
  return tileKey(Math.round(x), Math.round(z));
}
