import { Router, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export function createStoreSelectionRouter(supabaseStore: SupabaseClient) {
  const router = Router();

  // Helper: generar token seguro
  function generateToken(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  // Helper: normalizar telefono
  function normalizePhone(raw: string): string {
    const p = raw.replace(/\D/g, '');
    if (p.startsWith('591')) return p;
    return '591' + p;
  }

  // POST /api/store/selection-request
  // Crear un caso de duda IA (desde sistema principal o desde tienda)
  router.post('/selection-request', async (req: Request, res: Response) => {
    try {
      const { customer_wa, customer_name, suggested_items, candidate_photos, confidence_score, source_type, source_id } = req.body;

      if (!customer_wa) {
        return res.status(400).json({ error: 'customer_wa requerido' });
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

      const { data, error } = await supabaseStore
        .from('store_selection_requests')
        .insert({
          customer_wa: normalizePhone(customer_wa),
          customer_name: customer_name || '',
          suggested_items: suggested_items || [],
          candidate_photos: candidate_photos || [],
          confidence_score: confidence_score || 0,
          source_type: source_type || 'live_payment',
          source_id: source_id || null,
          token,
          expires_at: expiresAt.toISOString(),
          status: 'pending_customer',
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({
        ok: true,
        request: data,
        link: `/tienda/selection?token=${token}`,
      });
    } catch (err: any) {
      console.error('[store/selection-request]', err);
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  // GET /api/store/selection/:token
  // Publico: la clienta abre el link y ve sus fotos
  router.get('/selection/:token', async (req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseStore
        .from('store_selection_requests')
        .select('*')
        .eq('token', req.params.token)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Link no encontrado o vencido' });
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return res.status(410).json({ error: 'Link vencido' });
      }

      // No devolver token interno
      const { token, ...safe } = data;
      res.json({ ok: true, request: safe });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  // POST /api/store/selection/:token/confirm
  // La clienta confirma las prendas
  router.post('/selection/:token/confirm', async (req: Request, res: Response) => {
    try {
      const { selected_items, notes } = req.body;

      const { data: existing, error: findErr } = await supabaseStore
        .from('store_selection_requests')
        .select('*')
        .eq('token', req.params.token)
        .single();

      if (findErr || !existing) {
        return res.status(404).json({ error: 'Link no encontrado' });
      }

      if (existing.expires_at && new Date(existing.expires_at) < new Date()) {
        return res.status(410).json({ error: 'Link vencido' });
      }

      if (existing.status !== 'pending_customer' && existing.status !== 'opened') {
        return res.status(409).json({ error: 'Este link ya fue usado o cancelado' });
      }

      const { data, error } = await supabaseStore
        .from('store_selection_requests')
        .update({
          status: 'confirmed',
          selected_items: selected_items || [],
          notes: notes || '',
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      res.json({ ok: true, message: 'Prendas confirmadas. Gracias!' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  // POST /api/store/selection/:token/reject
  // La clienta dice que ninguna es correcta
  router.post('/selection/:token/reject', async (req: Request, res: Response) => {
    try {
      const { notes } = req.body;

      const { data: existing, error: findErr } = await supabaseStore
        .from('store_selection_requests')
        .select('*')
        .eq('token', req.params.token)
        .single();

      if (findErr || !existing) {
        return res.status(404).json({ error: 'Link no encontrado' });
      }

      if (existing.status !== 'pending_customer' && existing.status !== 'opened') {
        return res.status(409).json({ error: 'Este link ya fue usado o cancelado' });
      }

      const { data, error } = await supabaseStore
        .from('store_selection_requests')
        .update({
          status: 'rejected',
          notes: notes || 'Cliente indica que ninguna prenda es correcta',
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      res.json({ ok: true, message: 'Respuesta registrada. Te contactaremos.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  // POST /api/store/selection/:id/send-link
  // Admin: enviar link por WhatsApp (genera mensaje copiable)
  router.post('/selection/:id/send-link', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });

      const { data: request, error: findErr } = await supabaseStore
        .from('store_selection_requests')
        .select('*')
        .eq('id', Number(req.params.id))
        .single();

      if (findErr || !request) {
        return res.status(404).json({ error: 'Solicitud no encontrada' });
      }

      const link = `${process.env.STORE_URL || 'https://tienda.ventas-live.com'}/tienda/selection?token=${request.token}`;
      const message = `Hola! Necesitamos que confirmes las prendas de tu pedido. Entra aqui para ver las fotos y seleccionar las correctas: ${link}`;

      // Guardar en log
      await supabaseStore.from('store_message_log').insert({
        selection_request_id: request.id,
        customer_wa: request.customer_wa,
        template_key: 'selection_request',
        message_body: message,
        status: 'draft',
      });

      res.json({
        ok: true,
        link,
        message,
        phone: request.customer_wa,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  // GET /api/store/selection-requests
  // Admin: listar solicitudes pendientes
  router.get('/selection-requests', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });

      const status = req.query.status as string | undefined;
      let query = supabaseStore
        .from('store_selection_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (status) query = query.eq('status', status);

      const { data, error } = await query.limit(200);
      if (error) throw error;

      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  return router;
}
