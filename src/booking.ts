import { CONFIG } from './config';
import { getAvailability, type DayAvailability } from './schedule';
import { bindPress, celebrate, popIn, popInMany, shake } from './animations';

interface Busy {
  /** Minutos desde las 00:00 */
  start: number;
  end: number;
}

interface BookingPayload {
  name: string;
  email: string;
  phone: string;
  isNotebook: boolean;
  model: string;
  details: string;
  date: string;
  time: string;
  website: string;
}

type FieldName = 'name' | 'email' | 'phone' | 'model' | 'details';

const rules: Record<FieldName, { valid: (value: string) => boolean; message: string }> = {
  name: { valid: (v) => v.length >= 2, message: 'Escribe tu nombre.' },
  email: {
    valid: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
    message: 'Revisa tu correo: parece incompleto.',
  },
  phone: {
    valid: (v) => /^[+\d\s()-]+$/.test(v) && v.replace(/\D/g, '').length >= 8 && v.replace(/\D/g, '').length <= 15,
    message: 'Escribe un número de contacto, por ejemplo +56 9 1234 5678.',
  },
  model: { valid: (v) => v.length >= 2, message: 'Indica la marca y el modelo de tu equipo.' },
  details: { valid: (v) => v.length >= 10, message: 'Cuéntanos qué le pasa a tu equipo o qué servicio necesitas.' },
};
const fieldNames = Object.keys(rules) as FieldName[];

function $<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`No se encontró ${selector}`);
  return element;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const toKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const formatMinutes = (min: number): string => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

const monthShort = new Intl.DateTimeFormat('es-CL', { month: 'short' });
const longDate = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

/** Sin servidor configurado, inventamos algunas horas ocupadas para poder probar la página. */
function demoBusy(key: string): Busy[] {
  const seed = key.split('-').reduce((sum, part) => sum + Number(part), 0);
  const busy: Busy[] = [];
  if (seed % 2 === 0) busy.push({ start: 11 * 60, end: 12 * 60 });
  if (seed % 3 === 0) busy.push({ start: 15 * 60, end: 16 * 60 });
  return busy;
}

async function fetchBusy(key: string): Promise<Busy[]> {
  if (!CONFIG.appsScriptUrl) return demoBusy(key);
  const url = new URL(CONFIG.appsScriptUrl);
  url.searchParams.set('action', 'busy');
  url.searchParams.set('date', key);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as { ok: boolean; busy?: Busy[] };
  if (!data.ok || !data.busy) throw new Error('Respuesta inválida');
  return data.busy;
}

async function sendBooking(payload: BookingPayload): Promise<{ ok: boolean; error?: string }> {
  if (!CONFIG.appsScriptUrl) {
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    return { ok: true };
  }
  // text/plain evita la solicitud previa (preflight) que Apps Script no responde.
  const response = await fetch(CONFIG.appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return (await response.json()) as { ok: boolean; error?: string };
}

function calendarLink(payload: BookingPayload): string {
  const compact = (date: string, minutes: number): string => `${date.replaceAll('-', '')}T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`;
  const [h, m] = payload.time.split(':').map(Number);
  const startMin = h * 60 + m;
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', `${CONFIG.businessName}: ${payload.isNotebook ? 'notebook' : 'PC'} ${payload.model}`);
  url.searchParams.set('dates', `${compact(payload.date, startMin)}/${compact(payload.date, startMin + CONFIG.slotMinutes)}`);
  url.searchParams.set('ctz', CONFIG.timezone);
  url.searchParams.set('details', payload.details);
  return url.toString();
}

export function initBooking(): void {
  const form = $<HTMLFormElement>('#booking-form');
  const dayGrid = $<HTMLElement>('#day-grid');
  const slotGrid = $<HTMLElement>('#slot-grid');
  const slotStatus = $<HTMLElement>('#slot-status');
  const slotError = $<HTMLElement>('#slot-error');
  const formError = $<HTMLElement>('#form-error');
  const submitBtn = $<HTMLButtonElement>('#submit-btn');
  const success = $<HTMLElement>('#success');
  const demoNote = $<HTMLElement>('#demo-note');

  let selectedDate: string | null = null;
  let selectedTime: string | null = null;
  let requestId = 0;
  let submitting = false;

  // Datos del negocio en la página
  document.querySelectorAll<HTMLElement>('[data-hours]').forEach((el) => (el.textContent = CONFIG.hoursLabel));
  document.querySelectorAll<HTMLElement>('[data-year]').forEach((el) => (el.textContent = String(new Date().getFullYear())));
  demoNote.hidden = Boolean(CONFIG.appsScriptUrl);

  if (CONFIG.whatsapp) {
    const text = encodeURIComponent(`Hola, quiero consultar por el servicio técnico de ${CONFIG.businessName}.`);
    document.querySelectorAll<HTMLAnchorElement>('[data-whatsapp]').forEach((a) => {
      a.href = `https://wa.me/${CONFIG.whatsapp}?text=${text}`;
      a.hidden = false;
    });
    document.querySelectorAll<HTMLElement>('[data-whatsapp-wrap]').forEach((el) => (el.hidden = false));
  }

  // Al tocar "Agendar" en un servicio, lo anotamos en el detalle.
  document.querySelectorAll<HTMLAnchorElement>('[data-service]').forEach((link) => {
    link.addEventListener('click', () => {
      const details = $<HTMLTextAreaElement>('#f-details');
      const line = `Servicio: ${link.dataset.service}. `;
      if (!details.value.includes(line)) details.value = line + details.value;
    });
  });

  /* ---------- Calendario de disponibilidad ---------- */
  function renderCalendar(): void {
    const today = new Date();
    const todayKey = toKey(today);
    // El calendario empieza el lunes de esta semana.
    const mondayOffset = (today.getDay() + 6) % 7;
    const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset);
    const cells: HTMLButtonElement[] = [];

    for (let i = 0; i < CONFIG.calendarWeeks * 7; i += 1) {
      const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
      const key = toKey(date);
      const past = key < todayKey;
      const info = past ? null : getAvailability(key);
      const unavailable = past || info?.kind === 'closed';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cal-day';
      button.dataset.date = key;
      button.dataset.kind = past ? 'past' : (info?.kind ?? 'closed');
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', 'false');

      const label = longDate.format(date);
      if (unavailable) {
        button.disabled = true;
        button.setAttribute('aria-label', `${label}, no disponible`);
      } else {
        button.setAttribute('aria-label', info?.kind === 'partial' ? `${label}, horario reducido` : label);
        button.addEventListener('click', () => selectDate(key));
        bindPress(button);
      }

      const month = i === 0 || date.getDate() === 1 ? `<small>${monthShort.format(date).replace('.', '')}</small>` : '';
      button.innerHTML = `${month}<strong>${date.getDate()}</strong>`;
      cells.push(button);
    }
    dayGrid.replaceChildren(...cells);
  }

  function selectDate(key: string): void {
    selectedDate = key;
    selectedTime = null;
    clearSlotError();
    dayGrid.querySelectorAll<HTMLElement>('.cal-day').forEach((day) => {
      const active = day.dataset.date === key;
      day.setAttribute('aria-checked', String(active));
      if (active) popIn(day);
    });
    void loadSlots(key);
  }

  /* ---------- Horas ---------- */
  async function loadSlots(key: string): Promise<void> {
    const id = ++requestId;
    slotGrid.replaceChildren();
    slotGrid.setAttribute('aria-busy', 'true');
    slotStatus.textContent = 'Revisando disponibilidad…';
    try {
      const busy = await fetchBusy(key);
      if (id !== requestId) return;
      renderSlots(key, busy, getAvailability(key));
    } catch {
      if (id !== requestId) return;
      slotStatus.textContent = 'No pudimos cargar las horas. Recarga la página o escríbenos por WhatsApp.';
    } finally {
      if (id === requestId) slotGrid.setAttribute('aria-busy', 'false');
    }
  }

  function renderSlots(key: string, busy: Busy[], day: DayAvailability): void {
    const now = new Date();
    const isToday = key === toKey(now);
    const earliestToday = now.getHours() * 60 + now.getMinutes() + CONFIG.minNoticeHours * 60;
    const buttons: HTMLButtonElement[] = [];
    let available = 0;

    // Las horas se cuentan desde la apertura; solo se muestran las que caen dentro de tus tiempos disponibles ese día.
    for (let start = CONFIG.openHour * 60; start + CONFIG.slotMinutes <= CONFIG.closeHour * 60; start += CONFIG.slotMinutes) {
      const end = start + CONFIG.slotMinutes;
      if (start < day.from || end > day.to) continue;
      const taken = busy.some((b) => start < b.end && end > b.start) || (isToday && start < earliestToday);
      const time = formatMinutes(start);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot';
      button.dataset.time = time;
      button.textContent = time;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', 'false');
      if (taken) {
        button.setAttribute('aria-disabled', 'true');
        button.setAttribute('aria-label', `${time}, no disponible`);
      } else {
        available += 1;
        button.addEventListener('click', () => selectTime(time));
      }
      bindPress(button);
      buttons.push(button);
    }

    slotGrid.replaceChildren(...buttons);
    popInMany(buttons);
    const notice = day.note ? `${day.note} ` : '';
    slotStatus.textContent = available > 0 ? `${notice}Elige una hora.` : `${notice}No quedan horas libres ese día. Prueba con otro.`;
  }

  function selectTime(time: string): void {
    selectedTime = time;
    clearSlotError();
    slotGrid.querySelectorAll<HTMLElement>('.slot').forEach((slot) => {
      const active = slot.dataset.time === time;
      slot.setAttribute('aria-checked', String(active));
      if (active) popIn(slot);
    });
  }

  function showSlotError(message: string): void {
    slotError.textContent = message;
    slotError.hidden = false;
    shake(dayGrid);
  }
  function clearSlotError(): void {
    slotError.hidden = true;
  }

  /* ---------- Validación ---------- */
  const control = (name: FieldName): HTMLInputElement | HTMLTextAreaElement => $(`#f-${name}`);
  const errorOf = (name: FieldName): HTMLElement => $(`#err-${name}`);

  function setFieldError(name: FieldName, message: string | null): void {
    const input = control(name);
    const error = errorOf(name);
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      error.textContent = message;
      error.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      error.hidden = true;
    }
  }

  fieldNames.forEach((name) => {
    control(name).addEventListener('input', () => setFieldError(name, null));
  });

  function validate(): boolean {
    let firstInvalid: HTMLElement | null = null;

    if (!selectedDate || !selectedTime) {
      showSlotError('Elige un día y una hora.');
      firstInvalid = dayGrid.querySelector<HTMLElement>('.cal-day:not(:disabled)');
    }

    for (const name of fieldNames) {
      const input = control(name);
      const ok = rules[name].valid(input.value.trim());
      setFieldError(name, ok ? null : rules[name].message);
      if (!ok) {
        shake($(`[data-field="${name}"]`));
        firstInvalid ??= input;
      }
    }

    firstInvalid?.focus();
    return firstInvalid === null;
  }

  /* ---------- Envío ---------- */
  function setSubmitting(value: boolean): void {
    submitting = value;
    submitBtn.disabled = value;
    submitBtn.textContent = value ? 'Reservando…' : 'Confirmar hora';
  }

  function showFormError(message: string): void {
    formError.textContent = message;
    formError.hidden = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    formError.hidden = true;
    if (!validate() || !selectedDate || !selectedTime) return;

    const data = new FormData(form);
    const payload: BookingPayload = {
      name: String(data.get('name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      phone: String(data.get('phone') ?? '').trim(),
      isNotebook: data.get('equipment') === 'notebook',
      model: String(data.get('model') ?? '').trim(),
      details: String(data.get('details') ?? '').trim(),
      date: selectedDate,
      time: selectedTime,
      website: String(data.get('website') ?? ''),
    };

    setSubmitting(true);
    try {
      const result = await sendBooking(payload);
      if (result.ok) {
        showSuccess(payload);
      } else if (result.error === 'slot_taken') {
        showFormError('Esa hora acaba de ser tomada. Elige otra y confirma de nuevo.');
        selectedTime = null;
        void loadSlots(payload.date);
      } else if (result.error === 'unavailable' || result.error === 'past') {
        showFormError('Esa hora ya no está disponible. Elige otra y confirma de nuevo.');
        selectedTime = null;
        void loadSlots(payload.date);
      } else if (result.error === 'invalid') {
        showFormError('Revisa los datos del formulario e inténtalo de nuevo.');
      } else {
        showFormError('No pudimos reservar tu hora. Inténtalo de nuevo o escríbenos por WhatsApp.');
      }
    } catch {
      showFormError('No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  });

  /* ---------- Confirmación ---------- */
  function showSuccess(payload: BookingPayload): void {
    $<HTMLElement>('#success-when').textContent = `${longDate.format(fromKey(payload.date))}, ${payload.time}`;
    $<HTMLElement>('#success-mail').textContent = `Te enviamos la confirmación y la invitación a ${payload.email}.`;
    $<HTMLAnchorElement>('#add-to-calendar').href = calendarLink(payload);
    form.hidden = true;
    success.hidden = false;
    success.focus();
    success.scrollIntoView({ block: 'center', behavior: 'smooth' });
    celebrate();
  }

  $('#book-again').addEventListener('click', () => {
    const previousDate = selectedDate;
    form.reset();
    fieldNames.forEach((name) => setFieldError(name, null));
    selectedTime = null;
    success.hidden = true;
    form.hidden = false;
    if (previousDate) selectDate(previousDate);
  });

  bindPress($('#add-to-calendar'));
  renderCalendar();
}
