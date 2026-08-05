/**
 * Endpoints de conexión y recepción de WhatsApp.
 *
 * WhatsApp no tiene funciones de salida: no encola, edita, reintenta ni
 * envía mensajes. Solo vincula la sesión, recibe mensajes/fotos y los guarda.
 */

import { Router, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';

const BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:3000';

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

  router.all(['/send-next', '/queue', '/queue/stats', '/queue/:id', '/retry/:id'], (_req, res) => {
    res.status(410).json({ error: 'WhatsApp saliente desactivado. Solo se permite vincular y recibir.' });
  });

  return router;
}

// Compatibilidad con rutas antiguas: nunca crea registros ni envía mensajes.
export async function enqueueStoreConfirmation(..._args: unknown[]) {
  return { ok: false, queued: null, error: 'WhatsApp saliente desactivado' };
}
