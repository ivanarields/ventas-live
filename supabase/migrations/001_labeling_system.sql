-- ============================================================================
-- Sistema de etiquetas y casilleros — Ventas Live
-- ============================================================================
-- Ejecutar en Supabase SQL Editor.
-- Crea: customers, orders, order_bags, storage_containers, container_allocations
-- ============================================================================

-- 1. CLIENTES
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  whatsapp_number TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_customers_normalized_name ON customers(normalized_name);
CREATE INDEX IF NOT EXISTS ix_customers_whatsapp ON customers(whatsapp_number) WHERE whatsapp_number IS NOT NULL;

-- 2. PEDIDOS
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  order_code TEXT UNIQUE NOT NULL,
  logistics_type TEXT NOT NULL CHECK (logistics_type IN ('SIMPLE', 'COMPLEX')),
  total_bags INTEGER NOT NULL DEFAULT 1 CHECK (total_bags >= 1),
  total_items INTEGER NOT NULL DEFAULT 0,
  order_status TEXT NOT NULL DEFAULT 'IN_PROCESS'
    CHECK (order_status IN ('IN_PROCESS', 'READY', 'DELIVERED', 'CANCELLED')),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders(order_status);

-- 3. BOLSAS INDIVIDUALES POR PEDIDO
CREATE TABLE IF NOT EXISTS order_bags (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  bag_number INTEGER NOT NULL,
  bag_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (bag_status IN ('ACTIVE', 'DELIVERED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, bag_number)
);

-- 4. CASILLEROS FÍSICOS
CREATE TABLE IF NOT EXISTS storage_containers (
  id BIGSERIAL PRIMARY KEY,
  container_code TEXT UNIQUE NOT NULL,
  container_type TEXT NOT NULL
    CHECK (container_type IN ('NUMERIC_SHARED', 'ALPHA_COMPLEX')),
  max_simple_orders INTEGER NOT NULL DEFAULT 0,
  max_bags_capacity INTEGER NOT NULL DEFAULT 0,
  current_simple_orders INTEGER NOT NULL DEFAULT 0,
  current_bags_used INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK (state IN ('AVAILABLE', 'PARTIAL', 'FULL', 'BLOCKED', 'MAINTENANCE')),
  priority_order INTEGER NOT NULL DEFAULT 100,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_containers_type_state ON storage_containers(container_type, state);

-- 5. ASIGNACIONES (tabla más crítica)
CREATE TABLE IF NOT EXISTS container_allocations (
  id BIGSERIAL PRIMARY KEY,
  container_id BIGINT NOT NULL REFERENCES storage_containers(id),
  order_id BIGINT NOT NULL REFERENCES orders(id),
  allocation_type TEXT NOT NULL
    CHECK (allocation_type IN ('SIMPLE_SHARED', 'COMPLEX_CONTAINER')),
  bags_reserved INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'RELEASED', 'MIGRATED', 'CANCELLED')),
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_by TEXT,
  released_at TIMESTAMPTZ,
  release_reason TEXT,
  migration_target_id BIGINT REFERENCES storage_containers(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un pedido sólo puede tener UNA asignación activa a la vez
CREATE UNIQUE INDEX IF NOT EXISTS ux_active_allocation_per_order
  ON container_allocations(order_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS ix_allocations_container ON container_allocations(container_id);
CREATE INDEX IF NOT EXISTS ix_allocations_status ON container_allocations(status);

-- ============================================================================
-- TRIGGERS — actualizar updated_at automáticamente
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_customers_updated ON customers;
CREATE TRIGGER t_customers_updated BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS t_orders_updated ON orders;
CREATE TRIGGER t_orders_updated BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS t_containers_updated ON storage_containers;
CREATE TRIGGER t_containers_updated BEFORE UPDATE ON storage_containers
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

-- ============================================================================
-- SEED inicial de casilleros
-- ============================================================================
INSERT INTO storage_containers
  (container_code, container_type, max_simple_orders, max_bags_capacity, priority_order)
VALUES
  ('1', 'NUMERIC_SHARED', 4,  4,  1),
  ('2', 'NUMERIC_SHARED', 4,  4,  2),
  ('3', 'NUMERIC_SHARED', 4,  4,  3),
  ('4', 'NUMERIC_SHARED', 4,  4,  4),
  ('A', 'ALPHA_COMPLEX',  0, 12, 10),
  ('B', 'ALPHA_COMPLEX',  0, 12, 11),
  ('C', 'ALPHA_COMPLEX',  0, 12, 12),
  ('D', 'ALPHA_COMPLEX',  0, 12, 13)
ON CONFLICT (container_code) DO NOTHING;
