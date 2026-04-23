const { Client } = require('pg');

async function testConnection(host) {
  const client = new Client({
    host: host,
    port: 6543,
    user: 'postgres.thgbfurscfjcmgokyyif',
    password: 'Natural1-Stopper4',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });

  try {
    await client.connect();
    console.log(`✅ Conectado a ${host}`);
    
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
    await client.query(sql);
    console.log("Tablas creadas!");
    return true;
  } catch (err) {
    console.log(`❌ Falló ${host}: ${err.message}`);
    return false;
  } finally {
    await client.end().catch(()=>{}).then(()=>console.log("Connection ended"));
  }
}

async function run() {
  const regions = [
    'us-east-1', 'sa-east-1', 'us-east-2', 'us-west-1', 'us-west-2'
  ];
  for (const region of regions) {
    const success = await testConnection(`aws-0-${region}.pooler.supabase.com`);
    if (success) break;
  }
}

run();
