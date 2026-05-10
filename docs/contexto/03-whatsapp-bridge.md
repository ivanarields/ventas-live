# WhatsApp Bridge

Última revisión: 2026-05-10. Verificado contra el código real (`src/routes/whatsapp.ts`).

---

## Qué es

Servicio Node.js que conecta el WhatsApp del negocio con la aplicación.
Funciona como espejo: todo mensaje o foto que llega al WhatsApp queda guardado en la DB del panel (PanelPedido).
También se usa para **enviar** mensajes salientes (confirmaciones de tienda online, etc.).

---

## Alojamiento actual

- **Host:** DigitalOcean droplet
- **URL:** `http://134.122.123.253:3001`
- **Variable en app:** `WHATSAPP_BRIDGE_URL=http://134.122.123.253:3001`
- **Secret de webhook:** `WEBHOOK_SECRET=ventas-live-bridge-2026`
- **Teléfono de prueba:** `59172698959` (variable `LIVE_SALES_TEST_PHONE`)

**Migración previa:** estaba en Railway. Migrado a DigitalOcean en commit `da72962`.

---

## Cómo funciona — recibir mensajes

```
WhatsApp del negocio
    ↓ mensaje/foto entrante
Bridge en DigitalOcean
    ↓ webhook envía a la app (header x-webhook-secret)
POST a leidydiaz.live
    → guarda en panel_clientes (crea o actualiza por phone)
    → guarda en panel_mensajes (content, has_media, media_url)
    → si es imagen: sube a Supabase Storage del panel (bucket whatsapp-media)
```

---

## Cómo funciona — enviar mensajes

Hay dos modos de envío:

### Automático (procesador cada 60 seg)
1. Servidor encola mensaje en `whatsapp_message_queue` (ChehiAppAbril).
2. Procesador toma el siguiente con `storeOnly: true` — solo mensajes con `reference_type='store_order'`.
3. Lock atómico: `UPDATE SET status='sending' WHERE status='pending'` (evita doble envío).
4. `POST http://134.122.123.253:3001/api/send` con `x-webhook-secret`.
5. Bridge responde OK → `status='sent'`. Si falla → `status='failed'`.

### Manual — "Envío Seguro" (desde la pestaña Pagos o Comprobantes Live)
- Operador toca el botón de envío en el panel de WhatsApp.
- Llama `POST /api/whatsapp/send-next` **sin** filtro `storeOnly` — envía cualquier tipo de mensaje.
- Delay aleatorio de 2–4 minutos para no parecer bot.

---

## Base de datos del panel (`vwaocoaeenavxkcshyuf` — PanelPedido)

```
panel_clientes
    id, phone, nombre, created_at, last_interaction
    resumen (JSON con datos extraídos por IA)
    resumen_at, estado

panel_mensajes
    id, cliente_id, direction (in/out), content
    has_media, media_url, media_type
    transcripcion (para audios)
    whatsapp_message_id (deduplicación)
    created_at
```

> La tabla `whatsapp_message_queue` vive en **ChehiAppAbril** (`vhczofpmxzbqzboysoca`), no en PanelPedido.

---

## Procesamiento con IA

Cuando el operador toca el botón **"Live"** en la pestaña **Pagos**:

1. `POST /api/ai/summarize-conversation { clienteId }`
2. Servidor lee `panel_mensajes` desde la última sesión.
3. OpenRouter (`google/gemini-2.5-flash-lite`, `thinkingBudget: 0`) extrae: nombre, monto, hora, foto de comprobante.
4. Guarda resultado en `panel_clientes.resumen`.
5. Crea o actualiza registro en `pagos_venta_live` (PanelPedido).
6. Intenta cruzar con notificación MacroDroid (`matchLivePaymentWithMacrodroid`).

---

## Endpoints relacionados

```
GET  /api/live-sales/pending-conversations    lista clientes con mensajes no procesados
POST /api/ai/summarize-conversation           procesa un cliente específico con IA
DELETE /api/live-sales/conversations          limpia conversaciones del día
GET POST PATCH /api/whatsapp/queue            cola de mensajes pendientes
POST /api/whatsapp/send-next                  envío manual ("Envío Seguro")
POST /api/whatsapp/retry/:id                  reintenta mensaje fallido
```

---

## Requisitos del bridge

- Proceso Node.js **persistente** (no serverless — necesita sesión WA activa).
- Almacenamiento local para sesión WA (`.wwebjs_auth/`).
- Puerto público 3001 para recibir webhook del bridge.

Si se migra a otro servidor: solo actualizar `WHATSAPP_BRIDGE_URL` en `.env` de Vercel.
