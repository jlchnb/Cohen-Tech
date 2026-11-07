/**
 * Cohen Tech: reservas con Google Calendar.
 *
 * Qué hace:
 *  - doGet  → le dice a la página qué horas del día ya están ocupadas en tu calendario.
 *  - doPost → crea el evento, invita al cliente por correo y (opcional) te avisa a ti.
 *
 * Publicación: Implementar > Nueva implementación > Aplicación web
 *   Ejecutar como: Yo   |   Quién tiene acceso: Cualquier usuario
 */

var CONFIG = {
  BUSINESS_NAME: 'Cohen Tech',
  CALENDAR_ID: 'primary', // 'primary' = tu calendario principal. Puedes usar el ID de otro calendario.
  TIMEZONE: 'America/Santiago',
  SLOT_MINUTES: 60,
  OPEN_HOUR: 10,
  CLOSE_HOUR: 19,
  WORK_DAYS: [1, 2, 3, 4, 5, 6], // 1 = lunes ... 7 = domingo
  OWNER_EMAIL: '' // opcional: recibe un correo por cada reserva
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'busy' && /^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) {
    return json_({ ok: true, busy: busyForDay_(p.date) });
  }
  return json_({ ok: false, error: 'bad_request' });
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'invalid' });
  }

  // Campo trampa para bots: si viene lleno, fingimos éxito y no hacemos nada.
  if (data.website) return json_({ ok: true });

  if (!isValid_(data)) return json_({ ok: false, error: 'invalid' });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }

  try {
    var start = Utilities.parseDate(data.date + ' ' + data.time, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
    var end = new Date(start.getTime() + CONFIG.SLOT_MINUTES * 60000);

    if (start.getTime() < Date.now()) return json_({ ok: false, error: 'past' });
    if (!isWithinBusinessHours_(start, end)) return json_({ ok: false, error: 'invalid' });

    var calendar = getCalendar_();
    var clashes = calendar.getEvents(start, end).filter(isBlocking_);
    if (clashes.length > 0) return json_({ ok: false, error: 'slot_taken' });

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

    if (CONFIG.OWNER_EMAIL) {
      MailApp.sendEmail(
        CONFIG.OWNER_EMAIL,
        'Nueva reserva: ' + data.date + ' ' + data.time,
        description
      );
    }

    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server' });
  } finally {
    lock.releaseLock();
  }
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

function isWithinBusinessHours_(start, end) {
  var weekday = Number(Utilities.formatDate(start, CONFIG.TIMEZONE, 'u')); // 1 = lunes ... 7 = domingo
  var clock = Utilities.formatDate(start, CONFIG.TIMEZONE, 'HH:mm').split(':');
  var startMin = Number(clock[0]) * 60 + Number(clock[1]);
  var endMin = startMin + CONFIG.SLOT_MINUTES;
  return (
    CONFIG.WORK_DAYS.indexOf(weekday) !== -1 &&
    startMin >= CONFIG.OPEN_HOUR * 60 &&
    endMin <= CONFIG.CLOSE_HOUR * 60 &&
    end.getTime() > start.getTime()
  );
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
    /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') &&
    /^\d{2}:\d{2}$/.test(d.time || '')
  );
}

function clean_(value, max) {
  return String(value).replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

function json_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}
