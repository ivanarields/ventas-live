// Re-procesa un Live ya cerrado usando la nueva lógica (prompt completo + sin reintento agresivo).
// Solo crea/actualiza pagos, NO genera resumen ni selecciona prendas.
//
// Uso:
//   node scripts/reprocesar-live.mjs --session 19              # por ID de sesión
//   node scripts/reprocesar-live.mjs --fecha 2026-05-22       # por fecha (busca live de ese día)
//   node scripts/reprocesar-live.mjs --session 19 --dry-run   # ver qué haría sin escribir
//   node scripts/reprocesar-live.mjs --session 19 --reset     # borra pagos previos antes de re-analizar

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SERVER_URL = process.env.APP_URL || 'http://localhost:3000';
const USER_ID = process.env.INGEST_USER_ID || process.env.LIVE_DEFAULT_USER_ID;

const args = process.argv.slice(2);
const sessionArg = args.find(a => a.startsWith('--session'))?.split('=')[1] || (args.includes('--session') ? args[args.indexOf('--session') + 1] : null);
const fechaArg = args.find(a => a.startsWith('--fecha'))?.split('=')[1] || (args.includes('--fecha') ? args[args.indexOf('--fecha') + 1] : null);
const dryRun = args.includes('--dry-run');
const reset = args.includes('--reset');

if (!sessionArg && !fechaArg) {
  console.log('Uso:');
  console.log('  node scripts/reprocesar-live.mjs --session <id>');
  console.log('  node scripts/reprocesar-live.mjs --fecha YYYY-MM-DD');
  console.log('  Flags: --dry-run (no escribir), --reset (borrar pagos previos del live)');
  process.exit(1);
}

if (!USER_ID) {
  console.log('ERROR: falta INGEST_USER_ID o LIVE_DEFAULT_USER_ID en .env');
  process.exit(1);
}

const mainDb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const panelDb = createClient(process.env.PANEL_SUPABASE_URL, process.env.PANEL_SUPABASE_SERVICE_KEY);

function parseSessionNotes(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw;
}

function sessionRange(session) {
  if (!session?.scheduled_at) return null;
  const start = new Date(session.scheduled_at);
  const notes = parseSessionNotes(session.notes);
  const explicitEnd = notes.ended_at ?? notes.end_at ?? null;
  const end = explicitEnd ? new Date(explicitEnd) : new Date(start.getTime() + (Number(session.duration ?? 1)) * 60 * 1000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

async function findSession() {
  if (sessionArg) {
    const { data, error } = await mainDb
      .from('live_sessions')
      .select('*')
      .eq('id', Number(sessionArg))
      .single();
    if (error) throw error;
    return data;
  }

  // Por fecha
  const startUtc = `${fechaArg}T04:00:00Z`;
  const endUtc = `${fechaArg}T28:00:00Z`; // siguiente día +4h
  const nextDay = new Date(`${fechaArg}T04:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const { data, error } = await mainDb
    .from('live_sessions')
    .select('*')
    .eq('user_id', USER_ID)
    .gte('scheduled_at', startUtc)
    .lt('scheduled_at', nextDay.toISOString())
    .ilike('title', 'Procesamiento Live%')
    .order('scheduled_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function main() {
  console.log('=== RE-PROCESAMIENTO DE LIVE (lógica nueva) ===\n');

  const session = await findSession();
  if (!session) {
    console.log('No se encontró sesión live con ese criterio.');
    return;
  }

  const range = sessionRange(session);
  console.log(`Sesión ID: ${session.id}`);
  console.log(`Título:    ${session.title}`);
  console.log(`Estado:    ${session.status}`);
  console.log(`Inicio:    ${new Date(range.startAt).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}`);
  console.log(`Fin:       ${new Date(range.endAt).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}`);
  console.log('');

  // 1. Listar mensajes con imagen entrante en el rango
  const { data: clientes } = await panelDb
    .from('panel_clientes')
    .select('id, nombre, phone');

  const clienteIds = (clientes ?? []).map(c => c.id);
  if (clienteIds.length === 0) {
    console.log('No hay clientes en el panel.');
    return;
  }

  const clientesMap = new Map(clientes.map(c => [c.id, c]));

  const { data: mensajes } = await panelDb
    .from('panel_mensajes')
    .select('id, cliente_id, content, media_url, media_type, has_media, direction, created_at')
    .in('cliente_id', clienteIds)
    .gte('created_at', range.startAt)
    .lte('created_at', range.endAt)
    .eq('direction', 'in')
    .eq('has_media', true)
    .not('media_url', 'is', null)
    .order('created_at', { ascending: true });

  const imagenes = (mensajes ?? []).filter(m => {
    const mt = (m.media_type || '').toLowerCase();
    return mt.startsWith('image/') || /\.(jpe?g|png|webp)/i.test(m.media_url);
  });

  console.log(`Imágenes entrantes a analizar: ${imagenes.length}`);
  console.log('');

  if (imagenes.length === 0) {
    console.log('No hay imágenes que analizar.');
    return;
  }

  // 2. Si --reset, borrar pagos previos generados por análisis (no los que ya tienen main_pago_id de MacroDroid)
  if (reset) {
    if (dryRun) {
      console.log('[DRY-RUN] Borraría pagos del rango sin main_pago_id...');
    } else {
      const panelMensajeIds = imagenes.map(m => m.id);
      const { data: pagosExistentes } = await panelDb
        .from('pagos_venta_live')
        .select('id, pedido_live_id')
        .in('panel_mensaje_id', panelMensajeIds);

      console.log(`Borrando ${pagosExistentes?.length ?? 0} pagos previos asociados a estos mensajes...`);

      if (pagosExistentes?.length) {
        const ids = pagosExistentes.map(p => p.id);
        await panelDb.from('pagos_venta_live').delete().in('id', ids);

        // Borrar evidencias huérfanas
        await panelDb.from('evidencias_venta_live').delete().in('panel_mensaje_id', panelMensajeIds);

        // Recalcular totales o borrar pedidos vacíos
        const pedidoIds = [...new Set(pagosExistentes.map(p => p.pedido_live_id).filter(Boolean))];
        for (const pid of pedidoIds) {
          const { data: pagosRestantes } = await panelDb
            .from('pagos_venta_live')
            .select('id')
            .eq('pedido_live_id', pid);
          if (!pagosRestantes?.length) {
            await panelDb.from('pedidos_venta_live').delete().eq('id', pid);
            console.log(`  Pedido ${pid.slice(0, 8)} borrado (sin pagos restantes)`);
          }
        }
      }
    }
    console.log('');
  }

  // 3. Por cada imagen, llamar al endpoint analyze-receipt
  let creados = 0;
  let descartados = 0;
  let yaExistia = 0;
  let errores = 0;
  const motivosDescartados = {};

  for (let i = 0; i < imagenes.length; i++) {
    const m = imagenes[i];
    const cliente = clientesMap.get(m.cliente_id);
    const hora = new Date(m.created_at).toLocaleString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' });
    process.stdout.write(`  [${i + 1}/${imagenes.length}] ${hora} ${(cliente?.nombre || cliente?.phone || 'Sin nombre').padEnd(30).slice(0, 30)} ... `);

    if (dryRun) {
      console.log('(dry-run, no se llama IA)');
      continue;
    }

    try {
      const resp = await fetch(`${SERVER_URL.replace(/\/$/, '')}/api/live-sales/analyze-receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': USER_ID,
        },
        body: JSON.stringify({
          clienteId: m.cliente_id,
          phone: cliente?.phone || '',
          panelMensajeId: m.id,
          mediaUrl: m.media_url,
          mediaType: m.media_type,
          messageContent: m.content,
          messageCreatedAt: m.created_at,
        }),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.log(`ERROR ${resp.status}: ${txt.slice(0, 100)}`);
        errores++;
        continue;
      }

      const result = await resp.json();
      if (!result.ok) {
        console.log(`ERROR: ${result.error}`);
        errores++;
        continue;
      }

      if (result.skipped) {
        console.log(`SALTADO: ${result.reason}`);
        continue;
      }

      if (!result.created) {
        console.log(`descartado: ${result.reason}`);
        descartados++;
        motivosDescartados[result.reason] = (motivosDescartados[result.reason] || 0) + 1;
      } else if (result.matchedMacrodroid) {
        console.log(`✓ verificado MacroDroid (estado: ${result.estado})`);
        creados++;
      } else {
        console.log(`✓ pago creado (estado: ${result.estado})`);
        creados++;
      }
    } catch (err) {
      console.log(`EXCEPCIÓN: ${err.message}`);
      errores++;
    }

    // Pausa pequeña para no saturar
    await new Promise(r => setTimeout(r, 800));
  }

  console.log('');
  console.log('=== RESUMEN ===');
  console.log(`Imágenes procesadas:   ${imagenes.length}`);
  console.log(`Pagos creados:         ${creados}`);
  console.log(`Descartados por IA:    ${descartados}`);
  console.log(`Ya existían:           ${yaExistia}`);
  console.log(`Errores:               ${errores}`);
  if (Object.keys(motivosDescartados).length > 0) {
    console.log('\nMotivos de descarte:');
    for (const [r, c] of Object.entries(motivosDescartados)) {
      console.log(`  ${r}: ${c}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
