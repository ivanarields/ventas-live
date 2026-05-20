import type { SupabaseClient } from '@supabase/supabase-js';
import { isContextualNameMatch, isStrongNameMatch, normalizePersonName } from './nameMatching.js';

export type PagoVentaLiveEstado =
  | 'pendiente_whatsapp'
  | 'verificado_macrodroid'
  | 'verificado_manual'
  | 'revision_manual'
  | 'rechazado'
  | 'posible_duplicado';

export type PedidoVentaLiveEstado =
  | 'conversacion'
  | 'con_pagos_pendientes'
  | 'pagos_verificados'
  | 'revision_manual'
  | 'procesar'
  | 'archivado';

const BOLIVIA_OFFSET_MS = 4 * 60 * 60 * 1000;

export function normalizeLivePhone(raw: unknown): string | null {
  if (raw == null) return null;
  let phone = String(raw).trim().replace(/\s+/g, '').replace(/@[a-z.]+$/i, '');
  phone = phone.replace(/[^\d+]/g, '');
  if (phone.startsWith('+')) phone = phone.slice(1);
  if (/^[678]\d{7}$/.test(phone)) phone = `591${phone}`;
  return phone || null;
}

export function canonicalName(raw: unknown): string {
  return normalizePersonName(raw);
}

export function namesMatch(a: unknown, b: unknown): boolean {
  const ca = canonicalName(a);
  const cb = canonicalName(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  if (isContextualNameMatch(ca, cb)) return true;
  const short = ca.length <= cb.length ? ca : cb;
  const long = ca.length > cb.length ? ca : cb;
  return short.length >= 10 && long.includes(short);
}

function isMissingVerifiedCustomerColumn(error: any): boolean {
  return (error?.code === '42703' || error?.code === 'PGRST204') &&
    /is_verified_customer|verified_at|verified_source/i.test(String(error.message ?? ''));
}

export async function markMainCustomerVerified(
  mainDb: SupabaseClient,
  input: { userId: string; customerId?: number | null; name?: string | null; phone?: string | null; source: 'live' | 'store' | 'manual' },
) {
  if (!input.userId) return;
  const updates: Record<string, unknown> = {
    is_verified_customer: true,
    verified_at: new Date().toISOString(),
    verified_source: input.source,
    updated_at: new Date().toISOString(),
  };
  const phone = normalizeLivePhone(input.phone);
  if (phone) {
    updates.phone = phone;
    updates.wa_number = phone;
    updates.wa_linked_at = new Date().toISOString();
  }
  if (input.name) {
    updates.full_name = input.name;
    updates.normalized_name = canonicalName(input.name);
    updates.canonical_name = canonicalName(input.name);
  }

  let query = mainDb.from('customers').update(updates).eq('user_id', input.userId);
  query = input.customerId ? query.eq('id', input.customerId) : query.or(`wa_number.eq.${phone},phone.eq.${phone}`);
  const { error } = await query;
  if (error && !isMissingVerifiedCustomerColumn(error)) throw error;
}

export function boliviaDateKey(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() - BOLIVIA_OFFSET_MS).toISOString().slice(0, 10);
}

export function boliviaDayUtcRange(fechaPedido: string): { start: string; end: string } {
  const start = new Date(`${fechaPedido}T04:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function receiptAtFromMessage(messageCreatedAt: string | null | undefined, hora: string | null | undefined): string {
  const base = messageCreatedAt ? new Date(messageCreatedAt) : new Date();
  const fecha = boliviaDateKey(base);
  const match = String(hora ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return base.toISOString();

  const hh = Math.max(0, Math.min(23, Number(match[1])));
  const mm = Math.max(0, Math.min(59, Number(match[2])));
  const utc = new Date(`${fecha}T00:00:00.000Z`);
  utc.setUTCHours(hh + 4, mm, 0, 0);
  return utc.toISOString();
}

export function parseLiveMonto(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const value = Number(String(raw).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export function resolveLivePaymentMatchAt(pagoLive: any): string | null {
  return (
    pagoLive?.comprobante_at ??
    pagoLive?.message_created_at ??
    pagoLive?.panel_message_created_at ??
    pagoLive?.whatsapp_message_created_at ??
    pagoLive?.comprobante_message_created_at ??
    null
  );
}

export function resolveLivePaymentMatchTimes(pagoLive: any): string[] {
  const values = [
    pagoLive?.comprobante_at,
    pagoLive?.message_created_at,
    pagoLive?.panel_message_created_at,
    pagoLive?.whatsapp_message_created_at,
    pagoLive?.comprobante_message_created_at,
  ];
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    if (!value) return false;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return false;
    const iso = new Date(time).toISOString();
    if (seen.has(iso)) return false;
    seen.add(iso);
    return true;
  });
}

export function findMacrodroidMatchForLivePayment(
  pagoLive: any,
  candidates: any[],
  input: {
    mainCustomerId?: number | null;
    windowMinutes?: number;
  } = {},
) {
  const monto = parseLiveMonto(pagoLive?.monto);
  const matchTimes = resolveLivePaymentMatchTimes(pagoLive);
  if (!monto || matchTimes.length === 0 || !pagoLive?.nombre_detectado) return null;

  const windowMs = (input.windowMinutes ?? 5) * 60 * 1000;

  for (const matchAt of matchTimes) {
    const center = new Date(matchAt).getTime();
    if (!Number.isFinite(center)) continue;
    const from = center - windowMs;
    const to = center + windowMs;

    const matched = (candidates ?? []).find((p: any) => {
      const paidAt = new Date(p.date).getTime();
      if (!Number.isFinite(paidAt) || paidAt < from || paidAt > to) return false;
      if (parseLiveMonto(p.pago) !== monto) return false;

      const sameCustomer = input.mainCustomerId && Number(p.customer_id) === Number(input.mainCustomerId);
      return sameCustomer || namesMatch(pagoLive.nombre_detectado, p.nombre);
    });
    if (matched) return matched;
  }

  return null;
}

export async function ensureMainCustomerForLive(
  mainDb: SupabaseClient,
  userId: string,
  name: string,
  phone: string | null,
) {
  const canonical = canonicalName(name);
  const normalized = canonical.toLowerCase();

  let query = mainDb
    .from('customers')
    .select('*')
    .eq('user_id', userId)
    .eq('canonical_name', canonical)
    .order('updated_at', { ascending: false })
    .limit(1);

  const { data: byName, error: byNameError } = await query;
  if (byNameError) throw byNameError;

  let customer = byName?.[0] ?? null;

  if (!customer) {
    const { data, error } = await mainDb
      .from('customers')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    const matches = (data ?? []).filter((c: any) => isStrongNameMatch(c.canonical_name || c.full_name || c.normalized_name, canonical));
    if (matches.length === 1) customer = matches[0];
  }

  if (!customer && phone && !canonical) {
    const { data, error } = await mainDb
      .from('customers')
      .select('*')
      .eq('user_id', userId)
      .or(`wa_number.eq.${phone},phone.eq.${phone}`)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    customer = data?.[0] ?? null;
  }

  if (!customer) {
    const { data, error } = await mainDb
      .from('customers')
      .insert({
        full_name: name,
        normalized_name: normalized,
        canonical_name: canonical,
        phone: phone ?? '',
        wa_number: phone ?? null,
        wa_linked_at: phone ? new Date().toISOString() : null,
        is_active: true,
        source: 'whatsapp_live',
        user_id: userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const updates: Record<string, unknown> = {
    full_name: customer.full_name || name,
    normalized_name: customer.normalized_name || normalized,
    canonical_name: customer.canonical_name || canonical,
    updated_at: new Date().toISOString(),
  };
  if (phone && !customer.wa_number) {
    updates.wa_number = phone;
    updates.wa_linked_at = new Date().toISOString();
  }
  if (phone && !customer.phone) updates.phone = phone;

  const { data, error } = await mainDb
    .from('customers')
    .update(updates)
    .eq('id', customer.id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function ensureMainDailyPedido(
  mainDb: SupabaseClient,
  input: {
    userId: string;
    customerId: number;
    customerName: string;
    fechaPedido: string;
    totalAmount: number;
  },
) {
  const range = boliviaDayUtcRange(input.fechaPedido);
  const { data: existing, error: existingError } = await mainDb
    .from('pedidos')
    .select('*')
    .eq('user_id', input.userId)
    .eq('customer_id', input.customerId)
    .gte('date', range.start)
    .lt('date', range.end)
    .order('created_at', { ascending: true })
    .limit(20);
  if (existingError) throw existingError;

  const current = (existing ?? []).find((pedido: any) => (
    String(pedido.source ?? '').toUpperCase() !== 'WEB' &&
    String(pedido.label_type ?? '').toUpperCase() !== 'WEB' &&
    !String(pedido.label ?? '').toUpperCase().startsWith('WEB-')
  )) ?? null;
  if (current) {
    const status = String(current.status ?? '').toLowerCase();
    const keepStatus = ['listo', 'preparado', 'ready', 'entregado'].includes(status);
    const { data, error } = await mainDb
      .from('pedidos')
      .update({
        customer_name: input.customerName,
        total_amount: input.totalAmount,
        status: keepStatus ? current.status : 'procesar',
        source: current.source ?? 'live_sales',
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.id)
      .eq('user_id', input.userId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await mainDb
    .from('pedidos')
    .insert({
      customer_id: input.customerId,
      customer_name: input.customerName,
      item_count: 0,
      bag_count: 1,
      label: '',
      label_type: '',
      status: 'procesar',
      total_amount: input.totalAmount,
      date: range.start,
      user_id: input.userId,
      source: 'live_sales',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function ensurePanelLiveOrder(
  panelDb: SupabaseClient,
  input: {
    clienteId: string;
    phone: string;
    fechaPedido: string;
    nombreDetectado?: string | null;
    isTest?: boolean;
  },
) {
  const { data: existing, error: existingError } = await panelDb
    .from('pedidos_venta_live')
    .select('*')
    .eq('phone', input.phone)
    .eq('fecha_pedido', input.fechaPedido)
    .neq('estado', 'archivado')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { data, error } = await panelDb
      .from('pedidos_venta_live')
      .update({
        cliente_id: input.clienteId,
        nombre_detectado: input.nombreDetectado ?? existing.nombre_detectado,
        is_test: input.isTest ?? existing.is_test ?? true,
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await panelDb
    .from('pedidos_venta_live')
    .insert({
      cliente_id: input.clienteId,
      phone: input.phone,
      fecha_pedido: input.fechaPedido,
      nombre_detectado: input.nombreDetectado ?? null,
      estado: 'conversacion',
      is_test: input.isTest ?? true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function upsertLiveEvidence(
  panelDb: SupabaseClient,
  input: {
    pedidoLiveId: string;
    clienteId: string;
    panelMensajeId?: string | null;
    tipo: string;
    mediaUrl?: string | null;
    mediaType?: string | null;
    content?: string | null;
    descripcion?: string | null;
    messageCreatedAt?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const payload = {
    pedido_live_id: input.pedidoLiveId,
    cliente_id: input.clienteId,
    panel_mensaje_id: input.panelMensajeId ?? null,
    tipo: input.tipo,
    media_url: input.mediaUrl ?? null,
    media_type: input.mediaType ?? null,
    content: input.content ?? null,
    descripcion: input.descripcion ?? null,
    message_created_at: input.messageCreatedAt ?? null,
    metadata: input.metadata ?? {},
  };

  if (input.panelMensajeId) {
    const { data, error } = await panelDb
      .from('evidencias_venta_live')
      .upsert(payload, { onConflict: 'panel_mensaje_id' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await panelDb
    .from('evidencias_venta_live')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function recomputeLiveOrderTotals(panelDb: SupabaseClient, pedidoLiveId: string) {
  const { data: pagos, error } = await panelDb
    .from('pagos_venta_live')
    .select('monto, estado')
    .eq('pedido_live_id', pedidoLiveId);
  if (error) throw error;

  let totalComprobantes = 0;
  let totalVerificado = 0;
  let hasRevision = false;
  let hasPending = false;

  for (const pago of pagos ?? []) {
    const monto = parseLiveMonto(pago.monto) ?? 0;
    const estado = String(pago.estado ?? '');
    if (estado === 'rechazado' || estado === 'posible_duplicado') continue;
    totalComprobantes += monto;
    if (estado === 'verificado_macrodroid' || estado === 'verificado_manual') totalVerificado += monto;
    else if (estado === 'revision_manual') hasRevision = true;
    else if (monto > 0) hasPending = true;
  }

  const totalPendiente = Math.max(0, Math.round((totalComprobantes - totalVerificado) * 100) / 100);
  let estado: PedidoVentaLiveEstado = 'conversacion';
  if (hasRevision) estado = 'revision_manual';
  else if (hasPending || totalPendiente > 0) estado = 'con_pagos_pendientes';
  else if (totalVerificado > 0) estado = 'pagos_verificados';

  const { data, error: updateError } = await panelDb
    .from('pedidos_venta_live')
    .update({
      total_comprobantes: totalComprobantes,
      total_verificado: totalVerificado,
      total_pendiente: totalPendiente,
      estado,
    })
    .eq('id', pedidoLiveId)
    .select('*')
    .single();
  if (updateError) throw updateError;
  return data;
}

export async function syncMainPedidoForLiveOrder(
  panelDb: SupabaseClient,
  mainDb: SupabaseClient,
  userId: string,
  pedidoLive: any,
) {
  const name = pedidoLive.nombre_detectado;
  if (!name) return pedidoLive;
  // Usar total_verificado si ya tiene valor; si es 0 usar total_comprobantes (monto detectado en el comprobante)
  const total = parseLiveMonto(pedidoLive.total_verificado) || parseLiveMonto(pedidoLive.total_comprobantes) || 0;

  const customer = await ensureMainCustomerForLive(mainDb, userId, name, pedidoLive.phone);
  const pedido = await ensureMainDailyPedido(mainDb, {
    userId,
    customerId: Number(customer.id),
    customerName: customer.full_name || name,
    fechaPedido: pedidoLive.fecha_pedido,
    totalAmount: total,
  });

  if (String(pedidoLive.estado ?? '') === 'pagos_verificados') {
    await markMainCustomerVerified(mainDb, {
      userId,
      customerId: Number(customer.id),
      name: customer.full_name || name,
      phone: pedidoLive.phone,
      source: 'live',
    });
  }

  const { data, error } = await panelDb
    .from('pedidos_venta_live')
    .update({
      main_customer_id: Number(customer.id),
      main_pedido_id: Number(pedido.id),
    })
    .eq('id', pedidoLive.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function matchLivePaymentWithMacrodroid(
  panelDb: SupabaseClient,
  mainDb: SupabaseClient,
  input: {
    userId: string;
    pagoLive: any;
    mainCustomerId?: number | null;
    windowMinutes?: number;
  },
) {
  const monto = parseLiveMonto(input.pagoLive.monto);
  if (!monto || !input.pagoLive.nombre_detectado) return input.pagoLive;

  let messageCreatedAt: string | null = null;
  if (input.pagoLive.panel_mensaje_id) {
    const { data: message, error: messageError } = await panelDb
      .from('panel_mensajes')
      .select('created_at')
      .eq('id', input.pagoLive.panel_mensaje_id)
      .limit(1)
      .maybeSingle();
    if (messageError) throw messageError;
    messageCreatedAt = message?.created_at ?? null;
  }

  const pagoLiveForMatch = {
    ...input.pagoLive,
    message_created_at: messageCreatedAt ?? resolveLivePaymentMatchAt(input.pagoLive),
  };
  const matchTimes = resolveLivePaymentMatchTimes(pagoLiveForMatch);
  if (matchTimes.length === 0) return input.pagoLive;

  const windowMs = (input.windowMinutes ?? 5) * 60 * 1000;
  const centers = matchTimes
    .map(value => new Date(value).getTime())
    .filter(Number.isFinite);
  if (centers.length === 0) return input.pagoLive;
  const from = new Date(Math.min(...centers) - windowMs).toISOString();
  const to = new Date(Math.max(...centers) + windowMs).toISOString();

  // Excluir pagos MacroDroid que ya están vinculados a otro comprobante verificado
  const { data: alreadyMatched } = await panelDb
    .from('pagos_venta_live')
    .select('main_pago_id')
    .not('main_pago_id', 'is', null)
    .eq('estado', 'verificado_macrodroid');
  const excludeIds = (alreadyMatched ?? []).map((p: any) => p.main_pago_id).filter(Boolean);

  let query = mainDb
    .from('pagos')
    .select('id,nombre,pago,date,method,customer_id')
    .eq('user_id', input.userId)
    .eq('pago', monto)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true });

  if (excludeIds.length > 0) {
    query = query.not('id', 'in', `(${excludeIds.join(',')})`) as typeof query;
  }

  const { data: candidates, error } = await query;
  if (error) throw error;
  if (!candidates?.length) return input.pagoLive;

  const matched = findMacrodroidMatchForLivePayment(pagoLiveForMatch, candidates, {
    mainCustomerId: input.mainCustomerId,
    windowMinutes: input.windowMinutes,
  });

  if (matched) {
    const { data, error: updateError } = await panelDb
      .from('pagos_venta_live')
      .update({
        estado: 'verificado_macrodroid',
        main_pago_id: Number(matched.id),
        match_score: 1,
        match_reason: messageCreatedAt ? 'monto_nombre_whatsapp_5m' : 'monto_nombre_comprobante_5m',
      })
      .eq('id', input.pagoLive.id)
      .select('*')
      .single();
    if (updateError) throw updateError;
    if (input.mainCustomerId) {
      await markMainCustomerVerified(mainDb, {
        userId: input.userId,
        customerId: Number(input.mainCustomerId),
        name: input.pagoLive.nombre_detectado,
        phone: input.pagoLive.phone,
        source: 'live',
      });
    }
    return data;
  }

  const { data, error: updateError } = await panelDb
    .from('pagos_venta_live')
    .update({
      estado: 'revision_manual',
      match_score: 0.5,
      match_reason: 'monto_hora_nombre_no_coincide',
    })
    .eq('id', input.pagoLive.id)
    .select('*')
    .single();
  if (updateError) throw updateError;
  return data;
}

export async function upsertWhatsappLivePayment(
  panelDb: SupabaseClient,
  input: {
    pedidoLiveId: string;
    clienteId: string;
    phone: string;
    fechaPedido: string;
    nombreDetectado?: string | null;
    monto?: number | null;
    comprobanteHora?: string | null;
    comprobanteAt?: string | null;
    comprobanteTexto?: string | null;
    comprobanteMediaUrl?: string | null;
    panelMensajeId?: string | null;
    isTest?: boolean;
  },
) {
  const monto = parseLiveMonto(input.monto);
  const nombre = input.nombreDetectado ? canonicalName(input.nombreDetectado) : null;
  const basePayload = {
    pedido_live_id: input.pedidoLiveId,
    cliente_id: input.clienteId,
    phone: input.phone,
    fecha_pedido: input.fechaPedido,
    nombre_detectado: nombre,
    nombre_canonico: nombre,
    monto,
    comprobante_hora: input.comprobanteHora ?? null,
    comprobante_at: input.comprobanteAt ?? null,
    comprobante_texto: input.comprobanteTexto ?? null,
    comprobante_media_url: input.comprobanteMediaUrl ?? null,
    panel_mensaje_id: input.panelMensajeId ?? null,
    estado: nombre && monto ? 'pendiente_whatsapp' : 'revision_manual',
    is_test: input.isTest ?? false,
  };

  let existing: any = null;
  // Dedup primario: por ID del mensaje de WhatsApp (el más específico).
  // Dos mensajes distintos nunca deben fusionarse aunque compartan la misma imagen.
  if (input.panelMensajeId) {
    const { data, error } = await panelDb
      .from('pagos_venta_live')
      .select('*')
      .eq('panel_mensaje_id', input.panelMensajeId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    existing = data;
  }

  if (!existing && !input.panelMensajeId && input.comprobanteMediaUrl) {
    // Fallback: buscar por URL de imagen solo cuando no hay ID de mensaje
    const { data, error } = await panelDb
      .from('pagos_venta_live')
      .select('*')
      .eq('comprobante_media_url', input.comprobanteMediaUrl)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    existing = data;
  }

  let duplicateOf: string | null = null;
  if (!existing && nombre && monto && input.comprobanteAt) {
    const from = new Date(new Date(input.comprobanteAt).getTime() - 5 * 60 * 1000).toISOString();
    const to = new Date(new Date(input.comprobanteAt).getTime() + 5 * 60 * 1000).toISOString();
    const { data: dupes, error } = await panelDb
      .from('pagos_venta_live')
      .select('*')
      .eq('pedido_live_id', input.pedidoLiveId)
      .gte('comprobante_at', from)
      .lte('comprobante_at', to)
      .neq('estado', 'rechazado')
      .order('created_at', { ascending: true })
      .limit(20);
    if (error) throw error;
    const dupe = (dupes ?? []).find((p: any) =>
      parseLiveMonto(p.monto) === monto && namesMatch(p.nombre_canonico, nombre)
    );
    // Si ambos mensajes tienen ID de WhatsApp diferente, son mensajes distintos → nunca fusionar
    const esMensajeDiferente =
      input.panelMensajeId && dupe?.panel_mensaje_id &&
      input.panelMensajeId !== dupe.panel_mensaje_id;

    if (dupe && !esMensajeDiferente && dupe.estado === 'pendiente_whatsapp') {
      // Mismo mensaje reenviado por error → fusionar
      existing = dupe;
    }
    // Si el mensaje tiene distinto ID → es un pago diferente aunque tenga el mismo monto.
    // No marcarlo como duplicado; puede ser un pago legítimo independiente.
  }

  const payload = {
    ...basePayload,
    estado: duplicateOf ? 'posible_duplicado' : basePayload.estado,
    duplicate_of: duplicateOf,
  };

  if (existing) {
    const keepVerified = ['verificado_macrodroid', 'verificado_manual'].includes(String(existing.estado));
    const { data, error } = await panelDb
      .from('pagos_venta_live')
      .update({
        ...payload,
        estado: keepVerified ? existing.estado : payload.estado,
        main_pago_id: existing.main_pago_id,
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await panelDb
    .from('pagos_venta_live')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
