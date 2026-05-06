# WhatsApp Bridge

## Qué es

Servicio Node.js que conecta el WhatsApp del negocio con la aplicación.
Actúa como espejo: todo mensaje/foto que llega al WhatsApp queda guardado en la base de datos del panel.

---

## Alojamiento actual

- **URL:** `https://bridge-production-13f7.up.railway.app`
- **Plataforma:** Railway
- **Variable de entorno en app:** `WHATSAPP_BRIDGE_URL=https://bridge-production-13f7.up.railway.app`
- **Secret de webhook:** `WEBHOOK_SECRET=ventas-live-bridge-2026`
- **Teléfono de prueba:** `59172698959` (variable `LIVE_SALES_TEST_PHONE`)

**Estado:** Se quiere migrar a otro alojamiento (Oracle, Fly.io, u otro).

---

## Cómo funciona

```
WhatsApp del negocio
    ↓ mensaje/foto llega
WhatsApp Bridge (Railway)
    ↓ webhook recibe el evento
POST a la app principal (ventas-live.vercel.app o local)
    → guarda en panel_clientes (crea o actualiza cliente por phone)
    → guarda en panel_mensajes (content, has_media, media_url)
    → si es imagen: sube a Supabase Storage (bucket: whatsapp-media)
```

---

## Base de datos del panel (Supabase `vwaocoaeenavxkcshyuf`)

```
panel_clientes
  id, phone, nombre, created_at, last_interaction
  resumen (JSON con datos del pedido extraídos por IA)
  resumen_at (última vez que se procesó con IA)
  estado (pagado_verificado, pendiente, etc.)

panel_mensajes
  id, cliente_id, direction (in/out), content
  has_media, media_url, media_type
  transcripcion (para audios)
  whatsapp_message_id (para deduplicación)
  created_at
```

---

## Procesamiento con IA

Cuando el operador aprieta el botón **"Live"** en la app, o manualmente entra al chat de un cliente:

1. `POST /api/ai/summarize-conversation { clienteId }`
2. El servidor lee todos los `panel_mensajes` del cliente desde la última sesión
3. Llama a OpenRouter (`google/gemini-2.5-flash-lite`) con el historial
4. La IA extrae: nombre del pagador, monto, hora, si hay comprobante
5. Guarda resultado en `panel_clientes.resumen`
6. Crea/actualiza registro en `pagos_venta_live`
7. Intenta cruzar con pago MacroDroid (`matchLivePaymentWithMacrodroid`)

---

## Endpoint de procesamiento en la app

```
GET  /api/live-sales/pending-conversations   — lista clientes con mensajes no procesados
POST /api/ai/summarize-conversation          — procesa un cliente específico
DELETE /api/live-sales/conversations         — limpia conversaciones del día
```

---

## Migración de alojamiento — consideraciones

El bridge es un proceso de larga duración (mantiene sesión WA activa).
Necesita:
- Proceso Node.js persistente (no serverless)
- Almacenamiento para archivos de sesión WA (`.wwebjs_auth/`)
- Puerto expuesto públicamente para recibir el webhook de WA
- Variables de entorno: URL de la app principal, webhook secret, credenciales Supabase del panel

**Opciones evaluadas:** Railway (actual), Oracle Cloud Free Tier, Fly.io, Render.

Al migrar, solo hay que actualizar `WHATSAPP_BRIDGE_URL` en el `.env` de la app principal.
