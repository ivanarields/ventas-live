-- Índice compuesto para buscar pedidos por teléfono de cliente ordenados por fecha
-- Sin este índice, cada consulta al perfil escanea TODA la tabla store_orders
-- Con este índice, la búsqueda por customer_wa es instantánea
CREATE INDEX IF NOT EXISTS idx_store_orders_customer_wa
  ON store_orders (customer_wa, created_at DESC);
