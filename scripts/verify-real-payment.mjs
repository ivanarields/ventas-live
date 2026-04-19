import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env', 'utf8');
const clean = (v) => v?.replace(/^"/, '').replace(/"$/, '').trim();
const url = clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1]);
const key = clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1]);
const sb = createClient(url, key);

console.log('\n========== TODOS LOS RAW EVENTS ==========');
const { data: raw, error: e1 } = await sb.from('raw_notification_events')
  .select('id, received_at, device_id, app_name, app_package, title, text, big_text, text_lines, raw_hash, ingest_status')
  .order('received_at', { ascending: false })
  .limit(10);
if (e1) console.error('Error:', e1);
console.log(`Total eventos: ${raw?.length ?? 0}`);
raw?.forEach((r, i) => {
  console.log(`\n── Evento ${i+1} ──`);
  console.log('  received_at:', r.received_at);
  console.log('  device_id:  ', r.device_id);
  console.log('  app_name:   ', r.app_name);
  console.log('  app_package:', r.app_package);
  console.log('  title:      ', r.title);
  console.log('  text:       ', r.text);
  console.log('  big_text:   ', r.big_text);
  console.log('  text_lines: ', r.text_lines);
  console.log('  raw_hash:   ', r.raw_hash?.slice(0, 16) + '...');
  console.log('  status:     ', r.ingest_status);
});

console.log('\n\n========== PARSED CANDIDATES ==========');
const { data: parsed } = await sb.from('parsed_payment_candidates')
  .select('raw_event_id, amount, payer_name_raw, confidence_score, needs_review, parse_status, candidate_text')
  .order('created_at', { ascending: false }).limit(10);
console.log(`Total: ${parsed?.length ?? 0}`);
parsed?.forEach((p, i) => {
  console.log(`\n  [${i+1}] raw_event=${p.raw_event_id?.slice(0,8)} amount=${p.amount} payer="${p.payer_name_raw}" conf=${p.confidence_score} status=${p.parse_status}`);
  console.log(`      texto parseado: "${p.candidate_text?.slice(0, 120)}..."`);
});

console.log('\n\n========== PAYMENTS UI ==========');
const { data: ui } = await sb.from('payments_ui')
  .select('canonical_display_name, amount, currency, match_status, created_at')
  .order('created_at', { ascending: false }).limit(10);
console.log(`Total: ${ui?.length ?? 0}`);
ui?.forEach((r, i) => console.log(`  [${i+1}] ${r.canonical_display_name} — ${r.amount} ${r.currency} — ${r.match_status} — ${r.created_at}`));

console.log('\n\n========== TABLA PAGOS (auto-ingest) ==========');
const { data: pagos } = await sb.from('pagos')
  .select('nombre, pago, method, status, date')
  .eq('method', 'Notificación bancaria')
  .order('date', { ascending: false }).limit(10);
console.log(`Total: ${pagos?.length ?? 0}`);
pagos?.forEach((p, i) => console.log(`  [${i+1}] ${p.nombre} — Bs${p.pago} — ${p.date}`));

console.log('\n\n========== MANUAL REVIEW QUEUE ==========');
const { data: rev } = await sb.from('manual_review_queue')
  .select('reason_code, reason_detail, review_status, created_at')
  .order('created_at', { ascending: false }).limit(10);
console.log(`Total pendientes: ${rev?.length ?? 0}`);
rev?.forEach((r, i) => console.log(`  [${i+1}] ${r.reason_code} — ${r.reason_detail} — ${r.review_status}`));
