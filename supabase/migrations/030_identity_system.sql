-- =============================================================================
-- 030_identity_system.sql
-- Sistema de Identidad y Perfiles: tablas centrales
-- =============================================================================

-- ── Perfil unificado de cliente ───────────────────────────────────────────────
-- Un perfil representa una persona real, independientemente de cómo llegó:
-- pago manual, WhatsApp, tienda online, MacroDroid.
CREATE TABLE IF NOT EXISTS identity_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,                    -- operador dueño de la app
  display_name  TEXT NOT NULL,                    -- nombre canónico (editable)
  phone         TEXT,                             -- teléfono normalizado (+591...)
  -- Vínculos a otras bases de datos (NULL si no existe ese canal)
  cliente_id    BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  store_phone   TEXT,                             -- PK en store_customers (TiendaOnline)
  panel_phone   TEXT,                             -- teléfono en panel_clientes (WhatsApp)
  -- Metadatos
  confidence    NUMERIC(4,3) DEFAULT 1.0,         -- 0.0-1.0, qué tan seguro es el match
  merged_from   UUID[],                           -- IDs de perfiles fusionados aquí
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_profiles_user_id  ON identity_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_profiles_phone     ON identity_profiles(phone);
CREATE INDEX IF NOT EXISTS idx_identity_profiles_cliente_id ON identity_profiles(cliente_id);

-- ── Evidencia unificada ───────────────────────────────────────────────────────
-- Cada sistema deposita registros estandarizados aquí.
-- La lógica de matching solo lee esta tabla — nunca accede directamente a
-- pagos, pedidos, store_orders ni panel_mensajes.
CREATE TABLE IF NOT EXISTS identity_evidence (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  profile_id    UUID REFERENCES identity_profiles(id) ON DELETE SET NULL,
  -- De qué sistema viene
  source        TEXT NOT NULL CHECK (source IN (
    'manual_payment',    -- pago registrado a mano
    'macrodroid',        -- notificación bancaria de Android
    'whatsapp',          -- mensaje o conversación de WhatsApp
    'store_order'        -- pedido de la tienda online
  )),
  -- Identificadores en el sistema de origen
  source_id     TEXT,                             -- ID del registro en origen
  source_ref    TEXT,                             -- referencia adicional (ej: número de pedido)
  -- Datos del evento
  event_type    TEXT NOT NULL,                    -- 'payment', 'message', 'order', 'contact'
  amount        NUMERIC(12,2),                    -- monto si aplica
  phone         TEXT,                             -- teléfono detectado en este evento
  name_raw      TEXT,                             -- nombre tal como vino del sistema
  name_normalized TEXT,                           -- nombre normalizado (sin tildes, mayúsculas)
  event_at      TIMESTAMPTZ DEFAULT now(),        -- cuándo ocurrió el evento en origen
  payload       JSONB DEFAULT '{}',               -- datos extra del sistema de origen
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_evidence_user_id   ON identity_evidence(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_evidence_profile_id ON identity_evidence(profile_id);
CREATE INDEX IF NOT EXISTS idx_identity_evidence_source    ON identity_evidence(source);
CREATE INDEX IF NOT EXISTS idx_identity_evidence_phone     ON identity_evidence(phone);
CREATE INDEX IF NOT EXISTS idx_identity_evidence_event_at  ON identity_evidence(event_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_evidence_source_id  ON identity_evidence(source, source_id);

-- ── Trigger: updated_at automático en identity_profiles ──────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_identity_profiles_updated_at ON identity_profiles;
CREATE TRIGGER trg_identity_profiles_updated_at
  BEFORE UPDATE ON identity_profiles
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
