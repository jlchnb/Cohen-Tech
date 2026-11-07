/** Cómo se repiten tus turnos 4x4. Si cambia tu rotación, ajusta esto (y lo mismo en apps-script/Code.gs). */
export interface ShiftConfig {
  /** Primer día de un bloque de trabajo (AAAA-MM-DD). Desde esa fecha el ciclo se repite solo. */
  anchor: string;
  /** Tipo del bloque que empieza en `anchor`. Después los bloques se alternan: noche, día, noche... */
  firstBlock: 'night' | 'day';
  workDays: number;
  offDays: number;
  /** Día en que entras a turno de noche: se atiende hasta esta hora, para alcanzar a descansar. */
  morningUntilHour: number;
  /** Día en que sales de turno de noche (madrugada): se atiende desde esta hora. */
  afterNightFromHour: number;
}

const shifts: ShiftConfig = {
  anchor: '2026-11-07',
  firstBlock: 'night',
  workDays: 4,
  offDays: 4,
  morningUntilHour: 13,
  afterNightFromHour: 15,
};

/** Ajustes del negocio. Cambia aquí horarios y duración de cada hora. */
export const CONFIG = {
  businessName: 'Cohen Tech',

  /** URL del Apps Script (ver README). Vacía = modo demostración, sin Google Calendar. */
  appsScriptUrl: (import.meta.env.VITE_APPS_SCRIPT_URL ?? '').trim(),
  /** WhatsApp con código de país, sin + ni espacios. */
  whatsapp: (import.meta.env.VITE_WHATSAPP ?? '56932271826').replace(/\D/g, ''),

  timezone: 'America/Santiago',
  /** Duración de cada hora reservable, en minutos. */
  slotMinutes: 60,
  /** Horario general de atención en los días libres. */
  openHour: 10,
  closeHour: 19,
  /** Días de la semana sin atención, según Date.getDay(): 0 = domingo ... 6 = sábado. Vacío = todos los días. */
  closedWeekdays: [] as number[],
  shifts,
  hoursLabel: 'Atiendo de 10:00 a 19:00 (hora de Chile) los días que aparecen libres en el calendario.',
  /** Cuántas semanas muestra el calendario, empezando por la actual. */
  calendarWeeks: 5,
  /** Anticipación mínima para reservar el mismo día. */
  minNoticeHours: 3,
} as const;
