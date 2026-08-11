/**
 * identity.ts
 * Rutas REST para el sistema de identidad y perfiles unificados.
 * Montado en server.ts con: app.use('/api/identity', createIdentityRouter(supabaseServer))
 */

import { Router, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  findOrCreateProfile,
  depositEvidence,
  getProfileWithEvidence,
  listProfiles,
  recalculateAllConfidences,
  normalizePhone,
  normalizeName,
  type EvidenceInput,
} from '../services/identityService.js';

export function createIdentityRouter(
  supabase: SupabaseClient,
  supabaseStore?: SupabaseClient,
  supabasePanel?: SupabaseClient,
) {
  const router = Router();

  function uid(req: Request): string | null {
    return (req.headers['x-user-id'] as string) || null;
  }

  function parseLiveSessionNotes(notes: unknown): { startAt: string | null; endAt: string | null; processedAt: string | null } {
    try {
      const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes;
      return {
        startAt: typeof parsed?.started_at === 'string' ? parsed.started_at : null,
        endAt: typeof parsed?.ended_at === 'string' ? parsed.ended_at : typeof parsed?.closed_at === 'string' ? parsed.closed_at : null,
        processedAt: typeof parsed?.processed_at === 'string' ? parsed.processed_at : null,
      };
    } catch {
      return { startAt: null, endAt: null, processedAt: null };
    }
  }

  async function resolveLiveOrderWindow(userId: string, liveOrder: any): Promise<{ from: string; to: string; source: string } | null> {
    if (!liveOrder) return null;

    const { data: evidenceRows } = await supabasePanel!
      .from('evidencias_venta_live')
      .select('metadata')
      .eq('pedido_live_id', liveOrder.id)
      .not('metadata', 'is', null)
      .limit(20);

    for (const row of evidenceRows ?? []) {
      const range = row?.metadata?.live_range;
      if (range?.start_at && range?.end_at) {
        return { from: range.start_at, to: range.end_at, source: 'evidence_live_range' };
      }
    }

    const orderCreated = liveOrder.created_at ? new Date(liveOrder.created_at).getTime() : Date.now();
    const { data: sessions } = await supabase
      .from('live_sessions')
      .select('id,notes,created_at,status,user_id')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(20);

    let best: { from: string; to: string; source: string; distance: number } | null = null;
    for (const session of sessions ?? []) {
      const parsed = parseLiveSessionNotes(session.notes);
      if (!parsed.startAt || !parsed.endAt) continue;
      const processedAt = parsed.processedAt ? new Date(parsed.processedAt).getTime() : new Date(session.created_at).getTime();
      const distance = Math.abs(orderCreated - processedAt);
      if (distance > 8 * 60 * 60 * 1000) continue;
      if (!best || distance < best.distance) {
        best = { from: parsed.startAt, to: parsed.endAt, source: `live_session:${session.id}`, distance };
      }
    }

    return best ? { from: best.from, to: best.to, source: best.source } : null;
  }

  // GET /api/identity/profiles
  // Lista todos los perfiles del usuario. ?search=nombre &limit=50 &offset=0
  router.get('/profiles', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      const profiles = await listProfiles(supabase, userId, {
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
        search: req.query.search as string,
        source: req.query.source as string,
      });
      res.json(profiles);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/identity/profiles/:id
  // Perfil completo con historial de evidencia
  router.get('/profiles/:id', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      const result = await getProfileWithEvidence(supabase, userId, req.params.id);
      if (!result) return res.status(404).json({ error: 'Perfil no encontrado' });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/profiles
  // Crear o encontrar perfil por nombre/teléfono. Devuelve el perfil y el tipo de match.
  router.post('/profiles', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    const { name, phone, cliente_id, origin } = req.body;
    if (!name && !phone) return res.status(400).json({ error: 'Se requiere name o phone' });
    try {
      const result = await findOrCreateProfile(supabase, userId, {
        name,
        phone,
        clienteId: cliente_id,
        origin: origin === 'manual' ? 'manual' : 'auto',
      });
      res.status(result.match_type === 'new' ? 201 : 200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/identity/profiles/:id
  // Editar nombre canónico, teléfono u otros campos del perfil
  router.patch('/profiles/:id', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    const { display_name, phone, store_phone, panel_phone, cliente_id } = req.body;
    const updates: Record<string, unknown> = {};
    if (display_name !== undefined) updates.display_name = display_name;
    if (phone !== undefined) updates.phone = normalizePhone(phone);
    if (store_phone !== undefined) updates.store_phone = store_phone;
    if (panel_phone !== undefined) updates.panel_phone = panel_phone;
    if (cliente_id !== undefined) updates.cliente_id = cliente_id;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }
    try {
      const { data, error } = await supabase
        .from('identity_profiles')
        .update(updates)
        .eq('id', req.params.id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'Perfil no encontrado' });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/profiles/:id/evidence
  // Depositar evidencia manualmente (para pruebas o integraciones futuras)
  router.post('/profiles/:id/evidence', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    const { source, source_id, event_type, amount, phone, name_raw, event_at, payload } = req.body;
    if (!source || !event_type) {
      return res.status(400).json({ error: 'source y event_type requeridos' });
    }
    try {
      const evidence = await depositEvidence(supabase, userId, req.params.id, {
        source, source_id, event_type, amount, phone, name_raw, event_at, payload,
      } as EvidenceInput);
      res.status(201).json(evidence);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/identity/evidence?source=manual_payment&limit=20
  // Listar evidencia con filtros
  router.get('/evidence', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      let query = supabase
        .from('identity_evidence')
        .select('*')
        .eq('user_id', userId)
        .order('event_at', { ascending: false });
      if (req.query.source) query = query.eq('source', req.query.source as string);
      if (req.query.profile_id) query = query.eq('profile_id', req.query.profile_id as string);
      const limit = parseInt(req.query.limit as string) || 50;
      query = query.limit(limit);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/resolve
  // Dado nombre y/o teléfono, devuelve el perfil que le corresponde (sin crearlo si no existe).
  router.post('/resolve', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    const { name, phone } = req.body;
    if (!name && !phone) return res.status(400).json({ error: 'Se requiere name o phone' });

    try {
      const phoneNorm = phone ? normalizePhone(phone) : null;
      const nameNorm = name ? normalizeName(name) : null;

      // Buscar sin crear
      let query = supabase.from('identity_profiles').select('*').eq('user_id', userId);
      if (phoneNorm) {
        const { data } = await query.eq('phone', phoneNorm).limit(1).single();
        if (data) return res.json({ profile: data, confidence: 1.0, match_type: 'phone_exact' });
      }
      if (nameNorm) {
        const { data: profiles } = await supabase
          .from('identity_profiles').select('*').eq('user_id', userId);
        const exact = profiles?.find(p => normalizeName(p.display_name) === nameNorm);
        if (exact) return res.json({ profile: exact, confidence: 0.85, match_type: 'name_exact' });
      }

      res.status(404).json({ error: 'Sin coincidencia' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/sync-store
  // Backfill de pedidos de la tienda online → identity_evidence
  router.post('/sync-store', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    if (!supabaseStore) return res.status(503).json({ error: 'supabaseStore no configurado' });
    try {
      const { data: existing } = await supabase
        .from('identity_evidence').select('source_id').eq('user_id', userId).eq('source', 'store_order');
      const syncedIds = new Set((existing ?? []).map(e => e.source_id));

      const { data: orders, error } = await supabaseStore
        .from('store_orders')
        .select('id, customer_name, customer_wa, total, status, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) return res.status(500).json({ error: error.message });

      let created = 0; let skipped = 0;
      for (const o of orders ?? []) {
        const orderId = String(o.id);
        if (syncedIds.has(orderId)) { skipped++; continue; }
        const result = await findOrCreateProfile(supabase, userId, {
          name: o.customer_name,
          phone: o.customer_wa,
        });
        // Vincular store_phone si no está aún
        if (o.customer_wa && !result.profile.store_phone) {
          await supabase.from('identity_profiles')
            .update({ store_phone: normalizePhone(o.customer_wa) })
            .eq('id', result.profile.id);
        }
        await depositEvidence(supabase, userId, result.profile.id, {
          source: 'store_order',
          source_id: orderId,
          event_type: 'order',
          amount: o.total,
          phone: o.customer_wa,
          name_raw: o.customer_name,
          event_at: o.created_at,
          payload: { status: o.status },
        });
        created++;
      }
      await recalculateAllConfidences(supabase, userId);
      res.json({ ok: true, created, skipped, total: (orders ?? []).length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/sync-whatsapp
  // Backfill de contactos del panel de WhatsApp → identity_evidence
  router.post('/sync-whatsapp', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    if (!supabasePanel) return res.status(503).json({ error: 'supabasePanel no configurado' });
    try {
      const { data: existing } = await supabase
        .from('identity_evidence').select('source_id').eq('user_id', userId).eq('source', 'whatsapp');
      const syncedIds = new Set((existing ?? []).map(e => e.source_id));

      const { data: clientes, error } = await supabasePanel
        .from('panel_clientes')
        .select('id, phone, nombre, last_interaction, created_at')
        .order('last_interaction', { ascending: false })
        .limit(500);
      if (error) return res.status(500).json({ error: error.message });

      let created = 0; let skipped = 0;
      for (const c of clientes ?? []) {
        const clienteId = String(c.id);
        if (syncedIds.has(clienteId)) { skipped++; continue; }
        const result = await findOrCreateProfile(supabase, userId, {
          name: c.nombre,
          phone: c.phone,
        });
        // Vincular panel_phone si no está aún
        if (c.phone && !result.profile.panel_phone) {
          await supabase.from('identity_profiles')
            .update({ panel_phone: normalizePhone(c.phone) })
            .eq('id', result.profile.id);
        }
        await depositEvidence(supabase, userId, result.profile.id, {
          source: 'whatsapp',
          source_id: clienteId,
          source_ref: c.phone,
          event_type: 'contact',
          phone: c.phone,
          name_raw: c.nombre,
          event_at: c.last_interaction ?? c.created_at,
          payload: {},
        });
        created++;
      }
      await recalculateAllConfidences(supabase, userId);
      res.json({ ok: true, created, skipped, total: (clientes ?? []).length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/sync-pagos
  // Backfill: lee pagos sin evidencia y los ingesta. Idempotente.
  // Útil para retroalimentar pagos de MacroDroid anteriores al sistema de identidad.
  router.post('/sync-pagos', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      // IDs de pagos que ya tienen evidencia
      const { data: existing } = await supabase
        .from('identity_evidence')
        .select('source_id')
        .eq('user_id', userId)
        .in('source', ['manual_payment', 'macrodroid']);
      const syncedIds = new Set((existing ?? []).map(e => e.source_id));

      // Pagos del usuario
      const { data: pagos, error } = await supabase
        .from('pagos')
        .select('id, nombre, pago, method, date, customer_id')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(500);
      if (error) return res.status(500).json({ error: error.message });

      let created = 0;
      let skipped = 0;
      for (const p of pagos ?? []) {
        const pagoId = String(p.id);
        if (syncedIds.has(pagoId)) { skipped++; continue; }
        const source = p.method === 'Notificación bancaria' ? 'macrodroid' : 'manual_payment';
        const result = await findOrCreateProfile(supabase, userId, {
          name: p.nombre,
          clienteId: p.customer_id ?? undefined,
        });
        await depositEvidence(supabase, userId, result.profile.id, {
          source,
          source_id: pagoId,
          event_type: 'payment',
          amount: p.pago,
          name_raw: p.nombre,
          event_at: p.date,
          payload: { customer_id: p.customer_id, method: p.method },
        });
        created++;
      }

      await recalculateAllConfidences(supabase, userId);
      res.json({ ok: true, created, skipped, total: (pagos ?? []).length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/identity/whatsapp-photos?phone=+591...&date=2026-04-20&days=4
  // Fotos enviadas por un cliente de WhatsApp cerca de la fecha del pedido.
  router.get('/whatsapp-photos', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    if (!supabasePanel) return res.status(503).json({ error: 'supabasePanel no configurado' });

    const { phone, date, days = '4', mainPedidoId, mode } = req.query as Record<string, string>;
    if (!phone) return res.status(400).json({ error: 'phone requerido' });

    try {
      const phoneNorm = normalizePhone(phone);
      const mainPedidoNumber = Number(mainPedidoId);

      let liveOrder: any = null;
      if (Number.isFinite(mainPedidoNumber)) {
        const { data } = await supabasePanel
          .from('pedidos_venta_live')
          .select('id, main_pedido_id, fecha_pedido, cliente_id')
          .eq('main_pedido_id', mainPedidoNumber)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        liveOrder = data ?? null;
      }

      let cliente: { id: string; resumen?: string | null } | null = null;
      if (liveOrder?.cliente_id) {
        const { data } = await supabasePanel
          .from('panel_clientes')
          .select('id,resumen')
          .eq('id', liveOrder.cliente_id)
          .maybeSingle();
        cliente = data ?? null;
      }

      if (!cliente) {
        // El panel guarda teléfonos sin '+' (ej: 59170000000)
        // Buscamos con y sin el prefijo '+' para tolerancia de formato.
        const phoneVariants = [phoneNorm, phoneNorm.replace(/^\+/, '')];
        for (const variant of phoneVariants) {
          const { data } = await supabasePanel
            .from('panel_clientes')
            .select('id,resumen')
            .eq('phone', variant)
            .limit(1)
            .maybeSingle();
          if (data) { cliente = data; break; }
        }
      }

      if (!cliente) return res.json({ photos: [], cliente_found: false });

      // El detalle actual solo necesita comprobantes. En este modo no buscamos
      // conversaciones, evidencias de prendas ni datos de la tienda: leemos
      // directamente las imágenes entrantes y el estado mínimo del pago.
      if (mode === 'comprobantes') {
        const pivot = date
          ? new Date(`${String(date).slice(0, 10)}T12:00:00-04:00`)
          : new Date();
        const rangeDays = Math.max(1, Math.min(Number.parseInt(days, 10) || 4, 14));
        const rangeMs = rangeDays * 24 * 60 * 60 * 1000;
        const from = new Date(pivot.getTime() - rangeMs).toISOString();
        const to = new Date(pivot.getTime() + rangeMs).toISOString();

        const [{ data: mensajes, error: mensajesError }, { data: pagos, error: pagosError }] = await Promise.all([
          supabasePanel
            .from('panel_mensajes')
            .select('id, media_url, media_type, direction, created_at, content')
            .eq('cliente_id', cliente.id)
            .eq('direction', 'in')
            .eq('has_media', true)
            .not('media_url', 'is', null)
            .gte('created_at', from)
            .lte('created_at', to)
            .order('created_at', { ascending: false })
            .limit(30),
          supabasePanel
            .from('pagos_venta_live')
            .select('panel_mensaje_id, comprobante_media_url, comprobante_texto, estado, created_at')
            .eq('cliente_id', cliente.id)
            .in('estado', ['pendiente_whatsapp', 'revision_manual'])
            .gte('created_at', from)
            .lte('created_at', to)
            .order('created_at', { ascending: false })
            .limit(30),
        ]);

        if (mensajesError) throw mensajesError;
        if (pagosError) throw pagosError;

        const paymentByMessageId = new Map<string, any>();
        const paymentByMediaUrl = new Map<string, any>();
        for (const payment of pagos ?? []) {
          if (payment.panel_mensaje_id) paymentByMessageId.set(String(payment.panel_mensaje_id), payment);
          if (payment.comprobante_media_url) paymentByMediaUrl.set(String(payment.comprobante_media_url), payment);
        }

        const photos = (mensajes ?? []).map((message: any) => {
          const payment = paymentByMessageId.get(String(message.id))
            ?? paymentByMediaUrl.get(String(message.media_url));
          return {
            ...message,
            // En este panel todas las imágenes entrantes son comprobantes.
            // Si el pago todavía está siendo analizado, igual se muestra como pendiente.
            tipo: 'comprobante',
            descripcion: payment?.comprobante_texto ?? null,
            payment_status: payment?.estado ?? null,
            selected_by_ai: false,
            selected_final: false,
            selection_source: null,
          };
        }).filter((photo: any) =>
          photo.payment_status === 'pendiente_whatsapp' || photo.payment_status === 'revision_manual'
        );

        return res.json({
          photos,
          cliente_found: true,
          cliente_id: cliente.id,
          pedido_live_id: liveOrder?.id ?? null,
        });
      }

      if (!liveOrder) {
        const fechaPedido = date ? String(date).slice(0, 10) : null;
        let q = supabasePanel
          .from('pedidos_venta_live')
          .select('id, main_pedido_id, fecha_pedido')
          .eq('cliente_id', cliente.id)
          .neq('estado', 'archivado')
          .order('fecha_pedido', { ascending: false })
          .limit(1);
        if (fechaPedido) q = q.eq('fecha_pedido', fechaPedido) as typeof q;
        const { data } = await q.maybeSingle();
        liveOrder = data ?? null;
      }

      const liveWindow = await resolveLiveOrderWindow(userId, liveOrder);
      const pivot = date ? new Date(date) : (liveOrder?.fecha_pedido ? new Date(liveOrder.fecha_pedido) : new Date());
      const rangeMs = parseInt(days) * 24 * 60 * 60 * 1000;
      const from = liveWindow?.from ?? new Date(pivot.getTime() - rangeMs).toISOString();
      const to = liveWindow?.to ?? new Date(pivot.getTime() + rangeMs).toISOString();

      const mensajesQuery = supabasePanel
        .from('panel_mensajes')
        .select('id, media_url, media_type, direction, created_at, content')
        .eq('cliente_id', cliente.id)
        .eq('has_media', true)
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false })
        .limit(30);

      // Un comprobante pendiente puede pertenecer a un mensaje recibido fuera
      // de la ventana del pedido anterior. Lo incluimos por su vínculo directo
      // con pagos_venta_live para que nunca termine mezclado con las prendas.
      const pagosPendientesQuery = supabasePanel
        .from('pagos_venta_live')
        .select('panel_mensaje_id, comprobante_media_url, comprobante_texto, estado, created_at')
        .eq('cliente_id', cliente.id)
        .in('estado', ['pendiente_whatsapp', 'revision_manual'])
        .order('created_at', { ascending: false })
        .limit(30);

      const evidenciasQuery = liveOrder?.id
        ? supabasePanel
          .from('evidencias_venta_live')
          .select('panel_mensaje_id,tipo,descripcion,metadata')
          .eq('pedido_live_id', liveOrder.id)
          .not('panel_mensaje_id', 'is', null)
        : Promise.resolve({ data: [] as any[] });

      const [{ data: mensajes }, { data: evidencias }, { data: pagosPendientes }] = await Promise.all([
        mensajesQuery,
        evidenciasQuery,
        pagosPendientesQuery,
      ]);

      const pendingMessageIds = (pagosPendientes ?? [])
        .map((p: any) => p.panel_mensaje_id)
        .filter(Boolean);
      const pendingMediaUrls = (pagosPendientes ?? [])
        .map((p: any) => p.comprobante_media_url)
        .filter(Boolean);

      const [{ data: pendingMessagesById }, { data: pendingMessagesByMedia }] = await Promise.all([
        pendingMessageIds.length > 0
          ? supabasePanel
            .from('panel_mensajes')
            .select('id, media_url, media_type, direction, created_at, content')
            .in('id', pendingMessageIds)
          : Promise.resolve({ data: [] as any[] }),
        pendingMediaUrls.length > 0
          ? supabasePanel
            .from('panel_mensajes')
            .select('id, media_url, media_type, direction, created_at, content')
            .in('media_url', pendingMediaUrls)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const uniqueMessages = new Map<string, any>();
      for (const message of [
        ...(mensajes ?? []),
        ...(pendingMessagesById ?? []),
        ...(pendingMessagesByMedia ?? []),
      ]) {
        if (message?.id) uniqueMessages.set(String(message.id), message);
      }

      const photosRaw = [...uniqueMessages.values()].filter(m =>
        m.media_url && (
          (m.media_type && m.media_type.startsWith('image/')) ||
          /\.(jpg|jpeg|png|webp)/i.test(m.media_url)
        )
      );

      const evidenceByMessageId = new Map<string, any>();
      for (const ev of evidencias ?? []) {
        if (ev.panel_mensaje_id) evidenceByMessageId.set(ev.panel_mensaje_id, ev);
      }

      const paymentByMessageId = new Map<string, any>();
      const paymentByMediaUrl = new Map<string, any>();
      for (const payment of pagosPendientes ?? []) {
        if (payment.panel_mensaje_id) paymentByMessageId.set(String(payment.panel_mensaje_id), payment);
        if (payment.comprobante_media_url) paymentByMediaUrl.set(String(payment.comprobante_media_url), payment);
      }

      // Marcar comprobantes de tienda: fotos que la tienda usó como prueba de pago
      // pero que no tienen evidencia Live. Sin este cruce quedan con tipo=null
      // y pasan como "prendas" en el selector de fotos.
      const storeProofMsgIds = new Set<string>();
      if (supabaseStore) {
        const panelMsgIds = photosRaw.map((m: any) => m.id);
        if (panelMsgIds.length > 0) {
          const { data: storeProofs } = await supabaseStore
            .from('payment_events')
            .select('hash')
            .eq('source', 'wa_proof');
          for (const sp of storeProofs ?? []) {
            const parts = (sp.hash ?? '').split(':');
            const msgId = parts[2]; // formato: wa-proof:{orderId}:{panel_message_id}
            if (msgId && panelMsgIds.includes(msgId)) storeProofMsgIds.add(msgId);
          }
        }
      }

      let resumenObj: any = null;
      try { resumenObj = cliente.resumen ? JSON.parse(cliente.resumen) : null; } catch { resumenObj = null; }
      const aiSelected = new Set<string>((Array.isArray(resumenObj?.prendas_seleccionadas) ? resumenObj.prendas_seleccionadas : [])
        .map((p: any) => p?.id).filter(Boolean));

      const photos = photosRaw.map((photo: any) => {
        const ev = evidenceByMessageId.get(photo.id);
        const payment = paymentByMessageId.get(String(photo.id))
          ?? paymentByMediaUrl.get(String(photo.media_url));
        const meta = ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {};
        const selectedByAi = meta.selected_by_ai === true || aiSelected.has(photo.id);
        const selectedFinal = typeof meta.selected_final === 'boolean' ? meta.selected_final : selectedByAi;
        return {
          ...photo,
          tipo: storeProofMsgIds.has(photo.id) || payment ? 'comprobante' : (ev?.tipo ?? null),
          descripcion: payment?.comprobante_texto ?? ev?.descripcion ?? null,
          selected_by_ai: selectedByAi,
          selected_final: selectedFinal,
          selection_source: meta.selection_source ?? (selectedByAi ? 'ai' : null),
        };
      });

      res.json({
        photos,
        cliente_found: true,
        cliente_id: cliente.id,
        pedido_live_id: liveOrder?.id ?? null,
        live_window: liveWindow,
        timeline_steps: Array.isArray(resumenObj?.timeline_steps)
          ? resumenObj.timeline_steps.map((s: unknown) => String(s ?? '').trim()).filter(Boolean).slice(0, 4)
          : [],
        contexto_visual: resumenObj?.contexto_visual ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/whatsapp-photo-selection
  // Guarda la correccion final de prendas desde el detalle del pedido.
  router.post('/whatsapp-photo-selection', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    if (!supabasePanel) return res.status(503).json({ error: 'supabasePanel no configurado' });

    const { phone, mainPedidoId, orderDate, photos = [], contextoVisual } = req.body ?? {};
    if (!phone) return res.status(400).json({ error: 'phone requerido' });

    try {
      const phoneNorm = normalizePhone(String(phone));
      const phoneVariants = [phoneNorm, phoneNorm.replace(/^\+/, '')];
      let cliente: { id: string } | null = null;
      for (const variant of phoneVariants) {
        const { data } = await supabasePanel
          .from('panel_clientes')
          .select('id')
          .eq('phone', variant)
          .limit(1)
          .maybeSingle();
        if (data) { cliente = data; break; }
      }
      if (!cliente) return res.status(404).json({ error: 'Cliente WhatsApp no encontrado' });

      const cleanPhone = phoneNorm.replace(/^\+/, '');
      const fechaPedido = orderDate ? String(orderDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
      const mainPedidoNumber = Number(mainPedidoId);

      let liveOrder: any = null;
      if (Number.isFinite(mainPedidoNumber)) {
        const { data } = await supabasePanel
          .from('pedidos_venta_live')
          .select('*')
          .eq('main_pedido_id', mainPedidoNumber)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        liveOrder = data ?? null;
      }
      if (!liveOrder) {
        const { data } = await supabasePanel
          .from('pedidos_venta_live')
          .select('*')
          .eq('cliente_id', cliente.id)
          .eq('fecha_pedido', fechaPedido)
          .neq('estado', 'archivado')
          .limit(1)
          .maybeSingle();
        liveOrder = data ?? null;
      }
      if (!liveOrder) {
        const { data, error } = await supabasePanel
          .from('pedidos_venta_live')
          .insert({
            cliente_id: cliente.id,
            phone: cleanPhone,
            fecha_pedido: fechaPedido,
            estado: 'procesar',
            main_pedido_id: Number.isFinite(mainPedidoNumber) ? mainPedidoNumber : null,
            is_test: false,
          })
          .select('*')
          .single();
        if (error) throw error;
        liveOrder = data;
      }

      let saved = 0;
      for (const photo of Array.isArray(photos) ? photos : []) {
        if (!photo?.id || !photo?.media_url) continue;
        const selected = photo.selected === true;
        const { data: existing } = await supabasePanel
          .from('evidencias_venta_live')
          .select('id,tipo,metadata')
          .eq('panel_mensaje_id', photo.id)
          .maybeSingle();

        if (!selected && !existing) continue;
        const metadata = {
          ...(existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
          selected_final: selected,
          selection_source: 'operator',
          contexto_visual: contextoVisual ?? null,
        };

        const payload = {
          pedido_live_id: liveOrder.id,
          cliente_id: cliente.id,
          panel_mensaje_id: photo.id,
          tipo: selected ? 'prenda' : (existing?.tipo ?? 'otro'),
          media_url: photo.media_url,
          media_type: photo.media_type ?? null,
          content: photo.content ?? null,
          descripcion: photo.descripcion ?? null,
          message_created_at: photo.created_at ?? null,
          metadata,
        };

        const { error } = await supabasePanel
          .from('evidencias_venta_live')
          .upsert(payload, { onConflict: 'panel_mensaje_id' });
        if (error) throw error;
        saved += 1;
      }

      res.json({ ok: true, pedido_live_id: liveOrder.id, saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/recalculate-confidence
  // Recalcula la confianza de todos los perfiles según canales reales del negocio.
  router.post('/recalculate-confidence', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      const result = await recalculateAllConfidences(supabase, userId);
      res.json({ ok: true, updated: result.updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/identity/stats
  // Resumen general para el panel de feedback
  router.get('/stats', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      const [{ data: profiles }, { data: evidence }] = await Promise.all([
        supabase.from('identity_profiles').select('id, confidence, panel_phone, store_phone, cliente_id').eq('user_id', userId),
        supabase.from('identity_evidence').select('source').eq('user_id', userId),
      ]);
      const bySource: Record<string, number> = {};
      for (const e of evidence ?? []) bySource[e.source] = (bySource[e.source] ?? 0) + 1;
      const lowConfidence = (profiles ?? []).filter(p => p.confidence < 0.7).length;
      const multiChannel = (profiles ?? []).filter(p =>
        [p.panel_phone, p.store_phone, p.cliente_id].filter(Boolean).length >= 2
      ).length;
      res.json({
        total_profiles: (profiles ?? []).length,
        low_confidence: lowConfidence,
        multi_channel: multiChannel,
        evidence_by_source: bySource,
        total_evidence: (evidence ?? []).length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/profiles/:id/merge
  // Fusiona sourceId dentro de targetId: reasigna evidencia y elimina el source.
  router.post('/profiles/:id/merge', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    const { source_id } = req.body;
    if (!source_id) return res.status(400).json({ error: 'source_id requerido' });
    const targetId = req.params.id;
    if (targetId === source_id) return res.status(400).json({ error: 'target y source no pueden ser iguales' });
    try {
      // Verificar que ambos pertenecen al usuario
      const [{ data: target }, { data: source }] = await Promise.all([
        supabase.from('identity_profiles').select('*').eq('id', targetId).eq('user_id', userId).single(),
        supabase.from('identity_profiles').select('*').eq('id', source_id).eq('user_id', userId).single(),
      ]);
      if (!target) return res.status(404).json({ error: 'Perfil destino no encontrado' });
      if (!source) return res.status(404).json({ error: 'Perfil origen no encontrado' });

      // Reasignar toda la evidencia del source al target
      await supabase.from('identity_evidence')
        .update({ profile_id: targetId })
        .eq('profile_id', source_id)
        .eq('user_id', userId);

      // Heredar vínculos faltantes del source
      const updates: Record<string, unknown> = {
        merged_from: [...(target.merged_from ?? []), source_id],
      };
      if (!target.phone && source.phone) updates.phone = source.phone;
      if (!target.panel_phone && source.panel_phone) updates.panel_phone = source.panel_phone;
      if (!target.store_phone && source.store_phone) updates.store_phone = source.store_phone;
      if (!target.cliente_id && source.cliente_id) updates.cliente_id = source.cliente_id;

      await supabase.from('identity_profiles').update(updates).eq('id', targetId);

      // Eliminar el perfil source
      await supabase.from('identity_profiles').delete().eq('id', source_id).eq('user_id', userId);

      const { data: merged } = await supabase.from('identity_profiles').select('*').eq('id', targetId).single();
      res.json({ ok: true, profile: merged });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/identity/evidence/:id/reassign
  // Reasigna una evidencia a otro perfil (corrección de match incorrecto)
  router.patch('/evidence/:id/reassign', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    const { profile_id } = req.body;
    if (!profile_id) return res.status(400).json({ error: 'profile_id requerido' });
    try {
      const { data, error } = await supabase
        .from('identity_evidence')
        .update({ profile_id })
        .eq('id', req.params.id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'Evidencia no encontrada' });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
/**
 * identity.ts
 * Rutas REST para el sistema de identidad y perfiles unificados.
 * Montado en server.ts con: app.use('/api/identity', createIdentityRouter(supabaseServer))
 */

import { Router, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  findOrCreateProfile,
  depositEvidence,
  getProfileWithEvidence,
  listProfiles,
  recalculateAllConfidences,
  normalizePhone,
  normalizeName,
  type EvidenceInput,
} from '../services/identityService.js';

export function createIdentityRouterDuplicate(
  supabase: SupabaseClient,
  supabaseStore?: SupabaseClient,
  supabasePanel?: SupabaseClient,
) {
  const router = Router();

  function uid(req: Request): string | null {
    return (req.headers['x-user-id'] as string) || null;
  }

  function parseLiveSessionNotes(notes: unknown): { startAt: string | null; endAt: string | null; processedAt: string | null } {
    try {
      const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes;
      return {
        startAt: typeof parsed?.started_at === 'string' ? parsed.started_at : null,
        endAt: typeof parsed?.ended_at === 'string' ? parsed.ended_at : typeof parsed?.closed_at === 'string' ? parsed.closed_at : null,
        processedAt: typeof parsed?.processed_at === 'string' ? parsed.processed_at : null,
      };
    } catch {
      return { startAt: null, endAt: null, processedAt: null };
    }
  }

  async function resolveLiveOrderWindow(userId: string, liveOrder: any): Promise<{ from: string; to: string; source: string } | null> {
    if (!liveOrder) return null;

    const { data: evidenceRows } = await supabasePanel!
      .from('evidencias_venta_live')
      .select('metadata')
      .eq('pedido_live_id', liveOrder.id)
      .not('metadata', 'is', null)
      .limit(20);

    for (const row of evidenceRows ?? []) {
      const range = row?.metadata?.live_range;
      if (range?.start_at && range?.end_at) {
        return { from: range.start_at, to: range.end_at, source: 'evidence_live_range' };
      }
    }

    const orderCreated = liveOrder.created_at ? new Date(liveOrder.created_at).getTime() : Date.now();
    const { data: sessions } = await supabase
      .from('live_sessions')
      .select('id,notes,created_at,status,user_id')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(20);

    let best: { from: string; to: string; source: string; distance: number } | null = null;
    for (const session of sessions ?? []) {
      const parsed = parseLiveSessionNotes(session.notes);
      if (!parsed.startAt || !parsed.endAt) continue;
      const processedAt = parsed.processedAt ? new Date(parsed.processedAt).getTime() : new Date(session.created_at).getTime();
      const distance = Math.abs(orderCreated - processedAt);
      if (distance > 8 * 60 * 60 * 1000) continue;
      if (!best || distance < best.distance) {
        best = { from: parsed.startAt, to: parsed.endAt, source: `live_session:${session.id}`, distance };
      }
    }

    return best ? { from: best.from, to: best.to, source: best.source } : null;
  }

  // GET /api/identity/profiles
  // Lista todos los perfiles del usuario. ?search=nombre &limit=50 &offset=0
  router.get('/profiles', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      const profiles = await listProfiles(supabase, userId, {
        limit: parseInt(req.query.limit as string) || 50,
        offset: parseInt(req.query.offset as string) || 0,
        search: req.query.search as string,
        source: req.query.source as string,
      });
      res.json(profiles);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/identity/profiles/:id
  // Perfil completo con historial de evidencia
  router.get('/profiles/:id', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      const result = await getProfileWithEvidence(supabase, userId, req.params.id);
      if (!result) return res.status(404).json({ error: 'Perfil no encontrado' });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/profiles
  // Crear o encontrar perfil por nombre/teléfono. Devuelve el perfil y el tipo de match.
  router.post('/profiles', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    const { name, phone, cliente_id, origin } = req.body;
    if (!name && !phone) return res.status(400).json({ error: 'Se requiere name o phone' });
    try {
      const result = await findOrCreateProfile(supabase, userId, {
        name,
        phone,
        clienteId: cliente_id,
        origin: origin === 'manual' ? 'manual' : 'auto',
      });
      res.status(result.match_type === 'new' ? 201 : 200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/identity/profiles/:id
  // Editar nombre canónico, teléfono u otros campos del perfil
  router.patch('/profiles/:id', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    const { display_name, phone, store_phone, panel_phone, cliente_id } = req.body;
    const updates: Record<string, unknown> = {};
    if (display_name !== undefined) updates.display_name = display_name;
    if (phone !== undefined) updates.phone = normalizePhone(phone);
    if (store_phone !== undefined) updates.store_phone = store_phone;
    if (panel_phone !== undefined) updates.panel_phone = panel_phone;
    if (cliente_id !== undefined) updates.cliente_id = cliente_id;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }
    try {
      const { data, error } = await supabase
        .from('identity_profiles')
        .update(updates)
        .eq('id', req.params.id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'Perfil no encontrado' });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/profiles/:id/evidence
  // Depositar evidencia manualmente (para pruebas o integraciones futuras)
  router.post('/profiles/:id/evidence', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    const { source, source_id, event_type, amount, phone, name_raw, event_at, payload } = req.body;
    if (!source || !event_type) {
      return res.status(400).json({ error: 'source y event_type requeridos' });
    }
    try {
      const evidence = await depositEvidence(supabase, userId, req.params.id, {
        source, source_id, event_type, amount, phone, name_raw, event_at, payload,
      } as EvidenceInput);
      res.status(201).json(evidence);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/identity/evidence?source=manual_payment&limit=20
  // Listar evidencia con filtros
  router.get('/evidence', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      let query = supabase
        .from('identity_evidence')
        .select('*')
        .eq('user_id', userId)
        .order('event_at', { ascending: false });
      if (req.query.source) query = query.eq('source', req.query.source as string);
      if (req.query.profile_id) query = query.eq('profile_id', req.query.profile_id as string);
      const limit = parseInt(req.query.limit as string) || 50;
      query = query.limit(limit);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/resolve
  // Dado nombre y/o teléfono, devuelve el perfil que le corresponde (sin crearlo si no existe).
  router.post('/resolve', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    const { name, phone } = req.body;
    if (!name && !phone) return res.status(400).json({ error: 'Se requiere name o phone' });

    try {
      const phoneNorm = phone ? normalizePhone(phone) : null;
      const nameNorm = name ? normalizeName(name) : null;

      // Buscar sin crear
      let query = supabase.from('identity_profiles').select('*').eq('user_id', userId);
      if (phoneNorm) {
        const { data } = await query.eq('phone', phoneNorm).limit(1).single();
        if (data) return res.json({ profile: data, confidence: 1.0, match_type: 'phone_exact' });
      }
      if (nameNorm) {
        const { data: profiles } = await supabase
          .from('identity_profiles').select('*').eq('user_id', userId);
        const exact = profiles?.find(p => normalizeName(p.display_name) === nameNorm);
        if (exact) return res.json({ profile: exact, confidence: 0.85, match_type: 'name_exact' });
      }

      res.status(404).json({ error: 'Sin coincidencia' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/sync-store
  // Backfill de pedidos de la tienda online → identity_evidence
  router.post('/sync-store', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    if (!supabaseStore) return res.status(503).json({ error: 'supabaseStore no configurado' });
    try {
      const { data: existing } = await supabase
        .from('identity_evidence').select('source_id').eq('user_id', userId).eq('source', 'store_order');
      const syncedIds = new Set((existing ?? []).map(e => e.source_id));

      const { data: orders, error } = await supabaseStore
        .from('store_orders')
        .select('id, customer_name, customer_wa, total, status, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) return res.status(500).json({ error: error.message });

      let created = 0; let skipped = 0;
      for (const o of orders ?? []) {
        const orderId = String(o.id);
        if (syncedIds.has(orderId)) { skipped++; continue; }
        const result = await findOrCreateProfile(supabase, userId, {
          name: o.customer_name,
          phone: o.customer_wa,
        });
        // Vincular store_phone si no está aún
        if (o.customer_wa && !result.profile.store_phone) {
          await supabase.from('identity_profiles')
            .update({ store_phone: normalizePhone(o.customer_wa) })
            .eq('id', result.profile.id);
        }
        await depositEvidence(supabase, userId, result.profile.id, {
          source: 'store_order',
          source_id: orderId,
          event_type: 'order',
          amount: o.total,
          phone: o.customer_wa,
          name_raw: o.customer_name,
          event_at: o.created_at,
          payload: { status: o.status },
        });
        created++;
      }
      await recalculateAllConfidences(supabase, userId);
      res.json({ ok: true, created, skipped, total: (orders ?? []).length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/sync-whatsapp
  // Backfill de contactos del panel de WhatsApp → identity_evidence
  router.post('/sync-whatsapp', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    if (!supabasePanel) return res.status(503).json({ error: 'supabasePanel no configurado' });
    try {
      const { data: existing } = await supabase
        .from('identity_evidence').select('source_id').eq('user_id', userId).eq('source', 'whatsapp');
      const syncedIds = new Set((existing ?? []).map(e => e.source_id));

      const { data: clientes, error } = await supabasePanel
        .from('panel_clientes')
        .select('id, phone, nombre, last_interaction, created_at')
        .order('last_interaction', { ascending: false })
        .limit(500);
      if (error) return res.status(500).json({ error: error.message });

      let created = 0; let skipped = 0;
      for (const c of clientes ?? []) {
        const clienteId = String(c.id);
        if (syncedIds.has(clienteId)) { skipped++; continue; }
        const result = await findOrCreateProfile(supabase, userId, {
          name: c.nombre,
          phone: c.phone,
        });
        // Vincular panel_phone si no está aún
        if (c.phone && !result.profile.panel_phone) {
          await supabase.from('identity_profiles')
            .update({ panel_phone: normalizePhone(c.phone) })
            .eq('id', result.profile.id);
        }
        await depositEvidence(supabase, userId, result.profile.id, {
          source: 'whatsapp',
          source_id: clienteId,
          source_ref: c.phone,
          event_type: 'contact',
          phone: c.phone,
          name_raw: c.nombre,
          event_at: c.last_interaction ?? c.created_at,
          payload: {},
        });
        created++;
      }
      await recalculateAllConfidences(supabase, userId);
      res.json({ ok: true, created, skipped, total: (clientes ?? []).length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/sync-pagos
  // Backfill: lee pagos sin evidencia y los ingesta. Idempotente.
  // Útil para retroalimentar pagos de MacroDroid anteriores al sistema de identidad.
  router.post('/sync-pagos', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      // IDs de pagos que ya tienen evidencia
      const { data: existing } = await supabase
        .from('identity_evidence')
        .select('source_id')
        .eq('user_id', userId)
        .in('source', ['manual_payment', 'macrodroid']);
      const syncedIds = new Set((existing ?? []).map(e => e.source_id));

      // Pagos del usuario
      const { data: pagos, error } = await supabase
        .from('pagos')
        .select('id, nombre, pago, method, date, customer_id')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(500);
      if (error) return res.status(500).json({ error: error.message });

      let created = 0;
      let skipped = 0;
      for (const p of pagos ?? []) {
        const pagoId = String(p.id);
        if (syncedIds.has(pagoId)) { skipped++; continue; }
        const source = p.method === 'Notificación bancaria' ? 'macrodroid' : 'manual_payment';
        const result = await findOrCreateProfile(supabase, userId, {
          name: p.nombre,
          clienteId: p.customer_id ?? undefined,
        });
        await depositEvidence(supabase, userId, result.profile.id, {
          source,
          source_id: pagoId,
          event_type: 'payment',
          amount: p.pago,
          name_raw: p.nombre,
          event_at: p.date,
          payload: { customer_id: p.customer_id, method: p.method },
        });
        created++;
      }

      await recalculateAllConfidences(supabase, userId);
      res.json({ ok: true, created, skipped, total: (pagos ?? []).length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/identity/whatsapp-photos?phone=+591...&date=2026-04-20&days=4
  // Fotos enviadas por un cliente de WhatsApp cerca de la fecha del pedido.
  router.get('/whatsapp-photos', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    if (!supabasePanel) return res.status(503).json({ error: 'supabasePanel no configurado' });

    const { phone, date, days = '4', mainPedidoId } = req.query as Record<string, string>;
    if (!phone) return res.status(400).json({ error: 'phone requerido' });

    try {
      const phoneNorm = normalizePhone(phone);
      const mainPedidoNumber = Number(mainPedidoId);

      let liveOrder: any = null;
      if (Number.isFinite(mainPedidoNumber)) {
        const { data } = await supabasePanel
          .from('pedidos_venta_live')
          .select('id, main_pedido_id, fecha_pedido, cliente_id')
          .eq('main_pedido_id', mainPedidoNumber)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        liveOrder = data ?? null;
      }

      let cliente: { id: string; resumen?: string | null } | null = null;
      if (liveOrder?.cliente_id) {
        const { data } = await supabasePanel
          .from('panel_clientes')
          .select('id,resumen')
          .eq('id', liveOrder.cliente_id)
          .maybeSingle();
        cliente = data ?? null;
      }

      if (!cliente) {
        // El panel guarda teléfonos sin '+' (ej: 59170000000)
        // Buscamos con y sin el prefijo '+' para tolerancia de formato.
        const phoneVariants = [phoneNorm, phoneNorm.replace(/^\+/, '')];
        for (const variant of phoneVariants) {
          const { data } = await supabasePanel
            .from('panel_clientes')
            .select('id,resumen')
            .eq('phone', variant)
            .limit(1)
            .maybeSingle();
          if (data) { cliente = data; break; }
        }
      }

      if (!cliente) return res.json({ photos: [], cliente_found: false });

      if (!liveOrder) {
        const fechaPedido = date ? String(date).slice(0, 10) : null;
        let q = supabasePanel
          .from('pedidos_venta_live')
          .select('id, main_pedido_id, fecha_pedido')
          .eq('cliente_id', cliente.id)
          .neq('estado', 'archivado')
          .order('fecha_pedido', { ascending: false })
          .limit(1);
        if (fechaPedido) q = q.eq('fecha_pedido', fechaPedido) as typeof q;
        const { data } = await q.maybeSingle();
        liveOrder = data ?? null;
      }

      const liveWindow = await resolveLiveOrderWindow(userId, liveOrder);
      const pivot = date ? new Date(date) : (liveOrder?.fecha_pedido ? new Date(liveOrder.fecha_pedido) : new Date());
      const rangeMs = parseInt(days) * 24 * 60 * 60 * 1000;
      const from = liveWindow?.from ?? new Date(pivot.getTime() - rangeMs).toISOString();
      const to = liveWindow?.to ?? new Date(pivot.getTime() + rangeMs).toISOString();

      const mensajesQuery = supabasePanel
        .from('panel_mensajes')
        .select('id, media_url, media_type, direction, created_at, content')
        .eq('cliente_id', cliente.id)
        .eq('has_media', true)
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false })
        .limit(30);

      // Un comprobante pendiente puede pertenecer a un mensaje recibido fuera
      // de la ventana del pedido anterior. Lo incluimos por su vínculo directo
      // con pagos_venta_live para que nunca termine mezclado con las prendas.
      const pagosPendientesQuery = supabasePanel
        .from('pagos_venta_live')
        .select('panel_mensaje_id, comprobante_media_url, comprobante_texto, estado, created_at')
        .eq('cliente_id', cliente.id)
        .in('estado', ['pendiente_whatsapp', 'revision_manual'])
        .order('created_at', { ascending: false })
        .limit(30);

      const evidenciasQuery = liveOrder?.id
        ? supabasePanel
          .from('evidencias_venta_live')
          .select('panel_mensaje_id,tipo,descripcion,metadata')
          .eq('pedido_live_id', liveOrder.id)
          .not('panel_mensaje_id', 'is', null)
        : Promise.resolve({ data: [] as any[] });

      const [{ data: mensajes }, { data: evidencias }, { data: pagosPendientes }] = await Promise.all([
        mensajesQuery,
        evidenciasQuery,
        pagosPendientesQuery,
      ]);

      const pendingMessageIds = (pagosPendientes ?? [])
        .map((p: any) => p.panel_mensaje_id)
        .filter(Boolean);
      const pendingMediaUrls = (pagosPendientes ?? [])
        .map((p: any) => p.comprobante_media_url)
        .filter(Boolean);

      const [{ data: pendingMessagesById }, { data: pendingMessagesByMedia }] = await Promise.all([
        pendingMessageIds.length > 0
          ? supabasePanel
            .from('panel_mensajes')
            .select('id, media_url, media_type, direction, created_at, content')
            .in('id', pendingMessageIds)
          : Promise.resolve({ data: [] as any[] }),
        pendingMediaUrls.length > 0
          ? supabasePanel
            .from('panel_mensajes')
            .select('id, media_url, media_type, direction, created_at, content')
            .in('media_url', pendingMediaUrls)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const uniqueMessages = new Map<string, any>();
      for (const message of [
        ...(mensajes ?? []),
        ...(pendingMessagesById ?? []),
        ...(pendingMessagesByMedia ?? []),
      ]) {
        if (message?.id) uniqueMessages.set(String(message.id), message);
      }

      const photosRaw = [...uniqueMessages.values()].filter(m =>
        m.media_url && (
          (m.media_type && m.media_type.startsWith('image/')) ||
          /\.(jpg|jpeg|png|webp)/i.test(m.media_url)
        )
      );

      const evidenceByMessageId = new Map<string, any>();
      for (const ev of evidencias ?? []) {
        if (ev.panel_mensaje_id) evidenceByMessageId.set(ev.panel_mensaje_id, ev);
      }

      const paymentByMessageId = new Map<string, any>();
      const paymentByMediaUrl = new Map<string, any>();
      for (const payment of pagosPendientes ?? []) {
        if (payment.panel_mensaje_id) paymentByMessageId.set(String(payment.panel_mensaje_id), payment);
        if (payment.comprobante_media_url) paymentByMediaUrl.set(String(payment.comprobante_media_url), payment);
      }

      // Marcar comprobantes de tienda: fotos que la tienda usó como prueba de pago
      // pero que no tienen evidencia Live. Sin este cruce quedan con tipo=null
      // y pasan como "prendas" en el selector de fotos.
      const storeProofMsgIds = new Set<string>();
      if (supabaseStore) {
        const panelMsgIds = photosRaw.map((m: any) => m.id);
        if (panelMsgIds.length > 0) {
          const { data: storeProofs } = await supabaseStore
            .from('payment_events')
            .select('hash')
            .eq('source', 'wa_proof');
          for (const sp of storeProofs ?? []) {
            const parts = (sp.hash ?? '').split(':');
            const msgId = parts[2]; // formato: wa-proof:{orderId}:{panel_message_id}
            if (msgId && panelMsgIds.includes(msgId)) storeProofMsgIds.add(msgId);
          }
        }
      }

      let resumenObj: any = null;
      try { resumenObj = cliente.resumen ? JSON.parse(cliente.resumen) : null; } catch { resumenObj = null; }
      const aiSelected = new Set<string>((Array.isArray(resumenObj?.prendas_seleccionadas) ? resumenObj.prendas_seleccionadas : [])
        .map((p: any) => p?.id).filter(Boolean));

      const photos = photosRaw.map((photo: any) => {
        const ev = evidenceByMessageId.get(photo.id);
        const payment = paymentByMessageId.get(String(photo.id))
          ?? paymentByMediaUrl.get(String(photo.media_url));
        const meta = ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {};
        const selectedByAi = meta.selected_by_ai === true || aiSelected.has(photo.id);
        const selectedFinal = typeof meta.selected_final === 'boolean' ? meta.selected_final : selectedByAi;
        return {
          ...photo,
          tipo: storeProofMsgIds.has(photo.id) || payment ? 'comprobante' : (ev?.tipo ?? null),
          descripcion: payment?.comprobante_texto ?? ev?.descripcion ?? null,
          selected_by_ai: selectedByAi,
          selected_final: selectedFinal,
          selection_source: meta.selection_source ?? (selectedByAi ? 'ai' : null),
        };
      });

      res.json({
        photos,
        cliente_found: true,
        cliente_id: cliente.id,
        pedido_live_id: liveOrder?.id ?? null,
        live_window: liveWindow,
        timeline_steps: Array.isArray(resumenObj?.timeline_steps)
          ? resumenObj.timeline_steps.map((s: unknown) => String(s ?? '').trim()).filter(Boolean).slice(0, 4)
          : [],
        contexto_visual: resumenObj?.contexto_visual ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/whatsapp-photo-selection
  // Guarda la correccion final de prendas desde el detalle del pedido.
  router.post('/whatsapp-photo-selection', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    if (!supabasePanel) return res.status(503).json({ error: 'supabasePanel no configurado' });

    const { phone, mainPedidoId, orderDate, photos = [], contextoVisual } = req.body ?? {};
    if (!phone) return res.status(400).json({ error: 'phone requerido' });

    try {
      const phoneNorm = normalizePhone(String(phone));
      const phoneVariants = [phoneNorm, phoneNorm.replace(/^\+/, '')];
      let cliente: { id: string } | null = null;
      for (const variant of phoneVariants) {
        const { data } = await supabasePanel
          .from('panel_clientes')
          .select('id')
          .eq('phone', variant)
          .limit(1)
          .maybeSingle();
        if (data) { cliente = data; break; }
      }
      if (!cliente) return res.status(404).json({ error: 'Cliente WhatsApp no encontrado' });

      const cleanPhone = phoneNorm.replace(/^\+/, '');
      const fechaPedido = orderDate ? String(orderDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
      const mainPedidoNumber = Number(mainPedidoId);

      let liveOrder: any = null;
      if (Number.isFinite(mainPedidoNumber)) {
        const { data } = await supabasePanel
          .from('pedidos_venta_live')
          .select('*')
          .eq('main_pedido_id', mainPedidoNumber)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        liveOrder = data ?? null;
      }
      if (!liveOrder) {
        const { data } = await supabasePanel
          .from('pedidos_venta_live')
          .select('*')
          .eq('cliente_id', cliente.id)
          .eq('fecha_pedido', fechaPedido)
          .neq('estado', 'archivado')
          .limit(1)
          .maybeSingle();
        liveOrder = data ?? null;
      }
      if (!liveOrder) {
        const { data, error } = await supabasePanel
          .from('pedidos_venta_live')
          .insert({
            cliente_id: cliente.id,
            phone: cleanPhone,
            fecha_pedido: fechaPedido,
            estado: 'procesar',
            main_pedido_id: Number.isFinite(mainPedidoNumber) ? mainPedidoNumber : null,
            is_test: false,
          })
          .select('*')
          .single();
        if (error) throw error;
        liveOrder = data;
      }

      let saved = 0;
      for (const photo of Array.isArray(photos) ? photos : []) {
        if (!photo?.id || !photo?.media_url) continue;
        const selected = photo.selected === true;
        const { data: existing } = await supabasePanel
          .from('evidencias_venta_live')
          .select('id,tipo,metadata')
          .eq('panel_mensaje_id', photo.id)
          .maybeSingle();

        if (!selected && !existing) continue;
        const metadata = {
          ...(existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
          selected_final: selected,
          selection_source: 'operator',
          contexto_visual: contextoVisual ?? null,
        };

        const payload = {
          pedido_live_id: liveOrder.id,
          cliente_id: cliente.id,
          panel_mensaje_id: photo.id,
          tipo: selected ? 'prenda' : (existing?.tipo ?? 'otro'),
          media_url: photo.media_url,
          media_type: photo.media_type ?? null,
          content: photo.content ?? null,
          descripcion: photo.descripcion ?? null,
          message_created_at: photo.created_at ?? null,
          metadata,
        };

        const { error } = await supabasePanel
          .from('evidencias_venta_live')
          .upsert(payload, { onConflict: 'panel_mensaje_id' });
        if (error) throw error;
        saved += 1;
      }

      res.json({ ok: true, pedido_live_id: liveOrder.id, saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/recalculate-confidence
  // Recalcula la confianza de todos los perfiles según canales reales del negocio.
  router.post('/recalculate-confidence', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      const result = await recalculateAllConfidences(supabase, userId);
      res.json({ ok: true, updated: result.updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/identity/stats
  // Resumen general para el panel de feedback
  router.get('/stats', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    try {
      const [{ data: profiles }, { data: evidence }] = await Promise.all([
        supabase.from('identity_profiles').select('id, confidence, panel_phone, store_phone, cliente_id').eq('user_id', userId),
        supabase.from('identity_evidence').select('source').eq('user_id', userId),
      ]);
      const bySource: Record<string, number> = {};
      for (const e of evidence ?? []) bySource[e.source] = (bySource[e.source] ?? 0) + 1;
      const lowConfidence = (profiles ?? []).filter(p => p.confidence < 0.7).length;
      const multiChannel = (profiles ?? []).filter(p =>
        [p.panel_phone, p.store_phone, p.cliente_id].filter(Boolean).length >= 2
      ).length;
      res.json({
        total_profiles: (profiles ?? []).length,
        low_confidence: lowConfidence,
        multi_channel: multiChannel,
        evidence_by_source: bySource,
        total_evidence: (evidence ?? []).length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/identity/profiles/:id/merge
  // Fusiona sourceId dentro de targetId: reasigna evidencia y elimina el source.
  router.post('/profiles/:id/merge', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    const { source_id } = req.body;
    if (!source_id) return res.status(400).json({ error: 'source_id requerido' });
    const targetId = req.params.id;
    if (targetId === source_id) return res.status(400).json({ error: 'target y source no pueden ser iguales' });
    try {
      // Verificar que ambos pertenecen al usuario
      const [{ data: target }, { data: source }] = await Promise.all([
        supabase.from('identity_profiles').select('*').eq('id', targetId).eq('user_id', userId).single(),
        supabase.from('identity_profiles').select('*').eq('id', source_id).eq('user_id', userId).single(),
      ]);
      if (!target) return res.status(404).json({ error: 'Perfil destino no encontrado' });
      if (!source) return res.status(404).json({ error: 'Perfil origen no encontrado' });

      // Reasignar toda la evidencia del source al target
      await supabase.from('identity_evidence')
        .update({ profile_id: targetId })
        .eq('profile_id', source_id)
        .eq('user_id', userId);

      // Heredar vínculos faltantes del source
      const updates: Record<string, unknown> = {
        merged_from: [...(target.merged_from ?? []), source_id],
      };
      if (!target.phone && source.phone) updates.phone = source.phone;
      if (!target.panel_phone && source.panel_phone) updates.panel_phone = source.panel_phone;
      if (!target.store_phone && source.store_phone) updates.store_phone = source.store_phone;
      if (!target.cliente_id && source.cliente_id) updates.cliente_id = source.cliente_id;

      await supabase.from('identity_profiles').update(updates).eq('id', targetId);

      // Eliminar el perfil source
      await supabase.from('identity_profiles').delete().eq('id', source_id).eq('user_id', userId);

      const { data: merged } = await supabase.from('identity_profiles').select('*').eq('id', targetId).single();
      res.json({ ok: true, profile: merged });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/identity/evidence/:id/reassign
  // Reasigna una evidencia a otro perfil (corrección de match incorrecto)
  router.patch('/evidence/:id/reassign', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    const { profile_id } = req.body;
    if (!profile_id) return res.status(400).json({ error: 'profile_id requerido' });
    try {
      const { data, error } = await supabase
        .from('identity_evidence')
        .update({ profile_id })
        .eq('id', req.params.id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'Evidencia no encontrada' });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
