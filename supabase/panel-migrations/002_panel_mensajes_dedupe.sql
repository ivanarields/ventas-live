-- Panel WhatsApp: soporte para idempotencia de mensajes del bridge.

alter table public.panel_mensajes
  add column if not exists whatsapp_message_id text;

create unique index if not exists uq_panel_mensajes_whatsapp_message_id
  on public.panel_mensajes(whatsapp_message_id)
  where whatsapp_message_id is not null;

create index if not exists idx_panel_mensajes_media_dedupe
  on public.panel_mensajes(cliente_id, direction, media_url, created_at desc)
  where media_url is not null;

create index if not exists idx_panel_mensajes_text_dedupe
  on public.panel_mensajes(cliente_id, direction, content, created_at desc)
  where content is not null;
