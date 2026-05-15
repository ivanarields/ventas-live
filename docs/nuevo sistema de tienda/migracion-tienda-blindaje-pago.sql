-- Migracion: Blindaje del flujo de pago QR
-- Base: TiendaOnline (thgbfurscfjcmgokyyif)
-- Fecha: 2026-05-15
-- Proposito: agregar columnas para soportar pagos parciales,
-- recordatorios automaticos de comprobante y bloqueo de duplicados.

ALTER TABLE store_orders
  ADD COLUMN IF NOT EXISTS partial_payment_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS payment_shortfall NUMERIC,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Indice para buscar rapido pedidos pending por WhatsApp del cliente
-- (usado para bloquear duplicados al crear pedido)
CREATE INDEX IF NOT EXISTS idx_store_orders_pending_wa
  ON store_orders (customer_wa, status)
  WHERE status = 'pending';

-- Indice para buscar pedidos con banco detectado pero sin comprobante
-- (usado por el cron de recordatorio de comprobante)
CREATE INDEX IF NOT EXISTS idx_store_orders_awaiting_proof
  ON store_orders (payment_verified_at)
  WHERE wa_proof_received = false
    AND reminder_sent_at IS NULL
    AND payment_ref LIKE 'bank-detected:%';
