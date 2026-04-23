-- Tabla para registrar eventos de pago bancario de la tienda
-- Usada por el motor de cuadrangulación (ingest-bank / ingest-wa)
CREATE TABLE IF NOT EXISTS payment_events (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL DEFAULT 'macrodroid',   -- 'macrodroid' | 'manual'
  raw_text        TEXT,
  amount          NUMERIC(10,2),
  sender_name     TEXT,
  sender_wa       TEXT,
  processed       BOOLEAN NOT NULL DEFAULT FALSE,
  match_confidence TEXT,                                -- 'maxima' | 'alta' | 'media' | 'none'
  matched_order_id BIGINT REFERENCES store_orders(id) ON DELETE SET NULL,
  hash            TEXT UNIQUE,                          -- SHA-256 para idempotencia
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para búsqueda rápida por hash (idempotencia)
CREATE INDEX IF NOT EXISTS idx_payment_events_hash ON payment_events(hash);

-- Índice para búsqueda por pedido
CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(matched_order_id);

-- Tabla para mensajes de WhatsApp recibidos (comprobantes)
CREATE TABLE IF NOT EXISTS wa_events (
  id              BIGSERIAL PRIMARY KEY,
  from_wa         TEXT NOT NULL,
  summary         TEXT,
  has_proof       BOOLEAN NOT NULL DEFAULT FALSE,
  order_ref       TEXT,                                 -- ej: "1042" extraído de "#1042"
  matched_order_id BIGINT REFERENCES store_orders(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_events_order ON wa_events(matched_order_id);
