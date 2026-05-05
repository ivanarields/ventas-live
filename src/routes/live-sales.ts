/**
 * Rutas para tarjetas temporales de venta live en el Panel WhatsApp.
 *
 * Fase 1: estas rutas solo escriben en la base del Panel WhatsApp.
 * No crean pagos, pedidos, clientes principales ni casilleros.
 */

import { Router, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureMainCustomerForLive,
  ensureMainDailyPedido,
  namesMatch,
  normalizeLivePhone,
  parseLiveMonto,
  recomputeLiveOrderTotals,
  syncMainPedidoForLiveOrder,
} from '../services/liveSalesService.js';

const ESTADOS_TARJETA = [
  'conversacion',
  'comprobante_recibido',
  'esperando_macrodroid',
  'revision_manual',
  'archivado',
] as const;

type EstadoTarjeta = typeof ESTADOS_TARJETA[number];

function uid(req: Request): string | null {
  return (req.headers['x-user-id'] as string) || null;
}

function normalizePanelPhone(raw: unknown): string | null {
  return normalizeLivePhone(raw);
}

function parseMonto(raw: unknown): number | null {
  return parseLiveMonto(raw);
}

function whatsappMediaPath(raw: unknown): string | null {
  if (!raw) return null;
  const value = String(raw);
  const marker = '/object/public/whatsapp-media/';
  const markerIndex = value.indexOf(marker);
  if (markerIndex >= 0) return value.slice(markerIndex + marker.length).split('?')[0] || null;
  if (!value.startsWith('http') && value.includes('/')) return value.replace(/^whatsapp-media\//, '');
  return null;
}

async function deleteWhatsappMediaFiles(panelDb: SupabaseClient, urls: unknown[]) {
  const paths = [...new Set(urls.map(whatsappMediaPath).filter(Boolean) as string[])];
  if (paths.length === 0) return 0;

  let deleted = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { data, error } = await panelDb.storage.from('whatsapp-media').remove(chunk);
    if (error) throw error;
    deleted += data?.length ?? chunk.length;
  }
  return deleted;
}

function normalizeEstado(raw: unknown, fallback: EstadoTarjeta): EstadoTarjeta {
  return ESTADOS_TARJETA.includes(raw as EstadoTarjeta) ? raw as EstadoTarjeta : fallback;
}

function normalizeResumen(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { texto: raw };
    } catch {
      return { texto: raw };
    }
  }
  return typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

async function findExistingMainPayment(
  supabaseMain: SupabaseClient,
  input: {
    userId: string;
    customerId: number;
    nombre: string;
    monto: number;
    centerAt?: string | null;
  },
) {
  const center = input.centerAt ? new Date(input.centerAt).getTime() : Date.now();
  const safeCenter = Number.isFinite(center) ? center : Date.now();
  const from = new Date(safeCenter - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(safeCenter + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseMain
    .from('pagos')
    .select('id,nombre,pago,date,created_at,customer_id,method')
    .eq('user_id', input.userId)
    .eq('pago', input.monto)
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;

  return (data ?? []).find((p: any) => {
    if (Number(p.customer_id) === Number(input.customerId)) return true;
    return namesMatch(p.nombre, input.nombre);
  }) ?? null;
}

function buildCardPayload(body: any, fallbackEstado: EstadoTarjeta) {
  const phone = normalizePanelPhone(body.phone);
  const estado = normalizeEstado(body.estado, fallbackEstado);

  return {
    cliente_id: body.clienteId ?? body.cliente_id ?? null,
    phone,
    nombre_detectado: body.nombreDetectado ?? body.nombre_detectado ?? null,
    monto_detectado: parseMonto(body.montoDetectado ?? body.monto_detectado),
    resumen: normalizeResumen(body.resumen),
    comprobante_texto: body.comprobanteTexto ?? body.comprobante_texto ?? null,
    comprobante_media_url: body.comprobanteMediaUrl ?? body.comprobante_media_url ?? null,
    estado,
    is_test: body.isTest ?? body.is_test ?? true,
  };
}

export function createLiveSalesRouter(supabasePanel: SupabaseClient, supabaseMain?: SupabaseClient, supabaseStore?: SupabaseClient) {
  const router = Router();

  async function listDayOrders(filters: {
    clienteId?: string | null;
    phone?: string | null;
    fecha?: string | null;
    includeArchived?: boolean;
  }) {
    let query = supabasePanel
      .from('pedidos_venta_live')
      .select('*')
      .order('fecha_pedido', { ascending: false })
      .order('updated_at', { ascending: false });

    if (filters.clienteId) query = query.eq('cliente_id', filters.clienteId);
    if (filters.phone) query = query.eq('phone', filters.phone);
    if (filters.fecha) query = query.eq('fecha_pedido', filters.fecha);
    if (!filters.includeArchived) query = query.neq('estado', 'archivado');

    const { data: orders, error } = await query;
    if (error) throw error;

    const ids = (orders ?? []).map((order: any) => order.id);
    if (ids.length === 0) return [];

    const [{ data: pagos, error: pagosError }, { data: evidencias, error: evidenciasError }] = await Promise.all([
      supabasePanel
        .from('pagos_venta_live')
        .select('*')
        .in('pedido_live_id', ids)
        .order('comprobante_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabasePanel
        .from('evidencias_venta_live')
        .select('*')
        .in('pedido_live_id', ids)
        .order('message_created_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
    ]);
    if (pagosError) throw pagosError;
    if (evidenciasError) throw evidenciasError;

    return (orders ?? []).map((order: any) => ({
      ...order,
      pagos: (pagos ?? []).filter((p: any) => p.pedido_live_id === order.id),
      evidencias: (evidencias ?? []).filter((e: any) => e.pedido_live_id === order.id),
    }));
  }

  async function recomputeAndSync(userId: string, pedidoLiveId: string) {
    let order = await recomputeLiveOrderTotals(supabasePanel, pedidoLiveId);
    if (supabaseMain) {
      order = await syncMainPedidoForLiveOrder(supabasePanel, supabaseMain, userId, order);
    }
    return order;
  }

  router.get('/cards', async (req: Request, res: Response) => {
    if (!uid(req)) return res.status(401).json({ error: 'x-user-id requerido' });

    try {
      const clienteId = req.query.clienteId ?? req.query.cliente_id;
      const phone = normalizePanelPhone(req.query.phone);
      const includeArchived = req.query.includeArchived === 'true';

      let query = supabasePanel
        .from('tarjetas_venta_live')
        .select('*')
        .order('updated_at', { ascending: false });

      if (clienteId) query = query.eq('cliente_id', String(clienteId));
      if (phone) query = query.eq('phone', phone);
      if (!includeArchived) query = query.neq('estado', 'archivado');

      const { data, error } = await query;
      if (error) throw error;
      res.json({ ok: true, cards: data ?? [] });
    } catch (err: any) {
      console.error('[live-sales/cards:get]', err);
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  router.post('/cards', async (req: Request, res: Response) => {
    if (!uid(req)) return res.status(401).json({ error: 'x-user-id requerido' });

    try {
      const payload = buildCardPayload(req.body, 'conversacion');
      if (!payload.phone) return res.status(400).json({ error: 'phone requerido' });
      if (!payload.cliente_id) return res.status(400).json({ error: 'clienteId requerido' });

      const { data: existing, error: existingError } = await supabasePanel
        .from('tarjetas_venta_live')
        .select('*')
        .eq('phone', payload.phone)
        .neq('estado', 'archivado')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        const { data, error } = await supabasePanel
          .from('tarjetas_venta_live')
          .update(payload)
          .eq('id', existing.id)
          .select('*')
          .single();

        if (error) throw error;
        return res.json({ ok: true, card: data });
      }

      const { data, error } = await supabasePanel
        .from('tarjetas_venta_live')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;
      res.status(201).json({ ok: true, card: data });
    } catch (err: any) {
      console.error('[live-sales/cards:post]', err);
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  router.patch('/cards/:id', async (req: Request, res: Response) => {
    if (!uid(req)) return res.status(401).json({ error: 'x-user-id requerido' });

    try {
      const payload: Record<string, unknown> = {};

      if ('clienteId' in req.body || 'cliente_id' in req.body) payload.cliente_id = req.body.clienteId ?? req.body.cliente_id;
      if ('phone' in req.body) {
        const phone = normalizePanelPhone(req.body.phone);
        if (!phone) return res.status(400).json({ error: 'phone invalido' });
        payload.phone = phone;
      }
      if ('nombreDetectado' in req.body || 'nombre_detectado' in req.body) payload.nombre_detectado = req.body.nombreDetectado ?? req.body.nombre_detectado ?? null;
      if ('montoDetectado' in req.body || 'monto_detectado' in req.body) payload.monto_detectado = parseMonto(req.body.montoDetectado ?? req.body.monto_detectado);
      if ('resumen' in req.body) payload.resumen = normalizeResumen(req.body.resumen);
      if ('comprobanteTexto' in req.body || 'comprobante_texto' in req.body) payload.comprobante_texto = req.body.comprobanteTexto ?? req.body.comprobante_texto ?? null;
      if ('comprobanteMediaUrl' in req.body || 'comprobante_media_url' in req.body) payload.comprobante_media_url = req.body.comprobanteMediaUrl ?? req.body.comprobante_media_url ?? null;
      if ('estado' in req.body) payload.estado = normalizeEstado(req.body.estado, 'revision_manual');
      if ('isTest' in req.body || 'is_test' in req.body) payload.is_test = req.body.isTest ?? req.body.is_test;

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ error: 'No hay cambios para guardar' });
      }

      const { data, error } = await supabasePanel
        .from('tarjetas_venta_live')
        .update(payload)
        .eq('id', req.params.id)
        .select('*')
        .single();

      if (error) throw error;
      res.json({ ok: true, card: data });
    } catch (err: any) {
      console.error('[live-sales/cards:patch]', err);
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  router.post('/cards/:id/archive', async (req: Request, res: Response) => {
    if (!uid(req)) return res.status(401).json({ error: 'x-user-id requerido' });

    try {
      const { data, error } = await supabasePanel
        .from('tarjetas_venta_live')
        .update({ estado: 'archivado' })
        .eq('id', req.params.id)
        .select('*')
        .single();

      if (error) throw error;
      res.json({ ok: true, card: data });
    } catch (err: any) {
      console.error('[live-sales/cards:archive]', err);
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  router.get('/day-orders', async (req: Request, res: Response) => {
    if (!uid(req)) return res.status(401).json({ error: 'x-user-id requerido' });

    try {
      const clienteId = req.query.clienteId ?? req.query.cliente_id;
      const phone = normalizePanelPhone(req.query.phone);
      const fecha = req.query.fecha ? String(req.query.fecha) : null;
      const includeArchived = req.query.includeArchived === 'true';

      const orders = await listDayOrders({
        clienteId: clienteId ? String(clienteId) : null,
        phone,
        fecha,
        includeArchived,
      });
      res.json({ ok: true, orders });
    } catch (err: any) {
      console.error('[live-sales/day-orders:get]', err);
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  router.post('/payments/:id/verify-manual', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });
    if (!supabaseMain) return res.status(503).json({ error: 'Base principal no configurada' });

    try {
      const { data: pagoLive, error: pagoError } = await supabasePanel
        .from('pagos_venta_live')
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (pagoError) throw pagoError;

      const monto = parseMonto(pagoLive.monto);
      if (!monto || monto <= 0) return res.status(400).json({ error: 'El pago no tiene monto valido' });

      const { data: pedidoLive, error: orderError } = await supabasePanel
        .from('pedidos_venta_live')
        .select('*')
        .eq('id', pagoLive.pedido_live_id)
        .single();
      if (orderError) throw orderError;

      const nombre = pagoLive.nombre_detectado || pedidoLive.nombre_detectado;
      if (!nombre) return res.status(400).json({ error: 'Falta nombre detectado para verificar manualmente' });
      const customer = await ensureMainCustomerForLive(supabaseMain, userId, nombre, pagoLive.phone);
      await ensureMainDailyPedido(supabaseMain, {
        userId,
        customerId: Number(customer.id),
        customerName: customer.full_name || nombre,
        fechaPedido: pagoLive.fecha_pedido,
        totalAmount: parseMonto(pedidoLive.total_comprobantes) ?? monto,
      });

      let mainPagoId = pagoLive.main_pago_id ? Number(pagoLive.main_pago_id) : null;
      let reusedExistingPayment = !!mainPagoId;
      if (!mainPagoId) {
        const existingPago = await findExistingMainPayment(supabaseMain, {
          userId,
          customerId: Number(customer.id),
          nombre,
          monto,
          centerAt: pagoLive.comprobante_at ?? pagoLive.created_at,
        });

        if (existingPago) {
          mainPagoId = Number(existingPago.id);
          reusedExistingPayment = true;
        } else {
          const { data: pagoMain, error: mainPagoError } = await supabaseMain
            .from('pagos')
            .insert({
              nombre,
              pago: monto,
              method: 'Verificacion manual WhatsApp',
              status: 'pending',
              verified: true,
              date: pagoLive.comprobante_at ?? new Date().toISOString(),
              user_id: userId,
              customer_id: Number(customer.id),
            })
            .select('id')
            .single();
          if (mainPagoError) throw mainPagoError;
          mainPagoId = Number(pagoMain.id);
        }
      }

      // Vincular con orden de tienda si el cliente compró por la web
      if (supabaseStore && pagoLive.phone && monto) {
        try {
          const phoneRaw = String(pagoLive.phone).replace(/\D/g, '');
          const phoneShort = phoneRaw.slice(-8);
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);

          const { data: storeOrder, error: storeErr } = await supabaseStore
            .from('store_orders')
            .select('id,items')
            .or(`customer_wa.eq.${phoneRaw},customer_wa.eq.${phoneShort}`)
            .eq('total', monto)
            .eq('status', 'pending')
            .gte('created_at', todayStart.toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!storeErr && storeOrder) {
            await supabaseStore
              .from('store_orders')
              .update({
                status: 'paid',
                payment_verified_at: new Date().toISOString(),
                payment_method: 'qr',
                payment_ref: 'whatsapp_manual',
              })
              .eq('id', storeOrder.id);

            // Marcar productos como vendidos
            try {
              const productIds = (storeOrder.items ?? [])
                .map((i: any) => i.productId)
                .filter(Boolean);
              if (productIds.length > 0) {
                await supabaseStore.from('products').update({ stock: 0 }).in('id', productIds);
                console.log(`[live-sales] ${productIds.length} productos marcados como vendidos de orden #${storeOrder.id}`);
              }
            } catch (prodErr) {
              console.error('[live-sales] Error marcando productos vendidos:', prodErr);
            }

            console.log(`[live-sales] Orden de tienda #${storeOrder.id} marcada como pagada via verificación manual`);
          }
        } catch (storeLinkErr) {
          console.error('[live-sales] Error vinculando orden de tienda:', storeLinkErr);
        }
      }

      const { data: updatedPago, error: updateError } = await supabasePanel
        .from('pagos_venta_live')
        .update({
          estado: 'verificado_manual',
          main_pago_id: mainPagoId,
          match_score: 1,
          match_reason: reusedExistingPayment ? 'verificado_por_operador_pago_existente' : 'verificado_por_operador',
        })
        .eq('id', pagoLive.id)
        .select('*')
        .single();
      if (updateError) throw updateError;

      const order = await recomputeAndSync(userId, pagoLive.pedido_live_id);
      res.json({ ok: true, payment: updatedPago, order });
    } catch (err: any) {
      console.error('[live-sales/payments:verify-manual]', err);
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  router.post('/payments/:id/reject', async (req: Request, res: Response) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });

    try {
      const { data: pagoLive, error: pagoError } = await supabasePanel
        .from('pagos_venta_live')
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (pagoError) throw pagoError;

      const { data: updatedPago, error: updateError } = await supabasePanel
        .from('pagos_venta_live')
        .update({
          estado: 'rechazado',
          match_reason: req.body?.reason || 'rechazado_por_operador',
        })
        .eq('id', pagoLive.id)
        .select('*')
        .single();
      if (updateError) throw updateError;

      const order = await recomputeAndSync(userId, pagoLive.pedido_live_id);
      res.json({ ok: true, payment: updatedPago, order });
    } catch (err: any) {
      console.error('[live-sales/payments:reject]', err);
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  router.post('/day-orders/:id/archive', async (req: Request, res: Response) => {
    if (!uid(req)) return res.status(401).json({ error: 'x-user-id requerido' });

    try {
      const { data, error } = await supabasePanel
        .from('pedidos_venta_live')
        .update({ estado: 'archivado' })
        .eq('id', req.params.id)
        .select('*')
        .single();
      if (error) throw error;
      res.json({ ok: true, order: data });
    } catch (err: any) {
      console.error('[live-sales/day-orders:archive]', err);
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  router.post('/test-cleanup', async (req: Request, res: Response) => {
    if (!uid(req)) return res.status(401).json({ error: 'x-user-id requerido' });

    try {
      const phone = normalizePanelPhone(req.body.phone);
      if (!phone) return res.status(400).json({ error: 'phone requerido' });

      const { data: clientes, error: clientesError } = await supabasePanel
        .from('panel_clientes')
        .select('id, phone')
        .eq('phone', phone);

      if (clientesError) throw clientesError;

      const clienteIds = (clientes ?? []).map((c: any) => c.id).filter(Boolean);
      const { data: pedidosByPhone, error: pedidosPhoneError } = await supabasePanel
        .from('pedidos_venta_live')
        .select('id')
        .eq('phone', phone);
      if (pedidosPhoneError && pedidosPhoneError.code !== '42P01') throw pedidosPhoneError;

      let pedidosByCliente: any[] = [];
      if (clienteIds.length > 0) {
        const { data, error } = await supabasePanel
          .from('pedidos_venta_live')
          .select('id')
          .in('cliente_id', clienteIds);
        if (error && error.code !== '42P01') throw error;
        pedidosByCliente = data ?? [];
      }

      const pedidoIds = [...new Set([...(pedidosByPhone ?? []), ...pedidosByCliente].map((p: any) => p.id).filter(Boolean))];

      const mediaUrls: unknown[] = [];
      if (clienteIds.length > 0) {
        const { data: mensajesMedia, error: mensajesMediaError } = await supabasePanel
          .from('panel_mensajes')
          .select('media_url')
          .in('cliente_id', clienteIds)
          .not('media_url', 'is', null);
        if (mensajesMediaError) throw mensajesMediaError;
        mediaUrls.push(...(mensajesMedia ?? []).map((m: any) => m.media_url));
      }
      if (pedidoIds.length > 0) {
        const [{ data: pagosMedia, error: pagosMediaError }, { data: evidenciasMedia, error: evidenciasMediaError }] = await Promise.all([
          supabasePanel
            .from('pagos_venta_live')
            .select('comprobante_media_url')
            .in('pedido_live_id', pedidoIds)
            .not('comprobante_media_url', 'is', null),
          supabasePanel
            .from('evidencias_venta_live')
            .select('media_url')
            .in('pedido_live_id', pedidoIds)
            .not('media_url', 'is', null),
        ]);
        if (pagosMediaError && pagosMediaError.code !== '42P01') throw pagosMediaError;
        if (evidenciasMediaError && evidenciasMediaError.code !== '42P01') throw evidenciasMediaError;
        mediaUrls.push(...(pagosMedia ?? []).map((p: any) => p.comprobante_media_url));
        mediaUrls.push(...(evidenciasMedia ?? []).map((e: any) => e.media_url));
      }

      const deleted = {
        mediaFiles: 0,
        tarjetasPorPhone: 0,
        tarjetasPorCliente: 0,
        pagosLivePorPhone: 0,
        pagosLivePorPedido: 0,
        evidenciasLivePorPedido: 0,
        pedidosLivePorPhone: 0,
        pedidosLivePorCliente: 0,
        mensajes: 0,
        clientes: 0,
      };

      deleted.mediaFiles = await deleteWhatsappMediaFiles(supabasePanel, mediaUrls);

      const pagosByPhone = await supabasePanel
        .from('pagos_venta_live')
        .delete({ count: 'exact' })
        .eq('phone', phone);
      if (pagosByPhone.error && pagosByPhone.error.code !== '42P01') throw pagosByPhone.error;
      deleted.pagosLivePorPhone = pagosByPhone.count ?? 0;

      if (pedidoIds.length > 0) {
        const evidenciasByPedido = await supabasePanel
          .from('evidencias_venta_live')
          .delete({ count: 'exact' })
          .in('pedido_live_id', pedidoIds);
        if (evidenciasByPedido.error && evidenciasByPedido.error.code !== '42P01') throw evidenciasByPedido.error;
        deleted.evidenciasLivePorPedido = evidenciasByPedido.count ?? 0;

        const pagosByPedido = await supabasePanel
          .from('pagos_venta_live')
          .delete({ count: 'exact' })
          .in('pedido_live_id', pedidoIds);
        if (pagosByPedido.error && pagosByPedido.error.code !== '42P01') throw pagosByPedido.error;
        deleted.pagosLivePorPedido = pagosByPedido.count ?? 0;
      }

      const cardsByPhone = await supabasePanel
        .from('tarjetas_venta_live')
        .delete({ count: 'exact' })
        .eq('phone', phone);
      if (cardsByPhone.error) throw cardsByPhone.error;
      deleted.tarjetasPorPhone = cardsByPhone.count ?? 0;

      const liveOrdersByPhone = await supabasePanel
        .from('pedidos_venta_live')
        .delete({ count: 'exact' })
        .eq('phone', phone);
      if (liveOrdersByPhone.error && liveOrdersByPhone.error.code !== '42P01') throw liveOrdersByPhone.error;
      deleted.pedidosLivePorPhone = liveOrdersByPhone.count ?? 0;

      if (clienteIds.length > 0) {
        const cardsByCliente = await supabasePanel
          .from('tarjetas_venta_live')
          .delete({ count: 'exact' })
          .in('cliente_id', clienteIds);
        if (cardsByCliente.error) throw cardsByCliente.error;
        deleted.tarjetasPorCliente = cardsByCliente.count ?? 0;

        const liveOrdersByCliente = await supabasePanel
          .from('pedidos_venta_live')
          .delete({ count: 'exact' })
          .in('cliente_id', clienteIds);
        if (liveOrdersByCliente.error && liveOrdersByCliente.error.code !== '42P01') throw liveOrdersByCliente.error;
        deleted.pedidosLivePorCliente = liveOrdersByCliente.count ?? 0;

        const mensajes = await supabasePanel
          .from('panel_mensajes')
          .delete({ count: 'exact' })
          .in('cliente_id', clienteIds);
        if (mensajes.error) throw mensajes.error;
        deleted.mensajes = mensajes.count ?? 0;

        const clientesDelete = await supabasePanel
          .from('panel_clientes')
          .delete({ count: 'exact' })
          .in('id', clienteIds);
        if (clientesDelete.error) throw clientesDelete.error;
        deleted.clientes = clientesDelete.count ?? 0;
      }

      res.json({ ok: true, phone, clienteIds, deleted });
    } catch (err: any) {
      console.error('[live-sales/test-cleanup]', err);
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  return router;
}
