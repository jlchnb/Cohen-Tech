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
4. Revisa el bloque `CONFIG` de arriba: horarios, duración de cada hora y, si quieres, `OWNER_EMAIL` para recibir un aviso por correo en cada reserva.
5. **Implementar > Nueva implementación > Aplicación web**. Ejecutar como: *Yo*. Quién tiene acceso: *Cualquier usuario*. Acepta los permisos (Calendar y Gmail/correo).
6. Copia la URL que termina en `/exec`.
7. En esta carpeta, copia `.env.example` a `.env` y completa:

   ```
   VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXX/exec
   VITE_WHATSAPP=56912345678
   ```

8. Si cambias horarios, ajústalos **en los dos lados**: `src/config.ts` (lo que ve el cliente) y `CONFIG` en `Code.gs` (lo que valida el servidor).

Cada vez que cambies `Code.gs`, publica una **nueva versión** de la implementación; la URL se mantiene.

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
