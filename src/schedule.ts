import { CONFIG } from './config';

export type DayKind = 'full' | 'partial' | 'closed';

export interface DayAvailability {
  kind: DayKind;
  /** Primera hora atendible y hora de cierre, en minutos desde las 00:00. */
  from: number;
  to: number;
  /** Frase para mostrar a quien reserva (vacía si el día es normal). */
  note: string;
}

const DAY_MS = 86_400_000;

/** Número de día desde 1970. Usa UTC para que el horario de verano no mueva los días. */
function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Día de la semana de una fecha AAAA-MM-DD. 0 = domingo ... 6 = sábado. */
export function weekdayOf(key: string): number {
  return mod(dayNumber(key) + 4, 7); // el 1 de enero de 1970 fue jueves
}

const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

/**
 * Tus tiempos disponibles para una fecha AAAA-MM-DD, según tu rotación 4x4:
 *  - Días de trabajo: no se atiende.
 *  - Turno de noche, día de entrada: solo en la mañana, hasta `morningUntilHour`.
 *  - Turno de noche, día de salida: desde `afterNightFromHour`.
 *  - Cualquier otro día libre: todo el horario de atención.
 */
export function getAvailability(key: string): DayAvailability {
  const s = CONFIG.shifts;
  const open = CONFIG.openHour * 60;
  const close = CONFIG.closeHour * 60;
  const closed: DayAvailability = { kind: 'closed', from: 0, to: 0, note: 'No disponible.' };

  if ((CONFIG.closedWeekdays as readonly number[]).includes(weekdayOf(key))) return closed;

  const cycleLength = s.workDays + s.offDays;
  const diff = dayNumber(key) - dayNumber(s.anchor);
  const cycle = Math.floor(diff / cycleLength);
  const dayInCycle = mod(diff, cycleLength);
  const isNight = (mod(cycle, 2) === 0) === (s.firstBlock === 'night');

  if (dayInCycle < s.workDays) {
    if (isNight && dayInCycle === 0) {
      const to = Math.min(close, s.morningUntilHour * 60);
      return { kind: 'partial', from: open, to, note: `Ese día atiendo solo en la mañana, hasta las ${hourLabel(s.morningUntilHour)}.` };
    }
    return closed;
  }

  if (isNight && dayInCycle === s.workDays) {
    const from = Math.max(open, s.afterNightFromHour * 60);
    return { kind: 'partial', from, to: close, note: `Ese día atiendo desde las ${hourLabel(s.afterNightFromHour)}.` };
  }

  return { kind: 'full', from: open, to: close, note: '' };
}
