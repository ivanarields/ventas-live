
-- ============================================================
-- TIENDA ONLINE — Schema v1.0
-- Ejecutar este SQL en: Supabase Dashboard > SQL Editor
-- Proyecto: TiendaOnline (thgbfurscfjcmgokyyif)
-- ============================================================

-- 1. PERFILES DE CLIENTES ONLINE
CREATE TABLE IF NOT EXISTS store_customers (
  id              BIGSERIAL PRIMARY KEY,
  whatsapp        TEXT NOT NULL UNIQUE,
  pin_hash        TEXT NOT NULL,
  display_name    TEXT,
  total_orders    INT DEFAULT 0,
  total_spent     NUMERIC(10,2) DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CATEGORÍAS
CREATE TABLE IF NOT EXISTS categories (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  color       TEXT DEFAULT '#ff2d78',
  icon        TEXT,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categories (name, slug, color, sort_order) VALUES
  ('Blusas',     'blusas',     '#f472b6', 1),
  ('Vestidos',   'vestidos',   '#a78bfa', 2),
  ('Pantalones', 'pantalones', '#60a5fa', 3),
  ('Chaquetas',  'chaquetas',  '#34d399', 4),
  ('Conjuntos',  'conjuntos',  '#fbbf24', 5),
  ('Faldas',     'faldas',     '#f87171', 6),
  ('Accesorios', 'accesorios', '#94a3b8', 7),
  ('General',    'general',    '#9ca3af', 8)
ON CONFLICT (slug) DO NOTHING;

-- 3. PRODUCTOS
CREATE TABLE IF NOT EXISTS products (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  price           NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  category        TEXT NOT NULL DEFAULT 'General',
  brand           TEXT,
  sizes           TEXT[],
  images          TEXT[],
  available       BOOLEAN NOT NULL DEFAULT TRUE,
  featured        BOOLEAN NOT NULL DEFAULT FALSE,
  stock           INT NOT NULL DEFAULT 1,
  condition       TEXT DEFAULT 'bueno',
  ai_confidence   TEXT,
  color           TEXT,
  material        TEXT,
  views           INT DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PEDIDOS DE TIENDA
CREATE TABLE IF NOT EXISTS store_orders (
  id                   BIGSERIAL PRIMARY KEY,
  customer_id          BIGINT REFERENCES store_customers(id),
  customer_name        TEXT,
  customer_wa          TEXT,
  items                JSONB NOT NULL DEFAULT '[]',
  total                NUMERIC(10,2) NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','paid','ready','delivered','cancelled')),
  payment_method       TEXT DEFAULT 'qr',
  payment_ref          TEXT,
  payment_verified_at  TIMESTAMPTZ,
  wa_proof_received    BOOLEAN DEFAULT FALSE,
  wa_message_id        TEXT,
  expires_at           TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. EVENTOS DE PAGO (Triangulación)
CREATE TABLE IF NOT EXISTS payment_events (
  id               BIGSERIAL PRIMARY KEY,
  source           TEXT NOT NULL DEFAULT 'macrodroid',
  raw_text         TEXT,
  amount           NUMERIC(10,2),
  sender_name      TEXT,
  sender_wa        TEXT,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_order_id BIGINT REFERENCES store_orders(id),
  match_confidence TEXT,
  processed        BOOLEAN DEFAULT FALSE,
  hash             TEXT UNIQUE
);

-- 6. MENSAJES WHATSAPP (Triangulación)
CREATE TABLE IF NOT EXISTS wa_messages (
  id               BIGSERIAL PRIMARY KEY,
  from_wa          TEXT NOT NULL,
  summary          TEXT,
  has_proof        BOOLEAN DEFAULT FALSE,
  order_ref        TEXT,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_order_id BIGINT REFERENCES store_orders(id)
);

-- 7. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_products_available    ON products(available);
CREATE INDEX IF NOT EXISTS idx_products_category     ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_featured     ON products(featured);
CREATE INDEX IF NOT EXISTS idx_store_orders_status   ON store_orders(status);
CREATE INDEX IF NOT EXISTS idx_store_orders_wa       ON store_orders(customer_wa);
CREATE INDEX IF NOT EXISTS idx_store_orders_expires  ON store_orders(expires_at);
CREATE INDEX IF NOT EXISTS idx_payment_events_amount ON payment_events(amount);
CREATE INDEX IF NOT EXISTS idx_wa_messages_from      ON wa_messages(from_wa);

-- 8. FUNCIÓN updated_at automático
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_store_orders_updated_at
  BEFORE UPDATE ON store_orders
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON store_customers
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 9. FUNCIÓN: Expirar pedidos sin pago después de 30 min
CREATE OR REPLACE FUNCTION fn_expire_pending_orders()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE store_orders
  SET status = 'cancelled', updated_at = NOW()
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$;

-- 10. ROW LEVEL SECURITY
ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages     ENABLE ROW LEVEL SECURITY;

-- Lectura pública de productos disponibles (para la tienda web)
DROP POLICY IF EXISTS "productos_publicos" ON products;
CREATE POLICY "productos_publicos" ON products
  FOR SELECT USING (available = true);

-- El servidor (service_role) puede hacer todo
DROP POLICY IF EXISTS "service_all_products"  ON products;
DROP POLICY IF EXISTS "service_all_orders"    ON store_orders;
DROP POLICY IF EXISTS "service_all_customers" ON store_customers;
DROP POLICY IF EXISTS "service_all_payments"  ON payment_events;
DROP POLICY IF EXISTS "service_all_wa"        ON wa_messages;

CREATE POLICY "service_all_products"  ON products        FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_all_orders"    ON store_orders    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_all_customers" ON store_customers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_all_payments"  ON payment_events  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_all_wa"        ON wa_messages     FOR ALL USING (auth.role() = 'service_role');

SELECT 'FASE 1 COMPLETADA — Tablas TiendaOnline listas' AS resultado;
