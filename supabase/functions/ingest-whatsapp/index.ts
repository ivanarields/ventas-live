import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('PANEL_SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('PANEL_SUPABASE_SERVICE_KEY')!;

function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let phone = raw.replace(/@[a-z.]+$/, '');
  if (/^[678]\d{7}$/.test(phone)) phone = '591' + phone;
  return phone;
}

Deno.serve(async (req) => {
  const bodyClone = req.clone();
  EdgeRuntime.waitUntil(processMessage(bodyClone));
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

async function processMessage(req: Request) {
  try {
    const item = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Datos ya normalizados por el Bridge
    const hasMedia = item.hasMedia === true;
    // Priorizar fromPhone (número real extraído por getContact())
    // Si no existe, usar el from normalizado (puede ser LID en cuentas modernas)
    const fromPhone = item.fromPhone 
      ? normalizePhone(item.fromPhone)
      : normalizePhone(item.from);
    const toPhone   = normalizePhone(item.to);
    const direction = item.from === item.to ? 'out' : 'in';
    const clientPhone = direction === 'in' ? fromPhone : toPhone;

    const mediaUrl: string | null = item.mediaUrl || null;
    const mediaMimetype: string | null = item.mediaMimetype || null;

    if (!clientPhone) {
      console.error('No se pudo determinar el teléfono del cliente');
      return;
    }

    console.log(`📨 Mensaje | Tipo: ${hasMedia ? 'Media' : 'Texto'} | De: ${clientPhone} | Media URL: ${mediaUrl || 'ninguna'}`);

    // Upsert cliente
    const { data: clienteData, error: clienteError } = await supabase
      .from('panel_clientes')
      .upsert(
        { phone: clientPhone, last_interaction: new Date().toISOString() },
        { onConflict: 'phone' }
      )
      .select('id')
      .single();

    if (clienteError || !clienteData) {
      console.error('Error upsert cliente:', clienteError);
      return;
    }

    // Insertar mensaje (media_url ya tiene la URL pública o null)
    const { error: mensajeError } = await supabase.from('panel_mensajes').insert({
      cliente_id: clienteData.id,
      direction,
      content: item.body || null,
      has_media: hasMedia,
      media_url: mediaUrl,
      media_type: mediaMimetype,
    });

    if (mensajeError) {
      console.error('Error insert mensaje:', mensajeError);
    } else {
      console.log(`✅ Mensaje guardado correctamente.`);
    }

    // Log de auditoría (payload liviano, sin base64)
    await supabase.from('panel_raw_webhooks').insert({
      payload: item,
      status: 'processed',
    });

  } catch (err) {
    console.error('Error general:', err);
  }
}
