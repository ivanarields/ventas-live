-- ============================================================================
-- Expansión de casilleros + Agrupación de pedidos por cliente en letra
-- ============================================================================
-- Cambios:
--   1. Crear 100 casilleros numéricos (1-100)
--   2. Crear 26 casilleros alfabéticos (A-Z)
--   3. fn_assign_container: si el cliente ya tiene letra, agrupa el nuevo pedido ahí
--   4. fn_migrate_to_complex: si el cliente ya tiene letra, suma bolsas a esa letra
--   5. fn_downgrade_to_simple: si el cliente tiene otros pedidos en letra, no degrada
--   6. fn_upsert_order_and_assign: reagrupa pedidos numéricos si cliente ya tiene letra
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTE 1: Expandir casilleros
-- ----------------------------------------------------------------------------

-- Numéricos 5-100 (los 1-4 ya existen)
INSERT INTO storage_containers (container_code, container_type, max_simple_orders, max_bags_capacity, priority_order)
SELECT
    gs.i::TEXT,
    'NUMERIC_SHARED',
    COALESCE((SELECT max_simple_orders FROM storage_containers WHERE container_code = '1'), 4),
    COALESCE((SELECT max_bags_capacity FROM storage_containers WHERE container_code = '1'), 4),
    gs.i
FROM generate_series(5, 100) AS gs(i)
ON CONFLICT (container_code) DO NOTHING;

-- Alfabéticos E-Z (A-D ya existen, prioridad 10-13. Nuevos: E=114... Z=135)
-- Pero A-D tienen prioridad 10,11,12,13. Vamos a usar 101+ para mantener el orden natural.
-- Primero corregimos prioridades de A-D a 101-104 si fuera necesario
UPDATE storage_containers
SET priority_order = CASE container_code
    WHEN 'A' THEN 101 WHEN 'B' THEN 102 WHEN 'C' THEN 103 WHEN 'D' THEN 104
    ELSE priority_order
END
WHERE container_type = 'ALPHA_COMPLEX'
  AND container_code IN ('A','B','C','D');

-- Insertar E-Z con prioridad 105-126
INSERT INTO storage_containers (container_code, container_type, max_simple_orders, max_bags_capacity, priority_order)
SELECT
    chr(gs.i),
    'ALPHA_COMPLEX',
    0,
    12,
    100 + (gs.i - 64)  -- A=101, B=102, ..., Z=126
FROM generate_series(69, 90) AS gs(i)  -- E=69, Z=90 en ASCII
ON CONFLICT (container_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- PARTE 2: fn_assign_container — agrupar en letra si cliente ya tiene una
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
  v_logistics         TEXT;
  v_total_bags        INT;
  v_customer_id       BIGINT;
  v_container_type    TEXT;
  v_allocation_type   TEXT;
  v_container_id      BIGINT;
  v_container_code    TEXT;
  v_allocation_id     BIGINT;
  v_existing_alpha_id   BIGINT;
  v_existing_alpha_code TEXT;
  v_existing_alpha_bags INT;
  v_existing_alpha_max  INT;
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

  -- NUEVO: ¿el cliente ya tiene un casillero alfabético por otro pedido?
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
    -- El cliente ya tiene letra: agrupar este pedido ahí
    IF (v_existing_alpha_bags + v_total_bags) > v_existing_alpha_max THEN
      RAISE EXCEPTION 'Casillero % lleno (%/%). No puede agregar más bolsas.',
        v_existing_alpha_code, v_existing_alpha_bags, v_existing_alpha_max;
    END IF;

    v_container_type  := 'ALPHA_COMPLEX';
    v_allocation_type := 'COMPLEX_CONTAINER';
    v_container_id    := v_existing_alpha_id;
    v_container_code  := v_existing_alpha_code;

  ELSE
    -- Sin letra previa: lógica normal según cantidad de bolsas
    IF v_logistics = 'SIMPLE' THEN
      v_container_type  := 'NUMERIC_SHARED';
      v_allocation_type := 'SIMPLE_SHARED';
    ELSE
      v_container_type  := 'ALPHA_COMPLEX';
      v_allocation_type := 'COMPLEX_CONTAINER';
    END IF;

    -- AUTO-REPARACIÓN: recalcular contadores antes de elegir
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
  END IF;

  -- Crear asignación activa
  INSERT INTO container_allocations
    (container_id, order_id, allocation_type, bags_reserved, status, assigned_by)
  VALUES
    (v_container_id, p_order_id, v_allocation_type, v_total_bags, 'ACTIVE', p_assigned_by)
  RETURNING id INTO v_allocation_id;

  -- Actualizar contador del casillero elegido
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
-- PARTE 3: fn_migrate_to_complex — si cliente ya tiene letra, sumar ahí
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
  v_old_allocation_id    BIGINT;
  v_old_container_id     BIGINT;
  v_old_container_code   TEXT;
  v_customer_id          BIGINT;
  v_new_container_id     BIGINT;
  v_new_container_code   TEXT;
  v_new_allocation_id    BIGINT;
  v_existing_alpha_id    BIGINT;
  v_existing_alpha_code  TEXT;
  v_existing_alpha_bags  INT;
  v_existing_alpha_max   INT;
BEGIN
  IF p_new_total_bags < 2 THEN
    RAISE EXCEPTION 'Migración a COMPLEX requiere 2+ bolsas (recibió %)', p_new_total_bags;
  END IF;

  SELECT ca.id, ca.container_id, sc.container_code, o.customer_id
  INTO v_old_allocation_id, v_old_container_id, v_old_container_code, v_customer_id
  FROM container_allocations ca
  JOIN storage_containers sc ON sc.id = ca.container_id
  JOIN orders o ON o.id = ca.order_id
  WHERE ca.order_id = p_order_id AND ca.status = 'ACTIVE'
  FOR UPDATE;

  IF v_old_allocation_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % no tiene asignación activa para migrar', p_order_id;
  END IF;

  -- NUEVO: ¿el cliente ya tiene un casillero alfabético por otro pedido?
  SELECT sc.id, sc.container_code, sc.current_bags_used, sc.max_bags_capacity
  INTO v_existing_alpha_id, v_existing_alpha_code, v_existing_alpha_bags, v_existing_alpha_max
  FROM storage_containers sc
  WHERE sc.container_type = 'ALPHA_COMPLEX'
    AND sc.id IN (
      SELECT DISTINCT ca2.container_id
      FROM container_allocations ca2
      JOIN orders o2 ON o2.id = ca2.order_id
      WHERE o2.customer_id = v_customer_id
        AND ca2.status = 'ACTIVE'
        AND ca2.id != v_old_allocation_id
    )
  ORDER BY sc.priority_order ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_existing_alpha_id IS NOT NULL THEN
    -- Ya tiene letra: agrupar este pedido ahí
    IF (v_existing_alpha_bags + p_new_total_bags) > v_existing_alpha_max THEN
      RAISE EXCEPTION 'Casillero % lleno (%/%). No puede migrar este pedido.',
        v_existing_alpha_code, v_existing_alpha_bags, v_existing_alpha_max;
    END IF;

    v_new_container_id   := v_existing_alpha_id;
    v_new_container_code := v_existing_alpha_code;

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
       'ACTIVE', p_migrated_by,
       'Agrupado en ' || v_new_container_code || ' (migrado desde ' || v_old_container_code || ')')
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
    RETURN;
  END IF;

  -- Sin letra previa: lógica normal (buscar nueva letra disponible)

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
-- PARTE 4: fn_downgrade_to_simple — no degradar si cliente tiene otros pedidos en letra
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

  -- NUEVO: ¿el cliente tiene otros pedidos activos en esta misma letra?
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
    -- El cliente tiene otros pedidos en esta letra: mantener el pedido aquí, solo reducir bolsas
    UPDATE orders SET logistics_type = 'SIMPLE', total_bags = 1 WHERE id = p_order_id;

    -- Reducir bags_reserved a 1
    UPDATE container_allocations SET bags_reserved = 1 WHERE id = v_old_allocation_id;

    -- Reducir contador del casillero por la diferencia de bolsas
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

  -- Sin otros pedidos en esta letra: degradar a numérico (lógica original)

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

-- ----------------------------------------------------------------------------
-- PARTE 5: fn_upsert_order_and_assign — reagrupar si cliente ya tiene letra
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
  v_is_in_numeric       BOOLEAN;
  v_customer_alpha_code TEXT;
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

    -- Caso 2: COMPLEX → SIMPLE
    ELSIF v_existing_logistics = 'COMPLEX' AND v_new_logistics = 'SIMPLE' AND v_had_active THEN
      SELECT * INTO v_downgrade_row FROM fn_downgrade_to_simple(v_order_id, p_assigned_by);
      v_container_code := v_downgrade_row.out_new_container_code;
      v_was_migrated   := TRUE;
      UPDATE orders SET total_bags = p_total_bags, total_items = p_total_items,
                        total_amount = p_total_amount WHERE id = v_order_id;

    -- Caso 3: mismo tipo con asignación activa
    ELSIF v_had_active THEN
      -- NUEVO: ¿este pedido está en numérico pero el cliente ya tiene letra?
      SELECT EXISTS(
        SELECT 1 FROM container_allocations ca
        JOIN storage_containers sc ON sc.id = ca.container_id
        WHERE ca.order_id = v_order_id AND ca.status = 'ACTIVE'
          AND sc.container_type = 'NUMERIC_SHARED'
      ) INTO v_is_in_numeric;

      IF v_is_in_numeric THEN
        -- Ver si el cliente tiene letra por otro pedido
        SELECT sc2.container_code INTO v_customer_alpha_code
        FROM storage_containers sc2
        WHERE sc2.container_type = 'ALPHA_COMPLEX'
          AND sc2.id IN (
            SELECT DISTINCT ca2.container_id
            FROM container_allocations ca2
            JOIN orders o2 ON o2.id = ca2.order_id
            WHERE o2.customer_id = p_customer_id
              AND ca2.status = 'ACTIVE'
              AND ca2.order_id != v_order_id
          )
        LIMIT 1;

        IF v_customer_alpha_code IS NOT NULL THEN
          -- El cliente ya tiene letra: mover este pedido del numérico a la letra
          PERFORM fn_release_container(v_order_id, p_assigned_by, 'REGROUPED_TO_ALPHA');
          UPDATE orders
          SET total_bags = p_total_bags, total_items = p_total_items,
              total_amount = p_total_amount, logistics_type = v_new_logistics,
              order_status = 'IN_PROCESS'
          WHERE id = v_order_id;
          SELECT * INTO v_assign_row FROM fn_assign_container(v_order_id, p_assigned_by);
          v_container_code := v_assign_row.out_container_code;
        ELSE
          -- Sin letra: actualización normal en numérico
          UPDATE orders SET total_bags = p_total_bags, total_items = p_total_items,
                            total_amount = p_total_amount, logistics_type = v_new_logistics
          WHERE id = v_order_id;
          SELECT sc.container_code INTO v_container_code
          FROM container_allocations ca
          JOIN storage_containers sc ON sc.id = ca.container_id
          WHERE ca.order_id = v_order_id AND ca.status = 'ACTIVE';
        END IF;
      ELSE
        -- Ya está en letra: actualización normal
        UPDATE orders SET total_bags = p_total_bags, total_items = p_total_items,
                          total_amount = p_total_amount, logistics_type = v_new_logistics
        WHERE id = v_order_id;
        IF v_new_logistics = 'COMPLEX' THEN
          -- Verificar capacidad antes de actualizar bolsas
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
              RAISE EXCEPTION 'El casillero no tiene capacidad para % bolsas (ocupado: %/%)',
                p_total_bags,
                (SELECT current_bags_used FROM storage_containers WHERE id = v_alpha_id),
                (SELECT max_bags_capacity FROM storage_containers WHERE id = v_alpha_id);
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
      END IF;

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
-- Reparar estado actual
-- ----------------------------------------------------------------------------
SELECT fn_rebuild_container_counters();
