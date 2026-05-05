-- ============================================================================
-- Mantener la función ingest-notification siempre activa (sin dormir)
-- Ejecuta un ping cada 5 minutos usando pg_cron + pg_net
-- ============================================================================

-- Activar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Eliminar trabajo anterior si existe (para evitar duplicados al re-aplicar)
SELECT cron.unschedule('keep-ingest-notification-warm')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'keep-ingest-notification-warm'
);

-- Crear el ping automático cada 5 minutos
SELECT cron.schedule(
  'keep-ingest-notification-warm',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://vhczofpmxzbqzboysoca.supabase.co/functions/v1/ingest-notification',
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'x-device-id',     'keepalive-cron',
      'x-device-secret', 'keepalive'
    ),
    body    := '{"source":"keepalive"}'::jsonb
  );
  $$
);
