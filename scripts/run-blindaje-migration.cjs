const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const REGIONS = ['us-east-1','sa-east-1','us-east-2','us-west-1','us-west-2'];

async function tryRegion(region, sql) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const client = new Client({
    host,
    port: 6543,
    user: 'postgres.thgbfurscfjcmgokyyif',
    password: 'Natural1-Stopper4',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });
  try {
    await client.connect();
    console.log(`Conectado via ${host}`);
    await client.query(sql);
    const check = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'store_orders'
        AND column_name IN ('partial_payment_amount','payment_shortfall','reminder_sent_at')
      ORDER BY column_name
    `);
    console.log('Columnas:', check.rows.map(r => r.column_name).join(', '));
    return true;
  } catch (err) {
    console.log(`Falló ${region}: ${err.message}`);
    return false;
  } finally {
    await client.end().catch(()=>{});
  }
}

async function run() {
  const sqlPath = path.join(process.cwd(), 'docs/nuevo sistema de tienda/migracion-tienda-blindaje-pago.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  for (const r of REGIONS) {
    if (await tryRegion(r, sql)) return;
  }
  console.error('Ninguna region funciono');
  process.exitCode = 1;
}

run();
