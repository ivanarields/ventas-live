import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
const userId = process.env.INGEST_USER_ID || process.env.LIVE_DEFAULT_USER_ID || process.env.STORE_OWNER_USER_ID;

if (!userId) throw new Error('Falta INGEST_USER_ID, LIVE_DEFAULT_USER_ID o STORE_OWNER_USER_ID');

const panelDb = createClient(process.env.PANEL_SUPABASE_URL, process.env.PANEL_SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});
const mainDb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const amount = (value) => Number(value ?? 0) || 0;
const sameAmount = (a, b) => Math.abs(amount(a) - amount(b)) < 0.001;

const { data: liveOrders, error: liveOrdersError } = await panelDb
  .from('pedidos_venta_live')
  .select('id, main_pedido_id, total_verificado')
  .gt('total_verificado', 0)
  .not('main_pedido_id', 'is', null)
  .order('updated_at', { ascending: false });

if (liveOrdersError) throw liveOrdersError;

const mainOrderIds = [...new Set((liveOrders ?? [])
  .map((order) => Number(order.main_pedido_id))
  .filter(Number.isFinite))];

const mainById = new Map();
for (let index = 0; index < mainOrderIds.length; index += 200) {
  const ids = mainOrderIds.slice(index, index + 200);
  const { data, error } = await mainDb
    .from('pedidos')
    .select('id, total_amount')
    .eq('user_id', userId)
    .in('id', ids);
  if (error) throw error;
  for (const order of data ?? []) mainById.set(Number(order.id), order);
}

const mismatches = (liveOrders ?? []).map((liveOrder) => {
  const mainOrder = mainById.get(Number(liveOrder.main_pedido_id));
  return {
    mainId: Number(liveOrder.main_pedido_id),
    expected: amount(liveOrder.total_verificado),
    current: amount(mainOrder?.total_amount),
  };
}).filter((row) => !sameAmount(row.current, row.expected));

console.log(`Modo: ${apply ? 'APLICAR' : 'SIMULACION'} | Pedidos verificados: ${liveOrders?.length ?? 0} | Descuadrados: ${mismatches.length}`);
for (const row of mismatches) console.log(`Pedido principal #${row.mainId}: Bs ${row.current} -> Bs ${row.expected}`);

if (apply) {
  for (const row of mismatches) {
    const { error } = await mainDb
      .from('pedidos')
      .update({ total_amount: row.expected, updated_at: new Date().toISOString() })
      .eq('id', row.mainId)
      .eq('user_id', userId);
    if (error) throw error;
  }
  console.log(`Corregidos: ${mismatches.length}`);
}
