import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('PANEL_SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('PANEL_SUPABASE_SERVICE_KEY')!;
// DB principal (ChehiAppAbril) — para depositar identity_evidence
const MAIN_URL = Deno.env.get('SUPABASE_URL') || '';
const MAIN_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const INGEST_USER_ID = Deno.env.get('INGEST_USER_ID') || '';;

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
    const direction = item.fromMe === true ? 'out' : 'in';
    const clientPhone = direction === 'in' ? fromPhone : toPhone;
    // Teléfono con + para identity_profiles (identityService.ts usa +591xxx)
    const identityPhone = clientPhone ? (clientPhone.startsWith('+') ? clientPhone : '+' + clientPhone) : null;

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

    // Depositar evidencia de identidad en DB principal (fire-and-forget)
    if (MAIN_URL && MAIN_KEY && INGEST_USER_ID && direction === 'in') {
      (async () => {
        try {
          const mainDb = createClient(MAIN_URL, MAIN_KEY);
          const nombreRaw = item.notifyName || item.pushname || null;
          const nameNorm = nombreRaw
            ? nombreRaw.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z\s]/g, '').replace(/\s+/g, ' ').trim()
            : null;
          const sourceId = String(clienteData.id);

          // Si ya existe evidencia para este contacto, no duplicar
          const { data: existing } = await mainDb
            .from('identity_evidence')
            .select('id, profile_id')
            .eq('user_id', INGEST_USER_ID)
            .eq('source', 'whatsapp')
            .eq('source_id', sourceId)
            .limit(1)
            .single();

          if (existing) {
            // Ya existe — si le falta profile_id, intentar vincularlo ahora
            if (!existing.profile_id) {
              // buscar perfil por teléfono
              const { data: byPhone } = await mainDb
                .from('identity_profiles')
                .select('id')
                .eq('user_id', INGEST_USER_ID)
                .eq('phone', identityPhone)
                .limit(1)
                .single();
              if (byPhone) {
                await mainDb.from('identity_evidence').update({ profile_id: byPhone.id }).eq('id', existing.id);
              }
            }
            return;
          }

          // Buscar perfil existente por teléfono
          let profileId: string | null = null;
          const { data: byPhone } = await mainDb
            .from('identity_profiles')
            .select('id')
            .eq('user_id', INGEST_USER_ID)
            .eq('phone', identityPhone)
            .limit(1)
            .single();
          if (byPhone) {
            profileId = byPhone.id;
          }

          // Si no hay por teléfono, buscar por nombre normalizado
          if (!profileId && nameNorm) {
            const { data: allProfiles } = await mainDb
              .from('identity_profiles')
              .select('id, display_name')
              .eq('user_id', INGEST_USER_ID);
            const match = allProfiles?.find(p =>
              p.display_name.toUpperCase().normalize('NFD')
                .replace(/[̀-ͯ]/g, '').replace(/[^A-Z\s]/g, '')
                .replace(/\s+/g, ' ').trim() === nameNorm
            );
            if (match) profileId = match.id;
          }

          // Si no existe perfil, crear uno nuevo
          if (!profileId) {
            const { data: newProfile } = await mainDb
              .from('identity_profiles')
              .insert({
                user_id: INGEST_USER_ID,
                display_name: nombreRaw ?? identityPhone ?? 'Sin nombre',
                phone: identityPhone,
                panel_phone: identityPhone,
                confidence: 1.0,
                origin: 'auto',
              })
              .select('id')
              .single();
            profileId = newProfile?.id ?? null;
          } else {
            // Perfil existe — vincular panel_phone si falta
            await mainDb
              .from('identity_profiles')
              .update({ panel_phone: identityPhone })
              .eq('id', profileId)
              .is('panel_phone', null);
          }

          await mainDb.from('identity_evidence').insert({
            user_id: INGEST_USER_ID,
            profile_id: profileId,
            source: 'whatsapp',
            source_id: sourceId,
            source_ref: clientPhone,
            event_type: 'message',
            phone: clientPhone,
            name_raw: nombreRaw,
            name_normalized: nameNorm,
            event_at: new Date().toISOString(),
            payload: { has_media: hasMedia, media_type: mediaMimetype },
          });

          console.log(`[identity] WhatsApp vinculado → profile_id: ${profileId}`);
        } catch (e) {
          console.error('[identity deposit]', e);
        }
      })();
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
