import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para la TiendaOnline (base de datos separada).
 * URL y Key apuntan al proyecto thgbfurscfjcmgokyyif (cuenta nueva).
 * NUNCA mezclar este cliente con supabaseServer (ChehiAppAbril).
 */
const url = process.env.VITE_STORE_SUPABASE_URL;
const serviceKey = process.env.STORE_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn(
    "[supabase-store] VITE_STORE_SUPABASE_URL o STORE_SUPABASE_SERVICE_ROLE_KEY no definidas. " +
    "Los endpoints de tienda fallarán."
  );
}

export const supabaseStore = createClient(url ?? "", serviceKey ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
