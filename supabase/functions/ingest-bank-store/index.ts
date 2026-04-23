// Edge Function: ingest-bank-store
// Proyecto: TiendaOnline (thgbfurscfjcmgokyyif)
// Propósito: Recibe notificaciones bancarias de MacroDroid y las reenvía
//            al motor de cuadrangulación del servidor Express.
//
// Deploy: supabase functions deploy ingest-bank-store --no-verify-jwt --project-ref thgbfurscfjcmgokyyif

import { createClient } from 'jsr:@supabase/supabase-js@2';

const STORE_URL = Deno.env.get('SUPABASE_URL')!;
const STORE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// URL pública de tu servidor (ngrok en dev, dominio en prod)
const SERVER_URL = Deno.env.get('SERVER_URL') ?? 'http://localhost:3004';

Deno.serve(async (req: Request) => {
  // CORS para MacroDroid
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { amount, senderName, senderPhone, rawText, hash, source } = body;

    if (!amount) {
      return new Response(JSON.stringify({ error: 'amount requerido' }), { status: 400 });
    }

    const supabase = createClient(STORE_URL, STORE_KEY);

    // 1. Guardar evento raw en la base de datos
    const parsedAmount = Number(amount);
    const hashKey = hash ?? `${Date.now()}-${parsedAmount}-${senderPhone ?? ''}`;

    // Idempotencia: verificar si ya existe este hash
    const { data: existing } = await supabase
      .from('payment_events')
      .select('id, matched_order_id')
      .eq('hash', hashKey)
      .single();

    if (existing) {
      return new Response(JSON.stringify({
        ok: true,
        duplicate: true,
        orderId: existing.matched_order_id
      }), { status: 200 });
    }

    // 2. Buscar pedido pendiente que coincida
    const windowStart = new Date(Date.now() - 35 * 60 * 1000).toISOString();

    let query = supabase
      .from('store_orders')
      .select('*')
      .eq('status', 'pending')
      .gt('created_at', windowStart)
      .eq('total', parsedAmount);

    if (senderPhone) {
      const cleanPhone = String(senderPhone).replace(/\D/g, '');
      if (cleanPhone) query = query.ilike('customer_wa', `%${cleanPhone}%`);
    }

    const { data: candidates } = await query.order('created_at', { ascending: false });
    const matched = candidates?.[0] ?? null;

    // 3. Guardar el evento
    const eventRow: any = {
      source: source ?? 'macrodroid',
      raw_text: rawText ?? '',
      amount: parsedAmount,
      sender_name: senderName ?? '',
      sender_wa: senderPhone ?? '',
      processed: !!matched,
      match_confidence: matched ? 'auto' : 'none',
      hash: hashKey,
    };

    // 4. Si hay match → confirmar el pedido directamente en la DB
    if (matched) {
      const { data: updatedOrder } = await supabase
        .from('store_orders')
        .update({
          status: 'paid',
          payment_verified_at: new Date().toISOString(),
          payment_method: 'qr',
          payment_ref: `bank:${hashKey}`,
        })
        .eq('id', matched.id)
        .eq('status', 'pending') // idempotencia
        .select()
        .single();

      if (updatedOrder) {
        eventRow.matched_order_id = matched.id;

        // Ocultar productos vendidos
        const productIds = (updatedOrder.items ?? [])
          .map((i: any) => i.productId)
          .filter(Boolean);

        if (productIds.length > 0) {
          await supabase.from('products').update({ available: false }).in('id', productIds);
        }

        console.log(`[ingest-bank-store] ✅ Pedido #${matched.id} verificado. Monto: ${parsedAmount} Bs`);
      }
    }

    await supabase.from('payment_events').insert(eventRow);

    return new Response(JSON.stringify({
      ok: true,
      matched: !!matched,
      orderId: matched?.id ?? null,
      amount: parsedAmount,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err: any) {
    console.error('[ingest-bank-store] Error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Error interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
