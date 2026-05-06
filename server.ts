import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { supabaseServer } from "./src/lib/supabaseServer.js";
import { supabaseStore } from "./src/lib/supabaseStore.js";
import { supabasePanel } from "./src/lib/supabasePanel.js";
import { createAiRouter } from "./src/routes/ai-gateway.js";
import { createIdentityRouter } from "./src/routes/identity.js";
import { createLiveSalesRouter } from "./src/routes/live-sales.js";
import { createWhatsappRouter, enqueueStoreConfirmation } from "./src/routes/whatsapp.js";
import { createStoreSelectionRouter } from "./src/routes/store-selection.js";
import { createStoreSettingsRouter } from "./src/routes/store-settings.js";


import { ingestManualPayment } from "./src/services/identityService.js";
import { isStrongNameMatch } from "./src/services/nameMatching.js";
import {
  CATEGORIAS_VALIDAS,
  TALLAS_VALIDAS,
} from "./src/ai/prompts/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cleanName = (name: string) => {
  if (!name) return "";
  
  let cleaned = name.trim();
  
  // 1. Eliminar prefijos bancarios comunes (insensible a mayúsculas)
  const prefixes = [
    /^QR de\s+/i,
    /^Pago de\s+/i,
    /^Transferencia de\s+/i,
    /^Transf\.\s+/i,
    /^Sr\.\s+/i,
    /^Sra\.\s+/i,
    /^Lic\.\s+/i
  ];
  
  prefixes.forEach(reg => {
    cleaned = cleaned.replace(reg, "");
  });

  // 2. Normalizar: Quitar acentos y diacríticos
  // Ejemplo: "Díaz" -> "Diaz"
  cleaned = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 3. Colapsar espacios múltiples en uno solo y pasar a Mayúsculas para consistencia
  cleaned = cleaned.replace(/\s+/g, " ").toUpperCase().trim();

  return cleaned;
};

const phoneDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

const phoneVariants = (...values: unknown[]) => {
  const set = new Set<string>();
  for (const value of values) {
    const digits = phoneDigits(value);
    if (!digits) continue;
    set.add(digits);
    if (digits.startsWith('591') && digits.length > 3) set.add(digits.slice(3));
    if (!digits.startsWith('591')) set.add(`591${digits}`);
  }
  return [...set];
};

const isMissingDbObject = (error: any) => {
  const code = error?.code;
  const message = String(error?.message ?? '').toLowerCase();
  return code === '42P01' || code === '42703' || code === 'PGRST204' || message.includes('does not exist') || message.includes('schema cache');
};

async function safeSelect(client: any, table: string, columns: string, apply: (query: any) => any) {
  try {
    const { data, error } = await apply(client.from(table).select(columns));
    if (error) {
      if (isMissingDbObject(error)) return [];
      throw error;
    }
    return data ?? [];
  } catch (error: any) {
    if (isMissingDbObject(error)) return [];
    throw error;
  }
}

async function safeDelete(
  client: any,
  table: string,
  key: string,
  deleted: Record<string, number>,
  apply: (query: any) => any,
) {
  try {
    const { count, error } = await apply(client.from(table).delete({ count: 'exact' }));
    if (error) {
      if (isMissingDbObject(error)) return;
      throw error;
    }
    deleted[key] = (deleted[key] ?? 0) + (count ?? 0);
  } catch (error: any) {
    if (isMissingDbObject(error)) return;
    throw error;
  }
}

async function safeUpdate(
  client: any,
  table: string,
  key: string,
  updated: Record<string, number>,
  values: Record<string, any>,
  apply: (query: any) => any,
) {
  try {
    const { count, error } = await apply(client.from(table).update(values, { count: 'exact' }));
    if (error) {
      if (isMissingDbObject(error)) return;
      throw error;
    }
    updated[key] = (updated[key] ?? 0) + (count ?? 0);
  } catch (error: any) {
    if (isMissingDbObject(error)) return;
    throw error;
  }
}

function getBoliviaTodayRange() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const year = value('year');
  const month = value('month');
  const day = value('day');
  const start = new Date(Date.UTC(year, month - 1, day, 4, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

async function recalcAllContainers() {
  const containers = await safeSelect(supabaseServer, 'storage_containers', 'id', (q) => q);
  for (const container of containers as any[]) {
    try {
      await supabaseServer.rpc('fn_recalc_container_state', { p_container_id: container.id });
    } catch {
      // Si la función no existe en una base vieja, el reset manual de abajo mantiene los contadores limpios.
    }
  }
}

async function resetLabelsForUser(userId: string, options: { resetPedidoStatus?: boolean; orderIds?: number[] } = {}) {
  const changed: Record<string, number> = {};

  const allOrders = await safeSelect(supabaseServer, 'orders', 'id', (q) => q.not('id', 'is', null));
  const orderIds = [...new Set([
    ...(options.orderIds ?? []),
    ...(allOrders as any[]).map((o: any) => Number(o.id)),
  ].map(Number).filter(Boolean))];

  if (orderIds.length > 0) {
    await safeDelete(supabaseServer, 'container_allocations', 'casilleros_asignaciones', changed, (q) => q.in('order_id', orderIds));
    await safeDelete(supabaseServer, 'order_bags', 'bolsas', changed, (q) => q.in('order_id', orderIds));
    await safeDelete(supabaseServer, 'orders', 'pedidos_etiquetas', changed, (q) => q.in('id', orderIds));
  }

  const pedidoUpdate: Record<string, any> = { label: '', label_type: '', updated_at: new Date() };
  if (options.resetPedidoStatus) pedidoUpdate.status = 'procesar';
  await safeUpdate(supabaseServer, 'pedidos', 'pedidos_limpiados', changed, pedidoUpdate, (q) => q.eq('user_id', userId));
  await safeUpdate(supabaseServer, 'customers', 'clientes_limpiados', changed, {
    active_label: '',
    active_label_type: '',
    active_bag_count: 0,
    label_updated_at: new Date(),
  }, (q) => q.eq('user_id', userId));

  await recalcAllContainers();
  await safeUpdate(supabaseServer, 'storage_containers', 'casilleros_reseteados', changed, {
    current_simple_orders: 0,
    current_bags_used: 0,
    state: 'AVAILABLE',
  }, (q) => q.select('id'));

  await safeDelete(supabasePanel, 'evidencias_venta_live', 'panel_evidencias', changed, (q) => q.not('id', 'is', null));
  await safeDelete(supabasePanel, 'pagos_venta_live', 'panel_pagos', changed, (q) => q.not('id', 'is', null));
  await safeDelete(supabasePanel, 'pedidos_venta_live', 'panel_pedidos', changed, (q) => q.not('id', 'is', null));
  await safeDelete(supabasePanel, 'tarjetas_venta_live', 'panel_tarjetas', changed, (q) => q.not('id', 'is', null));
  await safeDelete(supabasePanel, 'panel_mensajes', 'panel_mensajes', changed, (q) => q.not('id', 'is', null));
  await safeDelete(supabasePanel, 'panel_clientes', 'panel_conversaciones', changed, (q) => q.not('id', 'is', null));

  return { orderIds, changed };
}

async function deleteTodayPaymentsForUser(userId: string) {
  const range = getBoliviaTodayRange();
  const deleted: Record<string, number> = {};

  const pagos = await safeSelect(supabaseServer, 'pagos', 'id,customer_id', (q) => q.eq('user_id', userId).gte('date', range.start).lt('date', range.end));
  const pedidos = await safeSelect(supabaseServer, 'pedidos', 'id,customer_id', (q) => q.eq('user_id', userId).gte('date', range.start).lt('date', range.end));
  const pagoIds = (pagos as any[]).map((p: any) => Number(p.id)).filter(Boolean);
  const pedidoIds = (pedidos as any[]).map((p: any) => Number(p.id)).filter(Boolean);
  const customerIds = [...new Set([...(pagos as any[]), ...(pedidos as any[])].map((r: any) => Number(r.customer_id)).filter(Boolean))];

  const orderRows: any[] = [];
  if (pedidoIds.length > 0) {
    orderRows.push(...await safeSelect(supabaseServer, 'orders', 'id', (q) => q.in('firebase_id', pedidoIds.map(String))) as any[]);
  }
  if (customerIds.length > 0) {
    orderRows.push(...await safeSelect(supabaseServer, 'orders', 'id', (q) => q.in('customer_id', customerIds).gte('created_at', range.start).lt('created_at', range.end)) as any[]);
  }
  const orderIds = [...new Set(orderRows.map((o: any) => Number(o.id)).filter(Boolean))];

  if (orderIds.length > 0) {
    await safeDelete(supabaseServer, 'container_allocations', 'casilleros_asignaciones', deleted, (q) => q.in('order_id', orderIds));
    await safeDelete(supabaseServer, 'order_bags', 'bolsas', deleted, (q) => q.in('order_id', orderIds));
    await safeDelete(supabaseServer, 'orders', 'pedidos_etiquetas', deleted, (q) => q.in('id', orderIds));
  }

  if (pagoIds.length > 0) {
    await safeDelete(supabaseServer, 'identity_evidence', 'identidad_evidencia', deleted, (q) => q.eq('user_id', userId).eq('source', 'manual_payment').in('source_id', pagoIds.map(String)));
    await safeDelete(supabasePanel, 'pagos_venta_live', 'panel_pagos_vinculados', deleted, (q) => q.in('main_pago_id', pagoIds));
  }
  if (pedidoIds.length > 0) {
    await safeDelete(supabasePanel, 'pedidos_venta_live', 'panel_pedidos_vinculados', deleted, (q) => q.in('main_pedido_id', pedidoIds));
  }

  const rawEvents = await safeSelect(supabaseServer, 'raw_notification_events', 'id', (q) => q.gte('received_at', range.start).lt('received_at', range.end));
  const rawIds = (rawEvents as any[]).map((r: any) => r.id).filter(Boolean);
  if (rawIds.length > 0) {
    await safeDelete(supabaseServer, 'raw_notification_events', 'notificaciones_banco', deleted, (q) => q.in('id', rawIds));
  }

  if (pedidoIds.length > 0) {
    await safeDelete(supabaseServer, 'pedidos', 'pedidos', deleted, (q) => q.eq('user_id', userId).in('id', pedidoIds));
  }
  if (pagoIds.length > 0) {
    await safeDelete(supabaseServer, 'pagos', 'pagos', deleted, (q) => q.eq('user_id', userId).in('id', pagoIds));
  }

  await recalcAllContainers();
  return { success: true, date: range.date, pagoIds, pedidoIds, orderIds, deleted };
}

async function deleteTodayForUser(userId: string) {
  const range = getBoliviaTodayRange();
  const deleted: Record<string, number> = {};

  const pagos = await safeSelect(supabaseServer, 'pagos', 'id,customer_id', (q) => q.eq('user_id', userId).gte('date', range.start).lt('date', range.end));
  const pedidos = await safeSelect(supabaseServer, 'pedidos', 'id,customer_id', (q) => q.eq('user_id', userId).gte('date', range.start).lt('date', range.end));
  const pagoIds = (pagos as any[]).map((p: any) => Number(p.id)).filter(Boolean);
  const pedidoIds = (pedidos as any[]).map((p: any) => Number(p.id)).filter(Boolean);
  const customerIds = [...new Set([...(pagos as any[]), ...(pedidos as any[])].map((r: any) => Number(r.customer_id)).filter(Boolean))];

  const orderRows: any[] = [];
  if (pedidoIds.length > 0) {
    orderRows.push(...await safeSelect(supabaseServer, 'orders', 'id', (q) => q.in('firebase_id', pedidoIds.map(String))) as any[]);
    orderRows.push(...await safeSelect(supabaseServer, 'orders', 'id', (q) => q.in('id', pedidoIds)) as any[]);
  }
  if (customerIds.length > 0) {
    orderRows.push(...await safeSelect(supabaseServer, 'orders', 'id', (q) => q.in('customer_id', customerIds).gte('created_at', range.start).lt('created_at', range.end)) as any[]);
  }
  const orderIds = [...new Set(orderRows.map((o: any) => Number(o.id)).filter(Boolean))];

  if (orderIds.length > 0) {
    await safeDelete(supabaseServer, 'container_allocations', 'casilleros_asignaciones', deleted, (q) => q.in('order_id', orderIds));
    await safeDelete(supabaseServer, 'order_bags', 'bolsas', deleted, (q) => q.in('order_id', orderIds));
    await safeDelete(supabaseServer, 'orders', 'pedidos_etiquetas', deleted, (q) => q.in('id', orderIds));
  }

  if (pagoIds.length > 0) {
    await safeDelete(supabaseServer, 'identity_evidence', 'identidad_evidencia', deleted, (q) => q.eq('user_id', userId).eq('source', 'manual_payment').in('source_id', pagoIds.map(String)));
  }

  const rawEvents = await safeSelect(supabaseServer, 'raw_notification_events', 'id', (q) => q.gte('received_at', range.start).lt('received_at', range.end));
  const rawIds = (rawEvents as any[]).map((r: any) => r.id).filter(Boolean);
  if (rawIds.length > 0) {
    await safeDelete(supabaseServer, 'raw_notification_events', 'notificaciones_banco', deleted, (q) => q.in('id', rawIds));
  }

  const panelClientesToday = await safeSelect(supabasePanel, 'panel_clientes', 'id,phone', (q) => q.gte('created_at', range.start).lt('created_at', range.end));
  const panelPedidosToday = await safeSelect(supabasePanel, 'pedidos_venta_live', 'id,cliente_id,phone', (q) => q.gte('created_at', range.start).lt('created_at', range.end));
  const panelPagosToday = await safeSelect(supabasePanel, 'pagos_venta_live', 'id,pedido_live_id,cliente_id,phone', (q) => q.gte('created_at', range.start).lt('created_at', range.end));
  const panelPedidosLinked = pedidoIds.length > 0
    ? await safeSelect(supabasePanel, 'pedidos_venta_live', 'id,cliente_id,phone', (q) => q.in('main_pedido_id', pedidoIds))
    : [];
  const panelPagosLinked = pagoIds.length > 0
    ? await safeSelect(supabasePanel, 'pagos_venta_live', 'id,pedido_live_id,cliente_id,phone', (q) => q.in('main_pago_id', pagoIds))
    : [];
  const panelClienteIds = [...new Set([
    ...(panelClientesToday as any[]).map((r: any) => r.id),
    ...(panelPedidosToday as any[]).map((r: any) => r.cliente_id),
    ...(panelPagosToday as any[]).map((r: any) => r.cliente_id),
    ...(panelPedidosLinked as any[]).map((r: any) => r.cliente_id),
    ...(panelPagosLinked as any[]).map((r: any) => r.cliente_id),
  ].filter(Boolean))];
  const panelPedidoIds = [...new Set([
    ...(panelPedidosToday as any[]).map((r: any) => r.id),
    ...(panelPagosToday as any[]).map((r: any) => r.pedido_live_id),
    ...(panelPedidosLinked as any[]).map((r: any) => r.id),
    ...(panelPagosLinked as any[]).map((r: any) => r.pedido_live_id),
  ].filter(Boolean))];
  const panelPagoIds = [...new Set([
    ...(panelPagosToday as any[]).map((r: any) => r.id),
    ...(panelPagosLinked as any[]).map((r: any) => r.id),
  ].filter(Boolean))];
  const panelPhones = [...new Set([
    ...(panelClientesToday as any[]).map((r: any) => r.phone),
    ...(panelPedidosToday as any[]).map((r: any) => r.phone),
    ...(panelPagosToday as any[]).map((r: any) => r.phone),
    ...(panelPedidosLinked as any[]).map((r: any) => r.phone),
    ...(panelPagosLinked as any[]).map((r: any) => r.phone),
  ].map(phoneDigits).filter(Boolean))];

  if (panelPagoIds.length > 0) {
    await safeDelete(supabasePanel, 'pagos_venta_live', 'panel_pagos_ids', deleted, (q) => q.in('id', panelPagoIds));
  }
  if (panelPedidoIds.length > 0) {
    await safeDelete(supabasePanel, 'evidencias_venta_live', 'panel_evidencias', deleted, (q) => q.in('pedido_live_id', panelPedidoIds));
    await safeDelete(supabasePanel, 'pagos_venta_live', 'panel_pagos', deleted, (q) => q.in('pedido_live_id', panelPedidoIds));
    await safeDelete(supabasePanel, 'pedidos_venta_live', 'panel_pedidos', deleted, (q) => q.in('id', panelPedidoIds));
  }
  if (panelClienteIds.length > 0) {
    await safeDelete(supabasePanel, 'evidencias_venta_live', 'panel_evidencias_cliente', deleted, (q) => q.in('cliente_id', panelClienteIds));
    await safeDelete(supabasePanel, 'pagos_venta_live', 'panel_pagos_cliente', deleted, (q) => q.in('cliente_id', panelClienteIds));
    await safeDelete(supabasePanel, 'pedidos_venta_live', 'panel_pedidos_cliente', deleted, (q) => q.in('cliente_id', panelClienteIds));
    await safeDelete(supabasePanel, 'tarjetas_venta_live', 'panel_tarjetas', deleted, (q) => q.in('cliente_id', panelClienteIds));
    await safeDelete(supabasePanel, 'panel_mensajes', 'panel_mensajes', deleted, (q) => q.in('cliente_id', panelClienteIds));
    await safeDelete(supabasePanel, 'panel_clientes', 'panel_conversaciones', deleted, (q) => q.in('id', panelClienteIds));
  }
  if (panelPhones.length > 0) {
    await safeDelete(supabasePanel, 'pagos_venta_live', 'panel_pagos_phone', deleted, (q) => q.in('phone', panelPhones));
    await safeDelete(supabasePanel, 'pedidos_venta_live', 'panel_pedidos_phone', deleted, (q) => q.in('phone', panelPhones));
    await safeDelete(supabasePanel, 'tarjetas_venta_live', 'panel_tarjetas_phone', deleted, (q) => q.in('phone', panelPhones));
  }

  if (pedidoIds.length > 0) {
    await safeDelete(supabaseServer, 'pedidos', 'pedidos', deleted, (q) => q.eq('user_id', userId).in('id', pedidoIds));
  }
  if (pagoIds.length > 0) {
    await safeDelete(supabaseServer, 'pagos', 'pagos', deleted, (q) => q.eq('user_id', userId).in('id', pagoIds));
  }

  await resetLabelsForUser(userId, { orderIds, resetPedidoStatus: true });
  return { success: true, date: range.date, pagoIds, pedidoIds, orderIds, panelClienteIds, deleted };
}

async function deleteStoreAuthUsers(phones: string[]) {
  const shortPhones = phones.map(phoneDigits).filter(Boolean).map(p => p.startsWith('591') ? p.slice(3) : p);
  const emails = [...new Set(shortPhones.map(p => `${p}@tiendaleydi.com`))];
  for (const email of emails) {
    try {
      const { data } = await supabaseStore.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const user = data.users.find((u: any) => u.email === email);
      if (user?.id) await supabaseStore.auth.admin.deleteUser(user.id);
    } catch (error: any) {
      console.warn('[root-delete] No se pudo borrar usuario de tienda:', email, error?.message);
    }
  }
}

async function deletePersonFromRoot(input: {
  userId: string;
  customerId?: string | number | null;
  name?: string | null;
  phone?: string | null;
}) {
  const deleted: Record<string, number> = {};

  const selectedCustomers = input.customerId
    ? await safeSelect(supabaseServer, 'customers', '*', (q) => q.eq('id', input.customerId).eq('user_id', input.userId))
    : [];

  const baseCustomer = selectedCustomers[0] ?? null;
  const canonical = cleanName(input.name ?? baseCustomer?.full_name ?? baseCustomer?.canonical_name ?? baseCustomer?.normalized_name ?? '');
  const phones = phoneVariants(input.phone, baseCustomer?.phone, baseCustomer?.wa_number, baseCustomer?.whatsapp_number);

  const allCustomers = await safeSelect(supabaseServer, 'customers', '*', (q) => q.eq('user_id', input.userId));
  const customerIds = [...new Set((allCustomers as any[])
    .filter((c: any) => {
      if (input.customerId && String(c.id) === String(input.customerId)) return true;
      const nameMatch = canonical && [c.full_name, c.canonical_name, c.normalized_name].some(v => cleanName(v) === canonical);
      const customerPhones = phoneVariants(c.phone, c.wa_number, c.whatsapp_number);
      const phoneMatch = phones.length > 0 && customerPhones.some(p => phones.includes(p));
      return nameMatch || phoneMatch;
    })
    .map((c: any) => Number(c.id))
    .filter(Boolean))];

  const pagos = await safeSelect(supabaseServer, 'pagos', 'id,nombre,customer_id', (q) => q.eq('user_id', input.userId));
  const pagoIds = [...new Set((pagos as any[])
    .filter((p: any) => customerIds.includes(Number(p.customer_id)) || (canonical && cleanName(p.nombre) === canonical))
    .map((p: any) => Number(p.id))
    .filter(Boolean))];

  const pedidos = await safeSelect(supabaseServer, 'pedidos', 'id,customer_id,customer_name', (q) => q.eq('user_id', input.userId));
  const pedidoIds = [...new Set((pedidos as any[])
    .filter((p: any) => customerIds.includes(Number(p.customer_id)) || (canonical && cleanName(p.customer_name) === canonical))
    .map((p: any) => Number(p.id))
    .filter(Boolean))];

  const labelOrders = customerIds.length > 0
    ? await safeSelect(supabaseServer, 'orders', 'id', (q) => q.in('customer_id', customerIds))
    : [];
  const orderIds = [...new Set((labelOrders as any[]).map((o: any) => Number(o.id)).filter(Boolean))];

  const profileRows = await safeSelect(supabaseServer, 'identity_profiles', 'id,cliente_id,phone,display_name,store_phone,panel_phone', (q) => q.eq('user_id', input.userId));
  const profileIds = [...new Set((profileRows as any[])
    .filter((p: any) => {
      const identityPhones = phoneVariants(p.phone, p.store_phone, p.panel_phone);
      return customerIds.includes(Number(p.cliente_id)) ||
        (canonical && cleanName(p.display_name) === canonical) ||
        (phones.length > 0 && identityPhones.some(v => phones.includes(v)));
    })
    .map((p: any) => String(p.id))
    .filter(Boolean))];

  if (profileIds.length > 0) {
    await safeDelete(supabaseServer, 'identity_evidence', 'identidad_evidencia', deleted, (q) => q.in('profile_id', profileIds));
  }
  if (pagoIds.length > 0) {
    await safeDelete(supabaseServer, 'identity_evidence', 'identidad_evidencia', deleted, (q) => q.eq('user_id', input.userId).eq('source', 'manual_payment').in('source_id', pagoIds.map(String)));
  }
  if (profileIds.length > 0) {
    await safeDelete(supabaseServer, 'identity_profiles', 'identidad_perfiles', deleted, (q) => q.in('id', profileIds));
  }

  const rawIdsFromCandidates = canonical
    ? await safeSelect(supabaseServer, 'parsed_payment_candidates', 'raw_event_id', (q) => q.eq('payer_name_canonical', canonical))
    : [];
  const rawIds = [...new Set((rawIdsFromCandidates as any[]).map((r: any) => r.raw_event_id).filter(Boolean))];
  if (rawIds.length > 0) {
    await safeDelete(supabaseServer, 'raw_notification_events', 'notificaciones_banco', deleted, (q) => q.in('id', rawIds));
  }

  if (phones.length > 0) {
    await safeDelete(supabaseServer, 'whatsapp_message_queue', 'cola_whatsapp', deleted, (q) => q.in('phone', phones));
  }

  if (orderIds.length > 0) {
    for (const orderId of orderIds) {
      try {
        await supabaseServer.rpc('fn_release_container', {
          p_order_id: orderId,
          p_released_by: 'root-delete',
          p_reason: 'ROOT_DELETE',
        });
      } catch {
        // Si no tenía casillero activo, seguimos borrando el resto.
      }
    }
    await safeDelete(supabaseServer, 'container_allocations', 'casilleros_asignaciones', deleted, (q) => q.in('order_id', orderIds));
    await safeDelete(supabaseServer, 'order_bags', 'bolsas', deleted, (q) => q.in('order_id', orderIds));
    await safeDelete(supabaseServer, 'orders', 'pedidos_etiquetas', deleted, (q) => q.in('id', orderIds));
  }

  if (pedidoIds.length > 0) {
    await safeDelete(supabaseServer, 'pedidos', 'pedidos', deleted, (q) => q.in('id', pedidoIds).eq('user_id', input.userId));
  }
  if (pagoIds.length > 0) {
    await safeDelete(supabaseServer, 'pagos', 'pagos', deleted, (q) => q.in('id', pagoIds).eq('user_id', input.userId));
  }
  if (customerIds.length > 0) {
    await safeDelete(supabaseServer, 'customers', 'perfiles', deleted, (q) => q.in('id', customerIds).eq('user_id', input.userId));
  }

  // Tienda online
  const storeCustomers = phones.length > 0
    ? await safeSelect(supabaseStore, 'store_customers', 'id,whatsapp,display_name', (q) => q.in('whatsapp', phones))
    : [];
  const storeCustomerIds = [...new Set((storeCustomers as any[]).map((c: any) => Number(c.id)).filter(Boolean))];
  const storeOrders = await safeSelect(supabaseStore, 'store_orders', 'id,customer_id,customer_wa,customer_name', (q) => q.select('*'));
  const storeOrderIds = [...new Set((storeOrders as any[])
    .filter((o: any) => {
      const orderPhones = phoneVariants(o.customer_wa, o.customer_phone);
      return storeCustomerIds.includes(Number(o.customer_id)) ||
        (canonical && cleanName(o.customer_name) === canonical) ||
        (phones.length > 0 && orderPhones.some(v => phones.includes(v)));
    })
    .map((o: any) => Number(o.id))
    .filter(Boolean))];
  if (storeOrderIds.length > 0) {
    await safeDelete(supabaseStore, 'payment_events', 'tienda_pagos_banco', deleted, (q) => q.in('matched_order_id', storeOrderIds));
    await safeDelete(supabaseStore, 'wa_messages', 'tienda_whatsapp', deleted, (q) => q.in('matched_order_id', storeOrderIds));
    await safeDelete(supabaseStore, 'store_orders', 'tienda_pedidos', deleted, (q) => q.in('id', storeOrderIds));
  }
  if (phones.length > 0) {
    await safeDelete(supabaseStore, 'payment_events', 'tienda_pagos_banco', deleted, (q) => q.in('sender_wa', phones));
    await safeDelete(supabaseStore, 'wa_messages', 'tienda_whatsapp', deleted, (q) => q.in('from_wa', phones));
  }
  if (storeCustomerIds.length > 0) {
    await safeDelete(supabaseStore, 'store_customers', 'tienda_perfiles', deleted, (q) => q.in('id', storeCustomerIds));
  }
  if (phones.length > 0) await deleteStoreAuthUsers(phones);

  // Panel WhatsApp
  const panelClientes = phones.length > 0
    ? await safeSelect(supabasePanel, 'panel_clientes', 'id,phone', (q) => q.in('phone', phones))
    : [];
  const panelClienteIds = [...new Set((panelClientes as any[]).map((c: any) => String(c.id)).filter(Boolean))];
  if (phones.length > 0) {
    await safeDelete(supabasePanel, 'tarjetas_venta_live', 'panel_tarjetas', deleted, (q) => q.in('phone', phones));
    await safeDelete(supabasePanel, 'pedidos_venta_live', 'panel_pedidos', deleted, (q) => q.in('phone', phones));
    await safeDelete(supabasePanel, 'pagos_venta_live', 'panel_pagos', deleted, (q) => q.in('phone', phones));
  }
  if (panelClienteIds.length > 0) {
    await safeDelete(supabasePanel, 'evidencias_venta_live', 'panel_evidencias', deleted, (q) => q.in('cliente_id', panelClienteIds));
    await safeDelete(supabasePanel, 'pagos_venta_live', 'panel_pagos', deleted, (q) => q.in('cliente_id', panelClienteIds));
    await safeDelete(supabasePanel, 'pedidos_venta_live', 'panel_pedidos', deleted, (q) => q.in('cliente_id', panelClienteIds));
    await safeDelete(supabasePanel, 'tarjetas_venta_live', 'panel_tarjetas', deleted, (q) => q.in('cliente_id', panelClienteIds));
    await safeDelete(supabasePanel, 'panel_mensajes', 'panel_chats', deleted, (q) => q.in('cliente_id', panelClienteIds));
    await safeDelete(supabasePanel, 'panel_clientes', 'panel_perfiles', deleted, (q) => q.in('id', panelClienteIds));
  }

  return { success: true, customerIds, canonical, phones, deleted };
}

const app = express();
const PORT = Number(process.env.PORT || 3001);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ==========================================================================
  // SISTEMA DE ETIQUETAS (Supabase)
  // ==========================================================================

  // Crear pedido y asignar casillero automáticamente (botón "PEDIDO LISTO")
  app.post("/api/orders", async (req, res) => {
    try {
      const { customerId, totalItems, totalBags, totalAmount = 0, notes, assignedBy = "operator" } = req.body;
      if (!customerId || !totalBags) {
        return res.status(400).json({ error: "customerId y totalBags son requeridos" });
      }

      const logistics_type = totalBags >= 2 ? "COMPLEX" : "SIMPLE";
      const order_code = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const { data: order, error: orderErr } = await supabaseServer
        .from("orders")
        .insert({
          customer_id: customerId,
          order_code,
          logistics_type,
          total_bags: totalBags,
          total_items: totalItems ?? 0,
          total_amount: totalAmount,
          notes,
          order_status: "IN_PROCESS",
        })
        .select()
        .single();

      if (orderErr || !order) throw orderErr ?? new Error("No se creó el pedido");

      const bagsRows = Array.from({ length: totalBags }, (_, i) => ({
        order_id: order.id,
        bag_number: i + 1,
      }));
      await supabaseServer.from("order_bags").insert(bagsRows);

      const { data: assignData, error: assignErr } = await supabaseServer.rpc("fn_assign_container", {
        p_order_id: order.id,
        p_assigned_by: assignedBy,
      });
      if (assignErr) throw assignErr;

      const raw = Array.isArray(assignData) ? assignData[0] : assignData;
      const label = {
        container_id: raw.out_container_id,
        container_code: raw.out_container_code,
        allocation_id: raw.out_allocation_id,
      };
      res.status(201).json({ order, label });
    } catch (err: any) {
      console.error("[/api/orders] error:", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  // Actualizar cantidad de bolsas — puede disparar migración SIMPLE → COMPLEX
  app.post("/api/orders/:id/update-bags", async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { newTotalBags, migratedBy = "operator" } = req.body;
      if (!newTotalBags || newTotalBags < 1) {
        return res.status(400).json({ error: "newTotalBags inválido" });
      }

      const { data: current, error: readErr } = await supabaseServer
        .from("orders")
        .select("logistics_type, total_bags")
        .eq("id", orderId)
        .single();
      if (readErr || !current) return res.status(404).json({ error: "Pedido no encontrado" });

      const wasSimple = current.logistics_type === "SIMPLE";
      const shouldBeComplex = newTotalBags >= 2;

      if (wasSimple && shouldBeComplex) {
        const { data, error } = await supabaseServer.rpc("fn_migrate_to_complex", {
          p_order_id: orderId,
          p_new_total_bags: newTotalBags,
          p_migrated_by: migratedBy,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        return res.json({
          migrated: true,
          label: {
            container_id: row.out_new_container_id,
            container_code: row.out_new_container_code,
            allocation_id: row.out_new_allocation_id,
            old_container_code: row.out_old_container_code,
          },
        });
      }

      await supabaseServer.from("orders").update({ total_bags: newTotalBags }).eq("id", orderId);
      res.json({ migrated: false });
    } catch (err: any) {
      console.error("[/api/orders/:id/update-bags] error:", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  // Entregar pedido → libera casillero
  app.post("/api/orders/:id/deliver", async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { releasedBy = "operator" } = req.body ?? {};
      const { error } = await supabaseServer.rpc("fn_release_container", {
        p_order_id: orderId,
        p_released_by: releasedBy,
        p_reason: "DELIVERED",
      });
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      console.error("[/api/orders/:id/deliver] error:", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  // Panel de ocupación de casilleros
  app.get("/api/storage/containers", async (_req, res) => {
    try {
      const { data, error } = await supabaseServer
        .from("storage_containers")
        .select("*")
        .order("priority_order", { ascending: true });
      if (error) throw error;
      res.json({ containers: data ?? [] });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  // Historial de asignaciones de un pedido
  app.get("/api/orders/:id/allocation-history", async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { data, error } = await supabaseServer
        .from("container_allocations")
        .select("*, storage_containers(container_code)")
        .eq("order_id", orderId)
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      res.json({ history: data ?? [] });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  // Leer configuración global de casilleros
  app.get("/api/storage/config", async (_req, res) => {
    try {
      const { data, error } = await supabaseServer
        .from("app_config")
        .select("value")
        .eq("key", "numeric_container_capacity")
        .single();
      if (error) throw error;
      res.json({ numeric_capacity: Number(data?.value ?? 4) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  // Actualizar capacidad global de casilleros numéricos
  // Aplica a TODOS los casilleros NUMERIC_SHARED existentes y guarda el valor
  // para que los futuros también lo hereden.
  app.patch("/api/storage/config/numeric-capacity", async (req, res) => {
    try {
      const { capacity } = req.body;
      const cap = Number(capacity);
      if (!cap || cap < 1 || cap > 999) {
        return res.status(400).json({ error: "Capacidad debe ser un número entre 1 y 999" });
      }

      // 1. Guardar en tabla de configuración global
      await supabaseServer
        .from("app_config")
        .upsert({ key: "numeric_container_capacity", value: String(cap), updated_at: new Date() });

      // 2. Aplicar a TODOS los casilleros numéricos existentes de una sola vez
      const { error: updateErr } = await supabaseServer
        .from("storage_containers")
        .update({ max_simple_orders: cap, max_bags_capacity: cap })
        .eq("container_type", "NUMERIC_SHARED");

      if (updateErr) throw updateErr;

      res.json({ success: true, numeric_capacity: cap });
    } catch (err: any) {
      console.error("[/api/storage/config/numeric-capacity] error:", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  // ==========================================================================
  // CLIENTES
  // ==========================================================================

  app.get("/api/clientes", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("customers")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("full_name", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  });

  app.post("/api/clientes", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { name, canonicalName, phone } = req.body;
    const candidateName = canonicalName ?? cleanName(name);

    const { data: existingCustomers } = await supabaseServer
      .from("customers")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(300);

    const matches = (existingCustomers ?? []).filter((c: any) =>
      isStrongNameMatch(c.canonical_name || c.full_name || c.normalized_name, candidateName)
    );

    if (matches.length === 1) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (phone && !matches[0].phone) updates.phone = phone;
      const { data, error } = await supabaseServer
        .from("customers")
        .update(updates)
        .eq("id", matches[0].id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    const { data, error } = await supabaseServer
      .from("customers")
      .insert({
        full_name: name,
        normalized_name: candidateName,
        canonical_name: candidateName,
        phone: phone ?? "",
        active_label: "",
        active_label_type: "",
        user_id: userId,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  });

  app.patch("/api/clientes/:id", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("customers")
      .update(req.body)
      .eq("id", req.params.id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.delete("/api/clientes/:id", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const result = await deletePersonFromRoot({
        userId,
        customerId: req.params.id,
        name: req.body?.name,
        phone: req.body?.phone,
      });
      res.json(result);
    } catch (error: any) {
      console.error("[/api/clientes/:id DELETE] root delete error:", error);
      res.status(500).json({ error: error?.message ?? "Error interno" });
    }
  });

  app.post("/api/admin/root-delete", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const { customerId, name, phone } = req.body ?? {};
      if (!customerId && !name && !phone) {
        return res.status(400).json({ error: "Falta cliente, nombre o teléfono" });
      }
      const result = await deletePersonFromRoot({ userId, customerId, name, phone });
      res.json(result);
    } catch (error: any) {
      console.error("[/api/admin/root-delete] error:", error);
      res.status(500).json({ error: error?.message ?? "Error interno" });
    }
  });

  app.post("/api/admin/reset-labels", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      if (req.body?.confirm !== "RESET") return res.status(400).json({ error: "Confirmación inválida" });
      const result = await resetLabelsForUser(userId, { resetPedidoStatus: true });
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[/api/admin/reset-labels] error:", error);
      res.status(500).json({ error: error?.message ?? "Error interno" });
    }
  });

  app.post("/api/admin/delete-today", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      if (req.body?.confirm !== "BORRAR HOY") return res.status(400).json({ error: "Confirmación inválida" });
      const result = await deleteTodayForUser(userId);
      res.json(result);
    } catch (error: any) {
      console.error("[/api/admin/delete-today] error:", error);
      res.status(500).json({ error: error?.message ?? "Error interno" });
    }
  });

  app.post("/api/admin/delete-today-payments", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      if (req.body?.confirm !== "BORRAR PAGOS HOY") return res.status(400).json({ error: "Confirmación inválida" });
      const result = await deleteTodayPaymentsForUser(userId);
      res.json(result);
    } catch (error: any) {
      console.error("[/api/admin/delete-today-payments] error:", error);
      res.status(500).json({ error: error?.message ?? "Error interno" });
    }
  });

  app.get("/api/admin/store-profiles", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });

      const [storeCustomers, storeOrders] = await Promise.all([
        safeSelect(supabaseStore, 'store_customers', 'id,whatsapp,display_name,total_orders,total_spent,created_at', (q) => q.order('created_at', { ascending: false }).limit(300)),
        safeSelect(supabaseStore, 'store_orders', 'id,customer_id,customer_name,customer_wa,total,status,created_at', (q) => q.order('created_at', { ascending: false }).limit(500)),
      ]);

      const groups: Record<string, any> = {};

      for (const customer of storeCustomers as any[]) {
        const phone = phoneDigits(customer.whatsapp);
        const key = phone || `store-${customer.id}`;
        groups[key] = {
          key,
          source: 'store',
          storeCustomerId: customer.id,
          name: customer.display_name || 'Cliente tienda',
          phone,
          orders: [],
          total: Number(customer.total_spent ?? 0),
        };
      }

      for (const order of storeOrders as any[]) {
        const phone = phoneDigits(order.customer_wa);
        const key = phone || `store-order-${order.id}`;
        if (!groups[key]) {
          groups[key] = {
            key,
            source: 'store',
            storeCustomerId: order.customer_id ?? null,
            name: order.customer_name || 'Cliente tienda',
            phone,
            orders: [],
            total: 0,
          };
        }
        groups[key].orders.push(order);
        groups[key].total += Number(order.total ?? 0);
        if ((!groups[key].name || groups[key].name === 'Cliente tienda') && order.customer_name) {
          groups[key].name = order.customer_name;
        }
      }

      res.json(Object.values(groups));
    } catch (error: any) {
      console.error("[/api/admin/store-profiles] error:", error);
      res.status(500).json({ error: error?.message ?? "Error interno" });
    }
  });

  // ==========================================================================
  // PAGOS
  // ==========================================================================

  app.get("/api/pagos-lista", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("pagos")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const pagos = data ?? [];
    const pagoIds = pagos.map((p: any) => Number(p.id)).filter(Number.isFinite);
    let liveByPagoId = new Map<number, any>();

    if (pagoIds.length > 0) {
      const { data: livePagos, error: liveError } = await supabasePanel
        .from('pagos_venta_live')
        .select('id,main_pago_id,estado,match_reason')
        .in('main_pago_id', pagoIds);

      if (!liveError) {
        liveByPagoId = new Map((livePagos ?? []).map((p: any) => [Number(p.main_pago_id), p]));
      } else {
        console.warn('[pagos-lista] no se pudo enriquecer con panel WhatsApp:', liveError.message);
      }
    }

    const enriched = pagos.map((p: any) => {
      const livePago = liveByPagoId.get(Number(p.id));
      const method = String(p.method ?? '').toLowerCase();
      let verification_origin: 'automatic' | 'manual' | 'whatsapp_pending' | 'macrodroid_only' | 'other' = 'other';

      if (livePago?.estado === 'pendiente_whatsapp' || livePago?.estado === 'revision_manual') {
        verification_origin = 'whatsapp_pending';
      } else if (livePago?.estado === 'verificado_manual' || method.includes('manual')) {
        verification_origin = 'manual';
      } else if (livePago?.estado === 'verificado_macrodroid') {
        verification_origin = 'automatic';
      } else if (method.includes('notificación bancaria') || method.includes('notificacion bancaria')) {
        verification_origin = 'macrodroid_only';
      }

      return {
        ...p,
        verification_origin,
        live_payment_id: livePago?.id ?? null,
        live_payment_status: livePago?.estado ?? null,
      };
    });

    const { data: pendingLivePagos, error: pendingLiveError } = await supabasePanel
      .from('pagos_venta_live')
      .select('id,nombre_detectado,monto,estado,comprobante_at,created_at,phone,main_pago_id')
      .in('estado', ['pendiente_whatsapp', 'revision_manual'])
      .is('main_pago_id', null)
      .order('created_at', { ascending: false });

    if (pendingLiveError) {
      console.warn('[pagos-lista] no se pudo incluir pendientes WhatsApp:', pendingLiveError.message);
    }

    const pendingWhatsapp = (pendingLivePagos ?? []).map((p: any) => ({
      id: `live:${p.id}`,
      nombre: p.nombre_detectado || 'COMPROBANTE WHATSAPP PENDIENTE',
      pago: Number(p.monto ?? 0),
      method: 'Comprobante WhatsApp pendiente',
      status: 'pending',
      verified: false,
      date: p.comprobante_at ?? p.created_at,
      customer_id: null,
      user_id: userId,
      phone: p.phone ?? null,
      verification_origin: 'whatsapp_pending',
      live_payment_id: p.id,
      live_payment_status: p.estado,
      is_live_pending: true,
    }));

    res.json([...pendingWhatsapp, ...enriched]);
  });

  app.post("/api/pagos", async (req, res) => {
    try {
      const { nombre, pago, method, status, fecha, customerId, ...rest } = req.body;
      const userId = (req.headers["x-user-id"] as string) ?? "mobile";
      if (!nombre || !pago) return res.status(400).json({ error: "Nombre y pago son requeridos" });

      const { data, error } = await supabaseServer
        .from("pagos")
        .insert({
          nombre: cleanName(nombre),
          pago: Number(pago),
          method: method ?? "HTTP Request",
          status: status ?? "pending",
          date: fecha ? new Date(fecha) : new Date(),
          customer_id: customerId ?? null,
          user_id: userId,
        })
        .select()
        .single();
      if (error) throw error;
      res.status(201).json({ success: true, id: data.id, data });

      // Ingesta de identidad en background — nunca bloquea la respuesta al cliente
      ingestManualPayment(supabaseServer, userId, {
        id: String(data.id),
        nombre: cleanName(nombre),
        monto: Number(pago),
        fecha: data.date,
        clienteId: customerId ?? undefined,
      }).catch(e => console.warn('[identity] ingestManualPayment error:', e?.message));
    } catch (error: any) {
      console.error("Error registrando pago:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  });

  app.patch("/api/pagos/:id", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("pagos")
      .update(req.body)
      .eq("id", req.params.id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.delete("/api/pagos/:id", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });

    await safeDelete(supabaseServer, 'identity_evidence', 'identidad_evidencia', {}, (q) =>
      q.eq('user_id', userId).eq('source', 'manual_payment').eq('source_id', String(req.params.id))
    );

    await safeDelete(supabasePanel, 'pagos_venta_live', 'panel_pagos', {}, (q) =>
      q.eq('main_pago_id', Number(req.params.id))
    );

    const { error } = await supabaseServer
      .from("pagos")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // ==========================================================================
  // PEDIDOS (en la app)
  // ==========================================================================

  app.get("/api/pedidos", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("pedidos")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  });

  app.post("/api/pedidos", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { customerId, customerName, itemCount, bagCount, label, labelType, status, totalAmount } = req.body;
    const { data, error } = await supabaseServer
      .from("pedidos")
      .insert({
        customer_id: customerId ?? null,
        customer_name: customerName,
        item_count: itemCount ?? 0,
        bag_count: bagCount ?? 1,
        label: label ?? "",
        label_type: labelType ?? "",
        status: status ?? "procesar",
        total_amount: totalAmount ?? 0,
        user_id: userId,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  });

  app.patch("/api/pedidos/:id", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("pedidos")
      .update({ ...req.body, updated_at: new Date() })
      .eq("id", req.params.id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.delete("/api/pedidos/:id", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { error } = await supabaseServer
      .from("pedidos")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // ==========================================================================
  // TRANSACCIONES
  // ==========================================================================

  app.get("/api/transacciones", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("fecha", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  });

  app.post("/api/transacciones", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("transactions")
      .insert({ ...req.body, user_id: userId, fecha: req.body.fecha ?? new Date() })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  });

  app.patch("/api/transacciones/:id", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("transactions")
      .update(req.body)
      .eq("id", req.params.id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.delete("/api/transacciones/:id", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { error } = await supabaseServer
      .from("transactions")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // ==========================================================================
  // CATEGORÍAS
  // ==========================================================================

  app.get("/api/categorias", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("categories")
      .select("*")
      .eq("user_id", userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  });

  app.post("/api/categorias", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("categories")
      .insert({ ...req.body, user_id: userId })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  });

  app.patch("/api/categorias/:id", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("categories")
      .update({ ...req.body, updated_at: new Date() })
      .eq("id", req.params.id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.delete("/api/categorias/:id", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { error } = await supabaseServer
      .from("categories")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // ==========================================================================
  // LIVE SESSIONS
  // ==========================================================================

  app.get("/api/lives", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("live_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("scheduled_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  });

  app.post("/api/lives", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("live_sessions")
      .insert({ ...req.body, user_id: userId })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  });

  app.patch("/api/lives/:id", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("live_sessions")
      .update(req.body)
      .eq("id", req.params.id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.delete("/api/lives/:id", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { error } = await supabaseServer
      .from("live_sessions")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // ==========================================================================
  // IDEAS
  // ==========================================================================

  app.get("/api/ideas", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("ideas")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  });

  app.post("/api/ideas", async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseServer
      .from("ideas")
      .insert({ ...req.body, user_id: userId })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  });

  // ==========================================================================
  // AUTH — Supabase Auth (login/logout/register)
  // ==========================================================================

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email y contraseña requeridos" });
    const { data, error } = await supabaseServer.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });
    res.json({ user: data.user, session: data.session });
  });

  app.post("/api/auth/register", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email y contraseña requeridos" });
    const { data, error } = await supabaseServer.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ user: data.user });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) await supabaseServer.auth.admin.signOut(token);
    res.json({ success: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Token requerido" });
    const { data, error } = await supabaseServer.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: "Token inválido" });
    res.json({ user: data.user });
  });

  // ==========================================================================
  // PRODUCTS (TIENDA)
  
  // ==========================================================================
  // STORE AUTH — Registro y Login con Número + PIN
  // El cliente solo ve: número de WhatsApp + PIN de 4 dígitos.
  // En segundo plano creamos: phone@tiendaleydi.com / pin-XXXX en Supabase Auth.
  // ==========================================================================

  app.post("/api/store-auth/register", async (req, res) => {
    try {
      const { phone, pin, name } = req.body;
      if (!phone || !pin) return res.status(400).json({ error: "Faltan datos" });
      if (String(pin).length !== 4) return res.status(400).json({ error: "El PIN debe tener 4 dígitos" });

      const cleanPhone = phone.trim().replace(/\D/g, ''); // Solo dígitos
      const email = `${cleanPhone}@tiendaleydi.com`;
      const password = `pin-${pin.trim()}`;

      // Crear usuario en supabaseStore (TiendaOnline) — no en ChehiApp
      const { data, error } = await supabaseStore.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Sin verificación de email — experiencia sin fricción
        user_metadata: { name: name || '', phone: cleanPhone }
      });

      if (error) {
        if (error.message?.includes('already registered')) {
          return res.status(409).json({ error: "Este número ya tiene cuenta. Ingresa tu PIN para entrar." });
        }
        throw error;
      }

      // También guardar en tabla store_customers
      await supabaseStore.from('store_customers').insert({
        whatsapp: cleanPhone,
        pin_hash: password, // En producción usar bcrypt. Por ahora guardamos referencia.
        display_name: name || ''
      }).select().single();

      res.json({ success: true, userId: data.user?.id });
    } catch (err: any) {
      console.error("[store-auth] Register error:", err);
      res.status(500).json({ error: err?.message || "Error al crear perfil" });
    }
  });

  app.post("/api/store-auth/login", async (req, res) => {
    try {
      const { phone, pin } = req.body;
      if (!phone || !pin) return res.status(400).json({ error: "Número y PIN requeridos" });

      const cleanPhone = phone.trim().replace(/\D/g, '');
      const email = `${cleanPhone}@tiendaleydi.com`;
      const password = `pin-${pin.trim()}`;

      // Login con las credenciales "fantasma" en supabaseStore (TiendaOnline)
      const { data, error } = await supabaseStore.auth.signInWithPassword({ email, password });

      if (error) {
        return res.status(401).json({ error: "Número o PIN incorrecto" });
      }

      // Traer datos del cliente (pedidos anteriores)
      const { data: customer } = await supabaseStore
        .from('store_customers')
        .select('id, display_name, whatsapp, total_orders, total_spent')
        .eq('whatsapp', cleanPhone)
        .single();

      res.json({
        success: true,
        session: data.session,
        user: { ...data.user?.user_metadata, id: data.user?.id },
        customer
      });
    } catch (err: any) {
      console.error("[store-auth] Login error:", err);
      res.status(500).json({ error: err?.message || "Error al iniciar sesión" });
    }
  });

  app.get("/api/store-auth/me", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: "Token requerido" });

      const { data, error } = await supabaseStore.auth.getUser(token);
      if (error || !data.user) return res.status(401).json({ error: "Sesión inválida" });

      const cleanPhone = data.user.email?.replace('@tiendaleydi.com', '') ?? '';
      const { data: customer } = await supabaseStore
        .from('store_customers')
        .select('*')
        .eq('whatsapp', cleanPhone)
        .single();

      const { data: orders } = await supabaseStore
        .from('store_orders')
        .select('id, status, total, created_at, items, payment_verified_at, expires_at, customer_wa')
        .eq('customer_wa', cleanPhone)
        .order('created_at', { ascending: false })
        .limit(20);

      res.json({ user: data.user, customer, orders: orders ?? [] });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Error interno" });
    }
  });

  // Upload de imágenes — usa supabaseStore (TiendaOnline)
  app.post("/api/upload-image", async (req, res) => {
    try {
      const { base64Data, fileName, contentType } = req.body;
      if (!base64Data || !fileName) return res.status(400).json({ error: "Faltan datos" });
      
      const base64String = base64Data.split(',')[1] || base64Data;
      const buffer = Buffer.from(base64String, 'base64');
      
      // Primero intentar en TiendaOnline, con fallback a ChehiApp
      let uploadResult = await supabaseStore.storage
        .from('store_images')
        .upload(fileName, buffer, { contentType: contentType || 'image/webp', upsert: true });

      if (uploadResult.error) {
        // Fallback: intentar en la base original
        uploadResult = await supabaseServer.storage
          .from('store_images')
          .upload(fileName, buffer, { contentType: contentType || 'image/webp', upsert: true });
        if (uploadResult.error) throw uploadResult.error;
        const { data: urlData } = supabaseServer.storage.from('store_images').getPublicUrl(uploadResult.data.path);
        return res.json({ publicUrl: urlData.publicUrl });
      }

      const { data: publicUrlData } = supabaseStore.storage
        .from('store_images')
        .getPublicUrl(uploadResult.data.path);
        
      res.json({ publicUrl: publicUrlData.publicUrl });
    } catch (err: any) {
      console.error("Upload error:", err);
      res.status(500).json({ error: err?.message || "Error al subir imagen" });
    }
  });

  app.use('/api/ai', createAiRouter(supabaseServer, supabasePanel));
  app.use('/api/identity', createIdentityRouter(supabaseServer, supabaseStore, supabasePanel));
  app.use('/api/live-sales', createLiveSalesRouter(supabasePanel, supabaseServer, supabaseStore));
  app.use('/api/whatsapp', createWhatsappRouter(supabaseServer));
  app.use('/api/store', createStoreSelectionRouter(supabaseStore));
  app.use('/api/store', createStoreSettingsRouter(supabaseStore));
  // ==========================================================================

  app.get("/api/products", async (req, res) => {
    try {
      const showAll = req.query.admin === "true" && req.headers["x-user-id"];
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50; // Por defecto 50, se puede pedir menos (ej. 15)
      const category = req.query.category as string;
      const search = req.query.search as string;

      let query = supabaseStore.from("products").select("*", { count: 'exact' });

      if (!showAll) query = query.eq("available", true);
      
      if (category && category !== 'Todos') {
        query = query.eq("category", category);
      }

      if (search) {
        query = query.ilike("name", `%${search}%`);
      }

      // Orden y paginación
      query = query.order("created_at", { ascending: false })
                   .range((page - 1) * limit, (page * limit) - 1);

      const { data, count, error } = await query;
      if (error) throw error;
      
      res.json({
        data: data ?? [],
        total: count ?? 0,
        page,
        limit,
        hasMore: count ? (page * limit) < count : false
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const { name, price, description, category, sizes, image_url, images, available } = req.body;
      if (!name || price === undefined) {
        return res.status(400).json({ error: "name y price requeridos" });
      }
      const { data, error } = await supabaseStore
        .from("products")
        .insert({
          name,
          price: Number(price),
          description: description ?? "",
          category: category ?? "General",
          sizes: Array.isArray(sizes) ? sizes : [],
          images: Array.isArray(images) ? images : [],
          available: available ?? true,
        })
        .select()
        .single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  app.patch("/api/products/:id", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const { data, error } = await supabaseStore
        .from("products")
        .update(req.body)
        .eq("id", Number(req.params.id))
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const { error } = await supabaseStore
        .from("products")
        .delete()
        .eq("id", Number(req.params.id));
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  // ==========================================================================
  // TIENDA (STORE ORDERS)
  // ==========================================================================

  // GET público: devuelve qué productos están reservados y cuándo se liberan
  // ⚠️ DEBE IR ANTES de /:id/status para que Express no lo capture como :id="reserved-products"
  app.get("/api/store-orders/reserved-products", async (req, res) => {
    try {
      const now = new Date().toISOString();
      const { data: pendingOrders } = await supabaseStore
        .from("store_orders")
        .select("id, items, expires_at")
        .eq("status", "pending")
        .gt("expires_at", now);

      const reservedMap: Record<string, string> = {};
      for (const order of (pendingOrders ?? [])) {
        const expiresAt = order.expires_at as string;
        for (const item of (order.items ?? [])) {
          if (item.productId) {
            reservedMap[String(item.productId)] = expiresAt;
          }
        }
      }

      res.json(reservedMap);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  // GET público: permite al Checkout hacer polling del estado del pedido
  app.get("/api/store-orders/:id/status", async (req, res) => {
    try {
      const { data, error } = await supabaseStore
        .from("store_orders")
        .select("id, status, payment_verified_at")
        .eq("id", Number(req.params.id))
        .single();
      if (error) throw error;
      res.json({ id: data.id, status: data.status, verifiedAt: data.payment_verified_at });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });



  app.post("/api/store-orders", async (req, res) => {
    try {
      const {
        items,
        total,
        customerName,
        customerPhone,
        delivery_type,
        delivery_date,
        delivery_slot,
        delivery_address,
        delivery_notes,
      } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items requerido (array no vacío)" });
      }

      // ── RESERVA EXCLUSIVA: verificar que los productos no estén en otro pedido pending ──
      const productIds = items.map((i: any) => String(i.productId)).filter(Boolean);

      if (productIds.length > 0) {
        // Buscar pedidos pending que contengan alguno de estos productos
        const { data: pendingOrders } = await supabaseStore
          .from("store_orders")
          .select("id, items, expires_at")
          .eq("status", "pending");

        const now = new Date();
        const conflictProducts: string[] = [];

        for (const po of (pendingOrders ?? [])) {
          // Ignorar pedidos ya expirados (serán limpiados por el intervalo)
          if (po.expires_at && new Date(po.expires_at) < now) continue;

          const poProductIds = (po.items ?? []).map((i: any) => String(i.productId));
          for (const pid of productIds) {
            if (poProductIds.includes(pid)) {
              conflictProducts.push(pid);
            }
          }
        }

        if (conflictProducts.length > 0) {
          return res.status(409).json({
            error: "Uno o más productos están reservados por otra persona. Se liberarán pronto si no se confirma el pago.",
            conflictProducts,
          });
        }
      }

      // ── Verificar que los productos existan y estén disponibles ──
      if (productIds.length > 0) {
        const { data: prods } = await supabaseStore
          .from("products")
          .select("id, available")
          .in("id", productIds);

        const unavailable = (prods ?? []).filter((p: any) => !p.available);
        if (unavailable.length > 0) {
          return res.status(409).json({
            error: "Uno o más productos ya no están disponibles.",
            unavailableProducts: unavailable.map((p: any) => p.id),
          });
        }
      }

      let userId = null;
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) {
        const { data: authUser } = await supabaseServer.auth.getUser(token);
        if (authUser?.user) {
          userId = authUser.user.id;
        }
      }

      const RESERVATION_MINUTES = 10;
      const { data, error } = await supabaseStore
        .from("store_orders")
        .insert({
          items: items,
          total: total ?? 0,
          customer_name: customerName ?? "",
          customer_wa: customerPhone ?? "",
          delivery_type: delivery_type ?? null,
          delivery_date: delivery_date ?? null,
          delivery_slot: delivery_slot ?? null,
          delivery_address: delivery_address ?? null,
          delivery_notes: delivery_notes ?? null,
          delivery_status: "pending",
          status: "pending",
          expires_at: new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000).toISOString(),
        } as any)
        .select()
        .single();
      if (error) throw error;

      console.log(`[store] 🛒 Pedido #${data.id} creado. ${productIds.length} productos reservados por ${RESERVATION_MINUTES} min.`);
      res.status(201).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  // ── EXPIRACIÓN AUTOMÁTICA: cada 30 seg, cancelar pedidos sin pago ──────
  setInterval(async () => {
    try {
      const now = new Date().toISOString();
      const { data: expired } = await supabaseStore
        .from("store_orders")
        .select("id, items")
        .eq("status", "pending")
        .lt("expires_at", now);

      if (!expired?.length) return;

      for (const order of expired) {
        await supabaseStore
          .from("store_orders")
          .update({ status: "cancelled" } as any)
          .eq("id", order.id)
          .eq("status", "pending");

        // Liberar los productos (volver a mostrarlos en la tienda)
        const pIds = (order.items ?? []).map((i: any) => i.productId).filter(Boolean);
        if (pIds.length > 0) {
          await supabaseStore
            .from("products")
            .update({ available: true } as any)
            .in("id", pIds);
        }

        console.log(`[store] ⏰ Pedido #${order.id} expirado. ${pIds.length} productos liberados.`);
      }
    } catch (e) {
      // Silencioso — no bloquear el servidor
    }
  }, 30 * 1000); // cada 30 segundos

  app.get("/api/store-orders/me", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token requerido" });
      const { data: authUser, error: userErr } = await supabaseServer.auth.getUser(token);
      if (userErr || !authUser.user) return res.status(401).json({ error: "Token inválido" });
      
      const userId = authUser.user.id;
      
      const { data, error } = await supabaseStore
        .from("store_orders")
        .select("*")
        .eq("customer_wa", authUser.user.email?.replace('@tiendaleydi.com','') ?? '')
        .order("created_at", { ascending: false });
        
      if (error) throw error;
      res.json(data ?? []);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  // Admin: ver todos los pedidos de la tienda (más reciente primero)
  app.get("/api/store-orders/admin", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });

      const { data, error } = await supabaseStore
        .from("store_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      res.json(data ?? []);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  app.get("/api/store-orders", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token requerido" });
      const { data: user, error: userErr } = await supabaseServer.auth.getUser(token);
      if (userErr || !user.user) return res.status(401).json({ error: "Token inválido" });
      const { data, error } = await supabaseStore
        .from("store_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      res.json(data ?? []);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  app.patch("/api/store-orders/:id", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Token requerido" });
      const { data: user, error: userErr } = await supabaseServer.auth.getUser(token);
      if (userErr || !user.user) return res.status(401).json({ error: "Token inválido" });
      const { status, wa_sent, hideProducts } = req.body;
      const updateData: any = {};
      if (status) updateData.status = status;
      if (wa_sent !== undefined) updateData.wa_sent = wa_sent;
      const { data, error } = await supabaseStore
        .from("store_orders")
        .update(updateData)
        .eq("id", Number(req.params.id))
        .select()
        .single();
      if (error) throw error;

      // Ocultar productos automáticamente si se solicitó
      if (hideProducts && status === 'confirmed' && data.items) {
        try {
          const productIds = data.items.map((i: any) => i.productId).filter(Boolean);
          if (productIds.length > 0) {
            await supabaseStore
              .from("products")
               .update({ stock: 0 })
              .in("id", productIds);
          }
        } catch (e) {
          console.error("Error al ocultar productos del pedido:", e);
        }
      }

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });

  // ==========================================================================
  // MOTOR DE CUADRANGULACIÓN — Verificación de pagos de la tienda
  // ==========================================================================
  //
  // Flujo A (máxima seguridad): banco + WhatsApp + código pedido → verified
  // Flujo B (banco solo):       banco + número coincide → verified
  // Flujo C (WA solo):          WhatsApp + código → pending_manual_review
  //
  // Llamado por:
  //   1. MacroDroid → POST /api/store/ingest-bank  (notificación bancaria)
  //   2. Panel WA   → POST /api/store/ingest-wa    (mensaje del cliente)
  //   3. Webhook    → POST /api/store/match-payment (cruce manual/automático)

  /**
   * Motor interno de cruce HÍBRIDO INTELIGENTE
   * Retorna { order, confidence } donde confidence es:
   *   'maxima'  = banco + WA + código pedido coinciden (6/6 puntos)
   *   'alta'    = monto único en ventana → solo 1 candidato posible
   *   'media'   = monto coincide pero hay múltiples candidatos (necesita WA)
   *   'none'    = no hay match
   */
  async function tryMatchOrder(params: {
    amount?: number;
    senderPhone?: string;
    orderRef?: string;   // "#1042" → "1042"
    windowMinutes?: number;
  }): Promise<{ order: any; confidence: 'maxima' | 'alta' | 'media' } | null> {
    const { amount, senderPhone, orderRef, windowMinutes = 2 } = params;
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    // Buscar TODOS los pedidos pendientes en la ventana de tiempo
    let query = supabaseStore
      .from('store_orders')
      .select('*')
      .eq('status', 'pending')
      .gt('created_at', windowStart);

    // Filtrar por monto exacto si viene
    if (amount) query = query.eq('total', amount);

    const { data: candidates, error } = await query.order('created_at', { ascending: false });
    if (error || !candidates?.length) return null;

    // ── NIVEL MÁXIMA: código de pedido + monto + número WA ──────
    // Si el mensaje de WA trae el código #1042, es match exacto
    if (orderRef) {
      const refId = Number(orderRef.replace(/\D/g, ''));
      const exact = candidates.find((o: any) => o.id === refId);
      if (exact) {
        console.log(`[store-match] MAXIMA: pedido #${refId} verificado por código + monto`);
        return { order: exact, confidence: 'maxima' };
      }
    }

    // ── NIVEL ALTA: monto ÚNICO en la ventana ───────────────────
    // Si solo hay 1 pedido pendiente con ese monto exacto → seguro
    if (candidates.length === 1) {
      console.log(`[store-match] ALTA: pedido #${candidates[0].id} — monto único (${amount} Bs)`);
      return { order: candidates[0], confidence: 'alta' };
    }

    // ── NIVEL MEDIA: hay múltiples pedidos con el mismo monto ───
    // Intentar filtrar por número de WhatsApp si viene
    if (senderPhone) {
      const clean = senderPhone.replace(/\D/g, '');
      const byPhone = candidates.filter((o: any) =>
        o.customer_wa && o.customer_wa.includes(clean)
      );
      if (byPhone.length === 1) {
        console.log(`[store-match] ALTA: pedido #${byPhone[0].id} — desempate por WA ${clean}`);
        return { order: byPhone[0], confidence: 'alta' };
      }
    }

    // Múltiples candidatos, no se puede decidir → no verificar automáticamente
    console.log(`[store-match] MEDIA: ${candidates.length} pedidos de ${amount} Bs — necesita WA con código`);
    return null; // No verificar — esperar WA con código o verificación manual
  }

  /**
   * Marca un pedido como pagado, oculta los productos vendidos,
   * y UNIFICA la identidad para inyectar el pedido a la Mesa de Preparación (Casilleros).
   */
  async function confirmStoreOrder(orderId: number, source: string) {
    const now = new Date().toISOString();

    const { data, error } = await supabaseStore
      .from('store_orders')
      .update({
        status: 'paid',
        payment_verified_at: now,
        payment_method: 'qr',
        payment_ref: source,
      } as any)
      .eq('id', orderId)
      .eq('status', 'pending')   // idempotencia: solo si sigue pending
      .select()
      .single();

    if (error || !data) return false;
    
    // 0. Encolar mensaje de WhatsApp confirmando el pedido
    if (data.customer_wa) {
      enqueueStoreConfirmation(
        supabaseStore, 
        (data.user_id || 'mobile'), 
        data.customer_wa, 
        data.id
      ).catch(e => console.error('[whatsapp-queue] Error encolando confirmación:', e));
    }


    // 1. Ocultar productos vendidos
    try {
      const productIds = (data.items ?? []).map((i: any) => i.productId).filter(Boolean);
      if (productIds.length > 0) {
        await supabaseStore.from('products').update({ stock: 0 }).in('id', productIds);
      }
    } catch (e) {
      console.error('[store-match] Error ocultando productos:', e);
    }

    // 2. FUSIÓN DE IDENTIDAD GLOBAL Y ENVÍO A ALMACÉN
    try {
      // Intentar obtener el nombre real desde el evento de pago si la fuente es el banco
      let finalName = '';
      if (source.includes('bank') || source.includes('macrodroid')) {
         const { data: bankEvent } = await supabaseServer
           .from('payment_events')
           .select('sender_name')
           .eq('matched_order_id', orderId)
           .single();
         if (bankEvent?.sender_name) finalName = bankEvent.sender_name;
      }

      const waNumber = data.customer_wa;
      let globalCustomerId = null;

      if (waNumber) {
        // Buscar si el cliente ya existe en el sistema físico (TikTok)
        const { data: existingCustomer } = await supabaseServer
          .from('customers')
          .select('id, full_name')
          .eq('phone', waNumber)
          .single();

        if (existingCustomer) {
          globalCustomerId = existingCustomer.id;
          // Actualizar nombre si antes no tenía o era muy corto, y ahora el banco nos dio uno real
          if (finalName && (!existingCustomer.full_name || existingCustomer.full_name.trim() === '')) {
            await supabaseServer.from('customers').update({ full_name: finalName }).eq('id', globalCustomerId);
          }
        } else {
          // Crear perfil unificado global
          const name = finalName || 'Cliente Tienda Web';
          const { data: newCust } = await supabaseServer.from('customers').insert({
            phone: waNumber,
            full_name: name,
            normalized_name: name.toLowerCase().trim(),
            canonical_name: name.toUpperCase().trim(),
            user_id: data.user_id || 'store-auto',
          } as any).select('id').single();
          globalCustomerId = newCust?.id;
        }
      }

      // Inyectar el pedido en la cola física
      if (globalCustomerId) {
        const itemsList = data.items ?? [];
        await supabaseServer.from('pedidos').insert({
          customer_id: globalCustomerId,
          customer_name: finalName || 'Cliente Tienda',
          status: 'procesar',  // Va directo a la Mesa de Preparación
          total_amount: data.total,
          date: now,
          item_count: itemsList.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0),
          bag_count: 1, // Por defecto todo en 1 bolsa
          label: `WEB-${orderId}`,
          label_type: 'WEB', // Señal clave
          source: 'WEB',     // Campo nuevo (024_add_web_fields)
          web_items_list: itemsList, // Campo nuevo
        } as any);

        // 3. Registrar el pago en ChehiAppAbril (página de pagos)
        try {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);

          const { data: existingPago } = await supabaseServer
            .from('pagos')
            .select('id')
            .eq('customer_id', globalCustomerId)
            .eq('pago', data.total)
            .eq('method', 'Tienda Online')
            .gte('created_at', todayStart.toISOString())
            .limit(1);

          if (!existingPago?.length) {
            await supabaseServer.from('pagos').insert({
              nombre: finalName || data.customer_name || 'Cliente Tienda',
              pago: data.total,
              method: 'Tienda Online',
              status: 'completed',
              date: now,
              customer_id: globalCustomerId,
              user_id: data.user_id || 'store-auto',
            } as any);

            console.log(`[store-pago] 💰 Pago Tienda Online creado en Chehi para pedido #${orderId}`);
          } else {
            console.log(`[store-pago] ⏭️ Pago ya existe para pedido #${orderId}, omitido`);
          }
        } catch (pagoErr) {
          console.error('[store-pago] Error al crear pago en Chehi:', pagoErr);
        }
      }

    } catch (e) {
      console.error('[store-match] Error en fusión logística:', e);
    }

    console.log(`[store-match] ✅ Pedido #${orderId} VERIFICADO y unificado via ${source}`);
    return true;
  }

  // ── Endpoint 1: Notificación bancaria de MacroDroid ───────────
  // MacroDroid llama a este endpoint cuando el banco notifica un pago
  app.post('/api/store/ingest-bank', async (req, res) => {
    try {
      const { amount, senderName, senderPhone, rawText, hash } = req.body;
      if (!amount) return res.status(400).json({ error: 'amount requerido' });

      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'amount inválido' });
      }

      // Guardar el evento de pago (idempotencia por hash)
      if (hash) {
        const { data: existing } = await supabaseServer
          .from('payment_events')
          .select('id')
          .eq('hash', hash)
          .single();
        if (existing) {
          return res.json({ ok: true, duplicate: true, message: 'Ya procesado' });
        }
      }

      // Intentar cruzar con pedido pendiente (ventana de 5 min)
      const result = await tryMatchOrder({
        amount: parsedAmount,
        senderPhone: senderPhone ?? '',
        windowMinutes: 2,
      });

      const eventData: any = {
        source: 'macrodroid',
        raw_text: rawText ?? '',
        amount: parsedAmount,
        sender_name: senderName ?? '',
        sender_wa: senderPhone ?? '',
        processed: !!result,
        match_confidence: result ? result.confidence : 'none',
        hash: hash ?? null,
      };

      if (result) {
        const ok = await confirmStoreOrder(result.order.id, `bank:${hash ?? 'manual'}:${result.confidence}`);
        if (ok) eventData.matched_order_id = result.order.id;
      }

      await supabaseServer.from('payment_events').insert(eventData as any);

      res.json({
        ok: true,
        matched: !!result,
        orderId: result?.order.id ?? null,
        confidence: result?.confidence ?? 'none',
      });

    } catch (err: any) {
      console.error('[store/ingest-bank]', err);
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  // ── Endpoint 2: Mensaje de WhatsApp con comprobante ───────────
  // El Panel de Pedidos (o webhook de WA) llama esto cuando llega un mensaje
  app.post('/api/store/ingest-wa', async (req, res) => {
    try {
      const { fromWa, messageText, hasProof } = req.body;
      if (!fromWa) return res.status(400).json({ error: 'fromWa requerido' });

      // Extraer código de pedido del texto (#1042 → "1042")
      const refMatch = messageText?.match(/#(\d+)/);
      const orderRef = refMatch?.[1] ?? null;

      // Guardar mensaje
      const waEvent: any = {
        from_wa: fromWa.replace(/\D/g, ''),
        summary: messageText ?? '',
        has_proof: !!hasProof,
        order_ref: orderRef,
      };

      // Intentar cruzar con pedido (ventana 10 min para WA)
      const result = await tryMatchOrder({
        senderPhone: fromWa,
        orderRef: orderRef ?? undefined,
        windowMinutes: 10, // ventana más amplia para WA
      });

      if (result) {
        waEvent.matched_order_id = result.order.id;
        // Marcar wa_proof_received
        await supabaseStore
          .from('store_orders')
          .update({ wa_proof_received: true, wa_message_id: fromWa } as any)
          .eq('id', result.order.id);

        // Si ya había notificación bancaria → verificar con cuadrangulación completa
        const { data: bankEvent } = await supabaseServer
          .from('payment_events')
          .select('id')
          .eq('matched_order_id', result.order.id)
          .eq('processed', true)
          .single();

        if (bankEvent) {
          await confirmStoreOrder(result.order.id, `wa+bank:${fromWa}:maxima`);
        } else {
          // WA llegó primero que el banco → marcar como esperando banco
          console.log(`[store-wa] Pedido #${result.order.id} — WA recibido, esperando banco`);
        }
      }

      await supabaseStore.from('wa_messages').insert(waEvent as any);

      res.json({ ok: true, matched: !!result, orderId: result?.order.id ?? null });

    } catch (err: any) {
      console.error('[store/ingest-wa]', err);
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  // ── Endpoint 5: Espejo de Fotos de WhatsApp para la Tienda ──────
  // Devuelve las fotos enviadas por un número de WhatsApp (para conciliación de Live)
  app.get('/api/store/whatsapp-photos', async (req, res) => {
    try {
      const { phone } = req.query;
      if (!phone) return res.status(400).json({ error: 'phone requerido' });

      const cleanPhone = String(phone).replace(/\D/g, '');
      
      // 1. Buscar el cliente en el panel
      const { data: cliente } = await supabasePanel
        .from('panel_clientes')
        .select('id')
        .eq('phone', cleanPhone)
        .single();

      if (!cliente) return res.json([]);

      // 2. Traer mensajes con media de los últimos 7 días
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: mensajes, error } = await supabasePanel
        .from('panel_mensajes')
        .select('id, media_url, media_type, created_at, content')
        .eq('cliente_id', cliente.id)
        .eq('direction', 'in')
        .eq('has_media', true)
        .gt('created_at', weekAgo)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json(mensajes ?? []);
    } catch (err: any) {
      console.error('[store/whatsapp-photos]', err);
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  // ── Endpoint 6: Generar Link de Live y Encolar Notificación ──────
  app.post('/api/store/notify-live-ready', async (req, res) => {
    try {
      const { customerId, phone } = req.body;
      const userId = req.headers['x-user-id'] as string;
      if (!userId || !phone) return res.status(400).json({ error: 'userId y phone requeridos' });

      const cleanPhone = phone.replace(/\D/g, '');
      const storeLink = `${process.env.STORE_URL || 'https://tienda.ventas-live.com'}/live-confirmation?phone=${cleanPhone}`;

      const message = `¡Hola! 👗 Ya tenemos tus prendas del Live listas para confirmación. Ingresa aquí para seleccionar las tuyas: ${storeLink}\n\n(Necesitarás tu PIN de la tienda)`;

      const { ok, error, queued } = await enqueueStoreConfirmation(
        supabaseServer,
        userId,
        phone,
        `LIVE-${Date.now()}`,
        message
      );

      if (!ok) throw new Error(error);
      res.json({ ok: true, queued });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  app.post('/api/store/match-payment', async (req, res) => {

    try {
      const { amount, senderPhone, orderRef, orderId, source } = req.body;

      let order: any = null;

      if (orderId) {
        const { data } = await supabaseStore
          .from('store_orders')
          .select('*')
          .eq('id', Number(orderId))
          .single();
        order = data;
      } else {
        const result = await tryMatchOrder({ amount, senderPhone, orderRef });
        order = result?.order ?? null;
      }

      if (!order) {
        return res.status(404).json({ ok: false, error: 'No se encontró pedido pendiente que coincida' });
      }

      const ok = await confirmStoreOrder(order.id, source ?? 'manual');
      if (!ok) {
        return res.status(409).json({ ok: false, error: 'El pedido ya fue procesado o no está pendiente' });
      }

      res.json({ ok: true, orderId: order.id, total: order.total, customerWa: order.customer_wa });

    } catch (err: any) {
      console.error('[store/match-payment]', err);
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  // ── Endpoint 4: Verificación admin manual (panel de control) ──
  app.post('/api/store/verify-order/:id', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'No autorizado' });

      const ok = await confirmStoreOrder(Number(req.params.id), 'admin:manual');
      if (!ok) return res.status(409).json({ ok: false, error: 'No se pudo verificar (ya procesado o no pendiente)' });

      res.json({ ok: true, message: 'Pedido verificado manualmente' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });


  // ── Puente MacroDroid → Supabase ─────────────────────────────────────────
  // MacroDroid envía aquí. Vercel siempre está encendido y reenvía a Supabase.
  // Así el celular nunca ve un timeout por cold start de Supabase.
  app.post('/api/ingest-notification', async (req, res) => {
    try {
      const deviceId     = req.headers['x-device-id']     as string ?? '';
      const deviceSecret = req.headers['x-device-secret'] as string ?? '';

      const supabaseUrl = process.env.SUPABASE_URL!;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/ingest-notification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-device-id': deviceId,
            'x-device-secret': deviceSecret,
          },
          body: JSON.stringify(req.body),
        }
      );

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (err: any) {
      console.error('[ingest-notification bridge]', err?.message);
      res.status(500).json({ error: 'Error enviando a Supabase', detail: err?.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    try {
      const viteModule = await import("vite");
      const vite = await viteModule.createServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.log("Vite no disponible en este entorno", e);
    }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Endpoint for mobile payments: http://localhost:${PORT}/api/pagos`);
    });
  }

export default app;
