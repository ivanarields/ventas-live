// Análisis automático de comprobantes Live (estilo tienda).
// Se invoca cada vez que llega una imagen entrante durante un Live activo.
// NO genera resumen, NO selecciona prendas. Solo: clasifica → si es comprobante → crea pago pendiente.
//
// Diseñado para ser idempotente: si el mismo panel_mensaje_id ya tiene pago, no se duplica.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensurePanelLiveOrder,
  upsertWhatsappLivePayment,
  upsertLiveEvidence,
  recomputeLiveOrderTotals,
  syncMainPedidoForLiveOrder,
  matchLivePaymentWithMacrodroid,
  normalizeLivePhone,
  type PagoVentaLiveEstado,
} from './liveSalesService.js';
import { buildReceiptQrPrompt } from '../ai/prompts/receipt-qr.js';

// ─── Tipos ────────────────────────────────────────────────────────────────

export type AnalyzeReceiptInput = {
  userId: string;
  clienteId: string;
  phone: string;
  panelMensajeId: string;
  mediaUrl: string;
  mediaType?: string | null;
  messageContent?: string | null;
  messageCreatedAt: string;
};

export type AnalyzeReceiptResult =
  | { ok: true; created: false; reason: string }
  | { ok: true; created: true; pagoLiveId: string; estado: PagoVentaLiveEstado; matchedMacrodroid: boolean }
  | { ok: false; error: string };

type ReceiptExtraction = {
  es_comprobante: boolean;
  pagador: string | null;
  receptor: string | null;
  monto: number | null;
  hora: string | null;
  es_transferencia_propia: boolean;
};

// ─── Configuración ─────────────────────────────────────────────────────────

const DEFAULT_OWNER_NAME = 'LEIDY CANDY DIAZ SANCHEZ';
const DEFAULT_VISION_MODEL = 'google/gemini-2.5-flash-lite';
const MAX_AMOUNT_AUTO_VERIFY_BS = 1000; // > Bs 1000 sin MacroDroid → revision_manual
const ANALYSIS_TIMEOUT_MS = 15_000;

// ─── Utilidades ────────────────────────────────────────────────────────────

function firstJsonObject(text: string): string | null {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function parseAmount(raw: unknown): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^\d.,-]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function normalizeReceiptResponse(raw: any): ReceiptExtraction | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    es_comprobante: raw.es_comprobante === true,
    pagador: typeof raw.pagador === 'string' && raw.pagador.trim() ? raw.pagador.trim() : null,
    receptor: typeof raw.receptor === 'string' && raw.receptor.trim() ? raw.receptor.trim() : null,
    monto: parseAmount(raw.monto),
    hora: typeof raw.hora === 'string' && raw.hora.trim() ? raw.hora.trim() : null,
    es_transferencia_propia: raw.es_transferencia_propia === true,
  };
}

function boliviaDateKey(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const offsetMs = 4 * 60 * 60 * 1000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 10);
}

function receiptAtFromMessage(messageCreatedAt: string, hora: string | null): string {
  if (!hora) return messageCreatedAt;
  const match = hora.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return messageCreatedAt;
  const base = new Date(messageCreatedAt);
  if (!Number.isFinite(base.getTime())) return messageCreatedAt;
  const offsetMs = 4 * 60 * 60 * 1000;
  const localBase = new Date(base.getTime() - offsetMs);
  localBase.setUTCHours(Number(match[1]), Number(match[2]), 0, 0);
  return new Date(localBase.getTime() + offsetMs).toISOString();
}

// ─── Owner name configurable ───────────────────────────────────────────────

async function getOwnerName(mainDb: SupabaseClient, userId: string): Promise<string> {
  try {
    const { data } = await mainDb
      .from('ai_config')
      .select('owner_name')
      .eq('user_id', userId)
      .single();
    const value = (data?.owner_name as string | null)?.trim();
    return value || DEFAULT_OWNER_NAME;
  } catch {
    return DEFAULT_OWNER_NAME;
  }
}

async function getVisionModel(_mainDb: SupabaseClient, _userId: string): Promise<string> {
  return process.env.OPENROUTER_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;
}

// ─── Llamada a OpenRouter ──────────────────────────────────────────────────

async function callVisionExtraction(params: {
  apiKey: string;
  model: string;
  prompt: string;
  imageDataUrl: string;
}): Promise<ReceiptExtraction | null> {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'https://ventas-live.vercel.app',
      'X-Title': 'Ventas Live - Análisis Automático',
    },
    body: JSON.stringify({
      model: params.model,
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: params.prompt },
          { type: 'image_url', image_url: { url: params.imageDataUrl } },
        ],
      }],
    }),
    signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`OpenRouter HTTP ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data: any = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  const textResp = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((item: any) => item?.text ?? '').join('')
      : '';

  const jsonStr = firstJsonObject(textResp) ?? textResp;
  try {
    return normalizeReceiptResponse(JSON.parse(jsonStr));
  } catch {
    return null;
  }
}

// ─── Descarga de imagen ────────────────────────────────────────────────────

async function fetchImageAsDataUrl(url: string): Promise<{ dataUrl: string; mime: string } | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return null;
    const mime = resp.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await resp.arrayBuffer());
    return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, mime };
  } catch {
    return null;
  }
}

// ─── Detector de monto repetido (anti-alucinación) ─────────────────────────

async function isAmountRepeatedAcrossClients(
  panelDb: SupabaseClient,
  amount: number,
  clienteId: string,
  windowHours: number = 1,
): Promise<boolean> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const { data } = await panelDb
    .from('pagos_venta_live')
    .select('id, cliente_id')
    .eq('monto', amount)
    .gte('created_at', since);
  if (!data || data.length < 2) return false;
  const distinctClients = new Set(data.map((p: any) => p.cliente_id).filter(Boolean));
  distinctClients.add(clienteId);
  return distinctClients.size >= 3; // El mismo monto en 3+ clientas distintas en 1h → sospecha
}

// ─── Función principal ─────────────────────────────────────────────────────

export async function analyzeLiveReceipt(
  panelDb: SupabaseClient,
  mainDb: SupabaseClient,
  input: AnalyzeReceiptInput,
): Promise<AnalyzeReceiptResult> {
  // 1. Validaciones rápidas
  const phone = normalizeLivePhone(input.phone);
  if (!phone) return { ok: false, error: 'Teléfono inválido' };

  if (!input.mediaUrl) return { ok: true, created: false, reason: 'sin_media' };
  const mediaType = (input.mediaType || '').toLowerCase();
  const looksLikeImage = mediaType.startsWith('image/') || /\.(jpe?g|png|webp)/i.test(input.mediaUrl);
  if (!looksLikeImage) return { ok: true, created: false, reason: 'no_es_imagen' };

  // 2. Idempotencia: si ya hay pago para este mensaje, salir sin tocar nada
  const { data: existing } = await panelDb
    .from('pagos_venta_live')
    .select('id, estado')
    .eq('panel_mensaje_id', input.panelMensajeId)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      created: true,
      pagoLiveId: existing.id,
      estado: existing.estado as PagoVentaLiveEstado,
      matchedMacrodroid: existing.estado === 'verificado_macrodroid',
    };
  }

  // 3. API key
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: 'OPENROUTER_API_KEY no configurada' };

  // 4. Bajar imagen + analizar con IA
  const image = await fetchImageAsDataUrl(input.mediaUrl);
  if (!image) return { ok: true, created: false, reason: 'no_se_pudo_descargar_imagen' };

  const ownerName = await getOwnerName(mainDb, input.userId);
  const model = await getVisionModel(mainDb, input.userId);
  const prompt = buildReceiptQrPrompt(ownerName);

  let extraction: ReceiptExtraction | null = null;
  try {
    extraction = await callVisionExtraction({ apiKey, model, prompt, imageDataUrl: image.dataUrl });
  } catch (err: any) {
    return { ok: false, error: `IA: ${err?.message ?? 'error desconocido'}` };
  }

  if (!extraction) return { ok: true, created: false, reason: 'respuesta_ia_invalida' };

  // 5. Filtros de seguridad
  if (!extraction.es_comprobante) {
    return { ok: true, created: false, reason: 'no_es_comprobante' };
  }
  if (extraction.es_transferencia_propia) {
    return { ok: true, created: false, reason: 'transferencia_propia_de_la_dueña' };
  }
  if (!extraction.monto || extraction.monto <= 0) {
    return { ok: true, created: false, reason: 'sin_monto_extraido' };
  }

  // 6. Detector de alucinación: monto repetido entre clientes distintos
  const amountRepeated = await isAmountRepeatedAcrossClients(panelDb, extraction.monto, input.clienteId);

  // 7. Determinar estado inicial
  const isHighAmount = extraction.monto > MAX_AMOUNT_AUTO_VERIFY_BS;
  const forceManualReview = amountRepeated || isHighAmount;
  const initialEstado: PagoVentaLiveEstado = forceManualReview ? 'revision_manual' : 'pendiente_whatsapp';

  // 8. Crear pedido + evidencia + pago
  const fechaPedido = boliviaDateKey(input.messageCreatedAt);
  const comprobanteAt = receiptAtFromMessage(input.messageCreatedAt, extraction.hora);
  const comprobanteTexto = [
    extraction.pagador,
    `Bs ${extraction.monto}`,
    extraction.hora,
  ].filter(Boolean).join(' - ');

  const order = await ensurePanelLiveOrder(panelDb, {
    clienteId: input.clienteId,
    phone,
    fechaPedido,
    nombreDetectado: extraction.pagador,
    isTest: false,
  });

  await upsertLiveEvidence(panelDb, {
    pedidoLiveId: order.id,
    clienteId: input.clienteId,
    panelMensajeId: input.panelMensajeId,
    tipo: 'comprobante',
    mediaUrl: input.mediaUrl,
    mediaType: input.mediaType,
    content: input.messageContent,
    descripcion: comprobanteTexto || 'Comprobante detectado automáticamente',
    messageCreatedAt: input.messageCreatedAt,
    metadata: {
      source: 'auto_analyzer',
      extracted: extraction,
      flagged_amount_repeated: amountRepeated,
      flagged_high_amount: isHighAmount,
    },
  });

  let pagoLive = await upsertWhatsappLivePayment(panelDb, {
    pedidoLiveId: order.id,
    clienteId: input.clienteId,
    phone,
    fechaPedido,
    nombreDetectado: extraction.pagador,
    monto: extraction.monto,
    comprobanteHora: extraction.hora,
    comprobanteAt,
    comprobanteTexto: comprobanteTexto || null,
    comprobanteMediaUrl: input.mediaUrl,
    panelMensajeId: input.panelMensajeId,
    isTest: false,
  });

  // Si se forzó revisión manual, sobrescribir estado (upsert pone pendiente_whatsapp por defecto)
  if (forceManualReview && pagoLive.estado === 'pendiente_whatsapp') {
    const reasons: string[] = [];
    if (amountRepeated) reasons.push('monto_repetido_entre_clientes');
    if (isHighAmount) reasons.push(`monto_alto_>_${MAX_AMOUNT_AUTO_VERIFY_BS}`);
    const { data: updated } = await panelDb
      .from('pagos_venta_live')
      .update({
        estado: 'revision_manual',
        match_score: 0.4,
        match_reason: reasons.join('|'),
      })
      .eq('id', pagoLive.id)
      .select('*')
      .single();
    if (updated) pagoLive = updated;
  }

  // 9. Recalcular totales y sincronizar pedido principal
  let updatedOrder = await recomputeLiveOrderTotals(panelDb, order.id);
  updatedOrder = await syncMainPedidoForLiveOrder(panelDb, mainDb, input.userId, updatedOrder);

  // 10. Intentar match con MacroDroid (puede haber notificación previa)
  pagoLive = await matchLivePaymentWithMacrodroid(panelDb, mainDb, {
    userId: input.userId,
    pagoLive,
    mainCustomerId: updatedOrder.main_customer_id,
    windowMinutes: 5,
  });

  // 11. Recalcular después del match
  await recomputeLiveOrderTotals(panelDb, order.id);

  return {
    ok: true,
    created: true,
    pagoLiveId: pagoLive.id,
    estado: pagoLive.estado as PagoVentaLiveEstado,
    matchedMacrodroid: pagoLive.estado === 'verificado_macrodroid',
  };
}
