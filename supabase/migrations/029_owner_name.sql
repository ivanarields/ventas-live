-- Migración 029: Agregar nombre de la dueña al perfil de configuración de IA
-- Esto permite que el prompt de análisis de comprobantes sea dinámico
-- y no dependa de un nombre hardcodeado.

ALTER TABLE ai_config
  ADD COLUMN IF NOT EXISTS owner_name TEXT DEFAULT NULL;

COMMENT ON COLUMN ai_config.owner_name IS
  'Nombre completo de la dueña/administradora del negocio. '
  'Se inyecta dinámicamente en los prompts de IA para identificar '
  'quién es el receptor en los comprobantes de pago.';
