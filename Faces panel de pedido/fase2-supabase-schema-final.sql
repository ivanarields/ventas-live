-- ==============================================================================
-- FASE 2: ESQUEMA BASE DE DATOS (NUEVO PROYECTO SUPABASE EXCLUSIVO)
-- ==============================================================================
-- Este código es 100% independiente. No interferirá con el sistema antiguo.
-- Debe ejecutarse en el "SQL Editor" del *nuevo* proyecto de Supabase.

-- 1. TABLA DE AUDITORÍA CRUDA (Para debugging y replay desde n8n)
CREATE TABLE public.panel_raw_webhooks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'error')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABLA DE CLIENTES WHATSAPP (Aislada del sistema principal)
CREATE TABLE public.panel_clientes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    phone TEXT UNIQUE NOT NULL, -- El número normalizado será el identificador único
    nombre TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_interaction TIMESTAMPTZ DEFAULT now()
);

-- 3. TABLA DE MENSAJES (Texto y Multimedia)
CREATE TABLE public.panel_mensajes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id UUID REFERENCES public.panel_clientes(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')), -- 'in' (recibido), 'out' (enviado)
    content TEXT, -- Texto del mensaje
    has_media BOOLEAN DEFAULT false,
    media_url TEXT, -- URL pública del bucket Supabase
    media_type TEXT, -- e.g., 'image/jpeg', 'audio/ogg'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- ÍNDICES DE ALTO RENDIMIENTO
-- ==============================================================================
CREATE INDEX idx_panel_clientes_phone ON public.panel_clientes(phone);
CREATE INDEX idx_panel_mensajes_cliente_id ON public.panel_mensajes(cliente_id);
CREATE INDEX idx_panel_mensajes_created_at ON public.panel_mensajes(created_at DESC);

-- ==============================================================================
-- RLS (Row Level Security) - REGLAS MÍNIMAS
-- ==============================================================================
ALTER TABLE public.panel_raw_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panel_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panel_mensajes ENABLE ROW LEVEL SECURITY;

-- Nota: Como n8n interactuará usando la "Service Role Key", podrá evadir mágicamente
-- el RLS para guardar los datos. Pero habilitar RLS previene que claves anónimas públicas
-- de clientes cambien datos.
CREATE POLICY "Lectura pública/anónima denegada" ON public.panel_clientes FOR SELECT USING (false);
