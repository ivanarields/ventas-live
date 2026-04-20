// Rescate por regex: procesa manual_review_queue usando el MISMO regex
// que ahora tiene el Edge Function. Los items que quedaron atascados
// fueron procesados ANTES del fix del regex QR, por eso no salieron.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env', 'utf8');
const clean = v => v?.replace(/^"/, '').replace(/"$/, '').trim();
const url  = clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1]);
const key  = clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1]);
const USER_ID = '13dcb065-6099-4776-982c-18e98ff2b27a';

const sb = createClient(url, key);

function parseAmount(text) {
  const match =
    text.match(/Bs\.?\s*([\d][\d.,]*)/i) ||
    text.match(/\bBOB\s*([\d][\d.,]*)/i);
  if (!match) return null;
  const raw = match[1].replace(/\./g, '').replace(',', '.');
  const n = parseFloat(raw);
  return isNaN(n) || n <= 0 ? null : Math.round(n * 100) / 100;
}

function parsePayerName(text) {
  const t = text.replace(/[^\w\sÁÉÍÓÚÑáéíóúñ.,|:;$-]/g, ' ').replace(/\s+/g, ' ');
  const patterns = [
    /QR\s+DE\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60}?)\s{1,4}te\s+(?:envi\S*|yape\S*|pag\S*)/i,
    /(?:^|\|\s*)([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,80}?)\s*,\s*te\s+(?:envi\S*|yape\S*|pag\S*|transf\S*)/im,
    /RECIBISTE\s+(?:Bs\.?\s*[\d.,]+\s+)?DE\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60}?)(?:\s+(?:por|con|Bs|en|el|a\s+las)|$)/i,
    /(?:transferencia|pago|envi\S+|dep\S+sito)\s+(?:recibid[oa]\s+)?de\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60}?)(?:\s+por|\s+Bs|\s*$)/i,
    /\bde\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60}?)(?:\s+por|\s+con|\s+Bs|\s*$)/,
    /enviado\s+por\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60})/i,
    /nombre\s*:?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60})/i,
  ];
  for (const rx of patterns) {
    const m = t.match(rx);
    if (m) {
      const name = m[1].trim().replace(/\s+/g, ' ');
      if (name.length < 3) continue;
      if (/^(TE|EL|LA|UN|UNA|DE|POR|CON|ENVI|YAPE|PAGO|BS)$/i.test(name)) continue;
      return name;
    }
  }
  return null;
}

function canonicalize(name) {
  return name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, '').replace(/\s+/g, ' ').trim();
}

console.log('🔍 Buscando pagos atascados...\n');

const { data: items } = await sb
  .from('manual_review_queue')
  .select('id, parsed_candidate_id, reason_code')
  .order('created_at', { ascending: true });

console.log(`Encontrados ${items?.length ?? 0} items en manual_review_queue\n`);

let rescued = 0;
let stillStuck = 0;

for (const item of items ?? []) {
  const { data: cand } = await sb
    .from('parsed_payment_candidates')
    .select('id, amount, candidate_text, raw_event_id, operation_ref')
    .eq('id', item.parsed_candidate_id)
    .single();

  if (!cand) continue;

  const text = cand.candidate_text ?? '';
  if (!text) { stillStuck++; continue; }

  console.log(`\n→ "${text.slice(0, 90)}..."`);

  const name = parsePayerName(text);
  if (!name) {
    console.log('  ✗ Regex no encontró nombre');
    stillStuck++;
    continue;
  }

  const amount = cand.amount ?? parseAmount(text);
  if (!amount) {
    console.log('  ✗ Sin monto');
    stillStuck++;
    continue;
  }

  const normForSearch = canonicalize(name).toLowerCase();

  // Buscar o crear cliente
  let customerId = null;
  const { data: existing } = await sb.from('customers')
    .select('id').eq('user_id', USER_ID).ilike('normalized_name', normForSearch).limit(1);
  if (existing && existing.length > 0) {
    customerId = existing[0].id;
  } else {
    const { data: newCust, error: custErr } = await sb.from('customers').insert({
      full_name: name, normalized_name: normForSearch,
      canonical_name: normForSearch, phone: '',
      active_label: '', active_label_type: '', user_id: USER_ID,
    }).select('id').single();
    if (custErr) { console.log('  ✗ Error cliente:', custErr.message); stillStuck++; continue; }
    customerId = newCust.id;
  }

  // Crear pago
  const { data: pago, error: pagoErr } = await sb.from('pagos').insert({
    nombre: name, pago: amount, method: 'Notificación (rescate)',
    status: 'pending', date: new Date().toISOString(),
    user_id: USER_ID, customer_id: customerId,
  }).select('id').single();

  if (pagoErr) {
    console.log('  ✗ Error creando pago:', pagoErr.message);
    stillStuck++;
    continue;
  }

  // Crear pedido
  await sb.from('pedidos').insert({
    customer_id: customerId, customer_name: name,
    item_count: 0, bag_count: 1, status: 'procesar',
    total_amount: amount, user_id: USER_ID,
  });

  // Limpiar
  await sb.from('manual_review_queue').delete().eq('id', item.id);
  await sb.from('parsed_payment_candidates').update({ needs_review: false, parse_status: 'rescued_by_regex' }).eq('id', cand.id);
  if (cand.raw_event_id) {
    await sb.from('raw_notification_events').update({ ingest_status: 'auto_processed' }).eq('id', cand.raw_event_id);
  }

  console.log(`  ✓ Rescatado: ${name} — Bs. ${amount}`);
  rescued++;
}

console.log(`\n━━━ Resumen ━━━`);
console.log(`✓ Rescatados: ${rescued}`);
console.log(`✗ Siguen atascados: ${stillStuck}`);
