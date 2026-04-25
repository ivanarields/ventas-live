-- Migración 028: soporte para 5 API keys en ai_config
ALTER TABLE ai_config
  ADD COLUMN IF NOT EXISTS key3_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS key4_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS key5_encrypted TEXT;
