import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Cargamos variables de entorno
const env = readFileSync('.env', 'utf8');
const clean = v => v?.replace(/^"/, '').replace(/"$/, '').trim();
const url   = clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1] || env.match(/^VITE_SUPABASE_URL=(.+)/m)?.[1]);
const key   = clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1]);

if (!url || !key) {
  console.error("Error: No se encontraron las credenciales de Supabase en el archivo .env");
  process.exit(1);
}

const sb = createClient(url, key);

async function clearStoreData() {
  console.log('🗑  Conectando a Supabase para limpiar ÚNICAMENTE la tienda...');
  
  // 1. Borramos SOLO la tabla de productos (aquí están las fotos pesadas)
  const { error: pErr } = await sb.from('products').delete().neq('id', 0);
  if (pErr) console.error('Error al borrar productos:', pErr);
  else console.log('✅ Tabla `products` (Catálogo de tienda) vaciada correctamente.');

  // 2. Borramos SOLO la tabla de store_orders (pedidos de la tienda online)
  const { error: oErr } = await sb.from('store_orders').delete().neq('id', 0);
  if (oErr) console.error('Error al borrar store_orders:', oErr);
  else console.log('✅ Tabla `store_orders` (Pedidos de tienda) vaciada correctamente.');

  console.log('\n🔒 CUIDADO CONFIRMADO: NO se ha tocado ninguna otra tabla.');
  console.log('pagos, pedidos, customers y casilleros están 100% INTACTOS.');
}

clearStoreData();
