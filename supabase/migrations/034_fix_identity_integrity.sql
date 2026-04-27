-- Migración 034: Corregir integridad del sistema de identidad (Errores 2, 3, 6)

-- ERROR 2: Índice único parcial para bloquear clientes activos duplicados con el mismo nombre
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unique_canonical
ON customers(user_id, canonical_name)
WHERE is_active = true AND canonical_name IS NOT NULL;

-- ERROR 3 + ERROR 6: Reemplazar fn_link_customer_wa con versión mejorada
-- Cambios respecto a migración 033:
--   1. Siempre actualiza wa_number (no solo si está vacío) → corrige números equivocados
--   2. Fallback busca también en clientes inactivos → cubre clientes reactivados
CREATE OR REPLACE FUNCTION fn_link_customer_wa(
  p_canonical_name TEXT,
  p_wa_number      TEXT,
  p_user_id        TEXT
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
  v_customer_id BIGINT;
  v_name_upper  TEXT;
BEGIN
  v_name_upper := UPPER(p_canonical_name);

  -- 1. Buscar cliente activo por nombre exacto
  SELECT id INTO v_customer_id
  FROM customers
  WHERE user_id = p_user_id
    AND UPPER(canonical_name) = v_name_upper
    AND is_active = true
  LIMIT 1;

  -- 2. Fuzzy entre activos
  IF v_customer_id IS NULL THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE user_id = p_user_id
      AND is_active = true
      AND similarity(UPPER(canonical_name), v_name_upper) > 0.6
    ORDER BY similarity(UPPER(canonical_name), v_name_upper) DESC
    LIMIT 1;
  END IF;

  -- 3. Fallback: también entre inactivos (cliente reactivado después de pausa)
  IF v_customer_id IS NULL THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE user_id = p_user_id
      AND UPPER(canonical_name) = v_name_upper
    ORDER BY is_active DESC
    LIMIT 1;
  END IF;

  -- Siempre actualizar wa_number cuando llega por WhatsApp (corrige números incorrectos)
  IF v_customer_id IS NOT NULL THEN
    UPDATE customers
    SET wa_number    = p_wa_number,
        wa_linked_at = now()
    WHERE id = v_customer_id;
  END IF;

  RETURN v_customer_id;
END;
$$;
