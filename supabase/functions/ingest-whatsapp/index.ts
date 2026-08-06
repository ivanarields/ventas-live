import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('PANEL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('PANEL_SUPABASE_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// DB principal (ChehiAppAbril) — para depositar identity_evidence
const MAIN_URL = Deno.env.get('MAIN_SUPABASE_URL') || Deno.env.get('APP_SUPABASE_URL') || '';
const MAIN_KEY = Deno.env.get('MAIN_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY') || '';
const INGEST_USER_ID = Deno.env.get('INGEST_USER_ID') || '';;
const SERVER_URL = Deno.env.get('SERVER_URL') || Deno.env.get('APP_SERVER_URL') || '';
const WHATSAPP_LIVE_ONLY = (Deno.env.get('WHATSAPP_LIVE_ONLY') || 'true').toLowerCase() !== 'false';

function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let phone = raw.replace(/@[a-z.]+$/, '');
  if (/^[678]\d{7}$/.test(phone)) phone = '591' + phone;
  return phone;
}

async function hasActiveProcessingLive(): Promise<boolean> {
  if (!WHATSAPP_LIVE_ONLY) return true;
  if (!MAIN_URL || !MAIN_KEY) {
    console.warn('[whatsapp-live-only] Configuracion incompleta; se permite guardar para evitar perdida accidental.');
    return true;
  }

  const mainDb = createClient(MAIN_URL, MAIN_KEY);
  // IMPORTANTE: No filtramos por user_id si no está configurado para evitar
  // que mensajes sean descartados silenciosamente por variable faltante.
  let query = mainDb
    .from('live_sessions')
    .select('id')
    .eq('status', 'live')
    .limit(1);

  if (INGEST_USER_ID) {
    query = query.eq('user_id', INGEST_USER_ID) as any;
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('[whatsapp-live-only] Error consultando Live activo:', error);
    return true; // ante error, permitir para no perder mensajes
  }

  const activo = !!data;
  console.log(`[whatsapp-live-only] Live activo: ${activo} (session id: ${data?.id ?? 'ninguna'})`);
  return activo;
}

Deno.serve(async (req) => {
  const result = await processMessage(req);
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

async function processMessage(req: Request) {
  try {
    const item = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    async function audit(status: string, extra: Record<string, unknown> = {}) {
      try {
        await supabase.from('panel_raw_webhooks').insert({
          payload: { ...item, ingest_status: status, ...extra },
          status,
        });
      } catch (e) {
        console.error('[panel_raw_webhooks]', e);
      }
    }

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
    const messageId: string | null = typeof item.id === 'string' && item.id.trim()
      ? item.id.trim()
      : null;
    const content: string | null = typeof item.body === 'string' && item.body.trim()
      ? item.body.trim()
      : null;
    const hasUsableMedia = hasMedia && !!mediaUrl;

    if (!clientPhone) {
      console.error('No se pudo determinar el teléfono del cliente');
      await audit('skipped_no_phone');
      return 'skipped_no_phone';
    }

    if (!content && !hasUsableMedia) {
      console.log(`Mensaje vacío ignorado | De: ${clientPhone}`);
      await audit('skipped_empty');
      return 'skipped_empty';
    }

    console.log(`📨 Mensaje | Tipo: ${hasUsableMedia ? 'Media' : 'Texto'} | De: ${clientPhone} | Media URL: ${mediaUrl || 'ninguna'}`);

    if (WHATSAPP_LIVE_ONLY && !(await hasActiveProcessingLive())) {
      console.log(`Mensaje WhatsApp ignorado fuera de Live activo | De: ${clientPhone} | Tipo: ${hasUsableMedia ? 'Media' : 'Texto'}`);
      await audit('skipped_live_not_active');
      return 'skipped_live_not_active';
    }

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
      return `cliente_error:${clienteError?.message ?? 'sin_data'}`;
    }

    if (messageId) {
      const { data: existingById } = await supabase
        .from('panel_mensajes')
        .select('id')
        .eq('whatsapp_message_id', messageId)
        .limit(1)
        .maybeSingle();

      if (existingById) {
        console.log(`Mensaje duplicado ignorado por id: ${messageId}`);
        await audit('skipped_duplicate_id', { cliente_id: clienteData.id });
        return 'skipped_duplicate_id';
      }
    }

    if (mediaUrl && !messageId) {
      const since10m = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: existingMedia } = await supabase
        .from('panel_mensajes')
        .select('id')
        .eq('cliente_id', clienteData.id)
        .eq('direction', direction)
        .eq('media_url', mediaUrl)
        .gte('created_at', since10m)
        .limit(1)
        .maybeSingle();

      if (existingMedia) {
        console.log(`Media duplicada ignorada: ${mediaUrl}`);
        await audit('skipped_duplicate_media', { cliente_id: clienteData.id });
        return 'skipped_duplicate_media';
      }
    }

    if (content && !mediaUrl) {
      const since15s = new Date(Date.now() - 15 * 1000).toISOString();
      const { data: existingText } = await supabase
        .from('panel_mensajes')
        .select('id')
        .eq('cliente_id', clienteData.id)
        .eq('direction', direction)
        .eq('content', content)
        .gte('created_at', since15s)
        .limit(1)
        .maybeSingle();

      if (existingText) {
        console.log(`Texto duplicado ignorado para ${clientPhone}`);
        await audit('skipped_duplicate_text', { cliente_id: clienteData.id });
        return 'skipped_duplicate_text';
      }
    }

    // Insertar mensaje (media_url ya tiene la URL pública o null)
    const { data: mensajeData, error: mensajeError } = await supabase.from('panel_mensajes').insert({
      cliente_id: clienteData.id,
      direction,
      content,
      has_media: hasUsableMedia,
      media_url: mediaUrl,
      media_type: mediaMimetype,
      whatsapp_message_id: messageId,
    }).select('id, created_at').single();

    if (mensajeError) {
      console.error('Error insert mensaje:', mensajeError);
    } else {
      console.log(`✅ Mensaje guardado correctamente.`);
    }

    if (!mensajeError && SERVER_URL && direction === 'in' && ((content && /#\d+/.test(content)) || hasUsableMedia)) {
      EdgeRuntime.waitUntil((async () => {
        try {
          const response = await fetch(`${SERVER_URL.replace(/\/$/, '')}/api/store/ingest-wa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fromWa: clientPhone,
              messageText: content,
              hasProof: hasUsableMedia,
              mediaUrl,
              mediaType: mediaMimetype,
              panelMessageId: mensajeData?.id ?? messageId,
              messageCreatedAt: mensajeData?.created_at ?? new Date().toISOString(),
            }),
          });
          if (!response.ok) {
            const detail = await response.text().catch(() => '');
            console.error(`[store-wa-auto] Error procesando tienda: ${response.status} ${detail}`);
          } else {
            console.log('[store-wa-auto] Mensaje de tienda procesado');
          }
        } catch (error) {
          console.error('[store-wa-auto] No se pudo avisar al servidor:', error);
        }
      })());
    }

    // ── ANÁLISIS AUTOMÁTICO DE COMPROBANTES LIVE ──────────────────────────
    // Si llega imagen entrante y hay un Live activo, disparar análisis IA al instante.
    // El backend valida si hay live activo y crea el pago si la imagen es comprobante real.
    if (!mensajeError && SERVER_URL && INGEST_USER_ID && direction === 'in' && hasUsableMedia && mensajeData?.id) {
      const looksLikeImage = (mediaMimetype || '').toLowerCase().startsWith('image/');
      if (looksLikeImage) {
        EdgeRuntime.waitUntil((async () => {
          try {
            const response = await fetch(`${SERVER_URL.replace(/\/$/, '')}/api/live-sales/analyze-receipt`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-user-id': INGEST_USER_ID,
              },
              body: JSON.stringify({
                clienteId: clienteData.id,
                phone: clientPhone,
                panelMensajeId: mensajeData.id,
                mediaUrl,
                mediaType: mediaMimetype,
                messageContent: content,
                messageCreatedAt: mensajeData.created_at ?? new Date().toISOString(),
              }),
            });
            if (!response.ok) {
              const detail = await response.text().catch(() => '');
              console.error(`[live-receipt-auto] Error: ${response.status} ${detail}`);
            } else {
              const result = await response.json().catch(() => ({}));
              console.log(`[live-receipt-auto] OK: ${JSON.stringify(result).slice(0, 200)}`);
            }
          } catch (error) {
            console.error('[live-receipt-auto] No se pudo analizar:', error);
          }
        })());
      }
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
    await audit('processed', { cliente_id: clienteData.id });
    return 'processed';

  } catch (err) {
    console.error('Error general:', err);
    return `error:${err instanceof Error ? err.message : String(err)}`;
  }
}
