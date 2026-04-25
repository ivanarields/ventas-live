-- ============================================================================
-- 025: Panel Centralizado de IA — Config + Usage Log
-- ============================================================================

-- Configuración de IA por usuario
CREATE TABLE IF NOT EXISTS ai_config (
  user_id TEXT PRIMARY KEY,
  primary_key_encrypted TEXT,       -- Key principal de Gemini
  fallback_key_encrypted TEXT,      -- Key de respaldo (rotación automática)
  features JSONB NOT NULL DEFAULT '{
    "product_vision":   { "enabled": true, "model": "gemini-2.5-flash-lite" },
    "chat_summary":     { "enabled": true, "model": "gemini-2.5-flash-lite" },
    "notif_parser":     { "enabled": true, "model": "gemini-2.5-flash-lite" }
  }'::jsonb,
  daily_limit INT DEFAULT 1500,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Log de uso de IA (métricas + debugging)
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  feature TEXT NOT NULL,             -- 'product_vision', 'chat_summary', 'notif_parser'
  model TEXT NOT NULL DEFAULT 'gemini-2.5-flash-lite',
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  latency_ms INT DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  metadata JSONB,                    -- datos extra (ej: nombre extraído de un comprobante)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage_log(feature, created_at DESC);
