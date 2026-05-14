# Tienda Online - Estado Actual

Actualizado: 2026-05-11 (noche - IA robusta)

## Qué Es

La tienda online es la PWA pública donde las clientas ven productos, reservan prendas, confirman entrega/retiro y consultan su perfil.

La tienda tiene base de datos propia y no debe usar la base principal para guardar fotos, productos, perfiles de tienda ni historial visual.

Regla crítica:

```txt
App principal / ChehiAppAbril = pagos, pedidos, clientes principales, etiquetas.
Panel WhatsApp / PanelPedido = mensajes y fotos reales de WhatsApp.
TiendaOnline = productos, pedidos online, perfiles de tienda, historial y links a fotos.
```

## Bases De Datos

| Base | Proyecto Supabase | Uso |
|---|---|---|
| TiendaOnline | `thgbfurscfjcmgokyyif` | productos, pedidos online, perfiles de tienda, configuración, referencias a fotos |
| PanelPedido | `vwaocoaeenavxkcshyuf` | chats WhatsApp, fotos reales, bucket `whatsapp-media`, evidencias live |
| ChehiAppAbril | `vhczofpmxzbqzboysoca` | sistema principal: pagos, pedidos, clientes, etiquetas |

La tienda puede integrarse con el sistema principal cuando una venta confirmada necesita aparecer en preparación, pero **no usa la base principal para storage ni historial visual de tienda**.

## Regla De Fotos

Las fotos reales de WhatsApp viven en:

```txt
PanelPedido / whatsapp-media
```

La tienda guarda solamente links/referencias en:

```txt
TiendaOnline / store_customer_media
```

No se copian todas las fotos a TiendaOnline. No se duplican imágenes. No se suben fotos de WhatsApp a la base principal.

Flujo recomendado:

```txt
Cliente manda foto por WhatsApp
-> PanelPedido guarda foto real en whatsapp-media
-> TiendaOnline crea/actualiza perfil de clienta
-> TiendaOnline guarda media_url/panel_mensaje_id como referencia
-> Perfil de tienda muestra la foto leyendo el link
```

## Storage

TiendaOnline tiene bucket propio:

```txt
store_images
```

Uso previsto:

```txt
Fotos propias de productos creados desde admin de tienda.
```

Regla crítica:

```txt
Si falla subir a store_images en TiendaOnline, debe fallar.
Nunca usar ChehiAppAbril como fallback.
```

Esto ya fue corregido en `/api/upload-image`.

## Tablas Principales De TiendaOnline

### `products`

Catálogo público.

```txt
id, name, description, price, category, brand
images          array de URLs
sizes           array de tallas
stock           cantidad disponible
available       si se muestra en tienda
featured        destacado
condition, color, material
views
created_at, updated_at
```

Reglas:

```txt
stock = 0 muestra producto vendido.
available = false oculta el producto y bloquea clicks.
```

### `store_customers`

Perfil de clienta dentro de la tienda.

```txt
id
whatsapp
display_name
pin_hash
total_orders
total_spent
created_at, updated_at
```

La tienda usa experiencia sin email real:

```txt
email ficticio: {phone}@tiendaleydi.com
PIN de 4 dígitos
```

Si una clienta entra por WhatsApp pero todavía no tiene cuenta, la tienda puede crear un perfil `profile-only` para guardar historial/referencias.

### `store_orders`

Pedidos creados desde la tienda.

```txt
id
customer_id
customer_name
customer_wa
items
total
status
payment_method
payment_ref
payment_verified_at
wa_proof_received
wa_message_id
expires_at
delivery_type
delivery_date
delivery_slot
delivery_address
delivery_notes
delivery_status
customer_note
admin_note
customer_selection
created_at, updated_at
```

Estados usados:

| Estado | Significado |
|---|---|
| `pending` | Pedido reservado, esperando pago |
| `paid` | Pago verificado |
| `ready` | Listo para entrega/retiro |
| `delivered` | Entregado |
| `cancelled` | Cancelado/vencido |

Reserva actual:

```txt
90 segundos (1.5 minutos)
```

### `store_customer_media`

Historial visual de clientas. Guarda links, no archivos físicos.

```txt
id
customer_id
customer_wa
customer_name
media_url            link a foto real
media_type
panel_mensaje_id     ID del mensaje en PanelPedido si viene de WhatsApp
source_type          whatsapp_panel, selection_request, external_purchase, etc.
source_id
order_id
purchase_id
tipo                 prenda, comprobante, referencia
status               candidata, seleccionada, comprada, descartada
description
message_created_at
metadata
created_at, updated_at
```

Uso:

```txt
Perfil de tienda muestra prendas/fotos de la clienta por media_url.
```

### `store_selection_requests`

Casos donde la tienda necesita que la clienta confirme prendas.

```txt
id
customer_id
customer_wa
customer_name
suggested_items
candidate_photos
confidence_score
status
token
expires_at
selected_items
notes
source_type
source_id
created_at, updated_at
```

Estados:

```txt
pending_customer
opened
confirmed
rejected
expired
cancelled
```

### `store_settings`

Tabla key-value: columnas `setting_key` (único) y `setting_value` (texto).
Se lee con `GET /api/store/settings` y se guarda con `PATCH /api/store/settings`.

Claves activas:

```txt
store_name
official_wa_number   número oficial de WhatsApp (reemplaza store_phone)
reservation_minutes
delivery_enabled
pickup_enabled
delivery_note
address
store_chips          categorías del catálogo (JSON serializado)
payment_qr_url
pickup_dates         fechas de retiro disponibles (JSON serializado)
```

Nota: `next_live_date`, `next_live_time` y `store_phone` fueron eliminados de la UI.
El número oficial se configura en la página de Configuraciones de la app principal.

### `store_delivery_slots`

Horarios de entrega/retiro.

Seed actual:

```txt
Manana  08:00-12:00
Tarde   12:00-17:00
Noche   17:00-21:00
```

### `store_external_purchases`

Historial de compras que no nacen directamente del carrito online, por ejemplo ventas Live o registros manuales.

```txt
id
customer_id
source
source_id
customer_wa
customer_name
items
total
status
purchase_date
payload
created_at
```

### `store_message_log`

Historial de mensajes generados para WhatsApp.

```txt
id
order_id
selection_request_id
customer_wa
template_key
message_body
status
created_at
```

### `store_favorites`

Favoritos por clienta.

```txt
id
customer_wa
product_id
created_at
```

## Páginas Y Links

Producción:

```txt
https://ventas-live.vercel.app/tienda
```

Local:

```txt
http://localhost:3004/tienda
```

Rutas por hash:

```txt
/tienda                         portada
/tienda#gallery                 catálogo
/tienda#cart                    carrito
/tienda#checkout                checkout
/tienda#profile                 perfil de clienta (pestaña Favoritos)
/tienda#profile/confirmar       perfil → pestaña Confirmar prendas
/tienda#profile/entrega         perfil → pestaña Elegir fecha de retiro
/tienda#customer-center         centro de clientas
/tienda#live-confirmation       confirmación live
/tienda#producto/{id}           detalle de producto
```

Confirmación de prendas por token:

```txt
/tienda/selection?token={token}
```

Ejemplos de producto:

```txt
https://ventas-live.vercel.app/tienda#producto/7
https://ventas-live.vercel.app/tienda#producto/6
https://ventas-live.vercel.app/tienda#producto/5
```

## Flujo De Compra Online

```txt
1. Clienta entra a /tienda
2. Abre catálogo o producto
3. Agrega prendas al carrito
4. Va a checkout
5. Se identifica con WhatsApp + PIN
6. Elige entrega/retiro, fecha y horario
7. Se crea store_orders con reserva de 90 segundos
8. Paga y se verifica el pago
9. El pedido queda listo para preparación/seguimiento
```

## Flujo De Perfil De Clienta

Objetivo: todas las clientas tengan perfil en la tienda, aunque lleguen por WhatsApp o por tienda online.

```txt
Clienta por tienda
-> store_customers
-> store_orders
-> historial de pedidos y prendas

Clienta por WhatsApp
-> PanelPedido recibe mensajes/fotos
-> TiendaOnline crea/actualiza store_customers
-> TiendaOnline guarda links en store_customer_media
-> perfil muestra historial visual
```

## Flujo De Confirmación De Prendas

```txt
1. IA/operador detecta duda o varias fotos candidatas
2. Se crea store_selection_requests
3. Se genera link /tienda/selection?token=...
4. Operador manda link por WhatsApp
5. Clienta selecciona prendas correctas o rechaza
6. Tienda guarda selected_items
7. Tienda actualiza store_customer_media como seleccionada/comprada
```

## Endpoints De Tienda

### Frontend público

```txt
GET /tienda
GET /tienda#gallery
GET /tienda#producto/:id
GET /tienda/selection?token=...
```

### Auth tienda

```txt
POST /api/store-auth/register
POST /api/store-auth/login
GET  /api/store-auth/me
```

### Productos

```txt
GET    /api/products
POST   /api/products
PATCH  /api/products/:id
DELETE /api/products/:id
POST   /api/upload-image
```

`/api/upload-image` sube solamente a TiendaOnline bucket `store_images`.

### Pedidos

```txt
POST  /api/store-orders
GET   /api/store-orders/reserved-products
GET   /api/store-orders/:id/status
GET   /api/store-orders/me
GET   /api/store-orders/admin
GET   /api/store-orders
PATCH /api/store-orders/:id
```

### Pagos y WhatsApp tienda

```txt
POST /api/store/ingest-bank
POST /api/store/ingest-wa
POST /api/store/match-payment
GET  /api/store/whatsapp-photos
POST /api/store/notify-live-ready
```

Estos endpoints conectan la reserva de tienda con comprobantes, notificaciones bancarias, fotos de WhatsApp y preparación operativa. No deben mover fotos reales a ChehiAppAbril.

### Configuración y perfil visual

```txt
GET   /api/store/settings
PATCH /api/store/settings
GET   /api/store/delivery-slots
GET   /api/store/customer-media/:phone
POST  /api/store/customer-media
GET   /api/store/external-purchases/:phone
POST  /api/store/external-purchases
```

### Confirmación de prendas

```txt
POST /api/store/selection-request
GET  /api/store/selection/:token
POST /api/store/selection/:token/confirm
POST /api/store/selection/:token/reject
POST /api/store/selection/:id/send-link
GET  /api/store/selection-requests
```

## Migración Aplicada

La migración de tienda fue aplicada en:

```txt
TiendaOnline / thgbfurscfjcmgokyyif
```

Archivo:

```txt
docs/nuevo sistema de tienda/migracion-tienda-mayo.sql
```

Resultado esperado/verificado:

```txt
store_settings responde OK
store_delivery_slots responde OK
store_customer_media responde OK
store_selection_requests responde OK
store_external_purchases responde OK
bucket store_images creado
```

## Variables De Entorno

```txt
VITE_STORE_SUPABASE_URL
VITE_STORE_SUPABASE_ANON_KEY
STORE_SUPABASE_SERVICE_ROLE_KEY
STORE_URL
```

Estas variables apuntan a TiendaOnline. No deben apuntar a ChehiAppAbril.

## Integración Con Sistema Principal

La tienda no debe usar la base principal para almacenamiento de fotos ni perfiles de tienda.

La integración con la app principal debe limitarse a eventos operativos cuando una venta confirmada necesita entrar al flujo de preparación.

Integración actual al confirmar un pedido de tienda:

```txt
store_orders.status = paid
products.stock = 0, available = false para productos vendidos
customers en ChehiAppAbril se crea/actualiza por WhatsApp si corresponde
pedidos en ChehiAppAbril se crea con status procesar, label WEB y source WEB
pagos en ChehiAppAbril se crea con method Tienda Online
```

Regla operativa:

```txt
TiendaOnline confirma venta
-> crear/actualizar pedido operativo en ChehiAppAbril si corresponde
-> operador prepara en pantalla de conteo
```

Regla:

```txt
Fotos e historial visual no van a ChehiAppAbril.
Links de fotos viven en TiendaOnline.
Fotos reales viven en PanelPedido.
```

### Etiqueta WEB en Pagos

Los pagos originados desde la tienda online muestran una etiqueta `WEB` en el historial de pagos de la app principal, permitiendo distinguir visualmente las compras online de los pagos presenciales.

## Estado Actual

Funcionando:

```txt
Catálogo público
Detalle de producto por link
Carrito
Checkout con pago por QR de 90 segundos
Reserva de 90 segundos
Expiración automática de pedidos sin pago
Productos vendidos no comprables (stock=0, available=false)
Etiqueta WEB en historial de pagos
Perfil de clienta con tab inicial en Pedidos
Links de mensajes automáticos a perfil/orders
Rellenar con IA robusto (limpia JSON de basura)
Categorias del catalogo sin parpadeo de defaults: la tienda y Config esperan `store_chips` antes de pintar chips
```

Pendiente recomendado:

```txt
Automatizar envío desde PanelPedido a store_customer_media para cada foto relevante.
Definir política de qué fotos se guardan como candidata/seleccionada/comprada.
Mejorar limpieza/retención de fotos antiguas en PanelPedido.
Agregar RLS a TiendaOnline cuando el flujo esté estable.
Agregar pantalla admin para ver store_customer_media por clienta.
Evitar copiar fotos; mantener solo links salvo decisión explícita.
```

## Reglas Críticas

```txt
1. No tocar ChehiAppAbril para storage de tienda.
2. No duplicar fotos de WhatsApp en TiendaOnline.
3. PanelPedido guarda la foto real.
4. TiendaOnline guarda media_url/panel_mensaje_id.
5. Si falla storage de tienda, no usar base principal como fallback.
6. Toda migración de tienda va solo en thgbfurscfjcmgokyyif.
```
