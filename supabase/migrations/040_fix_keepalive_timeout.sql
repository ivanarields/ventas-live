-- ============================================================================
-- Fix keep-alive: aumentar timeout de 5s a 15s para sobrevivir cold starts
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('keep-ingest-notification-warm')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'keep-ingest-notification-warm'
);

SELECT cron.schedule(
  'keep-ingest-notification-warm',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://vhczofpmxzbqzboysoca.supabase.co/functions/v1/ingest-notification',
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'x-device-id',     'keepalive-cron',
      'x-device-secret', 'keepalive'
    ),
    body    := '{"source":"keepalive"}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
