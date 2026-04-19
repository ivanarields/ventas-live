-- ============================================================================
-- Reasignación correcta de etiquetas para todos los pedidos actuales en "listo"
-- ============================================================================
-- Libera las 4 asignaciones activas, corrige logistics_type según bag_count
-- real de cada pedido, y reasigna desde cero en orden de prioridad.
-- ============================================================================

DO $$
DECLARE
  r               RECORD;
  v_order_id      BIGINT;
  v_container_code TEXT;
BEGIN
  -- 1. Liberar todas las asignaciones activas actuales
  UPDATE container_allocations
  SET status        = 'RELEASED',
      released_at   = NOW(),
      released_by   = 'reassign',
      release_reason = 'LABEL_CORRECTION'
  WHERE status = 'ACTIVE';

  -- 2. Resetear contadores a cero
  PERFORM fn_rebuild_container_counters();

  -- 3. Para cada pedido en "listo", reasignar etiqueta correcta
  FOR r IN
    SELECT p.id, p.bag_count
    FROM pedidos p
    WHERE p.status = 'listo'
    ORDER BY p.id ASC   -- orden cronológico, prioridad más baja primero
  LOOP
    -- Buscar el order correspondiente por firebase_id
    SELECT id INTO v_order_id
    FROM orders
    WHERE firebase_id = r.id::text;

    -- Si no existe el order, saltar (pedido sin etiqueta previa)
    CONTINUE WHEN v_order_id IS NULL;

    -- Corregir logistics_type según las bolsas reales del pedido
    UPDATE orders
    SET logistics_type = CASE WHEN r.bag_count >= 2 THEN 'COMPLEX' ELSE 'SIMPLE' END,
        total_bags     = r.bag_count,
        order_status   = 'IN_PROCESS'   -- permitir reasignación
    WHERE id = v_order_id;

    -- Asignar casillero correcto
    SELECT out_container_code INTO v_container_code
    FROM fn_assign_container(v_order_id, 'reassign');

    -- Actualizar etiqueta en la tabla pedidos
    UPDATE pedidos
    SET label      = v_container_code,
        label_type = CASE WHEN v_container_code ~ '^\d+$' THEN 'number' ELSE 'letter' END
    WHERE id = r.id;

    RAISE NOTICE 'Pedido % (% bolsas) → etiqueta %', r.id, r.bag_count, v_container_code;
  END LOOP;
END;
$$;
