-- ============================================================================
-- Configuración global de la aplicación
-- ============================================================================
-- Tabla clave/valor para guardar ajustes del sistema.
-- El primer seed establece la capacidad por defecto de casilleros numéricos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Valor inicial: capacidad de 4 bolsas por casillero numérico (el default actual)
INSERT INTO app_config (key, value)
VALUES ('numeric_container_capacity', '4')
ON CONFLICT (key) DO NOTHING;
