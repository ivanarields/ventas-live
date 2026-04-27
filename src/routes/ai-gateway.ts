/**
 * ai-gateway.ts
 * Router dedicado para TODOS los endpoints de IA.
 * Se monta en server.ts con: app.use(aiRouter(supabaseServer))
 *
 * Esto evita que server.ts siga creciendo con lógica de IA.
 */

import { Router, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildProductCatalogPrompt,
  buildImageClassifierPrompt,
  buildReceiptQrPrompt,
} from '../ai/prompts/index.js';
import { findOrCreateProfile, depositEvidence } from '../services/identityService.js';

export function createAiRouter(supabase: SupabaseClient, supabasePanel?: SupabaseClient) {
  const router = Router();

  // ── Helpers internos ────────────────────────────────────────────────────────

  async function getAiKeys(userId?: string): Promise<string[]> {
    const envKey = process.env.GEMINI_API_KEY ?? '';
    if (!userId) return [envKey].filter(Boolean);
    try {
      const { data } = await supabase
        .from('ai_config')
        .select('primary_key_encrypted, fallback_key_encrypted, fallback2_key_encrypted, key3_encrypted, key4_encrypted, key5_encrypted')
        .eq('user_id', userId)
        .single();
      if (data) {
        // La key del .env siempre se incluye al final como red de seguridad.
        // Si las keys de la DB están caídas o inválidas, el sistema cae en la del .env.
        const all = [
          data.primary_key_encrypted,
          data.fallback_key_encrypted,
          data.fallback2_key_encrypted,
          data.key3_encrypted,
          data.key4_encrypted,
          data.key5_encrypted,
          envKey,
        ].filter(Boolean) as string[];
        return [...new Set(all)]; // deduplicar si .env coincide con alguna DB key
      }
    } catch { /* tabla no existe → usar .env */ }
    return [envKey].filter(Boolean);
  }

  // Prompt SIMPLE — directo, deja razonar al modelo con pocos ejemplos.
  // Recomendado por OpenAI para casos donde el modelo moderno puede inferir el contexto.
  const DEFAULT_COMPROBANTE_PROMPT = `Eres un extractor de comprobantes de pago bolivianos. Analiza la imagen y extrae 3 datos: quién pagó, cuánto y a qué hora.

La dueña del negocio es: {{OWNER_NAME}}
Ella SIEMPRE recibe el dinero. Nunca lo envía.

Tu tarea: identificar al CLIENTE que envió el dinero, el MONTO y la HORA.

REGLA ÚNICA E IRROMPIBLE — El cliente debe ser una persona real:
Escribe null para "cliente" si ves cualquiera de estas situaciones:
- El texto es un tipo de cuenta: "Caja de Ahorros", "Cuenta Corriente", "Cuenta Vista"
- El texto es nombre de banco o app: BANCO, COOPERATIVA, YAPE, TIGO, QR, BILLETERA, DEPOSITO
- El texto es un número de teléfono (ej: 79123456)
- El texto es un email (contiene @)
- El pagador es EXACTAMENTE "{{OWNER_NAME}}" con las 4 palabras completas → eso sería transferencia propia, descártalo
  ATENCIÓN: si faltan palabras del nombre (ej: "LEIDY DIAZ SANCHEZ" sin CANDY, o "CANDY DIAZ SANCHEZ" sin LEIDY) → NO es la dueña, es un cliente válido, extráelo normalmente
- El nombre no aparece en el comprobante

Un nombre válido tiene nombre + apellido: "JUAN MAMANI", "ANA GARCIA", "M. RODRIGUEZ".
Extrae el nombre exactamente como aparece, en MAYÚSCULAS.
El monto es solo el número, sin Bs ni BOB.
La hora en formato HH:MM (24h).

Responde ÚNICAMENTE con este JSON (sin texto adicional, sin markdown):
{"cliente": "NOMBRE EN MAYÚSCULAS o null", "monto": número_o_null, "hora": "HH:MM o null"}`;

  // Lee el modo activo del prompt de comprobante: 'simple' (default) o 'completo'
  async function getComprobanteMode(userId: string): Promise<'simple' | 'completo'> {
    try {
      const { data } = await supabase
        .from('ai_prompts')
        .select('prompt_text')
        .eq('user_id', userId)
        .eq('prompt_key', 'comprobante_mode')
        .single();
      if (data?.prompt_text === 'completo') return 'completo';
    } catch { /* default */ }
    return 'simple';
  }

  async function getPrompt(userId: string, promptKey: string): Promise<string> {
    if (promptKey === 'comprobante_extraction') {
      const mode = await getComprobanteMode(userId);
      if (mode === 'completo') {
        const ownerName = await getOwnerName(userId);
        return buildReceiptQrPrompt(ownerName);
      }
      // mode === 'simple': devuelve el prompt simple mejorado con el nombre reemplazado
      // (lo reemplaza el caller con .replace({{OWNER_NAME}}))
      return DEFAULT_COMPROBANTE_PROMPT;
    }
    try {
      const { data } = await supabase
        .from('ai_prompts')
        .select('prompt_text')
        .eq('user_id', userId)
        .eq('prompt_key', promptKey)
        .single();
      if (data?.prompt_text) return data.prompt_text;
    } catch { /* usa default */ }
    return '';
  }

  // Normaliza la respuesta de cualquier prompt de comprobante al mismo shape interno.
  // El prompt simple devuelve {cliente, monto, hora}.
  // El prompt completo devuelve {es_comprobante, pagador, receptor, monto, hora, es_transferencia_propia}.
  function normalizeComprobanteResponse(raw: any): { cliente: string | null; monto: string | null; hora: string | null } | null {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.es_comprobante === false) return null;
    if (raw.es_transferencia_propia === true) return null;
    const cliente: string | null = raw.cliente ?? raw.pagador ?? null;
    const monto: string | null = raw.monto != null ? String(raw.monto) : null;
    const hora: string | null = raw.hora ?? null;
    return { cliente, monto: monto || null, hora };
  }

  // Devuelve el nombre de la dueña configurado en el perfil del usuario.
  // Fallback al valor por defecto si no hay perfil o el campo está vacío.
  async function getOwnerName(userId: string): Promise<string> {
    const DEFAULT = 'LEIDY CANDY DIAZ SANCHEZ';
    try {
      const { data } = await supabase
        .from('ai_config')
        .select('owner_name')
        .eq('user_id', userId)
        .single();
      return (data?.owner_name as string | null)?.trim() || DEFAULT;
    } catch { return DEFAULT; }
  }

  async function getAiFeatureConfig(userId: string, feature: string): Promise<{ enabled: boolean; model: string }> {
    try {
      const { data } = await supabase
        .from('ai_config')
        .select('features')
        .eq('user_id', userId)
        .single();
      if (data?.features?.[feature]) return data.features[feature];
    } catch { /* defaults */ }
    return { enabled: true, model: 'gemini-2.5-flash-lite' };
  }

  async function logAiUsage(entry: {
    userId: string; feature: string; model: string;
    inputTokens?: number; outputTokens?: number; latencyMs: number;
    success: boolean; errorMessage?: string; metadata?: any;
  }) {
    try {
      await supabase.from('ai_usage_log').insert({
        user_id: entry.userId,
        feature: entry.feature,
        model: entry.model,
        input_tokens: entry.inputTokens ?? 0,
        output_tokens: entry.outputTokens ?? 0,
        latency_ms: entry.latencyMs,
        success: entry.success,
        error_message: entry.errorMessage ?? null,
        metadata: entry.metadata ?? null,
      });
    } catch (e: any) { console.error('[ai-gateway] Error guardando log:', e?.message); }
  }

  // ── Sistema de rotación Round-Robin inteligente de API Keys ─────────────────
  //
  // En vez de usar Key1 hasta que falla → Key2 → Key3 (sistema secuencial),
  // distribuimos cada llamada a la key MENOS usada recientemente.
  //
  // Con 5 keys × 15 RPM = 75 llamadas/minuto sin que ninguna key colapse.
  // Cuando una key da 429 → cooldown 61s → el sistema la salta automáticamente.
  // Estado en memoria (vive mientras corra el servidor):

  interface KeyState { lastUsedAt: number; cooldownUntil: number; }
  const keyRotation = new Map<string, KeyState>();

  function getKeyState(key: string): KeyState {
    if (!keyRotation.has(key)) keyRotation.set(key, { lastUsedAt: 0, cooldownUntil: 0 });
    return keyRotation.get(key)!;
  }

  // Selecciona la key disponible menos usada recientemente (round-robin real).
  function selectKey(keys: string[]): string | null {
    const now = Date.now();
    const available = keys.filter(k => now >= getKeyState(k).cooldownUntil);
    if (available.length === 0) return null;
    available.sort((a, b) => getKeyState(a).lastUsedAt - getKeyState(b).lastUsedAt);
    return available[0];
  }

  // Tiempo en ms hasta que la primera key salga de cooldown.
  function msUntilNextKey(keys: string[]): number {
    const now = Date.now();
    return Math.min(...keys.map(k => Math.max(0, getKeyState(k).cooldownUntil - now)));
  }

  async function callGemini(params: {
    userId: string; feature: string; prompt: string;
    imageParts?: { inlineData: { mimeType: string; data: string } }[];
    maxTokens?: number; temperature?: number; jsonMode?: boolean;
  }): Promise<{ text: string; model: string; latencyMs: number } | null> {
    const config = await getAiFeatureConfig(params.userId, params.feature);
    if (!config.enabled) return null;

    const keys = await getAiKeys(params.userId);
    const model = config.model || 'gemini-2.5-flash-lite';
    const MAX_ATTEMPTS = keys.length + 2; // margen para esperar cooldowns

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const apiKey = selectKey(keys);

      if (!apiKey) {
        // Todas en cooldown — esperar al más próximo reset (máx 65s)
        const waitMs = msUntilNextKey(keys);
        if (waitMs > 0 && waitMs <= 65000) {
          console.warn(`[ai-gateway] Todas las keys en cooldown. Esperando ${Math.ceil(waitMs / 1000)}s...`);
          await new Promise(r => setTimeout(r, waitMs + 500));
          continue;
        }
        break;
      }

      // Marcar ANTES de llamar → otras llamadas concurrentes eligen otra key
      getKeyState(apiKey).lastUsedAt = Date.now();

      const start = Date.now();
      try {
        const parts: any[] = [{ text: params.prompt }];
        if (params.imageParts) parts.push(...params.imageParts);

        const body: any = {
          contents: [{ parts }],
          generationConfig: {
            temperature: params.temperature ?? 0.2,
            maxOutputTokens: params.maxTokens ?? 400,
            thinkingConfig: { thinkingBudget: 0 },
          },
        };
        if (params.jsonMode) body.generationConfig.responseMimeType = 'application/json';

        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) }
        );
        const latencyMs = Date.now() - start;

        if (resp.status === 429) {
          getKeyState(apiKey).cooldownUntil = Date.now() + 61000;
          const disponibles = keys.filter(k => Date.now() >= getKeyState(k).cooldownUntil).length;
          console.warn(`[ai-gateway] 429 key ...${apiKey.slice(-4)} → cooldown 61s. Keys disponibles ahora: ${disponibles}/${keys.length}`);
          await logAiUsage({ userId: params.userId, feature: params.feature, model, latencyMs, success: false, errorMessage: 'Rate limit 429' });
          continue;
        }

        if (!resp.ok) {
          const errText = await resp.text();
          console.error(`[ai-gateway] HTTP ${resp.status}:`, errText.slice(0, 200));
          await logAiUsage({ userId: params.userId, feature: params.feature, model, latencyMs, success: false, errorMessage: `HTTP ${resp.status}` });
          return null;
        }

        const data = await resp.json();
        // Gemini 2.5 puede devolver thinking tokens (thought:true) antes de la respuesta real.
        // Ignoramos los tokens de pensamiento y tomamos el primer texto real.
        const allParts: any[] = data.candidates?.[0]?.content?.parts ?? [];
        const textResp = allParts.find((p: any) => !p.thought)?.text ?? allParts[0]?.text ?? '';
        await logAiUsage({
          userId: params.userId, feature: params.feature, model, latencyMs, success: true,
          inputTokens: data.usageMetadata?.promptTokenCount,
          outputTokens: data.usageMetadata?.candidatesTokenCount,
        });
        return { text: textResp, model, latencyMs };

      } catch (err: any) {
        const latencyMs = Date.now() - start;
        await logAiUsage({ userId: params.userId, feature: params.feature, model, latencyMs, success: false, errorMessage: err?.message });
        return null;
      }
    }

    console.error(`[ai-gateway] Sin keys disponibles para ${params.feature}.`);
    return null;
  }


  function dataUriToImagePart(dataUri: string): { inlineData: { mimeType: string; data: string } } | null {
    const m = dataUri.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return null;
    return { inlineData: { mimeType: m[1], data: m[2] } };
  }

  // Normaliza un nombre para comparación: quita tildes, puntuación, mayúsculas.
  function normalizeName(name: string): string {
    return name.toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Enriquece la respuesta de la IA: calcula es_transferencia_propia server-side
  // como red de seguridad en caso de que la IA lo omita o lo calcule mal.
  // Usa comparación por palabras para tolerar variaciones menores del OCR.
  function enrichReceiptData(parsed: any, ownerName: string): any {
    const ownerWords = normalizeName(ownerName).split(' ').filter(Boolean);
    const pagadorWords = parsed.pagador ? normalizeName(parsed.pagador).split(' ').filter(Boolean) : [];
    const matchingWords = ownerWords.filter(w => pagadorWords.includes(w)).length;
    const wordOverlap = ownerWords.length > 0 ? matchingWords / ownerWords.length : 0;
    // 75% de palabras del nombre coinciden → es transferencia propia
    const isSelfTransfer = wordOverlap >= 0.75;
    return { ...parsed, es_transferencia_propia: isSelfTransfer || !!parsed.es_transferencia_propia };
  }

  // ── Endpoints ───────────────────────────────────────────────────────────────

  // POST /api/ai/product-from-images
  router.post('/product-from-images', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ ok: false, error: 'Autenticación requerida' });
      const { imageUrls } = req.body;
      if (!imageUrls?.length) return res.status(400).json({ ok: false, error: 'imageUrls requerido' });

      const imageParts: any[] = [];
      for (const url of (imageUrls as string[]).slice(0, 3)) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const buf = await r.arrayBuffer();
          imageParts.push({ inlineData: { mimeType: r.headers.get('content-type') || 'image/jpeg', data: Buffer.from(buf).toString('base64') } });
        } catch { /* skip */ }
      }
      if (imageParts.length === 0) return res.status(422).json({ ok: false, error: 'No se pudieron cargar las imágenes' });

      const result = await callGemini({ userId, feature: 'product_vision', prompt: buildProductCatalogPrompt(), imageParts, maxTokens: 400, temperature: 0.2, jsonMode: true });
      if (!result?.text) return res.status(422).json({ ok: false, error: 'Sin respuesta de la IA' });

      const m = result.text.match(/\{[\s\S]*\}/);
      if (!m) return res.status(422).json({ ok: false, error: 'Respuesta no parseable' });
      const parsed = JSON.parse(m[0]);
      res.json({ ok: true, data: parsed });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // POST /api/ai/analyze-image  (prenda / comprobante / otro)
  router.post('/analyze-image', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ ok: false, error: 'x-user-id requerido' });
      const { imageUrls } = req.body;
      if (!imageUrls?.length) return res.status(400).json({ ok: false, error: 'imageUrls requerido' });

      const imageParts: any[] = (await Promise.all((imageUrls as string[]).map(async (url) => {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!r.ok) return null;
          const buf = await r.arrayBuffer();
          return { inlineData: { mimeType: r.headers.get('content-type') || 'image/jpeg', data: Buffer.from(buf).toString('base64') } };
        } catch { return null; }
      }))).filter(Boolean) as any[];

      if (imageParts.length === 0) return res.status(422).json({ ok: false, error: 'No se pudieron cargar las imágenes' });

      const result = await callGemini({ userId, feature: 'product_vision', prompt: buildImageClassifierPrompt(), imageParts, maxTokens: 300, temperature: 0, jsonMode: true });
      if (!result?.text) return res.status(422).json({ ok: false, error: 'Sin respuesta' });
      const m = result.text.match(/\{[\s\S]*\}/);
      if (!m) return res.status(422).json({ ok: false, error: 'JSON inválido' });
      res.json({ ok: true, data: JSON.parse(m[0]) });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // POST /api/ai/analyze-qr  (extracción de comprobante de pago)
  router.post('/analyze-qr', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ ok: false, error: 'x-user-id requerido' });
      const { imageUrl, waNumber } = req.body;
      if (!imageUrl) return res.status(400).json({ ok: false, error: 'imageUrl requerido' });

      let imagePart: any;
      try {
        const r = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return res.status(422).json({ ok: false, error: 'No se pudo cargar la imagen' });
        const buf = await r.arrayBuffer();
        imagePart = { inlineData: { mimeType: r.headers.get('content-type') || 'image/jpeg', data: Buffer.from(buf).toString('base64') } };
      } catch { return res.status(422).json({ ok: false, error: 'Error descargando imagen' }); }

      const ownerName = await getOwnerName(userId);
      const result = await callGemini({ userId, feature: 'product_vision', prompt: buildReceiptQrPrompt(ownerName), imageParts: [imagePart], maxTokens: 300, temperature: 0, jsonMode: true });
      if (!result?.text) return res.status(422).json({ ok: false, error: 'Sin respuesta de la IA' });
      const m = result.text.match(/\{[\s\S]*\}/);
      if (!m) return res.status(422).json({ ok: false, error: 'JSON inválido' });
      const parsed = enrichReceiptData(JSON.parse(m[0]), ownerName);

      // Triangulación: vincular pagador con cliente si hay waNumber
      if (parsed.es_comprobante && parsed.pagador && waNumber) {
        const canonical = parsed.pagador.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, '').trim();
        try {
          await supabase.rpc('fn_link_customer_wa', { p_canonical_name: canonical, p_wa_number: String(waNumber).replace(/\D/g, ''), p_user_id: userId });
        } catch (e) { console.error('[link-wa]', e); }
      }

      res.json({ ok: true, data: parsed });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // POST /api/ai/analyze-qr-base64  (para tests locales con archivos)
  router.post('/analyze-qr-base64', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ ok: false, error: 'x-user-id requerido' });
      const imagePart = dataUriToImagePart(req.body.imageData ?? '');
      if (!imagePart) return res.status(400).json({ ok: false, error: 'imageData inválido' });

      const ownerName = await getOwnerName(userId);
      const result = await callGemini({ userId, feature: 'product_vision', prompt: buildReceiptQrPrompt(ownerName), imageParts: [imagePart], maxTokens: 300, temperature: 0, jsonMode: true });
      if (!result?.text) return res.status(422).json({ ok: false, error: 'Sin respuesta' });
      const m = result.text.match(/\{[\s\S]*\}/);
      if (!m) return res.status(422).json({ ok: false, error: 'JSON inválido' });
      res.json({ ok: true, data: enrichReceiptData(JSON.parse(m[0]), ownerName) });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // POST /api/ai/analyze-image-base64  (para tests locales)
  router.post('/analyze-image-base64', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ ok: false, error: 'x-user-id requerido' });
      const imagePart = dataUriToImagePart(req.body.imageData ?? '');
      if (!imagePart) return res.status(400).json({ ok: false, error: 'imageData inválido' });

      const result = await callGemini({ userId, feature: 'product_vision', prompt: buildImageClassifierPrompt(), imageParts: [imagePart], maxTokens: 150, temperature: 0, jsonMode: true });
      if (!result?.text) return res.status(422).json({ ok: false, error: 'Sin respuesta' });
      const m = result.text.match(/\{[\s\S]*\}/);
      if (!m) return res.status(422).json({ ok: false, error: 'JSON inválido' });
      res.json({ ok: true, data: JSON.parse(m[0]) });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // GET /api/ai/prompts
  router.get('/prompts', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });

      const { data } = await supabase
        .from('ai_prompts')
        .select('prompt_key, prompt_text, updated_at')
        .eq('user_id', userId);

      const prompts: Record<string, { text: string; updated_at: string }> = {};
      for (const row of data ?? []) {
        prompts[row.prompt_key] = { text: row.prompt_text, updated_at: row.updated_at };
      }

      // Incluir el prompt por defecto si no hay uno guardado
      if (!prompts['comprobante_extraction']) {
        prompts['comprobante_extraction'] = { text: DEFAULT_COMPROBANTE_PROMPT, updated_at: '' };
      }
      // Incluir el modo activo por defecto si no está guardado
      if (!prompts['comprobante_mode']) {
        prompts['comprobante_mode'] = { text: 'simple', updated_at: '' };
      }

      res.json({ ok: true, prompts });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // PATCH /api/ai/prompts/:key
  router.patch('/prompts/:key', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
      const { key } = req.params;
      const { text } = req.body;
      if (typeof text !== 'string') return res.status(400).json({ error: 'text requerido' });

      const { error } = await supabase.from('ai_prompts').upsert({
        user_id: userId,
        prompt_key: key,
        prompt_text: text,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,prompt_key' });

      if (error) throw error;
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // GET /api/ai/config
  router.get('/config', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });

      const { data, error } = await supabase.from('ai_config').select('*').eq('user_id', userId).single();
      const maskKey = (k: string | null) => k ? '••••' + k.slice(-4) : '';

      if (error || !data) {
        return res.json({
          keys: [
            { slot: 1, masked: process.env.GEMINI_API_KEY ? maskKey(process.env.GEMINI_API_KEY) : '', active: !!process.env.GEMINI_API_KEY },
            { slot: 2, masked: '', active: false },
            { slot: 3, masked: '', active: false },
            { slot: 4, masked: '', active: false },
            { slot: 5, masked: '', active: false },
          ],
          primary_key: process.env.GEMINI_API_KEY ? maskKey(process.env.GEMINI_API_KEY) : '',
          has_primary: !!process.env.GEMINI_API_KEY,
          fallback_key: '', has_fallback: false,
          owner_name: '',
          features: {
            product_vision: { enabled: true, model: 'gemini-2.5-flash-lite' },
            chat_summary: { enabled: true, model: 'gemini-2.5-flash-lite' },
            notif_parser: { enabled: true, model: 'gemini-2.5-flash-lite' },
          },
          daily_limit: 1500,
          source: 'env',
        });
      }

      res.json({
        keys: [
          { slot: 1, masked: maskKey(data.primary_key_encrypted), active: !!data.primary_key_encrypted },
          { slot: 2, masked: maskKey(data.fallback_key_encrypted), active: !!data.fallback_key_encrypted },
          { slot: 3, masked: maskKey(data.fallback2_key_encrypted), active: !!data.fallback2_key_encrypted },
          { slot: 4, masked: maskKey(data.key3_encrypted), active: !!data.key3_encrypted },
          { slot: 5, masked: maskKey(data.key4_encrypted), active: !!data.key4_encrypted },
        ],
        primary_key: maskKey(data.primary_key_encrypted),
        has_primary: !!data.primary_key_encrypted,
        fallback_key: maskKey(data.fallback_key_encrypted),
        has_fallback: !!data.fallback_key_encrypted,
        owner_name: data.owner_name ?? '',
        features: data.features,
        daily_limit: data.daily_limit ?? 1500,
        source: 'db',
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // POST /api/ai/config
  router.post('/config', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });

      const { keys, primaryKey, fallbackKey, fallback2Key, key3, key4, key5, features, ownerName } = req.body;
      const upsertData: any = { user_id: userId, updated_at: new Date() };

      if (Array.isArray(keys)) {
        const cols = ['primary_key_encrypted', 'fallback_key_encrypted', 'fallback2_key_encrypted', 'key3_encrypted', 'key4_encrypted', 'key5_encrypted'];
        keys.forEach((k: string | undefined, i: number) => { if (k !== undefined && cols[i]) upsertData[cols[i]] = k || null; });
      } else {
        if (primaryKey !== undefined) upsertData.primary_key_encrypted = primaryKey;
        if (fallbackKey !== undefined) upsertData.fallback_key_encrypted = fallbackKey;
        if (fallback2Key !== undefined) upsertData.fallback2_key_encrypted = fallback2Key;
        if (key3 !== undefined) upsertData.key3_encrypted = key3;
        if (key4 !== undefined) upsertData.key4_encrypted = key4;
        if (key5 !== undefined) upsertData.key5_encrypted = key5;
      }
      if (features) upsertData.features = features;
      if (ownerName !== undefined) upsertData.owner_name = ownerName || null;

      const { data, error } = await supabase.from('ai_config').upsert(upsertData, { onConflict: 'user_id' }).select().single();
      if (error) throw error;
      res.json({ ok: true, data });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // POST /api/ai/test-key  (testear que una key es válida)
  router.post('/test-key', async (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey) return res.status(400).json({ error: 'apiKey requerida' });

      const start = Date.now();
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Responde solo: OK' }] }], generationConfig: { maxOutputTokens: 5 } }),
          signal: AbortSignal.timeout(10000),
        }
      );
      const latency = Date.now() - start;

      if (resp.ok) {
        res.json({ ok: true, latency, message: `✅ Key válida (${latency}ms)` });
      } else {
        const err = await resp.json();
        res.json({ ok: false, latency, message: `❌ ${err.error?.message || resp.status}` });
      }
    } catch (err: any) {
      res.json({ ok: false, message: `❌ ${err?.message}` });
    }
  });

  // GET /api/ai/usage
  router.get('/usage', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });

      const days = Number(req.query.days) || 7;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('ai_usage_log')
        .select('feature, success, latency_ms, created_at, error_message, input_tokens, output_tokens')
        .eq('user_id', userId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) return res.json({ total: 0, today: 0, errors: 0, byFeature: {}, log: [] });

      const today = new Date().toISOString().slice(0, 10);
      const todayCount = (data ?? []).filter(r => r.created_at?.startsWith(today)).length;
      const errors = (data ?? []).filter(r => !r.success).length;
      const byFeature: Record<string, number> = {};
      for (const r of data ?? []) { byFeature[r.feature] = (byFeature[r.feature] || 0) + 1; }

      res.json({ total: data?.length ?? 0, today: todayCount, errors, byFeature, log: (data ?? []).slice(0, 50) });
    } catch {
      res.json({ total: 0, today: 0, errors: 0, byFeature: {}, log: [] });
    }
  });

  // POST /api/ai/summarize-conversation
  // Recibe { clienteId } — lee mensajes de panel_mensajes y genera un resumen del pedido.
  // También extrae datos de comprobantes con el prompt configurable y vincula al Sistema Pulpo.
  router.post('/summarize-conversation', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
      const { clienteId } = req.body;
      if (!clienteId) return res.status(400).json({ error: 'clienteId requerido' });

      const panelDb = supabasePanel ?? supabase;

      // Obtener teléfono del cliente para vincular con el Sistema Pulpo
      const { data: clienteData } = await panelDb
        .from('panel_clientes')
        .select('phone')
        .eq('id', clienteId)
        .single();
      const panelPhone: string | null = clienteData?.phone ?? null;

      // Leer mensajes de la tabla del panel de WhatsApp
      const { data: mensajes, error: dbErr } = await panelDb
        .from('panel_mensajes')
        .select('content, media_url, media_type, has_media, direction')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: true });

      if (dbErr) return res.status(500).json({ error: dbErr.message });
      if (!mensajes?.length) return res.status(404).json({ error: 'Sin mensajes' });

      const textos: string[]    = [];
      const fotoUrls: string[]  = [];
      const audioUrls: string[] = [];

      for (const m of mensajes) {
        if (m.content?.trim()) textos.push(m.content.trim());
        if (m.media_url) {
          const mt: string = m.media_type || '';
          const isImage = mt.startsWith('image/') || /\.(jpg|jpeg|png|webp)/i.test(m.media_url);
          const isAudio = mt.startsWith('audio/') || mt.startsWith('video/') || /\.(ogg|mp3|mp4|m4a)/i.test(m.media_url);
          if (isImage) fotoUrls.push(m.media_url);
          else if (isAudio) audioUrls.push(m.media_url);
        }
      }

      // Helper: descargar URL → base64
      async function fetchBase64(url: string): Promise<{ b64: string; mime: string } | null> {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!r.ok) return null;
          const buf = await r.arrayBuffer();
          return { b64: Buffer.from(buf).toString('base64'), mime: r.headers.get('content-type') || 'application/octet-stream' };
        } catch { return null; }
      }

      // Cargar prompt de extracción de comprobantes (configurable desde el panel)
      const ownerName = await getOwnerName(userId);
      const rawComprobantePrompt = await getPrompt(userId, 'comprobante_extraction');
      const comprobantePrompt = rawComprobantePrompt.replace(/\{\{OWNER_NAME\}\}/g, ownerName);

      // Transcribir audios (máx 3)
      const transcripciones: string[] = [];
      for (const url of audioUrls.slice(0, 3)) {
        const media = await fetchBase64(url);
        if (!media) continue;
        const mime = url.includes('.mp3') ? 'audio/mpeg' : 'audio/ogg';
        const result = await callGemini({
          userId, feature: 'chat_summary',
          prompt: 'Transcribe exactamente lo que dice este audio en español. Solo el texto, sin explicaciones.',
          imageParts: [{ inlineData: { mimeType: mime, data: media.b64 } }],
          maxTokens: 300, temperature: 0,
        });
        if (result?.text) transcripciones.push(result.text.trim());
      }

      // Clasificar fotos y detectar comprobante.
      // El comprobante puede llegar en CUALQUIER posición: antes, en el medio, o después de las prendas.
      // Procesamos las primeras 3 fotos para las descripciones del resumen,
      // y ADEMÁS revisamos todas las fotos restantes buscando el comprobante.
      const descripciones: string[] = [];
      let comprobanteExtraido: { cliente: string | null; monto: string | null; hora: string | null } | null = null;

      const CLASIFICADOR_PROMPT = `Analiza esta imagen y responde con UNA SOLA línea:
- Si es un COMPROBANTE de pago, transferencia o captura de QR bancario: escribe "COMPROBANTE: [nombre del pagador] - [monto] Bs - [banco o app]".
- Si es una PRENDA de ropa: escribe "PRENDA: [color, tipo, características]". Máximo 15 palabras.
- Si es otra cosa: escribe "OTRO: [descripción breve]".
Responde SOLO con una línea, sin explicaciones.`;

      async function clasificarYExtraer(url: string): Promise<void> {
        const media = await fetchBase64(url);
        if (!media) return;
        const mime = url.endsWith('.png') ? 'image/png' : url.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        const imagePart = { inlineData: { mimeType: mime, data: media.b64 } };

        const classResult = await callGemini({
          userId, feature: 'chat_summary',
          prompt: CLASIFICADOR_PROMPT,
          imageParts: [imagePart], maxTokens: 200, temperature: 0,
        });
        const desc = classResult?.text?.trim() ?? '';
        if (desc) descripciones.push(desc);

        if (desc.toUpperCase().startsWith('COMPROBANTE') && !comprobanteExtraido) {
          const extractResult = await callGemini({
            userId, feature: 'chat_summary',
            prompt: comprobantePrompt,
            imageParts: [imagePart], maxTokens: 250, temperature: 0, jsonMode: true,
          });
          if (extractResult?.text) {
            const match = extractResult.text.match(/\{[\s\S]*\}/);
            if (match) {
              try {
                const raw = JSON.parse(match[0]);
                comprobanteExtraido = normalizeComprobanteResponse(raw);
              } catch { /* ignorar */ }
            }
          }
        }
      }

      // Primeras 3 fotos: descripciones para el resumen
      for (const url of fotoUrls.slice(0, 3)) {
        await clasificarYExtraer(url);
      }

      // Si no encontramos comprobante aún y hay más fotos, revisar las restantes
      // en orden INVERSO (más reciente primero) para capturar el comprobante más nuevo.
      if (!comprobanteExtraido && fotoUrls.length > 3) {
        // Máximo 5 fotos adicionales (8 totales) para no agotar la cuota de Gemini
        for (const url of [...fotoUrls.slice(3)].reverse().slice(0, 5)) {
          await clasificarYExtraer(url);
          if (comprobanteExtraido) break;
        }
      }

      // Generar resumen final del pedido
      const comprobanteDesc = comprobanteExtraido?.cliente
        ? `${comprobanteExtraido.cliente}${comprobanteExtraido.monto ? ' - ' + comprobanteExtraido.monto + ' Bs' : ''}${comprobanteExtraido.hora ? ' - ' + comprobanteExtraido.hora : ''}`
        : null;

      const promptFinal = `Eres un asistente que analiza conversaciones de WhatsApp de una tienda de ropa en Bolivia.

MENSAJES DE TEXTO:
${textos.join('\n') || '(ninguno)'}

ANÁLISIS DE FOTOGRAFÍAS:
${descripciones.map((d, i) => `Foto ${i+1}: ${d}`).join('\n') || '(ninguna)'}

TRANSCRIPCIÓN DE AUDIOS:
${transcripciones.map((t, i) => `Audio ${i+1}: "${t}"`).join('\n') || '(ninguno)'}

Genera este JSON exacto (sin backticks, sin texto antes o después):
{"pedido":"qué quiere el cliente","cantidad":"número o no especificado","talla":"talla o no especificada","pago":"forma de pago o no especificado","entrega":"cuándo o dónde o no especificado","comprobante":${comprobanteDesc ? JSON.stringify(comprobanteDesc) : '"Si hay un comprobante de pago en las fotos, escribe: nombre del pagador - monto Bs - banco. Si no hay comprobante, escribe null"'},"notas":"observaciones adicionales o null"}`;

      const finalResult = await callGemini({
        userId, feature: 'chat_summary',
        prompt: promptFinal,
        maxTokens: 400, temperature: 0, jsonMode: true,
      });

      let resumen: Record<string, string | null> = { pedido: 'Sin respuesta de IA' };
      if (finalResult?.text) {
        const match = finalResult.text.match(/\{[\s\S]*?\}/s);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            // Si el pedido contiene un JSON completo en vez de texto → estaba doblemente codificado
            if (typeof parsed.pedido === 'string' && parsed.pedido.trimStart().startsWith('{')) {
              try { resumen = JSON.parse(parsed.pedido); } catch { resumen = parsed; }
            } else {
              resumen = parsed;
            }
          } catch {
            console.warn('[summarize] JSON parse falló, reintentando con regex no-greedy');
            const m2 = finalResult.text.match(/\{[^{}]*\}/);
            if (m2) {
              try { resumen = JSON.parse(m2[0]); } catch { /* sin datos */ }
            }
          }
        }
      }

      // Si hay comprobante extraído, asegurar que el resumen lo incluye
      if (comprobanteDesc) resumen.comprobante = comprobanteDesc;

      // ── Procesar comprobante extraído ────────────────────────────────────────
      let estadoPago: 'pagado_verificado' | 'solo_comprobante' | null = null;
      let pagoAlerta: { nombre: string; monto: string | null; hora: string | null } | null = null;

      if (comprobanteExtraido?.cliente) {
        const nombreCliente = comprobanteExtraido.cliente;
        const montoNum = comprobanteExtraido.monto ? parseFloat(comprobanteExtraido.monto) : null;
        const nameNorm = nombreCliente.toUpperCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z\s]/g, '').replace(/\s+/g, ' ').trim();

        // 1. Guardar nombre en panel_clientes
        await panelDb.from('panel_clientes').update({ nombre: nombreCliente }).eq('id', clienteId);

        // 1b. CONEXIÓN PRINCIPAL: vincular teléfono WA al perfil en customers
        if (panelPhone) {
          const waPhone = panelPhone.replace(/\D/g, '');
          try {
            // fn_link_customer_wa busca por nombre exacto o fuzzy (>0.6) y escribe wa_number
            const { data: customerId } = await supabase.rpc('fn_link_customer_wa', {
              p_canonical_name: nameNorm,
              p_wa_number: waPhone,
              p_user_id: userId,
            });

            if (!customerId) {
              // Auto-aprendizaje: cliente nuevo que llega solo por WhatsApp
              // Crear el perfil en customers para que aparezca en la app principal
              await supabase.from('customers').insert({
                full_name: nombreCliente,
                canonical_name: nameNorm,
                normalized_name: nameNorm.toLowerCase(),
                wa_number: waPhone,
                phone: waPhone,
                active_label: null,
                active_label_type: null,
                user_id: userId,
                is_active: true,
                source: 'whatsapp',
              });
              console.log(`[summarize] Cliente nuevo creado en customers: "${nombreCliente}" wa=${waPhone}`);
            } else {
              console.log(`[summarize] customers.wa_number actualizado: "${nombreCliente}" (id=${customerId}) wa=${waPhone}`);
            }
          } catch (e: any) {
            console.warn('[summarize] fn_link_customer_wa (no crítico):', e?.message);
          }
        }

        // 2. Verificar si existe pago de MacroDroid con monto similar en las últimas 24h
        if (montoNum && montoNum > 0) {
          const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: pagosMatch } = await supabase
            .from('pagos')
            .select('id, nombre, pago, date')
            .eq('user_id', userId)
            .eq('method', 'Notificación bancaria')
            .gte('date', since24h)
            .gte('pago', montoNum * 0.97)
            .lte('pago', montoNum * 1.03);

          estadoPago = pagosMatch?.length ? 'pagado_verificado' : 'solo_comprobante';
        } else {
          estadoPago = 'solo_comprobante';
        }

        // 3. Si solo hay comprobante sin MacroDroid, preparar alerta para el operador
        if (estadoPago === 'solo_comprobante') {
          pagoAlerta = { nombre: nombreCliente, monto: comprobanteExtraido.monto, hora: comprobanteExtraido.hora };
        }

        // 4. Actualizar estado en panel_clientes
        await panelDb.from('panel_clientes').update({ estado: estadoPago }).eq('id', clienteId);

        // 5. Vincular con el Sistema Pulpo (identity_profiles): teléfono WA ↔ nombre del comprobante
        if (panelPhone) {
          try {
            const waPhone = panelPhone.replace(/\D/g, '');
            const match = await findOrCreateProfile(supabase, userId, {
              name: nombreCliente,
              phone: waPhone,
            });

            // Actualizar panel_phone y/o display_name si faltan
            const updates: Record<string, string> = {};
            if (!match.profile.panel_phone) updates.panel_phone = waPhone;
            if (nombreCliente.length > (match.profile.display_name?.trim()?.length ?? 0)) updates.display_name = nombreCliente;
            if (Object.keys(updates).length > 0) {
              await supabase.from('identity_profiles').update(updates).eq('id', match.profile.id);
            }

            // AUTO-MERGE: si existe otro perfil con el mismo nombre, fusionarlo aquí
            // Cubre el caso: MacroDroid creó perfil con nombre (sin tel) + WhatsApp creó perfil con tel (sin nombre)
            const { data: duplicates } = await supabase
              .from('identity_profiles')
              .select('id, display_name, phone, panel_phone, store_phone, cliente_id, merged_from')
              .eq('user_id', userId)
              .neq('id', match.profile.id);

            const duplicate = duplicates?.find(p => {
              const pNorm = (p.display_name ?? '').toUpperCase()
                .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z\s]/g, '').replace(/\s+/g, ' ').trim();
              return pNorm === nameNorm && pNorm.length > 0;
            });

            if (duplicate) {
              // Mover toda la evidencia del duplicado al perfil actual
              await supabase.from('identity_evidence')
                .update({ profile_id: match.profile.id })
                .eq('profile_id', duplicate.id)
                .eq('user_id', userId);

              // Heredar campos que el perfil actual no tenga
              const mergeUpdates: Record<string, unknown> = {
                merged_from: [...(match.profile.merged_from ?? []), duplicate.id],
              };
              if (!match.profile.phone && duplicate.phone) mergeUpdates.phone = duplicate.phone;
              if (!match.profile.panel_phone && duplicate.panel_phone) mergeUpdates.panel_phone = duplicate.panel_phone;
              if (!match.profile.store_phone && duplicate.store_phone) mergeUpdates.store_phone = duplicate.store_phone;
              if (!(match.profile as any).cliente_id && duplicate.cliente_id) mergeUpdates.cliente_id = duplicate.cliente_id;

              await supabase.from('identity_profiles').update(mergeUpdates).eq('id', match.profile.id);
              await supabase.from('identity_profiles').delete().eq('id', duplicate.id).eq('user_id', userId);
              console.log(`[summarize] Pulpo auto-merge: eliminado duplicado ${duplicate.id} → fusionado en ${match.profile.id}`);
            }

            // Depositar evidencia de WhatsApp
            await depositEvidence(supabase, userId, match.profile.id, {
              source: 'whatsapp',
              event_type: 'comprobante_pago',
              phone: waPhone,
              name_raw: nombreCliente,
              amount: comprobanteExtraido?.monto ? parseFloat(comprobanteExtraido.monto) : undefined,
              event_at: new Date().toISOString(),
              payload: { estado: estadoPago, hora: comprobanteExtraido?.hora },
            });
            console.log(`[summarize] Pulpo: "${nombreCliente}" ↔ ${waPhone} → perfil ${match.profile.id} (${match.match_type})`);
          } catch (e: any) {
            console.warn('[summarize] Pulpo link (no crítico):', e?.message);
          }
        }
      }

      // Guardar resumen en la tabla del panel
      await panelDb.from('panel_clientes').update({
        resumen: JSON.stringify(resumen),
        resumen_at: new Date().toISOString(),
      }).eq('id', clienteId);

      res.json({
        ok: true,
        resumen,
        comprobante_extraido: comprobanteExtraido,
        estado_pago: estadoPago,
        pago_alerta: pagoAlerta,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  return router;
}
