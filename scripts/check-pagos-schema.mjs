// Verifica qué columnas existen en la tabla pagos
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const main = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await main
  .from('pagos')
  .select('*')
  .limit(1)
  .maybeSingle();

if (error) {
  console.error(error);
  process.exit(1);
}

console.log('Columnas existentes en pagos:');
for (const k of Object.keys(data ?? {})) {
  console.log(`  - ${k}: ${typeof data[k]} = ${JSON.stringify(data[k])?.slice(0, 50)}`);
}
