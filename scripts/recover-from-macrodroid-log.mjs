// Recuperación de pagos perdidos del 19-20 abril 2026
// Fuente: MacroDroidLog.txt — 32 notificaciones con v_text y v_app_package
// Corrige el bug de parseAmount que multiplicaba x100

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

const env = readFileSync('.env', 'utf8');
const clean = v => v?.replace(/^"/, '').replace(/"$/, '').trim();
const url   = clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1]);
const key   = clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1]);
const USER_ID = '13dcb065-6099-4776-982c-18e98ff2b27a';

const sb = createClient(url, key);

const log = readFileSync('MacroDroidLog.txt', 'utf8');

// Extraer triggers: fecha + v_text (contiene nombre + monto)
// Formato real del log:
//   2026-04-19 19:05:06.988 - A: (2) Fijar Variable (v_text: IVAN ARIEL DIAZ SANCHEZ, te envió Bs. 1.) (App Chechi)
const triggerRegex = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+).*?v_text:\s*(.+?)\)\s*\(App Chechi\)/gm;

const notifications = [];
let m;
while ((m = triggerRegex.exec(log)) !== null) {
  const ts = m[1];
  const text = m[2].trim();

  // Filtrar solo 19 y 20 abril
  if (!ts.startsWith('2026-04-19') && !ts.startsWith('2026-04-20')) continue;

  // Parsear monto: "Bs. 10.00" o "Bs. 1." — parseFloat directo maneja decimales bolivianos
  const amountMatch = text.match(/Bs\.?\s*([\d]+(?:\.\d+)?)/i);
  if (!amountMatch) continue;
  const amount = parseFloat(amountMatch[1]);

  // Parsear nombre
  let name = null;
  // "QR DE <NOMBRE> te envió Bs. X"
  let nm = text.match(/QR DE\s+(.+?)\s+te envió/i);
  if (nm) name = nm[1].trim();
  // "<NOMBRE>, te envió Bs. X"  (Yape directo)
  if (!name) {
    nm = text.match(/^(.+?),\s*te envió Bs/i);
    if (nm) name = nm[1].trim();
  }
  if (!name) continue;

  notifications.push({ ts, text, name, amount });
}

console.log(`\n📋 ${notifications.length} notificaciones encontradas del 19-20 abril:\n`);
let total = 0;
for (const n of notifications) {
  console.log(`  ${n.ts.slice(0,16)}  Bs. ${n.amount.toFixed(2).padStart(7)}  ${n.name}`);
  total += n.amount;
}
console.log(`\n  ────────────────────────────────────────────────`);
console.log(`  TOTAL: Bs. ${total.toFixed(2)}\n`);

// Si se pasa --insert, insertar en la DB
if (!process.argv.includes('--insert')) {
  console.log('💡 Para insertar en la DB: node scripts/recover-from-macrodroid-log.mjs --insert\n');
  process.exit(0);
}

console.log('🔄 Insertando en la base de datos...\n');

// Agrupar por nombre para crear cliente 1 vez
const byName = new Map();
for (const n of notifications) {
  if (!byName.has(n.name)) byName.set(n.name, []);
  byName.get(n.name).push(n);
}

for (const [name, pagos] of byName) {
  // Buscar cliente existente
  const { data: existing } = await sb
    .from('customers')
    .select('id')
    .eq('user_id', USER_ID)
    .ilike('full_name', name)
    .maybeSingle();

  let customerId = existing?.id;

  if (!customerId) {
    const { data: cust, error: ce } = await sb.from('customers').insert({
      full_name:         name,
      normalized_name:   name.toLowerCase(),
      canonical_name:    name.toLowerCase(),
      phone:             '',
      active_label:      '',
      active_label_type: '',
      user_id:           USER_ID,
    }).select('id').single();
    if (ce) { console.error(`✗ cliente ${name}:`, ce.message); continue; }
    customerId = cust.id;
    console.log(`  + cliente #${customerId}: ${name}`);
  } else {
    console.log(`  = cliente #${customerId}: ${name} (ya existía)`);
  }

  for (const p of pagos) {
    // Crear pago con fecha real del log
    const { data: pago, error: pe } = await sb.from('pagos').insert({
      nombre:      name,
      pago:        p.amount,
      method:      'HTTP Request',
      status:      'pending',
      date:        new Date(p.ts.replace(' ', 'T') + '-04:00').toISOString(),
      customer_id: customerId,
      user_id:     USER_ID,
    }).select('id').single();
    if (pe) { console.error(`    ✗ pago:`, pe.message); continue; }

    // Crear pedido en "procesar"
    const { data: ped } = await sb.from('pedidos').insert({
      customer_id:   customerId,
      customer_name: name,
      item_count:    0,
      bag_count:     1,
      label:         '',
      label_type:    '',
      status:        'procesar',
      total_amount:  p.amount,
      user_id:       USER_ID,
    }).select('id').single();

    console.log(`    + Bs. ${p.amount.toFixed(2)}  pago #${pago.id}  pedido #${ped?.id}`);
  }
}

console.log('\n✅ Recuperación completa.\n');
