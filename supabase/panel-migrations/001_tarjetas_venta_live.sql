-- Panel WhatsApp: tarjetas temporales para ventas live.
-- Fase 1: solo revision en panel. No crea pagos, pedidos ni casilleros.

create table if not exists public.tarjetas_venta_live (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.panel_clientes(id) on delete cascade,
  phone text not null,
  nombre_detectado text,
  monto_detectado numeric(12,2),
  resumen jsonb not null default '{}'::jsonb,
  comprobante_texto text,
  comprobante_media_url text,
  estado text not null default 'conversacion'
    check (estado in (
      'conversacion',
      'comprobante_recibido',
      'esperando_macrodroid',
      'revision_manual',
      'archivado'
    )),
  is_test boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_tarjetas_venta_live_active_phone
  on public.tarjetas_venta_live(phone)
  where estado <> 'archivado';

create index if not exists idx_tarjetas_venta_live_cliente
  on public.tarjetas_venta_live(cliente_id);

create index if not exists idx_tarjetas_venta_live_estado
  on public.tarjetas_venta_live(estado);

create index if not exists idx_tarjetas_venta_live_updated
  on public.tarjetas_venta_live(updated_at desc);

create or replace function public.fn_touch_tarjetas_venta_live_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tarjetas_venta_live_touch_updated_at on public.tarjetas_venta_live;
create trigger trg_tarjetas_venta_live_touch_updated_at
before update on public.tarjetas_venta_live
for each row
execute function public.fn_touch_tarjetas_venta_live_updated_at();
