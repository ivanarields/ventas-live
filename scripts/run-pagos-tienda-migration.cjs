// Aplica la migracion 001_pagos_tienda en TiendaOnline (thgbfurscfjcmgokyyif).
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const HOSTS = [
  { host: 'db.thgbfurscfjcmgokyyif.supabase.co', port: 5432, user: 'postgres' },
  { host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543, user: 'postgres.thgbfurscfjcmgokyyif' },
  { host: 'aws-0-sa-east-1.pooler.supabase.com', port: 6543, user: 'postgres.thgbfurscfjcmgokyyif' },
  { host: 'aws-0-us-west-1.pooler.supabase.com', port: 6543, user: 'postgres.thgbfurscfjcmgokyyif' },
];

async function tryHost({ host, port, user }, sql) {
  const client = new Client({
    host,
    port,
    user,
    password: 'Natural1-Stopper4',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000
  });
  try {
    await client.connect();
    console.log(`Conectado via ${host}:${port}`);
    await client.query(sql);
    const check = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pagos_tienda'
      ORDER BY ordinal_position
    `);
    console.log('Columnas creadas:', check.rows.map(r => r.column_name).join(', '));
    return true;
  } catch (err) {
    console.log(`Fallo ${host}:${port}: ${err.message}`);
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function run() {
  const sqlPath = path.join(process.cwd(), 'supabase/store-migrations/001_pagos_tienda.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  for (const target of HOSTS) {
    const ok = await tryHost(target, sql);
    if (ok) {
      console.log('Migracion aplicada correctamente.');
      return;
    }
  }
  console.error('No se pudo aplicar la migracion en ningun host.');
  process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
