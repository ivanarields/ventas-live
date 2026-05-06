# App Principal — Ventas Live

## Stack tecnológico
- **Frontend:** React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4
- **Backend:** Express.js (`server.ts`) — sirve Vite en dev, API REST en prod
- **Base de datos:** Supabase (PostgreSQL) — proyecto `vhczofpmxzbqzboysoca`
- **Auth:** Supabase Auth (email/password) — `ivanariel.fb@gmail.com` / `Chehi2024!`
- **IA:** OpenRouter (modelo: `google/gemini-2.5-flash-lite`)
- **Deploy:** Vercel (proyecto `prj_gNNLSgdwI2QSyPLmoAZ0PksGNUdG`)

---

## Flujo operativo principal (4 pantallas)

```
Lista de Pagos → Perfil del Cliente → Mesa de Preparación → Regreso al Perfil
```

1. **Lista de Pagos** — clientes con nombre y monto. Filtros: ojo (oculta entregados), # (solo con WA). Botón "Registrar" para efectivo. Botón "Live" para procesar todos los chats WA pendientes.
2. **Perfil del Cliente** — total adeudado/pagado. Tarjetas: gris (solo pago), amarillo (PROCESAR), azul (LISTO con etiqueta).
3. **Mesa de Preparación** — táctil. Camiseta: +1 prenda. Bolsa: +1 bolsa. "PEDIDO LISTO" guarda y asigna casillero.
4. **Regreso al Perfil** — pedido aparece en azul con etiqueta (ej: "3" o "H"). Flecha vuelve a Lista de Pagos.

---

## Arquitectura de datos

### Tablas principales (DB `vhczofpmxzbqzboysoca`)
```
customers           — clientes (nombre, phone, active_label, active_label_type)
pagos               — pagos recibidos (nombre, pago, date, method, verification_origin)
pedidos             — pedidos en proceso (status: procesar/listo/entregado, bag_count)
orders              — pedidos en sistema de casilleros (order_status: READY/DELIVERED)
order_bags          — bolsas individuales por pedido
storage_containers  — casilleros físicos (NUMERIC_SHARED y ALPHA_COMPLEX)
container_allocations — asignaciones activas/históricas de casilleros
transactions        — ingresos y gastos financieros
categories          — categorías de transacciones
live_sessions       — agenda de TikTok Lives
app_users           — usuarios de la app
```

### Todas las tablas tienen `user_id TEXT` para multi-usuario (sin RLS por ahora)

---

## Endpoints del servidor (server.ts)

### Auth
```
POST /api/auth/login | logout
GET  /api/auth/me
```

### Core
```
GET/POST         /api/clientes
PATCH/DELETE     /api/clientes/:id
GET/POST         /api/pagos | /api/pagos-lista
PATCH/DELETE     /api/pagos/:id
GET/POST         /api/pedidos
PATCH/DELETE     /api/pedidos/:id
GET/POST         /api/transacciones
PATCH/DELETE     /api/transacciones/:id
GET/POST         /api/categorias | /api/lives | /api/ideas
```

### Sistema de casilleros
```
POST /api/orders                        — crear pedido + asignar casillero
POST /api/orders/:id/update-bags        — actualizar bolsas + migrar casillero si aplica
POST /api/orders/:id/deliver            — marcar entregado + liberar casillero
GET  /api/storage/containers            — estado actual de todos los casilleros
GET  /api/orders/:id/allocation-history — historial de casilleros de un pedido
GET/PATCH /api/storage/config           — configuración de capacidad
```

### IA (ai-gateway)
```
POST /api/ai/product-from-images        — cataloga producto desde fotos
POST /api/ai/analyze-image              — análisis general de imagen
POST /api/ai/analyze-qr                 — lee QR de comprobante
POST /api/ai/summarize-conversation     — resume chat WA + detecta comprobante
GET/PATCH /api/ai/prompts               — gestión de prompts
GET/POST /api/ai/config                 — configuración de IA
GET  /api/ai/usage                      — estadísticas de uso
```

### Tienda Online
```
POST /api/store-auth/register | login
GET  /api/store-auth/me
GET/POST /api/products
PATCH/DELETE /api/products/:id
GET/POST /api/store-orders
PATCH /api/store-orders/:id
GET  /api/store-orders/me | admin | reserved-products
POST /api/store/ingest-bank             — cruza pago bancario con orden de tienda
POST /api/store/ingest-wa               — procesa comprobante WA de tienda
GET  /api/store/whatsapp-photos         — fotos WA relacionadas a tienda
```

### Live Sales (src/routes/live-sales.ts)
```
GET  /api/live-sales/cards              — tarjetas del panel WA
POST /api/live-sales/cards
PATCH /api/live-sales/cards/:id
POST /api/live-sales/cards/:id/archive
GET  /api/live-sales/day-orders         — pedidos del día
POST /api/live-sales/payments/:id/verify-manual  — verificar pago morado manualmente
POST /api/live-sales/payments/:id/reject
POST /api/live-sales/day-orders/:id/archive
GET  /api/live-sales/conversations      — conversaciones WA del panel
GET  /api/live-sales/pending-conversations — conversaciones pendientes de procesar
DELETE /api/live-sales/conversations
```

---

## Convenciones del código

- `App.tsx` monolítico (~8000 líneas) — no extraer salvo funcionalidad autocontenida
- Después de cada mutación: llamar `onRefresh()` o `loadData()` para re-sincronizar
- Nuevos call-sites usan `pagosApi`, `clientesApi`, etc. directamente (no firebase-compat)
- Fechas: usar `getFullYear/getMonth/getDate()` para fechas locales, no `toISOString()`
- Lógica de casilleros: siempre en el backend, nunca en el cliente
