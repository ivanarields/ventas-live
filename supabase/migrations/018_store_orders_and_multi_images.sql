-- ============================================================
-- Feature 3: múltiples imágenes en products
-- ============================================================
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';

-- ============================================================
-- Feature 2: tabla store_orders para pedidos de la tienda
-- ============================================================
CREATE TABLE IF NOT EXISTS store_orders (
  id             BIGSERIAL PRIMARY KEY,
  items          JSONB         NOT NULL DEFAULT '[]',
  total          NUMERIC(10,2) NOT NULL DEFAULT 0,
  customer_name  TEXT,
  customer_phone TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  wa_sent        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_orders_created_at
  ON store_orders (created_at DESC);

ALTER TABLE store_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public insert store_orders"
  ON store_orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "auth read store_orders"
  ON store_orders FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth update store_orders"
  ON store_orders FOR UPDATE
  USING (auth.role() = 'authenticated');
