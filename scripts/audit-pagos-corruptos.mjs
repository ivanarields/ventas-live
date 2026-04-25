// AUDITORÍA SOLO LECTURA — no modifica nada, solo lee la tabla pagos
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env', 'utf8');
const clean = (v) => v?.replace(/^"/, '').replace(/"$/, '').trim();
const sb = createClient(
  clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1]),
  clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1])
);

console.log('════════════════════════════════════════════════════');
console.log('  AUDITORÍA DE PAGOS — Solo lectura, no modifica nada');
console.log('════════════════════════════════════════════════════\n');

// 1. Total de pagos
const { count: total } = await sb.from('pagos').select('*', { count: 'exact', head: true });
console.log(`📊 Total de pagos en la BD: ${total}\n`);

// 2. Pagos con nombre NULL o vacío
const { data: sinNombre, count: countSinNombre } = await sb.from('pagos')
  .select('id, nombre, pago, method, date, user_id', { count: 'exact' })
  .or('nombre.is.null,nombre.eq.')
  .order('date', { ascending: false });
console.log(`❌ Pagos con nombre NULL o vacío: ${countSinNombre}`);
if (sinNombre?.length) {
  sinNombre.slice(0, 10).forEach(p => {
    console.log(`   - ${p.date?.slice(0,10)} | Bs ${p.pago} | ${p.method} | user=${p.user_id?.slice(0,8)}`);
  });
  if (sinNombre.length > 10) console.log(`   ... y ${sinNombre.length - 10} más`);
}
console.log();

// 3. Pagos con nombres tipo placeholder (PAGO, YAPE, TRANSFERENCIA, etc.)
const patrones = ['PAGO%', '%YAPE%', 'YAPE', 'TRANSFERENCIA%', 'DEPOSITO%', 'BS %', 'MONTO%', 'SIN%'];
console.log('🚨 Pagos con nombres sospechosos (placeholders tipo "PAGO Yape"):');
const sospechosos = [];
for (const pat of patrones) {
  const { data } = await sb.from('pagos')
    .select('id, nombre, pago, method, date, user_id')
    .ilike('nombre', pat)
    .order('date', { ascending: false })
    .limit(20);
  if (data?.length) sospechosos.push(...data);
}
// Deduplicar por id
const uniqSospechosos = [...new Map(sospechosos.map(p => [p.id, p])).values()];
console.log(`   Total encontrados: ${uniqSospechosos.length}`);
uniqSospechosos.slice(0, 20).forEach(p => {
  console.log(`   - "${p.nombre}" | Bs ${p.pago} | ${p.method} | ${p.date?.slice(0,10)}`);
});
console.log();

// 4. Pagos con nombre MUY corto (1-3 caracteres) - probablemente fragmentos
const { data: cortos } = await sb.from('pagos')
  .select('id, nombre, pago, method, date')
  .not('nombre', 'is', null)
  .order('date', { ascending: false })
  .limit(2000);
const nombresCortos = cortos?.filter(p => p.nombre && p.nombre.trim().length <= 3 && p.nombre.trim() !== '') || [];
console.log(`⚠️  Pagos con nombre ≤ 3 caracteres (posibles fragmentos): ${nombresCortos.length}`);
nombresCortos.slice(0, 15).forEach(p => {
  console.log(`   - "${p.nombre}" | Bs ${p.pago} | ${p.method} | ${p.date?.slice(0,10)}`);
});
console.log();

// 5. Pagos con nombres que contienen números (raro en nombres reales)
const { data: conNumeros } = await sb.from('pagos')
  .select('id, nombre, pago, method, date')
  .not('nombre', 'is', null)
  .order('date', { ascending: false })
  .limit(2000);
const nombresConNumeros = conNumeros?.filter(p => p.nombre && /\d/.test(p.nombre)) || [];
console.log(`⚠️  Pagos con números en el nombre (ej: "PAGO 200"): ${nombresConNumeros.length}`);
nombresConNumeros.slice(0, 15).forEach(p => {
  console.log(`   - "${p.nombre}" | Bs ${p.pago} | ${p.method} | ${p.date?.slice(0,10)}`);
});
console.log();

// 6. Cola de revisión manual — pagos bloqueados que deberían haber entrado
const { count: countRevision } = await sb.from('manual_review_queue').select('*', { count: 'exact', head: true });
console.log(`📋 Items en cola de revisión manual: ${countRevision}`);
const { data: revision } = await sb.from('manual_review_queue')
  .select('created_at, reason_code, reason_detail')
  .order('created_at', { ascending: false })
  .limit(10);
revision?.forEach(r => {
  console.log(`   - ${r.created_at?.slice(0,19)} | ${r.reason_code} | ${r.reason_detail?.slice(0,80)}`);
});
console.log();

// 7. Distribución de method
const { data: methods } = await sb.from('pagos').select('method');
const methodCount = {};
methods?.forEach(p => {
  const m = p.method || '(null)';
  methodCount[m] = (methodCount[m] || 0) + 1;
});
console.log('📈 Distribución por método de pago:');
Object.entries(methodCount).sort((a,b) => b[1]-a[1]).forEach(([m, c]) => {
  console.log(`   ${m}: ${c}`);
});
console.log();

// 8. user_id count (confirmar que son tus datos reales)
const { data: users } = await sb.from('pagos').select('user_id');
const userCount = {};
users?.forEach(p => {
  const u = p.user_id || '(null)';
  userCount[u] = (userCount[u] || 0) + 1;
});
console.log('👤 Pagos por user_id:');
Object.entries(userCount).forEach(([u, c]) => {
  console.log(`   ${u}: ${c} pagos`);
});
console.log();

console.log('════════════════════════════════════════════════════');
console.log('  RESUMEN RÁPIDO:');
console.log(`  • Sin nombre (NULL/vacío): ${countSinNombre || 0}`);
console.log(`  • Placeholders sospechosos: ${uniqSospechosos.length}`);
console.log(`  • Nombres cortos (≤3 chars): ${nombresCortos.length}`);
console.log(`  • Con números en el nombre: ${nombresConNumeros.length}`);
console.log(`  • En cola manual sin procesar: ${countRevision || 0}`);
console.log('════════════════════════════════════════════════════');
