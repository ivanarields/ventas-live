-- Migración 033: Arreglar matching de canonical_name en fn_link_customer_wa
-- Problema: todos los canonical_name están en minúsculas pero la función recibe mayúsculas → nunca hace match
-- Solución: normalizar a MAYÚSCULAS en tabla y en la función

-- 1. Normalizar todos los canonical_name existentes a MAYÚSCULAS
UPDATE customers
SET canonical_name = UPPER(canonical_name)
WHERE canonical_name IS NOT NULL
  AND canonical_name != UPPER(canonical_name);

-- 2. Arreglar is_active para clientes que no tienen user_id (registros huérfanos)
UPDATE customers
SET is_active = false
WHERE user_id IS NULL;

-- 3. Reemplazar fn_link_customer_wa con versión case-insensitive
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

  -- Buscar cliente por nombre exacto (case-insensitive: comparar ambos en UPPER)
  SELECT id INTO v_customer_id
  FROM customers
  WHERE user_id = p_user_id
    AND UPPER(canonical_name) = v_name_upper
    AND is_active = true
  LIMIT 1;

  -- Si no hay match exacto, buscar por similitud fuzzy (case-insensitive)
  IF v_customer_id IS NULL THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE user_id = p_user_id
      AND is_active = true
      AND similarity(UPPER(canonical_name), v_name_upper) > 0.6
    ORDER BY similarity(UPPER(canonical_name), v_name_upper) DESC
    LIMIT 1;
  END IF;

  -- Si encontró, vincular WA (solo si wa_number aún está vacío)
  IF v_customer_id IS NOT NULL THEN
    UPDATE customers
    SET wa_number    = p_wa_number,
        wa_linked_at = now()
    WHERE id = v_customer_id
      AND (wa_number IS NULL OR wa_number = '');
  END IF;

  RETURN v_customer_id;
END;
$$;
