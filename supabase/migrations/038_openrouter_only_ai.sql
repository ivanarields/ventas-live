-- 038: OpenRouter como unico proveedor de IA.

update ai_config
set
  primary_key_encrypted = case when primary_key_encrypted like 'AIza%' then null else primary_key_encrypted end,
  fallback_key_encrypted = null,
  fallback2_key_encrypted = null,
  key3_encrypted = null,
  key4_encrypted = null,
  key5_encrypted = null,
  features = jsonb_build_object(
    'product_vision', jsonb_build_object('enabled', coalesce((features->'product_vision'->>'enabled')::boolean, true), 'model', 'openai/gpt-4o-mini'),
    'chat_summary', jsonb_build_object('enabled', coalesce((features->'chat_summary'->>'enabled')::boolean, true), 'model', 'openai/gpt-4o-mini'),
    'notif_parser', jsonb_build_object('enabled', coalesce((features->'notif_parser'->>'enabled')::boolean, true), 'model', 'openai/gpt-4o-mini')
  ),
  daily_limit = 0,
  updated_at = now();

alter table ai_usage_log
  alter column model set default 'openrouter:openai/gpt-4o-mini';
