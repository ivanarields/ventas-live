-- Migración 032: Tabla para almacenar prompts de IA editables desde el panel
-- Permite que el operador ajuste los prompts sin tocar el código.

CREATE TABLE IF NOT EXISTS ai_prompts (
  user_id    TEXT        NOT NULL,
  prompt_key TEXT        NOT NULL,
  prompt_text TEXT       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, prompt_key)
);

COMMENT ON TABLE ai_prompts IS
  'Prompts de IA editables por usuario. Cada fila es un prompt identificado por (user_id, prompt_key).';

COMMENT ON COLUMN ai_prompts.prompt_key IS
  'Identificador del prompt. Valores actuales: comprobante_extraction';

COMMENT ON COLUMN ai_prompts.prompt_text IS
  'Texto del prompt. Soporta el placeholder {{OWNER_NAME}} que se reemplaza con el nombre de la dueña configurado en ai_config.';
