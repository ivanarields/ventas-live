import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env', 'utf8');
const clean = (v) => v?.replace(/^"/, '').replace(/"$/, '').trim();
const url = clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1]);
const key = clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1]);
const userId = clean(env.match(/^INGEST_USER_ID=(.+)/m)?.[1]) || '13dcb065-6099-4776-982c-18e98ff2b27a';

const sb = createClient(url, key);

// Buscar raw events con duplicate_skipped en las últimas 2 horas
const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const { data: blocked } = await sb
  .from('raw_notification_events')
  .select('id, received_at, app_name, title, text')
  .eq('ingest_status', 'duplicate_skipped')
  .gte('received_at', twoHoursAgo)
  .order('received_at', { ascending: false });

console.log(`\nEncontrados ${blocked?.length ?? 0} eventos marcados como duplicate_skipped en las últimas 2h:\n`);

for (const raw of blocked ?? []) {
  console.log(`─ ${raw.received_at}`);
  console.log(`  text: ${raw.text}`);

  // Buscar su candidate
  const { data: cands } = await sb
    .from('parsed_payment_candidates')
    .select('id, amount, payer_name_raw, payer_name_canonical, confidence_score')
    .eq('raw_event_id', raw.id)
    .limit(1);

  const cand = cands?.[0];
  if (!cand) { console.log('  (sin candidate, skip)'); continue; }

  console.log(`  parsed: ${cand.payer_name_raw} → Bs. ${cand.amount} (conf ${cand.confidence_score})`);

  // Insertar en pagos
  const { data: pago, error: pagoErr } = await sb
    .from('pagos')
    .insert({
      nombre: cand.payer_name_raw,
      pago: cand.amount,
      method: 'Notificación bancaria',
      status: 'pending',
      date: raw.received_at,
      user_id: userId,
    })
    .select()
    .single();

  if (pagoErr) { console.log(`  ✗ error insertando en pagos: ${pagoErr.message}`); continue; }

  // Pedido en procesar
  await sb.from('pedidos').insert({
    customer_name: cand.payer_name_raw,
    item_count: 0,
    bag_count: 1,
    status: 'procesar',
    total_amount: cand.amount,
    user_id: userId,
  });

  // Actualizar payments_ui existente (si existe) quitando is_duplicate
  await sb.from('payments_ui')
    .update({ is_duplicate: false })
    .eq('parsed_candidate_id', cand.id);

  // Marcar raw como procesado
  await sb.from('raw_notification_events')
    .update({ ingest_status: 'auto_processed' })
    .eq('id', raw.id);

  console.log(`  ✓ Rescatado: pago ${pago.id} insertado + pedido creado`);
}
console.log('\nListo.\n');
