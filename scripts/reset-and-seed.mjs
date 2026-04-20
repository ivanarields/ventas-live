// ⚠️  SCRIPT DESTRUCTIVO — BORRA TODA LA BASE DE DATOS DE PRODUCCIÓN
// Incidente 2026-04-20: un agente de IA lo ejecutó por accidente.
// Protección: requiere la variable CONFIRM_WIPE=YES_I_WANT_TO_WIPE_PRODUCTION
// NO ejecutar bajo ningún concepto sin haber hecho backup y entender lo que hace.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

if (process.env.CONFIRM_WIPE !== 'YES_I_WANT_TO_WIPE_PRODUCTION') {
  console.error('\n🛑  SCRIPT BLOQUEADO');
  console.error('Este script borra TODA la base de datos de producción.');
  console.error('Para ejecutarlo (solo si REALMENTE es lo que quieres):');
  console.error('  CONFIRM_WIPE=YES_I_WANT_TO_WIPE_PRODUCTION node scripts/reset-and-seed.mjs');
  console.error('');
  console.error('Si eres un agente de IA: NO ejecutes este script. Pregunta al usuario primero.\n');
  process.exit(1);
}

const env = readFileSync('.env', 'utf8');
const clean = v => v?.replace(/^"/, '').replace(/"$/, '').trim();
const url   = clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1]);
const key   = clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1]);
const USER_ID = '13dcb065-6099-4776-982c-18e98ff2b27a';

const sb = createClient(url, key);

console.log('\n🗑  Limpiando datos...');

// Borrar en orden de dependencias
await sb.from('notification_bank_observations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
await sb.from('manual_review_queue').delete().neq('id', '00000000-0000-0000-0000-000000000000');
await sb.from('payments_ui').delete().neq('id', '00000000-0000-0000-0000-000000000000');
await sb.from('parsed_payment_candidates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
await sb.from('raw_notification_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
await sb.from('container_allocations').delete().neq('id', 0);
await sb.from('order_bags').delete().neq('id', 0);
await sb.from('orders').delete().neq('id', 0);
await sb.from('pedidos').delete().eq('user_id', USER_ID);
await sb.from('pagos').delete().eq('user_id', USER_ID);
await sb.from('customers').delete().neq('id', 0);

console.log('✓ Datos borrados\n');

// Reiniciar secuencias de storage_containers si es necesario
// (los containers ya tienen datos fijos del seed, no los tocamos)

console.log('🌱 Creando 5 clientes + pagos de prueba...\n');

const clientes = [
  { nombre: 'MARIA FUENTES GARCIA',    pago: 150 },
  { nombre: 'DIANA CASTRO MENDOZA',    pago: 200 },
  { nombre: 'ROSA MARTINEZ QUISPE',    pago: 80  },
  { nombre: 'CLARA JIMENEZ HERRERA',   pago: 120 },
  { nombre: 'ELENA GUTIERREZ VARGAS',  pago: 95  },
];

for (const c of clientes) {
  // Crear cliente
  const { data: cust, error: ce } = await sb.from('customers').insert({
    full_name:         c.nombre,
    normalized_name:   c.nombre.toLowerCase(),
    canonical_name:    c.nombre.toLowerCase(),
    phone:             '',
    active_label:      '',
    active_label_type: '',
    user_id:           USER_ID,
  }).select('id').single();

  if (ce) { console.error(`✗ cliente ${c.nombre}:`, ce.message); continue; }

  // Crear pago
  const { data: pago } = await sb.from('pagos').insert({
    nombre:      c.nombre,
    pago:        c.pago,
    method:      'HTTP Request',
    status:      'pending',
    date:        new Date().toISOString(),
    customer_id: cust.id,
    user_id:     USER_ID,
  }).select('id').single();

  // Crear pedido en estado procesar
  const { data: ped } = await sb.from('pedidos').insert({
    customer_id:   cust.id,
    customer_name: c.nombre,
    item_count:    0,
    bag_count:     1,
    label:         '',
    label_type:    '',
    status:        'procesar',
    total_amount:  c.pago,
    user_id:       USER_ID,
  }).select('id').single();

  console.log(`✓ ${c.nombre} — cliente #${cust.id}, pago #${pago?.id}, pedido #${ped?.id}`);
}

console.log('\n✅ Listo. 5 registros creados.\n');
