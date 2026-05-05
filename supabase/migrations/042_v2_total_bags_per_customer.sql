-- ============================================================================
-- V2: Asignación por total de bolsas de la clienta + 20 bolsas máx + no degradar
-- ============================================================================
-- Cambios:
--   1. fn_assign_container: decide alpha/numérico por TOTAL de bolsas activas
--      de la clienta (1 = numérico, 2+ = letra). Sin importar el tipo del pedido.
--   2. fn_upsert_order_and_assign: al asignar letra, mueve pedidos numéricos
--      viejos de la misma clienta a esa letra.
--   3. fn_downgrade_to_simple: nunca degrada a numérico. Se mantiene en letra.
--   4. Capacidad de letras: de 12 a 20 bolsas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTE 1: Capacidad de letras de 12 → 20
-- ----------------------------------------------------------------------------
UPDATE storage_containers SET max_bags_capacity = 20 WHERE container_type = 'ALPHA_COMPLEX';

-- ----------------------------------------------------------------------------
-- PARTE 2: fn_assign_container — decidir por total de bolsas de la clienta
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
  v_logistics           TEXT;
  v_total_bags          INT;
  v_customer_id         BIGINT;
  v_container_type      TEXT;
  v_allocation_type     TEXT;
  v_container_id        BIGINT;
  v_container_code      TEXT;
  v_allocation_id       BIGINT;
  v_existing_alpha_id     BIGINT;
  v_existing_alpha_code   TEXT;
  v_existing_alpha_bags   INT;
  v_existing_alpha_max    INT;
  v_customer_active_bags  INT;
  v_total_after           INT;
BEGIN
  SELECT o.logistics_type, o.total_bags, o.customer_id
  INTO v_logistics, v_total_bags, v_customer_id
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

  -- NUEVO: contar cuántas bolsas activas tiene la clienta YA (sin contar este pedido)
  SELECT COALESCE(SUM(ca.bags_reserved), 0)
  INTO v_customer_active_bags
  FROM container_allocations ca
  JOIN orders o2 ON o2.id = ca.order_id
  WHERE o2.customer_id = v_customer_id AND ca.status = 'ACTIVE';

  -- Total que tendrá después de agregar este pedido
  v_total_after := v_customer_active_bags + v_total_bags;

  -- ¿La clienta ya tiene letra por otro pedido?
  SELECT sc.id, sc.container_code, sc.current_bags_used, sc.max_bags_capacity
  INTO v_existing_alpha_id, v_existing_alpha_code, v_existing_alpha_bags, v_existing_alpha_max
  FROM storage_containers sc
  WHERE sc.container_type = 'ALPHA_COMPLEX'
    AND sc.id IN (
      SELECT DISTINCT ca.container_id
      FROM container_allocations ca
      JOIN orders o2 ON o2.id = ca.order_id
      WHERE o2.customer_id = v_customer_id
        AND ca.status = 'ACTIVE'
    )
  ORDER BY sc.priority_order ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_existing_alpha_id IS NOT NULL THEN
    -- Ya tiene letra: agrupar este pedido ahí
    IF (v_existing_alpha_bags + v_total_bags) > v_existing_alpha_max THEN
      RAISE EXCEPTION 'Casillero % lleno (%/%). No puede agregar más bolsas.',
        v_existing_alpha_code, v_existing_alpha_bags, v_existing_alpha_max;
    END IF;

    v_container_type  := 'ALPHA_COMPLEX';
    v_allocation_type := 'COMPLEX_CONTAINER';
    v_container_id    := v_existing_alpha_id;
    v_container_code  := v_existing_alpha_code;

  ELSIF v_total_after >= 2 THEN
    -- Sin letra previa pero el total de bolsas es 2+: necesita letra
    v_container_type  := 'ALPHA_COMPLEX';
    v_allocation_type := 'COMPLEX_CONTAINER';

    -- AUTO-REPARACIÓN alpha
    UPDATE storage_containers sc SET
      current_bags_used = (
        SELECT COALESCE(SUM(ca.bags_reserved), 0) FROM container_allocations ca
        WHERE ca.container_id = sc.id AND ca.status = 'ACTIVE'
          AND ca.allocation_type = 'COMPLEX_CONTAINER'
      )
    WHERE sc.container_type = 'ALPHA_COMPLEX';

    PERFORM fn_recalc_container_state(sc.id)
    FROM storage_containers sc WHERE sc.container_type = 'ALPHA_COMPLEX';

    -- Buscar letra disponible
    SELECT sc.id, sc.container_code
    INTO v_container_id, v_container_code
    FROM storage_containers sc
    WHERE sc.container_type = 'ALPHA_COMPLEX'
      AND sc.state = 'AVAILABLE'
    ORDER BY sc.priority_order ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_container_id IS NULL THEN
      RAISE EXCEPTION 'Sin casilleros alfabéticos disponibles (necesita % bolsas)', v_total_bags;
    END IF;

  ELSE
    -- Total = 1 bolsa: va a numérico
    v_container_type  := 'NUMERIC_SHARED';
    v_allocation_type := 'SIMPLE_SHARED';

    -- AUTO-REPARACIÓN numérica
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
    WHERE sc.container_type = 'NUMERIC_SHARED';

    PERFORM fn_recalc_container_state(sc.id)
    FROM storage_containers sc WHERE sc.container_type = 'NUMERIC_SHARED';

    SELECT sc.id, sc.container_code
    INTO v_container_id, v_container_code
    FROM storage_containers sc
    WHERE sc.container_type = 'NUMERIC_SHARED'
      AND sc.state NOT IN ('BLOCKED', 'MAINTENANCE', 'FULL')
      AND sc.current_simple_orders < sc.max_simple_orders
    ORDER BY sc.priority_order ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_container_id IS NULL THEN
      RAISE EXCEPTION 'Sin casilleros numéricos disponibles';
    END IF;
  END IF;

  -- Crear asignación activa
  INSERT INTO container_allocations
    (container_id, order_id, allocation_type, bags_reserved, status, assigned_by)
  VALUES
    (v_container_id, p_order_id, v_allocation_type, v_total_bags, 'ACTIVE', p_assigned_by)
  RETURNING id INTO v_allocation_id;

  -- Actualizar contador del casillero
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
-- PARTE 3: fn_upsert_order_and_assign — reagrupar numéricos cuando hay letra
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_upsert_order_and_assign(TEXT, BIGINT, INT, INT, NUMERIC, TEXT);

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
  v_alpha_code          TEXT;
  v_alpha_id            BIGINT;
  v_regroup             RECORD;
  v_is_letter           BOOLEAN;
BEGIN
  v_new_logistics := CASE WHEN p_total_bags >= 2 THEN 'COMPLEX' ELSE 'SIMPLE' END;

  SELECT o.id, o.total_bags, o.logistics_type
  INTO v_order_id, v_existing_bags, v_existing_logistics
  FROM orders o WHERE o.firebase_id = p_firebase_id;

  -- Pedido nuevo
  IF v_order_id IS NULL THEN
    INSERT INTO orders (firebase_id, customer_id, order_code, logistics_type,
                        total_bags, total_items, total_amount, order_status)
    VALUES (p_firebase_id, p_customer_id, 'ORD-' || p_firebase_id,
            v_new_logistics, p_total_bags, p_total_items, p_total_amount, 'IN_PROCESS')
    RETURNING id INTO v_order_id;

    SELECT * INTO v_assign_row FROM fn_assign_container(v_order_id, p_assigned_by);
    v_container_code := v_assign_row.out_container_code;

  -- Pedido existente
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM container_allocations WHERE order_id = v_order_id AND status = 'ACTIVE'
    ) INTO v_had_active;

    -- Caso 1: SIMPLE → COMPLEX
    IF v_existing_logistics = 'SIMPLE' AND v_new_logistics = 'COMPLEX' AND v_had_active THEN
      SELECT * INTO v_migrate_row FROM fn_migrate_to_complex(v_order_id, p_total_bags, p_assigned_by);
      v_container_code := v_migrate_row.out_new_container_code;
      v_was_migrated   := TRUE;

    -- Caso 2: COMPLEX → SIMPLE (nunca degrada, se queda en letra)
    ELSIF v_existing_logistics = 'COMPLEX' AND v_new_logistics = 'SIMPLE' AND v_had_active THEN
      SELECT * INTO v_downgrade_row FROM fn_downgrade_to_simple(v_order_id, p_assigned_by);
      v_container_code := v_downgrade_row.out_new_container_code;
      v_was_migrated   := TRUE;
      UPDATE orders SET total_bags = p_total_bags, total_items = p_total_items,
                        total_amount = p_total_amount WHERE id = v_order_id;

    -- Caso 3: mismo tipo con asignación activa
    ELSIF v_had_active THEN
      UPDATE orders SET total_bags = p_total_bags, total_items = p_total_items,
                        total_amount = p_total_amount, logistics_type = v_new_logistics
      WHERE id = v_order_id;

      IF v_new_logistics = 'COMPLEX' THEN
        -- Actualizar bags_reserved cuidando capacidad
        DECLARE
          v_old_bags INT;
          v_alpha_id BIGINT;
        BEGIN
          SELECT ca.bags_reserved, ca.container_id
          INTO v_old_bags, v_alpha_id
          FROM container_allocations ca
          WHERE ca.order_id = v_order_id AND ca.status = 'ACTIVE';

          PERFORM 1 FROM storage_containers sc
          WHERE sc.id = v_alpha_id
            AND (sc.current_bags_used - v_old_bags + p_total_bags) > sc.max_bags_capacity;
          IF FOUND THEN
            RAISE EXCEPTION 'El casillero no tiene capacidad para % bolsas', p_total_bags;
          END IF;

          UPDATE container_allocations SET bags_reserved = p_total_bags
          WHERE order_id = v_order_id AND status = 'ACTIVE';

          UPDATE storage_containers
          SET current_bags_used = GREATEST(current_bags_used - v_old_bags + p_total_bags, 0)
          WHERE id = v_alpha_id;
          PERFORM fn_recalc_container_state(v_alpha_id);
        END;
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

  -- NUEVO: Si la clienta ahora tiene letra, reagrupar pedidos numéricos viejos
  v_is_letter := v_container_code IS NOT NULL AND v_container_code !~ '^\d+$';

  IF v_is_letter THEN
    -- Encontrar la letra de esta clienta
    SELECT sc.container_code, sc.id
    INTO v_alpha_code, v_alpha_id
    FROM storage_containers sc
    WHERE sc.container_type = 'ALPHA_COMPLEX'
      AND sc.id IN (
        SELECT DISTINCT ca.container_id
        FROM container_allocations ca
        JOIN orders o2 ON o2.id = ca.order_id
        WHERE o2.customer_id = p_customer_id AND ca.status = 'ACTIVE'
      )
    LIMIT 1;

    -- Mover pedidos numéricos de la misma clienta a esta letra
    FOR v_regroup IN
      SELECT ca.id AS alloc_id, ca.order_id, ca.bags_reserved, ca.container_id AS old_container_id
      FROM container_allocations ca
      JOIN orders o2 ON o2.id = ca.order_id
      JOIN storage_containers sc ON sc.id = ca.container_id
      WHERE o2.customer_id = p_customer_id
        AND ca.status = 'ACTIVE'
        AND sc.container_type = 'NUMERIC_SHARED'
      FOR UPDATE
    LOOP
      UPDATE container_allocations
      SET status = 'MIGRATED', released_at = NOW(), released_by = p_assigned_by,
          release_reason = 'REGROUPED_TO_ALPHA', migration_target_id = v_alpha_id
      WHERE id = v_regroup.alloc_id;

      UPDATE storage_containers
      SET current_simple_orders = GREATEST(current_simple_orders - 1, 0)
      WHERE id = v_regroup.old_container_id;
      PERFORM fn_recalc_container_state(v_regroup.old_container_id);

      INSERT INTO container_allocations
        (container_id, order_id, allocation_type, bags_reserved, status, assigned_by, notes)
      VALUES
        (v_alpha_id, v_regroup.order_id, 'COMPLEX_CONTAINER', v_regroup.bags_reserved,
         'ACTIVE', p_assigned_by,
         'Reagrupado desde numérico a ' || v_alpha_code);

      UPDATE storage_containers
      SET current_bags_used = current_bags_used + v_regroup.bags_reserved
      WHERE id = v_alpha_id;
    END LOOP;

    PERFORM fn_recalc_container_state(v_alpha_id);
  END IF;

  out_order_id       := v_order_id;
  out_container_code := v_container_code;
  out_was_migrated   := v_was_migrated;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- PARTE 4: fn_downgrade_to_simple — nunca mover a numérico
-- ----------------------------------------------------------------------------
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
BEGIN
  SELECT ca.id, ca.container_id, sc.container_code, ca.bags_reserved
  INTO v_old_allocation_id, v_old_container_id, v_old_container_code, v_old_bags_reserved
  FROM container_allocations ca
  JOIN storage_containers sc ON sc.id = ca.container_id
  WHERE ca.order_id = p_order_id AND ca.status = 'ACTIVE'
  FOR UPDATE;

  IF v_old_allocation_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % no tiene asignación activa para degradar', p_order_id;
  END IF;

  -- La clienta ya está en letra: mantenerla ahí. Solo reducir bolsas.
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
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Reparar estado
-- ----------------------------------------------------------------------------
SELECT fn_rebuild_container_counters();
