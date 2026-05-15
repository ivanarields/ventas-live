-- Asegura que la tienda pueda crear pedidos sin depender de drift entre entornos.

ALTER TABLE store_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'store_orders'
      AND policyname = 'public insert store_orders'
  ) THEN
    DROP POLICY "public insert store_orders" ON store_orders;
  END IF;
END $$;

CREATE POLICY "public insert store_orders"
  ON store_orders FOR INSERT
  WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'store_orders'
      AND policyname = 'auth read store_orders'
  ) THEN
    DROP POLICY "auth read store_orders" ON store_orders;
  END IF;
END $$;

CREATE POLICY "auth read store_orders"
  ON store_orders FOR SELECT
  USING (auth.role() = 'authenticated');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'store_orders'
      AND policyname = 'auth update store_orders'
  ) THEN
    DROP POLICY "auth update store_orders" ON store_orders;
  END IF;
END $$;

CREATE POLICY "auth update store_orders"
  ON store_orders FOR UPDATE
  USING (auth.role() = 'authenticated');
