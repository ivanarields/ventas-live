// Rescate con IA: procesa manual_review_queue usando Gemini
// Para cada pago atascado, consulta Gemini y si extrae nombre válido, crea el pago.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env', 'utf8');
const clean = v => v?.replace(/^"/, '').replace(/"$/, '').trim();
const url  = clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1]);
const key  = clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1]);
const gKey = clean(env.match(/^GEMINI_API_KEY=(.+)/m)?.[1]);
const USER_ID = '13dcb065-6099-4776-982c-18e98ff2b27a';

if (!gKey) {
  console.error('ERROR: GEMINI_API_KEY no está en .env. Agrégalo y vuelve a correr.');
  process.exit(1);
}

const sb = createClient(url, key);

function canonicalize(name) {
  return name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, '').replace(/\s+/g, ' ').trim();
}

async function askGemini(text) {
  const prompt = `Extrae el nombre del pagador y el monto de esta notificación bancaria boliviana.

Responde SOLO con JSON válido:
{"name": "NOMBRE COMPLETO", "amount": numero}

Reglas:
- Si no hay nombre de persona real (con nombre y apellido), usa "name": null
- NUNCA inventes. NUNCA uses "PAGO", "DEPOSITO", "YAPE" como nombre
- El nombre debe estar en MAYUSCULAS como aparece en el texto
- El monto es solo el número

Notificación: """${text}"""`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${gKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 150, responseMimeType: 'application/json' },
      }),
    }
  );

  if (!resp.ok) return null;
  const data = await resp.json();
  const textResp = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const jsonMatch = textResp.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) return null;

  try {
    const p = JSON.parse(jsonMatch[0]);
    return {
      name:   typeof p.name === 'string' && p.name.trim().length >= 3 ? p.name.trim().replace(/\s+/g,' ') : null,
      amount: typeof p.amount === 'number' && p.amount > 0 ? Math.round(p.amount * 100) / 100 : null,
    };
  } catch { return null; }
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

  console.log(`\n→ ID ${cand.id} | "${text.slice(0, 80)}..."`);
  const gemini = await askGemini(text);

  if (!gemini?.name) {
    console.log('  ✗ Gemini no encontró nombre válido (verdaderamente sin nombre)');
    stillStuck++;
    continue;
  }

  const amount = cand.amount ?? gemini.amount;
  if (!amount) {
    console.log('  ✗ Sin monto');
    stillStuck++;
    continue;
  }

  const nameCanon = canonicalize(gemini.name);
  const normForSearch = nameCanon.toLowerCase();

  // Buscar o crear cliente
  let customerId = null;
  const { data: existing } = await sb.from('customers').select('id').eq('user_id', USER_ID).ilike('normalized_name', normForSearch).limit(1);
  if (existing && existing.length > 0) {
    customerId = existing[0].id;
  } else {
    const { data: newCust } = await sb.from('customers').insert({
      full_name: gemini.name, normalized_name: normForSearch,
      canonical_name: normForSearch, phone: '',
      active_label: '', active_label_type: '', user_id: USER_ID,
    }).select('id').single();
    if (newCust) customerId = newCust.id;
  }

  // Crear pago
  const { data: pago, error: pagoErr } = await sb.from('pagos').insert({
    nombre: gemini.name, pago: amount, method: 'Gemini AI',
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
    customer_id: customerId, customer_name: gemini.name,
    item_count: 0, bag_count: 1, status: 'procesar',
    total_amount: amount, user_id: USER_ID,
  });

  // Limpiar cola de revisión y actualizar candidato
  await sb.from('manual_review_queue').delete().eq('id', item.id);
  await sb.from('parsed_payment_candidates').update({ needs_review: false, parse_status: 'rescued_by_gemini' }).eq('id', cand.id);
  if (cand.raw_event_id) {
    await sb.from('raw_notification_events').update({ ingest_status: 'auto_processed' }).eq('id', cand.raw_event_id);
  }

  console.log(`  ✓ Rescatado: ${gemini.name} — Bs. ${amount}`);
  rescued++;

  // Rate limit Gemini free tier: 15 RPM
  await new Promise(r => setTimeout(r, 4500));
}

console.log(`\n━━━ Resumen ━━━`);
console.log(`✓ Rescatados: ${rescued}`);
console.log(`✗ Siguen atascados (verdaderamente sin nombre): ${stillStuck}`);
