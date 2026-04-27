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

    const { phone, date, days = '4' } = req.query as Record<string, string>;
    if (!phone) return res.status(400).json({ error: 'phone requerido' });

    try {
      const phoneNorm = normalizePhone(phone);

      // El panel guarda teléfonos sin '+' (ej: 59170000000)
      // Buscamos con y sin el prefijo '+' para tolerancia de formato
      const phoneVariants = [phoneNorm, phoneNorm.replace(/^\+/, '')];
      let cliente: { id: string } | null = null;
      for (const variant of phoneVariants) {
        const { data } = await supabasePanel
          .from('panel_clientes')
          .select('id')
          .eq('phone', variant)
          .limit(1)
          .single();
        if (data) { cliente = data; break; }
      }

      if (!cliente) return res.json({ photos: [], cliente_found: false });

      // Rango de fechas
      const pivot = date ? new Date(date) : new Date();
      const rangeMs = parseInt(days) * 24 * 60 * 60 * 1000;
      const from = new Date(pivot.getTime() - rangeMs).toISOString();
      const to   = new Date(pivot.getTime() + rangeMs).toISOString();

      const { data: mensajes } = await supabasePanel
        .from('panel_mensajes')
        .select('id, media_url, media_type, direction, created_at, content')
        .eq('cliente_id', cliente.id)
        .eq('has_media', true)
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false })
        .limit(30);

      const photos = (mensajes ?? []).filter(m =>
        m.media_url && (
          (m.media_type && m.media_type.startsWith('image/')) ||
          /\.(jpg|jpeg|png|webp)/i.test(m.media_url)
        )
      );

      res.json({ photos, cliente_found: true, cliente_id: cliente.id });
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
