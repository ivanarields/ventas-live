/**
 * FASE 1 — Setup TiendaOnline via REST API
 * Usa la Management API de Supabase para ejecutar SQL
 */

const STORE_URL = 'https://thgbfurscfjcmgokyyif.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZ2JmdXJzY2ZqY21nb2t5eWlmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njg3MDEwMSwiZXhwIjoyMDkyNDQ2MTAxfQ.k9UDbB8w6qbuq-uo_1BxeKXseuMlEGcKzqtmdrdPubk';

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

async function runSQL(sql, description) {
  const res = await fetch(`${STORE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql })
  });
  
  if (!res.ok) {
    // Intentar con el endpoint alternativo de query
    const res2 = await fetch(`${STORE_URL}/pg/query`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'text/plain' },
      body: sql
    });
    if (!res2.ok) {
      const err = await res2.text();
      throw new Error(`${description}: ${err}`);
    }
    return await res2.json();
  }
  return await res.json();
}

// Ejecutar SQL en statements separados via RPC
async function execViaRPC(sql) {
  const res = await fetch(`${STORE_URL}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: sql })
  });
  return { status: res.status, text: await res.text() };
}

// Verificar tablas existentes usando la API REST
async function checkTables() {
  const res = await fetch(
    `${STORE_URL}/rest/v1/`,
    { headers }
  );
  const schema = await res.json();
  const tables = Object.keys(schema.paths || {}).filter(p => p !== '/');
  return tables.map(t => t.replace('/', ''));
}

// Crear tabla usando fetch a un endpoint específico (para verificar que la API funciona)
async function verifyConnection() {
  console.log('🔍 Verificando conexión a TiendaOnline...');
  const res = await fetch(`${STORE_URL}/rest/v1/`, { headers });
  if (res.status === 200) {
    console.log('✅ Conexión exitosa a TiendaOnline\n');
    return true;
  }
  console.error('❌ Error de conexión:', res.status);
  return false;
}

// Las instrucciones SQL separadas para el SQL Editor de Supabase
const SQL_STATEMENTS = `
-- ============================================================
-- TIENDA ONLINE — Schema v1.0
-- Ejecutar este SQL en: Supabase Dashboard > SQL Editor
-- Proyecto: TiendaOnline (thgbfurscfjcmgokyyif)
-- ============================================================

-- 1. PERFILES DE CLIENTES ONLINE
CREATE TABLE IF NOT EXISTS store_customers (
  id              BIGSERIAL PRIMARY KEY,
  whatsapp        TEXT NOT NULL UNIQUE,
  pin_hash        TEXT NOT NULL,
  display_name    TEXT,
  total_orders    INT DEFAULT 0,
  total_spent     NUMERIC(10,2) DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CATEGORÍAS
CREATE TABLE IF NOT EXISTS categories (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  color       TEXT DEFAULT '#ff2d78',
  icon        TEXT,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categories (name, slug, color, sort_order) VALUES
  ('Blusas',     'blusas',     '#f472b6', 1),
  ('Vestidos',   'vestidos',   '#a78bfa', 2),
  ('Pantalones', 'pantalones', '#60a5fa', 3),
  ('Chaquetas',  'chaquetas',  '#34d399', 4),
  ('Conjuntos',  'conjuntos',  '#fbbf24', 5),
  ('Faldas',     'faldas',     '#f87171', 6),
  ('Accesorios', 'accesorios', '#94a3b8', 7),
  ('General',    'general',    '#9ca3af', 8)
ON CONFLICT (slug) DO NOTHING;

-- 3. PRODUCTOS
CREATE TABLE IF NOT EXISTS products (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  price           NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  category        TEXT NOT NULL DEFAULT 'General',
  brand           TEXT,
  sizes           TEXT[],
  images          TEXT[],
  available       BOOLEAN NOT NULL DEFAULT TRUE,
  featured        BOOLEAN NOT NULL DEFAULT FALSE,
  stock           INT NOT NULL DEFAULT 1,
  condition       TEXT DEFAULT 'bueno',
  ai_confidence   TEXT,
  color           TEXT,
  material        TEXT,
  views           INT DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PEDIDOS DE TIENDA
CREATE TABLE IF NOT EXISTS store_orders (
  id                   BIGSERIAL PRIMARY KEY,
  customer_id          BIGINT REFERENCES store_customers(id),
  customer_name        TEXT,
  customer_wa          TEXT,
  items                JSONB NOT NULL DEFAULT '[]',
  total                NUMERIC(10,2) NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','paid','ready','delivered','cancelled')),
  payment_method       TEXT DEFAULT 'qr',
  payment_ref          TEXT,
  payment_verified_at  TIMESTAMPTZ,
  wa_proof_received    BOOLEAN DEFAULT FALSE,
  wa_message_id        TEXT,
  expires_at           TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. EVENTOS DE PAGO (Triangulación)
CREATE TABLE IF NOT EXISTS payment_events (
  id               BIGSERIAL PRIMARY KEY,
  source           TEXT NOT NULL DEFAULT 'macrodroid',
  raw_text         TEXT,
  amount           NUMERIC(10,2),
  sender_name      TEXT,
  sender_wa        TEXT,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_order_id BIGINT REFERENCES store_orders(id),
  match_confidence TEXT,
  processed        BOOLEAN DEFAULT FALSE,
  hash             TEXT UNIQUE
);

-- 6. MENSAJES WHATSAPP (Triangulación)
CREATE TABLE IF NOT EXISTS wa_messages (
  id               BIGSERIAL PRIMARY KEY,
  from_wa          TEXT NOT NULL,
  summary          TEXT,
  has_proof        BOOLEAN DEFAULT FALSE,
  order_ref        TEXT,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_order_id BIGINT REFERENCES store_orders(id)
);

-- 7. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_products_available    ON products(available);
CREATE INDEX IF NOT EXISTS idx_products_category     ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_featured     ON products(featured);
CREATE INDEX IF NOT EXISTS idx_store_orders_status   ON store_orders(status);
CREATE INDEX IF NOT EXISTS idx_store_orders_wa       ON store_orders(customer_wa);
CREATE INDEX IF NOT EXISTS idx_store_orders_expires  ON store_orders(expires_at);
CREATE INDEX IF NOT EXISTS idx_payment_events_amount ON payment_events(amount);
CREATE INDEX IF NOT EXISTS idx_wa_messages_from      ON wa_messages(from_wa);

-- 8. FUNCIÓN updated_at automático
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS \$\$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
\$\$;

CREATE OR REPLACE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_store_orders_updated_at
  BEFORE UPDATE ON store_orders
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON store_customers
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 9. FUNCIÓN: Expirar pedidos sin pago después de 30 min
CREATE OR REPLACE FUNCTION fn_expire_pending_orders()
RETURNS void LANGUAGE plpgsql AS \$\$
BEGIN
  UPDATE store_orders
  SET status = 'cancelled', updated_at = NOW()
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
\$\$;

-- 10. ROW LEVEL SECURITY
ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages     ENABLE ROW LEVEL SECURITY;

-- Lectura pública de productos disponibles (para la tienda web)
DROP POLICY IF EXISTS "productos_publicos" ON products;
CREATE POLICY "productos_publicos" ON products
  FOR SELECT USING (available = true);

-- El servidor (service_role) puede hacer todo
DROP POLICY IF EXISTS "service_all_products"  ON products;
DROP POLICY IF EXISTS "service_all_orders"    ON store_orders;
DROP POLICY IF EXISTS "service_all_customers" ON store_customers;
DROP POLICY IF EXISTS "service_all_payments"  ON payment_events;
DROP POLICY IF EXISTS "service_all_wa"        ON wa_messages;

CREATE POLICY "service_all_products"  ON products        FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_all_orders"    ON store_orders    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_all_customers" ON store_customers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_all_payments"  ON payment_events  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_all_wa"        ON wa_messages     FOR ALL USING (auth.role() = 'service_role');

SELECT 'FASE 1 COMPLETADA — Tablas TiendaOnline listas' AS resultado;
`;

async function main() {
  const ok = await verifyConnection();
  if (!ok) process.exit(1);
  
  console.log('📋 La conexión API funciona perfectamente.');
  console.log('\n⚠️  La dirección TCP directa de PostgreSQL está bloqueada por la red.');
  console.log('   Esto es normal en Supabase con plan gratuito (NANO).\n');
  console.log('════════════════════════════════════════════════════════');
  console.log('📝 INSTRUCCIÓN PARA FASE 1:');
  console.log('════════════════════════════════════════════════════════');
  console.log('   1. Ve a: https://supabase.com/dashboard/project/thgbfurscfjcmgokyyif/sql/new');
  console.log('   2. Pega el SQL del archivo: scripts/tienda-online-fase1.sql');
  console.log('   3. Haz clic en "Run"');
  console.log('   4. Regresa aquí y me dices que lo ejecutaste');
  console.log('════════════════════════════════════════════════════════\n');
  
  // Guardar el SQL en un archivo separado
  const fs = await import('fs/promises');
  await fs.writeFile('./scripts/tienda-online-fase1.sql', SQL_STATEMENTS.replace(/\\\$/g, '$'));
  console.log('✅ SQL guardado en: scripts/tienda-online-fase1.sql');
  console.log('   Ábrelo, cópialo todo y pégalo en el SQL Editor de Supabase.\n');
}

main().catch(console.error);
