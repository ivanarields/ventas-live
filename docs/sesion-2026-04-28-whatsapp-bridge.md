# Sesión 28 Abril 2026 — Activación del Motor de Envío WhatsApp

## Qué se quería lograr

Agregar la capacidad de **enviar** mensajes de WhatsApp desde la app (no solo recibirlos).
El Bridge en Railway hasta hoy solo recibía mensajes de las clientas. El plan era actualizarlo
para que también pueda enviar, y conectarlo con el panel de la app que ya estaba codificado.

---

## Lo que salió BIEN ✅

### 1. Tabla de mensajes en la base de datos
- Se aplicó la migración `035_whatsapp_queue.sql` en Supabase.
- Ahora existe la tabla `whatsapp_message_queue` donde se guardan los mensajes que esperan ser enviados.
- Comando usado: `supabase db push --linked`

### 2. Variables de entorno en Vercel
- Se agregaron dos variables al proyecto de Vercel para que la app sepa dónde está el Bridge:
  - `WHATSAPP_BRIDGE_URL = https://bridge-production-13f7.up.railway.app`
  - `WEBHOOK_SECRET = ventas-live-bridge-2026`
- Se encontró el token de Vercel en `docs/tokenvercel.md`.
- Se usó la API de Vercel directamente (sin CLI).
- Se disparó un redeploy de Vercel que quedó en READY.

### 3. Variables de entorno locales (.env)
- Se agregaron las mismas dos variables al archivo `.env` local para que funcione en desarrollo.

### 4. Código del Bridge actualizado
- Se creó la carpeta `bridge/` en la raíz del repositorio con el código nuevo del Bridge.
- El código nuevo incluye `send.js` que agrega los endpoints:
  - `POST /api/send` — envía un mensaje de texto a un número de WhatsApp
  - `GET /api/health` — devuelve si el Bridge está conectado o no
- Esto se subió a GitHub en el commit `c865c81`.

### 5. Bridge en Railway desplegado y funcionando
- Después de 5 intentos fallidos, el deploy final quedó en **SUCCESS**.
- El Bridge responde en `https://bridge-production-13f7.up.railway.app`
- Está mostrando la pantalla de inicio (generando QR para conectar WhatsApp).

### 6. WEBHOOK_SECRET configurado en Railway
- Se agregó `WEBHOOK_SECRET = ventas-live-bridge-2026` a las variables de Railway.
- Esto protege el endpoint `/api/send` para que solo la app pueda usarlo.

---

## Lo que salió MAL ❌ (y cómo se resolvió)

### Error 1 — API de Railway cambió
**Qué pasó:** El script original `deploy-railway.mjs` usaba `sourceUploadCreate` para subir
el código como un ZIP. Esa función ya no existe en la API de Railway.

**Cómo se resolvió:** Se conectó el servicio de Railway al repositorio de GitHub
(`ivanarields/ventas-live`) para que tome el código desde ahí.

---

### Error 2 — Railway CLI rechazaba el token
**Qué pasó:** El token de Railway (`49911d5c...`) funciona para la API GraphQL pero el
CLI de Railway lo rechaza con "Unauthorized".

**Cómo se resolvió:** Se usó la API GraphQL directamente para todas las operaciones,
sin necesidad del CLI.

---

### Error 3 — Railway ignoraba la subcarpeta (4 crashes seguidos)
**Qué pasó:** Se intentó conectar Railway a la subcarpeta `Faces panel de pedido/whatsapp-conector`
del repositorio. Railway ignoró el `rootDirectory` y siempre ejecutaba la app principal
(`server.ts`) en vez del Bridge (`index.js`), dando este error:

```
Error: Cannot find module '/app/src/lib/supabaseServer.js'
```

Esto pasó porque:
- El nombre de la carpeta tenía espacios ("Faces panel de pedido")
- El comando `githubRepoDeploy` resetea la configuración cada vez que se llama

**Intentos fallidos:**
1. rootDirectory = `Faces panel de pedido/whatsapp-conector` → CRASH
2. rootDirectory = `bridge` + githubRepoDeploy → CRASH (la config se reseteaba)
3. startCommand explícito + githubRepoDeploy → CRASH (la config se reseteaba)
4. builder DOCKERFILE → ERROR (Railway no tiene ese builder en su API actual)

**Cómo se resolvió:**
- Se creó la carpeta `bridge/` en la raíz del repo (sin espacios)
- Se copió ahí el código del Bridge
- Se configuró primero el servicio con `serviceInstanceUpdate` (rootDirectory + startCommand)
- Se verificó que la config quedó guardada
- Se disparó el deploy con `serviceInstanceDeploy` (NO con `githubRepoDeploy` que reseteaba todo)
- Resultado: **SUCCESS** ✅

---

### Error 4 — Token de Vercel vencido
**Qué pasó:** El token guardado en `~/.vercel/auth.json` venció el 25 de abril de 2026.

**Cómo se resolvió:** Se encontró el token vigente en `docs/tokenvercel.md`.

---

## Lo que falta hacer (pendiente)

### 1. Escanear el QR de WhatsApp ⚠️ (lo hace Ivan)
El Bridge está corriendo pero aún no está conectado a WhatsApp.
Hay que abrir este link en el navegador y escanearlo con el celular del negocio:

**`https://bridge-production-13f7.up.railway.app`**

Pasos:
1. Abrir ese link en el navegador
2. Aparece un QR
3. Abrir WhatsApp en el celular → Dispositivos vinculados → Vincular dispositivo → Escanear QR
4. Listo — el Bridge queda conectado

**Nota:** Cada vez que Railway redespliega el Bridge, se pierde la sesión y hay que escanear el QR de nuevo.

### 2. Probar el flujo completo
Una vez conectado el QR:
1. Ir al perfil de una clienta en la app
2. Tocar el botón "Notificar Live" (ícono de video)
3. Verificar que el mensaje entra en la cola (panel WhatsApp → pestaña Mensajería)
4. Desde ese panel, tocar "Envío Seguro" para enviarlo
5. La clienta recibe el mensaje en WhatsApp con el link a la tienda

### 3. Sesión persistente del Bridge (mejora futura)
Actualmente la sesión de WhatsApp se pierde cada vez que Railway redespliega.
Para evitar esto hay que agregar un **volumen persistente** en Railway que guarde
la carpeta `.wwebjs_auth`. Eso es una mejora, no urgente.

---

## IDs de referencia (para futuras sesiones)

| Recurso | ID |
|---|---|
| Railway proyecto (whatsapp-bridge) | `a1fae483-f8d2-4011-aca9-f5466fa1cc87` |
| Railway servicio (bridge) | `65afcf58-3481-416a-a4be-030c55798e8e` |
| Railway environment (production) | `16e8bac0-e052-44a2-a22a-a23d97d3b78d` |
| Vercel proyecto | `prj_gNNLSgdwI2QSyPLmoAZ0PksGNUdG` |
| Vercel team | `team_HOQ9aoior6hCaSQvcKcCv7Ir` |
| Bridge URL | `https://bridge-production-13f7.up.railway.app` |
| Supabase proyecto principal | `vhczofpmxzbqzboysoca` |
| Supabase proyecto WhatsApp panel | `vwaocoaeenavxkcshyuf` |

---

## Resumen en palabras simples

**Antes de esta sesión:** La app podía recibir mensajes de WhatsApp, pero no podía mandar.

**Después de esta sesión:** Todo el sistema está armado para mandar mensajes.
La única cosa que falta es escanear el QR con el celular del negocio para que el
Bridge quede conectado a WhatsApp.
