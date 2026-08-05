# WhatsApp Bridge

Microservicio Node.js que conecta el WhatsApp del negocio con la aplicación.

## Alojamiento actual

- **Host:** DigitalOcean droplet
- **URL:** `http://134.122.123.253:3001`
- **Variable en app:** `WHATSAPP_BRIDGE_URL=http://134.122.123.253:3001`
- **Secret de webhook:** `WEBHOOK_SECRET=ventas-live-bridge-2026`

## Cómo funciona

1. Se conecta a WhatsApp Web (sesión persistente en `.wwebjs_auth/`)
2. Cuando llega un mensaje o foto, lo captura y lo reenvía a la app via webhook
3. La app guarda el cliente en `panel_clientes` y el mensaje en `panel_mensajes` (PanelPedido)
4. Si el mensaje tiene imagen, se sube al bucket `whatsapp-media` de Supabase

## Variables de entorno (`.env`)

```
WEBHOOK_URL=https://leidydiaz.live/api/whatsapp/webhook
SUPABASE_URL=https://vwaocoaeenavxkcshyuf.supabase.co
SUPABASE_SERVICE_KEY=tu-service-key
WEBHOOK_SECRET=ventas-live-bridge-2026
```

## Correr en local

```bash
node index.js
```

El QR aparece en la terminal. Escanearlo con el WhatsApp del negocio.

## Notas

- Requiere proceso persistente (no serverless) — la sesión de WhatsApp Web necesita estar activa.
- Si se migra a otro servidor: solo actualizar `WHATSAPP_BRIDGE_URL` en Vercel.
- No existen mensajes salientes: el bridge solo vincula la sesión, recibe mensajes/fotos y los guarda mediante el webhook.
