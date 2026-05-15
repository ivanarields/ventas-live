// Backfill: rellenar verification_origin y live_payment_id en la tabla pagos
// para todas las filas con method='Notificación bancaria' donde el campo está NULL.
//
// Pasos:
// 1) Para cada pago MacroDroid sin verification_origin, busca en pagos_venta_live
//    si hay un match (por main_pago_id = pago.id).
// 2) Si hay match → verification_origin='verificado_macrodroid' + live_payment_id=match.id
// 3) Si no hay match → verification_origin='macrodroid_only'
//
// Modo dry-run por defecto. Pasar --apply para escribir.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

const main = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const panel = createClient(process.env.PANEL_SUPABASE_URL, process.env.PANEL_SUPABASE_SERVICE_KEY);

console.log(`Modo: ${APPLY ? 'APPLY (escribirá BD)' : 'DRY-RUN (solo muestra)'}\n`);

// Trae todos los pagos MacroDroid sin verification_origin
const { data: pagos, error } = await main
  .from('pagos')
  .select('id, pago, nombre, date, method, verification_origin, live_payment_id')
  .eq('method', 'Notificación bancaria')
  .is('verification_origin', null)
  .order('date', { ascending: false })
  .limit(500);

if (error) {
  console.error('Error trayendo pagos:', error);
  process.exit(1);
}

console.log(`Pagos a procesar: ${pagos?.length ?? 0}\n`);

let actualizadosVerificados = 0;
let actualizadosMacrodroid = 0;

for (const p of pagos ?? []) {
  // ¿Hay un pagos_venta_live que tiene este pago como main_pago_id?
  const { data: pvl } = await panel
    .from('pagos_venta_live')
    .select('id, estado')
    .eq('main_pago_id', p.id)
    .maybeSingle();

  if (pvl) {
    const hora = new Date(p.date).toLocaleString('es-BO', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    console.log(`  pago #${p.id} (${hora} Bs ${p.pago} ${p.nombre}) → VERIFICADO (live_payment_id=${pvl.id})`);
    actualizadosVerificados += 1;
    if (APPLY) {
      const { error: upErr } = await main
        .from('pagos')
        .update({ verification_origin: 'verificado_macrodroid', live_payment_id: pvl.id })
        .eq('id', p.id);
      if (upErr) console.error('  ERROR update:', upErr);
    }
  } else {
    const hora = new Date(p.date).toLocaleString('es-BO', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    console.log(`  pago #${p.id} (${hora} Bs ${p.pago} ${p.nombre}) → MACRODROID_ONLY`);
    actualizadosMacrodroid += 1;
    if (APPLY) {
      const { error: upErr } = await main
        .from('pagos')
        .update({ verification_origin: 'macrodroid_only' })
        .eq('id', p.id);
      if (upErr) console.error('  ERROR update:', upErr);
    }
  }
}

console.log(`\nResumen:`);
console.log(`  verificado_macrodroid: ${actualizadosVerificados}`);
console.log(`  macrodroid_only:       ${actualizadosMacrodroid}`);
console.log(`  total:                 ${actualizadosVerificados + actualizadosMacrodroid}`);
console.log(APPLY ? '\n✅ Aplicado a la BD' : '\nℹ️  Dry-run. Para aplicar: node scripts/backfill-pagos-verification-origin.mjs --apply');
