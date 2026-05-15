// Diagnóstico completo sin filtros restrictivos
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const main = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const panel = createClient(process.env.PANEL_SUPABASE_URL, process.env.PANEL_SUPABASE_SERVICE_KEY);

const USER_ID = '13dcb065-6099-4776-982c-18e98ff2b27a';
const HOY_INICIO = '2026-05-15T04:00:00Z';
const HOY_FIN = '2026-05-16T04:00:00Z';

console.log('================================================================');
console.log('DIAGNÓSTICO COMPLETO 2026-05-15');
console.log('================================================================\n');

// 1. TODOS los pagos recientes (últimas 8 horas)
console.log('--- 1) PAGOS (últimas 8 hs) — tabla pagos ---');
const desde8h = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
const { data: pagos, error: errPagos } = await main
  .from('pagos')
  .select('*')
  .eq('user_id', USER_ID)
  .gte('date', desde8h)
  .order('date', { ascending: true });

if (errPagos) console.log('ERROR pagos:', errPagos);
console.log(`Total pagos: ${pagos?.length ?? 0}`);
for (const p of pagos ?? []) {
  const hora = new Date(p.date).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
  console.log(`  #${p.id} ${hora} | Bs ${p.pago} | nombre="${p.nombre}" | customer=${p.customer_id} | live_pid=${p.live_payment_id ?? '∅'} | origin=${p.verification_origin ?? '∅'} | method="${p.method}" | status=${p.status}`);
}

// 2. TODOS los pagos_venta_live recientes
console.log('\n--- 2) pagos_venta_live (últimas 8 hs) ---');
const { data: pvl } = await panel
  .from('pagos_venta_live')
  .select('*')
  .gte('created_at', desde8h)
  .order('created_at', { ascending: true });

console.log(`Total pagos_venta_live: ${pvl?.length ?? 0}`);
for (const p of pvl ?? []) {
  const hCreated = new Date(p.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
  const hCompro = p.comprobante_at ? new Date(p.comprobante_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-';
  console.log(`  #${p.id}`);
  console.log(`    nombre="${p.nombre_detectado}" Bs ${p.monto} estado=${p.estado}`);
  console.log(`    pedido_live=${p.pedido_live_id ?? '∅'}`);
  console.log(`    comprobante_at=${hCompro} created_at=${hCreated}`);
  console.log(`    pago_id=${p.pago_id ?? '∅'}`);
}

// 3. TODOS los pedidos_venta_live de hoy
console.log('\n--- 3) pedidos_venta_live (hoy) ---');
const { data: pedidosLive } = await panel
  .from('pedidos_venta_live')
  .select('*')
  .gte('created_at', desde8h)
  .order('created_at', { ascending: true });

console.log(`Total pedidos_venta_live: ${pedidosLive?.length ?? 0}`);
for (const p of pedidosLive ?? []) {
  const hora = new Date(p.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
  console.log(`  #${p.id} ${hora} | cliente=${p.cliente_id} | phone=${p.phone} | fecha=${p.fecha_pedido} | estado=${p.estado}`);
  console.log(`    total_verificado=${p.total_verificado} total_compro=${p.total_comprobantes} total_chat=${p.total_chat}`);
  console.log(`    prendas=${p.prendas_count} compro=${p.comprobantes_count}`);
}

// 4. Pedidos del main (hoy)
console.log('\n--- 4) pedidos main (hoy) ---');
const { data: pedidosMain } = await main
  .from('pedidos')
  .select('*')
  .eq('user_id', USER_ID)
  .gte('date', HOY_INICIO)
  .lt('date', HOY_FIN)
  .order('created_at', { ascending: true });

console.log(`Total pedidos main: ${pedidosMain?.length ?? 0}`);
for (const p of pedidosMain ?? []) {
  const hCreated = new Date(p.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
  const hUpdated = new Date(p.updated_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
  console.log(`  #${p.id} | ${p.customer_name} | Bs ${p.total_amount} | status=${p.status} | source=${p.source} | label="${p.label}" | created=${hCreated} updated=${hUpdated}`);
}

// 5. Mensajes WhatsApp últimas 4 horas
console.log('\n--- 5) panel_mensajes (últimas 4 hs) ---');
const desde4h = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
const { data: msgs } = await panel
  .from('panel_mensajes')
  .select('id, cliente_id, content, direction, has_media, media_url, media_type, created_at')
  .gte('created_at', desde4h)
  .order('created_at', { ascending: true });

console.log(`Total mensajes: ${msgs?.length ?? 0}`);
let lastClient = null;
for (const m of msgs ?? []) {
  if (m.cliente_id !== lastClient) {
    console.log(`\n  >> cliente ${m.cliente_id}`);
    lastClient = m.cliente_id;
  }
  const hora = new Date(m.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
  const tag = m.direction === 'outgoing' ? '[EMP→]' : '[CLI→]';
  const media = m.has_media ? `[FOTO]` : '';
  console.log(`  ${hora} ${tag} ${media} ${(m.content ?? '').slice(0, 60)}`);
}

// 6. Evidencias últimas 4 horas
console.log('\n--- 6) evidencias_venta_live (últimas 4 hs) ---');
const { data: evs } = await panel
  .from('evidencias_venta_live')
  .select('*')
  .gte('created_at', desde4h)
  .order('message_created_at', { ascending: true });

console.log(`Total evidencias: ${evs?.length ?? 0}`);
for (const e of evs ?? []) {
  const hora = e.message_created_at ? new Date(e.message_created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-';
  const meta = typeof e.metadata === 'string' ? (e.metadata ? JSON.parse(e.metadata) : {}) : (e.metadata ?? {});
  const range = meta?.live_range ? `range[${meta.live_range.start_at?.slice(11,16)}→${meta.live_range.end_at?.slice(11,16)}]` : 'sin_range';
  const sel = meta?.selected_final !== undefined ? `sel=${meta.selected_final}` : '';
  const aiSel = meta?.selected_by_ai !== undefined ? `aiSel=${meta.selected_by_ai}` : '';
  console.log(`  #${e.id} ${hora} tipo=${e.tipo} ${range} ${sel} ${aiSel}`);
  console.log(`    desc="${(e.descripcion ?? '').slice(0, 80)}"`);
  if (meta?.extracted) console.log(`    extraido: cliente="${meta.extracted.cliente}" monto=${meta.extracted.monto} hora=${meta.extracted.hora}`);
}

console.log('\n================================================================');
console.log('FIN');
console.log('================================================================');
