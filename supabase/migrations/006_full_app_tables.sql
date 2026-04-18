-- ============================================================================
-- Migración completa: todas las tablas de la app (reemplaza Firebase)
-- ============================================================================

-- CLIENTES (extiende la tabla ya existente con campos faltantes)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS canonical_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS active_label TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS active_label_type TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS label_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_items INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_items INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_items INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_bag_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS label_version INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Índices para búsqueda de clientes
CREATE INDEX IF NOT EXISTS idx_customers_canonical_name ON customers(canonical_name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);

-- PAGOS
CREATE TABLE IF NOT EXISTS pagos (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  pago NUMERIC(12,2) NOT NULL DEFAULT 0,
  date TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending',
  method TEXT DEFAULT 'HTTP Request',
  verified BOOLEAN DEFAULT FALSE,
  customer_id BIGINT REFERENCES customers(id),
  historical_link_status TEXT,
  historical_link_source TEXT,
  historical_linked_at TIMESTAMPTZ,
  historical_repair_version TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_customer_id ON pagos(customer_id);
CREATE INDEX IF NOT EXISTS idx_pagos_user_id ON pagos(user_id);
CREATE INDEX IF NOT EXISTS idx_pagos_date ON pagos(date DESC);

-- PEDIDOS
CREATE TABLE IF NOT EXISTS pedidos (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id),
  customer_name TEXT,
  item_count INTEGER DEFAULT 0,
  bag_count INTEGER DEFAULT 1,
  label TEXT DEFAULT '',
  label_type TEXT DEFAULT '',
  status TEXT DEFAULT 'procesar',
  total_amount NUMERIC(12,2) DEFAULT 0,
  date TIMESTAMPTZ DEFAULT NOW(),
  label_version INTEGER DEFAULT 1,
  historical_link_status TEXT,
  historical_link_source TEXT,
  historical_linked_at TIMESTAMPTZ,
  historical_repair_version TEXT,
  converted_from_order_id BIGINT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_customer_id ON pedidos(customer_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_user_id ON pedidos(user_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);

-- TRANSACCIONES FINANCIERAS
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  description TEXT,
  fecha TIMESTAMPTZ DEFAULT NOW(),
  is_ocr BOOLEAN DEFAULT FALSE,
  account TEXT,
  beneficiary TEXT,
  tags TEXT,
  status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
  is_recurring BOOLEAN DEFAULT FALSE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_fecha ON transactions(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- CATEGORÍAS
CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT DEFAULT '📦',
  color TEXT DEFAULT '#888888',
  subcategories JSONB DEFAULT '[]'::jsonb,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);

-- LIVE SESSIONS
CREATE TABLE IF NOT EXISTS live_sessions (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  duration INTEGER DEFAULT 60,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed')),
  notes TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_user_id ON live_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_scheduled_at ON live_sessions(scheduled_at DESC);

-- GIVEAWAYS
CREATE TABLE IF NOT EXISTS giveaways (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  live_id BIGINT REFERENCES live_sessions(id),
  prize TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  winner_id TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_giveaways_user_id ON giveaways(user_id);

-- IDEAS
CREATE TABLE IF NOT EXISTS ideas (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ideas_user_id ON ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at DESC);

-- USUARIOS (tabla simple para mapear auth UID → datos de sesión)
CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,  -- uid de Supabase Auth
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
