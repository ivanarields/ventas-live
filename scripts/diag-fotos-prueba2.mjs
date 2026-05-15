// Ver TODAS las fotos del Live de las 15:19-15:25 de ambos clientes
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const panel = createClient(process.env.PANEL_SUPABASE_URL, process.env.PANEL_SUPABASE_SERVICE_KEY);

const desde = '2026-05-15T19:00:00Z';
const hasta = '2026-05-15T20:00:00Z';

console.log('=== TODOS los mensajes con foto entre 15:00-16:00 Bolivia ===\n');
const { data: msgs } = await panel
  .from('panel_mensajes')
  .select('id, cliente_id, content, direction, has_media, media_url, media_type, created_at')
  .gte('created_at', desde)
  .lte('created_at', hasta)
  .eq('has_media', true)
  .order('created_at', { ascending: true });

console.log(`Total fotos: ${msgs?.length ?? 0}\n`);
let lastClient = null;
for (const m of msgs ?? []) {
  if (m.cliente_id !== lastClient) {
    console.log(`\n--- cliente ${m.cliente_id?.slice(0,8)} ---`);
    lastClient = m.cliente_id;
  }
  const hora = new Date(m.created_at).toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit',hour12:false});
  console.log(`  ${hora} dir=${m.direction} type=${m.media_type}`);
  console.log(`    url=${m.media_url}`);
}

// Cliente phones
console.log('\n\n=== TELÉFONOS DE LOS CLIENTES ===');
const clientes = [...new Set((msgs ?? []).map(m => m.cliente_id))];
for (const id of clientes) {
  const { data: c } = await panel
    .from('panel_clientes')
    .select('id, phone, nombre')
    .eq('id', id)
    .maybeSingle();
  console.log(`  cliente ${id?.slice(0,8)} → phone=${c?.phone} nombre=${c?.nombre}`);
}
