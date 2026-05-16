// Aplica la migracion 001_pagos_tienda en TiendaOnline (thgbfurscfjcmgokyyif).
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
      WHERE table_name = 'pagos_tienda'
      ORDER BY ordinal_position
    `);
    console.log('Columnas creadas:', check.rows.map(r => r.column_name).join(', '));
    return true;
  } catch (err) {
    console.log(`Fallo ${region}: ${err.message}`);
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function run() {
  const sqlPath = path.join(process.cwd(), 'supabase/store-migrations/001_pagos_tienda.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  for (const region of REGIONS) {
    const ok = await tryRegion(region, sql);
    if (ok) {
      console.log('Migracion aplicada correctamente.');
      return;
    }
  }
  console.error('No se pudo aplicar la migracion en ninguna region.');
  process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
