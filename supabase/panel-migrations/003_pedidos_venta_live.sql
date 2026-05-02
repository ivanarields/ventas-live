-- Panel WhatsApp: pedidos diarios, pagos y evidencias para ventas live.
-- Esta capa organiza muchas fotos y muchos comprobantes por cliente y fecha de pago.

create table if not exists public.pedidos_venta_live (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.panel_clientes(id) on delete cascade,
  phone text not null,
  fecha_pedido date not null,
  nombre_detectado text,
  estado text not null default 'conversacion'
    check (estado in (
      'conversacion',
      'con_pagos_pendientes',
      'pagos_verificados',
      'revision_manual',
      'procesar',
      'archivado'
    )),
  total_comprobantes numeric(12,2) not null default 0,
  total_verificado numeric(12,2) not null default 0,
  total_pendiente numeric(12,2) not null default 0,
  main_customer_id bigint,
  main_pedido_id bigint,
  is_test boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_pedidos_venta_live_active_day
  on public.pedidos_venta_live(phone, fecha_pedido)
  where estado <> 'archivado';

create index if not exists idx_pedidos_venta_live_cliente
  on public.pedidos_venta_live(cliente_id, fecha_pedido desc);

create index if not exists idx_pedidos_venta_live_phone
  on public.pedidos_venta_live(phone, fecha_pedido desc);

create index if not exists idx_pedidos_venta_live_main_pedido
  on public.pedidos_venta_live(main_pedido_id)
  where main_pedido_id is not null;

create table if not exists public.pagos_venta_live (
  id uuid primary key default gen_random_uuid(),
  pedido_live_id uuid not null references public.pedidos_venta_live(id) on delete cascade,
  cliente_id uuid references public.panel_clientes(id) on delete cascade,
  phone text not null,
  fecha_pedido date not null,
  nombre_detectado text,
  nombre_canonico text,
  monto numeric(12,2),
  comprobante_hora text,
  comprobante_at timestamptz,
  comprobante_texto text,
  comprobante_media_url text,
  panel_mensaje_id uuid references public.panel_mensajes(id) on delete set null,
  estado text not null default 'pendiente_whatsapp'
    check (estado in (
      'pendiente_whatsapp',
      'verificado_macrodroid',
      'verificado_manual',
      'revision_manual',
      'rechazado',
      'posible_duplicado'
    )),
  main_pago_id bigint,
  match_score numeric(4,3),
  match_reason text,
  duplicate_of uuid references public.pagos_venta_live(id) on delete set null,
  is_test boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_pagos_venta_live_panel_mensaje
  on public.pagos_venta_live(panel_mensaje_id);

create unique index if not exists uq_pagos_venta_live_media_url
  on public.pagos_venta_live(comprobante_media_url)
  where comprobante_media_url is not null;

create index if not exists idx_pagos_venta_live_pedido
  on public.pagos_venta_live(pedido_live_id, comprobante_at desc);

create index if not exists idx_pagos_venta_live_match
  on public.pagos_venta_live(phone, monto, comprobante_at)
  where estado in ('pendiente_whatsapp', 'revision_manual');

create index if not exists idx_pagos_venta_live_main_pago
  on public.pagos_venta_live(main_pago_id)
  where main_pago_id is not null;

create table if not exists public.evidencias_venta_live (
  id uuid primary key default gen_random_uuid(),
  pedido_live_id uuid not null references public.pedidos_venta_live(id) on delete cascade,
  cliente_id uuid references public.panel_clientes(id) on delete cascade,
  panel_mensaje_id uuid references public.panel_mensajes(id) on delete set null,
  tipo text not null default 'otro'
    check (tipo in ('prenda', 'comprobante', 'texto', 'audio', 'otro')),
  media_url text,
  media_type text,
  content text,
  descripcion text,
  message_created_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_evidencias_venta_live_panel_mensaje
  on public.evidencias_venta_live(panel_mensaje_id);

create index if not exists idx_evidencias_venta_live_pedido
  on public.evidencias_venta_live(pedido_live_id, message_created_at desc);

create or replace function public.fn_touch_venta_live_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pedidos_venta_live_touch_updated_at on public.pedidos_venta_live;
create trigger trg_pedidos_venta_live_touch_updated_at
before update on public.pedidos_venta_live
for each row
execute function public.fn_touch_venta_live_updated_at();

drop trigger if exists trg_pagos_venta_live_touch_updated_at on public.pagos_venta_live;
create trigger trg_pagos_venta_live_touch_updated_at
before update on public.pagos_venta_live
for each row
execute function public.fn_touch_venta_live_updated_at();

drop trigger if exists trg_evidencias_venta_live_touch_updated_at on public.evidencias_venta_live;
create trigger trg_evidencias_venta_live_touch_updated_at
before update on public.evidencias_venta_live
for each row
execute function public.fn_touch_venta_live_updated_at();
