import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env', 'utf8');
const clean = v => v?.replace(/^"/, '').replace(/"$/, '').trim();
const url   = clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1]);
const key   = clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1]);
const USER_ID = '13dcb065-6099-4776-982c-18e98ff2b27a';

const sb = createClient(url, key);

// Normalizar nombre igual que la Edge Function (sin ordenar palabras)
const normalize = name =>
  name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, '').replace(/\s+/g, ' ').trim();

// ── 1) Obtener todos los pedidos sin customer_id ──────────────────────────────
const { data: pedidosSinCliente } = await sb
  .from('pedidos').select('id, customer_name, customer_id').is('customer_id', null);

const { data: pagosSinCliente } = await sb
  .from('pagos').select('id, nombre, customer_id').is('customer_id', null).eq('user_id', USER_ID);

const { data: allCustomers } = await sb
  .from('customers').select('id, full_name, normalized_name');

console.log(`\nPedidos sin customer_id: ${pedidosSinCliente?.length ?? 0}`);
console.log(`Pagos sin customer_id:   ${pagosSinCliente?.length ?? 0}`);
console.log(`Clientes existentes:     ${allCustomers?.length ?? 0}\n`);

// Agrupamos los nombres únicos que necesitan cliente
const namesNeeded = new Set([
  ...(pedidosSinCliente ?? []).map(p => p.customer_name).filter(Boolean),
  ...(pagosSinCliente   ?? []).map(p => p.nombre).filter(Boolean),
]);

const customerMap = {}; // normalizedName → customer_id

for (const rawName of namesNeeded) {
  const norm = normalize(rawName);

  // Buscar cliente existente por full_name (case-insensitive) o normalized_name
  const existing = allCustomers?.find(c =>
    normalize(c.full_name ?? '') === norm ||
    normalize(c.normalized_name ?? '') === norm
  );

  if (existing) {
    customerMap[norm] = existing.id;
    console.log(`✓ Encontrado: "${rawName}" → cliente #${existing.id} (${existing.full_name})`);
  } else {
    // Crear cliente nuevo
    const { data: newCust, error } = await sb.from('customers').insert({
      full_name:       rawName,
      normalized_name: norm.toLowerCase(),
      canonical_name:  norm.toLowerCase(),
      phone:           '',
      active_label:    '',
      active_label_type: '',
      user_id:         USER_ID,
    }).select('id').single();

    if (error) {
      console.error(`✗ Error creando cliente "${rawName}":`, error.message);
    } else {
      customerMap[norm] = newCust.id;
      console.log(`+ Creado: "${rawName}" → cliente #${newCust.id}`);
    }
  }
}

// ── 2) Actualizar pedidos ─────────────────────────────────────────────────────
for (const ped of pedidosSinCliente ?? []) {
  if (!ped.customer_name) continue;
  const norm = normalize(ped.customer_name);
  const customerId = customerMap[norm];
  if (!customerId) continue;

  const { error } = await sb.from('pedidos').update({ customer_id: customerId }).eq('id', ped.id);
  if (error) console.error(`✗ pedido #${ped.id}:`, error.message);
  else console.log(`  pedido #${ped.id} → customer_id ${customerId}`);
}

// ── 3) Actualizar pagos ───────────────────────────────────────────────────────
for (const pago of pagosSinCliente ?? []) {
  if (!pago.nombre) continue;
  const norm = normalize(pago.nombre);
  const customerId = customerMap[norm];
  if (!customerId) continue;

  const { error } = await sb.from('pagos').update({ customer_id: customerId }).eq('id', pago.id);
  if (error) console.error(`✗ pago #${pago.id}:`, error.message);
  else console.log(`  pago #${pago.id} → customer_id ${customerId}`);
}

console.log('\n✅ Listo.\n');
