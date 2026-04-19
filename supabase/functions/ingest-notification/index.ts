// ============================================================================
// Edge Function: ingest-notification
// Recibe POST desde MacroDroid (Android) con notificación bancaria capturada.
// - Valida origen (x-device-id + x-device-secret)
// - Guarda RAW inmutable con hash SHA-256 para idempotencia
// - Parsea monto / nombre / ref de operación (best-effort)
// - Opción A: si confianza ≥ 0.8, auto-crea fila en `pagos` para la app
// - Si no confía, encola en manual_review_queue
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INGEST_DEVICE_SECRET  = Deno.env.get('INGEST_DEVICE_SECRET')!;
const INGEST_USER_ID        = Deno.env.get('INGEST_USER_ID')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Lista blanca de device_id autorizados
const AUTHORIZED_DEVICES = ['android-caja-01'];

// Lista blanca opcional de paquetes. Vacío = todos permitidos.
const AUTHORIZED_PACKAGES: string[] = [];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-id, x-device-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Si MacroDroid no expande un template (e.g. "{not_title}"), lo tratamos como vacío
function cleanTemplate(v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  if (/^\{[\w_]+\}$/.test(s)) return '';
  return s;
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Parser de monto: tolera "Bs. 150", "Bs 150,00", "Bs. 1.250,00", "BOB 150.50"
function parseAmount(text: string): number | null {
  const match =
    text.match(/Bs\.?\s*([\d][\d.,]*)/i) ||
    text.match(/\bBOB\s*([\d][\d.,]*)/i) ||
    text.match(/\$us\.?\s*([\d][\d.,]*)/i);
  if (!match) return null;

  let raw = match[1];
  // "1.250,00" → "1250.00"
  if (raw.includes(',') && raw.includes('.')) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else if (raw.includes(',')) {
    raw = raw.replace(',', '.');
  }
  const n = parseFloat(raw);
  return isNaN(n) || n <= 0 ? null : Math.round(n * 100) / 100;
}

// Parser de nombre del pagador: patrones comunes de bancos bolivianos + billeteras
// NOTA: Android a veces envía tildes corruptas (U+FFFD). Los regex toleran
// cualquier carácter no-letra donde debería ir una vocal con tilde.
function parsePayerName(text: string): string | null {
  // Normalizar: reemplazar caracteres corruptos por espacios para que los regex funcionen
  const t = text.replace(/[^\w\sÁÉÍÓÚÑáéíóúñ.,|:;$-]/g, ' ').replace(/\s+/g, ' ');

  const patterns = [
    // Yape BO: "NOMBRE, te envió/yapeó/pagó Bs. X" — tolerante a "envi?"
    /(?:^|\|\s*)([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,80}?)\s*,\s*te\s+(?:envi\S*|yape\S*|pag\S*|transf\S*)/im,
    // Bancos clásicos: "RECIBISTE ... DE NOMBRE por/con/Bs/..."
    /RECIBISTE\s+(?:Bs\.?\s*[\d.,]+\s+)?DE\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60}?)(?:\s+(?:por|con|Bs|en|el|a\s+las)|$)/i,
    // "Transferencia/pago/envío/depósito recibido de NOMBRE"
    /(?:transferencia|pago|envi\S+|dep\S+sito)\s+(?:recibid[oa]\s+)?de\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60}?)(?:\s+por|\s+Bs|\s*$)/i,
    // "de NOMBRE ..."
    /\bde\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60}?)(?:\s+por|\s+con|\s+Bs|\s*$)/,
    // "enviado por NOMBRE"
    /enviado\s+por\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60})/i,
    // "nombre: NOMBRE"
    /nombre\s*:?\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60})/i,
  ];
  for (const rx of patterns) {
    const m = t.match(rx);
    if (m) {
      const name = m[1].trim().replace(/\s+/g, ' ');
      // Filtros de falso positivo: muy corto, o contiene palabras comunes no-nombres
      if (name.length < 3) continue;
      if (/^(TE|EL|LA|UN|UNA|DE|POR|CON|ENVI|YAPE|PAGO|BS)$/i.test(name)) continue;
      return name;
    }
  }
  return null;
}

function canonicalizeName(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseOperationRef(text: string): string | null {
  const m =
    text.match(/(?:n[º°]?\s*operaci[oó]n|oper(?:aci[oó]n)?|ref|comprobante|n[º°]?\.?\s*transacci[oó]n)\s*[:#.]?\s*([A-Z0-9-]{4,})/i) ||
    text.match(/\bref\.?\s*([A-Z0-9-]{5,})/i);
  return m ? m[1].trim() : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 415);
  }

  // Autenticación por headers
  const deviceId     = req.headers.get('x-device-id')     ?? '';
  const deviceSecret = req.headers.get('x-device-secret') ?? '';

  if (!deviceId || !deviceSecret) {
    return jsonResponse({ error: 'Missing x-device-id or x-device-secret' }, 401);
  }
  if (deviceSecret !== INGEST_DEVICE_SECRET) {
    return jsonResponse({ error: 'Invalid device secret' }, 403);
  }
  if (!AUTHORIZED_DEVICES.includes(deviceId)) {
    return jsonResponse({ error: 'Device not in allowlist' }, 403);
  }

  // Parseo del body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  // Limpieza de templates no expandidos por MacroDroid
  const payload = {
    source:               cleanTemplate(body.source) || 'macrodroid',
    device_id:            deviceId,
    event_uuid:           cleanTemplate(body.event_uuid) || null,
    app_name:             cleanTemplate(body.app_name) || null,
    app_package:          cleanTemplate(body.app_package) || null,
    notification_channel: cleanTemplate(body.notification_channel) || null,
    captured_at_ms:       parseInt(cleanTemplate(body.captured_at_ms)) || null,
    title:                cleanTemplate(body.title) || null,
    text:                 cleanTemplate(body.text) || null,
    big_text:             cleanTemplate(body.big_text) || null,
    sub_text:             cleanTemplate(body.sub_text) || null,
    text_lines:           cleanTemplate(body.text_lines) || null,
    action_names:         cleanTemplate(body.action_names) || null,
  };

  // Lista blanca opcional de apps
  if (AUTHORIZED_PACKAGES.length > 0 && payload.app_package && !AUTHORIZED_PACKAGES.includes(payload.app_package)) {
    return jsonResponse({ ok: false, skipped: true, reason: 'package_not_allowed' });
  }

  // Hash de idempotencia
  const rawConcat = [
    payload.app_package,
    payload.notification_channel,
    payload.captured_at_ms,
    payload.title,
    payload.text,
    payload.big_text,
    payload.text_lines,
  ].map(v => v == null ? '' : String(v)).join('|');

  const rawHash = await sha256(rawConcat);

  const headersMeta = {
    'user-agent':      req.headers.get('user-agent'),
    'x-device-id':     deviceId,
    'content-length':  req.headers.get('content-length'),
  };

  // ── INSERT RAW ──
  const { data: rawRow, error: rawErr } = await supabase
    .from('raw_notification_events')
    .insert({
      source:               payload.source,
      device_id:            payload.device_id,
      event_uuid:           payload.event_uuid,
      app_name:             payload.app_name,
      app_package:          payload.app_package,
      notification_channel: payload.notification_channel,
      captured_at_ms:       payload.captured_at_ms,
      title:                payload.title,
      text:                 payload.text,
      big_text:             payload.big_text,
      sub_text:             payload.sub_text,
      text_lines:           payload.text_lines,
      action_names:         payload.action_names,
      raw_payload:          body,
      raw_concat:           rawConcat,
      raw_hash:             rawHash,
      ingest_status:        'received',
      headers:              headersMeta,
    })
    .select()
    .single();

  // Duplicado exacto por hash → responder OK sin reprocesar
  if (rawErr?.code === '23505') {
    return jsonResponse({ ok: true, duplicate: true, raw_hash: rawHash });
  }
  if (rawErr) {
    console.error('[raw insert] error:', rawErr);
    return jsonResponse({ error: rawErr.message }, 500);
  }

  // ── PARSER ──
  const candidateText = [payload.big_text, payload.text_lines, payload.text, payload.title]
    .filter(s => s && s.length > 0)
    .join(' | ');

  const amount            = parseAmount(candidateText);
  const payerNameRaw      = parsePayerName(candidateText);
  const operationRef      = parseOperationRef(candidateText);
  const payerNameCanonical = payerNameRaw ? canonicalizeName(payerNameRaw) : null;

  // Score de confianza
  let confidence = 0;
  if (amount !== null)     confidence += 0.55;
  if (payerNameRaw)        confidence += 0.30;
  if (operationRef)        confidence += 0.15;

  const hasMinData = amount !== null && !!payerNameRaw;
  const needsReview = !hasMinData || confidence < 0.8;
  const parseStatus = hasMinData && !needsReview ? 'parsed_ok' : 'pending_review';

  const { data: candidate, error: candErr } = await supabase
    .from('parsed_payment_candidates')
    .insert({
      raw_event_id:          rawRow.id,
      parser_version:        'v1.0',
      bank_code:             payload.app_package,
      candidate_text:        candidateText,
      currency:              'BOB',
      amount,
      payer_name_raw:        payerNameRaw,
      payer_name_canonical:  payerNameCanonical,
      operation_ref:         operationRef,
      confidence_score:      confidence,
      needs_review:          needsReview,
      parse_status:          parseStatus,
      parse_debug: {
        has_amount: amount !== null,
        has_name:   !!payerNameRaw,
        has_ref:    !!operationRef,
      },
    })
    .select()
    .single();

  if (candErr) {
    console.error('[candidate insert] error:', candErr);
    return jsonResponse({ ok: true, raw_hash: rawHash, parse_error: candErr.message });
  }

  // ── OPCIÓN A: auto-ingreso cuando la confianza es alta ──
  if (!needsReview && amount && payerNameRaw && payerNameCanonical) {
    // Detectar duplicado blando: mismo nombre canónico + mismo monto en últimos 10 min
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: maybeDup } = await supabase
      .from('payments_ui')
      .select('id')
      .eq('canonical_display_name', payerNameCanonical)
      .eq('amount', amount)
      .gte('created_at', tenMinAgo)
      .limit(1);
    const isDuplicate = (maybeDup?.length ?? 0) > 0;

    // payments_ui
    await supabase.from('payments_ui').insert({
      parsed_candidate_id:    candidate.id,
      canonical_display_name: payerNameCanonical,
      amount,
      currency:               'BOB',
      paid_at:                new Date().toISOString(),
      match_status:           'auto',
      review_status:          'auto_confirmed',
      is_duplicate:           isDuplicate,
    });

    // Tabla `pagos` que lee la app existente (Opción A)
    if (!isDuplicate) {
      const { data: pago, error: pagoErr } = await supabase
        .from('pagos')
        .insert({
          nombre:  payerNameRaw,
          pago:    amount,
          method:  'Notificación bancaria',
          status:  'pending',
          date:    new Date().toISOString(),
          user_id: INGEST_USER_ID,
        })
        .select()
        .single();

      if (pagoErr) {
        console.error('[pagos insert] error:', pagoErr);
      } else if (pago) {
        // Auto-crear pedido en estado procesar (igual que pago manual)
        await supabase.from('pedidos').insert({
          customer_name: payerNameRaw,
          item_count:    0,
          bag_count:     1,
          status:        'procesar',
          total_amount:  amount,
          user_id:       INGEST_USER_ID,
        });
      }
    }

    await supabase.from('raw_notification_events')
      .update({ ingest_status: isDuplicate ? 'duplicate_skipped' : 'auto_processed' })
      .eq('id', rawRow.id);

  } else {
    // Encolar para revisión manual
    await supabase.from('manual_review_queue').insert({
      parsed_candidate_id: candidate.id,
      reason_code: amount === null
        ? 'missing_amount'
        : !payerNameRaw
          ? 'missing_payer'
          : 'low_confidence',
      reason_detail: `confidence=${confidence.toFixed(2)}`,
    });

    await supabase.from('raw_notification_events')
      .update({ ingest_status: 'pending_review' })
      .eq('id', rawRow.id);
  }

  // Observación para métricas del parser
  await supabase.from('notification_bank_observations').insert({
    raw_event_id:         rawRow.id,
    app_package:          payload.app_package,
    notification_channel: payload.notification_channel,
    title_len:            (payload.title      ?? '').length,
    text_len:             (payload.text       ?? '').length,
    big_text_len:         (payload.big_text   ?? '').length,
    text_lines_len:       (payload.text_lines ?? '').length,
    has_amount:           amount !== null,
    has_name:             !!payerNameRaw,
    has_operation_ref:    !!operationRef,
    capture_quality_score: confidence * 100,
  });

  return jsonResponse({
    ok: true,
    raw_hash: rawHash,
    parsed: { amount, payer: payerNameRaw, confidence: Number(confidence.toFixed(2)) },
    needs_review: needsReview,
    auto_processed: !needsReview && !!amount && !!payerNameRaw,
  });
});
