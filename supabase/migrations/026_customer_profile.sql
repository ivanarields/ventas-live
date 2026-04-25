-- Migración 026: Perfil unificado de cliente
-- Agrega wa_number y campos de tracking a la tabla customers

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS wa_number        TEXT,
  ADD COLUMN IF NOT EXISTS wa_linked_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS store_customer_id BIGINT,
  ADD COLUMN IF NOT EXISTS source           TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_payment_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_payments   INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_spent      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS tags             TEXT[];

-- Índice para búsqueda por número de WhatsApp
CREATE INDEX IF NOT EXISTS idx_customers_wa_number ON customers(wa_number) WHERE wa_number IS NOT NULL;

-- Índice de trigram para búsqueda fuzzy de nombre (si no existe pg_trgm)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_customers_canonical_trgm ON customers USING GIN(canonical_name gin_trgm_ops);

-- Función para vincular WA a un cliente por nombre canónico
-- Retorna el customer_id si encontró match, NULL si no
CREATE OR REPLACE FUNCTION fn_link_customer_wa(
  p_canonical_name TEXT,
  p_wa_number      TEXT,
  p_user_id        TEXT
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
  v_customer_id BIGINT;
BEGIN
  -- Buscar cliente por nombre exacto primero
  SELECT id INTO v_customer_id
  FROM customers
  WHERE user_id = p_user_id
    AND canonical_name = p_canonical_name
    AND is_active = true
  LIMIT 1;

  -- Si no hay match exacto, buscar por similitud (fuzzy > 0.6)
  IF v_customer_id IS NULL THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE user_id = p_user_id
      AND is_active = true
      AND similarity(canonical_name, p_canonical_name) > 0.6
    ORDER BY similarity(canonical_name, p_canonical_name) DESC
    LIMIT 1;
  END IF;

  -- Si encontró, vincular WA
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
