# AGENTS.md

Archivo de contexto universal para cualquier agente de IA (Claude, Gemini, Antigravity, Cursor, Aider, Codex, etc.) que trabaje en este proyecto. Lee esto primero.

---

## Qué es esta app

**Ventas Live** es una PWA para gestionar un servicio de ropa en consignación en Bolivia. Los clientes dejan bolsas de ropa, el operador las procesa (cuenta prendas y bolsas físicas), las almacena con etiquetas en casilleros físicos y gestiona los cobros. También tiene módulos de finanzas, agenda de TikTok Lives, OCR bancario y una tienda online.

**Idioma:** Responder siempre en español. El usuario es de habla hispana.

---

## Flujo operativo principal (4 pantallas)

```
Lista de Pagos → Perfil del Cliente → Mesa de Preparación → Regreso al Perfil
```

1. **Lista de Pagos (home)** — clientes + monto pagado. Filtros: ojo (ocultar retirados), # (solo con WhatsApp). Botón "Registrar" = pago manual en efectivo.
2. **Perfil del Cliente** — cabecera + WhatsApp, totales, historial (gris=solo pago, azul=PROCESAR, verde=listo). Botón "+ Pedido" crea pedido nuevo.
3. **Mesa de Preparación** — táctil. Ícono camiseta = +1 prenda, ícono bolsa = +1 bolsa. "PEDIDO LISTO" guarda y asigna casillero automáticamente.
4. **Retorno** — vuelve al perfil, el pedido aparece en verde con etiqueta.

---

## Sistema de etiquetas y casilleros

| Tipo | Códigos | Capacidad | Para qué |
|---|---|---|---|
| `NUMERIC_SHARED` | 1, 2, 3, 4 | Hasta 4 pedidos simples | 1 bolsa |
| `ALPHA_COMPLEX` | A, B, C, D | 12 bolsas máx | 2+ bolsas |

- **Migración automática:** 1 bolsa → numérico. Al agregar una segunda, PostgreSQL migra a alfabético en una transacción atómica.
- El operador nunca elige casillero — el backend lo asigna.
- Historial de asignaciones nunca se borra.

---

## Stack

- **Frontend:** React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4
- **Backend:** Express.js (`server.ts`) — sirve Vite en dev, REST API en prod
- **DB:** Supabase PostgreSQL — proyecto `vhczofpmxzbqzboysoca`
- **Auth:** Supabase Auth (email/password)
- **IA:** Google Gemini 2.5 Flash Lite (parser de notificaciones bancarias)
- **Supabase CLI local:** `C:/Users/IVAN/bin/supabase.exe`

**Firebase está completamente eliminado.** La app corre 100% en Supabase. Existe un shim `firebase-compat.ts` que mapea llamadas legacy al nuevo API REST (temporal, migrar call-sites).

---

## Credenciales de desarrollo

- **Email:** `ivanariel.fb@gmail.com`
- **User ID:** `13dcb065-6099-4776-982c-18e98ff2b27a`
- **Contraseña dev:** `Chehi2024!`

---

## Comandos

```bash
npm run dev       # Servidor dev (Express + Vite HMR, puerto 3004)
npm run build     # Compilación → dist/
npm run start     # Servidor producción
npm run lint      # tsc --noEmit

# Supabase
C:/Users/IVAN/bin/supabase.exe db push                 # Aplicar migraciones
C:/Users/IVAN/bin/supabase.exe functions deploy NAME \
  --no-verify-jwt --project-ref vhczofpmxzbqzboysoca   # Deploy Edge Function
```

---

## Variables de entorno (`.env`)

| Variable | Propósito |
|---|---|
| `PORT` | Puerto del servidor (3004) |
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | URL proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave pública (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privada (solo server) |
| `GEMINI_API_KEY` | Parser IA de notificaciones |

---

## Arquitectura

### Flujo de datos
1. Login → `POST /api/auth/login` → Supabase Auth → JWT en `localStorage` (key: `sb_session`)
2. `loadData()` al iniciar → fetch paralelo a todos los endpoints → `useState`
3. Mutaciones → `pagosApi`, `pedidosApi`, `clientesApi`, etc. → Express → Supabase
4. Tras cada mutación → `loadData()` o `onRefresh()` para re-sincronizar

### Autenticación
- JWT en `localStorage` como `sb_session: { user, token }`
- `x-user-id` header en cada petición al servidor → filtra datos por usuario
- `setAuthContext(userId, token)` y `setCompatUserId(userId)` al login/restore

### Endpoints principales (`server.ts`)
```
POST   /api/auth/login, logout, me
CRUD   /api/clientes, /api/pagos, /api/pedidos
CRUD   /api/transacciones, /api/categorias, /api/lives, /api/ideas
POST   /api/orders                       ← sistema de etiquetas
POST   /api/orders/:id/update-bags
POST   /api/orders/:id/deliver
GET    /api/storage/containers
CRUD   /api/store-orders                 ← tienda online (Fase 2)
```

---

## Schema de base de datos

### Tablas principales
```
-- Sistema de etiquetas
storage_containers      — casilleros físicos (1-4 numéricos, A-D alfabéticos)
orders                  — pedidos en sistema de etiquetas
order_bags              — bolsas por pedido
container_allocations   — asignaciones activas/históricas
customers               — clientes (firebase_id, phone, active_label, etc.)

-- App general
pagos, pedidos, transactions, categories, live_sessions, giveaways, ideas, app_users

-- Tienda online (Fase 2)
products, store_orders

-- Ingesta de notificaciones (Fase 4)
raw_notification_events, parsed_payment_candidates, manual_review_queue
learned_text_patterns, notification_bank_observations
```

Todas las tablas tienen `user_id TEXT` para multi-usuario (RLS pendiente).

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
- **Lógica de casilleros:** siempre en el backend — la app solo muestra la etiqueta
- **App.tsx monolítico (~8000 líneas):** no extraer salvo funcionalidad autocontenida
- **Después de cada mutación:** llamar `onRefresh()` o `loadData()` para re-sincronizar
- **`firebase-compat.ts`:** shim temporal — nuevos call-sites usar `pagosApi`, `clientesApi`, etc. directo
- **Snake_case en Supabase:** los inserts/updates deben usar snake_case (`bag_count`, no `bagCount`)

---

## Fases completadas

**Fase 1 — Sistema de etiquetas**
Tablas PostgreSQL + 4 funciones PL/pgSQL con `FOR UPDATE SKIP LOCKED`: `fn_assign_container`, `fn_migrate_to_complex`, `fn_release_container`, `fn_recalc_container_state`. Migraciones `001`-`005`.

**Fase 2 — Migración completa a Supabase**
Firebase eliminado. ~15 endpoints REST. Tienda online (`products`, `store_orders`). Multi-imágenes en productos. Carrito de compras. Migración `006` + `018`.

**Fase 3 — Flujo Pago→Pedido**
Al crear pago se crea pedido automático en `"procesar"`. "PEDIDO LISTO" actualiza estado y asigna etiqueta.

**Fase 4 — Ingesta de notificaciones bancarias**
Pipeline: MacroDroid Android → Edge Function `ingest-notification` → `pagos` + `pedidos` automáticos.

Parseo en cascada (nunca inventa nombres):
1. Regex hardcodeados (Yape directo, Yape QR, bancos clásicos)
2. Patrones aprendidos (`learned_text_patterns`) — auto-aprendizaje por `app_package`
3. **Gemini 2.5 Flash Lite** con `thinkingConfig.thinkingBudget: 0` — casos nuevos
4. Sin nombre válido → `manual_review_queue` (NUNCA placeholder tipo "PAGO Yape")

**Detalle técnico completo:** `docs/notifications-system.md`.

---

## Reglas de negocio críticas (NO romper)

1. **Nunca inventar nombres de pagadores.** Si una notificación no tiene nombre real, dejarla en `manual_review_queue`. El usuario rechazó explícitamente placeholders tipo "PAGO Yape", "Depósito recibido". Mejor pago perdido que nombre falso.
2. **Idempotencia:** cada notificación se hashea (SHA-256) antes de insertarse → no hay duplicados.
3. **Auto-aprendizaje:** cada pago exitoso guarda su patrón textual (`before_marker`/`after_marker`) para mejorar extracciones futuras.
4. **Gemini es último recurso:** regex y aprendizaje deben fallar antes de llamar la API (para no gastar cuota).
5. **Deploy Edge Function requiere `--no-verify-jwt`** — sin eso MacroDroid recibe 401.

---

## Modelo de Gemini en uso

**Modelo:** `gemini-2.5-flash-lite`
**Config:** `temperature: 0`, `maxOutputTokens: 150`, `responseMimeType: 'application/json'`, `thinkingConfig: { thinkingBudget: 0 }`
**Cuota free tier:** 15 RPM, 1500 requests/día

**Modelos descartados y por qué:**
- `gemini-1.5-flash-latest` → deprecado (404)
- `gemini-2.0-flash` → requiere tier pagado
- `gemini-flash-latest` → gasta todos los tokens en "thinking" y devuelve vacío

---

## Scripts útiles (`scripts/`)

| Script | Qué hace |
|---|---|
| `rescue-with-regex.mjs` | Procesa `manual_review_queue` con el regex actual |
| `rescue-with-gemini.mjs` | Igual pero con Gemini (más potente, más lento, usa cuota) |
| `reset-and-seed.mjs` | Borra todo y crea 5 clientes de prueba (**DESTRUCTIVO**) |
| `seed-labels.ts` | Seed del sistema de etiquetas |

---

## Pendiente

- RLS (Row Level Security) en PostgreSQL
- Despliegue en Vercel
- Realtime con Supabase Realtime (reemplazar polling de `loadData`)

---

## Documentación adicional

- `docs/notifications-system.md` — detalle completo del pipeline de notificaciones (endpoints, headers, formatos de Yape/bancos, troubleshooting)
- `CLAUDE.md` — contenido casi idéntico a este, mantenido como respaldo para Claude Code
