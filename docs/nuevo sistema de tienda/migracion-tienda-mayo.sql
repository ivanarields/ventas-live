-- ============================================================
-- Migracion: Nuevo Sistema de Tienda — Mayo 2026
-- Base de datos: TiendaOnline (thgbfurscfjcmgokyyif)
-- Proposito: tablas y campos nuevos para tienda profesional
-- Regla: NO tocar base principal. Todo esto es tienda-only.
-- ============================================================

-- ============================================================
-- 1. Mejoras en store_orders (calendario + control)
-- ============================================================
ALTER TABLE store_orders
  ADD COLUMN IF NOT EXISTS delivery_type       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_date       DATE,
  ADD COLUMN IF NOT EXISTS delivery_slot       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address    TEXT,
  ADD COLUMN IF NOT EXISTS delivery_notes      TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status     TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS customer_note       TEXT,
  ADD COLUMN IF NOT EXISTS admin_note          TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS selection_token     TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS selection_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_selection  JSONB DEFAULT '[]';

-- ============================================================
-- 2. Nueva tabla: store_selection_requests (casos lila / duda IA)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_selection_requests (
  id                BIGSERIAL PRIMARY KEY,
  source_type       TEXT NOT NULL DEFAULT 'live_payment',
  source_id         BIGINT,
  customer_wa       TEXT NOT NULL,
  customer_name     TEXT,
  suggested_items   JSONB DEFAULT '[]',
  candidate_photos  TEXT[] DEFAULT '{}',
  confidence_score  NUMERIC(3,2),
  status            TEXT NOT NULL DEFAULT 'pending_customer'
                      CHECK (status IN ('pending_customer','opened','confirmed','rejected','expired','cancelled')),
  token             TEXT UNIQUE,
  expires_at        TIMESTAMPTZ,
  selected_items    JSONB DEFAULT '[]',
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_selection_requests_status
  ON store_selection_requests(status);
CREATE INDEX IF NOT EXISTS idx_store_selection_requests_token
  ON store_selection_requests(token);
CREATE INDEX IF NOT EXISTS idx_store_selection_requests_wa
  ON store_selection_requests(customer_wa);
CREATE INDEX IF NOT EXISTS idx_store_selection_requests_expires
  ON store_selection_requests(expires_at);

-- ============================================================
-- 3. Nueva tabla: store_message_templates (plantillas editables)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_message_templates (
  id            BIGSERIAL PRIMARY KEY,
  template_key  TEXT UNIQUE NOT NULL,
  title         TEXT,
  body          TEXT NOT NULL,
  active        BOOLEAN DEFAULT true,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed inicial de plantillas
INSERT INTO store_message_templates (template_key, title, body)
VALUES
  ('order_created',       'Pedido creado',       'Hola {customer_name}, recibimos tu pedido #{order_id}. Esta reservado por unos minutos. Total: {total} Bs.'),
  ('payment_confirmed',   'Pago confirmado',     'Hola {customer_name}, tu pago del pedido #{order_id} fue verificado. Ya estamos preparando tu pedido.'),
  ('order_ready',         'Pedido listo',        'Hola {customer_name}, tu pedido #{order_id} esta listo para {delivery_type} el {delivery_date} en el horario {delivery_slot}.'),
  ('order_delivered',     'Pedido entregado',    'Gracias por tu compra, {customer_name}. Tu pedido #{order_id} fue marcado como entregado.'),
  ('order_cancelled',     'Pedido cancelado',    'Hola {customer_name}, tu pedido #{order_id} fue cancelado porque la reserva vencio o no se confirmo el pago.'),
  ('reminder',            'Recordatorio',        'Hola {customer_name}, te recordamos tu pedido #{order_id} para {delivery_date} en el horario {delivery_slot}.'),
  ('selection_request',   'Confirma tus prendas','Hola {customer_name}, necesitamos que confirmes las prendas de tu pedido. Entra aqui: {link}')
ON CONFLICT (template_key) DO NOTHING;

-- ============================================================
-- 4. Nueva tabla: store_message_log (historial de mensajes)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_message_log (
  id                    BIGSERIAL PRIMARY KEY,
  order_id              BIGINT,
  selection_request_id  BIGINT,
  customer_wa           TEXT NOT NULL,
  template_key          TEXT,
  message_body          TEXT,
  status                TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','copied','queued','sent','failed')),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_message_log_wa
  ON store_message_log(customer_wa);
CREATE INDEX IF NOT EXISTS idx_store_message_log_order
  ON store_message_log(order_id);
CREATE INDEX IF NOT EXISTS idx_store_message_log_selection
  ON store_message_log(selection_request_id);

-- ============================================================
-- 5. Nueva tabla: store_external_purchases (Live / otras fuentes)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_external_purchases (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL DEFAULT 'live',
  source_id       TEXT,
  customer_wa     TEXT,
  customer_name   TEXT,
  items           JSONB DEFAULT '[]',
  total           NUMERIC(10,2),
  status          TEXT,
  purchase_date   TIMESTAMPTZ,
  payload         JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_external_wa
  ON store_external_purchases(customer_wa);
CREATE INDEX IF NOT EXISTS idx_store_external_source
  ON store_external_purchases(source, source_id);

-- ============================================================
-- 6. Nueva tabla: store_favorites
-- ============================================================
CREATE TABLE IF NOT EXISTS store_favorites (
  id            BIGSERIAL PRIMARY KEY,
  customer_wa   TEXT NOT NULL,
  product_id    BIGINT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_wa, product_id)
);

CREATE INDEX IF NOT EXISTS idx_store_favorites_wa
  ON store_favorites(customer_wa);

-- ============================================================
-- 7. Nueva tabla: store_settings (configuracion simple)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_settings (
  id            BIGSERIAL PRIMARY KEY,
  setting_key   TEXT UNIQUE NOT NULL,
  setting_value TEXT
);

-- Seed inicial de configuraciones
INSERT INTO store_settings (setting_key, setting_value)
VALUES
  ('store_name', 'Leydi American'),
  ('store_phone', '59160003230'),
  ('reservation_minutes', '10'),
  ('delivery_enabled', 'true'),
  ('pickup_enabled', 'true'),
  ('next_live_date', ''),
  ('next_live_time', ''),
  ('delivery_note', 'Entregas de lunes a sabado.'),
  ('address', 'Zona ... Calle ... Referencia ...')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================
-- 8. Nueva tabla: store_delivery_slots (horarios)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_delivery_slots (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  start_time  TEXT,
  end_time    TEXT,
  active      BOOLEAN DEFAULT true,
  sort_order  INT DEFAULT 0
);

-- Seed inicial de horarios
INSERT INTO store_delivery_slots (name, start_time, end_time, active, sort_order)
VALUES
  ('Manana',  '08:00', '12:00', true, 1),
  ('Tarde',   '12:00', '17:00', true, 2),
  ('Noche',   '17:00', '21:00', true, 3)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. Trigger para updated_at automatico en store_selection_requests
-- ============================================================
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_selection_requests_updated_at ON store_selection_requests;
CREATE TRIGGER trg_store_selection_requests_updated_at
  BEFORE UPDATE ON store_selection_requests
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_store_orders_updated_at ON store_orders;
CREATE TRIGGER trg_store_orders_updated_at
  BEFORE UPDATE ON store_orders
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- Resultado
-- ============================================================
SELECT 'Migracion de tienda completada' AS resultado;
