-- Tabla de patrones aprendidos automáticamente por el parser de notificaciones
-- Cada vez que un pago se procesa exitosamente, se guarda el contexto textual
-- (qué texto aparece antes y después del nombre) para aprender el formato del banco.

CREATE TABLE IF NOT EXISTS learned_text_patterns (
  id            BIGSERIAL PRIMARY KEY,
  app_package   TEXT        NOT NULL,
  before_marker TEXT        NOT NULL DEFAULT '',
  after_marker  TEXT        NOT NULL DEFAULT '',
  success_count INTEGER     NOT NULL DEFAULT 1,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(app_package, before_marker, after_marker)
);

CREATE INDEX IF NOT EXISTS idx_ltp_app_score
  ON learned_text_patterns(app_package, success_count DESC);

ALTER TABLE learned_text_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access"
  ON learned_text_patterns
  USING (true)
  WITH CHECK (true);

-- Función atómica: insert o incrementa contador
CREATE OR REPLACE FUNCTION upsert_learned_pattern(
  p_app    TEXT,
  p_before TEXT,
  p_after  TEXT
) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO learned_text_patterns(app_package, before_marker, after_marker, success_count, last_seen_at)
  VALUES (p_app, p_before, p_after, 1, NOW())
  ON CONFLICT (app_package, before_marker, after_marker)
  DO UPDATE SET
    success_count = learned_text_patterns.success_count + 1,
    last_seen_at  = NOW();
$$;
