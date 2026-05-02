-- Indices de apoyo para pedido diario de ventas live y empareje MacroDroid.

create index if not exists idx_pedidos_user_customer_date
  on public.pedidos(user_id, customer_id, date);

create index if not exists idx_pagos_user_customer_date
  on public.pagos(user_id, customer_id, date);

create index if not exists idx_pagos_user_amount_date
  on public.pagos(user_id, pago, date);
