import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Leer credenciales del .env
const env = readFileSync('.env', 'utf8');
const clean = (v) => v?.replace(/^"/, '').replace(/"$/, '').trim();
const url = clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1]);
const key = clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1]);

const sb = createClient(url, key);

console.log('\n── raw_notification_events (últimas 3):');
const { data: raw } = await sb.from('raw_notification_events').select('id, app_name, ingest_status, received_at').order('received_at', { ascending: false }).limit(3);
console.table(raw);

console.log('\n── parsed_payment_candidates (últimas 3):');
const { data: cand } = await sb.from('parsed_payment_candidates').select('amount, payer_name_raw, confidence_score, needs_review, parse_status').order('created_at', { ascending: false }).limit(3);
console.table(cand);

console.log('\n── payments_ui (últimas 3):');
const { data: ui } = await sb.from('payments_ui').select('canonical_display_name, amount, currency, match_status').order('created_at', { ascending: false }).limit(3);
console.table(ui);

console.log('\n── pagos (auto-ingest, últimas 3):');
const { data: pagos } = await sb.from('pagos').select('nombre, pago, method, status, date').eq('method', 'Notificación bancaria').order('date', { ascending: false }).limit(3);
console.table(pagos);

console.log('\n── manual_review_queue (pendientes):');
const { data: rev } = await sb.from('manual_review_queue').select('reason_code, reason_detail, review_status').eq('review_status', 'pending').order('created_at', { ascending: false }).limit(3);
console.table(rev);
