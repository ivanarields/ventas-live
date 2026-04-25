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
} from '../ai/prompts/index';

export function createAiRouter(supabase: SupabaseClient) {
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
        return [
          data.primary_key_encrypted || envKey,
          data.fallback_key_encrypted,
          data.fallback2_key_encrypted,
          data.key3_encrypted,
          data.key4_encrypted,
          data.key5_encrypted,
        ].filter(Boolean) as string[];
      }
    } catch { /* tabla no existe → usar .env */ }
    return [envKey].filter(Boolean);
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
        const textResp = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
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
  // Reemplaza la Edge Function summarize-conversation para que use el round-robin de keys.
  // Recibe { clienteId } — lee mensajes de panel_mensajes y genera un resumen del pedido.
  router.post('/summarize-conversation', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
      const { clienteId } = req.body;
      if (!clienteId) return res.status(400).json({ error: 'clienteId requerido' });

      // Leer mensajes de la tabla del panel de WhatsApp
      const { data: mensajes, error: dbErr } = await supabase
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
          if (/\.(jpg|jpeg|png|webp)/i.test(m.media_url)) fotoUrls.push(m.media_url);
          if (/\.(ogg|mp3|mp4|m4a)/i.test(m.media_url)) audioUrls.push(m.media_url);
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

      // Transcribir audios (máx 3) — cada uno es 1 llamada a la IA
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

      // Describir fotos (máx 3) — cada una es 1 llamada a la IA
      const descripciones: string[] = [];
      for (const url of fotoUrls.slice(0, 3)) {
        const media = await fetchBase64(url);
        if (!media) continue;
        const mime = url.endsWith('.png') ? 'image/png' : url.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        const result = await callGemini({
          userId, feature: 'chat_summary',
          prompt: `Analiza esta imagen y responde con UNA SOLA línea:
- Si es un COMPROBANTE de pago, transferencia o captura de QR bancario: escribe "COMPROBANTE: [nombre del pagador] - [monto] Bs - [banco o app]".
- Si es una PRENDA de ropa: escribe "PRENDA: [color, tipo, características]". Máximo 15 palabras.
- Si es otra cosa: escribe "OTRO: [descripción breve]".
Responde SOLO con una línea, sin explicaciones.`,
          imageParts: [{ inlineData: { mimeType: mime, data: media.b64 } }],
          maxTokens: 200, temperature: 0,
        });
        if (result?.text) descripciones.push(result.text.trim());
      }

      // Generar resumen final del pedido (1 llamada de texto)
      const promptFinal = `Eres un asistente que analiza conversaciones de WhatsApp de una tienda de ropa en Bolivia.

MENSAJES DE TEXTO:
${textos.join('\n') || '(ninguno)'}

ANÁLISIS DE FOTOGRAFÍAS:
${descripciones.map((d, i) => `Foto ${i+1}: ${d}`).join('\n') || '(ninguna)'}

TRANSCRIPCIÓN DE AUDIOS:
${transcripciones.map((t, i) => `Audio ${i+1}: "${t}"`).join('\n') || '(ninguno)'}

Genera este JSON exacto (sin backticks, sin texto antes o después):
{"pedido":"qué quiere el cliente","cantidad":"número o no especificado","talla":"talla o no especificada","pago":"forma de pago o no especificado","entrega":"cuándo o dónde o no especificado","comprobante":"Si hay un comprobante de pago en las fotos, escribe: nombre del pagador - monto Bs - banco. Si no hay comprobante, escribe null","notas":"observaciones adicionales o null"}`;

      const finalResult = await callGemini({
        userId, feature: 'chat_summary',
        prompt: promptFinal,
        maxTokens: 400, temperature: 0, jsonMode: true,
      });

      let resumen: Record<string, string> = { pedido: 'Sin respuesta de IA' };
      if (finalResult?.text) {
        const match = finalResult.text.match(/\{[\s\S]*\}/);
        if (match) {
          try { resumen = JSON.parse(match[0]); } catch { resumen = { pedido: finalResult.text }; }
        }
      }

      // Guardar resumen en la tabla del panel
      await supabase.from('panel_clientes').update({
        resumen: JSON.stringify(resumen),
        resumen_at: new Date().toISOString(),
      }).eq('id', clienteId);

      res.json({ ok: true, resumen });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  return router;
}
