import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://thgbfurscfjcmgokyyif.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZ2JmdXJzY2ZqY21nb2t5eWlmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njg3MDEwMSwiZXhwIjoyMDkyNDQ2MTAxfQ.k9UDbB8w6qbuq-uo_1BxeKXseuMlEGcKzqtmdrdPubk'
);

async function addReservationColumns() {
  // Supabase no tiene RPC para ALTER TABLE directo, pero podemos usar
  // una función PL/pgSQL temporal para crear las columnas

  // Primero, crear una función RPC temporal
  const { error: fnErr } = await supabase.rpc('exec_migration_add_reservation', {});
  
  if (fnErr) {
    console.log('Función RPC no existe. Usamos approach alternativo...');
    
    // Approach: usar el campo JSONB existente o agregar via actualización masiva
    // Verificamos si podemos agregar columnas vía la API de management
    
    // En realidad, la forma más simple es: guardar reserved_by_order y reserved_until
    // como campos en la propia tabla store_orders en vez de en products.
    // 
    // Cambiamos el approach: en vez de modificar la tabla products,
    // controlamos la reserva desde el servidor verificando store_orders.
    //
    // Cuando se crea un pedido:
    // 1. Verificar que no exista otro pedido pending con los mismos productos
    // 2. Si existe → rechazar
    // 3. Si no existe → crear pedido
    //
    // Cuando el pedido expira:
    // 1. El servidor cancela pedidos expirados cada 30 seg
    // 2. Los productos quedan "libres" automáticamente (no hay pedido pending para ellos)
    
    console.log('✅ APPROACH ALTERNATIVO: Reserva via store_orders (sin modificar tabla products)');
    console.log('');
    console.log('La reserva funciona así:');
    console.log('1. Al crear pedido → verificar que ningún otro pedido pending tenga los mismos productos');
    console.log('2. Si conflicto → rechazar con "Producto reservado por otra persona"');
    console.log('3. Al expirar → cancelar pedido → los productos quedan libres');
    console.log('4. No necesitamos columnas nuevas en products');
    
    // Test: verificar que podemos buscar pedidos pending por productId
    const { data: pendingOrders } = await supabase
      .from('store_orders')
      .select('id, items, status, expires_at')
      .eq('status', 'pending');
    
    console.log('\nPedidos pending actuales:', pendingOrders?.length ?? 0);
    if (pendingOrders?.length) {
      for (const o of pendingOrders) {
        const productIds = (o.items ?? []).map(i => i.productId);
        console.log(`  Pedido #${o.id}: productos [${productIds.join(', ')}] expira: ${o.expires_at}`);
      }
    }
  }
}

addReservationColumns().catch(console.error);
