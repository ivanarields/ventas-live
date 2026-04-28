/**
 * src/routes/whatsapp.ts
 * Router Express para la cola de mensajes de WhatsApp.
 * Montado en server.ts con:
 *   app.use('/api/whatsapp', createWhatsappRouter(supabaseServer))
 *
 * Endpoints:
 *   GET  /api/whatsapp/health          — Estado del bridge de Railway
 *   GET  /api/whatsapp/queue           — Listar mensajes (con filtros)
 *   POST /api/whatsapp/queue           — Encolar un mensaje nuevo
 *   PATCH /api/whatsapp/queue/:id      — Editar texto o cancelar
 *   POST /api/whatsapp/send-next       — Enviar 1 mensaje (atómico, SKIP LOCKED)
 */

import { Router, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';

const BRIDGE_URL     = process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

// ── Tipos ────────────────────────────────────────────────────
type MessageStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
type MessageType   = 'store_verification' | 'live_confirmation' | 'pin_recovery' | 'general';

interface QueuedMessage {
  id:              string;
  user_id:         string;
  phone:           string;
  message_body:    string;
  type:            MessageType;
  status:          MessageStatus;
  reference_id?:   string;
  reference_type?: string;
  error_detail?:   string;
  sent_at?:        string;
  created_at:      string;
  updated_at:      string;
}

// ── Helper: normalizar teléfono a E.164 ─────────────────────
// Reutiliza la misma lógica que identityService.ts
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = raw.trim().replace(/\s+/g, '');
  // Quitar cualquier sufijo @c.us etc.
  p = p.replace(/@[a-z.]+$/, '');
  // Ya tiene + → dejar
  if (p.startsWith('+')) return p;
  // Solo dígitos bolivianos (8 dígitos, empieza con 6, 7 u 8)
  if (/^[678]\d{7}$/.test(p)) return `+591${p}`;
  // Con código de país sin +
  if (/^591[678]\d{7}$/.test(p)) return `+${p}`;
  // Número desconocido → devolver con +
  return `+${p}`;
}

// ── Factory del router ───────────────────────────────────────
export function createWhatsappRouter(supabase: SupabaseClient) {
  const router = Router();

  function uid(req: Request): string | null {
    return (req.headers['x-user-id'] as string) || null;
  }

  // ─────────────────────────────────────────────────────────
  // GET /api/whatsapp/health
  // Proxy al bridge de Railway. Retorna { connected, timestamp }
  // ─────────────────────────────────────────────────────────
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const r = await fetch(`${BRIDGE_URL}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await r.json();
      res.json(data);
    } catch {
      res.status(503).json({ connected: false, error: 'bridge_unreachable', timestamp: new Date().toISOString() });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/whatsapp/queue
  // Lista mensajes. ?status=pending&limit=50&offset=0
  // ─────────────────────────────────────────────────────────
  router.get('/queue', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      const limit  = parseInt(req.query.limit as string)  || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string | undefined;

      let query = supabase
        .from('whatsapp_message_queue')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/whatsapp/queue/stats
  // Conteo de mensajes por estado (para badges en la UI)
  // ─────────────────────────────────────────────────────────
  router.get('/queue/stats', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      const { data, error } = await supabase
        .from('whatsapp_message_queue')
        .select('status')
        .eq('user_id', userId);
      if (error) return res.status(500).json({ error: error.message });

      const counts: Record<string, number> = { pending: 0, sending: 0, sent: 0, failed: 0, cancelled: 0 };
      for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
      res.json(counts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/whatsapp/queue
  // Encola un mensaje nuevo (estado: pending).
  // Body: { phone, message_body, type?, reference_id?, reference_type? }
  // ─────────────────────────────────────────────────────────
  router.post('/queue', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });

    const { phone, message_body, type = 'general', reference_id, reference_type } = req.body;
    if (!phone || !message_body) {
      return res.status(400).json({ error: 'phone y message_body son requeridos' });
    }

    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm) return res.status(400).json({ error: 'Formato de teléfono inválido' });

    // Idempotencia: no encolar si ya hay un pending para este reference_id
    if (reference_id && reference_type) {
      const { data: existing } = await supabase
        .from('whatsapp_message_queue')
        .select('id, status')
        .eq('user_id', userId)
        .eq('reference_id', reference_id)
        .eq('reference_type', reference_type)
        .in('status', ['pending', 'sending', 'sent'])
        .limit(1)
        .single();
      if (existing) {
        return res.status(409).json({ error: 'Ya existe un mensaje para esta referencia', existing });
      }
    }

    try {
      const { data, error } = await supabase
        .from('whatsapp_message_queue')
        .insert({
          user_id: userId,
          phone: phoneNorm,
          message_body,
          type,
          status: 'pending',
          reference_id:   reference_id ?? null,
          reference_type: reference_type ?? null,
        })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.status(201).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // PATCH /api/whatsapp/queue/:id
  // Editar texto de un mensaje pending, o cancelarlo.
  // Body: { message_body?, status: 'cancelled' }
  // ─────────────────────────────────────────────────────────
  router.patch('/queue/:id', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });

    const { message_body, status } = req.body;
    const updates: Record<string, unknown> = {};

    if (message_body !== undefined) updates.message_body = message_body;
    if (status === 'cancelled') updates.status = 'cancelled';

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }

    try {
      // Solo se puede editar/cancelar si está en pending
      const { data, error } = await supabase
        .from('whatsapp_message_queue')
        .update(updates)
        .eq('id', req.params.id)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(409).json({ error: 'El mensaje no está en estado pending o no existe' });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/whatsapp/send-next
  // Toma 1 mensaje de la cola de forma atómica (SKIP LOCKED),
  // lo envía al bridge de Railway y actualiza el estado en BD.
  //
  // El frontend llama esto repetidamente con un delay aleatorio
  // entre llamadas (2-4 min) para el "Envío Seguro Anti-Baneo".
  // ─────────────────────────────────────────────────────────
  router.post('/send-next', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });

    try {
      // 1. Tomar mensaje atómico (FOR UPDATE SKIP LOCKED via RPC)
      const { data: msg, error: rpcError } = await supabase
        .rpc('fn_dequeue_whatsapp_message', { p_user_id: userId });

      if (rpcError) return res.status(500).json({ error: rpcError.message });
      if (!msg) return res.json({ ok: true, sent: false, reason: 'queue_empty' });

      const message = msg as QueuedMessage;

      // 2. Llamar al bridge de Railway
      let bridgeOk = false;
      let bridgeError = '';
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const r = await fetch(`${BRIDGE_URL}/api/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': WEBHOOK_SECRET,
          },
          body: JSON.stringify({ phone: message.phone, message: message.message_body }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (r.ok) {
          bridgeOk = true;
        } else {
          const errBody = await r.json().catch(() => ({}));
          bridgeError = (errBody as any).error || `HTTP ${r.status}`;
        }
      } catch (fetchErr: any) {
        bridgeError = fetchErr.message || 'bridge_unreachable';
      }

      // 3. Actualizar estado en BD
      if (bridgeOk) {
        await supabase
          .from('whatsapp_message_queue')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', message.id);
        res.json({ ok: true, sent: true, message_id: message.id, phone: message.phone });
      } else {
        await supabase
          .from('whatsapp_message_queue')
          .update({ status: 'failed', error_detail: bridgeError })
          .eq('id', message.id);
        res.status(502).json({ ok: false, sent: false, error: bridgeError, message_id: message.id });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/whatsapp/retry/:id
  // Reintenta un mensaje fallido (lo vuelve a pending)
  // ─────────────────────────────────────────────────────────
  router.post('/retry/:id', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      const { data, error } = await supabase
        .from('whatsapp_message_queue')
        .update({ status: 'pending', error_detail: null })
        .eq('id', req.params.id)
        .eq('user_id', userId)
        .eq('status', 'failed')
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(409).json({ error: 'Mensaje no está en estado failed o no existe' });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

// ─────────────────────────────────────────────────────────
// Helper exportado para usar desde otros routers/endpoints.
// Encola automáticamente un mensaje de confirmación de pago
// de tienda online. Idempotente por order_id.
// ─────────────────────────────────────────────────────────
export async function enqueueStoreConfirmation(
  supabase: SupabaseClient,
  userId: string,
  phone: string,
  orderId: string | number,
  customMessage?: string,
) {
  const phoneNorm = (() => {
    if (!phone) return null;
    let p = phone.trim().replace(/\s+/g, '').replace(/@[a-z.]+$/, '');
    if (p.startsWith('+')) return p;
    if (/^[678]\d{7}$/.test(p)) return `+591${p}`;
    if (/^591[678]\d{7}$/.test(p)) return `+${p}`;
    return `+${p}`;
  })();

  if (!phoneNorm) return { ok: false, error: 'Teléfono inválido' };

  const message = customMessage ||
    '¡Hola! 🎉 Tu pago ha sido verificado. Tu pedido de la Tienda Online está confirmado y en preparación. ¡Gracias por tu compra!';

  const { data, error } = await supabase
    .from('whatsapp_message_queue')
    .insert({
      user_id:        userId,
      phone:          phoneNorm,
      message_body:   message,
      type:           'store_verification',
      status:         'pending',
      reference_id:   String(orderId),
      reference_type: 'store_order',
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, queued: data };
}
