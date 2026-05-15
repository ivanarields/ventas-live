// Diagnóstico de la prueba real del operador (2026-05-15)
// Mira la última sesión Live, los pagos del día, los pedidos, las evidencias.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const main = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const panel = createClient(process.env.PANEL_SUPABASE_URL, process.env.PANEL_SUPABASE_SERVICE_KEY);

const USER_ID = '13dcb065-6099-4776-982c-18e98ff2b27a';
const HOY_INICIO = '2026-05-15T04:00:00Z'; // 00:00 Bolivia
const HOY_FIN = '2026-05-16T04:00:00Z';

console.log('================================================================');
console.log('DIAGNÓSTICO PRUEBA REAL — Iván — 2026-05-15');
console.log('================================================================\n');

// 1. Última sesión Live
console.log('--- 1) ÚLTIMA SESIÓN LIVE ---');
const { data: sessions } = await main
  .from('live_sessions')
  .select('id, scheduled_at, duration, status, notes, created_at')
  .eq('user_id', USER_ID)
  .order('scheduled_at', { ascending: false })
  .limit(3);

for (const s of sessions ?? []) {
  const notes = typeof s.notes === 'string' ? JSON.parse(s.notes) : s.notes;
  console.log(`session ${s.id}: status=${s.status}, scheduled_at=${s.scheduled_at}, duration=${s.duration}min`);
  console.log(`  started_at: ${notes?.started_at ?? '-'}`);
  console.log(`  ended_at:   ${notes?.ended_at ?? '-'}`);
  console.log(`  processed_at: ${notes?.processed_at ?? '-'}`);
}

// 2. Pagos de hoy
console.log('\n--- 2) PAGOS DE HOY (Bolivia) ---');
const { data: pagos } = await main
  .from('pagos')
  .select('id, nombre, pago, method, status, date, customer_id, live_payment_id, verification_origin, created_at')
  .eq('user_id', USER_ID)
  .gte('date', HOY_INICIO)
  .lt('date', HOY_FIN)
  .order('date', { ascending: true });

for (const p of pagos ?? []) {
  const hora = new Date(p.date).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
  console.log(`#${p.id} ${hora} | Bs ${p.pago} | ${p.nombre} | customer=${p.customer_id ?? 'NULL'} | live_payment=${p.live_payment_id ?? 'NULL'} | origin=${p.verification_origin ?? 'NULL'} | method=${p.method}`);
}

// 3. Pedidos de hoy
console.log('\n--- 3) PEDIDOS DE HOY ---');
const { data: pedidos } = await main
  .from('pedidos')
  .select('id, customer_id, customer_name, total_amount, status, source, label, label_type, date, created_at, updated_at')
  .eq('user_id', USER_ID)
  .gte('date', HOY_INICIO)
  .lt('date', HOY_FIN)
  .order('created_at', { ascending: true });

for (const ped of pedidos ?? []) {
  const hCreated = new Date(ped.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
  const hUpdated = new Date(ped.updated_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
  console.log(`pedido #${ped.id} | ${ped.customer_name} | Bs ${ped.total_amount} | status=${ped.status} | source=${ped.source} | created=${hCreated} | updated=${hUpdated}`);
}

// 4. Pagos venta live (matchings)
console.log('\n--- 4) pagos_venta_live (panel) ---');
const { data: pagosLive } = await panel
  .from('pagos_venta_live')
  .select('id, pedido_live_id, nombre_detectado, monto, comprobante_at, estado, created_at')
  .gte('created_at', HOY_INICIO)
  .lt('created_at', HOY_FIN)
  .order('created_at', { ascending: true });

for (const pl of pagosLive ?? []) {
  const hora = pl.comprobante_at ? new Date(pl.comprobante_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-';
  console.log(`pagoLive #${pl.id} | ${hora} | ${pl.nombre_detectado} | Bs ${pl.monto} | estado=${pl.estado} | pedido_live=${pl.pedido_live_id ?? 'NULL'}`);
}

// 5. Pedidos venta live
console.log('\n--- 5) pedidos_venta_live (panel) ---');
const { data: pedidosLive } = await panel
  .from('pedidos_venta_live')
  .select('id, cliente_id, phone, fecha_pedido, estado, total_verificado, total_comprobantes, total_chat, prendas_count, comprobantes_count, created_at')
  .eq('fecha_pedido', '2026-05-15')
  .order('created_at', { ascending: false });

for (const pl of pedidosLive ?? []) {
  console.log(`pedidoLive #${pl.id} | cliente=${pl.cliente_id} | ${pl.phone} | estado=${pl.estado} | total_verificado=${pl.total_verificado} | total_compro=${pl.total_comprobantes} | total_chat=${pl.total_chat} | prendas=${pl.prendas_count} | compro=${pl.comprobantes_count}`);
}

// 6. Evidencias del pedido más reciente
if (pedidosLive?.length > 0) {
  console.log('\n--- 6) EVIDENCIAS del último pedido_live ---');
  const { data: evidencias } = await panel
    .from('evidencias_venta_live')
    .select('id, tipo, descripcion, message_created_at, media_url, metadata')
    .eq('pedido_live_id', pedidosLive[0].id)
    .order('message_created_at', { ascending: true });

  for (const ev of evidencias ?? []) {
    const hora = ev.message_created_at ? new Date(ev.message_created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-';
    const meta = typeof ev.metadata === 'string' ? JSON.parse(ev.metadata) : ev.metadata;
    const liveRange = meta?.live_range ? `range[${meta.live_range.start_at?.slice(11,16)}-${meta.live_range.end_at?.slice(11,16)}]` : 'sin_range';
    const selected = meta?.selected_final !== undefined ? `sel=${meta.selected_final}` : '';
    console.log(`ev #${ev.id} | ${hora} | tipo=${ev.tipo} | ${liveRange} ${selected} | ${(ev.descripcion ?? '').slice(0, 60)}`);
  }
}

// 7. Mensajes WhatsApp del cliente más reciente del Live
if (pedidosLive?.length > 0) {
  console.log('\n--- 7) Mensajes WhatsApp del cliente del último pedido (últimas 4hs) ---');
  const desde = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data: mensajes } = await panel
    .from('panel_mensajes')
    .select('id, content, direction, has_media, media_url, media_type, created_at')
    .eq('cliente_id', pedidosLive[0].cliente_id)
    .gte('created_at', desde)
    .order('created_at', { ascending: true });

  for (const m of mensajes ?? []) {
    const hora = new Date(m.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
    const tag = m.direction === 'outgoing' ? '[EMPRESA→]' : '[←CLIENTE]';
    const media = m.has_media ? `[FOTO ${m.media_type}]` : '';
    console.log(`${hora} ${tag} ${media} ${(m.content ?? '').slice(0, 80)}`);
  }
}

console.log('\n================================================================');
console.log('FIN DIAGNÓSTICO');
console.log('================================================================');
