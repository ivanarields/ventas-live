import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn(
    "[supabase-server] SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no definidas. " +
    "Los endpoints de etiquetas fallarán."
  );
}

export const supabaseServer = createClient(url ?? "", serviceKey ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
