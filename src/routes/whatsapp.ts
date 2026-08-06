/**
 * Endpoints de conexión y recepción de WhatsApp.
 *
 * Este router no contiene funciones de salida: no encola, edita, reintenta
 * ni envía mensajes. WhatsApp se usa únicamente para vincular la sesión,
 * recibir mensajes/fotos y guardarlos para el panel de pagos y evidencias.
 */

import { Router, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabasePanel } from '../lib/supabasePanel.js';

const BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:3000';
const BOLIVIA_TZ_OFFSET_MS = 4 * 60 * 60 * 1000;

function boliviaTodayUtcRange(now = new Date()) {
  const boliviaNow = new Date(now.getTime() - BOLIVIA_TZ_OFFSET_MS);
  const y = boliviaNow.getUTCFullYear();
  const m = String(boliviaNow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(boliviaNow.getUTCDate()).padStart(2, '0');
  const start = new Date(`${y}-${m}-${d}T04:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function createWhatsappRouter(_supabase: SupabaseClient) {
  const router = Router();

  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${BRIDGE_URL}/status`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await response.json();
      res.status(response.ok ? 200 : 502).json(data);
    } catch {
      res.status(503).json({ connected: false, qrDataUrl: null, error: 'connector_unreachable' });
    }
  });

  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${BRIDGE_URL}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await response.json();
      res.status(response.ok ? 200 : 502).json(data);
    } catch {
      res.status(503).json({ connected: false, error: 'bridge_unreachable', timestamp: new Date().toISOString() });
    }
  });

  router.get('/incoming-stats', async (_req: Request, res: Response) => {
    try {
      const { start, end } = boliviaTodayUtcRange();
      const [{ count, error: countError }, { data: lastRows, error: lastError }] = await Promise.all([
        supabasePanel
          .from('panel_mensajes')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString()),
        supabasePanel
          .from('panel_mensajes')
          .select('id, content, has_media, media_type, created_at')
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      if (countError) return res.status(500).json({ error: countError.message });
      if (lastError) return res.status(500).json({ error: lastError.message });

      const last = lastRows?.[0] ?? null;
      res.json({
        todayCount: count ?? 0,
        lastMessageAt: last?.created_at ?? null,
        lastMessageHasMedia: !!last?.has_media,
        lastMessageType: last?.media_type ?? null,
        lastMessagePreview: String(last?.content ?? '').slice(0, 80),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Compatibilidad explícita: cualquier cliente antiguo recibe una respuesta
  // de desactivación, nunca un intento de envío ni acceso a la cola.
  router.all(['/send-next', '/queue', '/queue/stats', '/queue/:id', '/retry/:id'], (_req, res) => {
    res.status(410).json({ error: 'WhatsApp saliente desactivado. Solo se permite vincular y recibir.' });
  });

  return router;
}

// Compatibilidad con módulos antiguos: no crea registros ni envía mensajes.
// Se mantiene temporalmente para que las rutas de tienda antiguas no puedan
// romper el servidor mientras se retiran por completo.
export async function enqueueStoreConfirmation(..._args: unknown[]) {
  return { ok: false, queued: null, error: 'WhatsApp saliente desactivado' };
}
