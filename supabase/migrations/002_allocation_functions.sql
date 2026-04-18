-- ============================================================================
-- Funciones transaccionales de asignación de casilleros
-- ============================================================================
-- Toda la lógica crítica vive acá, dentro de PostgreSQL, para garantizar
-- atomicidad con FOR UPDATE SKIP LOCKED. El backend sólo llama a estas RPC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Recalcula estado de un contenedor (AVAILABLE / PARTIAL / FULL)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recalc_container_state(p_container_id BIGINT)
RETURNS VOID AS $$
DECLARE
  v_type TEXT;
  v_simple_cur INT;
  v_simple_max INT;
  v_bags_cur INT;
  v_bags_max INT;
  v_new_state TEXT;
  v_blocked BOOLEAN;
BEGIN
  SELECT container_type, current_simple_orders, max_simple_orders,
         current_bags_used, max_bags_capacity,
         state = 'BLOCKED' OR state = 'MAINTENANCE'
  INTO v_type, v_simple_cur, v_simple_max, v_bags_cur, v_bags_max, v_blocked
  FROM storage_containers
  WHERE id = p_container_id;

  -- No tocar contenedores bloqueados o en mantenimiento
  IF v_blocked THEN
    RETURN;
  END IF;

  IF v_type = 'NUMERIC_SHARED' THEN
    IF v_simple_cur = 0 THEN
      v_new_state := 'AVAILABLE';
    ELSIF v_simple_cur >= v_simple_max THEN
      v_new_state := 'FULL';
    ELSE
      v_new_state := 'PARTIAL';
    END IF;
  ELSE -- ALPHA_COMPLEX
    IF v_bags_cur = 0 THEN
      v_new_state := 'AVAILABLE';
    ELSIF v_bags_cur >= v_bags_max THEN
      v_new_state := 'FULL';
    ELSE
      v_new_state := 'PARTIAL';
    END IF;
  END IF;

  UPDATE storage_containers SET state = v_new_state WHERE id = p_container_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Asigna un contenedor nuevo para un pedido (SIMPLE o COMPLEX)
-- ----------------------------------------------------------------------------
-- Retorna fila con container_id, container_code y allocation_id
-- Lanza EXCEPTION si no hay capacidad disponible
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_assign_container(
  p_order_id BIGINT,
  p_assigned_by TEXT DEFAULT 'system'
)
RETURNS TABLE (
  container_id BIGINT,
  container_code TEXT,
  allocation_id BIGINT
) AS $$
DECLARE
  v_logistics TEXT;
  v_total_bags INT;
  v_container_type TEXT;
  v_container_id BIGINT;
  v_container_code TEXT;
  v_allocation_id BIGINT;
  v_allocation_type TEXT;
BEGIN
  -- 1. Leer datos del pedido
  SELECT logistics_type, total_bags
  INTO v_logistics, v_total_bags
  FROM orders WHERE id = p_order_id;

  IF v_logistics IS NULL THEN
    RAISE EXCEPTION 'Pedido % no existe', p_order_id;
  END IF;

  -- 2. Verificar que no haya asignación activa previa
  IF EXISTS (SELECT 1 FROM container_allocations WHERE order_id = p_order_id AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Pedido % ya tiene una asignación activa', p_order_id;
  END IF;

  -- 3. Elegir tipo de contenedor según logística
  IF v_logistics = 'SIMPLE' THEN
    v_container_type := 'NUMERIC_SHARED';
    v_allocation_type := 'SIMPLE_SHARED';
  ELSE
    v_container_type := 'ALPHA_COMPLEX';
    v_allocation_type := 'COMPLEX_CONTAINER';
  END IF;

  -- 4. Buscar y lockear el mejor candidato
  IF v_container_type = 'NUMERIC_SHARED' THEN
    SELECT id, container_code INTO v_container_id, v_container_code
    FROM storage_containers
    WHERE container_type = 'NUMERIC_SHARED'
      AND state IN ('AVAILABLE', 'PARTIAL')
      AND current_simple_orders < max_simple_orders
    ORDER BY priority_order ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  ELSE
    SELECT id, container_code INTO v_container_id, v_container_code
    FROM storage_containers
    WHERE container_type = 'ALPHA_COMPLEX'
      AND state IN ('AVAILABLE', 'PARTIAL')
      AND (current_bags_used + v_total_bags) <= max_bags_capacity
    ORDER BY priority_order ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  END IF;

  IF v_container_id IS NULL THEN
    RAISE EXCEPTION 'Sin casilleros % disponibles', v_container_type;
  END IF;

  -- 5. Crear asignación activa
  INSERT INTO container_allocations
    (container_id, order_id, allocation_type, bags_reserved, status, assigned_by)
  VALUES
    (v_container_id, p_order_id, v_allocation_type, v_total_bags, 'ACTIVE', p_assigned_by)
  RETURNING id INTO v_allocation_id;

  -- 6. Actualizar ocupación del contenedor
  IF v_container_type = 'NUMERIC_SHARED' THEN
    UPDATE storage_containers
    SET current_simple_orders = current_simple_orders + 1
    WHERE id = v_container_id;
  ELSE
    UPDATE storage_containers
    SET current_bags_used = current_bags_used + v_total_bags
    WHERE id = v_container_id;
  END IF;

  -- 7. Recalcular estado
  PERFORM fn_recalc_container_state(v_container_id);

  -- 8. Actualizar estado del pedido a READY
  UPDATE orders SET order_status = 'READY' WHERE id = p_order_id;

  RETURN QUERY SELECT v_container_id, v_container_code, v_allocation_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Migra un pedido SIMPLE → COMPLEX (cuando agrega 2da bolsa)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_migrate_to_complex(
  p_order_id BIGINT,
  p_new_total_bags INT,
  p_migrated_by TEXT DEFAULT 'system'
)
RETURNS TABLE (
  new_container_id BIGINT,
  new_container_code TEXT,
  new_allocation_id BIGINT,
  old_container_code TEXT
) AS $$
DECLARE
  v_old_allocation_id BIGINT;
  v_old_container_id BIGINT;
  v_old_container_code TEXT;
  v_new_container_id BIGINT;
  v_new_container_code TEXT;
  v_new_allocation_id BIGINT;
BEGIN
  -- 1. Validar cambio
  IF p_new_total_bags < 2 THEN
    RAISE EXCEPTION 'Migración a COMPLEX requiere 2+ bolsas (recibió %)', p_new_total_bags;
  END IF;

  -- 2. Buscar asignación activa actual
  SELECT ca.id, ca.container_id, sc.container_code
  INTO v_old_allocation_id, v_old_container_id, v_old_container_code
  FROM container_allocations ca
  JOIN storage_containers sc ON sc.id = ca.container_id
  WHERE ca.order_id = p_order_id AND ca.status = 'ACTIVE'
  FOR UPDATE;

  IF v_old_allocation_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % no tiene asignación activa para migrar', p_order_id;
  END IF;

  -- 3. Buscar casillero alfabético con capacidad
  SELECT id, container_code INTO v_new_container_id, v_new_container_code
  FROM storage_containers
  WHERE container_type = 'ALPHA_COMPLEX'
    AND state IN ('AVAILABLE', 'PARTIAL')
    AND (current_bags_used + p_new_total_bags) <= max_bags_capacity
  ORDER BY priority_order ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_new_container_id IS NULL THEN
    RAISE EXCEPTION 'Sin casilleros ALPHA_COMPLEX con capacidad para % bolsas', p_new_total_bags;
  END IF;

  -- 4. Actualizar pedido
  UPDATE orders
  SET logistics_type = 'COMPLEX', total_bags = p_new_total_bags
  WHERE id = p_order_id;

  -- 5. Cerrar asignación anterior (MIGRATED)
  UPDATE container_allocations
  SET status = 'MIGRATED',
      released_at = NOW(),
      released_by = p_migrated_by,
      release_reason = 'UPGRADED_TO_COMPLEX',
      migration_target_id = v_new_container_id
  WHERE id = v_old_allocation_id;

  -- 6. Liberar capacidad del contenedor anterior (numérico)
  UPDATE storage_containers
  SET current_simple_orders = GREATEST(current_simple_orders - 1, 0)
  WHERE id = v_old_container_id;
  PERFORM fn_recalc_container_state(v_old_container_id);

  -- 7. Crear nueva asignación en contenedor alfabético
  INSERT INTO container_allocations
    (container_id, order_id, allocation_type, bags_reserved, status, assigned_by, notes)
  VALUES
    (v_new_container_id, p_order_id, 'COMPLEX_CONTAINER', p_new_total_bags,
     'ACTIVE', p_migrated_by, 'Migrado desde ' || v_old_container_code)
  RETURNING id INTO v_new_allocation_id;

  -- 8. Incrementar capacidad del nuevo contenedor
  UPDATE storage_containers
  SET current_bags_used = current_bags_used + p_new_total_bags
  WHERE id = v_new_container_id;
  PERFORM fn_recalc_container_state(v_new_container_id);

  RETURN QUERY SELECT v_new_container_id, v_new_container_code, v_new_allocation_id, v_old_container_code;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Libera un casillero cuando se entrega el pedido
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_release_container(
  p_order_id BIGINT,
  p_released_by TEXT DEFAULT 'system',
  p_reason TEXT DEFAULT 'DELIVERED'
)
RETURNS VOID AS $$
DECLARE
  v_allocation_id BIGINT;
  v_container_id BIGINT;
  v_allocation_type TEXT;
  v_bags_reserved INT;
BEGIN
  SELECT id, container_id, allocation_type, bags_reserved
  INTO v_allocation_id, v_container_id, v_allocation_type, v_bags_reserved
  FROM container_allocations
  WHERE order_id = p_order_id AND status = 'ACTIVE'
  FOR UPDATE;

  IF v_allocation_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % no tiene asignación activa para liberar', p_order_id;
  END IF;

  UPDATE container_allocations
  SET status = 'RELEASED',
      released_at = NOW(),
      released_by = p_released_by,
      release_reason = p_reason
  WHERE id = v_allocation_id;

  IF v_allocation_type = 'SIMPLE_SHARED' THEN
    UPDATE storage_containers
    SET current_simple_orders = GREATEST(current_simple_orders - 1, 0)
    WHERE id = v_container_id;
  ELSE
    UPDATE storage_containers
    SET current_bags_used = GREATEST(current_bags_used - v_bags_reserved, 0)
    WHERE id = v_container_id;
  END IF;

  PERFORM fn_recalc_container_state(v_container_id);

  UPDATE orders SET order_status = 'DELIVERED' WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;
