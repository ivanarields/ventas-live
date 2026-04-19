-- ============================================================================
-- Auto-reparación del sistema de etiquetas
-- ============================================================================
-- Problema raíz: los contadores en storage_containers pueden desincronizarse
-- si un pedido se elimina sin liberar su asignación, o si ocurre un error
-- de red entre el backend y la base de datos.
--
-- Solución: fn_assign_container y fn_migrate_to_complex recalculan los
-- contadores DESDE las asignaciones reales antes de cada operación.
-- Resultado: ningún desajuste puede sobrevivir a la siguiente asignación.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_rebuild_container_counters: reparación manual bajo demanda
-- Recalcula current_simple_orders y current_bags_used desde container_allocations.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_rebuild_container_counters()
RETURNS VOID AS $$
BEGIN
  UPDATE storage_containers sc SET
    current_simple_orders = (
      SELECT COUNT(*)
      FROM container_allocations ca
      WHERE ca.container_id = sc.id
        AND ca.status = 'ACTIVE'
        AND ca.allocation_type = 'SIMPLE_SHARED'
    ),
    current_bags_used = (
      SELECT COALESCE(SUM(ca.bags_reserved), 0)
      FROM container_allocations ca
      WHERE ca.container_id = sc.id
        AND ca.status = 'ACTIVE'
        AND ca.allocation_type = 'COMPLEX_CONTAINER'
    );

  -- Recalcular estado (AVAILABLE / PARTIAL / FULL) para todos los casilleros
  PERFORM fn_recalc_container_state(sc.id) FROM storage_containers sc;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- fn_assign_container: versión con auto-reparación
-- Recalcula contadores del tipo relevante antes de elegir casillero.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_assign_container(BIGINT, TEXT);

CREATE OR REPLACE FUNCTION fn_assign_container(
  p_order_id   BIGINT,
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
  -- 1. Leer logística del pedido
  SELECT o.logistics_type, o.total_bags
  INTO v_logistics, v_total_bags
  FROM orders o WHERE o.id = p_order_id;

  IF v_logistics IS NULL THEN
    RAISE EXCEPTION 'Pedido % no existe en el sistema de etiquetas', p_order_id;
  END IF;

  -- 2. No asignar si ya tiene asignación activa
  IF EXISTS (
    SELECT 1 FROM container_allocations ca
    WHERE ca.order_id = p_order_id AND ca.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Pedido % ya tiene una asignación activa', p_order_id;
  END IF;

  -- 3. Elegir tipo
  IF v_logistics = 'SIMPLE' THEN
    v_container_type  := 'NUMERIC_SHARED';
    v_allocation_type := 'SIMPLE_SHARED';
  ELSE
    v_container_type  := 'ALPHA_COMPLEX';
    v_allocation_type := 'COMPLEX_CONTAINER';
  END IF;

  -- 4. AUTO-REPARACIÓN: recalcular contadores desde asignaciones reales
  --    Esto garantiza que cualquier desajuste previo se corrija antes de asignar.
  UPDATE storage_containers sc SET
    current_simple_orders = (
      SELECT COUNT(*)
      FROM container_allocations ca
      WHERE ca.container_id = sc.id
        AND ca.status = 'ACTIVE'
        AND ca.allocation_type = 'SIMPLE_SHARED'
    ),
    current_bags_used = (
      SELECT COALESCE(SUM(ca.bags_reserved), 0)
      FROM container_allocations ca
      WHERE ca.container_id = sc.id
        AND ca.status = 'ACTIVE'
        AND ca.allocation_type = 'COMPLEX_CONTAINER'
    )
  WHERE sc.container_type = v_container_type;

  -- Recalcular estados para este tipo
  PERFORM fn_recalc_container_state(sc.id)
  FROM storage_containers sc
  WHERE sc.container_type = v_container_type;

  -- 5. Elegir y lockear el casillero con menor prioridad y capacidad disponible
  IF v_container_type = 'NUMERIC_SHARED' THEN
    SELECT sc.id, sc.container_code
    INTO v_container_id, v_container_code
    FROM storage_containers sc
    WHERE sc.container_type = 'NUMERIC_SHARED'
      AND sc.state NOT IN ('BLOCKED', 'MAINTENANCE')
      AND sc.current_simple_orders < sc.max_simple_orders
    ORDER BY sc.priority_order ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  ELSE
    SELECT sc.id, sc.container_code
    INTO v_container_id, v_container_code
    FROM storage_containers sc
    WHERE sc.container_type = 'ALPHA_COMPLEX'
      AND sc.state NOT IN ('BLOCKED', 'MAINTENANCE')
      AND (sc.current_bags_used + v_total_bags) <= sc.max_bags_capacity
    ORDER BY sc.priority_order ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  END IF;

  IF v_container_id IS NULL THEN
    RAISE EXCEPTION 'Sin casilleros % disponibles (tipo: %, bolsas requeridas: %)',
      v_container_type, v_logistics, v_total_bags;
  END IF;

  -- 6. Crear asignación activa
  INSERT INTO container_allocations
    (container_id, order_id, allocation_type, bags_reserved, status, assigned_by)
  VALUES
    (v_container_id, p_order_id, v_allocation_type, v_total_bags, 'ACTIVE', p_assigned_by)
  RETURNING id INTO v_allocation_id;

  -- 7. Actualizar contador del casillero elegido
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
-- fn_migrate_to_complex: versión con auto-reparación de contadores ALPHA
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

  -- Buscar asignación activa actual
  SELECT ca.id, ca.container_id, sc.container_code
  INTO v_old_allocation_id, v_old_container_id, v_old_container_code
  FROM container_allocations ca
  JOIN storage_containers sc ON sc.id = ca.container_id
  WHERE ca.order_id = p_order_id AND ca.status = 'ACTIVE'
  FOR UPDATE;

  IF v_old_allocation_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % no tiene asignación activa para migrar', p_order_id;
  END IF;

  -- AUTO-REPARACIÓN: recalcular contadores ALPHA antes de buscar nuevo casillero
  UPDATE storage_containers sc SET
    current_bags_used = (
      SELECT COALESCE(SUM(ca.bags_reserved), 0)
      FROM container_allocations ca
      WHERE ca.container_id = sc.id
        AND ca.status = 'ACTIVE'
        AND ca.allocation_type = 'COMPLEX_CONTAINER'
    )
  WHERE sc.container_type = 'ALPHA_COMPLEX';

  PERFORM fn_recalc_container_state(sc.id)
  FROM storage_containers sc
  WHERE sc.container_type = 'ALPHA_COMPLEX';

  -- Buscar casillero alfabético con capacidad
  SELECT sc.id, sc.container_code
  INTO v_new_container_id, v_new_container_code
  FROM storage_containers sc
  WHERE sc.container_type = 'ALPHA_COMPLEX'
    AND sc.state NOT IN ('BLOCKED', 'MAINTENANCE')
    AND (sc.current_bags_used + p_new_total_bags) <= sc.max_bags_capacity
  ORDER BY sc.priority_order ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_new_container_id IS NULL THEN
    RAISE EXCEPTION 'Sin casilleros ALPHA_COMPLEX con capacidad para % bolsas', p_new_total_bags;
  END IF;

  -- Actualizar pedido
  UPDATE orders SET logistics_type = 'COMPLEX', total_bags = p_new_total_bags WHERE id = p_order_id;

  -- Cerrar asignación anterior (MIGRATED)
  UPDATE container_allocations
  SET status = 'MIGRATED',
      released_at = NOW(),
      released_by = p_migrated_by,
      release_reason = 'UPGRADED_TO_COMPLEX',
      migration_target_id = v_new_container_id
  WHERE id = v_old_allocation_id;

  -- Liberar contador del casillero anterior
  UPDATE storage_containers
  SET current_simple_orders = GREATEST(current_simple_orders - 1, 0)
  WHERE id = v_old_container_id;
  PERFORM fn_recalc_container_state(v_old_container_id);

  -- Crear asignación en casillero alfabético
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
-- Reparar el estado actual inmediatamente al aplicar esta migración
-- ----------------------------------------------------------------------------
SELECT fn_rebuild_container_counters();
