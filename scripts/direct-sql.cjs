const { Client } = require('pg');

async function run() {
  // Configuración de conexión directa a PostgreSQL
  const client = new Client({
    host: 'db.thgbfurscfjcmgokyyif.supabase.co',
    port: 5432,
    user: 'postgres',
    password: 'Natural1-Stopper4',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("Conectando a la base de datos de la tienda...");
    await client.connect();

    const sql = `
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

    console.log("Ejecutando creación de tablas...");
    await client.query(sql);
    console.log("✅ Tablas payment_events y wa_events creadas con éxito.");

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await client.end();
  }
}

run();
