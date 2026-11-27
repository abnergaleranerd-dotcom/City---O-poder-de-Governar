import { CitizenAgent, CitizenPersonality, CitizenScheduleProfile } from '../../types/game';

export type ScheduleSlot = 'sleep' | 'work' | 'study' | 'lunch' | 'evening' | 'free';

const PERSONALITIES: CitizenPersonality[] = [
  'sociavel',
  'reservado',
  'organizado',
  'aventureiro',
  'trabalhador',
  'tranquilo',
  'ambicioso',
  'comunitario',
];

export function assignScheduleProfile(c: CitizenAgent, indexHint: number): CitizenScheduleProfile {
  if (c.age <= 13) return 'crianca';
  if (c.age <= 17) return 'estudante';
  if (c.age >= 64) return 'aposentado';
  if (!c.employedAtId) return c.age <= 24 && c.education === 'Médio' ? 'universitario' : 'desempregado';

  const prof = c.profession.toLowerCase();
  if (prof.includes('médic') || prof.includes('enferm') || prof.includes('saúde')) return 'saude';
  if (prof.includes('servidor') || prof.includes('guarda') || prof.includes('bombeir')) return 'servidor';
  if (prof.includes('comerci') || prof.includes('atendente') || prof.includes('padeir')) return 'comerciante';
  if (prof.includes('empres') || prof.includes('gestor')) return 'empresario';
  if (prof.includes('autônom') || prof.includes('designer') || prof.includes('motorista')) return 'autonomo';
  if (c.age <= 23 && indexHint % 4 === 0) return 'universitario';
  return 'clt';
}

export function assignPersonality(indexHint: number): CitizenPersonality {
  return PERSONALITIES[Math.abs(indexHint) % PERSONALITIES.length];
}

export function getScheduledSlot(
  profile: CitizenScheduleProfile,
  hourOfDay: number,
  staggerMinutes: number,
  day: number,
): ScheduleSlot {
  const isWeekend = day % 7 === 6 || day % 7 === 0;
  const h = (hourOfDay + staggerMinutes / 60 + 24) % 24;

  switch (profile) {
    case 'crianca':
    case 'estudante':
      if (h >= 22 || h < 6.5) return 'sleep';
      if (!isWeekend && h >= 7.2 && h < 12.2) return 'study';
      if (h >= 12.2 && h < 13.5) return 'lunch';
      if (h >= 18.5) return 'evening';
      return 'free';

    case 'universitario':
      if (h >= 23.2 || h < 7.5) return 'sleep';
      if (!isWeekend && h >= 8.5 && h < 12.5) return 'study';
      if (h >= 12.5 && h < 13.8) return 'lunch';
      if (!isWeekend && h >= 14.2 && h < 18.0) return 'work';
      if (h >= 19.5) return 'evening';
      return 'free';

    case 'comerciante':
      if (h >= 23.0 || h < 7.2) return 'sleep';
      if (h >= 8.5 && h < 12.5) return 'work';
      if (h >= 12.5 && h < 13.8) return 'lunch';
      if (h >= 13.8 && h < 18.8 && !isWeekend) return 'work';
      if (h >= 20.0) return 'evening';
      return 'free';

    case 'saude': {
      // Shift rotation by citizen stagger parity
      const nightShift = Math.abs(Math.round(staggerMinutes)) % 4 === 0;
      if (nightShift) {
        if (h >= 7.5 && h < 15.0) return 'sleep';
        if (h >= 19.0 || h < 6.0) return 'work';
        if (h >= 15.5 && h < 17.0) return 'lunch';
        return 'free';
      }
      if (h >= 22.5 || h < 6.0) return 'sleep';
      if (h >= 7.0 && h < 12.5) return 'work';
      if (h >= 12.5 && h < 13.5) return 'lunch';
      if (h >= 13.5 && h < 17.5) return 'work';
      return 'free';
    }

    case 'empresario':
    case 'servidor':
    case 'clt':
      if (h >= 22.8 || h < 6.4) return 'sleep';
      if (!isWeekend && h >= 8.0 && h < 12.2) return 'work';
      if (h >= 12.2 && h < 13.4) return 'lunch';
      if (!isWeekend && h >= 13.5 && h < 17.8) return 'work';
      if (h >= 19.5) return 'evening';
      return 'free';

    case 'autonomo':
      if (h >= 23.0 || h < 7.3) return 'sleep';
      if (!isWeekend && h >= 9.0 && h < 12.5) return 'work';
      if (h >= 12.5 && h < 14.0) return 'lunch';
      if (!isWeekend && h >= 14.5 && h < 18.0) return 'work';
      return 'free';

    case 'aposentado':
      if (h >= 21.8 || h < 6.5) return 'sleep';
      if (h >= 11.8 && h < 13.3) return 'lunch';
      if (h >= 18.8) return 'evening';
      return 'free';

    case 'desempregado':
    default:
      if (h >= 22.8 || h < 7.0) return 'sleep';
      if (!isWeekend && h >= 8.5 && h < 11.5) return 'work'; // triggers seek_job in Utility AI
      if (h >= 12.0 && h < 13.3) return 'lunch';
      return 'free';
  }
}

export function getNextCommitmentText(c: CitizenAgent, hourOfDay: number, day: number): string {
  const slot = getScheduledSlot(c.scheduleProfile ?? 'clt', hourOfDay, c.staggerMinutes ?? 0, day);
  if (slot === 'sleep') return 'Descanso noturno em casa';
  if (slot === 'work') return c.employedAtId ? `Expediente em ${c.employedAtName}` : 'Busca por recolocação';
  if (slot === 'study') return 'Horário de aulas / formação';
  if (slot === 'lunch') return 'Pausa para refeição';
  if (slot === 'evening') return 'Retorno residencial / lazer leve';
  return 'Tempo livre na cidade';
}
