import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('.env', 'utf8');
const clean = (v) => v?.replace(/^"/, '').replace(/"$/, '').trim();
const sb = createClient(clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1]), clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1]));

const { data } = await sb.from('raw_notification_events')
  .select('text, big_text')
  .eq('app_package', 'com.bcp.bo.wallet')
  .order('received_at', { ascending: false })
  .limit(1);

const t = data[0].text;
console.log('Texto exacto:', JSON.stringify(t));
console.log('Longitud:', t.length);
console.log('Bytes por char del "envió":');
for (let i = t.indexOf('envi'); i < t.indexOf('envi') + 6; i++) {
  console.log(`  [${i}] "${t[i]}" = U+${t.charCodeAt(i).toString(16).padStart(4, '0')}`);
}

// Probar regex actualizado
const rx = /^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,80}?)\s*,\s*te\s+(?:envi[oó]|yape[oó]|pag[oó]|transfiri[oó])/im;
console.log('\nRegex actual match:', t.match(rx));

// Probar regex más tolerante
const rxLoose = /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,80}?)\s*,\s*te\s+env/i;
console.log('Regex tolerante:', t.match(rxLoose));
