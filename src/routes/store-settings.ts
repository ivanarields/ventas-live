import { Router, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createStoreSettingsRouter(supabaseStore: SupabaseClient) {
  const router = Router();

  // GET /api/store/settings
  router.get('/settings', async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseStore
        .from('store_settings')
        .select('*');
      if (error) throw error;
      const settings: Record<string, string> = {};
      for (const row of data || []) {
        settings[row.setting_key] = row.setting_value || '';
      }
      res.json(settings);
    } catch (err: any) {
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
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  // GET /api/store/external-purchases/:phone
  router.get('/external-purchases/:phone', async (req: Request, res: Response) => {
    try {
      const clean = String(req.params.phone).replace(/\D/g, '');
      const { data, error } = await supabaseStore
        .from('store_external_purchases')
        .select('*')
        .ilike('customer_wa', `%${clean}%`)
        .order('purchase_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  // POST /api/store/external-purchases
  // Admin: crear compra externa resumida (Live, manual, etc.)
  router.post('/external-purchases', async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'x-user-id requerido' });

      const { customer_wa, customer_name, items, total, status, purchase_date, source, source_id, payload } = req.body;

      const { data, error } = await supabaseStore
        .from('store_external_purchases')
        .insert({
          customer_wa: String(customer_wa).replace(/\D/g, ''),
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
      res.status(201).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error interno' });
    }
  });

  return router;
}
