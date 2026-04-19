-- ============================================================================
-- Fase 1: Sistema de captura de notificaciones bancarias
-- ============================================================================

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) RAW events: evento original inmutable, una fila por notificación
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists raw_notification_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  source text,
  device_id text not null,
  event_uuid text,
  app_name text,
  app_package text,
  notification_channel text,
  captured_at_ms bigint,
  title text,
  text text,
  big_text text,
  sub_text text,
  text_lines text,
  action_names text,
  raw_payload jsonb not null,
  raw_concat text,
  raw_hash text unique,
  ingest_status text default 'received',
  headers jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_raw_events_received_at on raw_notification_events (received_at desc);
create index if not exists idx_raw_events_device on raw_notification_events (device_id);
create index if not exists idx_raw_events_package on raw_notification_events (app_package);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Parsed candidates: resultado del parser sobre cada RAW
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists parsed_payment_candidates (
  id uuid primary key default gen_random_uuid(),
  raw_event_id uuid not null references raw_notification_events(id) on delete cascade,
  parser_version text,
  bank_code text,
  candidate_text text,
  currency text,
  amount numeric(12,2),
  payer_name_raw text,
  payer_name_canonical text,
  operation_ref text,
  confidence_score numeric(5,4),
  duplicate_of uuid null,
  needs_review boolean not null default false,
  parse_status text,
  parse_debug jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_candidates_raw on parsed_payment_candidates (raw_event_id);
create index if not exists idx_candidates_status on parsed_payment_candidates (parse_status);
create index if not exists idx_candidates_canonical on parsed_payment_candidates (payer_name_canonical);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Payments UI: lo que la app muestra (pagos ya procesados)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists payments_ui (
  id uuid primary key default gen_random_uuid(),
  parsed_candidate_id uuid not null references parsed_payment_candidates(id) on delete cascade,
  client_id uuid null,
  canonical_display_name text,
  amount numeric(12,2),
  currency text,
  paid_at timestamptz,
  match_status text,
  review_status text,
  order_id uuid null,
  grouping_key text,
  is_duplicate boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_ui_paid_at on payments_ui (paid_at desc);
create index if not exists idx_payments_ui_grouping on payments_ui (grouping_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Manual review queue: cola de revisión humana
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists manual_review_queue (
  id uuid primary key default gen_random_uuid(),
  parsed_candidate_id uuid not null references parsed_payment_candidates(id) on delete cascade,
  reason_code text,
  reason_detail text,
  review_status text not null default 'pending',
  reviewed_by uuid null,
  reviewed_at timestamptz null,
  resolution jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_review_status on manual_review_queue (review_status);
create index if not exists idx_review_created on manual_review_queue (created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Bank observations: métricas del parser por banco/app
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists notification_bank_observations (
  id uuid primary key default gen_random_uuid(),
  raw_event_id uuid not null references raw_notification_events(id) on delete cascade,
  app_package text,
  notification_channel text,
  title_len integer,
  text_len integer,
  big_text_len integer,
  text_lines_len integer,
  has_amount boolean,
  has_name boolean,
  has_operation_ref boolean,
  capture_quality_score numeric(5,2),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_observations_package on notification_bank_observations (app_package);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: las tablas solo se escriben desde la Edge Function (service role) o
-- desde el admin autenticado para revisión manual
-- ─────────────────────────────────────────────────────────────────────────────
alter table raw_notification_events        enable row level security;
alter table parsed_payment_candidates      enable row level security;
alter table payments_ui                    enable row level security;
alter table manual_review_queue            enable row level security;
alter table notification_bank_observations enable row level security;

-- Service role puede todo (Edge Function lo usa). authenticated puede leer
-- y gestionar la cola de revisión desde la app.
create policy "auth read raw"         on raw_notification_events        for select using (auth.role() = 'authenticated');
create policy "auth read candidates"  on parsed_payment_candidates      for select using (auth.role() = 'authenticated');
create policy "auth read payments_ui" on payments_ui                    for select using (auth.role() = 'authenticated');
create policy "auth manage review"    on manual_review_queue            for all    using (auth.role() = 'authenticated');
create policy "auth read obs"         on notification_bank_observations for select using (auth.role() = 'authenticated');
