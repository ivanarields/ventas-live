-- ============================================================================
-- Casilleros alfabéticos: exclusivos por cliente (no compartidos)
-- ============================================================================
-- Regla corregida:
--   NUMERIC (1-4): hasta 4 clientes de 1 bolsa comparten el mismo casillero
--   ALPHA (A-D):   cada cliente con 2+ bolsas ocupa un casillero EXCLUSIVO
--
-- Cambios:
--   1. fn_assign_container: ALPHA solo elige casilleros en estado AVAILABLE
--   2. fn_recalc_container_state: ALPHA con bags_used > 0 pasa directo a FULL
--   3. fn_migrate_to_complex: idem, solo AVAILABLE
--   4. Reasignación inmediata de los datos actuales
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. fn_recalc_container_state: ALPHA → AVAILABLE o FULL (nunca PARTIAL)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recalc_container_state(p_container_id BIGINT)
RETURNS VOID AS $$
DECLARE
  v_type       TEXT;
  v_simple_cur INT;
  v_simple_max INT;
  v_bags_cur   INT;
  v_blocked    BOOLEAN;
  v_new_state  TEXT;
BEGIN
  SELECT container_type, current_simple_orders, max_simple_orders,
         current_bags_used,
         state = 'BLOCKED' OR state = 'MAINTENANCE'
  INTO v_type, v_simple_cur, v_simple_max, v_bags_cur, v_blocked
  FROM storage_containers WHERE id = p_container_id;

  IF v_blocked THEN RETURN; END IF;

  IF v_type = 'NUMERIC_SHARED' THEN
    IF v_simple_cur = 0 THEN
      v_new_state := 'AVAILABLE';
    ELSIF v_simple_cur >= v_simple_max THEN
      v_new_state := 'FULL';
    ELSE
      v_new_state := 'PARTIAL';
    END IF;
  ELSE
    -- ALPHA_COMPLEX: exclusivo → en cuanto tiene algo, está FULL
    IF v_bags_cur = 0 THEN
      v_new_state := 'AVAILABLE';
    ELSE
      v_new_state := 'FULL';
    END IF;
  END IF;

  UPDATE storage_containers SET state = v_new_state WHERE id = p_container_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 2. fn_assign_container: ALPHA solo elige casilleros AVAILABLE
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_assign_container(BIGINT, TEXT);

CREATE OR REPLACE FUNCTION fn_assign_container(
  p_order_id    BIGINT,
  p_assigned_by TEXT DEFAULT 'system'
)
RETURNS TABLE (
  out_container_id   BIGINT,
  out_container_code TEXT,
  out_allocation_id  BIGINT
) AS $$
DECLARE
  v_logistics       TEXT;
  v_total_bags      INT;
  v_container_type  TEXT;
  v_allocation_type TEXT;
  v_container_id    BIGINT;
  v_container_code  TEXT;
  v_allocation_id   BIGINT;
BEGIN
  SELECT o.logistics_type, o.total_bags
  INTO v_logistics, v_total_bags
  FROM orders o WHERE o.id = p_order_id;

  IF v_logistics IS NULL THEN
    RAISE EXCEPTION 'Pedido % no existe en el sistema de etiquetas', p_order_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM container_allocations ca
    WHERE ca.order_id = p_order_id AND ca.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Pedido % ya tiene una asignación activa', p_order_id;
  END IF;

  IF v_logistics = 'SIMPLE' THEN
    v_container_type  := 'NUMERIC_SHARED';
    v_allocation_type := 'SIMPLE_SHARED';
  ELSE
    v_container_type  := 'ALPHA_COMPLEX';
    v_allocation_type := 'COMPLEX_CONTAINER';
  END IF;

  -- AUTO-REPARACIÓN: recalcular contadores antes de asignar
  UPDATE storage_containers sc SET
    current_simple_orders = (
      SELECT COUNT(*) FROM container_allocations ca
      WHERE ca.container_id = sc.id AND ca.status = 'ACTIVE'
        AND ca.allocation_type = 'SIMPLE_SHARED'
    ),
    current_bags_used = (
      SELECT COALESCE(SUM(ca.bags_reserved), 0) FROM container_allocations ca
      WHERE ca.container_id = sc.id AND ca.status = 'ACTIVE'
        AND ca.allocation_type = 'COMPLEX_CONTAINER'
    )
  WHERE sc.container_type = v_container_type;

  PERFORM fn_recalc_container_state(sc.id)
  FROM storage_containers sc
  WHERE sc.container_type = v_container_type;

  -- Elegir casillero
  IF v_container_type = 'NUMERIC_SHARED' THEN
    -- Numérico: puede ser AVAILABLE o PARTIAL (comparte hasta 4 clientes)
    SELECT sc.id, sc.container_code
    INTO v_container_id, v_container_code
    FROM storage_containers sc
    WHERE sc.container_type = 'NUMERIC_SHARED'
      AND sc.state NOT IN ('BLOCKED', 'MAINTENANCE', 'FULL')
      AND sc.current_simple_orders < sc.max_simple_orders
    ORDER BY sc.priority_order ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  ELSE
    -- Alfabético: EXCLUSIVO → solo casilleros completamente libres (AVAILABLE)
    SELECT sc.id, sc.container_code
    INTO v_container_id, v_container_code
    FROM storage_containers sc
    WHERE sc.container_type = 'ALPHA_COMPLEX'
      AND sc.state = 'AVAILABLE'
    ORDER BY sc.priority_order ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  END IF;

  IF v_container_id IS NULL THEN
    RAISE EXCEPTION 'Sin casilleros % disponibles (bolsas: %)',
      v_container_type, v_total_bags;
  END IF;

  INSERT INTO container_allocations
    (container_id, order_id, allocation_type, bags_reserved, status, assigned_by)
  VALUES
    (v_container_id, p_order_id, v_allocation_type, v_total_bags, 'ACTIVE', p_assigned_by)
  RETURNING id INTO v_allocation_id;

  IF v_container_type = 'NUMERIC_SHARED' THEN
    UPDATE storage_containers
    SET current_simple_orders = current_simple_orders + 1
    WHERE id = v_container_id;
  ELSE
    UPDATE storage_containers
    SET current_bags_used = current_bags_used + v_total_bags
    WHERE id = v_container_id;
  END IF;

  PERFORM fn_recalc_container_state(v_container_id);
  UPDATE orders SET order_status = 'READY' WHERE id = p_order_id;

  out_container_id   := v_container_id;
  out_container_code := v_container_code;
  out_allocation_id  := v_allocation_id;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 3. fn_migrate_to_complex: ALPHA solo elige AVAILABLE
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_migrate_to_complex(BIGINT, INT, TEXT);

CREATE OR REPLACE FUNCTION fn_migrate_to_complex(
  p_order_id       BIGINT,
  p_new_total_bags INT,
  p_migrated_by    TEXT DEFAULT 'system'
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
  IF p_new_total_bags < 2 THEN
    RAISE EXCEPTION 'Migración a COMPLEX requiere 2+ bolsas (recibió %)', p_new_total_bags;
  END IF;

  SELECT ca.id, ca.container_id, sc.container_code
  INTO v_old_allocation_id, v_old_container_id, v_old_container_code
  FROM container_allocations ca
  JOIN storage_containers sc ON sc.id = ca.container_id
  WHERE ca.order_id = p_order_id AND ca.status = 'ACTIVE'
  FOR UPDATE;

  IF v_old_allocation_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % no tiene asignación activa para migrar', p_order_id;
  END IF;

  -- AUTO-REPARACIÓN: recalcular contadores ALPHA
  UPDATE storage_containers sc SET
    current_bags_used = (
      SELECT COALESCE(SUM(ca.bags_reserved), 0)
      FROM container_allocations ca
      WHERE ca.container_id = sc.id AND ca.status = 'ACTIVE'
        AND ca.allocation_type = 'COMPLEX_CONTAINER'
    )
  WHERE sc.container_type = 'ALPHA_COMPLEX';

  PERFORM fn_recalc_container_state(sc.id)
  FROM storage_containers sc WHERE sc.container_type = 'ALPHA_COMPLEX';

  -- Solo casilleros AVAILABLE (exclusivo)
  SELECT sc.id, sc.container_code
  INTO v_new_container_id, v_new_container_code
  FROM storage_containers sc
  WHERE sc.container_type = 'ALPHA_COMPLEX'
    AND sc.state = 'AVAILABLE'
  ORDER BY sc.priority_order ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_new_container_id IS NULL THEN
    RAISE EXCEPTION 'Sin casilleros ALPHA_COMPLEX disponibles para % bolsas', p_new_total_bags;
  END IF;

  UPDATE orders SET logistics_type = 'COMPLEX', total_bags = p_new_total_bags WHERE id = p_order_id;

  UPDATE container_allocations
  SET status = 'MIGRATED', released_at = NOW(), released_by = p_migrated_by,
      release_reason = 'UPGRADED_TO_COMPLEX', migration_target_id = v_new_container_id
  WHERE id = v_old_allocation_id;

  UPDATE storage_containers
  SET current_simple_orders = GREATEST(current_simple_orders - 1, 0)
  WHERE id = v_old_container_id;
  PERFORM fn_recalc_container_state(v_old_container_id);

  INSERT INTO container_allocations
    (container_id, order_id, allocation_type, bags_reserved, status, assigned_by, notes)
  VALUES
    (v_new_container_id, p_order_id, 'COMPLEX_CONTAINER', p_new_total_bags,
     'ACTIVE', p_migrated_by, 'Migrado desde ' || v_old_container_code)
  RETURNING id INTO v_new_allocation_id;

  UPDATE storage_containers
  SET current_bags_used = current_bags_used + p_new_total_bags
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
-- 4. Reasignar los datos actuales con la lógica correcta
-- ----------------------------------------------------------------------------
-- Liberar todas las asignaciones activas
UPDATE container_allocations SET
  status = 'RELEASED', released_at = NOW(),
  released_by = 'reassign', release_reason = 'RULE_CORRECTION'
WHERE status = 'ACTIVE';

-- Resetear contadores
SELECT fn_rebuild_container_counters();

-- Reasignar cada pedido en "listo" con la nueva lógica
DO $$
DECLARE
  r                RECORD;
  v_order_id       BIGINT;
  v_container_code TEXT;
BEGIN
  FOR r IN
    SELECT p.id, p.bag_count
    FROM pedidos p WHERE p.status = 'listo'
    ORDER BY p.id ASC
  LOOP
    SELECT id INTO v_order_id FROM orders WHERE firebase_id = r.id::text;
    CONTINUE WHEN v_order_id IS NULL;

    UPDATE orders
    SET logistics_type = CASE WHEN r.bag_count >= 2 THEN 'COMPLEX' ELSE 'SIMPLE' END,
        total_bags     = r.bag_count,
        order_status   = 'IN_PROCESS'
    WHERE id = v_order_id;

    SELECT out_container_code INTO v_container_code
    FROM fn_assign_container(v_order_id, 'reassign');

    UPDATE pedidos SET
      label      = v_container_code,
      label_type = CASE WHEN v_container_code ~ '^\d+$' THEN 'number' ELSE 'letter' END
    WHERE id = r.id;

    RAISE NOTICE 'Pedido % (% bolsas) → %', r.id, r.bag_count, v_container_code;
  END LOOP;
END;
$$;
