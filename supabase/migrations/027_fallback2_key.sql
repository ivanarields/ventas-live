-- Migración 027: 2do fallback key en ai_config + wa_number en clientes
ALTER TABLE ai_config
  ADD COLUMN IF NOT EXISTS fallback2_key_encrypted TEXT;
