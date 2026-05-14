import "dotenv/config";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { supabaseServer } from "./src/lib/supabaseServer.js";
import { supabaseStore } from "./src/lib/supabaseStore.js";
import { supabasePanel } from "./src/lib/supabasePanel.js";
import { createAiRouter } from "./src/routes/ai-gateway.js";
import { createIdentityRouter } from "./src/routes/identity.js";
import { createLiveSalesRouter } from "./src/routes/live-sales.js";
import { createWhatsappRouter, enqueueStoreConfirmation, processNextWhatsappQueueMessage } from "./src/routes/whatsapp.js";
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

const createStoreAuthClient = () => {
  const url = process.env.VITE_STORE_SUPABASE_URL;
  const anonKey = process.env.VITE_STORE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Faltan variables publicas de auth de tienda");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

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

const publicStoreBaseUrl = (value?: string | null) => {
  const base = String(value || 'https://leidydiaz.live').replace(/\s+/g, '').replace(/\/+$/, '');
  return base || 'https://leidydiaz.live';
};

const isMissingDbObject = (error: any) => {
  const code = error?.code;
  const message = String(error?.message ?? '').toLowerCase();
  return code === '42P01' || code === '42703' || code === 'PGRST204' || message.includes('does not exist') || message.includes('schema cache');
};

function startWhatsappQueueProcessor() {
  const key = Symbol.for('ventas-live.whatsapp-queue-processor');
  if ((globalThis as any)[key]) return;
  (globalThis as any)[key] = true;

  const run = async () => {
    try {
      const result = await processNextWhatsappQueueMessage(supabaseServer, undefined, { storeOnly: true });
      if (result.sent) {
        console.log(`[whatsapp-auto] Mensaje enviado: ${result.message_id}`);
      } else if (result.error) {
        console.error('[whatsapp-auto] Error enviando mensaje:', result.error);
      }
    } catch (err: any) {
      console.error('[whatsapp-auto] Error procesando cola:', err?.message ?? err);
    }
  };

  const interval = setInterval(run, 60_000);
  interval.unref?.();
}

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
        safeSelect(supabaseStore, 'store_orders', 'id,customer_id,customer_name,customer_wa,total,status,items,payment_verified_at,created_at', (q) => q.order('created_at', { ascending: false }).limit(500)),
      ]);

      const productImageMap = new Map<string, string>();
      const { data: productRows } = await supabaseStore
        .from('products')
        .select('id, images, image_url');

      for (const product of (productRows ?? []) as any[]) {
        const image = Array.isArray(product.images) && product.images.length > 0
          ? product.images[0]
          : product.image_url ?? '';
        if (image) productImageMap.set(String(product.id), image);
      }

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
        const enrichedItems = Array.isArray(order.items) ? order.items.map((item: any) => ({
          ...item,
          image: String(item?.image ?? '').trim() || productImageMap.get(String(item?.productId)) || '',
          imageUrl: String(item?.imageUrl ?? '').trim() || productImageMap.get(String(item?.productId)) || '',
        })) : [];
        groups[key].orders.push({
          ...order,
          items: enrichedItems,
        });
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

      try {
        const storeMatch = await tryMatchOrder({
          amount: Number(pago),
          senderPhone: rest.phone ?? rest.senderPhone ?? rest.sender_wa ?? '',
          windowMinutes: 2,
        });
        if (storeMatch) {
          const canAutoConfirm = storeMatch.confidence === 'alta' && await isStoreCustomerVerifiedForAuto(storeMatch.order);
          if (canAutoConfirm) {
            await confirmStoreOrder(storeMatch.order.id, `pagos:${data.id}:${storeMatch.confidence}`, data);
          } else {
            await markStoreOrderBankDetected(storeMatch.order, `pagos:${data.id}:${storeMatch.confidence}`);
          }
        }
      } catch (storeMatchError: any) {
        console.warn('[pagos] store match error:', storeMatchError?.message ?? storeMatchError);
      }

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

    // ── Trigger WhatsApp cuando el pedido pasa a "listo" ─────────────────
    // IMPORTANTE: Los pedidos WEB (tienda online) NO disparan este mensaje
    // porque ya recibieron su mensaje único al confirmar el pago.
    const isWebOrder = data?.source === 'WEB' || data?.label_type === 'WEB';
    if (req.body.status === 'listo' && data?.customer_id && !isWebOrder) {
      (async () => {
        try {
          // 1. Buscar el teléfono del cliente en la tabla principal
          const { data: customer } = await supabaseServer
            .from('customers')
            .select('phone, name')
            .eq('id', data.customer_id)
            .maybeSingle();

          if (!customer?.phone) return; // Sin teléfono → no hay WA que enviar

          // 2. Pre-crear/actualizar perfil en TiendaOnline (sin PIN → Option C)
          await supabaseStore.from('store_customers').upsert(
            {
              whatsapp: customer.phone,
              display_name: customer.name ?? data.customer_name ?? '',
            },
            { onConflict: 'whatsapp', ignoreDuplicates: false }
          );

          // 3. Construir link al perfil de tienda
          const storeBase = publicStoreBaseUrl(process.env.STORE_PUBLIC_URL || `${req.protocol}://${req.get('host')}`);
          const profileLink = `${storeBase}/tienda#profile/orders`;

          // 4. Mensaje personalizado (Live / pedidos manuales)
          const pedidoLabel = data.label ? ` #${data.label}` : '';
          const message =
            `¡Hola ${(customer.name ?? '').split(' ')[0] || ''}! 🎉\n` +
            `Tu pedido${pedidoLabel} está listo. ¡Muchas gracias por tu compra!\n\n` +
            `Mirá los detalles en tu perfil:\n` +
            `${profileLink}`;

          // 5. Encolar mensaje WhatsApp
          const ownerUserId = (process.env.STORE_OWNER_USER_ID || userId).trim();
          await enqueueStoreConfirmation(
            supabaseServer,
            ownerUserId,
            customer.phone,
            data.id,
            message,
          );
        } catch (waErr: any) {
          // No romper la respuesta al cliente por un error de WA
          console.error('[PATCH /pedidos] Error enviando WA "listo":', waErr?.message);
        }
      })();
    }
    // ────────────────────────────────────────────────────────────────────

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

      // Tambien guardar/activar perfil en TiendaOnline. Si ya existia por WhatsApp,
      // se convierte en cuenta de tienda sin duplicar el perfil.
      await supabaseStore.from('store_customers').upsert({
        whatsapp: cleanPhone,
        pin_hash: password, // En producción usar bcrypt. Por ahora guardamos referencia.
        display_name: name || ''
      }, { onConflict: 'whatsapp' }).select().single();

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

      // Login con cliente publico aislado para no contaminar el cliente admin de tienda.
      const { data, error } = await createStoreAuthClient().auth.signInWithPassword({ email, password });

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

      const { data, error } = await createStoreAuthClient().auth.getUser(token);
      if (error || !data.user) return res.status(401).json({ error: "Sesión inválida" });

      const cleanPhone = data.user.email?.replace('@tiendaleydi.com', '') ?? '';
      const { data: customer } = await supabaseStore
        .from('store_customers')
        .select('*')
        .eq('whatsapp', cleanPhone)
        .single();

      const { data: orders } = await supabaseStore
        .from('store_orders')
        .select('id, status, total, created_at, items, payment_verified_at, expires_at, customer_wa, customer_selection, delivery_date, delivery_slot')
        .eq('customer_wa', cleanPhone)
        .order('created_at', { ascending: false })
        .limit(20);

      res.json({
        user: data.user,
        customer,
        orders: orders ?? [],
        favorites: await loadFavoriteProducts(cleanPhone),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Error interno" });
    }
  });

  // Upload de imágenes — usa supabaseStore (TiendaOnline)
  const mapStoreProducts = (rows: any[], preferredOrder: number[] = []) => {
    const order = new Map(preferredOrder.map((id, index) => [Number(id), index]));
    return [...rows]
      .sort((a, b) => (order.get(Number(a.id)) ?? 9999) - (order.get(Number(b.id)) ?? 9999))
      .map(row => ({
        id: String(row.id),
        name: row.name,
        title: row.name,
        price: Number(row.price),
        description: row.description ?? '',
        images: Array.isArray(row.images) && row.images.length > 0 ? row.images : (row.image_url ? [row.image_url] : []),
        sizes: Array.isArray(row.sizes) ? row.sizes : [],
        available: row.available ?? true,
        stock: row.stock ?? 1,
        category: row.category ?? 'General',
        priority_order: row.priority_order ?? 0,
      }));
  };

  const getStoreUserPhone = async (req: any, res: any): Promise<string | null> => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'Token requerido' });
      return null;
    }
    const { data, error } = await createStoreAuthClient().auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: 'Sesion invalida' });
      return null;
    }
    return data.user.email?.replace('@tiendaleydi.com', '').replace(/\D/g, '') ?? '';
  };

  const loadFavoriteProducts = async (phone: string) => {
    const cleanPhone = String(phone ?? '').replace(/\D/g, '');
    if (!cleanPhone) return [];
    const { data: favoriteRows, error } = await supabaseStore
      .from('store_favorites')
      .select('product_id')
      .eq('customer_wa', cleanPhone)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const ids = [...new Set((favoriteRows ?? []).map((row: any) => Number(row.product_id)).filter(Boolean))];
    if (ids.length === 0) return [];
    const { data, error: productsError } = await supabaseStore
      .from('products')
      .select('*')
      .in('id', ids)
      .eq('available', true);
    if (productsError) throw productsError;
    return mapStoreProducts(data ?? [], ids);
  };

  app.get('/api/store-favorites', async (req, res) => {
    try {
      const phone = await getStoreUserPhone(req, res);
      if (!phone) return;
      res.json({ products: await loadFavoriteProducts(phone) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Error al cargar favoritos' });
    }
  });

  app.post('/api/store-favorites', async (req, res) => {
    try {
      const phone = await getStoreUserPhone(req, res);
      if (!phone) return;
      const productId = Number(req.body?.productId);
      if (!productId) return res.status(400).json({ error: 'productId requerido' });
      await supabaseStore.from('store_favorites').delete().eq('customer_wa', phone).eq('product_id', productId);
      const { error } = await supabaseStore.from('store_favorites').insert({ customer_wa: phone, product_id: productId });
      if (error) throw error;
      res.json({ products: await loadFavoriteProducts(phone) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Error al guardar favorito' });
    }
  });

  app.post('/api/store-favorites/sync', async (req, res) => {
    try {
      const phone = await getStoreUserPhone(req, res);
      if (!phone) return;
      const productIds = Array.isArray(req.body?.productIds)
        ? [...new Set(req.body.productIds.map((id: any) => Number(id)).filter(Boolean))]
        : [];
      for (const productId of productIds) {
        await supabaseStore.from('store_favorites').delete().eq('customer_wa', phone).eq('product_id', productId);
      }
      if (productIds.length > 0) {
        const { error } = await supabaseStore
          .from('store_favorites')
          .insert(productIds.map(productId => ({ customer_wa: phone, product_id: productId })));
        if (error) throw error;
      }
      res.json({ products: await loadFavoriteProducts(phone) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Error al sincronizar favoritos' });
    }
  });

  app.delete('/api/store-favorites', async (req, res) => {
    try {
      const phone = await getStoreUserPhone(req, res);
      if (!phone) return;
      const productId = Number(req.body?.productId);
      if (!productId) return res.status(400).json({ error: 'productId requerido' });
      const { error } = await supabaseStore.from('store_favorites').delete().eq('customer_wa', phone).eq('product_id', productId);
      if (error) throw error;
      res.json({ products: await loadFavoriteProducts(phone) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Error al eliminar favorito' });
    }
  });

  app.post("/api/upload-image", async (req, res) => {
    try {
      const { base64Data, fileName, contentType } = req.body;
      if (!base64Data || !fileName) return res.status(400).json({ error: "Faltan datos" });
      
      const base64String = base64Data.split(',')[1] || base64Data;
      const buffer = Buffer.from(base64String, 'base64');
      
      let uploadClient = supabaseStore;
      let uploadResult = await supabaseStore.storage
        .from('store_images')
        .upload(fileName, buffer, { contentType: contentType || 'image/webp', upsert: true });

      if (uploadResult.error) {
        const message = String(uploadResult.error.message ?? '').toLowerCase();
        if (message.includes('row-level security') || message.includes('violates row-level security')) {
          uploadClient = supabaseServer;
          uploadResult = await supabaseServer.storage
            .from('store_images')
            .upload(fileName, buffer, { contentType: contentType || 'image/webp', upsert: true });
        }
        if (uploadResult.error) throw uploadResult.error;
      }

      const { data: publicUrlData } = uploadClient.storage
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
  startWhatsappQueueProcessor();
  // ==========================================================================

  app.get("/api/products", async (req, res) => {
    try {
      const showAll = req.query.admin === "true" && req.headers["x-user-id"];
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50; // Por defecto 50, se puede pedir menos (ej. 15)
      const category = req.query.category as string;
      const search = req.query.search as string;
      const publicStorefront = !showAll;

      let query = supabaseStore
        .from("products")
        .select("*", { count: 'exact' });

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

      if (publicStorefront) {
        res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      } else {
        res.setHeader("Cache-Control", "no-store");
      }
      
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

  app.get("/api/products/:id", async (req, res) => {
    try {
      const { data, error } = await supabaseStore
        .from("products")
        .select("*")
        .eq("id", Number(req.params.id))
        .single();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Producto no encontrado" });
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      res.json(data);
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
      const { image_url, ...safeBody } = req.body ?? {};
      const { data, error } = await supabaseStore
        .from("products")
        .update(safeBody)
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

      res.setHeader("Cache-Control", "public, s-maxage=3, stale-while-revalidate=10");
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
        .select("id, status, payment_verified_at, payment_ref, wa_proof_received")
        .eq("id", Number(req.params.id))
        .single();
      if (error) throw error;
      const paymentRef = String((data as any).payment_ref ?? '');
      res.json({
        id: data.id,
        status: data.status,
        verifiedAt: data.payment_verified_at,
        bankDetected: paymentRef.includes('bank-detected'),
        proofReceived: !!(data as any).wa_proof_received,
        requiresProof: data.status !== 'paid' && data.status !== 'confirmed' && paymentRef.includes('bank-detected'),
      });
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

      const RESERVATION_MINUTES = 2;
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
    const cleanSender = senderPhone ? senderPhone.replace(/\D/g, '') : '';

    // Si viene el codigo de pedido, no adivinar por monto/tiempo:
    // buscar ese pedido exacto y validar que pertenezca al mismo WhatsApp.
    if (orderRef) {
      const refId = Number(String(orderRef).replace(/\D/g, ''));
      if (!Number.isFinite(refId) || refId <= 0) return null;

      const { data: exact, error: exactError } = await supabaseStore
        .from('store_orders')
        .select('*')
        .eq('id', refId)
        .in('status', ['pending', 'cancelled', 'paid', 'confirmed'])
        .maybeSingle();

      if (exactError || !exact) return null;

      if (amount && Number(exact.total) !== Number(amount)) {
        console.warn(`[store-match] Pedido #${refId} encontrado, pero monto no coincide (${exact.total} != ${amount})`);
        return null;
      }

      if (cleanSender) {
        const orderPhones = phoneVariants(exact.customer_wa, exact.customer_phone);
        const phoneMatches = orderPhones.some((p: string) => p === cleanSender || p.endsWith(cleanSender) || cleanSender.endsWith(p));
        if (!phoneMatches) {
          console.warn(`[store-match] Pedido #${refId} encontrado, pero WhatsApp no coincide (${cleanSender})`);
          return null;
        }
      }

      console.log(`[store-match] MAXIMA: pedido #${refId} verificado por codigo + WhatsApp`);
      return { order: exact, confidence: 'maxima' };
    }

    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    // Buscar pedidos recientes en la ventana de tiempo
    let query = supabaseStore
      .from('store_orders')
      .select('*')
      .in('status', ['pending', 'cancelled'])
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
    if (cleanSender) {
      const byPhone = candidates.filter((o: any) => {
        const orderPhones = phoneVariants(o.customer_wa, o.customer_phone);
        return orderPhones.some((p: string) => p === cleanSender || p.endsWith(cleanSender) || cleanSender.endsWith(p));
      });
      if (byPhone.length === 1) {
        console.log(`[store-match] ALTA: pedido #${byPhone[0].id} — desempate por WA ${cleanSender}`);
        return { order: byPhone[0], confidence: 'alta' };
      }
    }

    // Último desempate: usar el pedido más reciente de ese monto.
    // Evita que un pago real quede gris cuando el monto coincide y no hay un código único.
    console.log(`[store-match] SIN MATCH AUTOMATICO: ${candidates.length} pedidos con ${amount} Bs; se requiere #pedido por WhatsApp`);
    return null;
  }

  function isUsableStoreName(name: unknown) {
    const value = String(name ?? '').trim().toLowerCase();
    return value.length >= 6 && !value.startsWith('cliente tienda') && value !== 'cliente';
  }

  async function isStoreCustomerVerifiedForAuto(order: any) {
    const waNumber = String(order?.customer_wa ?? '').replace(/\D/g, '');
    if (!waNumber) return false;

    const { data: customer } = await supabaseStore
      .from('store_customers')
      .select('display_name,total_orders,total_spent')
      .eq('whatsapp', waNumber)
      .maybeSingle();

    const hasRealName = isUsableStoreName(customer?.display_name) || isUsableStoreName(order?.customer_name);
    if (!hasRealName) return false;

    const { data: previousPaid } = await supabaseStore
      .from('store_orders')
      .select('id')
      .eq('customer_wa', waNumber)
      .eq('status', 'paid')
      .neq('id', Number(order.id))
      .limit(1);

    return !!previousPaid?.length || Number(customer?.total_orders ?? 0) > 0 || Number(customer?.total_spent ?? 0) > 0;
  }

  async function markStoreOrderBankDetected(order: any, source: string) {
    const currentRef = String(order?.payment_ref ?? '');
    const nextRef = currentRef.includes('bank-detected') ? currentRef : `bank-detected:${source}`;
    await supabaseStore
      .from('store_orders')
      .update({
        payment_method: 'qr',
        payment_ref: nextRef,
      } as any)
      .eq('id', Number(order.id))
      .in('status', ['pending', 'cancelled']);
  }

  /**
   * Marca un pedido como pagado, oculta los productos vendidos,
   * y UNIFICA la identidad para inyectar el pedido a la pantalla de conteo (etiquetas).
   */
  async function confirmStoreOrder(
    orderId: number,
    source: string,
    linkedPago?: { id?: number; nombre?: string; pago?: number; created_at?: string; date?: string; method?: string } | null,
  ) {
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
      .in('status', ['pending', 'cancelled'])   // permitir rescate si expiró justo antes del webhook
      .select()
      .single();

    if (error || !data) return false;

    const ownerUserId = String(process.env.STORE_OWNER_USER_ID || data.user_id || 'store-auto').trim();

    // 1. Ocultar productos vendidos
    try {
      const productIds = (data.items ?? []).map((i: any) => i.productId).filter(Boolean);
      if (productIds.length > 0) {
        await supabaseStore.from('products').update({ stock: 0, available: false }).in('id', productIds);
      }
    } catch (e) {
      console.error('[store-match] Error ocultando productos:', e);
    }

    // Nombre que vamos a usar tanto en panel como en el mensaje WA.
    let finalName = '';

    // 2. FUSIÓN DE IDENTIDAD GLOBAL Y ENVÍO A ALMACÉN
    try {
      console.log(`[store-match] Iniciando fusión logística para pedido #${orderId}`);
      console.log(`[store-match] source: ${source}`);
      console.log(`[store-match] ownerUserId: ${ownerUserId}`);
      console.log(`[store-match] data.customer_wa: ${data.customer_wa}`);
      console.log(`[store-match] data.customer_name: ${data.customer_name}`);
      console.log(`[store-match] data.total: ${data.total}`);
      
      // Si el match nace desde un pago ya registrado en Chehi, ese es el nombre real del banco.
      if (linkedPago?.nombre) {
        finalName = String(linkedPago.nombre).trim();
        console.log(`[store-match] Nombre desde pago vinculado #${linkedPago.id}: ${finalName}`);
      }

      // Para source chehi, el nombre viene de store_orders (data.customer_name)
      // Para source bank/macrodroid, buscar en payment_events del sistema principal
      if (!finalName && (source.includes('bank') || source.includes('macrodroid'))) {
         const { data: bankEvent } = await supabaseServer
           .from('payment_events')
           .select('sender_name')
           .eq('matched_order_id', orderId)
           .maybeSingle();
         console.log(`[store-match] bankEvent: ${bankEvent ? 'encontrado' : 'null'}`);
         if (bankEvent?.sender_name) finalName = bankEvent.sender_name;
      }
      // Para el camino chehi/ingest: buscar el nombre real en payment_events de TiendaOnline
      if (!finalName) {
        const { data: storeEvent } = await supabaseStore
          .from('payment_events')
          .select('sender_name')
          .eq('matched_order_id', orderId)
          .maybeSingle();
        if (storeEvent?.sender_name) {
          finalName = String(storeEvent.sender_name).trim();
          console.log(`[store-match] Nombre desde TiendaOnline payment_events: ${finalName}`);
        }
      }
      // Último recurso: customer_name del pedido de tienda
      if (!finalName && data.customer_name) {
        finalName = String(data.customer_name).trim();
        console.log(`[store-match] Nombre desde store_orders.customer_name: ${finalName}`);
      }

      const waNumber = String(data.customer_wa || '').trim();
      let globalCustomerId: number | null = null;

      if (waNumber && finalName) {
        const { data: updatedStoreCustomers, error: storeCustomerNameErr } = await supabaseStore
          .from('store_customers')
          .update({ display_name: finalName } as any)
          .eq('whatsapp', waNumber)
          .select('id');
        if (storeCustomerNameErr) {
          console.error(`[store-match] Error actualizando nombre de cliente tienda (${waNumber}): ${storeCustomerNameErr.message}`);
        }
        if (!updatedStoreCustomers?.length) {
          await supabaseStore
            .from('store_customers')
            .insert({ whatsapp: waNumber, display_name: finalName, pin_hash: 'auto' } as any);
        }
        await supabaseStore
          .from('store_orders')
          .update({ customer_name: finalName } as any)
          .eq('id', orderId);
      }

      console.log(`[store-match] waNumber: ${waNumber}`);
      console.log(`[store-match] finalName: ${finalName || '(vacío)'}`);

      if (waNumber) {
        // Buscar si el cliente ya existe en el sistema físico (por teléfono, sin filtro de user_id)
        const { data: existingCustomer } = await supabaseServer
          .from('customers')
          .select('id, full_name, phone')
          .or(`phone.eq.${waNumber},canonical_name.eq.${String(finalName || '').toUpperCase().trim()}`)
          .maybeSingle();

        console.log(`[store-match] existingCustomer: ${existingCustomer ? `ID ${existingCustomer.id}` : 'null'}`);

        if (existingCustomer) {
          globalCustomerId = existingCustomer.id;
          console.log(`[store-match] Cliente existente encontrado, globalCustomerId: ${globalCustomerId}`);
          // Actualizar nombre si antes no tenía o era muy corto, y ahora el banco nos dio uno real
          const currentName = String(existingCustomer.full_name || '').trim();
          await supabaseServer.from('customers').update({ user_id: ownerUserId, phone: existingCustomer.phone || waNumber } as any).eq('id', globalCustomerId);
          if (finalName && (!currentName || currentName.toLowerCase().startsWith('cliente tienda'))) {
            await supabaseServer.from('customers').update({
              full_name: finalName,
              normalized_name: finalName.toLowerCase().trim(),
              canonical_name: finalName.toUpperCase().trim(),
            } as any).eq('id', globalCustomerId);
            console.log(`[store-match] Nombre actualizado para cliente ${globalCustomerId}`);
          }
        } else {
          // Crear perfil unificado global con el user_id del operador
          const name = finalName || data.customer_name || 'Cliente Tienda Web';
          console.log(`[store-match] Creando nuevo cliente con name: ${name}, user_id: ${ownerUserId}`);
          const { data: newCust, error: custErr } = await supabaseServer.from('customers').insert({
            phone: waNumber,
            full_name: name,
            normalized_name: name.toLowerCase().trim(),
            canonical_name: name.toUpperCase().trim(),
            user_id: ownerUserId,
          } as any).select('id').maybeSingle();

          if (custErr) {
            console.error(`[store-match] Error al crear cliente (phone=${waNumber}): ${custErr.message}`);
            // Puede que ya exista por carrera o unique constraint — reintentar búsqueda
            const { data: retryCustomer } = await supabaseServer
              .from('customers')
              .select('id, phone')
              .or(`phone.eq.${waNumber},canonical_name.eq.${name.toUpperCase().trim()}`)
              .maybeSingle();
            if (retryCustomer) {
              globalCustomerId = retryCustomer.id;
              console.log(`[store-match] Cliente encontrado en reintento: #${globalCustomerId}`);
              if (!retryCustomer.phone && waNumber) {
                await supabaseServer
                  .from('customers')
                  .update({ phone: waNumber, user_id: ownerUserId } as any)
                  .eq('id', globalCustomerId);
              }
            }
          } else {
            globalCustomerId = newCust?.id ?? null;
            console.log(`[store-match] Cliente creado, globalCustomerId: ${globalCustomerId}`);
          }
        }
      } else {
        console.log(`[store-match] waNumber es null/undefined, saltando creación de cliente`);
      }

      if (!globalCustomerId) {
        console.warn(`[store-match] Sin customer_id para pedido #${orderId} (phone="${waNumber}") — no se inyecta`);
      }

      // Inyectar el pedido en la cola física
      if (globalCustomerId) {
        const itemsList = data.items ?? [];
        console.log(`[store-match] Inyectando pedido en sistema principal, customer_id: ${globalCustomerId}`);
        await supabaseServer
          .from('pedidos')
          .delete()
          .eq('label', `WEB-${orderId}`);
        const { data: newPedido, error: pedidoErr } = await supabaseServer.from('pedidos').insert({
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
          user_id: ownerUserId,
        } as any).select('id').single();
        
        if (pedidoErr) {
          console.error(`[store-match] ERROR al inyectar pedido: ${pedidoErr.message}`);
          throw new Error(`No se pudo inyectar pedido: ${pedidoErr.message}`);
        }
        console.log(`[store-match] Pedido inyectado, ID: ${newPedido?.id}`);

        // 3. Registrar el pago en ChehiAppAbril (página de pagos)
        try {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);

          if (linkedPago?.id) {
            console.log(`[store-pago] Vinculando pago existente #${linkedPago.id} como Tienda Online`);
            const { error: updatePagoErr } = await supabaseServer
              .from('pagos')
              .update({
                nombre: finalName || data.customer_name || 'Cliente Tienda',
                method: 'Tienda Online',
                status: 'completed',
                customer_id: globalCustomerId,
                user_id: ownerUserId,
              } as any)
              .eq('id', linkedPago.id);

            if (updatePagoErr) {
              console.error(`[store-pago] ERROR vinculando pago existente #${linkedPago.id}: ${updatePagoErr.message}`);
            }
          }

          console.log(`[store-pago] Buscando pago existente para customer_id: ${globalCustomerId}, monto: ${data.total}`);
          const { data: existingPago, error: existingPagoErr } = await supabaseServer
            .from('pagos')
            .select('id')
            .eq('customer_id', globalCustomerId)
            .eq('pago', data.total)
            .eq('method', 'Tienda Online')
            .gte('created_at', todayStart.toISOString())
            .limit(1);

          if (existingPagoErr) {
            console.error(`[store-pago] ERROR buscando pago existente: ${existingPagoErr.message}`);
          }

          if (!existingPago?.length) {
            console.log(`[store-pago] Creando nuevo pago en Chehi`);
            const { data: newPago, error: pagoErr } = await supabaseServer.from('pagos').insert({
              nombre: finalName || data.customer_name || 'Cliente Tienda',
              pago: data.total,
              method: 'Tienda Online',
              status: 'completed',
              date: now,
              customer_id: globalCustomerId,
              user_id: ownerUserId,
            } as any).select('id').single();

            if (pagoErr) {
              console.error(`[store-pago] ERROR al crear pago: ${pagoErr.message}`);
            } else {
              console.log(`[store-pago] 💰 Pago Tienda Online creado en Chehi, ID: ${newPago?.id}`);
            }
          } else {
            console.log(`[store-pago] ⏭️ Pago ya existe para pedido #${orderId}, omitido`);
          }
        } catch (pagoErr) {
          console.error('[store-pago] Error al crear pago en Chehi:', pagoErr);
        }
      } else {
        console.log(`[store-match] globalCustomerId es null, saltando inyección de pedido y pago`);
      }

    } catch (e) {
      console.error('[store-match] Error en fusión logística:', e);
    }

    // 4. Encolar el ÚNICO mensaje de WhatsApp para la clienta de tienda.
    //    Va al final para poder usar el nombre real (del banco si lo extrajimos).
    //    El operador NO disparará otro mensaje cuando toque "PEDIDO LISTO":
    //    los pedidos WEB se filtran en PATCH /api/pedidos/:id.
    if (data.customer_wa) {
      try {
        const storeBase = publicStoreBaseUrl(process.env.STORE_PUBLIC_URL);
        const profileLink = `${storeBase}/tienda#profile/orders`;
        const nameForGreeting = (finalName || data.customer_name || '').trim();
        const firstName = nameForGreeting.split(' ')[0] || '';
        const greeting = firstName ? `¡Hola ${firstName}! ` : '¡Hola! ';
        const storeMessage =
          `${greeting}🎉\n` +
          `Tu pago fue confirmado. Tu pedido #${data.id} está listo. ` +
          `¡Muchas gracias por tu compra!\n\n` +
          `Mirá los detalles en tu perfil:\n${profileLink}`;
        await enqueueStoreConfirmation(
          supabaseServer,
          ownerUserId,
          data.customer_wa,
          data.id,
          storeMessage,
        );
      } catch (waErr: any) {
        console.error('[whatsapp-queue] Error encolando confirmación:', waErr?.message ?? waErr);
      }
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

      // Intentar cruzar con pedido pendiente (margen corto pero suficiente para el webhook del banco)
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
        eventData.matched_order_id = result.order.id;
        const canAutoConfirm = result.confidence === 'alta' && await isStoreCustomerVerifiedForAuto(result.order);
        if (canAutoConfirm) {
          await confirmStoreOrder(result.order.id, `bank:${hash ?? 'manual'}:${result.confidence}`);
          eventData.processed = true;
        } else {
          await markStoreOrderBankDetected(result.order, `bank:${hash ?? 'manual'}:${result.confidence}`);
          eventData.processed = false;
        }
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

  type StoreReceiptData = {
    cliente: string | null;
    monto: number | null;
    hora: string | null;
    raw?: unknown;
    error?: string;
  };

  function parseStoreReceiptAmount(raw: unknown): number | null {
    if (raw == null) return null;
    const text = String(raw).replace(',', '.').replace(/[^\d.]/g, '');
    const value = Number(text);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function extractStoreDeclaredPhone(text: unknown): string {
    const value = String(text ?? '');
    const explicit = value.match(/(?:mi\s*n[uú]mero\s*(?:es)?|numero\s*(?:es)?|tel[eé]fono\s*(?:es)?|whats?app\s*(?:es)?)\D*(591)?\s*([67]\d{7})/i);
    if (explicit?.[2]) return explicit[2];
    const anyPhone = value.match(/\b(?:591)?([67]\d{7})\b/);
    return anyPhone?.[1] ?? '';
  }

  function firstJsonObject(text: string): string | null {
    const cleaned = String(text ?? '').trim().replace(/```json|```/g, '');
    const start = cleaned.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) return cleaned.slice(start, i + 1);
      }
    }
    return null;
  }

  async function analyzeStoreReceipt(mediaUrl?: string | null): Promise<StoreReceiptData | null> {
    const imageUrl = String(mediaUrl ?? '').trim();
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!imageUrl || !apiKey) return null;

    try {
      const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(12000) });
      if (!imageResponse.ok) return { cliente: null, monto: null, hora: null, error: `No se pudo descargar imagen: ${imageResponse.status}` };

      const mime = imageResponse.headers.get('content-type') || 'image/jpeg';
      const bytes = Buffer.from(await imageResponse.arrayBuffer());
      const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
      const ownerName = process.env.STORE_OWNER_NAME || 'LEIDY CANDY DIAZ SANCHEZ';

      const prompt = `Analiza este comprobante de pago boliviano de una compra de tienda online.
La dueña que recibe el dinero es: ${ownerName}.
Extrae SOLO estos datos:
- cliente: nombre de quien pago, no la dueña, no el banco, no una cuenta.
- monto: numero pagado.
- hora: HH:MM si aparece.

Responde solo JSON:
{"cliente":"NOMBRE o null","monto":numero_o_null,"hora":"HH:MM o null"}`;

      const preferredModels = [
        process.env.OPENROUTER_VISION_MODEL,
        'openai/gpt-4o-mini',
        'google/gemini-2.0-flash-001',
      ]
        .map(model => String(model ?? '').trim())
        .filter((model, index, list) => model && list.indexOf(model) === index);

      let bodyText = '';
      let lastError = '';
      for (const model of preferredModels) {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': publicStoreBaseUrl(process.env.STORE_PUBLIC_URL),
            'X-Title': 'Ventas Live Store Receipt',
          },
          body: JSON.stringify({
            model,
            response_format: { type: 'json_object' },
            temperature: 0,
            max_tokens: 250,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            }],
          }),
        });

        bodyText = await response.text();
        if (response.ok) {
          lastError = '';
          break;
        }
        lastError = `${model}: ${bodyText.slice(0, 240)}`;
        bodyText = '';
      }

      if (!bodyText) return { cliente: null, monto: null, hora: null, error: lastError || 'No se pudo analizar comprobante' };
      const parsed = JSON.parse(firstJsonObject(bodyText) ?? bodyText);
      const content = parsed?.choices?.[0]?.message?.content ?? bodyText;
      const receiptJson = typeof content === 'string' ? JSON.parse(firstJsonObject(content) ?? content) : content;
      return {
        cliente: receiptJson?.cliente ? String(receiptJson.cliente).trim() : null,
        monto: parseStoreReceiptAmount(receiptJson?.monto),
        hora: receiptJson?.hora ? String(receiptJson.hora).trim() : null,
        raw: receiptJson,
      };
    } catch (error: any) {
      return { cliente: null, monto: null, hora: null, error: error?.message ?? 'Error analizando comprobante' };
    }
  }

  // ── Endpoint 2: Mensaje de WhatsApp con comprobante ───────────
  // El Panel de Pedidos (o webhook de WA) llama esto cuando llega un mensaje
  app.post('/api/store/ingest-wa', async (req, res) => {
    try {
      const {
        fromWa,
        messageText,
        hasProof,
        mediaUrl,
        mediaType,
        panelMessageId,
        messageCreatedAt,
      } = req.body;
      if (!fromWa) return res.status(400).json({ error: 'fromWa requerido' });

      // Extraer código de pedido del texto (#1042 → "1042")
      const refMatch = messageText?.match(/#(\d+)/);
      let orderRef = refMatch?.[1] ?? null;
      const cleanFrom = fromWa.replace(/\D/g, '');
      let declaredPhone = extractStoreDeclaredPhone(messageText);

      if (!orderRef && mediaUrl) {
        const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const { data: previousMessage } = await supabaseStore
          .from('wa_messages')
          .select('order_ref, summary, matched_order_id, received_at')
          .eq('from_wa', cleanFrom)
          .not('order_ref', 'is', null)
          .gte('received_at', since)
          .order('received_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (previousMessage?.order_ref) {
          const previousOrderId = Number(previousMessage.matched_order_id ?? previousMessage.order_ref);
          const { data: previousOrder } = Number.isFinite(previousOrderId)
            ? await supabaseStore
                .from('store_orders')
                .select('status, wa_proof_received, payment_verified_at')
                .eq('id', previousOrderId)
                .maybeSingle()
            : { data: null } as any;

          const stillNeedsProof =
            !previousOrder ||
            (!previousOrder.wa_proof_received && !previousOrder.payment_verified_at && !['paid', 'confirmed'].includes(String(previousOrder.status ?? '').toLowerCase()));

          if (stillNeedsProof) {
            orderRef = String(previousMessage.order_ref);
            declaredPhone = declaredPhone || extractStoreDeclaredPhone(previousMessage.summary);
          }
        }
      }

      const matchPhone = declaredPhone || cleanFrom;
      const receipt = mediaUrl ? await analyzeStoreReceipt(mediaUrl) : null;

      // Guardar mensaje
      const summaryParts = [
        messageText ?? '',
        mediaUrl ? `media=${mediaUrl}` : null,
        mediaType ? `media_type=${mediaType}` : null,
        panelMessageId ? `panel_message_id=${panelMessageId}` : null,
        receipt ? `receipt=${JSON.stringify(receipt)}` : null,
      ].filter(Boolean);
      const waEvent: any = {
        from_wa: cleanFrom,
        summary: summaryParts.join('\n'),
        has_proof: !!hasProof || !!mediaUrl,
        order_ref: orderRef,
      };

      if (!orderRef) {
        await supabaseStore.from('wa_messages').insert(waEvent as any);
        return res.json({ ok: true, matched: false, orderId: null, reason: 'missing_order_code' });
      }

      // Intentar cruzar con pedido solo cuando el comprobante trae codigo
      const result = await tryMatchOrder({
        senderPhone: matchPhone,
        orderRef,
        windowMinutes: 10,
      });

      if (result) {
        waEvent.matched_order_id = result.order.id;

        const receiptAmount = parseStoreReceiptAmount(receipt?.monto);
        const orderTotal = Number(result.order.total);
        const proofReceived = !!mediaUrl || !!hasProof;
        const amountMatches = receiptAmount == null || Math.abs(receiptAmount - orderTotal) < 0.01;
        if (!proofReceived) {
          waEvent.summary += '\nproof_required=true';
          await supabaseStore.from('wa_messages').insert(waEvent as any);
          return res.json({
            ok: true,
            matched: true,
            confirmed: false,
            requiresProof: true,
            orderId: result.order.id,
            reason: 'proof_required',
            receipt,
          });
        }
        if (!amountMatches) {
          waEvent.summary += `\nproof_amount_mismatch=${receiptAmount}!=${orderTotal}`;
          await supabaseStore.from('wa_messages').insert(waEvent as any);
          return res.status(409).json({
            ok: false,
            matched: true,
            orderId: result.order.id,
            reason: 'proof_amount_mismatch',
            receipt,
          });
        }

        // Marcar wa_proof_received
        await supabaseStore
          .from('store_orders')
          .update({ wa_proof_received: true, wa_message_id: panelMessageId ?? fromWa } as any)
          .eq('id', result.order.id);

        if (mediaUrl || receipt) {
          try {
            const proofHash = `wa-proof:${result.order.id}:${panelMessageId ?? mediaUrl ?? Date.now()}`;
            const { data: existingProof } = await supabaseStore
              .from('payment_events')
              .select('id')
              .eq('hash', proofHash)
              .maybeSingle();
            if (!existingProof) {
              await supabaseStore.from('payment_events').insert({
                source: 'wa_proof',
                raw_text: waEvent.summary.slice(0, 1000),
                amount: receiptAmount ?? orderTotal,
                sender_name: receipt?.cliente ?? '',
                sender_wa: cleanFrom,
                processed: false,
                match_confidence: result.confidence,
                hash: proofHash,
                matched_order_id: result.order.id,
              } as any);
            }
          } catch (proofErr: any) {
            console.warn('[store-wa] No se pudo guardar evidencia de comprobante:', proofErr?.message ?? proofErr);
          }
        }

        // Si ya había notificación bancaria → verificar con cuadrangulación completa
        const { data: bankEvent } = await supabaseStore
          .from('payment_events')
          .select('id')
          .eq('matched_order_id', result.order.id)
          .eq('processed', true)
          .maybeSingle();

        let mainBankPago: any = null;
        const orderCreatedAt = result.order.created_at
          ? new Date(new Date(result.order.created_at).getTime() - 2 * 60 * 1000).toISOString()
          : new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: pagos } = await supabaseServer
          .from('pagos')
          .select('id,nombre,pago,created_at,date,method,status')
          .eq('pago', Number(result.order.total))
          .gte('created_at', orderCreatedAt)
          .order('created_at', { ascending: false })
          .limit(10);

        const candidates = (pagos ?? []).filter((p: any) => !String(p.method ?? '').toLowerCase().includes('tienda online'));
        const receiptName = cleanName(receipt?.cliente ?? '');
        const nameMatches = receiptName
          ? candidates.filter((p: any) => {
              const bankName = cleanName(p.nombre ?? '');
              return bankName === receiptName || bankName.includes(receiptName) || receiptName.includes(bankName);
            })
          : [];

        if (nameMatches.length === 1) {
          mainBankPago = nameMatches[0];
        } else if (!receiptName && candidates.length === 1) {
          mainBankPago = candidates[0];
        } else if (receiptName && candidates.length === 1) {
          mainBankPago = candidates[0];
        } else if (candidates.length > 1) {
          console.warn(`[store-wa] ${candidates.length} pagos bancarios de ${result.order.total} Bs; no se confirma sin nombre unico`);
        }

        if (bankEvent || mainBankPago) {
          if (mainBankPago && !bankEvent) {
            await supabaseStore.from('payment_events').insert({
              source: 'wa_proof_main_bank',
              raw_text: messageText ?? '',
              amount: Number(result.order.total),
              sender_name: receipt?.cliente ?? mainBankPago.nombre ?? '',
              sender_wa: cleanFrom,
              processed: true,
              match_confidence: 'maxima',
              hash: `wa-proof:${result.order.id}:${mainBankPago.id}`,
              matched_order_id: result.order.id,
            } as any);
          }
          const linkedPagoForConfirm = mainBankPago
            ? { ...mainBankPago, nombre: receipt?.cliente || mainBankPago.nombre }
            : null;
          await confirmStoreOrder(result.order.id, `wa+bank:${fromWa}:maxima`, linkedPagoForConfirm);
        } else {
          // WA llegó primero que el banco → marcar como esperando banco
          console.log(`[store-wa] Pedido #${result.order.id} — WA recibido, esperando banco`);
        }
      }

      await supabaseStore.from('wa_messages').insert(waEvent as any);

      res.json({
        ok: true,
        matched: !!result,
        orderId: result?.order.id ?? null,
        receipt,
        messageCreatedAt: messageCreatedAt ?? null,
      });

    } catch (err: any) {
      console.error('[store/ingest-wa]', err);
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  app.get('/api/store/download-qr', async (_req, res) => {
    try {
      const { data } = await supabaseStore
        .from('store_settings')
        .select('setting_value')
        .eq('setting_key', 'payment_qr_url')
        .maybeSingle();

      const qrUrl = String(data?.setting_value || '').trim();
      if (qrUrl && /^https?:\/\//i.test(qrUrl)) {
        const response = await fetch(qrUrl);
        if (!response.ok) throw new Error(`No se pudo descargar QR configurado: ${response.status}`);
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
        const buffer = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Disposition', `attachment; filename="Leidy-American-QR.${extension}"`);
        res.setHeader('Content-Type', contentType);
        res.send(buffer);
        return;
      }

      if (qrUrl && qrUrl.startsWith('/')) {
        const fileName = qrUrl.replace(/^\/+/, '');
        const qrPath = path.join(process.cwd(), 'public', fileName);
        res.setHeader('Content-Disposition', `attachment; filename="Leidy-American-QR${path.extname(fileName) || '.jpg'}"`);
        res.sendFile(qrPath);
        return;
      }

      const qrPath = path.join(process.cwd(), 'public', 'qr-yape.jpg');
      res.setHeader('Content-Disposition', 'attachment; filename="Leidy-American-QR.jpg"');
      res.setHeader('Content-Type', 'image/jpeg');
      res.sendFile(qrPath);
    } catch (err: any) {
      console.error('[store/download-qr]', err?.message ?? err);
      res.status(500).json({ error: 'No se pudo descargar el QR configurado' });
    }
  });

  // Clienta confirma sus prendas desde su perfil
  app.post('/api/store-orders/:id/customer-confirm', async (req, res) => {
    const orderId = Number(req.params.id);
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'No autenticado' });

    const { data: authData, error: authError } = await createStoreAuthClient().auth.getUser(token);
    if (authError || !authData?.user) return res.status(401).json({ error: 'Sesión inválida' });

    const phone = authData.user.email?.replace('@tiendaleydi.com', '') ?? '';

    const { data: order, error: orderErr } = await supabaseStore
      .from('store_orders')
      .select('id, customer_wa, status, customer_selection')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (order.customer_wa !== phone) return res.status(403).json({ error: 'No autorizado' });

    const { error: updateErr } = await supabaseStore
      .from('store_orders')
      .update({
        customer_selection: {
          ...(typeof order.customer_selection === 'object' && order.customer_selection ? order.customer_selection : {}),
          confirmed: true,
          confirmed_at: new Date().toISOString(),
          confirmed_by: 'customer',
        },
      })
      .eq('id', orderId);

    if (updateErr) return res.status(500).json({ error: 'No se pudo guardar' });
    return res.json({ ok: true });
  });

  // Leer fechas de retiro disponibles (público)
  app.get('/api/store/pickup-dates', async (_req, res) => {
    try {
      const { data } = await supabaseStore
        .from('store_settings')
        .select('setting_value')
        .eq('setting_key', 'pickup_dates')
        .maybeSingle();
      const raw = data?.setting_value;
      const dates = raw ? JSON.parse(raw) : [];
      return res.json({ dates });
    } catch {
      return res.json({ dates: [] });
    }
  });

  // Guardar fechas de retiro (solo admin)
  app.patch('/api/store/pickup-dates', async (req, res) => {
    const { dates } = req.body as { dates: Array<{ date: string; label: string; slots: string[] }> };
    if (!Array.isArray(dates)) return res.status(400).json({ error: 'dates debe ser array' });
    try {
      const { error } = await supabaseStore
        .from('store_settings')
        .upsert({ setting_key: 'pickup_dates', setting_value: JSON.stringify(dates) }, { onConflict: 'setting_key' });
      if (error) throw error;
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Clienta guarda la fecha elegida en su pedido
  app.post('/api/store-orders/:id/set-delivery', async (req, res) => {
    const orderId = Number(req.params.id);
    const { delivery_date, delivery_slot } = req.body as { delivery_date: string; delivery_slot: string };
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'No autenticado' });

    const { data: authData, error: authError } = await createStoreAuthClient().auth.getUser(token);
    if (authError || !authData?.user) return res.status(401).json({ error: 'Sesión inválida' });

    const phone = authData.user.email?.replace('@tiendaleydi.com', '') ?? '';

    const { data: order, error: orderErr } = await supabaseStore
      .from('store_orders')
      .select('id, customer_wa')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (order.customer_wa !== phone) return res.status(403).json({ error: 'No autorizado' });

    const { error: updateErr } = await supabaseStore
      .from('store_orders')
      .update({ delivery_date, delivery_slot, delivery_type: 'retiro' })
      .eq('id', orderId);

    if (updateErr) return res.status(500).json({ error: 'No se pudo guardar' });
    return res.json({ ok: true });
  });

  // ── Endpoint 5: Pedidos de tienda esperando verificación manual ──
  app.get('/api/store/pending-manual', async (_req, res) => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabaseStore
        .from('store_orders')
        .select('id, customer_wa, customer_name, total, items, created_at')
        .eq('status', 'pending')
        .eq('wa_proof_received', true)
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  // ── Endpoint 6: Verificación manual de pago de tienda por el operador ──
  app.post('/api/store/verify-manual/:storeOrderId', async (req, res) => {
    try {
      const storeOrderId = parseInt(req.params.storeOrderId);
      if (isNaN(storeOrderId)) return res.status(400).json({ error: 'ID inválido' });
      const confirmed = await confirmStoreOrder(storeOrderId, 'manual-web');
      if (!confirmed) return res.status(400).json({ error: 'No se pudo confirmar — ya pagado o no existe' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Error interno' });
    }
  });

  // ── Favoritos de clientes ────────────────────────────────────────
  app.get('/api/store/favorites/:phone', async (req, res) => {
    const phone = req.params.phone.replace(/\D/g, '');
    const { data, error } = await supabaseStore
      .from('store_favorites')
      .select('product_id, created_at')
      .eq('customer_wa', phone)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  });

  app.post('/api/store/favorites/toggle', async (req, res) => {
    const { phone, productId } = req.body ?? {};
    if (!phone || !productId) return res.status(400).json({ error: 'phone y productId requeridos' });
    const cleanPhone = String(phone).replace(/\D/g, '');
    const { data: existing } = await supabaseStore
      .from('store_favorites')
      .select('id')
      .eq('customer_wa', cleanPhone)
      .eq('product_id', String(productId))
      .maybeSingle();
    if (existing) {
      await supabaseStore.from('store_favorites').delete()
        .eq('customer_wa', cleanPhone).eq('product_id', String(productId));
      return res.json({ liked: false });
    }
    await supabaseStore.from('store_favorites').insert({ customer_wa: cleanPhone, product_id: String(productId) });
    res.json({ liked: true });
  });

  app.get('/api/store/favorites/:phone/products', async (req, res) => {
    const phone = req.params.phone.replace(/\D/g, '');
    const { data: favs } = await supabaseStore
      .from('store_favorites')
      .select('product_id')
      .eq('customer_wa', phone);
    if (!favs?.length) return res.json([]);
    const ids = favs.map((f: any) => f.product_id);
    const { data: products, error } = await supabaseStore
      .from('products')
      .select('id, title, price, images, sizes, available, stock')
      .in('id', ids);
    if (error) return res.status(500).json({ error: error.message });
    res.json(products ?? []);
  });

  // ── Endpoint 7: Espejo de Fotos de WhatsApp para la Tienda ──────
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
      const storeBase = publicStoreBaseUrl(process.env.STORE_URL);
      const storeLink = `${storeBase}/tienda#profile/confirmar`;

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

      let linkedPago: any = null;
      if (String(source ?? '').startsWith('chehi:')) {
        const orderWindowStart = order.created_at
          ? new Date(new Date(order.created_at).getTime() - 2 * 60 * 1000).toISOString()
          : new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: recentPagos, error: recentPagoErr } = await supabaseServer
          .from('pagos')
          .select('id,nombre,pago,method,status,customer_id,user_id,created_at,date')
          .eq('pago', Number(order.total))
          .gte('created_at', orderWindowStart)
          .order('created_at', { ascending: false })
          .limit(5);

        if (recentPagoErr) {
          console.warn('[store/match-payment] no se pudo buscar pago vinculado:', recentPagoErr.message);
        } else {
          const candidates = (recentPagos ?? []).filter((p: any) => {
            const method = String(p.method ?? '').toLowerCase();
            return !method.includes('tienda online');
          });
          if (candidates.length === 1) {
            linkedPago = candidates[0];
            console.log(`[store/match-payment] Pago bancario #${linkedPago.id} vinculado a pedido #${order.id}`);
          } else if (candidates.length > 1) {
            console.warn(`[store/match-payment] ${candidates.length} pagos recientes de ${order.total} Bs; no se vincula sin codigo WA`);
          }
        }
      }

      const sourceText = String(source ?? 'manual');
      const autoCandidate = sourceText.startsWith('chehi:') || sourceText.startsWith('bank:') || sourceText.startsWith('pagos:');
      const sourceConfidence = sourceText.split(':').pop();
      const canAutoConfirm = !autoCandidate || (sourceConfidence === 'alta' && await isStoreCustomerVerifiedForAuto(order));

      if (!canAutoConfirm) {
        await markStoreOrderBankDetected(order, sourceText);
        return res.json({
          ok: true,
          matched: true,
          confirmed: false,
          requiresProof: true,
          orderId: order.id,
          total: order.total,
          customerWa: order.customer_wa,
        });
      }

      const ok = await confirmStoreOrder(order.id, sourceText, linkedPago);
      if (!ok) {
        return res.status(409).json({ ok: false, error: 'El pedido ya fue procesado o no está pendiente' });
      }

      res.json({ ok: true, confirmed: true, orderId: order.id, total: order.total, customerWa: order.customer_wa });

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
      const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
      const response = await fetch(
        `${supabaseUrl}/functions/v1/ingest-notification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(supabaseAnonKey ? { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` } : {}),
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

  app.post('/api/ingest-bank-store', async (req, res) => {
    try {
      const storeSupabaseUrl = process.env.VITE_STORE_SUPABASE_URL;

      if (!storeSupabaseUrl) {
        return res.status(500).json({ error: 'Tienda no configurada' });
      }

      const response = await fetch(
        `${storeSupabaseUrl}/functions/v1/ingest-bank-store`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body),
        }
      );

      const text = await response.text();
      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('application/json')) {
        return res.status(response.status).json(JSON.parse(text));
      }

      return res.status(response.status).send(text);
    } catch (err: any) {
      console.error('[ingest-bank-store bridge]', err?.message);
      res.status(500).json({ error: 'Error enviando pago a tienda', detail: err?.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    try {
      const viteModule = await import("vite");
      const vite = await viteModule.createServer({
        server: { middlewareMode: true },
        appType: "custom",
      });
      app.use(vite.middlewares);
      const renderViteHtml = async (req: any, res: any, next: any, fileName: string) => {
        try {
          const { readFileSync } = await import("fs");
          const html = readFileSync(path.join(process.cwd(), fileName), "utf-8");
          const transformed = await vite.transformIndexHtml(req.url, html);
          res.status(200).set({ "Content-Type": "text/html" }).end(transformed);
        } catch (e) { next(e); }
      };
      app.get(["/tienda", "/tienda/*"], (req, res, next) => {
        renderViteHtml(req, res, next, "tienda.html");
      });
      app.get("*", async (req, res, next) => {
        renderViteHtml(req, res, next, "index.html");
      });
    } catch (e) {
      console.log("Vite no disponible en este entorno", e);
    }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get(["/tienda", "/tienda/*"], (_req, res) => {
      res.sendFile(path.join(distPath, "tienda.html"));
    });
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
