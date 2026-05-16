const fs = require('fs');
const path = require('path');
const https = require('https');

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.STORE_PROJECT_REF || 'thgbfurscfjcmgokyyif';

if (!TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno.');
  process.exit(1);
}

const sqlPath = path.join(process.cwd(), 'supabase/store-migrations/001_pagos_tienda.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const body = JSON.stringify({ query: sql });

const req = https.request({
  hostname: 'api.supabase.com',
  path: `/v1/projects/${PROJECT_REF}/database/query`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
    process.exit(res.statusCode === 200 || res.statusCode === 201 ? 0 : 1);
  });
});

req.on('error', err => {
  console.error('Error:', err.message);
  process.exit(1);
});

req.write(body);
req.end();
