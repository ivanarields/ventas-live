-- Fix: ON CONFLICT necesita referenciar el predicado de un índice parcial.
-- fn_upsert_customer usa firebase_id que tiene índice parcial (WHERE firebase_id IS NOT NULL).

CREATE OR REPLACE FUNCTION fn_upsert_customer(
  p_firebase_id TEXT,
  p_full_name TEXT,
  p_normalized_name TEXT,
  p_whatsapp_number TEXT DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO customers (firebase_id, full_name, normalized_name, whatsapp_number)
  VALUES (p_firebase_id, p_full_name, p_normalized_name, p_whatsapp_number)
  ON CONFLICT (firebase_id) WHERE firebase_id IS NOT NULL
  DO UPDATE
  SET full_name = EXCLUDED.full_name,
      normalized_name = EXCLUDED.normalized_name,
      whatsapp_number = COALESCE(EXCLUDED.whatsapp_number, customers.whatsapp_number)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;
