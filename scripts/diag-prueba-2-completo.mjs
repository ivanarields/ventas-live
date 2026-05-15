// Diagnóstico segunda prueba 2026-05-15 15:19
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const main = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const panel = createClient(process.env.PANEL_SUPABASE_URL, process.env.PANEL_SUPABASE_SERVICE_KEY);

const USER_ID = '13dcb065-6099-4776-982c-18e98ff2b27a';
const desde2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

console.log('=== SESIONES LIVE (todas) ===');
const { data: sessions } = await main
  .from('live_sessions')
  .select('id, scheduled_at, duration, status, notes')
  .eq('user_id', USER_ID)
  .order('scheduled_at', { ascending: false })
  .limit(5);

for (const s of sessions ?? []) {
  const n = typeof s.notes === 'string' ? JSON.parse(s.notes) : s.notes;
  const hStart = n?.started_at ? new Date(n.started_at).toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit',hour12:false}) : '-';
  const hEnd = n?.ended_at ? new Date(n.ended_at).toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit',hour12:false}) : '-';
  const hProc = n?.processed_at ? new Date(n.processed_at).toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit',hour12:false}) : '-';
  console.log(`  session ${s.id} | status=${s.status} | start=${hStart} end=${hEnd} processed=${hProc}`);
}

console.log('\n=== TODAS las evidencias hoy (últimas 2hs) ===');
const { data: evs } = await panel
  .from('evidencias_venta_live')
  .select('id, pedido_live_id, panel_mensaje_id, tipo, descripcion, message_created_at, metadata, media_url')
  .gte('created_at', desde2h)
  .order('message_created_at', { ascending: true });

console.log(`Total: ${evs?.length ?? 0}`);
for (const e of evs ?? []) {
  const hora = e.message_created_at ? new Date(e.message_created_at).toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit',hour12:false}) : '-';
  const meta = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata;
  const sel = meta?.selected_final !== undefined ? `sel=${meta.selected_final}` : '';
  console.log(`  ${hora} ev=${e.id.slice(0,8)} pedidoLive=${e.pedido_live_id?.slice(0,8)} tipo=${e.tipo} ${sel}`);
  console.log(`         desc="${(e.descripcion ?? '').slice(0, 90)}"`);
  console.log(`         media=${(e.media_url ?? '').slice(0, 60)}`);
}

console.log('\n=== TODOS los pedidos_venta_live recientes ===');
const { data: pls } = await panel
  .from('pedidos_venta_live')
  .select('id, cliente_id, fecha_pedido, estado, total_verificado, total_comprobantes, created_at')
  .gte('created_at', desde2h)
  .order('created_at', { ascending: false });
for (const p of pls ?? []) {
  const hora = new Date(p.created_at).toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit',hour12:false});
  console.log(`  ${hora} pedidoLive=${p.id.slice(0,8)} cliente=${p.cliente_id?.slice(0,8)} estado=${p.estado} verif=${p.total_verificado} compro=${p.total_comprobantes}`);
}

console.log('\n=== pagos_venta_live con main_pago_id ===');
const { data: pvls } = await panel
  .from('pagos_venta_live')
  .select('id, main_pago_id, monto, nombre_detectado, comprobante_at, estado, pedido_live_id')
  .gte('created_at', desde2h)
  .order('comprobante_at', { ascending: true });
for (const p of pvls ?? []) {
  const hora = p.comprobante_at ? new Date(p.comprobante_at).toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit',hour12:false}) : '-';
  console.log(`  ${hora} pvl=${p.id.slice(0,8)} main_pago_id=${p.main_pago_id ?? '∅'} Bs ${p.monto} ${p.nombre_detectado} estado=${p.estado}`);
}

console.log('\n=== Simulación de lo que App.tsx ve por pago ===');
const { data: pagos } = await main
  .from('pagos')
  .select('*')
  .eq('user_id', USER_ID)
  .gte('date', desde2h)
  .order('date', { ascending: true });

const pagoIds = (pagos ?? []).map(p => Number(p.id)).filter(Number.isFinite);
const { data: livePagos } = await panel
  .from('pagos_venta_live')
  .select('id,main_pago_id,estado,match_reason')
  .in('main_pago_id', pagoIds);

const liveByPagoId = new Map((livePagos ?? []).map(p => [Number(p.main_pago_id), p]));

// Última sesión completada (incluso procesada)
const { data: lastSess } = await main
  .from('live_sessions')
  .select('notes')
  .eq('user_id', USER_ID)
  .in('status', ['completed', 'live'])
  .ilike('title', 'Procesamiento Live%')
  .order('scheduled_at', { ascending: false })
  .limit(1)
  .maybeSingle();
const lastNotes = typeof lastSess?.notes === 'string' ? JSON.parse(lastSess.notes) : lastSess?.notes;
const sessStart = lastNotes?.started_at;
const sessEnd = lastNotes?.ended_at;
console.log(`Última sesión: ${sessStart} → ${sessEnd}\n`);

for (const p of pagos ?? []) {
  const hora = new Date(p.date).toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit',hour12:false});
  const livePago = liveByPagoId.get(Number(p.id));
  const method = String(p.method ?? '').toLowerCase();

  let origin = 'other';
  if (livePago?.estado === 'pendiente_whatsapp' || livePago?.estado === 'revision_manual') origin = 'whatsapp_pending';
  else if (livePago?.estado === 'verificado_manual' || method.includes('manual')) origin = 'manual';
  else if (livePago?.estado === 'verificado_macrodroid') origin = 'automatic';
  else if (method.includes('notificación bancaria')) origin = 'macrodroid_only';

  const livePaymentId = livePago?.id ?? null;

  // Simulación isUnassignedPayment
  let tab = 'live';
  if (livePaymentId) tab = 'live';
  else if (origin === 'automatic' || origin === 'whatsapp_pending' || origin === 'manual') tab = 'live';
  else if (p.customer_id) {
    if (sessStart && sessEnd) {
      const t = new Date(p.date).getTime();
      const s = new Date(sessStart).getTime();
      const e = new Date(sessEnd).getTime();
      tab = (t < s || t > e) ? 'unassigned' : 'live';
    } else {
      tab = 'live';
    }
  } else {
    tab = 'unassigned';
  }

  console.log(`  pago #${p.id} ${hora} Bs ${p.pago} customer=${p.customer_id ?? '∅'} livePaymentId=${livePaymentId?.slice(0,8) ?? '∅'} origin=${origin} → tab=${tab.toUpperCase()}`);
}
