-- ============================================================================
-- V3: Restaurar downgrade cuando es el último pedido en la letra
-- ============================================================================
-- Regla corregida:
--   "Mantener en letra" solo aplica si hay OTROS pedidos activos en la misma letra.
--   Si es el ÚNICO pedido y baja a 1 bolsa → vuelve a numérico.
-- ============================================================================

DROP FUNCTION IF EXISTS fn_downgrade_to_simple(BIGINT, TEXT);

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
  v_old_allocation_id    BIGINT;
  v_old_container_id     BIGINT;
  v_old_container_code   TEXT;
  v_old_bags_reserved    INT;
  v_customer_id          BIGINT;
  v_new_container_id     BIGINT;
  v_new_container_code   TEXT;
  v_new_allocation_id    BIGINT;
  v_has_other_orders     BOOLEAN;
BEGIN
  SELECT ca.id, ca.container_id, sc.container_code, ca.bags_reserved, o.customer_id
  INTO v_old_allocation_id, v_old_container_id, v_old_container_code, v_old_bags_reserved, v_customer_id
  FROM container_allocations ca
  JOIN storage_containers sc ON sc.id = ca.container_id
  JOIN orders o ON o.id = ca.order_id
  WHERE ca.order_id = p_order_id AND ca.status = 'ACTIVE'
  FOR UPDATE;

  IF v_old_allocation_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % no tiene asignación activa para degradar', p_order_id;
  END IF;

  -- ¿El cliente tiene otros pedidos activos en esta misma letra?
  SELECT EXISTS(
    SELECT 1
    FROM container_allocations ca
    JOIN orders o2 ON o2.id = ca.order_id
    WHERE ca.container_id = v_old_container_id
      AND ca.status = 'ACTIVE'
      AND ca.id != v_old_allocation_id
      AND o2.customer_id = v_customer_id
  ) INTO v_has_other_orders;

  IF v_has_other_orders THEN
    -- Tiene otros pedidos: se queda en la letra, solo reduce bolsas
    UPDATE orders SET logistics_type = 'SIMPLE', total_bags = 1 WHERE id = p_order_id;

    UPDATE container_allocations SET bags_reserved = 1 WHERE id = v_old_allocation_id;

    UPDATE storage_containers
    SET current_bags_used = GREATEST(current_bags_used - (v_old_bags_reserved - 1), 0)
    WHERE id = v_old_container_id;
    PERFORM fn_recalc_container_state(v_old_container_id);

    out_new_container_id   := v_old_container_id;
    out_new_container_code := v_old_container_code;
    out_new_allocation_id  := v_old_allocation_id;
    out_old_container_code := v_old_container_code;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Es el ÚNICO pedido en esta letra → mover a numérico

  -- AUTO-REPARACIÓN numéricos
  UPDATE storage_containers sc SET
    current_simple_orders = (
      SELECT COUNT(*) FROM container_allocations ca
      WHERE ca.container_id = sc.id AND ca.status = 'ACTIVE'
        AND ca.allocation_type = 'SIMPLE_SHARED'
    )
  WHERE sc.container_type = 'NUMERIC_SHARED';

  PERFORM fn_recalc_container_state(sc.id)
  FROM storage_containers sc WHERE sc.container_type = 'NUMERIC_SHARED';

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

  UPDATE orders SET logistics_type = 'SIMPLE', total_bags = 1 WHERE id = p_order_id;

  UPDATE container_allocations
  SET status        = 'MIGRATED',
      released_at   = NOW(),
      released_by   = p_migrated_by,
      release_reason = 'DOWNGRADED_TO_SIMPLE',
      migration_target_id = v_new_container_id
  WHERE id = v_old_allocation_id;

  UPDATE storage_containers
  SET current_bags_used = GREATEST(current_bags_used - v_old_bags_reserved, 0)
  WHERE id = v_old_container_id;
  PERFORM fn_recalc_container_state(v_old_container_id);

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

SELECT fn_rebuild_container_counters();
