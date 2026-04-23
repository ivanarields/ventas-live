-- Drop existing constraint
ALTER TABLE store_orders DROP CONSTRAINT IF EXISTS store_orders_status_check;

-- Add updated constraint allowing pending, reserved, confirmed, sold, cancelled
ALTER TABLE store_orders ADD CONSTRAINT store_orders_status_check 
  CHECK (status IN ('pending', 'reserved', 'confirmed', 'sold', 'cancelled'));
