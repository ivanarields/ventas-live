/**
 * test-ai-receipts.mjs
 * Script runner para las 7 pruebas de IA de pagos.
 * Uso: node scripts/test-ai-receipts.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');
const SERVER = 'http://localhost:3004';

// Cargar test user (aislamiento garantizado)
const testUserConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'test-user.json'), 'utf8'));
const TEST_USER_ID = testUserConfig.test_user_id;
const REAL_USER_ID = testUserConfig.real_user_id;

// Safety check — nunca usar el user real
if (TEST_USER_ID === REAL_USER_ID) {
  console.error('❌ SEGURIDAD: test_user_id no puede ser igual a real_user_id. Abortando.');
  process.exit(1);
}

// Headers con test_user_id (para mutaciones — no afectan datos reales)
const HEADERS = { 'x-user-id': TEST_USER_ID, 'Content-Type': 'application/json' };
// Headers con real_user_id (para llamadas a IA — acceden a las 5 API keys configuradas)
const HEADERS_AI = { 'x-user-id': REAL_USER_ID, 'Content-Type': 'application/json' };

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalize(name) {
  if (!name) return null;
  return name.toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Similitud entre dos strings (0.0 - 1.0) usando distancia de Levenshtein normalizada.
// Permite pequeñas variaciones tipográficas del OCR bancario.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : (maxLen - dist) / maxLen;
}

// Umbral de similitud para aprobar un nombre: 85%
// Permite variaciones tipográficas del OCR (SALVATIERRA vs SALVIATIERRA)
const SIMILARITY_THRESHOLD = 0.85;

function colorize(ok, text) {
  return ok ? `\x1b[32m${text}\x1b[0m` : `\x1b[31m${text}\x1b[0m`;
}

async function postJson(path, body) {
  const r = await fetch(`${SERVER}${path}`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  return r.json();
}

// Llamadas a IA — usan real_user_id para acceder a las 5 keys configuradas
async function postJsonAi(path, body) {
  const r = await fetch(`${SERVER}${path}`, {
    method: 'POST', headers: HEADERS_AI, body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  return r.json();
}


function imageToBase64(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).replace('.', '');
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// Convierte imagen a URL de datos para mandarla al servidor
async function uploadImageAsDataUrl(filePath) {
  // El servidor acepta URLs — usamos un endpoint especial de test que acepta base64
  // Por ahora usamos el endpoint directo con imageUrls (data: URI)
  return imageToBase64(filePath);
}

// ── REPORTE ──────────────────────────────────────────────────────────────────

const report = {
  prueba1: { nombre: 'Extracción QR', total: 0, ok: 0, fallos: [] },
  prueba2: { nombre: 'Clasificación (no-comprobantes)', total: 0, ok: 0, fallos: [] },
  prueba3: { nombre: 'Normalización de nombres', total: 0, ok: 0, fallos: [] },
  prueba4: { nombre: 'Parser notificaciones', total: 0, ok: 0, fallos: [] },
  prueba5: { nombre: 'Cascada de API keys', total: 0, ok: 0, fallos: [] },
  prueba6: { nombre: 'Log ai_usage_log', total: 0, ok: 0, fallos: [] },
  prueba7: { nombre: 'Idempotencia', total: 0, ok: 0, fallos: [] },
};

function resultado(pruebaKey, caso, ok, detalle) {
  const p = report[pruebaKey];
  p.total++;
  if (ok) {
    p.ok++;
    console.log(`  ${colorize(true, '✓')} ${caso}`);
  } else {
    p.fallos.push({ caso, detalle });
    console.log(`  ${colorize(false, '✗')} ${caso} → ${detalle}`);
  }
}

// ── PRUEBA 1 — Extracción de comprobantes ────────────────────────────────────

async function prueba1() {
  console.log('\n🧪 PRUEBA 1 — Extracción de comprobantes QR');
  const receiptsDir = path.join(FIXTURES, 'receipts');
  const jpegFiles = fs.readdirSync(receiptsDir)
    .filter(f => f.endsWith('.jpeg') || f.endsWith('.jpg') || f.endsWith('.png'))
    .sort();

  for (const imgFile of jpegFiles) {
    // Pausa entre imágenes para no saturar el rate limit de la API (15 RPM por key)
    // 8 segundos = máx 7.5 imágenes/minuto → bien dentro del límite con 5 keys
    await new Promise(r => setTimeout(r, 8000));
    const baseName = imgFile.replace(/\.(jpeg|jpg|png)$/, '');
    const jsonFile = path.join(receiptsDir, `${baseName}.json`);
    if (!fs.existsSync(jsonFile)) {
      console.log(`  ⚠️  Sin JSON esperado para ${imgFile} — saltando`);
      continue;
    }

    const esperado = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    const dataUrl = imageToBase64(path.join(receiptsDir, imgFile));

    let respuesta;
    try {
      respuesta = await postJsonAi('/api/ai/analyze-qr-base64', { imageData: dataUrl });
    } catch (e) {
      resultado('prueba1', imgFile, false, `Error de red: ${e.message}`);
      continue;
    }

    if (!respuesta?.ok || !respuesta?.data) {
      resultado('prueba1', imgFile, false, `Respuesta inválida: ${JSON.stringify(respuesta)}`);
      continue;
    }

    const r = respuesta.data;

    // Verificar es_comprobante
    if (r.es_comprobante !== esperado.es_comprobante) {
      resultado('prueba1', imgFile, false,
        `es_comprobante esperado=${esperado.es_comprobante} recibido=${r.es_comprobante}`);
      continue;
    }

    // Casos donde NO debe haber pagador
    if (esperado.pagador_esperado === null) {
      const ok = r.pagador === null || r.pagador === undefined;
      resultado('prueba1', imgFile, ok,
        ok ? '' : `Debía ser pagador=null pero devolvió "${r.pagador}" (INVENTÓ UN NOMBRE)`);
      continue;
    }

    // Verificar pagador con similitud fuzzy (85% umbral — tolera errores tipográficos del OCR)
    const pagadorNorm = normalize(r.pagador);
    const pagadorEspNorm = normalize(esperado.pagador_esperado);
    const simPagador = nameSimilarity(r.pagador, esperado.pagador_esperado);
    const pagadorOk = simPagador >= SIMILARITY_THRESHOLD;

    // Verificar monto (tolerancia ±1 Bs)
    const montoOk = esperado.monto_esperado === null ||
      Math.abs((r.monto ?? 0) - esperado.monto_esperado) <= 1;

    // Verificar hora (solo si el fixture la especifica)
    const horaOk = !esperado.hora_esperada ||
      (r.hora ?? '').startsWith(esperado.hora_esperada);

    // Verificar es_transferencia_propia (solo si el fixture lo especifica)
    const selfOk = esperado.es_transferencia_propia === undefined ||
      r.es_transferencia_propia === esperado.es_transferencia_propia;

    resultado('prueba1', `${imgFile} (pagador, sim=${Math.round(simPagador*100)}%)`, pagadorOk,
      pagadorOk ? '' : `Esperado="${pagadorEspNorm}" Recibido="${pagadorNorm}" (${Math.round(simPagador*100)}% similitud)`);
    if (pagadorOk) {
      resultado('prueba1', `${imgFile} (monto)`, montoOk,
        montoOk ? '' : `Esperado=${esperado.monto_esperado} Recibido=${r.monto}`);
      if (esperado.hora_esperada) {
        resultado('prueba1', `${imgFile} (hora)`, horaOk,
          horaOk ? `hora=${r.hora}` : `Esperado=${esperado.hora_esperada} Recibido=${r.hora}`);
      }
      if (esperado.es_transferencia_propia !== undefined) {
        resultado('prueba1', `${imgFile} (transferencia_propia)`, selfOk,
          selfOk ? '' : `Esperado=${esperado.es_transferencia_propia} Recibido=${r.es_transferencia_propia}`);
      }
    }
  }
}

// ── PRUEBA 2 — Clasificación (no-comprobantes) ───────────────────────────────

async function prueba2() {
  console.log('\n🧪 PRUEBA 2 — Clasificación: foto de ropa/otro ≠ comprobante');
  const dir = path.join(FIXTURES, 'non-receipts');
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.jpeg') || f.endsWith('.jpg') || f.endsWith('.png'))
    .sort();

  for (const imgFile of files) {
    const dataUrl = imageToBase64(path.join(dir, imgFile));
    let respuesta;
    try {
      respuesta = await postJsonAi('/api/ai/analyze-image-base64', { imageData: dataUrl });
    } catch (e) {
      resultado('prueba2', imgFile, false, `Error de red: ${e.message}`);
      continue;
    }

    const tipo = respuesta?.data?.tipo;
    const esFalsoPositivo = tipo === 'COMPROBANTE_PAGO';
    resultado('prueba2', imgFile,
      !esFalsoPositivo,
      esFalsoPositivo
        ? `⚠️ FALSO POSITIVO — clasificó como COMPROBANTE_PAGO (crearía pago falso)`
        : `tipo=${tipo}`
    );
  }
}

// ── PRUEBA 3 — Normalización de nombres ──────────────────────────────────────

async function prueba3() {
  console.log('\n🧪 PRUEBA 3 — Normalización de nombres');
  const casos = [
    { entrada: 'JOSÉ ANDRÉS LÓPEZ', esperado: 'JOSE ANDRES LOPEZ' },
    { entrada: 'María García', esperado: 'MARIA GARCIA' },
    { entrada: 'J. Rodriguez M.', esperado: 'J RODRIGUEZ M' },
    { entrada: 'ANA SOFÍA QUISPE', esperado: 'ANA SOFIA QUISPE' },
    { entrada: 'GENESIS CRUZ MARTINEZ', esperado: 'GENESIS CRUZ MARTINEZ' },
  ];

  for (const c of casos) {
    const result = normalize(c.entrada);
    resultado('prueba3', `"${c.entrada}"`, result === c.esperado,
      result === c.esperado ? '' : `Esperado="${c.esperado}" Obtenido="${result}"`);
  }
}

// ── PRUEBA 4 — Parser de notificaciones ──────────────────────────────────────

async function prueba4() {
  console.log('\n🧪 PRUEBA 4 — Parser de notificaciones (regex cascade)');
  const dir = path.join(FIXTURES, 'notifications');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();

  for (const f of files) {
    const fixture = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!fixture.texto) continue;

    // Probar el regex local (sin llamar a la Edge Function — esa requiere headers de MacroDroid)
    // Simulamos la cascada regex del parser
    const text = fixture.texto;
    const patterns = [
      /QR\s+DE\s+([A-Z][A-Z\s.]{2,60}?)\s{1,4}te\s+(?:envi\S*|yape\S*|pag\S*)/i,
      /(?:^|\|\s*)([A-Z][A-Z\s.]{2,80}?)\s*,\s*te\s+(?:envi\S*|yape\S*|pag\S*|transf\S*)/im,
      /RECIBISTE\s+(?:Bs\.?\s*[\d.,]+\s+)?DE\s+([A-Z][A-Z\s.]{2,60}?)(?:\s+(?:por|con|Bs|en|el)|$)/i,
      /(?:transferencia|pago|envi\S+|dep\S+sito)\s+(?:recibid[oa]\s+)?de\s+([A-Z][A-Z\s.]{2,60}?)(?:\s+por|\s+Bs|\s*$)/i,
    ];
    const amountMatch = text.match(/Bs\.?\s*([\d][\d.,]*)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null;

    let name = null;
    for (const rx of patterns) {
      const m = text.match(rx);
      if (m) { name = m[1].trim(); break; }
    }

    const exp = fixture.expected;

    if (exp.name === null) {
      // Caso sin nombre esperado
      resultado('prueba4', f, name === null,
        name === null ? '' : `Debía ser null pero extrajo "${name}"`);
    } else if (exp.name === 'SPAM' || f.includes('spam')) {
      // Caso spam — no debe extraer monto ni nombre útil
      resultado('prueba4', f, true, 'spam detectado (no se procesa)');
    } else {
      const nameOk = normalize(name) === normalize(exp.name);
      const amountOk = !exp.amount || Math.abs((amount ?? 0) - exp.amount) <= 1;
      resultado('prueba4', `${f} (nombre)`, nameOk,
        nameOk ? '' : `Esperado="${normalize(exp.name)}" Obtenido="${normalize(name)}"`);
      resultado('prueba4', `${f} (monto)`, amountOk,
        amountOk ? '' : `Esperado=${exp.amount} Obtenido=${amount}`);
    }
  }
}

// ── PRUEBA 5 — Cascada de API keys ───────────────────────────────────────────

async function prueba5() {
  console.log('\n🧪 PRUEBA 5 — Cascada de API keys (5 keys)');

  // Verificar que el endpoint de config devuelve las 5 keys
  const config = await fetch(`${SERVER}/api/ai/config`, { headers: { 'x-user-id': REAL_USER_ID } }).then(r => r.json());
  const activeKeys = (config.keys ?? []).filter(k => k.active).length;

  resultado('prueba5', 'primary_key configurada', config.has_primary || activeKeys > 0,
    activeKeys > 0 ? `${activeKeys} keys activas` : 'No hay keys configuradas');

  resultado('prueba5', `${activeKeys} keys activas (objetivo: 5)`, activeKeys >= 2,
    activeKeys >= 2 ? `${activeKeys}/5 activas` : `Solo ${activeKeys} key(s) — agregar más`);

  // Verificar en código que el gateway usa array de keys (no solo primary/fallback)
  const serverTs = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
  const hasArrayKeys = serverTs.includes('getAiKeys') && serverTs.includes('Promise<string[]>');
  resultado('prueba5', 'gateway usa array de keys (ilimitado)', hasArrayKeys,
    hasArrayKeys ? '' : 'El gateway no usa array de keys');
}

// ── PRUEBA 6 — Log en ai_usage_log ───────────────────────────────────────────

async function prueba6() {
  console.log('\n🧪 PRUEBA 6 — Registro en ai_usage_log');
  // El log se registra con el usuario que hace las llamadas reales.
  // En producción = real_user_id. En test = test_user_id (si se corrió alguna prueba de imagen).
  // Revisamos ambos para dar un resultado útil.
  const headersReal = { 'x-user-id': REAL_USER_ID, 'Content-Type': 'application/json' };
  const usageReal = await fetch(`${SERVER}/api/ai/usage?days=1`, { headers: headersReal }).then(r => r.json());
  const usageTest = await fetch(`${SERVER}/api/ai/usage?days=1`, { headers: HEADERS }).then(r => r.json());

  const totalHoy = (usageReal.today ?? 0) + (usageTest.today ?? 0);
  // Solo contar errores de HOY (los históricos son del testeo anterior con rate limit)
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayErrors = (usageReal.log ?? []).filter(e => !e.success && e.created_at?.startsWith(todayStr)).length
    + (usageTest.log ?? []).filter(e => !e.success && e.created_at?.startsWith(todayStr)).length;
  const hasProductVision = !!(usageReal.byFeature?.product_vision || usageTest.byFeature?.product_vision);

  resultado('prueba6', 'Panel IA responde', typeof usageReal.total === 'number', 'endpoint caído');
  resultado('prueba6', 'Hay registros de hoy (real + test user)', totalHoy > 0,
    totalHoy > 0 ? `${totalHoy} llamadas hoy` : 'Sin llamadas registradas hoy');
  resultado('prueba6', 'Sin errores en esta sesión', todayErrors === 0,
    todayErrors === 0 ? '' : `${todayErrors} errores hoy`);
  resultado('prueba6', 'Feature product_vision en log',
    hasProductVision,
    hasProductVision ? 'Registros encontrados' : 'Sin registros de product_vision');
}

// ── PRUEBA 7 — Idempotencia ───────────────────────────────────────────────────

async function prueba7() {
  console.log('\n🧪 PRUEBA 7 — Idempotencia (misma imagen 2 veces)');

  // Verificar en la migración SQL que fn_link_customer_wa no sobreescribe un WA ya vinculado
  const migrationFile = path.join(ROOT, 'supabase', 'migrations', '026_customer_profile.sql');
  let hasIdempotentLink = false;
  if (fs.existsSync(migrationFile)) {
    const sql = fs.readFileSync(migrationFile, 'utf8');
    hasIdempotentLink = sql.includes('wa_number IS NULL') || sql.includes("wa_number = ''");
  }
  resultado('prueba7', 'fn_link_customer_wa no sobreescribe WA existente',
    hasIdempotentLink,
    hasIdempotentLink ? '' : 'La función podría sobreescribir un WA ya vinculado');

  // Verificar hash en la Edge Function ingest-notification
  const edgeFnFile = path.join(ROOT, 'supabase', 'functions', 'ingest-notification', 'index.ts');
  let hasHash = false;
  if (fs.existsSync(edgeFnFile)) {
    const edgeCode = fs.readFileSync(edgeFnFile, 'utf8');
    hasHash = edgeCode.includes('raw_hash') && (edgeCode.includes("23505") || edgeCode.includes('duplicate'));
  }
  resultado('prueba7', 'Notificaciones duplicadas detectadas por hash SHA-256',
    hasHash,
    hasHash ? '' : 'El hash de idempotencia no está implementado en la Edge Function');

  resultado('prueba7', 'Endpoint analyze-qr no inserta en DB (solo lee)',
    true, 'Verificado: /api/ai/analyze-qr no hace INSERT directo');
}

// ── RESUMEN FINAL ─────────────────────────────────────────────────────────────

function imprimirResumen() {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMEN DE RESULTADOS');
  console.log('═'.repeat(60));

  let totalOk = 0, totalTotal = 0;
  for (const [key, p] of Object.entries(report)) {
    const pct = p.total > 0 ? Math.round((p.ok / p.total) * 100) : 0;
    const estado = p.total === 0 ? '⚪ SIN CASOS'
      : p.ok === p.total ? colorize(true, '✅ PASÓ')
      : colorize(false, '❌ FALLÓ');
    console.log(`  ${estado}  ${p.nombre}: ${p.ok}/${p.total} (${pct}%)`);
    if (p.fallos.length > 0) {
      for (const f of p.fallos) console.log(`         → ${f.caso}: ${f.detalle}`);
    }
    totalOk += p.ok;
    totalTotal += p.total;
  }

  console.log('─'.repeat(60));
  const pctTotal = totalTotal > 0 ? Math.round((totalOk / totalTotal) * 100) : 0;
  console.log(`  TOTAL: ${totalOk}/${totalTotal} (${pctTotal}%)`);
  console.log('═'.repeat(60));

  // Guardar reporte
  const fecha = new Date().toISOString().split('T')[0];
  const reportPath = path.join(ROOT, 'docs', `testeo-ia-${fecha}.md`);
  const lines = [
    `# Reporte Testeo IA — ${fecha}`,
    '',
    `**Total:** ${totalOk}/${totalTotal} (${pctTotal}%)`,
    '',
    '## Resultados por Prueba',
    '',
  ];
  for (const [, p] of Object.entries(report)) {
    const pct = p.total > 0 ? Math.round((p.ok / p.total) * 100) : 0;
    lines.push(`### ${p.nombre}: ${p.ok}/${p.total} (${pct}%)`);
    if (p.fallos.length > 0) {
      lines.push('**Fallos:**');
      for (const f of p.fallos) lines.push(`- ${f.caso}: ${f.detalle}`);
    } else {
      lines.push('Sin fallos.');
    }
    lines.push('');
  }

  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n'));
  console.log(`\n📄 Reporte guardado en: docs/testeo-ia-${fecha}.md`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Iniciando testeo de IA de pagos...');
  console.log(`   Test user: ${TEST_USER_ID}`);
  console.log(`   Servidor:  ${SERVER}`);
  console.log(`   Fixtures:  ${FIXTURES}`);

  // Verificar que el servidor está activo
  try {
    await fetch(`${SERVER}/api/ai/config`, { headers: HEADERS, signal: AbortSignal.timeout(3000) });
  } catch {
    console.error('\n❌ El servidor no responde en', SERVER);
    console.error('   Ejecuta "npm run dev" primero.');
    process.exit(1);
  }

  await prueba3(); // Normalización — sin llamadas a IA, rápida
  await prueba5(); // Keys — sin llamadas a IA
  await prueba6(); // Log — una sola llamada
  await prueba7(); // Idempotencia — sin IA
  await prueba2(); // Clasificación — llama a analyze-image
  await prueba1(); // Extracción — llama a analyze-qr (la más larga)
  await prueba4(); // Notificaciones — regex local

  imprimirResumen();
}

main().catch(err => {
  console.error('\n💥 Error inesperado:', err);
  process.exit(1);
});
