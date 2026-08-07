# WhatsApp Bridge

## Estado actual

El modo de producciÃ³n usa `WHATSAPP_LIVE_ONLY=true`: fuera de una sesiÃ³n Live
activa, el bridge ignora el mensaje antes de descargar la media.

El bridge conecta la sesión de WhatsApp por QR y funciona únicamente como receptor.
No encola, no envía, no reintenta y no ejecuta notificaciones automáticas.

## Captura robusta de mensajes y media

La recepcion escucha `message` y `message_create` con deduplicacion por ID.
Las imagenes se descargan hasta tres veces antes de enviarse al webhook.
Si la descarga falla, el payload marca `mediaDownloadFailed` para dejar el
incidente visible sin crear una evidencia falsa.

## Alojamiento

- Host: DigitalOcean droplet
- URL: `http://134.122.123.253:3001`
- Variable de la aplicación: `WHATSAPP_BRIDGE_URL`

## Flujo de recepción

```text
WhatsApp del negocio
    ↓ mensaje o foto entrante
Bridge persistente
    ↓ webhook
Supabase PanelPedido
    → panel_clientes
    → panel_mensajes
    → bucket whatsapp-media para imágenes
```

La aplicación conserva el estado de conexión, el QR, los mensajes recibidos,
las fotos y el análisis de comprobantes para pagos. La tabla histórica
`whatsapp_message_queue` no se borra, pero ya no se consulta para enviar.
