# Workflow n8n — Explicación Completa

## Arquitectura del Flujo: `whatsapp_ingesta_mvp`

```
[1] Webhook WA Entrada
        ↓
[2] Responder 200 OK  ← (Responde INMEDIATAMENTE al Bridge para liberarlo)
        ↓
[3] Normalizar Payload  ← (Limpia teléfonos, construye paths de storage)
        ↓
[4] IF: ¿Tiene Media?
      /          \
   SÍ            NO
    ↓              ↓
[5] Subir Media   [7] Sin Media (texto puro)
    ↓              
[6] Construir URL
      \          /
       [8] Merge Ramas  ← (Reunifica ambas ramas)
              ↓
       [9] Upsert Cliente  ← (Crea o actualiza registro en panel_clientes)
              ↓
       [10] Extraer cliente_id  ← (Toma el UUID del cliente recién registrado)
              ↓
       [11] Insert Mensaje ← (Guarda el mensaje con media_url si aplica)
              ↓
       [12] Log Raw Auditoría ← (Guarda el payload crudo para debugging)
```

---

## Nodo por Nodo (Desglose Técnico)

### NODO 1: Webhook WA Entrada
- **Tipo:** `n8n-nodes-base.webhook`
- **URL generada:** `https://[tu-n8n]/webhook/whatsapp`
- **Método aceptado:** POST
- **Función:** Punto de recepción de todo lo que llega desde el bridge Node.js de la Fase 3. El `responseMode: responseNode` le ordena a n8n que NO responda automáticamente hasta que el Nodo 2 lo decida.

### NODO 2: Responder 200 OK
- **Tipo:** `respondToWebhook`
- **Qué hace:** Envía un `{"status": "ok", "received": true}` de vuelta al Bridge de Node.js. Esto libera la memoria del bridge inmediatamente y **no lo deja esperando**. La lógica de los nodos 3-12 puede tardar lo que necesite sin afectar al bridge.

### NODO 3: Normalizar Payload (Código JS)
- **Responsabilidad Central:** Estandarización. Este nodo transforma el caos crudo en datos limpios.
- **Lógica de teléfono:**
  - Elimina el sufijo de WA (`@c.us`, `@g.us`)
  - Si el número tiene 8 dígitos y empieza en 6, 7 u 8 → agrega prefijo Bolivia `591`
  - Ejemplo: `59178456789@c.us` → `59178456789`
- **Detección de dirección:** `in` si el mensaje viene desde afuera, `out` si fue enviado por ti.
- **Construcción del `storagePath`:** Crea la ruta de guardado del archivo en formato  `{phone}/{timestamp}.{ext}` antes de saber si el archivo existe (para que el IF lo use).

### NODO 4: IF: ¿Tiene Media?
- **Condición:** `$json.hasMedia === true`
- **Rama TRUE (izquierda):** Mensajes con imagen, audio, video, PDF.
- **Rama FALSE (derecha):** Mensajes de texto puro sin adjunto.

### NODO 5: Subir Media a Storage
- **Tipo:** HTTP Request POST hacia la API de Supabase Storage
- **URL:** `https://vwaocoaeenavxkcshyuf.supabase.co/storage/v1/object/whatsapp-media/{storagePath}`
- **Header `x-upsert: true`:** Permite reescribir si el archivo ya existe (idempotente).
- **Body:** El binario o base64 del archivo descargado por el bridge.

### NODO 6: Construir URL de Media
- **Tipo:** Code JS
- **Lo que hace:** Calcula la URL pública definitiva del archivo recién guardado en Supabase Storage. Formato: `https://...supabase.co/storage/v1/object/public/whatsapp-media/{storagePath}`

### NODO 7: Sin Media (texto puro)
- **Tipo:** Code JS
- **Lo que hace:** Simplemente pasa el payload normalizado al Merge con `mediaUrl: null` para que el Insert sea uniforme en ambas ramas.

### NODO 8: Merge Ramas
- **Tipo:** `merge` en modo `combineAll`
- **Función:** Vuelve a unir el flujo en un único camino sin importar si el mensaje tenía archivo o no.

### NODO 9: Upsert Cliente
- **Endpoint:** `POST /rest/v1/panel_clientes`
- **Header `Prefer: resolution=merge-duplicates`:** Si el número ya existe en la tabla, **no lanza error** — simplemente actualiza `last_interaction`. Si no existe, lo crea.
- **Body enviado:** `{ phone: "591...", last_interaction: "ISO timestamp" }`

### NODO 10: Extraer cliente_id
- **Tipo:** Code JS
- **Problema que resuelve:** Supabase devuelve el registro como array. Este nodo extrae el `id` UUID del primer elemento de forma segura, lanzando un error descriptivo si no lo encuentra (para facilitar el debugging).

### NODO 11: Insert Mensaje
- **Endpoint:** `POST /rest/v1/panel_mensajes`
- **Campos insertados:**
  - `cliente_id` → UUID del cliente
  - `direction` → 'in' o 'out'
  - `content` → texto del mensaje
  - `has_media` → true/false
  - `media_url` → URL pública del Storage (null si no hay media)
  - `media_type` → MIME type (null si no hay media)

### NODO 12: Log Raw Auditoría
- **Endpoint:** `POST /rest/v1/panel_raw_webhooks`
- **Función:** Guarda el payload original sin procesar para poder hacer debugging, replay o reforzar lógica de parseo en el futuro sin perder información.

---

## Checklist de compatibilidad

- [x] Responde 200 al webhook antes de procesar → bridge liberado instantáneamente
- [x] Normalización de teléfono boliviano (8 dígitos → agrega 591)
- [x] Diferenciación mensajes `in` / `out`
- [x] Manejo de rama texto puro Y rama con multimedia
- [x] Upsert de cliente sin duplicados en Supabase
- [x] Inserción de mensaje con referencia al cliente
- [x] Guardado de payload crudo para auditoría
- [x] URL pública de media calculada y persistida
