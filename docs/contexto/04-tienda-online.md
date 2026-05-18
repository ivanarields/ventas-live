# 04 — Tienda Online

Actualizado: 2026-05-17 (Buffer integration documentada)

---

## Qué es

La tienda online es la PWA pública donde las clientas ven productos, reservan prendas y pagan por QR. Es independiente de la app principal de Leidy (sistema Live).

URL producción: `https://leidydiaz.live/tienda`
URL local: `http://localhost:3004/tienda`

---

## Bases de datos

Hay tres bases de datos en el sistema. La tienda usa principalmente la primera:

| Base | ID Supabase | Qué guarda |
|---|---|---|
| TiendaOnline | `thgbfurscfjcmgokyyif` | productos, pedidos web, perfiles de clientas, configuración, pagos de tienda |
| PanelPedido | `vwaocoaeenavxkcshyuf` | chats WhatsApp, fotos reales, bucket `whatsapp-media` |
| ChehiAppAbril | `vhczofpmxzbqzboysoca` | sistema principal: pagos Live, pedidos, clientes, etiquetas |

En el servidor hay tres clientes Supabase:
- `supabaseStore` → TiendaOnline
- `supabasePanel` → PanelPedido
- `supabaseServer` → ChehiAppAbril

---

## Variables de entorno

```
VITE_STORE_SUPABASE_URL         URL pública de TiendaOnline
VITE_STORE_SUPABASE_ANON_KEY    Clave anon de TiendaOnline
STORE_SUPABASE_SERVICE_ROLE_KEY Service role de TiendaOnline
STORE_URL                       URL pública de la tienda (ej: https://leidydiaz.live)
STORE_PUBLIC_URL                Misma URL pública (usada para links en mensajes WA)
STORE_OWNER_USER_ID             ID del usuario operador (para encolar mensajes WA)
VITE_STORE_WA_NUMBER            Número WA del operador (default: 59160003230)

# Buffer — publicación automática en redes sociales al crear producto
BUFFER_API_KEY                  Personal access token de Buffer
BUFFER_CHANNEL_ID_FACEBOOK      ID del canal Facebook en Buffer
BUFFER_CHANNEL_ID_INSTAGRAM     ID del canal Instagram en Buffer
BUFFER_CHANNEL_ID_TIKTOK        ID del canal TikTok en Buffer
```

---

## Tablas de TiendaOnline

### `products`

Catálogo público de productos.

```
id               UUID
name / title     nombre del producto
description      descripción
price            precio en Bolivianos
category         categoría (string)
brand            marca
images           array de URLs de fotos
sizes            array de tallas (ej: ["S","M","L","XL"])
stock            número entero; 0 = vendido
available        boolean; false = oculto y no se puede comprar
featured         boolean; producto destacado
condition        condición
color            color
material         material
views            contador de vistas
created_at, updated_at
```

Reglas:
- `stock = 0` → aparece badge rojo "Vendido" encima de la foto, click deshabilitado
- `available = false` → se oculta del catálogo y no se puede agregar al carrito
- Cuando se confirma un pedido, el backend hace `stock=0, available=false` para todos los productos del pedido

### `store_customers`

Perfil de cada clienta en la tienda.

```
id               UUID
whatsapp         número limpio (sin +591, sin guiones)
display_name     nombre real (actualizado desde banco o WhatsApp)
pin_hash         hash del PIN de 4 dígitos (bcrypt via Supabase Auth)
total_orders     contador
total_spent      total gastado
created_at, updated_at
```

El sistema de auth usa Supabase Auth con email ficticio:
```
email = {whatsapp}@tiendaleydi.com
```

Cada cliente tiene un PIN de 4 dígitos que funciona como contraseña. Si la clienta se registra por primera vez, ese PIN queda guardado para siempre. Si intenta registrarse con el mismo número y otro PIN, recibe error 409 "PIN incorrecto".

### `store_orders`

Cada pedido creado desde la tienda.

```
id                       entero autoincremental
customer_id              UUID (FK a store_customers)
customer_name            nombre del cliente (texto libre, se actualiza desde banco)
customer_wa              número WhatsApp sin código de país (ej: "76543210")
items                    JSON array: [{productId, productName, price, size, quantity}]
total                    monto total en Bs
status                   ver tabla de estados abajo
payment_method           método de pago (siempre "qr" por ahora)
payment_ref              string que describe el origen del pago (ej: "bank:abc123:alta")
payment_verified_at      timestamp cuando se verificó el pago
wa_proof_received        boolean; true si llegó comprobante por WhatsApp
wa_message_id            ID del mensaje WA del comprobante
expires_at               timestamp de vencimiento de la reserva
delivery_type            "retiro" o "delivery"
delivery_date            fecha elegida
delivery_slot            franja horaria elegida
delivery_address         dirección (solo si es delivery)
delivery_notes           notas adicionales
delivery_status          "pending" al crear
customer_note            nota de la clienta
admin_note               nota del operador
customer_selection       JSON: {confirmed, confirmed_at, confirmed_by}
partial_payment_amount   monto que realmente pagó si fue menor al total
payment_shortfall        cuánto falta para completar el pago
reminder_sent_at         cuándo se mandó el recordatorio de comprobante (evita repetir)
created_at, updated_at
```

Estados de `status`:

| Estado | Significado |
|---|---|
| `pending` | Reserva activa, esperando pago o expiración |
| `paid` | Pago verificado (automático o manual) |
| `ready` | Listo para entrega/retiro (no usado aún) |
| `delivered` | Entregado (no usado aún) |
| `cancelled` | Cancelado o expirado |

Filtros especiales de `payment_ref`:
- Empieza con `bank-detected:` → banco detectado pero sin comprobante WA todavía
- Empieza con `rejected-manual` → rechazado manualmente por el operador; desaparece de la UI

### `pagos_tienda`

Registro contable de cada pago completado de tienda. Vive en TiendaOnline, no en ChehiAppAbril.

```
id
store_order_id       FK a store_orders
store_customer_id    FK a store_customers
customer_name        nombre
customer_wa          número
amount               monto
method               "Tienda Online"
status               "completed"
payment_date         timestamp
owner_user_id        ID del operador
bank_sender_name     nombre del remitente bancario (si vino del banco)
```

### `store_settings`

Tabla key-value. Columnas: `setting_key` (único) y `setting_value` (texto).

Claves activas:

```
store_name             nombre de la tienda
official_wa_number     número WA oficial del operador
reservation_minutes    minutos de reserva (actualmente 2)
delivery_enabled       boolean
pickup_enabled         boolean
delivery_note          texto informativo
address                dirección física
store_chips            JSON serializado: categorías del catálogo
payment_qr_url         URL del QR de pago (se muestra en checkout)
pickup_dates           JSON serializado: fechas disponibles de retiro
```

Nota: `next_live_date`, `next_live_time` y `store_phone` fueron eliminados de la UI. El número oficial se configura en Configuraciones de la app principal.

### `store_delivery_slots`

Horarios de entrega/retiro disponibles.

Seed actual:
```
Manana  08:00-12:00
Tarde   12:00-17:00
Noche   17:00-21:00
```

### `store_customer_media`

Historial visual de cada clienta. Guarda links a fotos, no archivos físicos.

```
id
customer_id, customer_wa, customer_name
media_url              link a la foto real (en PanelPedido o store_images)
media_type
panel_mensaje_id       ID del mensaje en PanelPedido si vino por WhatsApp
source_type            whatsapp_panel, selection_request, external_purchase, etc.
source_id, order_id, purchase_id
tipo                   prenda, comprobante, referencia
status                 candidata, seleccionada, comprada, descartada
description
message_created_at
metadata
created_at, updated_at
```

### `store_selection_requests`

Casos donde la clienta tiene que confirmar qué prendas son suyas.

```
id
customer_id, customer_wa, customer_name
suggested_items        JSON
candidate_photos       JSON
confidence_score
status                 pending_customer / opened / confirmed / rejected / expired / cancelled
token                  token único para el link de confirmación
expires_at
selected_items
notes
source_type, source_id
created_at, updated_at
```

### `store_message_log`

Historial de mensajes WA generados.

```
id
order_id, selection_request_id
customer_wa
template_key
message_body
status
created_at
```

### `store_favorites`

Favoritos por clienta.

```
id
customer_wa
product_id
created_at
```

### `wa_messages`

Mensajes WA recibidos de la tienda. Usados para cruzar con pedidos pendientes.

```
id
from_wa
summary            texto completo + metadata del mensaje
has_proof          boolean
order_ref          código de pedido extraído del texto
matched_order_id   FK a store_orders si se cruzó
received_at
```

### `payment_events` (en TiendaOnline)

Eventos de pago recibidos en la tienda (banco o MacroDroid directo). Usados para obtener nombre del remitente.

```
id
amount, sender_name, sender_phone
hash                   hash SHA256 del evento (idempotencia)
matched_order_id
processed
```

---

## Diseño visual — Colores exactos (verificados en código)

### Color principal (brand)
```
#ff2d78  — rosa fuerte. Usado en botones, precios, badges, bordes activos, timer.
```

### Pantalla de bienvenida (WelcomeScreen)
```
Fondo: radial-gradient(circle at 50% 18%,
  #ffd4e4 0%, #fff0f5 34%, #fff8fb 62%, #ffffff 100%)
Título "Leidy": color gray-800
Título "American": color #ff2d78
Subtítulo: text-gray-400
Botón "Ver catálogo": background #ff2d78, texto blanco
Banner PWA: borde #ff2d78/10, ícono bg-[#ff2d78]
```

### Catálogo (ProductGallery)
```
Fondo: from-[#fff0f5] via-white to-white
Header sticky: bg-white/82, backdrop-blur-md, border-[#ff2d78]/8
Título "Catalogo": text-gray-800
Subtítulo "Leidy Shop": color #ff2d78
Chip de categoría activo: color #ff2d78, underline #ff2d78
Chip de categoría inactivo: color #8a8f98 (modo claro) / #bdaeb8 (modo oscuro)
Precio del producto: color #ff2d78 (fuente muy gruesa, "font-black")
Corazón de favorito: stroke/fill #ff2d78 siempre
Badge "Vendido": bg-red-600, texto blanco, rotado -12 grados
Badge "Reservado": bg-amber-500, texto blanco
Barra de navegación inferior: bg-white, border-gray-100, sombra negra/10
```

### Checkout — pantalla de identificación
```
Fondo: from-[#ffe6ef] via-[#fffbfd] to-white
Bloque resumen: bg-white/80, rounded-3xl
Total: color #ff2d78 (font-black)
Campo WhatsApp: border-gray-200, foco border-pink-400
Campo PIN: border-gray-200, foco border-pink-400, texto centrado tracking-[0.6em]
Error: bg-red-50, texto text-red-600
Botón "Pagar": bg: #ff2d78, texto blanco
```

### Checkout — pantalla de pago QR
```
Fondo: from-[#ffe6ef] via-[#fffbfd] to-white
Timer cuando queda >60s: color #ff2d78
Timer cuando quedan 30–60s: color #f59e0b (amber)
Timer cuando quedan <30s: color #ef4444 (rojo)
Timer expirado: bg-red-50, texto text-red-500
QR: sombra [0_15px_40px_rgb(255,45,120,0.15)], border-4 border-white
Nombre beneficiario: "Leidy Candy Diaz Sanchez"
Badge "Pago detectado" (banco vio el pago pero no confirmado): bg-amber-50, border-amber-100, texto amber-700
Botón "Descargar QR": background #ff2d78, texto blanco
Botón "Ya pagué": bg-white, border border-gray-100, texto gray-700
```

### Pantalla de pago verificado
```
Círculo de check: bg: #d1fae5 (verde claro), ícono stroke: #10b981 (verde)
Título: text-gray-800
Botón "Ver mis pedidos": background #ff2d78
```

### Perfil de clienta (StoreProfile)
```
Fondo no logueada: from-[#ffe6ef] via-[#fffbfd] to-white
Fondo logueada: bg-[#fdf5f7]
Avatar: gradient linear 135deg #ff2d78 → #ff6fa3, letras "LA"
Stats: bg-gray-50, valor en #ff2d78, etiqueta en gray-400
Tabs activo: color #ff2d78, underline #ff2d78
Tabs inactivo: color #9ca3af
Estado "Esperando pago": text
Estado "Pago verificado": text
Estado "Listo": text
Estado "Entregado": text
Estado "Cancelado": text
Badge de estado en tarjeta: bg-[#fff0f5], texto #ff2d78
Botón "Comprar" en favoritos: bg-[#ff2d78], texto blanco
Botón confirmar prendas: gradient 135deg #ff2d78 → #ff6fa3
Fecha elegida seleccionada: border #ff2d78, bg-[#fff0f5]
Botón "Avisarle a Leidy Shop": bg: #25D366 (verde WhatsApp)
Botón "Confirmar fecha de retiro": gradient #ff2d78 → #ff6fa3
```

### Panel admin — Pagos Web (en la app principal)

Este panel está en la pestaña de Pagos de la app principal, sub-canal "web".

```
Tarjeta con pedido VERIFICADO (status=paid):
  Header: bg-emerald-50/40, border-emerald-100
  Badge "WEB": bg-emerald-100, texto text-emerald-600
  Row del pedido: bg-white, border-gray-100
  Texto de estado: "Verificado", color text-emerald-600

Tarjeta con pedido en REVISIÓN MANUAL (wa_proof_received=true, status≠paid):
  Header: bg-violet-50, border-violet-100
  Badge "WEB": bg-violet-100, texto text-violet-600
  Row del pedido: bg-violet-50/50, border-violet-100
  Texto de estado: "Revisión manual", color text-violet-600

Página de detalles (modal a pantalla completa):
  Header revisión manual: bg-violet-50, border-violet-100
  Header verificado: bg-emerald-50, border-emerald-100
  Total del pedido: color text-brand (#ff2d78)
  Botón Rechazar: border-red-200, texto text-red-600
  Botón Confirmar: bg-emerald-600, texto blanco, sombra emerald-200
```

---

## Rutas de la tienda (navegación por hash)

```
/tienda                      pantalla de bienvenida
/tienda#gallery              catálogo de productos
/tienda#cart                 carrito
/tienda#checkout             checkout y pago
/tienda#profile              perfil (tab inicial: Pedidos)
/tienda#profile/orders       perfil → tab Pedidos
/tienda#profile/saved        perfil → tab Favoritos
/tienda#profile/confirmar    perfil → tab Confirmar prendas
/tienda#profile/entrega      perfil → tab Elegir fecha de retiro
/tienda#profile/settings     perfil → tab Ajustes
/tienda#customer-center      centro de clientas
/tienda#live-confirmation    confirmación de prendas de live
/tienda#producto/{id}        detalle de un producto
/tienda/selection?token=...  confirmación de prendas por link especial
```

---

## Flujo completo de compra — Paso a paso

### 1. Bienvenida

La clienta entra a `/tienda`. Ve la pantalla de bienvenida con fondo degradado rosado, logo, título "Leidy American" y un botón "Ver catálogo". Si el browser soporta PWA install, aparece un banner en la parte superior para instalar la app.

### 2. Catálogo

Al tocar "Ver catálogo" entra al catálogo. Los productos se cargan de a 8 por página (paginación infinita). Puede filtrar por categoría con los chips arriba, o buscar por nombre. Hay un menú flotante abajo con: Inicio, Buscar, Favoritos y Perfil.

Cada producto muestra:
- Foto en relación 3:4
- Precio en rosa
- Corazón para agregar a favoritos

Si un producto está reservado por otra persona, aparece overlay ámbar "Reservado" y no se puede tocar.
Si está vendido, aparece overlay negro con badge rojo "Vendido" rotado -12 grados.

El estado de reservas se actualiza cada 15 segundos (polling silencioso).

### 3. Detalle del producto

Al tocar un producto, va a `/tienda#producto/{id}`. Muestra fotos, descripción, tallas disponibles. Tiene botón "Comprar" para ir directo al checkout con ese producto.

### 4. Carrito

Puede agregar desde galería o detalle. Si ya existe el mismo producto+talla, no duplica. Puede incrementar cantidad desde el carrito. Hay un badge con el contador de items en el botón del carrito.

### 5. Checkout — Identificación

Al ir a checkout, el sistema verifica si hay sesión activa:
- **Si tiene sesión** → salta esta pantalla y crea el pedido directo
- **Si no tiene sesión** → muestra formulario

Formulario de identificación:
- Campo WhatsApp: prefijo "+591" fijo, input de 8 dígitos, solo números
- Campo PIN: 4 dígitos, tipo password, letras centradas con tracking grande

Flujo de auth en el backend:
1. Intenta login con `phone + pin`
2. Si login falla (no tiene cuenta) → registra con ese PIN
3. Si registrar devuelve 409 → el número ya existe con otro PIN → error "PIN incorrecto"
4. Si registro OK → auto-login
5. El email Supabase es `{phone}@tiendaleydi.com`

**Nota importante:** la clienta puede entrar desde un link de WhatsApp que tenga `?phone=76543210`. En ese caso el campo de WhatsApp se pre-llena automáticamente.

### 6. Creación del pedido y reserva

Al confirmar el formulario de auth, el backend crea el pedido:

```
POST /api/store-orders
```

El pedido se crea con:
```
status = "pending"
expires_at = ahora + 2 minutos
```

**Tiempo de reserva: exactamente 2 minutos (120 segundos).**

Si ya hay un pedido pendiente del mismo número, el backend devuelve 409 con `existingOrderId`. El frontend entonces retoma ese pedido en vez de crear uno nuevo.

El pedido creado se guarda en localStorage como `tienda.pendingOrder`:
```json
{ "orderId": 42, "expiresAt": "2026-05-17T...", "total": 150, "phone": "76543210" }
```

Esto sirve para que si la clienta cierra la página y vuelve, el sistema retoma el pedido automáticamente si todavía no expiró.

### 7. Pantalla de pago QR

Muestra:
- Timer con cuenta regresiva (MM:SS)
  - Color rosa `#ff2d78` cuando queda más de 60 segundos
  - Color ámbar `#f59e0b` cuando quedan 30–60 segundos
  - Color rojo `#ef4444` cuando quedan menos de 30 segundos
  - Badge "Expirado" rojo cuando llega a 0
- Monto total en grande
- Resumen del pedido (foto + nombre de la prenda)
- QR de pago (se descarga desde `store_settings.payment_qr_url`)
- Nombre del beneficiario: "Leidy Candy Diaz Sanchez"
- Botón "Descargar QR" (rosa)
- Botón "Ya pagué" (blanco con borde gris) → abre WhatsApp con mensaje pre-armado

El botón "← Atrás" lleva al catálogo (no al formulario de auth). Esto permite escapar del pago sin perder la sesión.

**Después de 60 segundos** sin verificación, aparece un empuje sutil para que la clienta mande el comprobante por WhatsApp.

El frontend hace polling a `/api/store-orders/{id}/status` cada 3 segundos para detectar cuando se verifica el pago.

### 8. Mensaje que la clienta manda cuando toca "Ya pagué"

El botón "Ya pagué" abre WhatsApp con este mensaje pre-armado:

```
Hola! Ya pague mi pedido de tienda #{orderId} por {total} Bs. Mi numero es {phone}. Adjunto comprobante.
```

El número de destino es `official_wa_number` de `store_settings` (default: `59160003230`).

### 9. Pantalla de pago verificado

Cuando el polling detecta `status = 'paid'`, muestra pantalla verde con:
- Círculo verde con check animado (bounce)
- "¡Pago Verificado!"
- "Pedido #{id} confirmado."
- "Tus prendas están apartadas. ✨"
- Botón "Ver mis pedidos" → lleva al perfil

---

## Flujo de pago bancario — Qué pasa detrás de escena

Este es el flujo más importante y el más complejo. Aquí está todo lo que pasa cuando la clienta paga por QR.

### Paso 1: MacroDroid detecta el pago en el banco

MacroDroid corre en el celular del operador y lee las notificaciones de la app del banco. Cuando detecta un pago, hace dos cosas en paralelo:

**Ruta A (Live/principal):** Llama a `/api/ingest-notification` con el payload completo. Este endpoint tiene un "portero Live": si el Live está activo, procesa el pago como compra de Live. También intenta cruzar con pedidos de tienda pendientes usando `captureStoreBankInbox`.

**Ruta B (Tienda directa):** Llama a `/api/store/ingest-bank` con el monto, nombre del remitente y hash.

En la práctica, ambas rutas pueden activarse. El sistema usa el `hash` SHA256 para idempotencia: si el mismo evento llega dos veces, la segunda vez se devuelve `{ duplicate: true }` sin hacer nada.

### Paso 2: ingest-bank busca el pedido

```
POST /api/store/ingest-bank
Body: { amount, senderName, senderPhone, rawText, hash }
```

El backend:
1. Verifica idempotencia: busca el hash en `payment_events` de ChehiAppAbril. Si ya existe, responde OK + duplicate.
2. Llama a `tryMatchOrder({ amount, senderPhone, windowMinutes: 2 })` — busca un `store_order` con status `pending`, mismo monto exacto, creado en los últimos 2 minutos.
3. Si no matchea por monto exacto y hay `senderPhone` → busca pedido pending del mismo teléfono en los últimos 5 minutos:
   - Si `amount >= total` → excedente → confirma igual
   - Si `amount < total` → pago parcial → guarda `partial_payment_amount` y `payment_shortfall`, encola WhatsApp recordatorio
4. Si matchea con `confidence = 'alta'` y el cliente ya tiene historial verificado → llama a `confirmStoreOrder`
5. Si matchea con `confidence = 'baja'` → llama a `markStoreOrderBankDetected` → el frontend del cliente ve badge ámbar "Pago detectado"

### Paso 3: confirmStoreOrder — función central

Esta función hace TODO lo que se necesita cuando se confirma un pago:

```
1. Actualiza store_orders:
   status = 'paid'
   payment_verified_at = ahora
   payment_method = 'qr'
   payment_ref = {source string}
   (permite rescatar pedido si expiró justo antes del webhook, por eso acepta status 'cancelled')

2. Oculta los productos del pedido:
   products.stock = 0
   products.available = false

3. Determina el nombre real del pagador en este orden de prioridad:
   a) linkedPago.nombre (nombre que vino directo del banco en el evento vinculado)
   b) payment_events de ChehiAppAbril (si source contiene 'bank' o 'macrodroid')
   c) payment_events de TiendaOnline
   d) store_orders.customer_name (último recurso)

4. Si hay nombre + número WA:
   - Actualiza store_customers.display_name
   - Si no existe el store_customer: lo crea con pin_hash='auto'
   - Actualiza store_orders.customer_name

5. Registra el pago en TiendaOnline.pagos_tienda:
   { store_order_id, customer_name, customer_wa, amount, method='Tienda Online', status='completed' }
   Solo crea si no existe ya para ese store_order_id.

6. Si el pago venía de ChehiAppAbril.pagos (tiene linkedPago.id):
   BORRA ese pago de ChehiAppAbril.pagos.
   (Este es el único momento en que la tienda escribe/borra en ChehiAppAbril)

7. Encola mensaje WhatsApp de confirmación a la clienta.
```

### Paso 4: Mensaje de confirmación de pago

El mensaje que recibe la clienta por WhatsApp:

```
¡Hola {firstName}! 🎉
Leidy Shop confirmó tu pago. Tu pedido #{orderId} está listo. ¡Muchas gracias por tu compra!

Mirá los detalles en tu perfil:
{STORE_PUBLIC_URL}/tienda#profile/orders
```

- Si no hay nombre → el saludo es solo "¡Hola! 🎉"
- El nombre viene del banco (el más confiable), no lo inventa el sistema
- El link lleva directo al historial de pedidos de la clienta

---

## Flujo de comprobante por WhatsApp

Cuando la clienta manda el comprobante como foto por WhatsApp al número de la tienda:

```
POST /api/store/ingest-wa
Body: { fromWa, messageText, hasProof, mediaUrl, mediaType, panelMessageId, messageCreatedAt }
```

El backend:
1. Extrae el código de pedido del texto (busca `#1042` → "1042")
2. Si no hay código y hay foto: busca en `wa_messages` si hubo mensajes anteriores del mismo número en las últimas 6 horas que tengan `order_ref`
3. Analiza la imagen del comprobante con IA (Gemini vision) para extraer: `{cliente, monto, hora}`
4. Llama a `tryMatchOrder({ senderPhone, orderRef, windowMinutes: 10 })`
5. Si matchea:
   - Marca `wa_proof_received = true` en el pedido
   - Verifica si ya llegó el banco:
     - Si banco + WA → **Flujo máxima seguridad** → `confirmStoreOrder`
     - Si solo WA, sin banco → el pedido queda en revisión manual (tarjeta morada)

---

## Crons automáticos (procesos en background)

### Expiración de reservas (cada 30 segundos)

```
Busca store_orders con:
  status = 'pending'
  wa_proof_received = false
  expires_at < ahora
→ Cancela: status = 'cancelled'
```

**Excepción crítica:** si `wa_proof_received = true`, el pedido NO se cancela aunque haya expirado. La clienta que ya mandó el comprobante no pierde su reserva.

### Recordatorio y auto-confirmación (cada 60 segundos)

Busca pedidos donde el banco detectó el pago (`payment_ref LIKE 'bank-detected:%'`) pero todavía no llegó el comprobante por WhatsApp (`wa_proof_received = false`):

**A los 5 minutos:** envía recordatorio por WhatsApp:
```
Hola! Vimos tu pago de Bs {total}. Falta tu comprobante para confirmar el pedido #{orderId}. Envíalo aquí por WhatsApp, por favor.
```
Solo lo manda una vez (usa `reminder_sent_at` para evitar repetir).

**A los 15 minutos:** confirma automáticamente el pedido aunque no haya comprobante. El banco basta como prueba. Llama a `confirmStoreOrder`.

### Cola de mensajes WhatsApp (cada 60 segundos)

El proceso `startWhatsappQueueProcessor()` procesa mensajes en `whatsapp_message_queue` de a uno por vez.

---

## Revisión manual — Panel de Pagos Web

Cuando llega un comprobante por WhatsApp pero el banco no confirmó, el pedido queda en estado "revisión manual". Aparece en la app principal en la pestaña Pagos, sub-canal "web", con tarjeta morada.

El operador puede:
1. Tocar la tarjeta → abre página de detalles a pantalla completa
2. Ver todas las prendas del pedido
3. Elegir:
   - **Confirmar** (botón verde `bg-emerald-600`) → llama a `POST /api/store/verify-manual/{id}` → `confirmStoreOrder`
   - **Rechazar** (botón rojo con borde `border-red-200`) → llama a `POST /api/store/reject-manual/{id}` → marca `payment_ref = 'rejected-manual'` y libera el producto

Lógica de color de las tarjetas:
- Si algún pedido del perfil tiene `wa_proof_received = true` y `status ≠ 'paid'` → toda la tarjeta del perfil es morada
- Si todos los pedidos están pagados → la tarjeta del perfil es verde

Pedidos que se filtran de Pagos Web (no aparecen):
- `payment_ref` empieza con `rejected-manual`
- `status = 'cancelled'` sin `wa_proof_received`

---

## Flujo de verificación manual (cuándo se usa)

Hay dos botones en la app principal para verificar manualmente:

1. **`/api/store/verify-manual/{storeOrderId}`** → verificación directa del operador desde Pagos Web (tarjeta morada)
2. **`/api/live-sales/payments/{id}/verify-manual`** → verificación de un pago del sistema Live que se cruzó con la tienda

Ambos terminan llamando a `confirmStoreOrder`.

---

## Contacto de separación con el sistema principal

La tienda está casi completamente separada del sistema principal. Estos son los puntos de contacto que quedan:

### Punto 1: El banco pasa por el sistema Live primero cuando Live está encendido

Cuando MacroDroid detecta un pago, lo manda a `/api/ingest-notification`. Si Live está encendido, el Edge Function de Supabase procesa el pago como venta Live Y puede crear un pedido `source='macrodroid'` en ChehiAppAbril.pedidos sin etiqueta ni items (pedido fantasma).

**Corrección activa (2026-05-17):** `confirmStoreOrder` borra ese pedido fantasma automáticamente después de confirmar el pago de tienda. Borra únicamente pedidos que cumplen las 9 condiciones exactas (`source='macrodroid'`, mismo nombre cliente, mismo monto, `label=''`, `label_type=''`, `item_count=0`, `web_items_list=null`, `status='procesar'`, creado en los últimos 3 minutos). No toca pedidos Live reales.

### Punto 2: confirmStoreOrder lee de ChehiAppAbril.payment_events

Para obtener el nombre real del remitente bancario (cuando el source incluye 'bank' o 'macrodroid'). Solo lectura.

### Punto 3: ingest-wa consulta ChehiAppAbril.pagos

Cuando llega un comprobante por WhatsApp sin código de pedido, a veces cruza con pagos del sistema principal para identificar al cliente. Solo lectura.

### Punto 4: macrodroid-health lee ChehiAppAbril.payment_events

El endpoint de health check del operador lee los últimos eventos bancarios para medir cuánto tiempo pasó desde la última notificación. Solo lectura.

**Qué NO hace la tienda en el sistema principal:**
- No crea clientes en ChehiAppAbril.customers
- No crea pedidos WEB-xxx en ChehiAppAbril.pedidos
- No crea pagos permanentes en ChehiAppAbril.pagos
- No sube fotos a ChehiAppAbril ni a PanelPedido

---

## Flujo completo de registro de clienta

```
Clienta nueva entra a la tienda
→ Va a checkout con su carrito
→ Ingresa WhatsApp (8 dígitos) + PIN de 4 dígitos
→ POST /api/store-auth/login → falla (no existe)
→ POST /api/store-auth/register → crea usuario Supabase Auth con email {phone}@tiendaleydi.com
→ POST /api/store-auth/login → ok, devuelve access_token
→ Token guardado en localStorage (storeAuth.saveSession)
→ createOrder(phone) → POST /api/store-orders → status=pending, expires_at=+2min
→ Pantalla de pago QR
→ [pago bancario detectado]
→ confirmStoreOrder: crea/actualiza store_customers con display_name del banco
→ Mensaje WA de confirmación a la clienta
```

Para próximas compras:
```
Clienta vuelve a la tienda
→ Tiene sesión guardada en localStorage
→ Va directo a checkout sin formulario
→ Si la sesión expiró → pide WhatsApp + PIN de nuevo
```

---

## Mensajes automáticos de WhatsApp — Todos los casos

### 1. Confirmación de pago de tienda

Disparado por: `confirmStoreOrder`
Destinatario: la clienta
```
¡Hola {firstName}! 🎉
Leidy Shop confirmó tu pago. Tu pedido #{orderId} está listo. ¡Muchas gracias por tu compra!

Mirá los detalles en tu perfil:
{STORE_PUBLIC_URL}/tienda#profile/orders
```

### 2. Recordatorio de comprobante (banco detectado, sin foto)

Disparado por: cron cada 60s, a los 5 minutos de detección bancaria
Destinatario: la clienta
```
Hola! Vimos tu pago de Bs {total}. Falta tu comprobante para confirmar el pedido #{orderId}. Envíalo aquí por WhatsApp, por favor.
```

### 3. Mensaje del cliente al tocar "Ya pagué"

Generado en el frontend, lo manda la clienta manualmente desde su WhatsApp
```
Hola! Ya pague mi pedido de tienda #{orderId} por {total} Bs. Mi numero es {phone}. Adjunto comprobante.
```

### 4. Pedido listo — Live o manual (NO se usa para pedidos de tienda)

Disparado por: PATCH /api/pedidos/:id cuando status pasa a 'listo'
Solo para pedidos Live/manuales, no WEB
Destinatario: cliente del sistema principal
```
¡Hola {firstName}! 🎉
Tu pedido{#label} está listo. ¡Muchas gracias por tu compra!

Mirá los detalles en tu perfil:
{STORE_PUBLIC_URL}/tienda#profile/orders
```

### 5. Notificación de Live listo para confirmación de prendas

Disparado por: POST /api/store/notify-live-ready
Destinatario: clienta que participó en el Live
```
¡Hola! 👗 Ya tenemos tus prendas del Live listas para confirmación. Ingresa aquí para seleccionar las tuyas: {STORE_PUBLIC_URL}/tienda#profile/confirmar

(Necesitarás tu PIN de la tienda)
```

### 6. Clienta pide otro día de retiro (WhatsApp manual)

Generado en el frontend cuando elige "Quiero otro día" y confirma fecha/hora personalizada
Destinatario: operador (número de la tienda)
```
Hola! Soy clienta de la tienda y quiero retirar mi pedido #{orderId} el {fecha larga} a las {hora}. ¿Está disponible esa fecha?
```

---

## Endpoints del servidor — Lista completa

### Auth tienda

```
POST /api/store-auth/register     Registro con phone + pin
POST /api/store-auth/login        Login con phone + pin; devuelve session Supabase
GET  /api/store-auth/me           Perfil + pedidos + favoritos del cliente logueado
```

### Productos

```
GET    /api/products              Lista paginada; params: page, limit, category, search
POST   /api/products              Crear producto (admin)
PATCH  /api/products/:id          Editar producto (admin)
DELETE /api/products/:id          Eliminar producto (admin)
POST   /api/upload-image          Subir foto a TiendaOnline/store_images ÚNICAMENTE
```

### Pedidos de tienda

```
POST  /api/store-orders                       Crear pedido (requiere token)
GET   /api/store-orders/reserved-products     Mapa {productId: orderId} de reservas activas
GET   /api/store-orders/:id/status            Estado + bankDetected del pedido
POST  /api/store-orders/:id/set-delivery      Guardar fecha de retiro
POST  /api/store-orders/:id/customer-confirm  Clienta confirma que sus prendas son correctas
GET   /api/store-orders/me                    Pedidos del cliente logueado
GET   /api/store-orders/admin                 Todos los pedidos (admin)
GET   /api/store-orders                       Pedidos del cliente (por token)
PATCH /api/store-orders/:id                   Actualizar estado (admin)
```

### Pagos y verificación

```
POST /api/store/ingest-bank          MacroDroid notifica pago bancario
POST /api/store/ingest-wa            Panel WA notifica comprobante por foto
POST /api/store/match-payment        Cruce manual/automático
GET  /api/store/pending-manual       Pedidos con comprobante WA pendientes de revisión
POST /api/store/verify-manual/:id    Operador confirma manualmente (tarjeta morada)
POST /api/store/reject-manual/:id    Operador rechaza manualmente
GET  /api/store/download-qr          Descarga el QR oficial de pago
GET  /api/store/macrodroid-health    Salud del puente MacroDroid (segundos desde última notif)
```

### Configuración

```
GET   /api/store/settings            Lee store_settings (key-value)
PATCH /api/store/settings            Guarda configuración
GET   /api/store/delivery-slots      Horarios de entrega/retiro
GET   /api/store/pickup-dates        Fechas disponibles de retiro
```

### Perfil visual y medios

```
GET  /api/store/customer-media/:phone    Historial visual de la clienta
POST /api/store/customer-media           Agregar media al perfil
GET  /api/store/external-purchases/:phone
POST /api/store/external-purchases
GET  /api/store/whatsapp-photos
```

### Confirmación de prendas por token

```
POST /api/store/selection-request           Crear solicitud
GET  /api/store/selection/:token            Leer solicitud por token
POST /api/store/selection/:token/confirm    Clienta confirma prendas
POST /api/store/selection/:token/reject     Clienta rechaza
POST /api/store/selection/:id/send-link     Reenviar link
GET  /api/store/selection-requests          Lista de solicitudes (admin)
```

### Live integration

```
POST /api/store/notify-live-ready     Notifica a cliente que sus prendas Live están listas
```

### Admin

```
GET /api/admin/store-profiles    Perfiles + pedidos para panel Pagos Web (incluye wa_proof_received)
```

---

## Flujo de perfil de clienta

La tienda guarda un perfil de cada clienta:

```
Clienta compra por tienda online
→ store_customers (whatsapp, display_name, pin_hash)
→ store_orders (historial de pedidos)
→ store_favorites (productos guardados)

Clienta viene por WhatsApp (Live, consulta)
→ PanelPedido recibe los mensajes y fotos
→ Al confirmar pedido: store_customers se crea/actualiza con nombre real
→ store_customer_media guarda links a las fotos (no copia archivos)
```

El perfil tiene 5 pestañas:
1. **Pedidos** — historial de todos los pedidos (activos y cancelados se ven, cancelados sin comprobante igual se ven)
2. **Favoritos** — productos guardados con corazón; tiene botón "Comprar" directo
3. **Confirmar** — para confirmar que las prendas de la próxima entrega son correctas
4. **Entrega** — elegir fecha y horario de retiro
5. **Ajustes** — ver número de WhatsApp, cerrar sesión

---

## Flujo de confirmación de prendas (selection request)

Para casos donde el operador o la IA no está segura de qué prendas le corresponden a una clienta:

```
1. Operador/IA crea store_selection_requests con fotos candidatas y token único
2. Operador manda el link /tienda/selection?token=... por WhatsApp
3. Clienta abre el link, ve las opciones de prendas
4. Selecciona las correctas (o rechaza si ninguna es suya)
5. El sistema guarda selected_items
6. store_customer_media se actualiza con las fotos como 'seleccionada' o 'descartada'
```

---

## Reglas críticas para programadores

```
1. NUNCA subir fotos a ChehiAppAbril desde la tienda. Si falla store_images, debe fallar.
2. NUNCA crear clientes en ChehiAppAbril desde la tienda.
3. NUNCA crear pedidos en ChehiAppAbril desde la tienda.
4. SIEMPRE usar supabaseStore para operaciones de tienda.
5. Los pagos de tienda van SOLO a TiendaOnline.pagos_tienda.
6. El único momento en que la tienda toca ChehiAppAbril es en confirmStoreOrder
   cuando borra el pago bancario que pasó por ChehiAppAbril.pagos (limpieza necesaria).
7. El cron de expiración NUNCA cancela pedidos con wa_proof_received = true.
8. confirmStoreOrder permite rescatar pedidos en status 'cancelled' (expirados justo antes del webhook).
9. El hash SHA256 garantiza idempotencia en ingest-bank. No procesar dos veces el mismo evento.
10. Los pedidos WEB no disparan mensaje WhatsApp al pasar a "listo" en el sistema principal
    (ya recibieron su mensaje único al confirmar el pago en la tienda).
```

---

## Páginas legales (ocultas)

No aparecen en el menú de la tienda. Solo accesibles por link directo. Requeridas para TikTok Developer.

- `https://leidycandy.me/tienda/terminos` — Términos de Servicio
- `https://leidycandy.me/tienda/privacidad` — Política de Privacidad

Archivos: `public/terminos.html`, `public/privacidad.html`
Rutas en: `server.ts` (antes del catch-all de index.html)

---

## Rendimiento del servidor

### Caché en memoria (server-side)

Dos endpoints de solo lectura tienen caché en memoria con TTL de 5 minutos. Se invalidan automáticamente cuando el operador guarda cambios (PATCH).

| Endpoint | Archivo | TTL | Se invalida en |
|---|---|---|---|
| `GET /api/store/settings` | `src/routes/store-settings.ts` | 5 min | `PATCH /api/store/settings` |
| `GET /api/store/pickup-dates` | `server.ts` | 5 min | `PATCH /api/store/pickup-dates` |

El caché es por instancia del servidor. En Vercel serverless, instancias distintas no comparten caché, pero dentro de una instancia caliente el beneficio es real.

### Carga del perfil paralela

`StoreProfile.tsx` usa `Promise.all` para correr las 4 llamadas de `loadProfile` en paralelo en vez de secuencial:

```
Antes (secuencial):   getStoreSettings → syncLocal → /me → /pickup-dates = ~1.8s
Después (paralelo):   Promise.all([settings, syncLocal, /me, /pickup-dates]) = ~0.9s
```

Las 4 son independientes entre sí, por lo que el tiempo total es el de la más lenta, no la suma de todas.

---

## Estado actual (2026-05-18)

### Funcionando correctamente

- Catálogo público con paginación infinita
- Búsqueda y filtro por categoría (chips)
- Detalle de producto por link directo
- Carrito con múltiples items
- Auth por WhatsApp + PIN
- Checkout con QR de 2 minutos
- Expiración automática de reservas (cron 30s)
- Retoma de pedido pendiente al volver a la tienda (localStorage)
- Verificación automática por banco (confianza alta)
- Verificación manual desde panel Pagos Web (tarjetas moradas)
- Rechazo manual desde panel Pagos Web
- Mensaje WA de confirmación a la clienta
- Recordatorio WA a los 5 minutos (banco detectado sin comprobante)
- Auto-confirmación a los 15 minutos (banco detectado sin comprobante)
- Protección de pedidos con comprobante WA recibido (no se cancelan)
- Perfil de clienta con 5 pestañas
- Favoritos por clienta (sinc local + servidor)
- Fecha y horario de retiro en el perfil
- Confirmación de prendas por la clienta
- Modo oscuro en el catálogo
- Modo PWA (instalar como app)
- Categorías del catálogo sin parpadeo (espera store_chips antes de pintar chips)
- Pagos de tienda en su propia tabla pagos_tienda (separados del sistema principal)
- Clasificador de imágenes: solo registra fotos si IA extrajo nombre o monto

- Publicación automática en Buffer (Facebook, Instagram, TikTok) al crear un producto nuevo
  - `src/services/bufferService.ts` — lógica de publicación
  - Se llama desde `server.ts` después del INSERT de productos (fire-and-forget)
  - Modo: `SHARE_NOW` (instantáneo)
  - Post incluye: emoji por categoría, nombre, descripción, precio en Bs, link `https://leidycandy.me/tienda`, hashtags
  - Resultados guardados en `TiendaOnline.buffer_publications`
  - Si no hay `BUFFER_API_KEY`, la publicación se omite silenciosamente sin romper el flujo

### Pendiente / no implementado todavía

- Automatizar envío de fotos WhatsApp a store_customer_media (requiere criterio de selección)
- RLS en TiendaOnline (pendiente hasta que el flujo esté estable)
- Pantalla admin para ver store_customer_media por clienta
- Delivery real (por ahora solo retiro)
- Estados "ready" y "delivered" en el flujo de pedidos

---

## Regla de fotos

Las fotos reales de WhatsApp viven en:
```
PanelPedido / bucket whatsapp-media
```

La tienda guarda solo links en:
```
TiendaOnline / store_customer_media (columna media_url)
```

Las fotos propias de productos (subidas por el admin) van a:
```
TiendaOnline / bucket store_images
```

Nunca se duplican archivos entre bases. Si falla `store_images`, debe fallar. Nunca usar ChehiAppAbril como fallback.
