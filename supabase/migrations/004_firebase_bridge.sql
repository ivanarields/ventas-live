-- Columnas firebase_id para linkear registros creados en Firebase con los de Supabase
-- durante la convivencia hasta Fase 2 (migración completa).

ALTER TABLE customers ADD COLUMN IF NOT EXISTS firebase_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS firebase_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_firebase_id
  ON customers(firebase_id) WHERE firebase_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_firebase_id
  ON orders(firebase_id) WHERE firebase_id IS NOT NULL;

-- Helper RPC: upsert un cliente por firebase_id
CREATE OR REPLACE FUNCTION fn_upsert_customer(
  p_firebase_id TEXT,
  p_full_name TEXT,
  p_normalized_name TEXT,
  p_whatsapp_number TEXT DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO customers (firebase_id, full_name, normalized_name, whatsapp_number)
  VALUES (p_firebase_id, p_full_name, p_normalized_name, p_whatsapp_number)
  ON CONFLICT (firebase_id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      normalized_name = EXCLUDED.normalized_name,
      whatsapp_number = COALESCE(EXCLUDED.whatsapp_number, customers.whatsapp_number)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Helper RPC: upsert un pedido por firebase_id y asignar casillero si no tiene
CREATE OR REPLACE FUNCTION fn_upsert_order_and_assign(
  p_firebase_id TEXT,
  p_customer_id BIGINT,
  p_total_bags INT,
  p_total_items INT DEFAULT 0,
  p_total_amount NUMERIC DEFAULT 0,
  p_assigned_by TEXT DEFAULT 'app'
)
RETURNS TABLE (
  out_order_id BIGINT,
  out_container_code TEXT,
  out_was_migrated BOOLEAN
) AS $$
DECLARE
  v_order_id BIGINT;
  v_existing_bags INT;
  v_existing_logistics TEXT;
  v_had_active_allocation BOOLEAN;
  v_assign_row RECORD;
  v_migrate_row RECORD;
  v_new_logistics TEXT;
  v_container_code TEXT;
  v_was_migrated BOOLEAN := FALSE;
BEGIN
  v_new_logistics := CASE WHEN p_total_bags >= 2 THEN 'COMPLEX' ELSE 'SIMPLE' END;

  -- Buscar pedido existente por firebase_id
  SELECT o.id, o.total_bags, o.logistics_type INTO v_order_id, v_existing_bags, v_existing_logistics
  FROM orders o WHERE o.firebase_id = p_firebase_id;

  IF v_order_id IS NULL THEN
    -- Crear nuevo
    INSERT INTO orders (
      firebase_id, customer_id, order_code, logistics_type,
      total_bags, total_items, total_amount, order_status
    ) VALUES (
      p_firebase_id, p_customer_id,
      'ORD-' || p_firebase_id,
      v_new_logistics, p_total_bags, p_total_items, p_total_amount, 'IN_PROCESS'
    )
    RETURNING id INTO v_order_id;

    -- Asignar casillero
    SELECT * INTO v_assign_row FROM fn_assign_container(v_order_id, p_assigned_by);
    v_container_code := v_assign_row.out_container_code;
  ELSE
    -- Ya existe: verificar si cambió la cantidad de bolsas
    SELECT EXISTS(SELECT 1 FROM container_allocations WHERE order_id = v_order_id AND status = 'ACTIVE')
    INTO v_had_active_allocation;

    IF v_existing_logistics = 'SIMPLE' AND v_new_logistics = 'COMPLEX' AND v_had_active_allocation THEN
      -- Migración simple → complejo
      SELECT * INTO v_migrate_row FROM fn_migrate_to_complex(v_order_id, p_total_bags, p_assigned_by);
      v_container_code := v_migrate_row.out_new_container_code;
      v_was_migrated := TRUE;
    ELSE
      -- Sólo actualizar datos
      UPDATE orders
      SET total_bags = p_total_bags,
          total_items = p_total_items,
          total_amount = p_total_amount,
          logistics_type = v_new_logistics
      WHERE id = v_order_id;

      IF NOT v_had_active_allocation THEN
        -- Asignar si perdió la asignación
        SELECT * INTO v_assign_row FROM fn_assign_container(v_order_id, p_assigned_by);
        v_container_code := v_assign_row.out_container_code;
      ELSE
        -- Leer etiqueta actual
        SELECT sc.container_code INTO v_container_code
        FROM container_allocations ca
        JOIN storage_containers sc ON sc.id = ca.container_id
        WHERE ca.order_id = v_order_id AND ca.status = 'ACTIVE';
      END IF;
    END IF;
  END IF;

  out_order_id := v_order_id;
  out_container_code := v_container_code;
  out_was_migrated := v_was_migrated;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Helper RPC: liberar pedido por firebase_id (cuando se entrega o elimina)
CREATE OR REPLACE FUNCTION fn_release_order_by_firebase_id(
  p_firebase_id TEXT,
  p_released_by TEXT DEFAULT 'app',
  p_reason TEXT DEFAULT 'DELIVERED'
)
RETURNS VOID AS $$
DECLARE
  v_order_id BIGINT;
BEGIN
  SELECT id INTO v_order_id FROM orders WHERE firebase_id = p_firebase_id;
  IF v_order_id IS NULL THEN
    RETURN; -- Silencioso: el pedido nunca se sincronizó
  END IF;
  IF EXISTS (SELECT 1 FROM container_allocations WHERE order_id = v_order_id AND status = 'ACTIVE') THEN
    PERFORM fn_release_container(v_order_id, p_released_by, p_reason);
  END IF;
END;
$$ LANGUAGE plpgsql;
