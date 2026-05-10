# App Principal — Ventas Live

## Stack tecnológico

- **Frontend:** React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4
- **Backend:** Express.js (`server.ts`) — sirve Vite en dev, API REST en prod
- **Base de datos principal:** Supabase `vhczofpmxzbqzboysoca` (ChehiAppAbril)
- **Auth:** Supabase Auth (email/password) — `ivanariel.fb@gmail.com` / `Chehi2024!`
- **IA:** OpenRouter (modelo `google/gemini-2.5-flash-lite`)
- **Deploy:** Vercel (proyecto `ventas-live`)
- **Dominio principal:** `leidydiaz.live`

---

## Flujo operativo del operador (4 pantallas)

```
Lista de Pagos → Perfil del Cliente → Mesa de Preparación → Regreso al Perfil
```

### Pantalla 1 — Lista de Pagos
- Lista de clientes con nombre y monto pagado.
- Filtros: ojo (oculta entregados), # (solo con WhatsApp).
- Botón **"Registrar"** para pago en efectivo manual.
- Botón **"Live"** procesa todos los chats WhatsApp pendientes en paralelo.
- Tocar un nombre → abre Perfil del Cliente.

### Pantalla 2 — Perfil del Cliente
- Cabecera: nombre + botón WhatsApp.
- Tarjetas de total adeudado y total pagado.
- Historial con tarjetas de colores:
  - **Gris** = solo pago, sin pedido asociado.
  - **Amarillo** = pedido en estado PROCESAR.
  - **Azul** = pedido LISTO con etiqueta de casillero.
- Tocar una tarjeta amarilla → abre Mesa de Preparación.
- Botón **"+ Pedido"** crea un pedido nuevo.

### Pantalla 3 — Mesa de Preparación
- Táctil, optimizada para manos ocupadas.
- Ícono camiseta: +1 prenda. Ícono bolsa: +1 bolsa. Reset: vuelve a cero.
- Botón **"PEDIDO LISTO"**: guarda el conteo, asigna casillero automáticamente.

### Pantalla 4 — Regreso automático
- Después de "PEDIDO LISTO", vuelve al Perfil.
- El pedido aparece en azul con su etiqueta (ej: `3` numérico, `B` alfabético, o `WEB-1042` si es de tienda).
- La X cierra el perfil y vuelve a Lista de Pagos.

---

## Tablas principales (DB ChehiAppAbril)

```
customers               clientes (id, name, phone, full_name, normalized_name, active_label, active_label_type)
pagos                   pagos recibidos (id, nombre, pago, date, method, status, customer_id, user_id)
pedidos                 pedidos en proceso (id, status, total_amount, label, label_type, source, web_items_list)
orders                  pedidos del sistema de casilleros (id, order_status, customer_id)
order_bags              bolsas individuales por pedido
storage_containers      casilleros físicos (NUMERIC_SHARED 1-100, ALPHA_COMPLEX A-Z)
container_allocations   asignaciones activas/históricas
transactions            ingresos y gastos
categories              categorías de transacciones
live_sessions           agenda de TikTok Lives
app_users               usuarios de la app (multi-operador, sin RLS por ahora)
whatsapp_message_queue  cola de mensajes WhatsApp pendientes de envío
```

Todas las tablas tienen `user_id TEXT` para multi-operador (filtrado en server, sin RLS de Supabase activo).

---

## Endpoints del servidor (`server.ts`)

### Auth
```
POST /api/auth/login | logout
GET  /api/auth/me
```

### Core (CRUD)
```
GET POST PATCH DELETE   /api/clientes
GET POST PATCH DELETE   /api/pagos | /api/pagos-lista
GET POST PATCH DELETE   /api/pedidos
GET POST PATCH DELETE   /api/transacciones
GET POST PATCH DELETE   /api/categorias | /api/lives | /api/ideas
```

### Sistema de casilleros
```
POST /api/orders                        crear pedido + asignar casillero
POST /api/orders/:id/update-bags        actualizar bolsas + migrar casillero si aplica
POST /api/orders/:id/deliver            marcar entregado + liberar casillero
GET  /api/storage/containers            estado actual de todos los casilleros
GET  /api/orders/:id/allocation-history historial de un pedido
GET PATCH /api/storage/config           configuración de capacidad
```

### IA (`src/routes/ai-gateway.ts`)
```
POST /api/ai/product-from-images        cataloga producto desde fotos
POST /api/ai/analyze-image              análisis general de imagen
POST /api/ai/analyze-qr                 lee QR de comprobante
POST /api/ai/summarize-conversation     resume chat WA + detecta comprobante
GET PATCH /api/ai/prompts               gestión de prompts
GET POST /api/ai/config                 configuración de IA
GET /api/ai/usage                       estadísticas
```

### Tienda Online
```
POST /api/store-auth/register | login
GET  /api/store-auth/me                 incluye orders y favorites de la clienta
GET POST /api/products
PATCH DELETE /api/products/:id
POST /api/upload-image                  sube SOLO al bucket store_images de TiendaOnline
GET POST /api/store-orders
PATCH /api/store-orders/:id
GET /api/store-orders/me | admin | reserved-products | :id/status
POST /api/store/ingest-bank             cruza pago bancario con orden de tienda
POST /api/store/ingest-wa               procesa comprobante WhatsApp
POST /api/store/match-payment           cruce manual o desde Edge Function
GET POST /api/store/settings | delivery-slots
GET POST /api/store/customer-media | external-purchases
POST /api/store/notify-live-ready
```

### WhatsApp (`src/routes/whatsapp.ts`)
```
GET  /api/whatsapp/queue                lista mensajes pendientes
POST /api/whatsapp/queue                encola un mensaje
PATCH /api/whatsapp/queue/:id           edita o cancela mensaje pending
POST /api/whatsapp/send-next            toma 1 mensaje y lo envía al bridge
POST /api/whatsapp/retry/:id            reintenta un mensaje failed
```

### Live Sales (`src/routes/live-sales.ts`)
```
GET  /api/live-sales/cards
POST /api/live-sales/cards
PATCH /api/live-sales/cards/:id
POST /api/live-sales/cards/:id/archive
GET  /api/live-sales/day-orders
POST /api/live-sales/payments/:id/verify-manual   verifica pago morado a mano
POST /api/live-sales/payments/:id/reject
GET  /api/live-sales/conversations | pending-conversations
DELETE /api/live-sales/conversations
```

---

## Convenciones del código

- `App.tsx` monolítico (~7400 líneas) — no extraer salvo funcionalidad totalmente autocontenida.
- Después de cada mutación: llamar `onRefresh()` o `loadData()` para re-sincronizar estado local.
- Nuevos call-sites usan `pagosApi`, `clientesApi`, etc. directamente (no `firebase-compat`).
- Fechas: usar `getFullYear/getMonth/getDate()` para fechas locales de Bolivia, no `toISOString()`.
- Lógica de casilleros y normalización de nombres: siempre en el backend, nunca en el cliente.
- Modales: flags booleanos en `useState` — sin librería de modales.

---

## Variables de entorno principales

```
PORT=3004
SUPABASE_URL / VITE_SUPABASE_URL = https://vhczofpmxzbqzboysoca.supabase.co
SUPABASE_SERVICE_ROLE_KEY        (server)
VITE_SUPABASE_ANON_KEY           (browser)
PANEL_SUPABASE_URL = https://vwaocoaeenavxkcshyuf.supabase.co
PANEL_SUPABASE_SERVICE_KEY       (server)
VITE_STORE_SUPABASE_URL = https://thgbfurscfjcmgokyyif.supabase.co
VITE_STORE_SUPABASE_ANON_KEY     (browser)
STORE_SUPABASE_SERVICE_ROLE_KEY  (server)
STORE_OWNER_USER_ID = 13dcb065-6099-4776-982c-18e98ff2b27a
STORE_PUBLIC_URL = https://leidydiaz.live
WHATSAPP_BRIDGE_URL = http://134.122.123.253:3001
WEBHOOK_SECRET = ventas-live-bridge-2026
OPENROUTER_API_KEY               (server)
OPENROUTER_MODEL = google/gemini-2.5-flash-lite
INGEST_DEVICE_SECRET             (server)
```
