# Conector WhatsApp → Supabase

Microservicio que escucha mensajes de WhatsApp y los envía a la Edge Function `ingest-whatsapp` en Supabase.

## Cómo funciona

1. Se conecta a WhatsApp Web con un código QR
2. Cuando llega un mensaje, lo captura (texto, foto, audio, video, PDF)
3. Si tiene archivo, lo sube a Supabase Storage (bucket `whatsapp-media`)
4. Envía el payload completo a la Edge Function `ingest-whatsapp`
5. La Edge Function guarda el cliente y el mensaje en la base de datos

## Variables de entorno (`.env`)

```
WEBHOOK_URL="https://vwaocoaeenavxkcshyuf.supabase.co/functions/v1/ingest-whatsapp"
SUPABASE_URL="https://vwaocoaeenavxkcshyuf.supabase.co"
SUPABASE_SERVICE_KEY="tu-service-key"
```

## Correr en local

```bash
node index.js
```

El QR aparece en la terminal y también en la app (Configuración → Sistema).

## Despliegue en Railway

1. Subí esta carpeta a un repositorio de GitHub
2. Creá un proyecto en Railway apuntando a ese repo
3. Agregá las variables de entorno en el panel de Railway
4. El QR aparece en los Logs de Railway — lo escaneás y listo
