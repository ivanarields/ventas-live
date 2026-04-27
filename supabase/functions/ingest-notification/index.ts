// ============================================================================
// Edge Function: ingest-notification  (v2 — fallback + auto-aprendizaje)
// Recibe POST desde MacroDroid (Android) con notificación bancaria capturada.
//
// Flujo de extracción de nombre (en cascada, nunca bloquea si hay monto):
//   1. Regex hardcodeados (patrones conocidos)
//   2. Patrones aprendidos de la tabla `learned_text_patterns`
//   3. Extracción agresiva (quitar keywords, tomar lo que queda)
//   4. Placeholder "PAGO [banco]" como último recurso
//
// Aprendizaje: cada pago procesado guarda su patrón textual (contexto
// antes/después del nombre) para mejorar extracciones futuras del mismo banco.
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INGEST_DEVICE_SECRET = Deno.env.get('INGEST_DEVICE_SECRET')!;
const INGEST_USER_ID       = Deno.env.get('INGEST_USER_ID')!;
const GEMINI_API_KEY       = Deno.env.get('GEMINI_API_KEY') ?? '';

// ── Tienda Online — reenvío al motor de cuadrangulación ──────────────────────
// URL del cliente de la tienda (Supabase de TiendaOnline)
const STORE_SUPABASE_URL = Deno.env.get('STORE_SUPABASE_URL') ?? '';
const STORE_SERVICE_KEY  = Deno.env.get('STORE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const AUTHORIZED_DEVICES: string[]  = ['android-caja-01'];
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

// ─── Helpers básicos ─────────────────────────────────────────────────────────

function cleanTemplate(v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  if (/^\{[\w_]+\}$/.test(s)) return '';
  return s;
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Parser de monto ─────────────────────────────────────────────────────────

function parseAmount(text: string): number | null {
  const match =
    text.match(/Bs\.?\s*([\d][\d.,]*)/i) ||
    text.match(/\bBOB\s*([\d][\d.,]*)/i) ||
    text.match(/\$us\.?\s*([\d][\d.,]*)/i);
  if (!match) return null;
  let raw = match[1];
  if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (raw.includes(',')) raw = raw.replace(',', '.');
  const n = parseFloat(raw);
  return isNaN(n) || n <= 0 ? null : Math.round(n * 100) / 100;
}

// ─── Parser de nombre — regex hardcodeados ───────────────────────────────────

function parsePayerName(text: string): string | null {
  const t = text.replace(/[^\w\sÁÉÍÓÚÑáéíóúñ.,|:;$-]/g, ' ').replace(/\s+/g, ' ');

  const patterns = [
    // Yape QR: "QR DE NOMBRE  te envió Bs. X"
    /QR\s+DE\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60}?)\s{1,4}te\s+(?:envi\S*|yape\S*|pag\S*)/i,
    // Yape directo: "NOMBRE, te envió Bs. X"
    /(?:^|\|\s*)([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,80}?)\s*,\s*te\s+(?:envi\S*|yape\S*|pag\S*|transf\S*)/im,
    // Bancos clásicos: "RECIBISTE Bs. X DE NOMBRE"
    /RECIBISTE\s+(?:Bs\.?\s*[\d.,]+\s+)?DE\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60}?)(?:\s+(?:por|con|Bs|en|el|a\s+las)|$)/i,
    // "Transferencia/pago/envío recibido de NOMBRE"
    /(?:transferencia|pago|envi\S+|dep\S+sito)\s+(?:recibid[oa]\s+)?de\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60}?)(?:\s+por|\s+Bs|\s*$)/i,
    // "de NOMBRE por/Bs"
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
      if (name.length < 3) continue;
      if (/^(TE|EL|LA|UN|UNA|DE|POR|CON|ENVI|YAPE|PAGO|BS)$/i.test(name)) continue;
      return name;
    }
  }
  return null;
}

// ─── IA (Gemini): parseo inteligente de notificaciones bancarias ────────────

async function parseWithGemini(text: string): Promise<{ name: string | null; amount: number | null } | null> {
  if (!GEMINI_API_KEY) return null;
  if (!text || text.length < 5) return null;

  const prompt = `Extrae el nombre del pagador y el monto de esta notificación bancaria boliviana.

Responde SOLO con JSON válido en este formato exacto:
{"name": "NOMBRE COMPLETO", "amount": numero}

Reglas estrictas:
- Si no identificas un nombre de persona real (con nombre y apellido), usa: "name": null
- NUNCA inventes un nombre. NUNCA uses palabras como "PAGO", "DEPOSITO", "YAPE", "QR", "TRANSFERENCIA" como nombre
- El nombre debe estar en MAYUSCULAS exactamente como aparece en el texto
- El monto es solo el numero (sin "Bs." ni simbolos)
- Si el texto dice "QR DE JUAN PEREZ te envio Bs. 50" → {"name": "JUAN PEREZ", "amount": 50}
- Si el texto dice "Recibiste un yapeo de Bs. 100" (sin nombre) → {"name": null, "amount": 100}

Notificacion: """${text}"""`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 150,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!resp.ok) {
      console.error('[gemini] HTTP error', resp.status, await resp.text());
      return null;
    }

    const data = await resp.json();
    const textResp = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const jsonMatch = textResp.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const name = typeof parsed.name === 'string' && parsed.name.trim().length >= 3
      ? parsed.name.trim().replace(/\s+/g, ' ')
      : null;
    const amount = typeof parsed.amount === 'number' && parsed.amount > 0
      ? Math.round(parsed.amount * 100) / 100
      : null;

    return { name, amount };
  } catch (err) {
    console.error('[gemini] exception:', err);
    return null;
  }
}

// ─── Auto-aprendizaje: buscar patrones aprendidos ───────────────────────────

async function tryLearnedPatterns(appPackage: string | null, text: string): Promise<string | null> {
  if (!appPackage || !text) return null;

  const { data: patterns } = await supabase
    .from('learned_text_patterns')
    .select('before_marker, after_marker')
    .eq('app_package', appPackage)
    .order('success_count', { ascending: false })
    .limit(20);

  if (!patterns || patterns.length === 0) return null;

  const textLower = text.toLowerCase();

  for (const { before_marker, after_marker } of patterns) {
    let startIdx = 0;
    let endIdx   = text.length;

    if (before_marker) {
      const bIdx = textLower.indexOf(before_marker.toLowerCase());
      if (bIdx === -1) continue;
      startIdx = bIdx + before_marker.length;
    }

    if (after_marker) {
      const aIdx = textLower.indexOf(after_marker.toLowerCase(), startIdx);
      if (aIdx === -1) continue;
      endIdx = aIdx;
    }

    if (endIdx <= startIdx) continue;

    const candidate = text.slice(startIdx, endIdx).trim().replace(/\s+/g, ' ');
    if (candidate.length >= 2 && candidate.length <= 80) {
      return candidate;
    }
  }
  return null;
}

// ─── Auto-aprendizaje: guardar patrón exitoso ────────────────────────────────

async function learnPattern(appPackage: string | null, text: string, nameFound: string | null) {
  if (!appPackage || !text || !nameFound) return;

  const nameIdx = text.toLowerCase().indexOf(nameFound.toLowerCase());
  if (nameIdx === -1) return;

  const before = text.slice(Math.max(0, nameIdx - 20), nameIdx).trim();
  const after  = text.slice(nameIdx + nameFound.length, nameIdx + nameFound.length + 20).trim();

  if (!before && !after) return;

  try {
    await supabase.rpc('upsert_learned_pattern', { p_app: appPackage, p_before: before, p_after: after });
  } catch (_) { /* no bloquea aunque falle */ }
}

// ─── Fallback estricto: solo acepta si el resultado parece un nombre real ───
// Criterios: 2+ palabras, todas capitalizadas, sin verbos/keywords bancarias.

const BANK_KEYWORDS = new Set([
  'QR','DE','TE','ENVIO','ENVIÓ','ENVIASTE','YAPEO','YAPEÓ','PAGO','PAGÓ','PAGASTE',
  'RECIBISTE','RECIBIDO','TRANSFERENCIA','DEPOSITO','DEPÓSITO','OPERACION','OPERACIÓN',
  'REF','COMPROBANTE','TRANSACCION','TRANSACCIÓN','BS','BOB','UN','UNA','EL','LA','POR','CON','EN'
]);

function looksLikeRealName(candidate: string): boolean {
  if (!candidate) return false;
  const words = candidate.trim().split(/\s+/);
  if (words.length < 2) return false;            // mínimo nombre + apellido
  if (candidate.length < 6 || candidate.length > 70) return false;

  for (const w of words) {
    const upper = w.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (BANK_KEYWORDS.has(upper)) return false;  // contiene palabra bancaria → no es nombre
    if (!/^[A-ZÁÉÍÓÚÑ]/i.test(w)) return false;  // debe empezar con letra
    if (/\d/.test(w)) return false;              // sin dígitos
  }
  return true;
}

function extractFallbackName(text: string): string | null {
  const cleaned = text
    .replace(/Bs\.?\s*[\d.,]+/gi, '')
    .replace(/\bQR\s+DE\b/gi, '')
    .replace(/\bte\s+envi\S+/gi, '')
    .replace(/\byape[oó]\S*/gi, '')
    .replace(/\brecibiste\b.*$/gi, '')
    .replace(/\bun\s+yapeo\b/gi, '')
    .replace(/\bpago\s+(?:de|por)\b/gi, '')
    .replace(/\bdep[óo]sito\s+recibido\b/gi, '')
    .replace(/\btransferencia\s+recibida\b/gi, '')
    .replace(/[|,;.:#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const candidate = cleaned.split(' ').slice(0, 5).join(' ');
  return looksLikeRealName(candidate) ? candidate : null;
}

// ─── Normalización ───────────────────────────────────────────────────────────

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

// ─── HTTP handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 415);
  }

  const deviceId     = req.headers.get('x-device-id')     ?? '';
  const deviceSecret = req.headers.get('x-device-secret') ?? '';

  if (!deviceId || !deviceSecret)              return jsonResponse({ error: 'Missing x-device-id or x-device-secret' }, 401);
  if (deviceSecret !== INGEST_DEVICE_SECRET)   return jsonResponse({ error: 'Invalid device secret' }, 403);
  if (!AUTHORIZED_DEVICES.includes(deviceId)) return jsonResponse({ error: 'Device not in allowlist' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }

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

  if (AUTHORIZED_PACKAGES.length > 0 && payload.app_package && !AUTHORIZED_PACKAGES.includes(payload.app_package)) {
    return jsonResponse({ ok: false, skipped: true, reason: 'package_not_allowed' });
  }

  const rawConcat = [
    payload.app_package, payload.notification_channel, payload.captured_at_ms,
    payload.title, payload.text, payload.big_text, payload.text_lines,
  ].map(v => v == null ? '' : String(v)).join('|');

  const rawHash = await sha256(rawConcat);

  const headersMeta = {
    'user-agent':     req.headers.get('user-agent'),
    'x-device-id':   deviceId,
    'content-length': req.headers.get('content-length'),
  };

  // ── INSERT RAW ──
  const { data: rawRow, error: rawErr } = await supabase
    .from('raw_notification_events')
    .insert({
      source: payload.source, device_id: payload.device_id,
      event_uuid: payload.event_uuid, app_name: payload.app_name,
      app_package: payload.app_package, notification_channel: payload.notification_channel,
      captured_at_ms: payload.captured_at_ms, title: payload.title,
      text: payload.text, big_text: payload.big_text, sub_text: payload.sub_text,
      text_lines: payload.text_lines, action_names: payload.action_names,
      raw_payload: body, raw_concat: rawConcat, raw_hash: rawHash,
      ingest_status: 'received', headers: headersMeta,
    })
    .select().single();

  if (rawErr?.code === '23505') return jsonResponse({ ok: true, duplicate: true, raw_hash: rawHash });
  if (rawErr) { console.error('[raw insert]', rawErr); return jsonResponse({ error: rawErr.message }, 500); }

  // ── PARSEO ──
  const candidateText = [payload.big_text, payload.text_lines, payload.text, payload.title]
    .filter(s => s && s.length > 0).join(' | ');

  let amount         = parseAmount(candidateText);
  const operationRef = parseOperationRef(candidateText);

  // Cascada de extracción de nombre — nunca crea nombres falsos
  let payerNameRaw: string | null = parsePayerName(candidateText);
  let nameSource = 'regex';

  if (!payerNameRaw && payload.app_package) {
    const sourceText = payload.big_text || payload.text || candidateText;
    payerNameRaw = await tryLearnedPatterns(payload.app_package, sourceText);
    if (payerNameRaw) nameSource = 'learned';
  }

  // IA Gemini: si regex y patrones aprendidos fallaron, pedimos a Gemini
  if (!payerNameRaw) {
    const geminiResult = await parseWithGemini(candidateText);
    if (geminiResult?.name) {
      payerNameRaw = geminiResult.name;
      nameSource = 'gemini';
    }
    // Si Gemini encontró monto y nosotros no, también lo usamos
    if (amount === null && geminiResult?.amount !== null && geminiResult?.amount !== undefined) {
      amount = geminiResult.amount;
    }
  }

  if (!payerNameRaw) {
    payerNameRaw = extractFallbackName(candidateText);
    if (payerNameRaw) nameSource = 'fallback';
  }

  // NUNCA creamos placeholder falso. Si no hay nombre válido → revisión manual.
  const payerNameCanonical = payerNameRaw ? canonicalizeName(payerNameRaw) : null;

  let confidence = 0;
  if (amount !== null) confidence += 0.55;
  if (payerNameRaw && nameSource === 'regex')    confidence += 0.30;
  if (payerNameRaw && nameSource === 'gemini')   confidence += 0.28;
  if (payerNameRaw && nameSource === 'learned')  confidence += 0.25;
  if (payerNameRaw && nameSource === 'fallback') confidence += 0.15;
  if (operationRef) confidence += 0.15;

  // Requiere ambos: monto Y nombre válido. Sin nombre → revisión manual.
  const hasMinData  = amount !== null && !!payerNameRaw;
  const needsReview = !hasMinData;
  const parseStatus = hasMinData ? 'parsed_ok' : 'pending_review';

  const { data: candidate, error: candErr } = await supabase
    .from('parsed_payment_candidates')
    .insert({
      raw_event_id: rawRow.id, parser_version: 'v3.0-gemini',
      bank_code: payload.app_package, candidate_text: candidateText,
      currency: 'BOB', amount,
      payer_name_raw: payerNameRaw, payer_name_canonical: payerNameCanonical,
      operation_ref: operationRef, confidence_score: confidence,
      needs_review: needsReview, parse_status: parseStatus,
      parse_debug: {
        has_amount: amount !== null,
        has_name:   !!payerNameRaw,
        has_ref:    !!operationRef,
        name_source: nameSource,
      },
    })
    .select().single();

  if (candErr) {
    console.error('[candidate insert]', candErr);
    return jsonResponse({ ok: true, raw_hash: rawHash, parse_error: candErr.message });
  }

  // ── AUTO-INGRESO si hay monto ──
  if (!needsReview && amount && payerNameRaw && payerNameCanonical) {
    // Detección de duplicado
    let isDuplicate = false;
    if (operationRef) {
      const { data: byRef } = await supabase
        .from('parsed_payment_candidates').select('id')
        .eq('operation_ref', operationRef).neq('id', candidate.id).limit(1);
      isDuplicate = (byRef?.length ?? 0) > 0;
    } else {
      const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const { data: maybeDup } = await supabase
        .from('pagos').select('id')
        .eq('user_id', INGEST_USER_ID)
        .eq('nombre', payerNameRaw)
        .eq('pago', amount).gte('date', oneMinAgo).limit(1);
      isDuplicate = (maybeDup?.length ?? 0) > 0;
    }

    // Removed payments_ui insertion as the view handles it or it's deprecated

    if (!isDuplicate) {
      // Buscar o crear cliente
      const normForSearch = payerNameCanonical.toLowerCase();
      let customerId: number | null = null;

      let { data: existingCustomers } = await supabase
        .from('customers').select('id').eq('user_id', INGEST_USER_ID)
        .ilike('normalized_name', normForSearch).limit(1);
      if (!existingCustomers?.length) {
        const { data: byCan } = await supabase
          .from('customers').select('id').eq('user_id', INGEST_USER_ID)
          .eq('canonical_name', payerNameCanonical).limit(1);
        if (byCan?.length) existingCustomers = byCan;
      }

      if (existingCustomers && existingCustomers.length > 0) {
        customerId = existingCustomers[0].id;
      } else {
        const { data: newCust } = await supabase.from('customers').insert({
          full_name: payerNameRaw, normalized_name: normForSearch,
          canonical_name: payerNameCanonical, phone: null,
          active_label: null, active_label_type: null, user_id: INGEST_USER_ID,
        }).select('id').single();
        if (newCust) customerId = newCust.id;
      }

      const { data: pago, error: pagoErr } = await supabase.from('pagos').insert({
        nombre: payerNameRaw, pago: amount, method: 'Notificación bancaria',
        status: 'pending', date: new Date().toISOString(),
        user_id: INGEST_USER_ID, customer_id: customerId,
      }).select().single();

      if (pagoErr) {
        console.error('[pagos insert]', pagoErr);
      } else if (pago) {
        // Depositar evidencia de identidad con perfil vinculado (fire-and-forget)
        (async () => {
          try {
            const nameNorm = payerNameCanonical.toUpperCase()
              .normalize('NFD').replace(/[̀-ͯ]/g, '')
              .replace(/[^A-Z\s]/g, '').replace(/\s+/g, ' ').trim();

            // Buscar perfil existente por nombre normalizado
            const { data: allProfiles } = await supabase
              .from('identity_profiles')
              .select('id, display_name')
              .eq('user_id', INGEST_USER_ID);

            const match = allProfiles?.find(p =>
              p.display_name.toUpperCase().normalize('NFD')
                .replace(/[̀-ͯ]/g, '').replace(/[^A-Z\s]/g, '')
                .replace(/\s+/g, ' ').trim() === nameNorm
            );

            let profileId: string | null = null;
            if (match) {
              profileId = match.id;
            } else {
              const { data: newProfile } = await supabase
                .from('identity_profiles')
                .insert({ user_id: INGEST_USER_ID, display_name: payerNameRaw, confidence: 1.0, origin: 'auto' })
                .select('id').single();
              profileId = newProfile?.id ?? null;
            }

            await supabase.from('identity_evidence').insert({
              user_id: INGEST_USER_ID,
              profile_id: profileId,
              source: 'macrodroid',
              source_id: String(pago.id),
              event_type: 'payment',
              amount,
              name_raw: payerNameRaw,
              name_normalized: nameNorm,
              event_at: new Date().toISOString(),
              payload: { customer_id: customerId, app_package: payload.app_package, name_source: nameSource },
            });
          } catch (e) {
            console.error('[identity deposit]', e);
          }
        })();

        await supabase.from('pedidos').insert({
          customer_id: customerId, customer_name: payerNameRaw,
          item_count: 0, bag_count: 1, status: 'procesar',
          total_amount: amount, user_id: INGEST_USER_ID,
        });

        // Aprender patrón de extracciones confiables (regex o Gemini)
        if (nameSource === 'regex' || nameSource === 'gemini') {
          const sourceForLearning = payload.big_text || payload.text || '';
          await learnPattern(payload.app_package, sourceForLearning, payerNameRaw);
        }

        // ── REENVÍO A TIENDA ONLINE (Opción C — Híbrida Inteligente) ────────
        // Si hay una tienda configurada, cruzamos el pago con pedidos pendientes
        if (STORE_SUPABASE_URL && STORE_SERVICE_KEY && amount) {
          try {
            const storeClient = createClient(STORE_SUPABASE_URL, STORE_SERVICE_KEY);
            const windowStart = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 min

            // Buscar TODOS los pedidos pendientes con ese monto en los últimos 2 min
            const { data: candidates } = await storeClient
              .from('store_orders')
              .select('id, total, customer_wa, items')
              .eq('status', 'pending')
              .eq('total', amount)
              .gt('created_at', windowStart)
              .order('created_at', { ascending: false });

            let matched: (typeof candidates extends (infer T)[] | null ? T : never) | null = null;
            let confidence = 'none';

            if (candidates && candidates.length === 1) {
              // MONTO ÚNICO → verificación automática (confianza ALTA)
              matched = candidates[0];
              confidence = 'alta';
            } else if (candidates && candidates.length > 1) {
              // MÚLTIPLES candidatos → NO verificar automáticamente
              // Esperar WA con código o verificación manual del admin
              console.log(`[tienda-store] ⚠️ ${candidates.length} pedidos de ${amount} Bs — esperando WA/manual`);
            }

            if (matched) {
              // Confirmar el pedido en la tienda
              const { data: updatedOrder } = await storeClient
                .from('store_orders')
                .update({
                  status: 'paid',
                  payment_verified_at: new Date().toISOString(),
                  payment_method: 'qr',
                  payment_ref: `chehi:${rawHash}:${confidence}`,
                })
                .eq('id', matched.id)
                .eq('status', 'pending')
                .select()
                .single();

              if (updatedOrder) {
                // Ocultar productos vendidos automáticamente
                const productIds = (updatedOrder.items ?? [])
                  .map((i: { productId: unknown }) => i.productId)
                  .filter(Boolean);
                if (productIds.length > 0) {
                  await storeClient.from('products').update({ available: false }).in('id', productIds);
                }

                // Guardar el evento de pago en la tienda
                await storeClient.from('payment_events').insert({
                  source: 'chehi_ingest',
                  raw_text: candidateText.slice(0, 300),
                  amount,
                  sender_name: payerNameRaw,
                  sender_wa: '',
                  processed: true,
                  match_confidence: confidence,
                  hash: rawHash,
                  matched_order_id: matched.id,
                });

                console.log(`[tienda-store] ✅ Pedido #${matched.id} verificado (${confidence}). Monto: ${amount} Bs`);
              }
            }
          } catch (storeErr) {
            // El error de la tienda NO debe bloquear el flujo de ChehiApp
            console.error('[tienda-store] Error en reenvío a tienda:', storeErr);
          }
        }
        // ── FIN REENVÍO A TIENDA ONLINE ───────────────────────────────────────
      }
    }

    await supabase.from('raw_notification_events')
      .update({ ingest_status: isDuplicate ? 'duplicate_skipped' : 'auto_processed' })
      .eq('id', rawRow.id);

  } else {
    // No se pudo extraer nombre o monto: va a revisión manual (nunca crea pago falso)
    await supabase.from('manual_review_queue').insert({
      parsed_candidate_id: candidate.id,
      reason_code:   amount === null ? 'missing_amount' : 'missing_payer',
      reason_detail: `confidence=${confidence.toFixed(2)} | text=${candidateText.slice(0,100)}`,
    });
    await supabase.from('raw_notification_events')
      .update({ ingest_status: 'pending_review' }).eq('id', rawRow.id);
  }

  await supabase.from('notification_bank_observations').insert({
    raw_event_id: rawRow.id, app_package: payload.app_package,
    notification_channel: payload.notification_channel,
    title_len:      (payload.title      ?? '').length,
    text_len:       (payload.text       ?? '').length,
    big_text_len:   (payload.big_text   ?? '').length,
    text_lines_len: (payload.text_lines ?? '').length,
    has_amount:     amount !== null,
    has_name:       !!payerNameRaw,
    has_operation_ref:      !!operationRef,
    capture_quality_score:  confidence * 100,
  });

  return jsonResponse({
    ok: true, raw_hash: rawHash,
    parsed: { amount, payer: payerNameRaw, name_source: nameSource, confidence: Number(confidence.toFixed(2)) },
    needs_review: needsReview,
    auto_processed: !needsReview && !!amount,
  });
  } catch (err) {
    console.error('[handler crash]', err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
