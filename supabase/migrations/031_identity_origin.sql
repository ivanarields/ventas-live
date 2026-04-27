-- =============================================================================
-- 031_identity_origin.sql
-- Agrega campo "origin" a identity_profiles para distinguir perfiles
-- creados automáticamente por el Pulpo vs. ingresados manualmente.
-- =============================================================================

ALTER TABLE identity_profiles
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'auto'
    CHECK (origin IN ('auto', 'manual'));

COMMENT ON COLUMN identity_profiles.origin IS
  'auto = el Pulpo lo matcheó/creó automáticamente; manual = el operador lo ingresó a mano';
