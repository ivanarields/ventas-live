-- Permitir varios pagos Live aunque apunten a la misma URL de comprobante.
-- La identidad real del comprobante es panel_mensaje_id; media_url puede repetirse
-- cuando dos imagenes llegan en el mismo segundo o el bridge reutiliza una ruta.

drop index if exists public.uq_pagos_venta_live_media_url;

create index if not exists idx_pagos_venta_live_media_url
  on public.pagos_venta_live(comprobante_media_url)
  where comprobante_media_url is not null;
