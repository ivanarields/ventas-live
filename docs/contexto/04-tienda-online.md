# Tienda Online

Última revisión: 2026-05-10. Verificado contra código real y producción.

---

## Qué es

PWA pública donde las clientas ven productos, los reservan, pagan, y consultan su perfil.
Es una app completamente separada que corre dentro del mismo servidor Vercel.

**Nombre de la marca:** Leidy American.

**Tienda nueva (oficial):** `leidydiaz.live/tienda` — código en `src/storefront-v2/`.
**Tienda antigua (respaldo):** `leidydiaz.live/tienda-original` — código en `src/storefront/`.
**Alias:** `leidydiaz.live/tienda-v2` → misma que `/tienda`.

El routing está en `vercel.json`:
```
/tienda          → tienda-v2.html
/tienda/:path*   → tienda-v2.html
/tienda-v2       → tienda-v2.html
/tienda-original → index.html (storefront viejo)
```

---

## Tres bases de datos involucradas

| Base | Proyecto Supabase | Para qué |
|---|---|---|
| **TiendaOnline** | `thgbfurscfjcmgokyyif` | productos, pedidos web, perfiles tienda, configuración, favoritos |
| **PanelPedido** | `vwaocoaeenavxkcshyuf` | fotos reales de WhatsApp (bucket `whatsapp-media`) |
| **ChehiAppAbril** | `vhczofpmxzbqzboysoca` | sistema principal — al confirmar venta entra aquí como pedido + pago |

**Reglas críticas:**
- Las fotos de WhatsApp viven en PanelPedido. La tienda solo guarda links.
- El bucket `store_images` es para fotos propias de productos (nunca de WhatsApp).
- Si falla subir a `store_images`, fallar — nunca usar la base principal como fallback.

---

## Estructura de código (storefront-v2)

```
src/storefront-v2/
  main.tsx                  ← entry point (lazy imports StorefrontApp)
  StorefrontApp.tsx         ← router principal con 9 vistas
  store.css                 ← estilos específicos de tienda
  components/
    ProductGallery.tsx      ← catálogo con filtros por categoría
    ProductDetail.tsx       ← detalle de prenda con galería de fotos
    CartView.tsx            ← carrito con ajuste de cantidades
    Checkout.tsx            ← identificación + pago QR + polling
    StoreProfile.tsx        ← perfil de clienta con 5 pestañas
    CustomerCenter.tsx      ← centro de clientas (historial, etc.)
    LiveConfirmation.tsx    ← confirmación de compra en live
    SelectionConfirmation.tsx ← confirmación de selección por token
  services/
    productsApi.ts          ← CRUD de productos
    storeAuth.ts            ← auth con JWT en localStorage
    storeOrdersApi.ts       ← crear y consultar pedidos
    storeFavoritesApi.ts    ← favoritos locales + sync al servidor
  config/
    storefrontConfig.ts     ← StoreChips (categorías/promos de la portada)
```

---

## Las 9 vistas del storefront

Definidas en `StorefrontApp.tsx` como tipo `View`:

| Vista | Ruta hash | Descripción |
|---|---|---|
| `welcome` | `/tienda` (sin hash) | Portada con nombre de marca, chips de categorías y botones |
| `gallery` | `#gallery` | Catálogo de productos con filtros |
| `detail` | `#producto/{id}` | Detalle de un producto específico |
| `cart` | `#cart` | Carrito de compras |
| `checkout` | `#checkout` | Identificación (teléfono+PIN) y pago QR |
| `profile` | `#profile` | Perfil de clienta logueada |
| `live-confirmation` | `#live-confirmation` | Confirmación de compra en Live |
| `selection` | `/tienda/selection?token=...` | Confirmación de selección por token |
| `customer-center` | `#customer-center` | Centro de clientas |

La navegación es por `window.location.hash`. La app escucha el evento `hashchange` para sincronizar la vista.

**PWA:** La app tiene soporte para instalación en el dispositivo. Si el navegador emite `beforeinstallprompt`, aparece un banner "Instalar app" en la portada.

**Dark mode:** Botón toggle en la portada. Guarda la preferencia en `localStorage('store_theme')`.

---

## Portada (welcome)

La portada carga los chips de categoría desde `/api/store/settings` al montar. Si no hay respuesta, usa los defaults:
```
Blusas, Vestidos, Chaquetas, Conjuntos, Pantalones, General, Rebajas, Promos, Nuevo
```
Muestra los primeros 4 chips activos como botones de acceso rápido.

Dos botones principales:
- **"Ver catálogo"** → va a `gallery`
- **"Centro de clientas"** → va a `customer-center`

Botón de perfil (ícono usuario) en esquina superior derecha → va a `profile`.

---

## Flujo de compra (paso a paso)

```
1. Clienta entra a leidydiaz.live/tienda (portada).
2. Toca "Ver catálogo" → ProductGallery.
3. Explora, filtra por categoría.
4. Toca un producto → ProductDetail.
   - "Comprar ahora" → agrega al carrito y va directo al Checkout.
   - "Agregar al carrito" → agrega, puede seguir viendo productos.
5. Desde CartView o ProductDetail → va a Checkout.
6. Checkout detecta si hay sesión activa (localStorage):
   - SÍ hay sesión → crea el pedido inmediatamente y va a la pantalla de pago.
   - NO hay sesión → muestra formulario de identificación (teléfono + PIN).
   - Si viene con ?phone=... en la URL → pre-rellena el teléfono automáticamente.
7. Identificación:
   - Intenta LOGIN con teléfono + PIN.
   - Si falla → intenta REGISTRO (nuevo cliente, mismo PIN queda guardado).
   - Si el número ya existe con otro PIN → error "PIN incorrecto".
   - Tras login/registro exitoso → sincroniza favoritos locales con el servidor.
8. Sistema crea store_orders con status=pending, expires_at=ahora+1min.
9. Pantalla de pago muestra:
   - Monto total + resumen de productos.
   - QR de Yape (URL configurable desde store_settings.payment_qr_url).
   - Nombre del beneficiario: "Leidy Candy Diaz Sanchez".
   - Countdown de 1 minuto con barra de progreso (rojo cuando quedan <30 seg).
   - Botón "Descargar QR" para guardar la imagen.
   - Botón "Ya pagué, enviar comprobante" → abre WhatsApp con mensaje pre-armado.
   - Polling cada 3 segundos a /api/store-orders/{id}/status.
10. Si MacroDroid detecta el pago → Edge Function → confirmStoreOrder.
11. Polling detecta status='paid' → pantalla de confirmación "¡Pago Verificado!".
12. Clienta toca "Ver mis pedidos" → carrito se limpia → vuelve a gallery.
```

### Mensaje de WhatsApp "Ya pagué" (botón manual)

Abre WhatsApp al número `VITE_STORE_WA_NUMBER` (default: `59160003230`) con:
> Hola! Pague el pedido #1042 por 150.00 Bs. Adjunto comprobante.

---

## Perfil de clienta (StoreProfile)

Tiene **5 pestañas**:

| Pestaña | ID | Contenido |
|---|---|---|
| Guardadas | `saved` | Productos marcados como favoritos |
| Mis Pedidos | `orders` | Historial de pedidos con estado |
| Entrega | `delivery` | Opciones de entrega |
| Confirmar | `confirm` | Confirmación de datos |
| Ajustes | `settings` | Logout y configuración |

Al cargar el perfil llama a `/api/store-auth/me` que devuelve `{ orders, favorites }`.
También sincroniza los favoritos locales (localStorage → servidor).

**Estados de pedido que se muestran:**

| status | Label visible |
|---|---|
| `pending` | Esperando pago |
| `paid` | Pago verificado |
| `ready` | Listo |
| `delivered` | Entregado |
| `cancelled` | Cancelado |

---

## Sistema de favoritos

Los favoritos tienen dos capas:

1. **Local (localStorage):** clave `store_favorites_v2`, guarda productos completos como JSON. Funciona sin sesión.
2. **Servidor:** tabla `store_favorites` en TiendaOnline. Se sincroniza al hacer login y después de cada cambio.

**Sync al login:** `storeFavoritesApi.syncLocal()` — envía los favoritos locales al servidor vía `POST /api/store-favorites/sync`.

---

## Auth de la tienda

- **Email ficticio:** `{phone}@tiendaleydi.com`
- **PIN:** 4 dígitos hasheados. Si el número no existe → se crea cuenta automática con ese PIN.
- **Token:** JWT de Supabase guardado en `localStorage` vía `storeAuth.saveSession()`.
- **No expira** intencionalmente (la clienta no tiene que volver a loguearse en cada visita).

---

## Chips de categorías (store_settings.store_chips)

Configurables desde el panel admin. Se guardan como JSON en `store_settings.store_chips`.

Defaults (`storefrontConfig.ts`):
```
Blusas, Vestidos, Chaquetas, Conjuntos, Pantalones, General, Rebajas, Promos, Nuevo
```

Tipos: `category` (filtra el catálogo) | `promo` (filtro especial).

La portada muestra los primeros 4 chips activos. La galería puede mostrar todos.

---

## Tablas en TiendaOnline (`thgbfurscfjcmgokyyif`)

### `products`
```
id, name/title, description, price, category, brand
images          array de URLs
sizes           array de tallas
stock           0 = vendido (muestra sello "VENDIDO")
available       false = oculto en catálogo
featured, condition, color, material, views
created_at, updated_at
```

`stock=0` → sello VENDIDO. `available=false` → producto invisible.

### `store_customers`
```
id, whatsapp, display_name, pin_hash, total_orders, total_spent
```
Auth ficticia: el teléfono funciona como identificador único.

### `store_orders`
```
id, customer_id, customer_name, customer_wa
items           JSON array [{productId, productName, price, size, quantity}]
total, status, payment_method, payment_ref
payment_verified_at, wa_proof_received, wa_message_id
expires_at      → cleanup automático después de 1 minuto si pending
delivery_type, delivery_date, delivery_slot, delivery_address, delivery_notes, delivery_status
```

**Estados:**

| status | Significado |
|---|---|
| `pending` | Reservado, esperando pago. Expira en 1 minuto. |
| `paid` | Pago verificado automáticamente (MacroDroid) o manualmente. |
| `ready` | Listo para retiro/entrega. |
| `delivered` | Entregado. |
| `cancelled` | Cancelado o expirado por timeout. |

### `payment_events`
```
id, hash, amount, sender_name, sender_phone, matched_order_id
created_at
```
Registra cada notificación bancaria recibida en la tienda. El campo `hash` evita duplicados.

### Otras tablas
```
store_favorites              productos favoritos por clienta (migración 044)
store_customer_media         links a fotos de prendas por clienta
store_selection_requests     confirmación de prendas por token
store_settings               configuración: payment_qr_url, store_chips, etc.
store_delivery_slots         horarios disponibles (Mañana 08-12, Tarde 12-17, Noche 17-21)
store_external_purchases     historial de compras Live o manuales vinculadas al perfil
store_message_log            historial de mensajes enviados
```

---

## Reserva de productos (cómo funciona exactamente)

`POST /api/store-orders` en `server.ts`:

1. Busca todos los pedidos con `status=pending` que NO hayan expirado.
2. Cruza los `productIds` del nuevo pedido contra los de los pedidos pending activos.
3. Si hay conflicto → **HTTP 409** con lista de productos en conflicto.
4. Si no hay conflicto → verifica que los productos tengan `available=true`.
5. Crea el pedido con `expires_at = ahora + 1 minuto`.

**Cleanup automático:** `setInterval` cada 30 segundos cancela pedidos `pending` con `expires_at` vencido y libera los productos (`available=true`).

---

## Confirmación de pago (confirmStoreOrder)

Se ejecuta cuando MacroDroid → Edge Function → `POST /api/store/match-payment` confirma un pago.

Pasos en orden:

1. **Actualiza** `store_orders.status = 'paid'`, guarda `payment_method='qr'`, `payment_ref=source`.
   - Solo si el pedido sigue en `status='pending'` (idempotencia).
2. **Oculta productos:** `products.stock = 0` para todos los productos del pedido.
3. **Obtiene nombre real** del pagador desde `payment_events.sender_name` (si la fuente es el banco/MacroDroid).
4. **Busca o crea** el cliente en ChehiAppAbril (por teléfono):
   - Si existe → actualiza nombre si antes estaba vacío.
   - Si no existe → crea nuevo con `user_id = STORE_OWNER_USER_ID`.
5. **Inyecta pedido** en ChehiAppAbril (`pedidos` table):
   - `status = 'procesar'` → aparece en Mesa de Preparación del operador.
   - `label = 'WEB-{id}'`, `label_type = 'WEB'`, `source = 'WEB'`.
   - `bag_count = 1` por defecto.
   - `web_items_list` = lista de prendas compradas.
6. **Inyecta pago** en ChehiAppAbril (`pagos` table):
   - `method = 'Tienda Online'`
   - Verifica duplicados: mismo `customer_id + monto + method + día` antes de insertar.
7. **Encola mensaje** de WhatsApp en `whatsapp_message_queue` (ChehiAppAbril):
   > ¡Hola Nombre! 🎉  
   > Tu pago fue confirmado. Tu pedido #N está listo. ¡Muchas gracias por tu compra!  
   > Mirá los detalles en tu perfil: https://leidydiaz.live/tienda#profile

**Regla crítica:** El operador **NO** recibe un segundo mensaje al marcar "PEDIDO LISTO" porque los pedidos con `source='WEB'` están filtrados en `PATCH /api/pedidos/:id`.

---

## Camino alternativo: MacroDroid no llega

Si MacroDroid falla o la clienta paga después del minuto de reserva:

1. La clienta toca "Ya pagué, enviar comprobante" en la pantalla de pago.
2. Se abre WhatsApp con mensaje pre-armado que incluye el número de pedido y el monto.
3. La clienta adjunta la foto del comprobante y envía.
4. El bridge guarda el mensaje en `panel_mensajes` (PanelPedido).
5. **HOY:** El operador tiene que ir al panel admin de la tienda y verificar manualmente.
6. **PENDIENTE (no implementado):** ese comprobante debería aparecer en MORADO en la página de Pagos del operador con la foto visible para confirmar con un clic.

---

## Edge Functions

| Función | Proyecto | Para qué |
|---|---|---|
| `ingest-bank-store` | TiendaOnline | Recibe notificaciones bancarias de MacroDroid. Ventana: **35 minutos**. Llama a `/api/store/match-payment`. |
| `ingest-notification` | ChehiAppAbril | Recibe notificaciones del sistema principal. También intenta cruzar con tienda llamando a `/api/store/match-payment`. |

La ventana de 35 minutos en `ingest-bank-store` es fija (no depende del código de pedido).

**Deploy:**
```bash
C:/Users/IVAN/bin/supabase.exe functions deploy ingest-bank-store --no-verify-jwt --project-ref thgbfurscfjcmgokyyif
C:/Users/IVAN/bin/supabase.exe functions deploy ingest-notification --no-verify-jwt --project-ref vhczofpmxzbqzboysoca
```

**Secrets necesarios:**
```
TiendaOnline:   SERVER_URL=https://leidydiaz.live
ChehiAppAbril:  OPENROUTER_API_KEY, OPENROUTER_MODEL, INGEST_DEVICE_SECRET, INGEST_USER_ID, SERVER_URL
```

---

## Endpoints de tienda en server.ts

### Auth de tienda
```
POST /api/store-auth/register        crear cuenta (teléfono + PIN)
POST /api/store-auth/login           login (teléfono + PIN)
GET  /api/store-auth/me              devuelve perfil + orders + favorites
```

### Favoritos
```
GET    /api/store-favorites          lista favoritos del usuario
POST   /api/store-favorites          agregar favorito { productId }
DELETE /api/store-favorites          quitar favorito { productId }
POST   /api/store-favorites/sync     sincronizar favoritos locales { productIds[] }
```

### Productos
```
GET    /api/products                 lista productos disponibles (con filtros)
GET    /api/products/:id             detalle de un producto
POST   /api/products                 crear producto (admin)
PATCH  /api/products/:id             editar producto (admin)
DELETE /api/products/:id             eliminar producto (admin)
POST   /api/upload-image             sube imagen SOLO al bucket store_images
```

### Pedidos
```
POST /api/store-orders               crear pedido (reserva 1 min, verifica conflictos)
GET  /api/store-orders               lista admin de todos los pedidos
GET  /api/store-orders/me            pedidos de la clienta logueada
GET  /api/store-orders/admin         vista admin con detalle
GET  /api/store-orders/reserved-products  productos actualmente reservados
GET  /api/store-orders/:id/status    polling de estado (devuelve { status })
PATCH /api/store-orders/:id          actualizar pedido (admin)
```

### Pagos y verificación
```
POST /api/store/ingest-bank          recibe notificación bancaria directo al servidor (fallback de Edge Function)
POST /api/store/ingest-wa            recibe comprobante de WhatsApp con código #pedido
POST /api/store/match-payment        confirma pago (llamado por Edge Functions o manualmente)
POST /api/store/verify-order/:id     verificación manual por admin
GET  /api/store/whatsapp-photos      fotos de comprobantes WA por teléfono
POST /api/store/notify-live-ready    notifica a cliente Live que su pedido está listo
```

### Configuración y datos del cliente
```
GET   /api/store/settings            leer configuración (QR, chips, delivery slots, etc.)
PATCH /api/store/settings            actualizar configuración
GET   /api/store/delivery-slots      horarios disponibles
GET   /api/store/customer-media/:phone    media vinculada al cliente
POST  /api/store/customer-media      agregar link de media
GET   /api/store/external-purchases/:phone  compras externas (Live, manuales)
POST  /api/store/external-purchases  registrar compra externa
```

### Selección de prendas por token
```
POST /api/store/selection-request              crear solicitud con token único
GET  /api/store/selection/:token               ver selección pendiente
POST /api/store/selection/:token/confirm       clienta confirma la selección
POST /api/store/selection/:token/reject        clienta rechaza la selección
POST /api/store/selection/:id/send-link        enviar link de selección por WA
GET  /api/store/selection-requests             lista de selecciones (admin)
```

---

## Variables de entorno (Vercel)

```
VITE_STORE_SUPABASE_URL=https://thgbfurscfjcmgokyyif.supabase.co
VITE_STORE_SUPABASE_ANON_KEY=...
STORE_SUPABASE_SERVICE_ROLE_KEY=...
STORE_OWNER_USER_ID=13dcb065-6099-4776-982c-18e98ff2b27a   ← CRÍTICO
STORE_PUBLIC_URL=https://leidydiaz.live
VITE_STORE_WA_NUMBER=59160003230                            ← número WA del botón "Ya pagué"
```

`STORE_OWNER_USER_ID` es crítico: sin él, los pedidos web se crean con `user_id='store-auto'` y quedan invisibles en el panel del operador.

---

## Estado actual — qué funciona y qué falta

### Funcionando ✅
- Catálogo público con filtros por categoría, detalle por link directo.
- Carrito con múltiples productos y cantidades.
- Login obligatorio + auto-registro con PIN de 4 dígitos.
- Pre-relleno de teléfono desde URL `?phone=...`.
- Reserva de 1 minuto + cleanup automático cada 30 segundos.
- Confirmación automática: MacroDroid → `ingest-bank-store` → `match-payment` → `confirmStoreOrder`.
- Inyección de pedido + pago en ChehiAppAbril con `label=WEB-{id}`.
- Mensaje único de WhatsApp al confirmar pago (link al perfil).
- Procesador automático de cola WA cada 60 seg.
- Perfil de clienta con historial de pedidos y favoritos.
- Sistema de favoritos local + sincronizado.
- Tienda v2 en `/tienda`, v1 en `/tienda-original`.
- PWA instalable desde la portada.
- Dark mode.
- Chips de categorías configurables desde panel admin.

### Pendiente ❌
1. **Comprobante WhatsApp en MORADO:** cuando MacroDroid no llega, el comprobante enviado por WA debería aparecer en la página de Pagos del operador (morado = pendiente) con la foto, para confirmar con un clic. Hoy el operador tiene que ir al panel admin de tienda manualmente.
2. **Foto de prendas en el perfil:** el perfil muestra nombre del producto y precio, pero no la foto. La clienta no puede ver visualmente qué compró.
3. **Optimizar QR de Yape:** `/qr-yape.jpg` pesa 523 KB. Debería pesar ~50 KB. Es el principal cuello de botella de velocidad en la pantalla de pago.
4. **RLS (Row Level Security):** TiendaOnline no tiene RLS activo en ninguna tabla.

---

## Reglas críticas

1. No usar ChehiAppAbril para storage de fotos de tienda.
2. No duplicar fotos de WhatsApp en TiendaOnline (solo links).
3. PanelPedido guarda la foto real; TiendaOnline guarda el `media_url`.
4. Si falla subir al bucket `store_images`, fallar — no usar la base principal como fallback.
5. Las migraciones de TiendaOnline van solo en `thgbfurscfjcmgokyyif`.
6. Los pedidos web tienen `source='WEB'` y `label_type='WEB'`. El operador **NO** recibe el segundo mensaje "PEDIDO LISTO" porque ya lo recibió al confirmar el pago.
7. `STORE_OWNER_USER_ID` debe estar siempre configurado en Vercel.
