# CLAUDE.md

Este archivo proporciona orientación a Claude Code (claude.ai/code) para trabajar en este repositorio.

---

## Qué es esta app

**Ventas Live** es una PWA para gestionar un servicio de ropa en consignación. Los clientes dejan bolsas de ropa, el operador las procesa (cuenta prendas y bolsas físicas), las almacena con etiquetas en casilleros físicos y gestiona los cobros. También tiene módulos de finanzas, agenda de TikTok Lives y OCR bancario con Gemini.

---

## Flujo operativo principal (las 4 pantallas)

El flujo es siempre lineal. No romper esta navegación.

```
Lista de Pagos → Perfil del Cliente → Mesa de Preparación → Regreso al Perfil
```

### Pantalla 1 — Lista de Pagos (home)
- Lista de clientes con su nombre y monto pagado
- Filtro **ojo**: oculta clientes que ya retiraron su ropa
- Filtro **#**: muestra solo clientes con WhatsApp
- Botón **"Registrar"**: pago manual en efectivo
- Tocar un nombre → abre Perfil del Cliente

### Pantalla 2 — Perfil del Cliente
- Cabecera: nombre + botón WhatsApp
- Tarjetas: total adeudado / total pagado
- Historial: entradas grises = solo pago (sin pedido), azul = PROCESAR, verde = listo con etiqueta
- Tocar un pedido azul "PROCESAR" → abre Mesa de Preparación
- Botón **"+ Pedido"** crea un pedido nuevo para el cliente

### Pantalla 3 — Mesa de Preparación (la más importante)
- Táctil, optimizada para manos ocupadas
- Ícono camiseta: +1 prenda | Ícono bolsa: +1 bolsa | Reset: vuelve a cero
- **"PEDIDO LISTO"**: guarda conteo, asigna casillero automáticamente vía Supabase

### Pantalla 4 — Retorno automático
- Al tocar "PEDIDO LISTO" regresa al Perfil
- El pedido aparece en verde con su etiqueta (ej: "3" o "B")
- La X cierra el perfil y vuelve a la Lista de Pagos

---

## Sistema de etiquetas y casilleros

| Tipo | Códigos | Capacidad | Para qué |
|---|---|---|---|
| `NUMERIC_SHARED` | 1, 2, 3, 4 | Hasta 4 pedidos simples | 1 bolsa |
| `ALPHA_COMPLEX` | A, B, C, D | 12 bolsas máx | 2+ bolsas |

- **Migración automática**: 1 bolsa → numérico; si suma una segunda, PostgreSQL migra a alfabético en una transacción atómica
- El operador nunca elige el casillero — el backend lo asigna solo
- Historial de asignaciones nunca se borra

---

## Estado actual — Migración completada a Supabase

**Firebase eliminado.** La app corre 100% en Supabase.

### Qué se hizo (sesiones anteriores)

**Fase 1 — Sistema de etiquetas (completado)**
- 5 tablas PostgreSQL: `customers`, `orders`, `order_bags`, `storage_containers`, `container_allocations`
- 4 funciones PL/pgSQL con `FOR UPDATE SKIP LOCKED`: `fn_assign_container`, `fn_migrate_to_complex`, `fn_release_container`, `fn_recalc_container_state`
- Bridge Firebase↔Supabase: `fn_upsert_customer`, `fn_upsert_order_and_assign`, `fn_release_order_by_firebase_id`
- Migraciones: `001` a `005` en `supabase/migrations/`

**Fase 2 — Migración completa (completado)**
- Nuevas tablas: `pagos`, `pedidos`, `transactions`, `categories`, `live_sessions`, `giveaways`, `ideas`, `app_users` — migración `006`
- `server.ts`: eliminados todos los imports de Firebase; ahora tiene ~15 endpoints REST puros en Supabase
- `src/App.tsx`: eliminados `onSnapshot` listeners y Firebase Auth; reemplazados por:
  - `loadData()` — carga inicial desde API al hacer login
  - `authApi.login/logout` — Supabase Auth vía servidor
  - `firebase-compat.ts` — shim que mapea las llamadas legacy (addDoc, updateDoc, etc.) al nuevo API REST
- `src/lib/api.ts` — cliente HTTP tipado para todos los endpoints
- `src/lib/firebase-compat.ts` — shim de compatibilidad (temporal, para migrar gradualmente call-sites)
- `src/lib/supabase.ts` — cliente Supabase browser (anon key)
- `src/lib/supabaseServer.ts` — cliente Supabase server (service role key)
- `src/services/labelingService.ts` — `syncPedidoLabel`, `releasePedidoLabel`

### Credencial de acceso (Supabase Auth)
- Email: `ivanariel.fb@gmail.com`
- Contraseña: `Chehi2024!`
- User ID: `13dcb065-6099-4776-982c-18e98ff2b27a`

---

## Arquitectura actual

### Flujo de datos
1. Login → `POST /api/auth/login` → Supabase Auth → token JWT guardado en `localStorage`
2. `loadData()` al iniciar sesión → fetch paralelo a todos los endpoints → `useState`
3. Acciones del usuario → `pagosApi`, `pedidosApi`, `clientesApi`, etc. → Express → Supabase
4. Después de cada mutación → `loadData()` o `onRefresh()` para re-sincronizar el estado

### Autenticación
- Token JWT almacenado en `localStorage` como `sb_session: { user, token }`
- `x-user-id` header en cada petición al servidor → filtra datos por usuario
- `setAuthContext(userId, token)` y `setCompatUserId(userId)` se llaman al login/restore

### Shim de compatibilidad (`firebase-compat.ts`)
- Expone: `db`, `collection`, `doc`, `addDoc`, `updateDoc`, `deleteDoc`, `getDocs`, `writeBatch`, `serverTimestamp`, `increment`, `Timestamp`, `query`, `where`, `orderBy`, `limit`
- Mapea colecciones a endpoints: `customers→/api/clientes`, `pagos→/api/pagos`, `pedidos→/api/pedidos`, etc.
- `orders` y `giveaways` son no-ops silenciosos (legacy)
- **Limitación**: `getDocs` con `query(where(...))` ignora los filtros (devuelve todos). Los filtros se hacen client-side en el estado local.

### Endpoints del servidor (`server.ts`)
```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/clientes
POST   /api/clientes
PATCH  /api/clientes/:id
DELETE /api/clientes/:id

GET    /api/pagos-lista
POST   /api/pagos
PATCH  /api/pagos/:id
DELETE /api/pagos/:id

GET    /api/pedidos
POST   /api/pedidos
PATCH  /api/pedidos/:id
DELETE /api/pedidos/:id

GET    /api/transacciones
POST   /api/transacciones
PATCH  /api/transacciones/:id
DELETE /api/transacciones/:id

GET    /api/categorias  (+ POST/PATCH/DELETE)
GET    /api/lives       (+ POST/PATCH/DELETE)
GET    /api/ideas       (+ POST)

POST   /api/orders                      ← sistema de etiquetas
POST   /api/orders/:id/update-bags
POST   /api/orders/:id/deliver
GET    /api/storage/containers
GET    /api/orders/:id/allocation-history
```

---

## Schema de base de datos (PostgreSQL / Supabase)

### Tablas de la app
```sql
-- Sistema de etiquetas (creado en migraciones 001-005)
storage_containers  -- casilleros físicos (1-4 numéricos, A-D alfabéticos)
orders              -- pedidos en el sistema de etiquetas
order_bags          -- bolsas individuales por pedido
container_allocations -- asignaciones activas/históricas
customers           -- clientes (extendida con firebase_id, phone, active_label, etc.)

-- App general (migración 006)
pagos               -- pagos recibidos (efectivo, transferencia, etc.)
pedidos             -- pedidos de ropa en proceso
transactions        -- transacciones financieras (ingresos/gastos)
categories          -- categorías de transacciones
live_sessions       -- agenda de TikTok Lives
giveaways           -- sorteos en vivo
ideas               -- notas e ideas
app_users           -- usuarios de la app
```

### Todas las tablas tienen `user_id TEXT` para multi-usuario (RLS pendiente)

---

## Comandos

```bash
npm run dev       # Servidor de desarrollo (Express + Vite HMR)
npm run build     # Compilación → dist/
npm run start     # Servidor producción
npm run lint      # TypeScript check (tsc --noEmit)

# Supabase
C:/Users/IVAN/bin/supabase.exe db push   # Aplicar migraciones pendientes
npx tsx scripts/seed-labels.ts           # Seed de prueba del sistema de etiquetas
```

Puerto actual de desarrollo: **3004** (se incrementa si el puerto anterior sigue ocupado — cambiar `PORT` en `.env`)

---

## Stack tecnológico

- **Frontend:** React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4
- **Backend:** Express.js (`server.ts`) — sirve Vite en dev, REST API en prod
- **Base de datos:** Supabase (PostgreSQL) — proyecto `vhczofpmxzbqzboysoca` (ChehiAppAbril)
- **Auth:** Supabase Auth (email/password)
- **IA:** Google Gemini (`@google/genai`) — OCR de capturas bancarias
- **Animaciones:** Motion (fork de Framer Motion)
- **Gráficos/PDF:** Recharts, jsPDF + html2canvas
- **Supabase CLI:** `C:/Users/IVAN/bin/supabase.exe` (v2.90.0)

---

## Variables de entorno (`.env`)

| Variable | Propósito |
|---|---|
| `PORT` | Puerto del servidor (actualmente 3004) |
| `VITE_SUPABASE_URL` | URL proyecto Supabase (browser) |
| `SUPABASE_URL` | URL proyecto Supabase (server) |
| `VITE_SUPABASE_ANON_KEY` | Clave pública Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privada Supabase (solo servidor) |
| `GEMINI_API_KEY` | OCR bancario con Gemini |

---

## Sistema de diseño

Variables `@theme` en `src/index.css`:
- `--brand: #ff2d78` (fucsia primario)
- `--brand-secondary: #fff0f3`
- Clases: `.btn-pill-primary`, `.btn-pill-secondary`, `.card-modern`, `.input-modern`, `.glass-nav`

---

## Convenciones clave

- **Modales:** flags booleanos en `useState` — sin librería de modales
- **Fechas:** `TIMESTAMPTZ` en PostgreSQL; se muestran con `date-fns`
- **Normalización de nombres:** siempre en el servidor, nunca en el cliente
- **Lógica de casilleros:** siempre en el backend — la app solo muestra la etiqueta resultante
- **App.tsx monolítico (~8000 líneas):** no extraer salvo funcionalidad completamente autocontenida
- **Después de cada mutación:** llamar `onRefresh()` o `loadData()` para re-sincronizar estado local
- **`firebase-compat.ts`:** shim temporal — los nuevos call-sites deben usar `pagosApi`, `clientesApi`, etc. directamente

## Fase 3 — Flujo de Pago→Pedido y correcciones (completado)

**Lo que se hizo:**
- Al registrar un pago, se crea automáticamente un pedido en estado `"procesar"` → aparece tarjeta azul en el perfil
- Botón "PEDIDO LISTO" ahora actualiza correctamente el estado a `"listo"` vía `pedidosApi.update()`
- Corregido: `handleSmartAction` ahora envía `bag_count` y `item_count` en snake_case (Supabase requiere snake_case)
- `syncLabelsForCustomer` se ejecuta automáticamente y asigna etiqueta (1-4 o A-D) según cantidad de bolsas
- Flujo completo verificado con pruebas HTTP:
  1. Registrar pago → crea pedido en "procesar"
  2. Abrir Mesa de Preparación → contar prendas/bolsas
  3. Tocar "PEDIDO LISTO" → estado cambia a "listo" + etiqueta asignada
  4. Opcionalmente marcar como "entregado" → libera casillero

## Pendiente

- RLS (Row Level Security) en PostgreSQL — actualmente filtrado solo por `user_id` en el servidor
- Despliegue en Vercel
- Realtime con Supabase Realtime (reemplazar el polling manual de `loadData`)
