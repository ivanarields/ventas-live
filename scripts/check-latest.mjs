import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('.env', 'utf8');
const clean = (v) => v?.replace(/^"/, '').replace(/"$/, '').trim();
const sb = createClient(clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1]), clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1]));

// Últimos 5 eventos RAW (para ver si MacroDroid disparó)
const { data: raw } = await sb.from('raw_notification_events')
  .select('id, received_at, app_name, title, text, big_text, ingest_status, raw_hash')
  .order('received_at', { ascending: false }).limit(5);

console.log('== ÚLTIMOS 5 RAW EVENTS ==');
raw?.forEach((r, i) => {
  const fecha = new Date(r.received_at);
  const hace = Math.round((Date.now() - fecha.getTime()) / 1000);
  console.log(`\n[${i+1}] Hace ${hace}s (${fecha.toISOString()})`);
  console.log(`    app: ${r.app_name}`);
  console.log(`    title: "${r.title}"`);
  console.log(`    text: "${r.text}"`);
  console.log(`    big_text: "${r.big_text}"`);
  console.log(`    status: ${r.ingest_status}`);
  console.log(`    hash: ${r.raw_hash?.slice(0,16)}`);
});

// Si no hay eventos recientes, mostrar todos para contexto
if (!raw || raw.length === 0) {
  console.log('❌ NO HAY NINGÚN EVENTO RAW — MacroDroid no envió nada');
}

// Ver candidates de los últimos eventos
console.log('\n\n== PARSED de los últimos eventos ==');
if (raw && raw.length > 0) {
  const ids = raw.map(r => r.id);
  const { data: parsed } = await sb.from('parsed_payment_candidates')
    .select('raw_event_id, amount, payer_name_raw, confidence_score, parse_status')
    .in('raw_event_id', ids);
  parsed?.forEach(p => {
    console.log(`  raw=${p.raw_event_id.slice(0,8)} amount=${p.amount} payer="${p.payer_name_raw}" conf=${p.confidence_score} status=${p.parse_status}`);
  });
}

// Ver últimos pagos (por si llegó pero no lo sabe)
console.log('\n\n== ÚLTIMOS 5 PAGOS EN LA APP ==');
const { data: pagos } = await sb.from('pagos')
  .select('nombre, pago, method, date')
  .order('date', { ascending: false }).limit(5);
pagos?.forEach((p, i) => {
  const fecha = new Date(p.date);
  const hace = Math.round((Date.now() - fecha.getTime()) / 1000);
  console.log(`  [${i+1}] ${p.nombre} — Bs${p.pago} — ${p.method} — hace ${hace}s`);
});

// Ver errores recientes en manual review
console.log('\n\n== ÚLTIMAS REVISIONES PENDIENTES ==');
const { data: rev } = await sb.from('manual_review_queue')
  .select('created_at, reason_code, reason_detail, parsed_payment_candidates!inner(candidate_text)')
  .order('created_at', { ascending: false }).limit(5);
rev?.forEach((r, i) => {
  const hace = Math.round((Date.now() - new Date(r.created_at).getTime()) / 1000);
  console.log(`  [${i+1}] hace ${hace}s — ${r.reason_code} — ${r.reason_detail}`);
  console.log(`       texto: "${r.parsed_payment_candidates.candidate_text?.slice(0,100)}"`);
});
