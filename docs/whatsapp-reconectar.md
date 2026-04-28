# Reconectar WhatsApp — Plan de solución

## ¿Qué pasó?

El sistema tiene **dos partes separadas**:

```
App (Vercel)  ──→  /api/whatsapp/status  ──→  Conector (Railway)  ──→  WhatsApp
```

- **Vercel** es la app que usás todos los días.
- **Railway** es un servidor aparte que mantiene la sesión de WhatsApp activa y genera el QR.

El problema actual es que Vercel no sabe dónde está el servidor de Railway. Falta una variable de entorno llamada `WHATSAPP_CONNECTOR_URL`. Sin ella, la app busca el conector en `localhost:3000` (que no existe en Vercel) → resultado: **error**.

Además, el servicio de Railway puede estar caído o con la sesión expirada.

---

## Paso 1 — Verificar Railway

1. Abrí [railway.app](https://railway.app) e iniciá sesión
2. Buscá el proyecto **whatsapp-bridge** (o similar)
3. Fijate el estado del servicio:
   - **Verde / Running** → el servicio está activo, anotá la URL pública (termina en `.up.railway.app`)
   - **Rojo / Crashed / Sleeping** → hay que reiniciarlo (ver Paso 2)
   - **No existe** → hay que redesplegarlo desde cero (ver Paso 3)

---

## Paso 2 — Si el servicio existe pero está caído

Dentro de Railway, en el servicio whatsapp-bridge:

1. Hacé clic en **"Restart"** o **"Redeploy"**
2. Esperá 30-60 segundos a que arranque
3. Abrí la URL pública del servicio en el navegador
   - Si ves "⏳ Iniciando bridge..." → está arrancando, esperá 30 segundos más y recargá
   - Si ves un QR → perfecto, está funcionando
4. Anotá esa URL pública (la vas a necesitar en el Paso 4)

---

## Paso 3 — Si el servicio no existe en Railway (redespliegue desde cero)

Abrí una terminal en la carpeta del conector:

```bash
cd "Faces panel de pedido/whatsapp-conector"
```

Instalá el CLI de Railway si no lo tenés:
```bash
npm install -g @railway/cli
```

Iniciá sesión y desplegá:
```bash
railway login
railway init        # Creá un nuevo proyecto llamado "whatsapp-bridge"
railway up          # Sube el código
```

Luego configurá las variables de entorno en el dashboard de Railway (Settings → Variables):

| Variable | Valor |
|---|---|
| `WEBHOOK_URL` | `https://vhczofpmxzbqzboysoca.supabase.co/functions/v1/ingest-whatsapp` |
| `SUPABASE_URL` | `https://vhczofpmxzbqzboysoca.supabase.co` |
| `SUPABASE_SERVICE_KEY` | *(la service role key de Supabase)* |
| `PORT` | `3000` |

Railway usa el **Dockerfile** que ya está en la carpeta — no necesitás configurar nada más del build.

Una vez desplegado, anotá la URL pública.

---

## Paso 4 — Conectar Railway con Vercel

Con la URL pública de Railway a mano (ej: `https://whatsapp-bridge-production-abc123.up.railway.app`), abrí una terminal en la carpeta del proyecto principal:

```bash
cd "C:/Proyectos Ivan/nuevo/ventas-live (9)"
vercel env add WHATSAPP_CONNECTOR_URL production
```

Cuando te pida el valor, pegá la URL de Railway **sin barra al final**:
```
https://whatsapp-bridge-production-abc123.up.railway.app
```

---

## Paso 5 — Redesplegar Vercel

```bash
vercel --prod
```

Esperá que termine (aprox. 1 minuto).

---

## Paso 6 — Escanear el QR y reconectar

1. Abrí la app: [https://ventas-live.vercel.app](https://ventas-live.vercel.app)
2. Andá a **Configuración → Sistema**
3. Debería aparecer el QR (si no aparece de inmediato, esperá 30 segundos y recargá)
4. Abrí WhatsApp en el celular de la empresa
5. Tocá los **3 puntos** → **Dispositivos vinculados** → **Vincular un dispositivo**
6. Apuntá la cámara al QR
7. La pantalla debería cambiar a **"WhatsApp conectado ✓"**

---

## ¿Qué pasa si el QR no aparece después del Paso 6?

Verificá en la URL del conector de Railway directamente:
```
https://tu-url-railway.up.railway.app/status
```

Debe devolver algo como:
```json
{ "connected": false, "qrDataUrl": "data:image/png;base64,..." }
```

Si devuelve `qrDataUrl: null` y `connected: false`, el bridge todavía está iniciando — esperá 30 segundos más.

Si la URL no carga en absoluto, el servicio de Railway está caído → volvé al Paso 2.

---

## Resumen rápido

```
1. Railway → verificar que el servicio corre y tiene URL pública
2. Si no corre → reiniciar o redesplegar
3. Vercel → agregar WHATSAPP_CONNECTOR_URL con la URL de Railway
4. vercel --prod
5. Escanear QR desde la app → Configuración → Sistema
```
