# Supabase — Sistema de etiquetas y casilleros

## Setup inicial

### 1. Crear proyecto en Supabase
1. Ir a https://supabase.com/dashboard
2. "New project" → elegir nombre, región y password de base de datos
3. Esperar ~2 min a que el proyecto se provisione

### 2. Correr las migraciones SQL
En el dashboard de Supabase → **SQL Editor** → pegar y ejecutar en orden:

1. `supabase/migrations/001_labeling_system.sql` (tablas + seed de 8 casilleros)
2. `supabase/migrations/002_allocation_functions.sql` (funciones transaccionales)

### 3. Configurar variables de entorno
Copiar `.env.example` a `.env` y completar:
- `VITE_SUPABASE_URL` y `SUPABASE_URL` — mismo valor (Settings → API → Project URL)
- `VITE_SUPABASE_ANON_KEY` — Settings → API → anon / public key
- `SUPABASE_SERVICE_ROLE_KEY` — Settings → API → service_role key (¡secreto!)

### 4. Probar endpoints
```bash
npm run dev
```

```bash
# Ver casilleros
curl http://localhost:3001/api/storage/containers

# Crear pedido simple (1 bolsa) → asigna casillero numérico
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customerId":1,"totalBags":1,"totalItems":5}'

# Crear pedido complejo (3 bolsas) → asigna casillero alfabético
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customerId":1,"totalBags":3,"totalItems":20}'

# Migrar pedido simple a complejo
curl -X POST http://localhost:3001/api/orders/1/update-bags \
  -H "Content-Type: application/json" \
  -d '{"newTotalBags":2}'

# Entregar → libera casillero
curl -X POST http://localhost:3001/api/orders/1/deliver
```

## Arquitectura

```
Frontend (App.tsx)
       ↓ fetch()
server.ts (endpoints)
       ↓ supabaseServer.rpc()
PostgreSQL (fn_assign_container, fn_migrate_to_complex, fn_release_container)
       ↓ FOR UPDATE SKIP LOCKED
storage_containers + container_allocations
```

Toda la lógica transaccional vive en las funciones PL/pgSQL. El backend sólo orquesta y el frontend sólo muestra el resultado.
