/** Ajustes del negocio. Cambia aquí horarios y duración de cada hora. */
export const CONFIG = {
  businessName: 'Cohen Tech',

  /** URL del Apps Script (ver README). Vacía = modo demostración, sin Google Calendar. */
  appsScriptUrl: (import.meta.env.VITE_APPS_SCRIPT_URL ?? '').trim(),
  /** Número de WhatsApp con código de país, sin + ni espacios. Ej: 56912345678 */
  whatsapp: (import.meta.env.VITE_WHATSAPP ?? '').replace(/\D/g, ''),

  timezone: 'America/Santiago',
  /** Duración de cada hora reservable, en minutos. */
  slotMinutes: 60,
  /** Primera hora de atención y hora de cierre (la última hora termina a las 19:00). */
  openHour: 10,
  closeHour: 19,
  /** Días de atención según Date.getDay(): 0 = domingo ... 6 = sábado. */
  workDays: [1, 2, 3, 4, 5, 6],
  hoursLabel: 'Lunes a sábado, de 10:00 a 19:00 (hora de Chile)',
  /** Cuántos días hacia adelante se puede reservar. */
  daysAhead: 14,
  /** Anticipación mínima para reservar el mismo día. */
  minNoticeHours: 3,
} as const;
