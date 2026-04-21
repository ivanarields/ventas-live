# Pruebas del Workflow n8n

Usa estos payloads en el **"Test Webhook"** de n8n para simular mensajes sin necesidad del bridge real de WhatsApp.

---

## PRUEBA 1: Mensaje de Texto Simple (SIN media)

Simula un cliente boliviano enviando "Hola, quiero un pedido".

```json
{
  "id": "AAAAABBBBBCCCCC001",
  "from": "59178456789@c.us",
  "to": "59171111111@c.us",
  "author": "59178456789@c.us",
  "body": "Hola, quiero hacer un pedido",
  "hasMedia": false,
  "isForwarded": false,
  "timestamp": 1745200000
}
```

**Resultado esperado:**
- `panel_clientes`: Se crea o actualiza el registro con `phone = "59178456789"`
- `panel_mensajes`: Se inserta mensaje con `direction = "in"`, `has_media = false`, `media_url = null`
- `panel_raw_webhooks`: Se guarda el payload crudo con `status = "processed"`

---

## PRUEBA 2: Mensaje con Imagen (CON media)

Simula un cliente enviando una foto de un pedido o comprobante de pago.

```json
{
  "id": "AAAAABBBBBCCCCC002",
  "from": "59178456789@c.us",
  "to": "59171111111@c.us",
  "author": "59178456789@c.us",
  "body": "Acá te mando el comprobante",
  "hasMedia": true,
  "isForwarded": false,
  "timestamp": 1745200100,
  "media": {
    "mimetype": "image/jpeg",
    "data": "/9j/4AAQSkZJRgABAQEASABIAAD/4Q...",
    "filename": "comprobante.jpg"
  }
}
```

**Resultado esperado:**
- Supabase Storage: Archivo guardado en `/whatsapp-media/59178456789/1745200100.jpg`
- `panel_mensajes`: Se inserta con `has_media = true` y `media_url = "https://...supabase.co/storage/v1/object/public/whatsapp-media/59178456789/1745200100.jpg"`

---

## PRUEBA 3: Número sin código de país Bolivia

Verifica que la normalización del teléfono funcione correctamente para números de 8 dígitos.

```json
{
  "id": "AAAAABBBBBCCCCC003",
  "from": "78456789@c.us",
  "to": "71111111@c.us",
  "body": "Número sin prefijo Bolivia",
  "hasMedia": false,
  "timestamp": 1745200200
}
```

**Resultado esperado:**
- `clientPhone` debe ser `"59178456789"` (el prefijo 591 fue añadido automáticamente)
- No debe crearse un cliente duplicado si el `59178456789` ya existía de la Prueba 1

---

## Cómo ejecutar estas pruebas en n8n

1. Abre tu instancia de n8n en el navegador.
2. Importa el archivo `fase4-n8n-workflow.json` desde el menú **Workflows → Import from File**.
3. Abre el workflow y activa el modo **"Test"** del nodo Webhook.
4. n8n te dará la URL de prueba: `https://[tu-n8n]/webhook-test/whatsapp`.
5. Usa Postman, Insomnia o el comando curl de abajo para enviar el payload:

```bash
curl -X POST https://[TU-N8N-URL]/webhook-test/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"id":"test001","from":"59178456789@c.us","to":"59171111111@c.us","body":"Hola world","hasMedia":false,"timestamp":1745200000}'
```

6. Verifica en Supabase que las tablas `panel_clientes` y `panel_mensajes` tienen los datos.
