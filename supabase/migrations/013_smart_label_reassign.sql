-- ============================================================================
-- Etiquetas inteligentes: reasignación automática en todos los sentidos
-- ============================================================================
-- Añade el camino inverso: COMPLEX → SIMPLE (letra → número)
-- cuando el operador reduce las bolsas a 1.
--
-- Tabla completa de transiciones:
--   SIMPLE  → SIMPLE  : mantiene casillero numérico (sin cambio de tipo)
--   SIMPLE  → COMPLEX : fn_migrate_to_complex (libera numérico, asigna letra)
--   COMPLEX → COMPLEX : mantiene casillero letra (exclusivo, solo actualiza bags)
--   COMPLEX → SIMPLE  : fn_downgrade_to_simple (libera letra, asigna numérico) ← NUEVO
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_downgrade_to_simple: libera casillero letra y asigna casillero numérico
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_downgrade_to_simple(
  p_order_id    BIGINT,
  p_migrated_by TEXT DEFAULT 'system'
)
RETURNS TABLE (
  out_new_container_id   BIGINT,
  out_new_container_code TEXT,
  out_new_allocation_id  BIGINT,
  out_old_container_code TEXT
) AS $$
DECLARE
  v_old_allocation_id  BIGINT;
  v_old_container_id   BIGINT;
  v_old_container_code TEXT;
  v_new_container_id   BIGINT;
  v_new_container_code TEXT;
  v_new_allocation_id  BIGINT;
BEGIN
  -- Leer asignación activa actual (letra)
  SELECT ca.id, ca.container_id, sc.container_code
  INTO v_old_allocation_id, v_old_container_id, v_old_container_code
  FROM container_allocations ca
  JOIN storage_containers sc ON sc.id = ca.container_id
  WHERE ca.order_id = p_order_id AND ca.status = 'ACTIVE'
  FOR UPDATE;

  IF v_old_allocation_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % no tiene asignación activa para degradar', p_order_id;
  END IF;

  -- AUTO-REPARACIÓN: recalcular contadores numéricos
  UPDATE storage_containers sc SET
    current_simple_orders = (
      SELECT COUNT(*) FROM container_allocations ca
      WHERE ca.container_id = sc.id AND ca.status = 'ACTIVE'
        AND ca.allocation_type = 'SIMPLE_SHARED'
    )
  WHERE sc.container_type = 'NUMERIC_SHARED';

  PERFORM fn_recalc_container_state(sc.id)
  FROM storage_containers sc WHERE sc.container_type = 'NUMERIC_SHARED';

  -- Buscar casillero numérico con espacio disponible
  SELECT sc.id, sc.container_code
  INTO v_new_container_id, v_new_container_code
  FROM storage_containers sc
  WHERE sc.container_type = 'NUMERIC_SHARED'
    AND sc.state NOT IN ('BLOCKED', 'MAINTENANCE', 'FULL')
    AND sc.current_simple_orders < sc.max_simple_orders
  ORDER BY sc.priority_order ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_new_container_id IS NULL THEN
    RAISE EXCEPTION 'Sin casilleros numéricos disponibles';
  END IF;

  -- Actualizar pedido a SIMPLE
  UPDATE orders SET logistics_type = 'SIMPLE', total_bags = 1 WHERE id = p_order_id;

  -- Cerrar asignación anterior (letra) como MIGRATED
  UPDATE container_allocations
  SET status        = 'MIGRATED',
      released_at   = NOW(),
      released_by   = p_migrated_by,
      release_reason = 'DOWNGRADED_TO_SIMPLE',
      migration_target_id = v_new_container_id
  WHERE id = v_old_allocation_id;

  -- Liberar contador del casillero letra
  UPDATE storage_containers
  SET current_bags_used = GREATEST(current_bags_used - (
    SELECT bags_reserved FROM container_allocations WHERE id = v_old_allocation_id
  ), 0)
  WHERE id = v_old_container_id;
  PERFORM fn_recalc_container_state(v_old_container_id);

  -- Crear nueva asignación en casillero numérico
  INSERT INTO container_allocations
    (container_id, order_id, allocation_type, bags_reserved, status, assigned_by, notes)
  VALUES
    (v_new_container_id, p_order_id, 'SIMPLE_SHARED', 1,
     'ACTIVE', p_migrated_by, 'Degradado desde ' || v_old_container_code)
  RETURNING id INTO v_new_allocation_id;

  UPDATE storage_containers
  SET current_simple_orders = current_simple_orders + 1
  WHERE id = v_new_container_id;
  PERFORM fn_recalc_container_state(v_new_container_id);

  out_new_container_id   := v_new_container_id;
  out_new_container_code := v_new_container_code;
  out_new_allocation_id  := v_new_allocation_id;
  out_old_container_code := v_old_container_code;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- fn_upsert_order_and_assign: ahora maneja los 4 casos de transición
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_upsert_order_and_assign(
  p_firebase_id  TEXT,
  p_customer_id  BIGINT,
  p_total_bags   INT,
  p_total_items  INT     DEFAULT 0,
  p_total_amount NUMERIC DEFAULT 0,
  p_assigned_by  TEXT    DEFAULT 'app'
)
RETURNS TABLE (
  out_order_id       BIGINT,
  out_container_code TEXT,
  out_was_migrated   BOOLEAN
) AS $$
DECLARE
  v_order_id            BIGINT;
  v_existing_bags       INT;
  v_existing_logistics  TEXT;
  v_had_active          BOOLEAN;
  v_new_logistics       TEXT;
  v_container_code      TEXT;
  v_was_migrated        BOOLEAN := FALSE;
  v_assign_row          RECORD;
  v_migrate_row         RECORD;
  v_downgrade_row       RECORD;
BEGIN
  v_new_logistics := CASE WHEN p_total_bags >= 2 THEN 'COMPLEX' ELSE 'SIMPLE' END;

  SELECT o.id, o.total_bags, o.logistics_type
  INTO v_order_id, v_existing_bags, v_existing_logistics
  FROM orders o WHERE o.firebase_id = p_firebase_id;

  -- ── Pedido nuevo ──────────────────────────────────────────────────────────
  IF v_order_id IS NULL THEN
    INSERT INTO orders (firebase_id, customer_id, order_code, logistics_type,
                        total_bags, total_items, total_amount, order_status)
    VALUES (p_firebase_id, p_customer_id, 'ORD-' || p_firebase_id,
            v_new_logistics, p_total_bags, p_total_items, p_total_amount, 'IN_PROCESS')
    RETURNING id INTO v_order_id;

    SELECT * INTO v_assign_row FROM fn_assign_container(v_order_id, p_assigned_by);
    v_container_code := v_assign_row.out_container_code;

  -- ── Pedido existente ──────────────────────────────────────────────────────
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM container_allocations WHERE order_id = v_order_id AND status = 'ACTIVE'
    ) INTO v_had_active;

    -- Caso 1: SIMPLE → COMPLEX (1 bolsa → 2+ bolsas)
    IF v_existing_logistics = 'SIMPLE' AND v_new_logistics = 'COMPLEX' AND v_had_active THEN
      SELECT * INTO v_migrate_row FROM fn_migrate_to_complex(v_order_id, p_total_bags, p_assigned_by);
      v_container_code := v_migrate_row.out_new_container_code;
      v_was_migrated   := TRUE;

    -- Caso 2: COMPLEX → SIMPLE (2+ bolsas → 1 bolsa)
    ELSIF v_existing_logistics = 'COMPLEX' AND v_new_logistics = 'SIMPLE' AND v_had_active THEN
      SELECT * INTO v_downgrade_row FROM fn_downgrade_to_simple(v_order_id, p_assigned_by);
      v_container_code := v_downgrade_row.out_new_container_code;
      v_was_migrated   := TRUE;
      -- Actualizar también bags en orders
      UPDATE orders SET total_bags = p_total_bags, total_items = p_total_items,
                        total_amount = p_total_amount WHERE id = v_order_id;

    -- Caso 3: mismo tipo (SIMPLE→SIMPLE o COMPLEX→COMPLEX) con asignación activa
    ELSIF v_had_active THEN
      UPDATE orders SET total_bags = p_total_bags, total_items = p_total_items,
                        total_amount = p_total_amount, logistics_type = v_new_logistics
      WHERE id = v_order_id;
      -- Actualizar bags_reserved si es COMPLEX (puede haber cambiado el nº de bolsas)
      IF v_new_logistics = 'COMPLEX' THEN
        UPDATE container_allocations SET bags_reserved = p_total_bags
        WHERE order_id = v_order_id AND status = 'ACTIVE';
      END IF;
      SELECT sc.container_code INTO v_container_code
      FROM container_allocations ca
      JOIN storage_containers sc ON sc.id = ca.container_id
      WHERE ca.order_id = v_order_id AND ca.status = 'ACTIVE';

    -- Caso 4: sin asignación activa → asignar desde cero
    ELSE
      UPDATE orders SET total_bags = p_total_bags, total_items = p_total_items,
                        total_amount = p_total_amount, logistics_type = v_new_logistics,
                        order_status = 'IN_PROCESS'
      WHERE id = v_order_id;
      SELECT * INTO v_assign_row FROM fn_assign_container(v_order_id, p_assigned_by);
      v_container_code := v_assign_row.out_container_code;
    END IF;
  END IF;

  out_order_id       := v_order_id;
  out_container_code := v_container_code;
  out_was_migrated   := v_was_migrated;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Corregir Laura Herrera ahora mismo (tenía 2 bolsas → cambió a 1)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_order_id       BIGINT;
  v_container_code TEXT;
BEGIN
  -- Buscar su order en el sistema de etiquetas
  SELECT id INTO v_order_id FROM orders
  WHERE firebase_id = (
    SELECT id::text FROM pedidos WHERE customer_name = 'LAURA HERRERA' LIMIT 1
  );

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Laura Herrera no encontrada en orders';
    RETURN;
  END IF;

  -- Forzar downgrade a SIMPLE
  SELECT out_new_container_code INTO v_container_code
  FROM fn_downgrade_to_simple(v_order_id, 'correction');

  -- Actualizar etiqueta en pedidos
  UPDATE pedidos SET label = v_container_code, label_type = 'number'
  WHERE customer_name = 'LAURA HERRERA';

  RAISE NOTICE 'Laura Herrera → etiqueta corregida a %', v_container_code;
END;
$$;
