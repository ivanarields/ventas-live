# Tienda Online

Última revisión: 2026-05-10.

## Qué es

PWA pública donde las clientas ven productos, los reservan, pagan, y consultan su perfil.

**Tienda nueva (oficial):** `leidydiaz.live/tienda` — código en `src/storefront-v2/`.
**Tienda antigua (respaldo):** `leidydiaz.live/tienda-original` — código en `src/storefront/`.
**Tienda v2 directo:** `leidydiaz.live/tienda-v2` — misma que `/tienda`.

El routing está definido en `vercel.json`:

```
/tienda          → tienda-v2.html
/tienda/:path*   → tienda-v2.html
/tienda-v2       → tienda-v2.html
/tienda-original → index.html (storefront viejo)
```

---

## Tres bases de datos involucradas

| Base | Proyecto | Usa para |
|---|---|---|
| **TiendaOnline** | `thgbfurscfjcmgokyyif` | productos, pedidos web, perfiles tienda, configuración |
| **PanelPedido** | `vwaocoaeenavxkcshyuf` | fotos reales de WhatsApp en bucket `whatsapp-media` |
| **ChehiAppAbril** | `vhczofpmxzbqzboysoca` | sistema principal (al confirmar venta entra acá como pedido + pago) |

**Reglas:**
- Las fotos reales de WhatsApp viven en PanelPedido. La tienda solo guarda links.
- El bucket `store_images` es para fotos propias de productos (no de WhatsApp).
- Si falla subir a `store_images`, no usar la base principal como fallback.

---

## Tablas en TiendaOnline

### `products`
Catálogo público.
```
id, name, description, price, category, brand
images          array URLs
sizes           array tallas
stock           cantidad disponible (0 = vendido)
available       si se muestra en tienda
featured, condition, color, material, views
created_at, updated_at
```

`stock=0` muestra sello "VENDIDO" sobre el producto. `available=false` lo oculta.

### `store_customers`
Perfil de clienta.
```
id, whatsapp, display_name, pin_hash, total_orders, total_spent
```

Auth ficticia: email = `{phone}@tiendaleydi.com` + PIN de 4 dígitos.

### `store_orders`
Pedidos creados desde la tienda.
```
id, customer_id, customer_name, customer_wa
items, total, status, payment_method, payment_ref
payment_verified_at, wa_proof_received, wa_message_id
expires_at
delivery_type, delivery_date, delivery_slot, delivery_address, delivery_notes, delivery_status
```

Estados:

| Estado | Significado |
|---|---|
| `pending` | reservado, esperando pago |
| `paid` | pago verificado |
| `ready` | listo para entrega/retiro |
| `delivered` | entregado |
| `cancelled` | cancelado o vencido |

**Reserva: 1 minuto** (variable `RESERVATION_MINUTES = 1` en `server.ts`).
**Cleanup automático:** cada 30 segundos cancela pedidos `pending` expirados y libera productos.

### Otras tablas
```
store_customer_media          links a fotos por clienta (no archivos)
store_selection_requests      casos donde se necesita confirmación de prendas
store_settings                configuración editable
store_delivery_slots          horarios (Mañana 08-12, Tarde 12-17, Noche 17-21)
store_external_purchases      historial de compras Live o manuales
store_message_log             historial de mensajes generados
store_favorites               favoritos por clienta (migración 044)
```

---

## Flujo de compra (paso a paso)

```
1. Clienta entra a leidydiaz.live/tienda.
2. Elige prendas, agrega al carrito, va al checkout.
3. Login obligatorio: teléfono + PIN.
   - Si la clienta es nueva, se crea cuenta automática con el PIN que ponga.
   - Si vino de un link de WhatsApp con ?phone=... se autocompleta el número.
4. Sistema crea store_orders con status=pending y expires_at = ahora+1min.
5. Muestra QR de Yape. Polling cada 3 seg al estado del pedido.
6. Clienta paga con su app del banco.
7. Banco notifica al celular del operador.
8. MacroDroid captura y manda la notificación.
9. Edge Function ingest-bank-store recibe la notificación.
10. Edge Function llama POST /api/store/match-payment al servidor Express.
11. Servidor ejecuta confirmStoreOrder.
```

### Qué hace `confirmStoreOrder` (en `server.ts`)

1. `store_orders.status = paid`, guarda `payment_method` y `payment_ref`.
2. `products.stock = 0` para los productos vendidos (muestra sello "VENDIDO").
3. Busca/crea customer en ChehiAppAbril con el nombre del banco.
4. Inserta en `pedidos` (ChehiAppAbril) con: `status=procesar`, `label=WEB-{id}`, `label_type=WEB`, `source=WEB`, `web_items_list`.
5. Inserta en `pagos` (ChehiAppAbril) con `method=Tienda Online`.
6. Encola UN solo mensaje de WhatsApp en `whatsapp_message_queue` (ver `02-sistema-pagos.md`).

---

## Camino alternativo: pago no automático

Si MacroDroid no llega o la clienta paga después del minuto:

1. La clienta toca "Ya pagué, enviar comprobante" en la tienda.
2. Se abre WhatsApp con un mensaje pre-armado: *"Hola! Pagué el pedido #1042 por X Bs. Adjunto comprobante 📸"*.
3. La clienta agrega la foto y envía.
4. El bridge guarda el mensaje en `panel_mensajes`.
5. Actualmente: el operador entra al panel admin de la tienda y verifica manualmente.

**Pendiente (mejora propuesta):** ese mensaje debería aparecer en MORADO en la página de Pagos del operador, con la foto del comprobante, para que el operador confirme con un clic sin ir al panel admin de tienda. **No implementado.**

---

## Páginas (rutas hash dentro de `/tienda`)

```
/tienda                      portada
/tienda#gallery              catálogo
/tienda#cart                 carrito
/tienda#checkout             checkout
/tienda#profile              perfil de clienta
/tienda#customer-center      centro de clientas
/tienda#live-confirmation    confirmación live
/tienda#producto/{id}        detalle de producto
/tienda/selection?token=...  confirmación de prendas por token
```

---

## Endpoints

### Frontend público
```
GET /tienda            tienda nueva
GET /tienda-original   tienda antigua respaldo
GET /tienda-v2         alias de la nueva
```

### Auth tienda
```
POST /api/store-auth/register
POST /api/store-auth/login
GET  /api/store-auth/me
```

### Productos
```
GET    /api/products
POST   /api/products
PATCH  /api/products/:id
DELETE /api/products/:id
POST   /api/upload-image       sube SOLO al bucket store_images
```

### Pedidos
```
POST  /api/store-orders                      crea pedido (con reserva 1 min)
GET   /api/store-orders/reserved-products    lista productos reservados
GET   /api/store-orders/:id/status           polling de estado
GET   /api/store-orders/me                   pedidos de la clienta logueada
GET   /api/store-orders/admin                vista admin
GET   /api/store-orders                      lista admin
PATCH /api/store-orders/:id
```

### Pagos y verificación
```
POST /api/store/ingest-bank        recibe notificación bancaria
POST /api/store/ingest-wa          recibe comprobante WhatsApp
POST /api/store/match-payment      cruce manual o desde Edge Function
GET  /api/store/whatsapp-photos    fotos WA por teléfono
POST /api/store/notify-live-ready  notifica cliente Live
```

### Configuración
```
GET   /api/store/settings
PATCH /api/store/settings
GET   /api/store/delivery-slots
GET   /api/store/customer-media/:phone
POST  /api/store/customer-media
GET   /api/store/external-purchases/:phone
POST  /api/store/external-purchases
```

### Confirmación de prendas
```
POST /api/store/selection-request
GET  /api/store/selection/:token
POST /api/store/selection/:token/confirm
POST /api/store/selection/:token/reject
POST /api/store/selection/:id/send-link
GET  /api/store/selection-requests
```

---

## Edge Functions

| Función | Proyecto | Para qué |
|---|---|---|
| `ingest-notification` | ChehiAppAbril | Recibe notificaciones bancarias (sistema principal). También intenta cruzar con tienda llamando a `/api/store/match-payment`. |
| `ingest-bank-store` | TiendaOnline | Recibe notificaciones bancarias específicas de tienda. Llama a `/api/store/match-payment` para confirmar el pago. |

Para desplegar:

```bash
C:/Users/IVAN/bin/supabase.exe functions deploy ingest-notification --no-verify-jwt --project-ref vhczofpmxzbqzboysoca
C:/Users/IVAN/bin/supabase.exe functions deploy ingest-bank-store --no-verify-jwt --project-ref thgbfurscfjcmgokyyif
```

Secrets necesarios:

```
ChehiAppAbril:  OPENROUTER_API_KEY, OPENROUTER_MODEL, INGEST_DEVICE_SECRET, INGEST_USER_ID, SERVER_URL
TiendaOnline:   SERVER_URL=https://leidydiaz.live
```

---

## Variables de entorno (Vercel)

```
VITE_STORE_SUPABASE_URL=https://thgbfurscfjcmgokyyif.supabase.co
VITE_STORE_SUPABASE_ANON_KEY=...
STORE_SUPABASE_SERVICE_ROLE_KEY=...
STORE_OWNER_USER_ID=13dcb065-6099-4776-982c-18e98ff2b27a
STORE_PUBLIC_URL=https://leidydiaz.live
```

`STORE_OWNER_USER_ID` es crítico: si falta, los pedidos web se crean con `user_id='store-auto'` y quedan invisibles.

---

## Reglas críticas

1. No tocar ChehiAppAbril para storage de fotos de tienda.
2. No duplicar fotos de WhatsApp en TiendaOnline (solo links).
3. PanelPedido guarda la foto real, TiendaOnline guarda el `media_url`.
4. Si falla subir al bucket `store_images`, fallar — no usar la base principal como fallback.
5. Las migraciones de tienda van solo en `thgbfurscfjcmgokyyif`.
6. Los pedidos web tienen `source='WEB'` y `label_type='WEB'`. El operador NO recibe el segundo mensaje "PEDIDO LISTO" porque ya lo recibió al pagar.

---

## Estado actual

**Funcionando:**
- Catálogo público, detalle por link, carrito, checkout.
- Login obligatorio + auto-registro con PIN.
- Reserva 1 minuto + cleanup automático cada 30 seg.
- Confirmación automática vía MacroDroid → Edge Function → match-payment.
- Inyección de pedido + pago + WhatsApp en ChehiAppAbril.
- Mensaje único de WhatsApp con link al perfil.
- Procesador automático de cola WhatsApp (filtro `storeOnly`).
- Tienda nueva en `/tienda`, antigua en `/tienda-original`.

**Pendiente:**
- Comprobante WhatsApp aparece en MORADO en la página de Pagos (no implementado).
- Foto de prendas en el perfil de clienta.
- RLS en tablas de TiendaOnline.
- Achicar el QR de Yape de 523 KB a ~50 KB para mejorar velocidad de pantalla de pago.
