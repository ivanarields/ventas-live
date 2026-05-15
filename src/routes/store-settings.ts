import { Router, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createStoreSettingsRouter(supabaseStore: SupabaseClient) {
  const router = Router();

  const DEFAULT_SETTINGS: Record<string, string> = {
    store_name: 'Leidy Shop',
    store_phone: '59160003230',
    reservation_minutes: '1',
    delivery_enabled: 'true',
    pickup_enabled: 'true',
    next_live_date: '',
    next_live_time: '',
    delivery_note: 'Entregas de lunes a sabado.',
    address: 'Consulta por WhatsApp',
    store_chips: '',
    payment_qr_url: '/qr-leidy-shop.jpg',
  };

  const DEFAULT_DELIVERY_SLOTS = [
    { id: 1, name: 'Manana', start_time: '08:00', end_time: '12:00', active: true, sort_order: 1 },
    { id: 2, name: 'Tarde', start_time: '12:00', end_time: '17:00', active: true, sort_order: 2 },
    { id: 3, name: 'Noche', start_time: '17:00', end_time: '21:00', active: true, sort_order: 3 },
  ];

  function isMissingTable(err: any): boolean {
    const message = String(err?.message ?? err ?? '').toLowerCase();
    return err?.code === '42P01'
      || err?.code === 'PGRST205'
      || message.includes('could not find the table')
      || message.includes('does not exist')
      || message.includes('schema cache');
  }

  function normalizePhone(raw: unknown): string {
    const clean = String(raw ?? '').replace(/\D/g, '');
    if (!clean) return '';
    return clean.startsWith('591') ? clean : `591${clean}`;
  }

  async function ensureStoreCustomer(customerWa: unknown, customerName?: unknown) {
    const whatsapp = normalizePhone(customerWa);
    if (!whatsapp) throw new Error('customer_wa requerido');
    const displayName = String(customerName ?? '').trim();

    const { data: existing, error: findError } = await supabaseStore
      .from('store_customers')
      .select('id, whatsapp, display_name')
      .eq('whatsapp', whatsapp)
      .maybeSingle();
    if (findError) throw findError;

    if (existing) {
      if (displayName && !existing.display_name) {
        await supabaseStore
          .from('store_customers')
          .update({ display_name: displayName })
          .eq('id', existing.id);
      }
      return { ...existing, whatsapp, display_name: existing.display_name || displayName };
    }

    const { data, error } = await supabaseStore
      .from('store_customers')
      .insert({
        whatsapp,
        display_name: displayName,
        pin_hash: 'profile-only',
      })
      .select('id, whatsapp, display_name')
      .single();
    if (error) throw error;
    return data;
  }

  async function saveCustomerMediaReferences(input: {
    customerWa: unknown;
    customerName?: unknown;
    media: any[];
    defaultStatus?: string;
    defaultTipo?: string;
    sourceType?: string;
    sourceId?: unknown;
    orderId?: unknown;
    purchaseId?: unknown;
  }) {
    const customer = await ensureStoreCustomer(input.customerWa, input.customerName);
    const rows = (Array.isArray(input.media) ? input.media : [])
      .map((item) => typeof item === 'string' ? { media_url: item } : item)
      .filter((item) => item?.media_url || item?.url)
      .map((item) => ({
        customer_id: customer.id,
        customer_wa: customer.whatsapp,
        customer_name: customer.display_name || String(input.customerName ?? '').trim() || null,
        media_url: item.media_url ?? item.url,
        media_type: item.media_type ?? null,
        panel_mensaje_id: item.panel_mensaje_id ?? item.message_id ?? null,
        source_type: item.source_type ?? input.sourceType ?? 'whatsapp_panel',
        source_id: String(item.source_id ?? input.sourceId ?? '' ) || null,
        order_id: item.order_id ?? input.orderId ?? null,
        purchase_id: item.purchase_id ?? input.purchaseId ?? null,
        tipo: item.tipo ?? input.defaultTipo ?? 'prenda',
        status: item.status ?? input.defaultStatus ?? 'candidata',
        description: item.description ?? item.descripcion ?? null,
        message_created_at: item.message_created_at ?? item.created_at ?? null,
        metadata: item.metadata ?? {},
      }));

    if (rows.length === 0) return { customer, saved: 0 };
    const { error } = await supabaseStore
      .from('store_customer_media')
      .upsert(rows, { onConflict: 'customer_wa,media_url' });
    if (error) throw error;
    return { customer, saved: rows.length };
  }

  // GET /api/store/settings
  router.get('/settings', async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseStore
        .from('store_settings')
        .select('*');
      if (error) {
        if (isMissingTable(error)) return res.json(DEFAULT_SETTINGS);
        throw error;
      }
      const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
      for (const row of data || []) {
        settings[row.setting_key] = row.setting_value || '';
      }
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=300');
      res.json(settings);
    } catch (err: any) {
      if (isMissingTable(err)) return res.json(DEFAULT_SETTINGS);
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  // PATCH /api/store/settings
  router.patch('/settings', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });

      const updates = req.body;
      for (const [key, value] of Object.entries(updates)) {
        await supabaseStore
          .from('store_settings')
          .upsert({ setting_key: key, setting_value: String(value) }, { onConflict: 'setting_key' });
      }
      res.json({ ok: true });
    } catch (err: any) {
      if (isMissingTable(err)) {
        return res.status(503).json({ error: 'La configuracion de tienda requiere aplicar la migracion TiendaOnline.' });
      }
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  // GET /api/store/delivery-slots
  router.get('/delivery-slots', async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseStore
        .from('store_delivery_slots')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (error) {
        if (isMissingTable(error)) return res.json(DEFAULT_DELIVERY_SLOTS);
        throw error;
      }
      res.json(data || []);
    } catch (err: any) {
      if (isMissingTable(err)) return res.json(DEFAULT_DELIVERY_SLOTS);
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  // GET /api/store/customer-media/:phone
  // Perfil de tienda: lista links de fotos del Panel WhatsApp / tienda sin duplicar archivos.
  router.get('/customer-media/:phone', async (req: Request, res: Response) => {
    try {
      const clean = normalizePhone(req.params.phone);
      const { data, error } = await supabaseStore
        .from('store_customer_media')
        .select('*')
        .eq('customer_wa', clean)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) {
        if (isMissingTable(error)) return res.json([]);
        throw error;
      }
      res.json(data || []);
    } catch (err: any) {
      if (isMissingTable(err)) return res.json([]);
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  // POST /api/store/customer-media
  // Admin/sistemas: guarda referencias a fotos. No copia ni sube imagenes.
  router.post('/customer-media', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });

      const result = await saveCustomerMediaReferences({
        customerWa: req.body.customer_wa ?? req.body.phone,
        customerName: req.body.customer_name,
        media: req.body.media ?? req.body.photos ?? [],
        defaultStatus: req.body.status,
        defaultTipo: req.body.tipo,
        sourceType: req.body.source_type,
        sourceId: req.body.source_id,
        orderId: req.body.order_id,
        purchaseId: req.body.purchase_id,
      });
      res.status(201).json({ ok: true, ...result });
    } catch (err: any) {
      if (isMissingTable(err)) {
        return res.status(503).json({ error: 'El historial visual requiere aplicar la migracion TiendaOnline.' });
      }
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  // GET /api/store/external-purchases/:phone
  router.get('/external-purchases/:phone', async (req: Request, res: Response) => {
    try {
      const clean = normalizePhone(req.params.phone);
      const { data, error } = await supabaseStore
        .from('store_external_purchases')
        .select('*')
        .ilike('customer_wa', `%${clean}%`)
        .order('purchase_date', { ascending: false })
        .limit(100);
      if (error) {
        if (isMissingTable(error)) return res.json([]);
        throw error;
      }
      res.json(data || []);
    } catch (err: any) {
      if (isMissingTable(err)) return res.json([]);
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  // POST /api/store/external-purchases
  // Admin: crear compra externa resumida (Live, manual, etc.)
  router.post('/external-purchases', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });

      const { customer_wa, customer_name, items, total, status, purchase_date, source, source_id, payload, media } = req.body;
      const customer = await ensureStoreCustomer(customer_wa, customer_name);

      const { data, error } = await supabaseStore
        .from('store_external_purchases')
        .insert({
          customer_id: customer.id,
          customer_wa: customer.whatsapp,
          customer_name: customer_name || '',
          items: items || [],
          total: total || 0,
          status: status || 'completed',
          purchase_date: purchase_date || new Date().toISOString(),
          source: source || 'manual',
          source_id: source_id || null,
          payload: payload || {},
        })
        .select()
        .single();

      if (error) throw error;
      const mediaItems = Array.isArray(media) ? media : (Array.isArray(payload?.media) ? payload.media : []);
      if (mediaItems.length > 0) {
        await saveCustomerMediaReferences({
          customerWa: customer.whatsapp,
          customerName: customer_name,
          media: mediaItems,
          defaultStatus: 'comprada',
          defaultTipo: 'prenda',
          sourceType: source || 'external_purchase',
          sourceId: source_id || data.id,
          purchaseId: data.id,
        });
      }
      res.status(201).json(data);
    } catch (err: any) {
      if (isMissingTable(err)) {
        return res.status(503).json({ error: 'Las compras externas requieren aplicar la migracion TiendaOnline.' });
      }
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  return router;
}
