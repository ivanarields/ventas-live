# Tienda Online — Documento Completo

## Qué es

Tienda pública donde los clientes ven y reservan productos de ropa.
Tiene su propia base de datos separada del sistema principal (consignación).
Cuando un cliente paga, el sistema une automáticamente ambos mundos: crea el pedido en la Mesa de Preparación y registra el pago en la Lista de Pagos de la app principal.

---

## Bases de datos

| Base | Proyecto Supabase | Para qué |
|------|-------------------|----------|
| Tienda | `thgbfurscfjcmgokyyif` | productos, órdenes, clientes de tienda |
| Principal | `vhczofpmxzbqzboysoca` | clientes, pagos, pedidos, casilleros |

La tienda escribe en **ambas** bases cuando se confirma un pago.

---

## Tablas de la tienda (Supabase `thgbfurscfjcmgokyyif`)

### `products`
```
id, name, description, price, stock, category, brand
images          — array de URLs de fotos
sizes           — array de tallas disponibles (ej: ["S","M","L"])
color, material, condition
available       — true/false: se muestra en la tienda pública
featured        — destacado en portada
ai_confidence   — confianza del análisis IA al catalogar
views           — contador de visitas
created_at, updated_at
```
**Regla clave:** `stock = 0` muestra sello "VENDIDO" en la tienda (no oculta el producto). `available = false` sí lo oculta completamente.

### `store_orders`
```
id, customer_name, customer_wa  — datos del comprador
items           — JSON: [{productId, name, price, quantity, size}]
total           — monto total en Bs
status          — ver estados más abajo
payment_method  — "qr", "transfer", etc.
payment_ref     — referencia del pago (fuente que lo confirmó)
payment_verified_at — timestamp de cuando se verificó
wa_proof_received   — true si llegó comprobante por WA
wa_message_id       — ID del mensaje WA del comprobante
expires_at      — cuándo expira la reserva (2 minutos desde creación)
notes
created_at, updated_at
```

**Estados de `store_orders.status`:**
| Estado | Significado |
|--------|-------------|
| `pending` | Reservado, esperando pago (expira en 2 min si no paga) |
| `paid` | Pago verificado automáticamente (banco o WA+código) |
| `confirmed` | Confirmado manualmente por el operador |
| `cancelled` | Expiró sin pago o fue cancelado |
| `pending_manual_review` | Llegó WA pero no se pudo verificar automáticamente |

### `store_customers`
```
id, whatsapp, display_name, pin_hash
total_orders, total_spent
```
Auth: email ficticio `{phone}@tiendaleydi.com` + PIN de 4 dígitos.
No requiere email real — experiencia sin fricción.

---

## Flujo completo de una compra

```
1. Cliente navega productos en la tienda pública
   ↓
2. Selecciona producto → ingresa nombre y número WA → confirma pedido
   POST /api/store-orders
   → store_orders creado con status: "pending"
   → reserva exclusiva por 2 minutos (otro cliente no puede comprar el mismo producto)
   → si no paga en 2 min → status: "cancelled" (por intervalo automático cada 30 seg)
   ↓
3. Cliente hace transferencia bancaria por el monto exacto
   ↓
   VÍA A — MacroDroid captura la notificación bancaria:
   POST /api/store/ingest-bank
   → Motor de cuadrangulación intenta cruzar con store_orders pending
   → Si match → confirmStoreOrder()
   
   VÍA B — Cliente manda foto de comprobante por WhatsApp:
   POST /api/store/ingest-wa
   → IA extrae monto y código de pedido (#1042)
   → Motor de cuadrangulación intenta cruzar
   → Si match → confirmStoreOrder()
   ↓
4. confirmStoreOrder() hace 3 cosas:
   a) store_orders.status → "paid", guarda payment_verified_at
   b) products.stock → 0 (muestra sello VENDIDO)
   c) UNIFICACIÓN: busca o crea cliente en la DB principal (customers)
      → crea pedido en DB principal (pedidos) con status "procesar" y label_type "WEB"
      → crea pago en DB principal (pagos) con method "Tienda Online"
   ↓
5. En la app principal:
   → El pedido aparece en la Mesa de Preparación (tarjeta amarilla "PROCESAR")
   → El pago aparece en la Lista de Pagos con method "Tienda Online"
   → El operador lo procesa igual que cualquier otro pedido
```

---

## Motor de cuadrangulación (matching inteligente)

Cuando llega un pago bancario o comprobante WA, el motor intenta identificar a qué pedido corresponde con 3 niveles de confianza:

| Nivel | Condición | Acción |
|-------|-----------|--------|
| **Máxima** | Código de pedido `#1042` + monto coinciden | Verifica automáticamente |
| **Alta** | Monto único en ventana de tiempo (solo 1 pedido con ese monto) | Verifica automáticamente |
| **Alta** | Monto + número WA coinciden exactamente | Verifica automáticamente |
| **Media** | Múltiples pedidos con el mismo monto | No verifica — espera más datos |
| **Ninguna** | Sin match | Queda como `pending_manual_review` |

---

## Endpoints de la tienda (todos en server.ts)

### Auth de clientes
```
POST /api/store-auth/register    — registra con teléfono + PIN 4 dígitos
POST /api/store-auth/login       — login con teléfono + PIN
GET  /api/store-auth/me          — sesión actual + historial de órdenes
```

### Catálogo de productos
```
GET    /api/products             — catálogo público (paginado, filtrable por categoría/búsqueda)
  query params: page, limit, category, search, admin=true (para ver todos incluyendo no disponibles)
POST   /api/products             — crear producto (requiere x-user-id)
PATCH  /api/products/:id         — editar producto
DELETE /api/products/:id         — eliminar producto
POST   /api/upload-image         — sube foto al storage (base64 → supabase storage 'store_images')
```

### Órdenes
```
POST  /api/store-orders                    — crear pedido + reserva exclusiva 2 min
GET   /api/store-orders/reserved-products  — qué productos están reservados ahora (para tienda pública)
GET   /api/store-orders/:id/status         — estado de un pedido específico
GET   /api/store-orders/me                 — mis pedidos (cliente logueado)
GET   /api/store-orders/admin              — todos los pedidos (operador, requiere x-user-id)
GET   /api/store-orders                    — lista general
PATCH /api/store-orders/:id                — actualizar estado (status, wa_sent, hideProducts)
```

### Motor de pagos
```
POST /api/store/ingest-bank    — recibe notificación bancaria MacroDroid para la tienda
POST /api/store/ingest-wa      — recibe comprobante WA de la tienda
GET  /api/store/whatsapp-photos — fotos WA relacionadas a órdenes de tienda
```

### Admin
```
GET /api/admin/store-profiles  — perfiles de clientes de tienda (vista en app principal)
```

---

## Conexión tienda ↔ sistema principal

Cuando `confirmStoreOrder()` confirma un pago:

1. **Crea o actualiza `customers`** en la DB principal (por número WA)
2. **Crea `pedidos`** en la DB principal con:
   - `status: "procesar"` → aparece en Mesa de Preparación
   - `label_type: "WEB"` → el operador sabe que vino de la tienda
   - `source: "WEB"`
   - `web_items_list` → lista de productos comprados
3. **Crea `pagos`** en la DB principal con:
   - `method: "Tienda Online"`
   - aparece en la Lista de Pagos diferenciado

---

## Comportamiento de reservas

- Al crear un pedido → reserva exclusiva de **2 minutos**
- Si el cliente paga dentro de 2 min → queda `paid`
- Si no paga → `cancelled` automáticamente (intervalo cada 30 seg en server.ts)
- Productos cancelados vuelven a `available: true`

---

## Variables de entorno necesarias

```
VITE_STORE_SUPABASE_URL=https://thgbfurscfjcmgokyyif.supabase.co
VITE_STORE_SUPABASE_ANON_KEY=[anon key]
STORE_SUPABASE_SERVICE_ROLE_KEY=[service role key]
```

---

## Estado actual y pendientes de la tienda

**Funcionando:**
- Catálogo público con paginación, filtros por categoría, búsqueda
- Reserva exclusiva con expiración automática
- Motor de matching automático (3 niveles de confianza)
- Unificación de identidad: tienda ↔ sistema principal al confirmar pago
- Productos vendidos muestran sello "VENDIDO" (stock=0) sin ocultarse
- Pago de tienda aparece en Lista de Pagos de la app principal
- Pedido de tienda aparece en Mesa de Preparación

**Pendiente / por mejorar:**
- Verificación manual de pedidos en `pending_manual_review` desde la app
- Notificación WA al cliente cuando se confirma el pedido (función `enqueueStoreConfirmation` existe pero depende del bridge WA)
- Vista de gestión de tienda más completa en la app principal
- RLS en Supabase tienda (actualmente sin seguridad a nivel de filas)
