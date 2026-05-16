-- TiendaOnline: tabla pagos_tienda para que los pagos de la tienda no contaminen
-- la base de datos principal (ChehiAppAbril). La tienda funciona aparte sea que
-- el Live esté encendido o apagado. La pestaña "Pagos Web" del sistema principal
-- lee desde aquí, no desde la tabla `pagos`.

CREATE TABLE IF NOT EXISTS pagos_tienda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_order_id BIGINT REFERENCES store_orders(id) ON DELETE SET NULL,
  store_customer_id BIGINT REFERENCES store_customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_wa TEXT,
  amount NUMERIC(12,2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'Tienda Online',
  status TEXT NOT NULL DEFAULT 'completed',
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bank_sender_name TEXT,
  bank_sender_phone TEXT,
  bank_raw_text TEXT,
  bank_event_hash TEXT,
  owner_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_tienda_store_order
  ON pagos_tienda (store_order_id)
  WHERE store_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_tienda_payment_date
  ON pagos_tienda (payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_pagos_tienda_owner_user
  ON pagos_tienda (owner_user_id, payment_date DESC)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_tienda_customer
  ON pagos_tienda (store_customer_id, payment_date DESC)
  WHERE store_customer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_touch_pagos_tienda_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pagos_tienda_touch_updated_at ON pagos_tienda;
CREATE TRIGGER trg_pagos_tienda_touch_updated_at
BEFORE UPDATE ON pagos_tienda
FOR EACH ROW
EXECUTE FUNCTION fn_touch_pagos_tienda_updated_at();
