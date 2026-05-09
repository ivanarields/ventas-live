CREATE TABLE IF NOT EXISTS store_favorites (
  id BIGSERIAL PRIMARY KEY,
  customer_wa TEXT NOT NULL,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_wa, product_id)
);

CREATE INDEX IF NOT EXISTS idx_store_favorites_customer
  ON store_favorites (customer_wa, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_favorites_product
  ON store_favorites (product_id);
