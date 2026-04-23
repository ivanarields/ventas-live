import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Cargamos variables de entorno
const env = readFileSync('.env', 'utf8');
const clean = v => v?.replace(/^"/, '').replace(/"$/, '').trim();
const url   = clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1] || env.match(/^VITE_SUPABASE_URL=(.+)/m)?.[1]);
const key   = clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1]);

if (!url || !key) {
  console.error("Error: No se encontraron las credenciales de Supabase");
  process.exit(1);
}

const sb = createClient(url, key);

async function createBucket() {
  console.log('🔄 Verificando y creando Bucket de Storage...');
  
  // 1. Verificamos si el bucket ya existe
  const { data: buckets, error: getErr } = await sb.storage.listBuckets();
  if (getErr) {
    console.error('Error al listar buckets:', getErr);
    process.exit(1);
  }

  const exists = buckets.find(b => b.name === 'store_images');
  if (exists) {
    console.log('✅ El bucket `store_images` ya existe. Configurando como público...');
    await sb.storage.updateBucket('store_images', { public: true });
    return;
  }

  // 2. Creamos el bucket público
  const { data, error } = await sb.storage.createBucket('store_images', {
    public: true,
    fileSizeLimit: 5242880, // 5MB limit
  });

  if (error) {
    console.error('❌ Error al crear bucket:', error.message);
  } else {
    console.log('✅ Bucket `store_images` creado con éxito (Público).');
  }
}

createBucket();
