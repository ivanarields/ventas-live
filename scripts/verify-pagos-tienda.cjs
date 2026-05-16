const https = require('https');
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.STORE_PROJECT_REF || 'thgbfurscfjcmgokyyif';

if (!TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en el entorno.');
  process.exit(1);
}

const body = JSON.stringify({
  query: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pagos_tienda' ORDER BY ordinal_position;`
});

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
    console.log('Columnas pagos_tienda:');
    try {
      JSON.parse(data).forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));
    } catch { console.log(data); }
  });
});
req.on('error', e => console.error(e.message));
req.write(body); req.end();
