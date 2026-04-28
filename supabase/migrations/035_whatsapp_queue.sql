-- ============================================================
-- 035_whatsapp_queue.sql
-- Cola de mensajes de WhatsApp con envío anti-baneo.
-- Usa SELECT FOR UPDATE SKIP LOCKED para evitar race conditions
-- cuando múltiples procesos intenten procesar la cola a la vez.
-- ============================================================

-- Tabla principal de cola de mensajes
CREATE TABLE IF NOT EXISTS whatsapp_message_queue (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     TEXT        NOT NULL,

  -- Destinatario
  phone       TEXT        NOT NULL,           -- E.164: +59178456789
  
  -- Contenido
  message_body TEXT       NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'general',
  -- Tipos válidos: 'store_verification', 'live_confirmation', 'pin_recovery', 'general'

  -- Estado
  status      TEXT        NOT NULL DEFAULT 'pending',
  -- Estados: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'

  -- Contexto/trazabilidad
  reference_id   TEXT,    -- ID del pago, pedido, etc. que originó este mensaje
  reference_type TEXT,    -- 'pago', 'store_order', 'live_session', etc.
  error_detail   TEXT,    -- Detalle del error si status = 'failed'
  sent_at        TIMESTAMPTZ,

  -- Auditoría
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_wmq_user_status
  ON whatsapp_message_queue (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wmq_reference
  ON whatsapp_message_queue (user_id, reference_id, reference_type);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION fn_update_wmq_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wmq_updated_at ON whatsapp_message_queue;
CREATE TRIGGER trg_wmq_updated_at
  BEFORE UPDATE ON whatsapp_message_queue
  FOR EACH ROW EXECUTE FUNCTION fn_update_wmq_timestamp();

-- ============================================================
-- Función atómica para tomar 1 mensaje de la cola de forma segura.
-- Usa FOR UPDATE SKIP LOCKED para evitar que dos procesos
-- simultáneos tomen el mismo mensaje (race condition).
-- Retorna el mensaje tomado o NULL si la cola está vacía.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_dequeue_whatsapp_message(p_user_id TEXT)
RETURNS whatsapp_message_queue AS $$
DECLARE
  v_msg whatsapp_message_queue;
BEGIN
  SELECT * INTO v_msg
  FROM whatsapp_message_queue
  WHERE user_id = p_user_id
    AND status = 'pending'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE whatsapp_message_queue
  SET status = 'sending', updated_at = NOW()
  WHERE id = v_msg.id;

  v_msg.status := 'sending';
  RETURN v_msg;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE whatsapp_message_queue IS
  'Cola de mensajes de WhatsApp. Procesada por el Panel Anti-Baneo con delays aleatorios para simular comportamiento humano.';
