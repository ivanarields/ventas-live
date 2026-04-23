import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(url, key);

async function checkSizes() {
  const { data, error } = await sb.storage.from('store_images').list('', {
    limit: 10,
    sortBy: { column: 'created_at', order: 'desc' }
  });

  if (error) {
    console.error("Error al leer el bucket:", error);
    return;
  }

  console.log("=== ARCHIVOS EN EL BUCKET (Más recientes primero) ===");
  if (!data || data.length === 0) {
    console.log("El bucket está vacío.");
    return;
  }

  data.forEach((file, index) => {
    // metadata.size viene en bytes
    const sizeKB = (file.metadata.size / 1024).toFixed(2);
    const sizeMB = (file.metadata.size / (1024 * 1024)).toFixed(2);
    
    console.log(`${index + 1}. Nombre: ${file.name}`);
    console.log(`   Tamaño en nube: ${sizeKB} KB ${sizeMB > 1 ? '(' + sizeMB + ' MB)' : ''}`);
    console.log(`   Fecha subida: ${new Date(file.created_at).toLocaleString()}`);
    console.log('--------------------------------------------------');
  });
}

checkSizes();
