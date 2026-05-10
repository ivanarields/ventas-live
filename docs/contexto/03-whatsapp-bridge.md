# WhatsApp Bridge

## Qué es

Servicio Node.js que conecta el WhatsApp del negocio con la aplicación.
Funciona como espejo: todo mensaje/foto que llega al WhatsApp queda guardado en la DB del panel.
También se usa para **enviar** mensajes salientes (confirmaciones de tienda, etc.).

---

## Alojamiento actual

- **Host:** DigitalOcean droplet
- **URL:** `http://134.122.123.253:3001`
- **Variable en app:** `WHATSAPP_BRIDGE_URL=http://134.122.123.253:3001`
- **Secret de webhook:** `WEBHOOK_SECRET=ventas-live-bridge-2026`
- **Teléfono de prueba:** `59172698959` (variable `LIVE_SALES_TEST_PHONE`)

**Migración previa:** estaba en Railway (`bridge-production-13f7.up.railway.app`). Migrado a DigitalOcean en commit `da72962`.

---

## Cómo funciona (recibir mensajes)

```
WhatsApp del negocio
    ↓ mensaje/foto entrante
Bridge en DigitalOcean
    ↓ webhook envía a la app
POST a leidydiaz.live (con header x-webhook-secret)
    → guarda en panel_clientes (crea o actualiza por phone)
    → guarda en panel_mensajes (content, has_media, media_url)
    → si es imagen: sube a Supabase Storage del panel (bucket whatsapp-media)
```

---

## Cómo funciona (enviar mensajes)

```
1. Servidor encola mensaje en whatsapp_message_queue (DB ChehiAppAbril).
2. Procesador automático cada 60 seg toma el siguiente con storeOnly:
   - Solo mensajes con reference_type='store_order'.
   - Lock atómico con UPDATE SET status='sending' WHERE status='pending'.
3. POST al bridge: http://134.122.123.253:3001/api/send
   Headers: x-webhook-secret: ventas-live-bridge-2026
   Body: { phone: '+591XXXXXXXX', message: 'texto' }
4. Bridge responde OK → status='sent', sent_at=NOW().
5. Si falla → status='failed', error_detail.
6. Mensajes que NO son de tienda (Live, manuales) se envían desde el panel
   con el botón "Envío Seguro" que llama POST /api/whatsapp/send-next.
```

---

## Base de datos del panel (`vwaocoaeenavxkcshyuf`)

```
panel_clientes
    id, phone, nombre, created_at, last_interaction
    resumen (JSON con datos extraídos por IA)
    resumen_at, estado

panel_mensajes
    id, cliente_id, direction (in/out), content
    has_media, media_url, media_type
    transcripcion (audios)
    whatsapp_message_id (deduplicación)
    created_at
```

---

## Procesamiento con IA

Cuando el operador aprieta "Live" en la app o entra al chat de un cliente:

1. `POST /api/ai/summarize-conversation { clienteId }`
2. Servidor lee `panel_mensajes` desde la última sesión.
3. OpenRouter (`google/gemini-2.5-flash-lite`) extrae: nombre, monto, hora, comprobante.
4. Guarda resultado en `panel_clientes.resumen`.
5. Crea/actualiza `pagos_venta_live`.
6. Intenta cruzar con MacroDroid (`matchLivePaymentWithMacrodroid`).

---

## Endpoints relacionados

```
GET  /api/live-sales/pending-conversations    lista clientes con mensajes no procesados
POST /api/ai/summarize-conversation           procesa un cliente específico
DELETE /api/live-sales/conversations          limpia conversaciones del día
GET POST PATCH /api/whatsapp/queue            cola de mensajes pendientes
POST /api/whatsapp/send-next                  envío manual desde el panel
POST /api/whatsapp/retry/:id                  reintenta mensaje failed
```

---

## Requisitos del bridge

- Proceso Node.js **persistente** (no serverless).
- Almacenamiento para sesión WA (`.wwebjs_auth/`).
- Puerto público (3001) para recibir webhook de WA.
- Variables: URL de la app, webhook secret, credenciales del panel Supabase.

Si se vuelve a migrar (a otro VPS), solo hay que actualizar `WHATSAPP_BRIDGE_URL` en `.env` y en Vercel.
