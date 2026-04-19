-- Reset completo de todos los datos de la app (conserva estructura y app_users)
TRUNCATE TABLE container_allocations RESTART IDENTITY CASCADE;
TRUNCATE TABLE orders RESTART IDENTITY CASCADE;
TRUNCATE TABLE order_bags RESTART IDENTITY CASCADE;
TRUNCATE TABLE customers RESTART IDENTITY CASCADE;
TRUNCATE TABLE pedidos RESTART IDENTITY CASCADE;
TRUNCATE TABLE pagos RESTART IDENTITY CASCADE;
TRUNCATE TABLE transactions RESTART IDENTITY CASCADE;
TRUNCATE TABLE live_sessions RESTART IDENTITY CASCADE;
TRUNCATE TABLE giveaways RESTART IDENTITY CASCADE;
TRUNCATE TABLE ideas RESTART IDENTITY CASCADE;

-- Resetear contadores de casilleros a cero
UPDATE storage_containers SET
  current_simple_orders = 0,
  current_bags_used     = 0,
  state                 = 'AVAILABLE';
