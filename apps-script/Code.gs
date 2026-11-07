/**
 * Cohen Tech: reservas con Google Calendar + registro de consultas en Supabase.
 *
 * Qué hace:
 *  - doGet (action=busy) → le dice a la página qué horas del día ya están ocupadas en tu calendario.
 *  - doGet (action=book)  → valida la hora contra tus turnos 4x4, crea el evento en tu calendario (invita al cliente
 *             por correo), guarda la consulta en Supabase y, si quieres, te avisa por correo.
 *
 * Publicación: Implementar > Nueva implementación > Aplicación web
 *   Ejecutar como: Yo   |   Quién tiene acceso: Cualquier usuario
 *
 * Claves de Supabase (NO van en este archivo): Configuración del proyecto > Propiedades del script
 *   SUPABASE_URL = https://TU-PROYECTO.supabase.co
 *   SUPABASE_KEY = tu clave secreta (secret / service_role)
 */

var CONFIG = {
  BUSINESS_NAME: 'Cohen Tech',
  CALENDAR_ID: 'primary', // 'primary' = tu calendario principal. Puedes usar el ID de otro calendario.
  TIMEZONE: 'America/Santiago',
  SLOT_MINUTES: 60,
  OPEN_HOUR: 10,
  CLOSE_HOUR: 19,
  CLOSED_WEEKDAYS: [], // días sin atención: 0 = domingo ... 6 = sábado. Vacío = todos los días.
  OWNER_EMAIL: '', // opcional: recibe un correo por cada reserva

  // Debe coincidir con src/config.ts
  SHIFTS: {
    ANCHOR: '2026-11-07', // primer día de un bloque de trabajo
    FIRST_BLOCK: 'night', // tipo de ese bloque; luego se alternan noche y día
    WORK_DAYS: 4,
    OFF_DAYS: 4,
    MORNING_UNTIL_HOUR: 13, // día de entrada a turno de noche: se atiende hasta esta hora
    AFTER_NIGHT_FROM_HOUR: 15 // día de salida de turno de noche: se atiende desde esta hora
  }
};

/**
 * La página usa GET para todo. Los navegadores bloquean (CORS) la respuesta de un POST a Apps Script,
 * porque Google la redirige a otro dominio; con GET esa redirección funciona sin problema.
 *   ?action=busy&date=AAAA-MM-DD    → horas ocupadas del día
 *   ?action=book&data=<JSON>        → crea la reserva
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'busy' && isRealDate_(p.date)) {
    return json_({ ok: true, busy: busyForDay_(p.date) });
  }
  if (p.action === 'book') {
    var data;
    try {
      data = JSON.parse(p.data);
    } catch (err) {
      return json_({ ok: false, error: 'invalid' });
    }
    return handleBooking_(data);
  }
  return json_({ ok: false, error: 'bad_request' });
}

// Se mantiene por compatibilidad (por ejemplo, para probar con herramientas como curl).
function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'invalid' });
  }
  return handleBooking_(data);
}

function handleBooking_(data) {
  // Campo trampa para bots: si viene lleno, fingimos éxito y no hacemos nada.
  if (data && data.website) return json_({ ok: true });

  if (!isValid_(data)) return json_({ ok: false, error: 'invalid' });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }

  var booking;
  try {
    booking = book_(data);
  } catch (err) {
    console.error(err);
    booking = { ok: false, error: 'server' };
  } finally {
    lock.releaseLock();
  }
  if (!booking.ok) return json_(booking);

  // La hora ya quedó reservada. Si Supabase falla, el cliente igual ve su confirmación
  // y los datos siguen en la descripción del evento del calendario.
  var saved = saveInquiry_(data, booking);
  notifyOwner_(data, booking, saved);
  return json_({ ok: true });
}

/* ---------- Reserva ---------- */

function book_(data) {
  var startMin = timeToMinutes_(data.time);
  var slot = CONFIG.SLOT_MINUTES;
  var win = availabilityFor_(data.date);

  // La hora debe caer dentro de tus tiempos disponibles y en la grilla de horas.
  if (
    startMin === null ||
    !win ||
    startMin < win.from ||
    startMin + slot > win.to ||
    (startMin - CONFIG.OPEN_HOUR * 60) % slot !== 0
  ) {
    return { ok: false, error: 'unavailable' };
  }

  var start = Utilities.parseDate(data.date + ' ' + data.time, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
  var end = new Date(start.getTime() + slot * 60000);
  if (start.getTime() < Date.now()) return { ok: false, error: 'past' };

  var calendar = getCalendar_();
  var clashes = calendar.getEvents(start, end).filter(isBlocking_);
  if (clashes.length > 0) return { ok: false, error: 'slot_taken' };

  var equipment = data.isNotebook ? 'Notebook' : 'PC de escritorio';
  var title = CONFIG.BUSINESS_NAME + ': ' + equipment + ' ' + clean_(data.model, 80) + ' (' + clean_(data.name, 60) + ')';
  var description = [
    'Cliente: ' + clean_(data.name, 80),
    'Correo: ' + clean_(data.email, 120),
    'Teléfono: ' + clean_(data.phone, 30),
    'Equipo: ' + equipment + ' - ' + clean_(data.model, 120),
    '',
    'Detalle del servicio:',
    String(data.details).slice(0, 2000)
  ].join('\n');

  var event = calendar.createEvent(title, start, end, {
    description: description,
    guests: clean_(data.email, 120),
    sendInvites: true
  });
  event.removeAllReminders();
  event.addPopupReminder(60);
  event.addEmailReminder(24 * 60);

  return { ok: true, start: start, end: end, eventId: event.getId(), description: description };
}

/* ---------- Supabase ---------- */

function saveInquiry_(data, booking) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL');
  var key = props.getProperty('SUPABASE_KEY');
  if (!url || !key) return { ok: false, skipped: true };

  var row = {
    nombre: clean_(data.name, 80),
    correo: clean_(data.email, 120),
    telefono: clean_(data.phone, 30),
    es_notebook: data.isNotebook,
    modelo: clean_(data.model, 120),
    detalle: String(data.details).slice(0, 2000),
    fecha_cita: data.date,
    hora_cita: data.time,
    inicio_cita: Utilities.formatDate(booking.start, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'"),
    fin_cita: Utilities.formatDate(booking.end, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'"),
    evento_calendar_id: booking.eventId
  };

  // Las claves nuevas (sb_secret_...) van solo en "apikey"; las antiguas (JWT, empiezan con eyJ) también como Bearer.
  var headers = { apikey: key, Prefer: 'return=minimal' };
  if (key.indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + key;

  try {
    var response = UrlFetchApp.fetch(url.replace(/\/+$/, '') + '/rest/v1/consultas', {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(row),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) return { ok: true };
    console.error('Supabase respondió ' + code + ': ' + response.getContentText());
    return { ok: false };
  } catch (err) {
    console.error(err);
    return { ok: false };
  }
}

function notifyOwner_(data, booking, saved) {
  if (!CONFIG.OWNER_EMAIL) return;
  try {
    var warning = saved.ok || saved.skipped ? '' : '\n\nAVISO: no se pudo guardar en Supabase. Revisa Ejecuciones en Apps Script.';
    MailApp.sendEmail(
      CONFIG.OWNER_EMAIL,
      'Nueva reserva: ' + data.date + ' ' + data.time,
      booking.description + warning
    );
  } catch (err) {
    console.error(err);
  }
}

/* ---------- Tus tiempos disponibles (espejo de src/schedule.ts) ---------- */

function mod_(a, n) {
  return ((a % n) + n) % n;
}

function dayNumber_(key) {
  var p = key.split('-');
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000;
}

/**
 * Devuelve { from, to } en minutos si ese día se puede atender, o null si no.
 *  - Días de trabajo: null.
 *  - Turno de noche, día de entrada: solo en la mañana.
 *  - Turno de noche, día de salida: desde la tarde.
 *  - Otros días libres: todo el horario.
 */
function availabilityFor_(key) {
  var s = CONFIG.SHIFTS;
  var open = CONFIG.OPEN_HOUR * 60;
  var close = CONFIG.CLOSE_HOUR * 60;

  var weekday = mod_(dayNumber_(key) + 4, 7); // 0 = domingo
  if (CONFIG.CLOSED_WEEKDAYS.indexOf(weekday) !== -1) return null;

  var cycleLength = s.WORK_DAYS + s.OFF_DAYS;
  var diff = dayNumber_(key) - dayNumber_(s.ANCHOR);
  var cycle = Math.floor(diff / cycleLength);
  var dayInCycle = mod_(diff, cycleLength);
  var isNight = (mod_(cycle, 2) === 0) === (s.FIRST_BLOCK === 'night');

  if (dayInCycle < s.WORK_DAYS) {
    if (isNight && dayInCycle === 0) return { from: open, to: Math.min(close, s.MORNING_UNTIL_HOUR * 60) };
    return null;
  }
  if (isNight && dayInCycle === s.WORK_DAYS) {
    return { from: Math.max(open, s.AFTER_NIGHT_FROM_HOUR * 60), to: close };
  }
  return { from: open, to: close };
}

/* ---------- Ayudas ---------- */

function getCalendar_() {
  return CONFIG.CALENDAR_ID === 'primary'
    ? CalendarApp.getDefaultCalendar()
    : CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
}

// Los eventos marcados como "Disponible" no bloquean horas.
function isBlocking_(event) {
  return event.getTransparency() !== CalendarApp.EventTransparency.TRANSPARENT;
}

function busyForDay_(date) {
  var dayStart = Utilities.parseDate(date + ' 00:00', CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
  var dayEnd = Utilities.parseDate(date + ' 23:59', CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
  return getCalendar_()
    .getEvents(dayStart, dayEnd)
    .filter(isBlocking_)
    .map(function (event) {
      if (event.isAllDayEvent()) return { start: 0, end: 1440 };
      return {
        start: minutesOfDay_(event.getStartTime(), dayStart, dayEnd),
        end: minutesOfDay_(event.getEndTime(), dayStart, dayEnd)
      };
    });
}

function minutesOfDay_(time, dayStart, dayEnd) {
  if (time.getTime() <= dayStart.getTime()) return 0;
  if (time.getTime() >= dayEnd.getTime()) return 1440;
  var parts = Utilities.formatDate(time, CONFIG.TIMEZONE, 'HH:mm').split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function timeToMinutes_(value) {
  var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function isRealDate_(value) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!m) return false;
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function isValid_(d) {
  return (
    d &&
    typeof d.name === 'string' && d.name.trim().length >= 2 &&
    typeof d.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim()) &&
    typeof d.phone === 'string' && d.phone.replace(/\D/g, '').length >= 8 &&
    typeof d.isNotebook === 'boolean' &&
    typeof d.model === 'string' && d.model.trim().length >= 2 &&
    typeof d.details === 'string' && d.details.trim().length >= 10 &&
    isRealDate_(d.date) &&
    timeToMinutes_(d.time) !== null
  );
}

function clean_(value, max) {
  return String(value).replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

function json_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}
