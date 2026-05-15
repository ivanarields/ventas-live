/**
 * ai-gateway.ts
 * Router dedicado para TODOS los endpoints de IA.
 * Se monta en server.ts con: app.use(aiRouter(supabaseServer))
 *
 * Esto evita que server.ts siga creciendo con lógica de IA.
 */

import { Router, Request, Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  buildProductCatalogPrompt,
  buildImageClassifierPrompt,
  buildReceiptQrPrompt,
} from '../ai/prompts/index.js';
import { findOrCreateProfile, depositEvidence } from '../services/identityService.js';
import { isContextualNameMatch, isStrongNameMatch } from '../services/nameMatching.js';
import {
  boliviaDateKey,
  ensurePanelLiveOrder,
  matchLivePaymentWithMacrodroid,
  normalizeLivePhone,
  parseLiveMonto,
  receiptAtFromMessage,
  recomputeLiveOrderTotals,
  syncMainPedidoForLiveOrder,
  upsertLiveEvidence,
  upsertWhatsappLivePayment,
} from '../services/liveSalesService.js';

export function createAiRouter(supabase: SupabaseClient, supabasePanel?: SupabaseClient) {
  const router = Router();
  const adminSupabase = (() => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  })();
  const storeSupabase = (() => {
    const url = process.env.VITE_STORE_SUPABASE_URL;
    const key = process.env.STORE_SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  })();

  type AiCallResult = { text: string; model: string; latencyMs: number };
  type OpenRouterKeySource = 'env' | 'db';
  const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL?.trim() || 'openai/gpt-4o-mini';

  function extractProviderError(raw: string): string {
    const text = raw?.trim();
    if (!text) return '';
    try {
      const parsed = JSON.parse(text);
      const message = parsed?.error?.message ?? parsed?.message ?? parsed?.error;
      if (message) return String(message).replace(/\s+/g, ' ').slice(0, 350);
    } catch { /* respuesta no JSON */ }
    return text.replace(/\s+/g, ' ').slice(0, 350);
  }

  function formatCaughtAiError(err: any, provider: string, timeoutMs: number): string {
    const name = String(err?.name ?? '');
    const message = String(err?.message ?? err ?? 'Error desconocido');
    const lower = `${name} ${message}`.toLowerCase();
    if (lower.includes('timeout') || lower.includes('abort')) {
      return `${provider} timeout (${Math.round(timeoutMs / 1000)}s)`;
    }
    return `${provider}: ${message}`;
  }

  function maskKey(k: string | null | undefined) {
    return k ? `••••${k.slice(-4)}` : '';
  }

  function isOpenRouterKey(k: string | null | undefined): k is string {
    const value = k?.trim() ?? '';
    return value.length > 20 && !value.startsWith('AIza');
  }

  function normalizeOpenRouterModel(raw: unknown): string {
    const value = String(raw ?? '').trim();
    if (!value || !value.includes('/')) return DEFAULT_OPENROUTER_MODEL;
    return value;
  }

  function extractFirstBalancedJson(text: string): string | null {
    const cleaned = String(text ?? '').trim().replace(/```json|```/g, '');
    const starts: number[] = [];
    const objStart = cleaned.indexOf('{');
    const arrStart = cleaned.indexOf('[');
    if (objStart >= 0) starts.push(objStart);
    if (arrStart >= 0) starts.push(arrStart);
    starts.sort((a, b) => a - b);

    for (const start of starts) {
      const open = cleaned[start];
      const close = open === '{' ? '}' : ']';
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];

        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === '\\') {
            escaped = true;
            continue;
          }
          if (ch === '"') inString = false;
          continue;
        }

        if (ch === '"') {
          inString = true;
          continue;
        }

        if (ch === open) {
          depth += 1;
          continue;
        }

        if (ch === close) {
          depth -= 1;
          if (depth === 0) return cleaned.slice(start, i + 1);
        }
      }
    }

    return null;
  }

  // ── Helpers internos ────────────────────────────────────────────────────────

  async function getOpenRouterKey(userId?: string): Promise<{ key: string; source: OpenRouterKeySource } | null> {
    const envKey = process.env.OPENROUTER_API_KEY?.trim() ?? '';
    try {
      if (userId) {
        const { data } = await supabase
          .from('ai_config')
          .select('primary_key_encrypted')
          .eq('user_id', userId)
          .single();
        const dbKey = data?.primary_key_encrypted?.trim();
        if (isOpenRouterKey(dbKey)) return { key: dbKey, source: 'db' };
      }
    } catch { /* tabla no existe → usar .env */ }
    return isOpenRouterKey(envKey) ? { key: envKey, source: 'env' } : null;
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

  function normalizePanelPhoneForLiveSales(raw: string | null | undefined): string | null {
    return normalizeLivePhone(raw);
  }

  function configuredLiveSalesTestPhones(): Set<string> {
    const raw = process.env.LIVE_SALES_TEST_PHONES || process.env.LIVE_SALES_TEST_PHONE || '';
    return new Set(
      raw
        .split(',')
        .map(phone => normalizePanelPhoneForLiveSales(phone))
        .filter(Boolean) as string[],
    );
  }

  function isLiveSalesTestPhone(phone: string | null): boolean {
    const normalized = normalizePanelPhoneForLiveSales(phone);
    if (!normalized) return false;
    const allowed = configuredLiveSalesTestPhones();
    return allowed.size > 0 && allowed.has(normalized);
  }

  function parseComprobanteMonto(raw: string | null | undefined): number | null {
    return parseLiveMonto(raw);
  }

  function parseReceiptTextFallback(raw: string | null | undefined): { nombre: string | null; monto: number | null } {
    if (!raw) return { nombre: null, monto: null };
    const text = raw.replace(/\s+/g, ' ').trim();
    const amountMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:bs|bob|bolivianos)?/i);
    const monto = amountMatch ? parseComprobanteMonto(amountMatch[1]) : null;
    let nombre: string | null = null;

    if (amountMatch?.index != null && amountMatch.index > 0) {
      const beforeAmount = text
        .slice(0, amountMatch.index)
        .replace(/^comprobante\s*[:\-]\s*/i, '')
        .trim();
      const pieces = beforeAmount.split(/\s+-\s+|:/).map(p => p.trim()).filter(Boolean);
      const candidate = pieces[pieces.length - 1] ?? beforeAmount;
      const normalized = candidate
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z\u00D1.\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const words = normalized.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && !/\b(BANCO|YAPE|QR|CUENTA|DEPOSITO|TRANSFERENCIA)\b/.test(normalized)) {
        nombre = normalized;
      }
    }

    return { nombre, monto };
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
    const defaults = defaultAiFeatures() as Record<string, { enabled: boolean; model: string }>;
    try {
      const { data } = await supabase
        .from('ai_config')
        .select('features')
        .eq('user_id', userId)
        .single();
      if (data?.features?.[feature]) {
        return {
          enabled: data.features[feature].enabled !== false,
          model: normalizeOpenRouterModel(data.features[feature].model),
        };
      }
    } catch { /* defaults */ }
    if (defaults[feature]) {
      return {
        enabled: defaults[feature].enabled,
        model: normalizeOpenRouterModel(defaults[feature].model),
      };
    }
    return { enabled: true, model: DEFAULT_OPENROUTER_MODEL };
  }

  function defaultAiFeatures() {
    return {
      product_vision: { enabled: true, model: DEFAULT_OPENROUTER_MODEL },
      chat_summary: { enabled: true, model: DEFAULT_OPENROUTER_MODEL },
      photo_selection: { enabled: false, model: DEFAULT_OPENROUTER_MODEL },
      notif_parser: { enabled: true, model: DEFAULT_OPENROUTER_MODEL },
    };
  }

  function normalizeAiFeatures(raw: any) {
    const defaults: Record<string, { enabled: boolean; model: string }> = defaultAiFeatures();
    for (const key of Object.keys(defaults)) {
      if (raw?.[key]) {
        defaults[key] = {
          enabled: raw[key].enabled !== false,
          model: normalizeOpenRouterModel(raw[key].model),
        };
      }
    }
    return defaults;
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

  async function callAi(params: {
    userId: string; feature: string; prompt: string;
    imageParts?: { inlineData: { mimeType: string; data: string } }[];
    maxTokens?: number; temperature?: number; jsonMode?: boolean;
  }): Promise<AiCallResult | null> {
    const config = await getAiFeatureConfig(params.userId, params.feature);
    if (!config.enabled) return null;
    const keyConfig = await getOpenRouterKey(params.userId);
    const model = normalizeOpenRouterModel(config.model);
    if (!keyConfig) {
      const msg = 'OpenRouter no configurado: falta OPENROUTER_API_KEY o una key valida en Configuracion > IA';
      await logAiUsage({ userId: params.userId, feature: params.feature, model: `openrouter:${model}`, latencyMs: 0, success: false, errorMessage: msg });
      throw new Error(msg);
    }

    const start = Date.now();

    try {
      const content: any[] = [{ type: 'text', text: params.prompt }];
      for (const part of params.imageParts ?? []) {
        if (!part.inlineData.mimeType.startsWith('image/')) {
          throw new Error(`OpenRouter no soporta ${part.inlineData.mimeType} en este endpoint`);
        }
        content.push({
          type: 'image_url',
          image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` },
        });
      }

      const body: any = {
        model,
        messages: [{ role: 'user', content: content.length === 1 ? params.prompt : content }],
        temperature: params.temperature ?? 0.2,
        max_tokens: params.maxTokens ?? 400,
      };
      if (params.jsonMode) body.response_format = { type: 'json_object' };

      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${keyConfig.key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'https://ventas-live.vercel.app',
          'X-Title': 'Ventas Live',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const latencyMs = Date.now() - start;

      if (!resp.ok) {
        const errText = await resp.text();
        const details = extractProviderError(errText);
        const msg = `OpenRouter HTTP ${resp.status}${details ? `: ${details}` : ''}`;
        console.error(`[openrouter] ${msg}`);
        await logAiUsage({
          userId: params.userId,
          feature: params.feature,
          model: `openrouter:${model}`,
          latencyMs,
          success: false,
          errorMessage: msg,
        });
        throw new Error(msg);
      }

      const data = await resp.json();
      const contentResp = data.choices?.[0]?.message?.content;
      const textResp = Array.isArray(contentResp)
        ? contentResp.map((item: any) => item?.text ?? '').join('').trim()
        : String(contentResp ?? '').trim();

      await logAiUsage({
        userId: params.userId,
        feature: params.feature,
        model: `openrouter:${model}`,
        latencyMs,
        success: !!textResp,
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        errorMessage: textResp ? null : 'Respuesta vacia',
      });

      if (!textResp) throw new Error('OpenRouter sin texto en la respuesta');
      return { text: textResp, model: `openrouter:${model}`, latencyMs };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      const msg = formatCaughtAiError(err, 'OpenRouter', 15000);
      await logAiUsage({
        userId: params.userId,
        feature: params.feature,
        model: `openrouter:${model}`,
        latencyMs,
        success: false,
        errorMessage: msg,
      });
      throw new Error(msg);
    }
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

      const result = await callAi({ userId, feature: 'product_vision', prompt: buildProductCatalogPrompt(), imageParts, maxTokens: 400, temperature: 0.2, jsonMode: true });
      if (!result?.text) return res.status(422).json({ ok: false, error: 'Sin respuesta de la IA' });

      const jsonText = extractFirstBalancedJson(String(result.text ?? ''));
      if (!jsonText) {
        return res.status(422).json({ ok: false, error: 'Respuesta no parseable' });
      }

      try {
        const parsed = JSON.parse(jsonText);
        res.json({ ok: true, data: parsed });
      } catch (parseErr: any) {
        return res.status(422).json({ ok: false, error: parseErr?.message || 'Respuesta no parseable' });
      }
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

      const result = await callAi({ userId, feature: 'product_vision', prompt: buildImageClassifierPrompt(), imageParts, maxTokens: 300, temperature: 0, jsonMode: true });
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
      const result = await callAi({ userId, feature: 'product_vision', prompt: buildReceiptQrPrompt(ownerName), imageParts: [imagePart], maxTokens: 300, temperature: 0, jsonMode: true });
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
      const result = await callAi({ userId, feature: 'product_vision', prompt: buildReceiptQrPrompt(ownerName), imageParts: [imagePart], maxTokens: 300, temperature: 0, jsonMode: true });
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

      const result = await callAi({ userId, feature: 'product_vision', prompt: buildImageClassifierPrompt(), imageParts: [imagePart], maxTokens: 150, temperature: 0, jsonMode: true });
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
      const envKey = process.env.OPENROUTER_API_KEY?.trim() ?? '';
      const envActive = isOpenRouterKey(envKey);

      if (error || !data) {
        return res.json({
          provider: 'openrouter',
          openrouter: {
            masked: envActive ? maskKey(envKey) : '',
            active: envActive,
            model: DEFAULT_OPENROUTER_MODEL,
            active_model: DEFAULT_OPENROUTER_MODEL,
            source: envActive ? 'env' : 'none',
          },
          keys: [{ slot: 1, masked: envActive ? maskKey(envKey) : '', active: envActive }],
          primary_key: envActive ? maskKey(envKey) : '',
          has_primary: envActive,
          fallback_key: '', has_fallback: false,
          owner_name: '',
          features: defaultAiFeatures(),
          daily_limit: 0,
          source: envActive ? 'env' : 'none',
        });
      }

      const dbKey = data.primary_key_encrypted?.trim();
      const dbActive = isOpenRouterKey(dbKey);
      const activeKey = dbActive ? dbKey : envActive ? envKey : '';
      const keySource = dbActive ? 'db' : envActive ? 'env' : 'none';
      const features = normalizeAiFeatures(data.features);
      const model = normalizeOpenRouterModel(Object.values(features)[0]?.model);

      res.json({
        provider: 'openrouter',
        openrouter: {
          masked: activeKey ? maskKey(activeKey) : '',
          active: !!activeKey,
          model,
          active_model: DEFAULT_OPENROUTER_MODEL,
          source: keySource,
        },
        keys: [{ slot: 1, masked: activeKey ? maskKey(activeKey) : '', active: !!activeKey }],
        primary_key: activeKey ? maskKey(activeKey) : '',
        has_primary: !!activeKey,
        fallback_key: '',
        has_fallback: false,
        owner_name: data.owner_name ?? '',
        features,
        daily_limit: 0,
        source: keySource,
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

      const { keys, primaryKey, openRouterKey, openRouterModel, features, ownerName } = req.body;
      const upsertData: any = { user_id: userId, updated_at: new Date() };

      const keyCandidate = openRouterKey ?? primaryKey ?? (Array.isArray(keys) ? keys[0] : undefined);
      if (keyCandidate !== undefined) {
        const keyValue = String(keyCandidate ?? '').trim();
        if (keyValue && !isOpenRouterKey(keyValue)) return res.status(400).json({ error: 'La key no parece ser de OpenRouter' });
        upsertData.primary_key_encrypted = keyValue || null;
        upsertData.fallback_key_encrypted = null;
        upsertData.fallback2_key_encrypted = null;
        upsertData.key3_encrypted = null;
        upsertData.key4_encrypted = null;
        upsertData.key5_encrypted = null;
      }
      if (features || openRouterModel) {
        const normalized = normalizeAiFeatures(features);
        if (openRouterModel) {
          const model = normalizeOpenRouterModel(openRouterModel);
          for (const key of Object.keys(normalized)) normalized[key].model = model;
        }
        upsertData.features = normalized;
      }
      if (ownerName !== undefined) upsertData.owner_name = ownerName || null;

      let result = await supabase.from('ai_config').upsert(upsertData, { onConflict: 'user_id' }).select().single();
      if (result.error && /row-level security/i.test(result.error.message) && adminSupabase) {
        result = await adminSupabase.from('ai_config').upsert(upsertData, { onConflict: 'user_id' }).select().single();
      }
      if (result.error) throw result.error;
      const data = result.data;
      res.json({ ok: true, data });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // POST /api/ai/test-key  (testear que una key de OpenRouter es valida)
  router.post('/test-key', async (req: Request, res: Response) => {
    try {
      const { apiKey, model: rawModel } = req.body;
      if (!apiKey) return res.status(400).json({ error: 'apiKey requerida' });
      if (!isOpenRouterKey(apiKey)) return res.status(400).json({ error: 'La key no parece ser de OpenRouter' });

      const start = Date.now();
      const model = normalizeOpenRouterModel(rawModel);
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${String(apiKey).trim()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'https://ventas-live.vercel.app',
          'X-Title': 'Ventas Live',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Responde solo: OK' }],
          max_tokens: 5,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const latency = Date.now() - start;

      if (resp.ok) {
        res.json({ ok: true, latency, message: `Key OpenRouter valida (${latency}ms)` });
      } else {
        const errText = await resp.text().catch(() => '');
        res.json({ ok: false, latency, message: extractProviderError(errText) || `HTTP ${resp.status}` });
      }
    } catch (err: any) {
      res.json({ ok: false, message: err?.message ?? 'Error de conexion' });
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
        .select('feature, model, success, latency_ms, created_at, error_message, input_tokens, output_tokens')
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
      const { clienteId, startAt, endAt } = req.body;
      if (!clienteId) return res.status(400).json({ error: 'clienteId requerido' });

      const rangeStart = startAt ? new Date(startAt) : null;
      const rangeEnd = endAt ? new Date(endAt) : null;
      const hasLiveRange = Boolean(
        rangeStart &&
        rangeEnd &&
        Number.isFinite(rangeStart.getTime()) &&
        Number.isFinite(rangeEnd.getTime()) &&
        rangeEnd > rangeStart
      );
      if ((startAt || endAt) && !hasLiveRange) {
        return res.status(400).json({ error: 'Rango de Live invalido' });
      }

      const panelDb = supabasePanel ?? supabase;

      // Obtener teléfono del cliente para vincular con el Sistema Pulpo
      const { data: clienteData } = await panelDb
        .from('panel_clientes')
        .select('phone')
        .eq('id', clienteId)
        .single();
      const panelPhone: string | null = clienteData?.phone ?? null;

      // Leer mensajes de la tabla del panel de WhatsApp
      let mensajesQuery = panelDb
        .from('panel_mensajes')
        .select('id, content, media_url, media_type, has_media, direction, created_at')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: true });
      if (hasLiveRange) {
        mensajesQuery = mensajesQuery
          .gte('created_at', rangeStart!.toISOString())
          .lte('created_at', rangeEnd!.toISOString());
      }
      const { data: mensajes, error: dbErr } = await mensajesQuery;

      if (dbErr) return res.status(500).json({ error: dbErr.message });
      if (!mensajes?.length) return res.status(404).json({ error: hasLiveRange ? 'Sin mensajes en esta sesion Live' : 'Sin mensajes' });

      function phoneDigits(value: unknown) {
        return String(value ?? '').replace(/\D/g, '');
      }

      function phoneVariants(value: unknown) {
        const digits = phoneDigits(value);
        const variants = new Set<string>();
        if (!digits) return [];
        variants.add(digits);
        variants.add(`+${digits}`);
        if (digits.startsWith('591')) variants.add(digits.slice(3));
        else variants.add(`591${digits}`);
        return [...variants].filter(Boolean);
      }

      function extractStoreRefs(text: unknown) {
        const value = String(text ?? '');
        return [...value.matchAll(/#(\d{1,8})/g)].map(match => Number(match[1])).filter(Number.isFinite);
      }

      function extractPanelMessageIds(text: unknown) {
        const value = String(text ?? '');
        return [...value.matchAll(/panel_message_id=([^\s]+)/g)].map(match => match[1]).filter(Boolean);
      }

      function extractMediaUrls(text: unknown) {
        const value = String(text ?? '');
        return [...value.matchAll(/media=(https?:\/\/[^\s]+)/g)].map(match => match[1]).filter(Boolean);
      }

      function isValidStoreProofSummary(text: unknown) {
        const value = String(text ?? '');
        if (!value.includes('media=')) return false;
        if (/proof_amount_mismatch=/i.test(value)) return false;

        const receiptMatch = value.match(/receipt=(\{[^\n]+\})/);
        if (!receiptMatch) return false;

        try {
          const receipt = JSON.parse(receiptMatch[1]);
          const amount = Number(String(receipt?.monto ?? '').replace(',', '.'));
          const name = String(receipt?.cliente ?? '').trim().toLowerCase();
          return Number.isFinite(amount) && amount > 0 && name !== '' && name !== 'null';
        } catch {
          return false;
        }
      }

      let mensajesLive = mensajes;
      if (storeSupabase) {
        try {
          const refs = [...new Set(mensajes.flatMap((m: any) => extractStoreRefs(m.content)))];
          const validStoreRefs = new Set<number>();
          if (refs.length > 0) {
            const { data: storeOrders } = await storeSupabase
              .from('store_orders')
              .select('id')
              .in('id', refs);
            for (const order of storeOrders ?? []) validStoreRefs.add(Number(order.id));
          }

          const phones = phoneVariants(panelPhone);
          const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const storePanelMessageIds = new Set<string>();
          const storeMediaUrls = new Set<string>();

          if (phones.length > 0) {
            const { data: storeWaMessages } = await storeSupabase
              .from('wa_messages')
              .select('summary,matched_order_id,order_ref')
              .in('from_wa', phones)
              .limit(200);
            for (const event of storeWaMessages ?? []) {
              const orderRef = Number((event as any).order_ref);
              const belongsToStoreOrder = Boolean((event as any).matched_order_id) ||
                (Number.isFinite(orderRef) && validStoreRefs.has(orderRef));
              if (!belongsToStoreOrder) continue;

              const hasMedia = String(event.summary ?? '').includes('media=');
              const validStoreProof = isValidStoreProofSummary(event.summary);
              if (!hasMedia || validStoreProof) {
                for (const id of extractPanelMessageIds(event.summary)) storePanelMessageIds.add(id);
              }
              if (validStoreProof) {
                for (const url of extractMediaUrls(event.summary)) storeMediaUrls.add(url);
              }
            }

            const { data: storePaymentEvents } = await storeSupabase
              .from('payment_events')
              .select('raw_text, created_at,matched_order_id')
              .in('sender_wa', phones)
              .gte('created_at', since)
              .limit(200);
            for (const event of storePaymentEvents ?? []) {
              if (!(event as any).matched_order_id) continue;

              const hasMedia = String(event.raw_text ?? '').includes('media=');
              const validStoreProof = isValidStoreProofSummary(event.raw_text);
              if (!hasMedia || validStoreProof) {
                for (const id of extractPanelMessageIds(event.raw_text)) storePanelMessageIds.add(id);
              }
              if (validStoreProof) {
                for (const url of extractMediaUrls(event.raw_text)) storeMediaUrls.add(url);
              }
            }
          }

          mensajesLive = mensajes.filter((m: any) => {
            const id = String(m.id ?? '');
            const contentRefs = extractStoreRefs(m.content);
            if (contentRefs.some(ref => validStoreRefs.has(ref))) return false;
            if (id && storePanelMessageIds.has(id)) return false;
            if (m.media_url && storeMediaUrls.has(m.media_url)) return false;
            return true;
          });

          if (mensajesLive.length !== mensajes.length) {
            console.log(`[summarize] ${mensajes.length - mensajesLive.length} mensaje(s) de tienda ignorados para Live`);
          }
        } catch (filterError: any) {
          console.warn('[summarize] filtro tienda/live no aplicado:', filterError?.message ?? filterError);
        }
      }

      if (!mensajesLive.length) {
        await panelDb.from('panel_clientes').update({ resumen_at: new Date().toISOString() }).eq('id', clienteId);
        return res.json({ ok: true, skipped: true, reason: 'solo_mensajes_tienda' });
      }

      const textos: string[]    = [];
      const fotoItems: Array<{ id: string | null; url: string; mediaType: string | null; direction: string | null; createdAt: string | null; content: string | null }> = [];
      const audioUrls: string[] = [];
      const aiErrors = new Set<string>();

      async function safeCallAi(params: Parameters<typeof callAi>[0], label: string) {
        try {
          return await callAi(params);
        } catch (err: any) {
          const message = String(err?.message ?? err ?? 'Error desconocido');
          aiErrors.add(`${label}: ${message}`);
          console.warn(`[summarize] ${label}: ${message}`);
          return null;
        }
      }

      for (const m of mensajesLive) {
        if (m.content?.trim()) textos.push(m.content.trim());
        if (m.media_url) {
          const mt: string = m.media_type || '';
          const isImage = mt.startsWith('image/') || /\.(jpg|jpeg|png|webp)/i.test(m.media_url);
          const isAudio = mt.startsWith('audio/') || mt.startsWith('video/') || /\.(ogg|mp3|mp4|m4a)/i.test(m.media_url);
          if (isImage) fotoItems.push({
            id: (m as any).id ?? null,
            url: m.media_url,
            mediaType: mt || null,
            direction: m.direction ?? null,
            createdAt: m.created_at ?? null,
            content: m.content ?? null,
          });
          else if (isAudio) audioUrls.push(m.media_url);
        }
      }
      const fotoUrls = fotoItems.map((item) => item.url);
      const allFotoItems = (mensajes ?? [])
        .filter((m: any) => m.media_url)
        .filter((m: any) => {
          const mt: string = m.media_type || '';
          return mt.startsWith('image/') || /\.(jpg|jpeg|png|webp)/i.test(m.media_url);
        })
        .map((m: any) => ({
          id: m.id ?? null,
          url: m.media_url,
          mediaType: m.media_type || null,
          direction: m.direction ?? null,
          createdAt: m.created_at ?? null,
          content: m.content ?? null,
        }));
      const fotoUrlsRecientes = [...fotoItems]
        .sort((a, b) => {
          const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
          const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
          return tb - ta;
        })
        .map((item) => item.url);

      // Helper: descargar URL → base64
      async function fetchBase64(url: string): Promise<{ b64: string; mime: string } | null> {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!r.ok) return null;
          const buf = await r.arrayBuffer();
          return { b64: Buffer.from(buf).toString('base64'), mime: r.headers.get('content-type') || 'application/octet-stream' };
        } catch { return null; }
      }

      function normalizeTrafficDirection(direction: string | null | undefined): 'incoming' | 'outgoing' | 'unknown' {
        const value = String(direction ?? '').trim().toLowerCase();
        if (!value) return 'unknown';
        if (['out', 'outgoing', 'sent', 'saliente', 'company', 'empresa'].includes(value)) return 'outgoing';
        if (['in', 'incoming', 'received', 'entrante', 'entrada', 'customer', 'cliente'].includes(value)) return 'incoming';
        if (value.startsWith('out')) return 'outgoing';
        if (value.startsWith('in')) return 'incoming';
        return 'unknown';
      }

      function isOutgoingDirection(direction: string | null | undefined): boolean {
        return normalizeTrafficDirection(direction) === 'outgoing';
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
        const result = await safeCallAi({
          userId, feature: 'chat_summary',
          prompt: 'Transcribe exactamente lo que dice este audio en español. Solo el texto, sin explicaciones.',
          imageParts: [{ inlineData: { mimeType: mime, data: media.b64 } }],
          maxTokens: 300, temperature: 0,
        }, 'transcripcion de audio');
        if (result?.text) transcripciones.push(result.text.trim());
      }

      // Clasificar fotos y detectar comprobante.
      // El comprobante puede llegar en CUALQUIER posición: antes, en el medio, o después de las prendas.
      // Procesamos las primeras 3 fotos para las descripciones del resumen,
      // y ADEMÁS revisamos todas las fotos restantes buscando el comprobante.
      const descripciones: string[] = [];
      let comprobanteExtraido: { cliente: string | null; monto: string | null; hora: string | null } | null = null;
      let comprobanteDetectado = false;
      let comprobanteMediaUrl: string | null = null;
      let comprobanteTexto: string | null = null;
      const comprobantesDetectados: Array<{
        item: { id: string | null; url: string; mediaType: string | null; direction: string | null; createdAt: string | null; content: string | null };
        texto: string;
        extraido: { cliente: string | null; monto: string | null; hora: string | null } | null;
      }> = [];
      const prendasDetectadas: Array<{
        item: { id: string | null; url: string; mediaType: string | null; direction: string | null; createdAt: string | null; content: string | null };
        descripcion: string;
      }> = [];
      const analisisFotos = new Map<string, {
        tipo: 'comprobante' | 'prenda' | 'otro' | 'sin_datos';
        desc: string;
        extraido: { cliente: string | null; monto: string | null; hora: string | null } | null;
      }>();

      const CLASIFICADOR_PROMPT = `Analiza esta imagen y responde con UNA SOLA línea:
- Si es un COMPROBANTE de pago, transferencia o captura de QR bancario: escribe "COMPROBANTE: [nombre del pagador] - [monto] Bs - [banco o app]".
- Si es una PRENDA de ropa: escribe "PRENDA: [color, tipo, características]". Máximo 15 palabras.
- Si es otra cosa: escribe "OTRO: [descripción breve]".
Responde SOLO con una línea, sin explicaciones.`;

      const receiptHintRegex = /\b(comprobante|pago|pagado|transferencia|qr|banco|importe|remitente|operaci[oó]n|transacci[oó]n|autorizaci[oó]n|bs\.?|bob)\b/i;

      async function extraerComprobanteDesdeImagen(
        imagePart: { inlineData: { mimeType: string; data: string } },
        label: string,
      ) {
        const extractResult = await safeCallAi({
          userId, feature: 'chat_summary',
          prompt: comprobantePrompt,
          imageParts: [imagePart], maxTokens: 250, temperature: 0, jsonMode: true,
        }, label);
        if (!extractResult?.text) return null;
        const match = extractResult.text.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
          return normalizeComprobanteResponse(JSON.parse(match[0]));
        } catch {
          return null;
        }
      }

      function registrarComprobanteDetectado(
        item: { id: string | null; url: string; mediaType: string | null; direction: string | null; createdAt: string | null; content: string | null },
        texto: string,
        extraido: { cliente: string | null; monto: string | null; hora: string | null } | null,
      ) {
        comprobanteDetectado = true;
        comprobanteMediaUrl = comprobanteMediaUrl ?? item.url;
        comprobanteTexto = comprobanteTexto ?? texto;
        if (extraido && !comprobanteExtraido) {
          comprobanteExtraido = extraido;
          const datos = [
            extraido.cliente,
            extraido.monto ? `${extraido.monto} Bs` : null,
            extraido.hora,
          ].filter(Boolean).join(' - ');
          comprobanteTexto = datos || comprobanteTexto;
        }
        const alreadyAdded = comprobantesDetectados.some(existing =>
          (item.id && existing.item.id === item.id) || existing.item.url === item.url
        );
        if (!alreadyAdded) comprobantesDetectados.push({ item, texto, extraido });
      }

      async function clasificarYExtraer(
        item: { id: string | null; url: string; mediaType: string | null; direction: string | null; createdAt: string | null; content: string | null },
        options: { addDescription?: boolean } = {},
      ): Promise<'comprobante' | 'prenda' | 'otro' | 'sin_datos'> {
        const cacheKey = item.id ?? item.url;
        const cached = analisisFotos.get(cacheKey);
        if (cached) {
          if (cached.desc && options.addDescription !== false) descripciones.push(cached.desc);
          return cached.tipo;
        }

        const media = await fetchBase64(item.url);
        if (!media) return 'sin_datos';
        const mime = media.mime || item.mediaType || (item.url.endsWith('.png') ? 'image/png' : item.url.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
        const imagePart = { inlineData: { mimeType: mime, data: media.b64 } };
        const outgoing = isOutgoingDirection(item.direction);
        const classificationPrompt = `${CLASIFICADOR_PROMPT}\n\nCONTEXTO DEL REMITENTE:\n${outgoing
          ? '- La imagen la envió la EMPRESA al cliente. Nunca puede ser un comprobante de pago. Si parece ropa, catálogo o anuncio, clasifícala como PRENDA o OTRO.'
          : '- La imagen la envió el CLIENTE o no está claro quién la envió.'}`;

        const classResult = await safeCallAi({
          userId, feature: 'chat_summary',
          prompt: classificationPrompt,
          imageParts: [imagePart], maxTokens: 200, temperature: 0,
        }, 'clasificacion de imagen');
        const desc = classResult?.text?.trim() ?? '';
        if (desc && options.addDescription !== false) descripciones.push(desc);
        const upperDesc = desc.toUpperCase();
        const esComprobante = !outgoing && upperDesc.startsWith('COMPROBANTE');
        const esPrenda = upperDesc.startsWith('PRENDA');

        let extraido: { cliente: string | null; monto: string | null; hora: string | null } | null = null;
        if (esComprobante) {
          extraido = await extraerComprobanteDesdeImagen(imagePart, 'extraccion de comprobante');
          registrarComprobanteDetectado(item, desc, extraido);
        } else if (esPrenda) {
          prendasDetectadas.push({ item, descripcion: desc.replace(/^PRENDA:\s*/i, '').trim() || desc });
        } else {
          if (!outgoing) {
            const fallbackExtraido = await extraerComprobanteDesdeImagen(imagePart, 'extraccion de comprobante fallback live');
            if (fallbackExtraido?.cliente || fallbackExtraido?.monto || receiptHintRegex.test(desc)) {
              extraido = fallbackExtraido;
              registrarComprobanteDetectado(item, desc || 'COMPROBANTE: posible comprobante de pago', extraido);
            }
          }
        }

        const tipo = comprobantesDetectados.some(existing =>
          (item.id && existing.item.id === item.id) || existing.item.url === item.url
        ) ? 'comprobante' : esPrenda ? 'prenda' : 'otro';
        analisisFotos.set(cacheKey, { tipo, desc, extraido });
        return tipo;
      }

      function ensureAllLiveImagesAreVisibleAsCandidates() {
        const knownIds = new Set(prendasDetectadas.map(p => p.item.id ?? p.item.url));
        for (const item of fotoItems) {
          const key = item.id ?? item.url;
          if (knownIds.has(key)) continue;
          const cached = analisisFotos.get(key);
          if (cached?.tipo === 'comprobante') continue;
          prendasDetectadas.push({
            item,
            descripcion: cached?.desc?.replace(/^PRENDA:\s*/i, '').trim() || 'Imagen de prenda enviada durante el Live.',
          });
          knownIds.add(key);
        }
      }

      // Comprobante: revisar primero las fotos recientes para no reutilizar comprobantes viejos.
      const fotoItemsRecientes = [...fotoItems].sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      });

      // Cuando el frontend pasa rango Live (hasLiveRange), analizamos TODAS las fotos del rango
      // para no perder comprobantes en ninguna posición. En modo legacy (sin rango), conservamos
      // el límite de 8 para no disparar costos en chats viejos sin tope claro.
      const LIMITE_FOTOS_LEGACY = 8;
      const LIMITE_FOTOS_SEGURIDAD = 40; // tope duro contra runs descontrolados
      const itemsAClasificar = hasLiveRange
        ? fotoItemsRecientes.slice(0, LIMITE_FOTOS_SEGURIDAD)
        : fotoItemsRecientes.slice(0, LIMITE_FOTOS_LEGACY);

      for (const item of itemsAClasificar) {
        await clasificarYExtraer(item, { addDescription: false });
      }

      // Segunda pasada: foto entrante clasificada como "otro" + contexto de pago en el chat
      // → intentar leerla como comprobante. Cubre casos donde Gemini duda en la clasificación.
      if (hasLiveRange) {
        for (const item of itemsAClasificar) {
          if (isOutgoingDirection(item.direction)) continue;
          const cached = analisisFotos.get(item.id ?? item.url);
          if (cached?.tipo !== 'otro') continue;
          const media = await fetchBase64(item.url);
          if (!media) continue;
          const imagePart = { inlineData: { mimeType: media.mime, data: media.b64 } };
          const extraido = await extraerComprobanteDesdeImagen(imagePart, 'reintento comprobante sobre otro');
          if (extraido?.monto || extraido?.cliente) {
            registrarComprobanteDetectado(item, cached.desc || 'COMPROBANTE: detectado en reintento', extraido);
            analisisFotos.set(item.id ?? item.url, { tipo: 'comprobante', desc: cached.desc, extraido });
          }
        }
      }

      ensureAllLiveImagesAreVisibleAsCandidates();

      const textoConversacion = textos.join('\n');
      const textoConversacionEntrante = mensajesLive
        .filter((m: any) => !isOutgoingDirection(m.direction))
        .map((m: any) => m.content?.trim() ?? '')
        .filter(Boolean)
        .join('\n');
      const hayContextoPago = /\b(pagu[eé]|pago|pagado|comprobante|transferencia|deposit[eé]|qr|envi[oó]\s+el\s+pago|le\s+env[ií]o\s+el\s+pago)\b/i.test(textoConversacionEntrante);
      if (hayContextoPago && comprobantesDetectados.length === 0 && (fotoItemsRecientes.length > 0 || allFotoItems.length > 0)) {
        const fallbackCandidates = [...fotoItemsRecientes, ...allFotoItems]
          .filter((item, index, list) => list.findIndex(other => other.url === item.url) === index)
          .filter((item) => !isOutgoingDirection(item.direction))
          .sort((a, b) => {
            const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
            const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
            return tb - ta;
          });
        const fallbackItem = fallbackCandidates.find(item => {
          const cached = analisisFotos.get(item.id ?? item.url);
          return cached?.tipo !== 'prenda';
        }) ?? fallbackCandidates[0];
        registrarComprobanteDetectado(
          fallbackItem,
          'COMPROBANTE: imagen pendiente de revision manual',
          null,
        );
      }

      // Generar resumen final del pedido
      const comprobanteDesc = comprobanteExtraido?.cliente
        ? `${comprobanteExtraido.cliente}${comprobanteExtraido.monto ? ' - ' + comprobanteExtraido.monto + ' Bs' : ''}${comprobanteExtraido.hora ? ' - ' + comprobanteExtraido.hora : ''}`
        : null;

      const promptFinal = `Eres un asistente que resume conversaciones de WhatsApp para ventas live de ropa en Bolivia.

MENSAJES DE TEXTO:
${textos.join('\n') || '(ninguno)'}

CLASIFICACION INTERNA DE FOTOS:
${descripciones.map((d, i) => `Foto ${i+1}: ${d}`).join('\n') || '(ninguna)'}

TRANSCRIPCIÓN DE AUDIOS:
${transcripciones.map((t, i) => `Audio ${i+1}: "${t}"`).join('\n') || '(ninguno)'}

Reglas:
- No describas colores, tallas, modelos ni caracteristicas de prendas.
- Resume solo el avance de la conversacion: si eligio prendas, cuantas fotos/prendas parecen relevantes, cuantos comprobantes/pagos hay, si falta verificar algo.
- Si no puedes contar prendas con seguridad, escribe "no especificado".
- En "pedido" escribe una frase corta operativa, no una lista de prendas.
- En "pago" resume cantidad/montos de pagos o comprobantes detectados.

Genera este JSON exacto (sin backticks, sin texto antes o despues):
{"pedido":"resumen operativo de la conversacion","cantidad":"cantidad de prendas elegidas o no especificado","talla":"no especificada","pago":"cantidad y monto de pagos/comprobantes o no especificado","entrega":"cuando o donde o no especificado","comprobante":${comprobanteDesc ? JSON.stringify(comprobanteDesc) : '"Si hay un comprobante de pago en las fotos, escribe: nombre del pagador - monto Bs - banco. Si no hay comprobante, escribe null"'},"notas":"pendientes de verificacion u observaciones o null"}`;

      const finalResult = await safeCallAi({
        userId, feature: 'chat_summary',
        prompt: promptFinal,
        maxTokens: 400, temperature: 0, jsonMode: true,
      }, 'resumen final');

      let resumen: Record<string, any> = {
        pedido: textos.length > 0 ? textos.slice(-3).join(' ') : 'Conversacion recibida',
        cantidad: fotoItems.length > 0 ? String(fotoItems.length) : 'no especificado',
        talla: 'no especificada',
        pago: comprobantesDetectados.length > 0 ? `${comprobantesDetectados.length} comprobante(s)` : 'no especificado',
        entrega: 'no especificado',
        comprobante: comprobanteDesc,
        notas: null,
      };
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

      const photoSelectionConfig = await getAiFeatureConfig(userId, 'photo_selection');
      const selectedPrendaMessageIds = new Set<string>();
      let contextoVisual: string | null = null;
      let timelineSteps: string[] = [];
      if (photoSelectionConfig.enabled && prendasDetectadas.length > 0) {
        const candidates = prendasDetectadas.map((p, i) => ({
          n: i + 1,
          id: p.item.id,
          descripcion: p.descripcion,
          fecha: p.item.createdAt,
          texto: p.item.content,
        }));
        const selectionPrompt = `Eres asistente de preparacion de pedidos de ropa vendidos por WhatsApp/TikTok Live.

Debes decidir cuales fotos de prendas fueron REALMENTE elegidas o compradas por la clienta, usando toda la conversacion.

MENSAJES:
${textos.join('\n') || '(sin textos)'}

TRANSCRIPCIONES DE AUDIO:
${transcripciones.map((t, i) => `Audio ${i + 1}: ${t}`).join('\n') || '(sin audios)'}

FOTOS CANDIDATAS DE PRENDA:
${candidates.map(c => `${c.n}. ${c.descripcion}${c.texto ? ` | texto foto: ${c.texto}` : ''}`).join('\n')}

Reglas:
- Selecciona solo prendas que la clienta confirmo, eligio, pidio reservar o pago.
- Si una prenda fue preguntada pero luego descartada, no la selecciones.
- Si hay duda razonable, no la selecciones.
- No inventes datos.

Responde SOLO este JSON:
{"selected_numbers":[1,2],"timeline_steps":["1. ...","2. ...","3. ...","4. ..."],"contexto_visual":"explicacion corta para la operadora"}

Reglas de timeline_steps:
- Maximo 4 pasos, minimo 2 si hay informacion.
- Estilo operativo y breve.
- Enfocado en el flujo de decision (consulta/cambio/cierre), no en descripcion de prendas.
- No mencionar "operadora envio comprobante" ni frases obvias repetitivas.
- Si no hay cambio relevante, igual incluir cierre final de decision.`;

        const selectionResult = await safeCallAi({
          userId,
          feature: 'photo_selection',
          prompt: selectionPrompt,
          maxTokens: 500,
          temperature: 0,
          jsonMode: true,
        }, 'seleccion de prendas');

        if (selectionResult?.text) {
          const match = selectionResult.text.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              const parsed = JSON.parse(match[0]);
              const nums = Array.isArray(parsed.selected_numbers) ? parsed.selected_numbers : [];
              for (const value of nums) {
                const idx = Number(value) - 1;
                const itemId = prendasDetectadas[idx]?.item.id;
                if (itemId) selectedPrendaMessageIds.add(itemId);
              }
              if (Array.isArray(parsed.timeline_steps)) {
                timelineSteps = parsed.timeline_steps
                  .map((step: unknown) => String(step ?? '').trim())
                  .filter(Boolean)
                  .slice(0, 4);
              }
              if (typeof parsed.contexto_visual === 'string' && parsed.contexto_visual.trim()) {
                contextoVisual = parsed.contexto_visual.trim();
              }
            } catch { /* mantener seleccion vacia si falla el JSON */ }
          }
        }

        const prendasSeleccionadas = prendasDetectadas
          .filter(p => p.item.id && selectedPrendaMessageIds.has(p.item.id))
          .map(p => ({ id: p.item.id, url: p.item.url, descripcion: p.descripcion }));
        const prendasNoSeleccionadas = prendasDetectadas
          .filter(p => !p.item.id || !selectedPrendaMessageIds.has(p.item.id))
          .map(p => ({ id: p.item.id, url: p.item.url, descripcion: p.descripcion }));

        if (timelineSteps.length === 0) {
          timelineSteps = [
            'La clienta consultó prendas durante el live.',
            prendasNoSeleccionadas.length > 0 ? 'Comparó opciones y descartó algunas prendas.' : null,
            prendasSeleccionadas.length > 0
              ? `Confirmó ${prendasSeleccionadas.length} prenda(s) como decisión final.`
              : 'No confirmó prendas finales con suficiente claridad.',
            'Cierre de conversación registrado para preparación del pedido.',
          ].filter(Boolean) as string[];
        }
        timelineSteps = timelineSteps.slice(0, 4).map((step, idx) => {
          const clean = step.replace(/^\d+\s*[\).:-]?\s*/, '').trim();
          return `${idx + 1}. ${clean}`;
        });

        resumen.prendas_seleccionadas = prendasSeleccionadas;
        resumen.prendas_no_seleccionadas = prendasNoSeleccionadas;
        resumen.timeline_steps = timelineSteps;
        resumen.contexto_visual = contextoVisual ?? 'La IA no tuvo suficiente seguridad para seleccionar prendas automaticamente.';
      }

      // ── Procesar comprobante extraído ────────────────────────────────────────
      let estadoPago: 'pagado_verificado' | 'solo_comprobante' | null = null;
      let pagoAlerta: { nombre: string; monto: string | null; hora: string | null } | null = null;
      let tarjetaVenta: Record<string, unknown> | null = null;
      let pedidosVentaLive: any[] = [];
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
            const { data: linkedCustomerId } = await supabase.rpc('fn_link_customer_wa', {
              p_canonical_name: nameNorm,
              p_wa_number: waPhone,
              p_user_id: userId,
            });
            let customerId = linkedCustomerId;

            if (!customerId) {
              const { data: possibleCustomers } = await supabase
                .from('customers')
                .select('id, full_name, canonical_name, normalized_name, phone, wa_number')
                .eq('user_id', userId)
                .eq('is_active', true)
                .limit(300);

              const nameMatch = possibleCustomers?.filter((c: any) =>
                isStrongNameMatch(c.canonical_name || c.full_name || c.normalized_name, nameNorm)
              ) ?? [];

              if (nameMatch.length === 1) {
                customerId = nameMatch[0].id;
                await supabase.from('customers').update({
                  wa_number: waPhone,
                  phone: nameMatch[0].phone || waPhone,
                  wa_linked_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }).eq('id', customerId).eq('user_id', userId);
                console.log(`[summarize] Cliente existente vinculado por nombre flexible: "${nombreCliente}" id=${customerId}`);
              }
            }

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
          const { data: pagosCandidates } = await supabase
            .from('pagos')
            .select('id, nombre, pago, date')
            .eq('user_id', userId)
            .eq('method', 'Notificación bancaria')
            .gte('date', since24h)
            .gte('pago', montoNum * 0.97)
            .lte('pago', montoNum * 1.03);

          const pagosMatch = (pagosCandidates ?? []).filter((p: any) =>
            isContextualNameMatch(p.nombre, nombreCliente)
          );

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
              return pNorm.length > 0 && isStrongNameMatch(pNorm, nameNorm);
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

      if (panelPhone && comprobantesDetectados.length > 0) {
        try {
          const phone = normalizePanelPhoneForLiveSales(panelPhone);
          if (!phone) throw new Error('Telefono invalido para venta live');

          const touchedOrderIds = new Set<string>();

          for (const comprobante of comprobantesDetectados) {
            const fallback = parseReceiptTextFallback(comprobante.texto);
            const nombreDetectado = comprobante.extraido?.cliente ?? fallback.nombre;
            const montoDetectado = parseLiveMonto(comprobante.extraido?.monto) ?? fallback.monto;
            const comprobanteAt = receiptAtFromMessage(comprobante.item.createdAt, comprobante.extraido?.hora);
            const fechaPedido = hasLiveRange ? boliviaDateKey(rangeStart!.toISOString()) : boliviaDateKey(comprobanteAt);
            const comprobanteTextoFinal = [
              nombreDetectado,
              montoDetectado ? `Bs ${montoDetectado}` : null,
              comprobante.extraido?.hora,
            ].filter(Boolean).join(' - ') || comprobante.texto;

            const order = await ensurePanelLiveOrder(panelDb, {
              clienteId,
              phone,
              fechaPedido,
              nombreDetectado,
              isTest: false,
            });
            touchedOrderIds.add(order.id);

            await upsertLiveEvidence(panelDb, {
              pedidoLiveId: order.id,
              clienteId,
              panelMensajeId: comprobante.item.id,
              tipo: 'comprobante',
              mediaUrl: comprobante.item.url,
              mediaType: comprobante.item.mediaType,
              content: comprobante.item.content,
              descripcion: comprobanteTextoFinal,
              messageCreatedAt: comprobante.item.createdAt,
              metadata: {
                extracted: comprobante.extraido,
                classifier_text: comprobante.texto,
                live_range: hasLiveRange ? {
                  start_at: rangeStart!.toISOString(),
                  end_at: rangeEnd!.toISOString(),
                } : null,
              },
            });

            for (const prenda of prendasDetectadas) {
              if (hasLiveRange) {
                const prendaTime = prenda.item.createdAt ? new Date(prenda.item.createdAt).getTime() : NaN;
                if (!Number.isFinite(prendaTime) || prendaTime < rangeStart!.getTime() || prendaTime > rangeEnd!.getTime()) continue;
              } else if (boliviaDateKey(prenda.item.createdAt ?? comprobanteAt) !== fechaPedido) {
                continue;
              }
              const selectedByAi = !!prenda.item.id && selectedPrendaMessageIds.has(prenda.item.id);
              await upsertLiveEvidence(panelDb, {
                pedidoLiveId: order.id,
                clienteId,
                panelMensajeId: prenda.item.id,
                tipo: 'prenda',
                mediaUrl: prenda.item.url,
                mediaType: prenda.item.mediaType,
                content: prenda.item.content,
                descripcion: prenda.descripcion,
                messageCreatedAt: prenda.item.createdAt,
                metadata: {
                  source: 'ai_classifier',
                  selected_by_ai: selectedByAi,
                  selected_final: selectedByAi,
                  selection_source: selectedByAi ? 'ai' : 'ai_unselected',
                  contexto_visual: contextoVisual,
                  live_range: hasLiveRange ? {
                    start_at: rangeStart!.toISOString(),
                    end_at: rangeEnd!.toISOString(),
                  } : null,
                },
              });
            }

            let pagoLive = await upsertWhatsappLivePayment(panelDb, {
              pedidoLiveId: order.id,
              clienteId,
              phone,
              fechaPedido,
              nombreDetectado,
              monto: montoDetectado,
              comprobanteHora: comprobante.extraido?.hora,
              comprobanteAt,
              comprobanteTexto: comprobanteTextoFinal,
              comprobanteMediaUrl: comprobante.item.url,
              panelMensajeId: comprobante.item.id,
              isTest: false,
            });

            let updatedOrder = await recomputeLiveOrderTotals(panelDb, order.id);
            updatedOrder = await syncMainPedidoForLiveOrder(panelDb, supabase, userId, updatedOrder);
            pagoLive = await matchLivePaymentWithMacrodroid(panelDb, supabase, {
              userId,
              pagoLive,
              mainCustomerId: updatedOrder.main_customer_id,
              windowMinutes: 5,
            });

            if (pagoLive?.estado === 'verificado_macrodroid') {
              estadoPago = 'pagado_verificado';
            } else if (!estadoPago) {
              estadoPago = 'solo_comprobante';
            }
            if (pagoLive?.estado !== 'verificado_macrodroid' && nombreDetectado) {
              pagoAlerta = {
                nombre: nombreDetectado,
                monto: montoDetectado != null ? String(montoDetectado) : null,
                hora: comprobante.extraido?.hora ?? null,
              };
            }
            updatedOrder = await recomputeLiveOrderTotals(panelDb, order.id);
            updatedOrder = await syncMainPedidoForLiveOrder(panelDb, supabase, userId, updatedOrder);
          }

          if (touchedOrderIds.size > 0) {
            const { data: orders } = await panelDb
              .from('pedidos_venta_live')
              .select('*')
              .in('id', [...touchedOrderIds])
              .order('fecha_pedido', { ascending: false });
            pedidosVentaLive = orders ?? [];
          }
        } catch (e: any) {
          console.warn('[summarize] pedidos venta live no guardados:', e?.message);
        }
      }

      if (comprobanteDetectado && panelPhone) {
        try {
          const phone = normalizePanelPhoneForLiveSales(panelPhone);
          const resumenComprobante = typeof resumen.comprobante === 'string' && resumen.comprobante !== 'null'
            ? resumen.comprobante
            : null;
          const comprobanteTextoFinal = comprobanteDesc ?? resumenComprobante ?? comprobanteTexto;
          const fallbackComprobante = parseReceiptTextFallback(comprobanteTextoFinal);
          const nombreDetectado = comprobanteExtraido?.cliente ?? fallbackComprobante.nombre;
          const montoDetectado = parseComprobanteMonto(comprobanteExtraido?.monto) ?? fallbackComprobante.monto;
          const estadoPanel = estadoPago ?? 'solo_comprobante';
          const cardEstado = nombreDetectado && montoDetectado && estadoPago === 'pagado_verificado'
            ? 'comprobante_recibido'
            : 'revision_manual';

          await panelDb.from('panel_clientes').update({
            ...(nombreDetectado ? { nombre: nombreDetectado } : {}),
            estado: estadoPanel,
          }).eq('id', clienteId);

          const payload = {
            cliente_id: clienteId,
            phone,
            nombre_detectado: nombreDetectado,
            monto_detectado: montoDetectado,
            resumen,
            comprobante_texto: comprobanteTextoFinal,
            comprobante_media_url: comprobanteMediaUrl ?? fotoUrls[fotoUrls.length - 1] ?? null,
            estado: cardEstado,
            is_test: false,
          };

          const { data: existing, error: existingError } = await panelDb
            .from('tarjetas_venta_live')
            .select('*')
            .eq('phone', phone)
            .neq('estado', 'archivado')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingError) throw existingError;

          if (existing) {
            const { data, error } = await panelDb
              .from('tarjetas_venta_live')
              .update(payload)
              .eq('id', existing.id)
              .select('*')
              .single();
            if (error) throw error;
            tarjetaVenta = data;
          } else {
            const { data, error } = await panelDb
              .from('tarjetas_venta_live')
              .insert(payload)
              .select('*')
              .single();
            if (error) throw error;
            tarjetaVenta = data;
          }
        } catch (e: any) {
          console.warn('[summarize] tarjeta venta live no guardada:', e?.message);
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
        tarjeta_venta: tarjetaVenta,
        pedidos_venta_live: pedidosVentaLive,
        ai_warning: aiErrors.size > 0 ? [...aiErrors][0] : null,
        ai_errors: [...aiErrors],
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  return router;
}
