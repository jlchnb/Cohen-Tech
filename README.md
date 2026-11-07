# Cohen Tech: página web con agenda en Google Calendar

Vite + TypeScript + HTML + CSS + Tailwind v4 + Motion.

## Probarla en tu computador

```bash
npm install
npm run dev
```

Abre la dirección que muestra la terminal. Sin configurar nada, la página funciona en **modo de prueba**: muestra horas de ejemplo y no guarda reservas.

## Conectarla a tu Google Calendar (10 minutos)

1. Entra a [script.google.com](https://script.google.com) con la cuenta de Google cuyo calendario quieres usar y crea un proyecto nuevo.
2. Pega el contenido de `apps-script/Code.gs` en el archivo `Código.gs`.
3. En **Configuración del proyecto**, activa "Mostrar el archivo de manifiesto appsscript.json" y pega el contenido de `apps-script/appsscript.json` (deja la zona horaria en `America/Santiago`).
4. Revisa el bloque `CONFIG` de arriba: horarios, turnos, duración de cada hora y, si quieres, `OWNER_EMAIL` para recibir un aviso por correo en cada reserva.
5. **Implementar > Nueva implementación > Aplicación web**. Ejecutar como: *Yo*. Quién tiene acceso: *Cualquier usuario*. Acepta los permisos (Calendar y Gmail/correo).
6. Copia la URL que termina en `/exec`.
7. En esta carpeta, copia `.env.example` a `.env` y completa:

   ```
   VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXX/exec
   VITE_WHATSAPP=56912345678
   ```

8. Si cambias horarios o turnos, ajústalos **en los dos lados**: `src/config.ts` (lo que ve el cliente) y `CONFIG` en `Code.gs` (lo que valida el servidor).

Cada vez que cambies `Code.gs`, publica una **nueva versión** de la implementación; la URL se mantiene.

## Guardar las consultas en Supabase

Cada reserva se guarda como una fila en la tabla `consultas` (nombre, correo, teléfono, notebook o escritorio, modelo, detalle, fecha y hora de la cita, estado y el ID del evento del calendario).

1. En Supabase abre **SQL Editor**, pega el contenido de `supabase/consultas.sql` y ejecútalo.
2. En Supabase, **Project Settings > API Keys**: copia la **URL del proyecto** y la **clave secreta** (`sb_secret_...`, o la `service_role` si tu proyecto usa claves antiguas). Esa clave da acceso total: no la pongas en la web ni en `.env`.
3. En Apps Script: **Configuración del proyecto > Propiedades del script > Agregar propiedad**:
   - `SUPABASE_URL` = `https://TU-PROYECTO.supabase.co`
   - `SUPABASE_KEY` = la clave secreta
4. Publica una nueva versión de la implementación y acepta el nuevo permiso (conexión a servicios externos).

La tabla queda cerrada al público (RLS activado, sin políticas): solo el script puede escribir en ella. Tú ves y editas las filas desde **Table Editor** de Supabase y puedes cambiar el `estado` de cada una (agendada, en revisión, en reparación, lista, entregada, cancelada).

**Si la reserva llega al calendario pero no a Supabase:** abre la consola del navegador (F12) al reservar; la página indica el motivo. Para confirmarlo desde Google, abre el editor de Apps Script, elige la función `testSupabase` y toca Ejecutar (la primera vez pide autorizar conexiones externas). El registro de ejecución dice si falta una propiedad, si la clave es incorrecta o si no encuentra la tabla.

Si Supabase fallara en una reserva, la hora igual queda en tu calendario con todos los datos en la descripción, y con `OWNER_EMAIL` configurado te llega un aviso.

## Tus turnos 4x4 y tu disponibilidad

El calendario de la página muestra solo los días en que puedes atender. La regla vive en `getAvailability()` (`src/schedule.ts`) y se repite en `availabilityFor_()` (`Code.gs`) para que el servidor también la valide. Se configura con el bloque `shifts`:

- `anchor`: primer día de un bloque de trabajo (hoy `2026-11-07`). El ciclo de 8 días se repite solo.
- `firstBlock`: `night` o `day`. Los bloques se alternan: noche, día, noche, día.
- Días de trabajo: no se atiende. Día de entrada a turno de noche: hasta `morningUntilHour` (13:00). Día de salida de turno de noche: desde `afterNightFromHour` (15:00). Día siguiente a un turno de día: horario completo.
- Para cerrar siempre ciertos días de la semana, usa `closedWeekdays` (por ejemplo `[0]` cierra los domingos).

Para una excepción puntual (vacaciones, un trámite), crea un evento en tu Google Calendar: si es de todo el día, bloquea el día completo, y si tiene horario, bloquea esas horas.

## Publicarla

```bash
npm run build
```

Sube la carpeta `dist/` a Netlify, Vercel, Cloudflare Pages o GitHub Pages. Define las mismas variables `VITE_...` en el panel del servicio, porque se incorporan al compilar.

## Cómo funciona la agenda

- La página pide al script las horas ocupadas del día elegido y solo deja reservar las libres. Los eventos marcados como "Disponible" en tu calendario no bloquean horas, y los de todo el día bloquean el día completo.
- Al confirmar, el script vuelve a revisar que la hora siga libre (con un candado, para que dos personas no tomen la misma) y crea el evento en tu calendario con los datos del cliente. Google le envía la invitación al correo que escribió.
- El formulario incluye un campo oculto contra bots y validación de datos en el servidor.

## Ideas para sumar después

- **Estados por color** en el evento: pendiente, en reparación, listo para retiro.
- **Recordatorio al cliente** el día anterior con un disparador de Apps Script.
- **Hoja de Google Sheets** que registre cada solicitud (cliente, equipo, estado, precio) como historial.
- **Retiro y despacho**: pregunta si va al local o necesita retiro, y bloquea más tiempo en esos casos.
- **Horas según servicio**: limpieza 1 h, formateo 2 h, diagnóstico 30 min.
- **Reprogramar o cancelar** con un enlace único en el correo de confirmación.
