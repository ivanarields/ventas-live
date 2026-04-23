import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_STORE_SUPABASE_URL;
const key = process.env.STORE_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("❌ Faltan variables: VITE_STORE_SUPABASE_URL o STORE_SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);

const SQL = `
CREATE TABLE IF NOT EXISTS payment_events (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL DEFAULT 'macrodroid',
  raw_text        TEXT,
  amount          NUMERIC(10,2),
  sender_name     TEXT,
  sender_wa       TEXT,
  processed       BOOLEAN NOT NULL DEFAULT FALSE,
  match_confidence TEXT,
  matched_order_id BIGINT,
  hash            TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_hash ON payment_events(hash);
CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(matched_order_id);

CREATE TABLE IF NOT EXISTS wa_events (
  id              BIGSERIAL PRIMARY KEY,
  from_wa         TEXT NOT NULL,
  summary         TEXT,
  has_proof       BOOLEAN NOT NULL DEFAULT FALSE,
  order_ref       TEXT,
  matched_order_id BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_events_order ON wa_events(matched_order_id);
`;

async function run() {
  console.log("🔧 Creando tablas payment_events y wa_events en la DB de la Tienda...");
  
  // Ejecutar sentencias separadas (Supabase no soporta múltiples en una llamada rpc)
  const stmts = SQL.split(';').map(s => s.trim()).filter(Boolean);
  
  // Verificar que las tablas existen
  const { error: e1 } = await sb.from('payment_events').select('id').limit(1);
  const { error: e2 } = await sb.from('wa_events').select('id').limit(1);

  if (!e1 && !e2) {
    console.log("✅ Tablas payment_events y wa_events: OK");
  } else {
    if (e1) console.error("❌ payment_events:", e1.message);
    if (e2) console.error("❌ wa_events:", e2.message);
    console.log("\n💡 Necesitas crear estas tablas manualmente en el panel de Supabase de la Tienda.");
    console.log("   URL del panel: https://supabase.com/dashboard/project/thgbfurscfjcmgokyyif/editor");
  }
}

run();
