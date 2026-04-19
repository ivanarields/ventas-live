import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('.env', 'utf8');
const clean = (v) => v?.replace(/^"/, '').replace(/"$/, '').trim();
const sb = createClient(clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1]), clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1]));
const USER_ID = '13dcb065-6099-4776-982c-18e98ff2b27a';

// Parser actualizado (mismo que la Edge Function)
function parseAmount(text) {
  const m = text.match(/Bs\.?\s*([\d][\d.,]*)/i) || text.match(/\bBOB\s*([\d][\d.,]*)/i);
  if (!m) return null;
  let raw = m[1];
  if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (raw.includes(',')) raw = raw.replace(',', '.');
  const n = parseFloat(raw);
  return isNaN(n) || n <= 0 ? null : Math.round(n * 100) / 100;
}
function parsePayerName(text) {
  const t = text.replace(/[^\w\sÁÉÍÓÚÑáéíóúñ.,|:;$-]/g, ' ').replace(/\s+/g, ' ');
  const patterns = [
    /(?:^|\|\s*)([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,80}?)\s*,\s*te\s+(?:envi\S*|yape\S*|pag\S*|transf\S*)/im,
    /RECIBISTE\s+(?:Bs\.?\s*[\d.,]+\s+)?DE\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60}?)(?:\s+(?:por|con|Bs|en|el|a\s+las)|$)/i,
    /\bde\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60}?)(?:\s+por|\s+con|\s+Bs|\s*$)/,
  ];
  for (const rx of patterns) {
    const m = t.match(rx);
    if (m) {
      const name = m[1].trim().replace(/\s+/g, ' ');
      if (name.length >= 3 && !/^(TE|EL|LA|UN|UNA|DE|POR|CON|ENVI|YAPE|PAGO|BS)$/i.test(name)) return name;
    }
  }
  return null;
}
function canonicalize(n) { return n.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, '').replace(/\s+/g, ' ').trim(); }

// Traer candidates pendientes con su raw event
const { data: pending } = await sb
  .from('parsed_payment_candidates')
  .select('id, raw_event_id, candidate_text, needs_review, raw_notification_events!inner(id, text, big_text, text_lines, title)')
  .eq('needs_review', true);

console.log(`Pendientes a reprocesar: ${pending?.length ?? 0}\n`);

for (const c of pending ?? []) {
  const raw = c.raw_notification_events;
  const candidateText = [raw.big_text, raw.text_lines, raw.text, raw.title].filter(Boolean).join(' | ');
  const amount = parseAmount(candidateText);
  const payer = parsePayerName(candidateText);
  const canonical = payer ? canonicalize(payer) : null;
  let confidence = 0;
  if (amount !== null) confidence += 0.55;
  if (payer) confidence += 0.30;
  const ok = amount !== null && !!payer && confidence >= 0.8;

  console.log(`Candidate ${c.id.slice(0,8)}: amount=${amount} payer="${payer}" conf=${confidence.toFixed(2)} → ${ok ? 'PROMOVER' : 'sigue en revisión'}`);

  if (!ok) continue;

  // Actualizar candidate
  await sb.from('parsed_payment_candidates').update({
    amount, payer_name_raw: payer, payer_name_canonical: canonical,
    confidence_score: confidence, needs_review: false, parse_status: 'parsed_ok'
  }).eq('id', c.id);

  // Crear payments_ui
  await sb.from('payments_ui').insert({
    parsed_candidate_id: c.id,
    canonical_display_name: canonical,
    amount, currency: 'BOB',
    paid_at: new Date().toISOString(),
    match_status: 'auto_reprocessed', review_status: 'auto_confirmed'
  });

  // Crear en pagos
  await sb.from('pagos').insert({
    nombre: payer, pago: amount,
    method: 'Notificación bancaria', status: 'pending',
    date: new Date().toISOString(), user_id: USER_ID
  });

  // Crear pedido
  await sb.from('pedidos').insert({
    customer_name: payer, item_count: 0, bag_count: 1,
    status: 'procesar', total_amount: amount, user_id: USER_ID
  });

  // Eliminar de review queue
  await sb.from('manual_review_queue').delete().eq('parsed_candidate_id', c.id);

  // Actualizar raw event
  await sb.from('raw_notification_events').update({ ingest_status: 'auto_processed_reprocessed' }).eq('id', raw.id);

  console.log(`  ✓ Creado en pagos: ${payer} — Bs${amount}`);
}

console.log('\n── Estado final ──');
const { data: finalPagos } = await sb.from('pagos').select('nombre, pago, date').eq('method', 'Notificación bancaria').order('date', { ascending: false });
console.log(`Pagos de notificación bancaria: ${finalPagos.length}`);
finalPagos.forEach(p => console.log(`  ${p.nombre} — Bs${p.pago}`));
