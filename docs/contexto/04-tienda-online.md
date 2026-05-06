# Tienda Online

## Qué es

Tienda pública donde los clientes pueden ver y reservar productos de ropa.
Tiene su propia base de datos separada de la app principal.

---

## Base de datos (Supabase `thgbfurscfjcmgokyyif`)

```
products
  id, name, description, price, stock, category
  images (array de URLs)
  user_id (dueña del negocio)

store_orders
  id, customer_id, status, total_amount
  items (JSON con productos reservados)
  payment_status (pending, verified, rejected)
  created_at

store_customers
  id, name, phone, email
  auth via Supabase Auth separado
```

---

## Variables de entorno

```
VITE_STORE_SUPABASE_URL=https://thgbfurscfjcmgokyyif.supabase.co
STORE_SUPABASE_SERVICE_ROLE_KEY=[key]
VITE_STORE_SUPABASE_ANON_KEY=[key]
```

---

## Flujo de compra en la tienda

```
Cliente navega productos en la tienda pública
    ↓ selecciona producto → reserva
store_orders creado con status: pending
    ↓ cliente hace transferencia bancaria
    ↓ cliente manda comprobante por WhatsApp al negocio
WhatsApp Bridge recibe la foto
    ↓
POST /api/store/ingest-wa  — la app detecta que es un comprobante de tienda
    ↓ IA extrae nombre + monto del comprobante
    ↓ cruza con store_orders pendientes
store_orders.payment_status → verified (o pending_review si no coincide)
```

---

## Endpoints de tienda en server.ts

```
POST /api/store-auth/register | login     — auth de clientes de tienda
GET  /api/store-auth/me

GET/POST        /api/products             — catálogo de productos
PATCH/DELETE    /api/products/:id
POST            /api/upload-image         — sube foto de producto

GET/POST        /api/store-orders         — órdenes
PATCH           /api/store-orders/:id
GET             /api/store-orders/me      — órdenes del cliente logueado
GET             /api/store-orders/admin   — vista admin de todas las órdenes
GET             /api/store-orders/reserved-products  — productos con reserva activa

POST /api/store/ingest-bank    — procesa notificación bancaria de la tienda
POST /api/store/ingest-wa      — procesa comprobante WA de tienda
GET  /api/store/whatsapp-photos — fotos WA relacionadas a órdenes de tienda
```

---

## Conexión con la app principal

- La tienda tiene su propio Supabase, separado del principal
- Los pagos verificados de la tienda se pueden ver en la app principal vía `GET /api/admin/store-profiles`
- Las notificaciones bancarias de la tienda usan el mismo pipeline de MacroDroid pero se procesan por separado en `ingest-bank`

---

## Estado actual

- Productos con `stock = 0` muestran sello **"VENDIDO"** en la tienda (no se ocultan)
- Cuando un operador verifica manualmente un pago desde el Panel WhatsApp, puede vincularlo a una orden de tienda
- Los pagos de tienda aparecen en la Lista de Pagos de la app principal (en color diferenciado)
