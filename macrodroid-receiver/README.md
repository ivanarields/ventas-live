# MacroDroid Receiver

Servicio independiente para recibir pagos de MacroDroid y responder rapido.

Flujo:

`MacroDroid -> receiver VPS -> responde 200 -> guarda cola -> reenvia a la app actual`

## Rutas

- `GET /api/health`: estado del servicio.
- `POST /api/macrodroid`: entrada para MacroDroid.
- `POST /api/ingest-notification`: entrada compatible con la app actual.
- `POST /api/retry-dead-letter`: vuelve a intentar pagos que agotaron reintentos. Requiere `x-admin-secret` o `x-receiver-secret`.

## Variables

- `FORWARD_URL`: URL actual de ingestion, por ejemplo `https://leidydiaz.live/api/ingest-notification`.
- `DEVICE_ID`: opcional. Si MacroDroid manda `x-device-id`, se reenvia ese valor.
- `DEVICE_SECRET`: opcional. Si MacroDroid manda `x-device-secret`, se reenvia ese valor.
- `RECEIVER_SECRET`: clave opcional para proteger este receiver.
- `ADMIN_SECRET`: clave para reintentar pagos fallidos manualmente.
- `DATA_DIR`: carpeta donde guarda la cola, recomendado `/data`.
- `MAX_ATTEMPTS`: reintentos antes de mandar a fallidos. Recomendado `720` con `RETRY_DELAY_MS=5000` para 1 hora.

## Antifallos

- El celular recibe `200` rapido cuando el receiver guarda el pago.
- Si la app o Supabase fallan, el pago queda en `queue.jsonl` y se reintenta.
- Si agota los reintentos, pasa a `dead-letter.jsonl` y no se pierde.
- Para recuperar fallidos:

```bash
curl -X POST http://134.122.123.253:3002/api/retry-dead-letter \
  -H "x-admin-secret: clave"
```

## Prueba local

```bash
npm start
curl -X POST http://localhost:3000/api/macrodroid \
  -H "Content-Type: application/json" \
  -H "x-receiver-secret: clave" \
  -d '{"source":"test","title":"IVAN ARIEL DIAZ SANCHEZ te ha enviado 1 Bs","text":"Motivo: Pagos"}'
```
