import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para el Panel de WhatsApp (base de datos separada).
 * URL y Key apuntan al proyecto vwaocoaeenavxkcshyuf.
 * NUNCA mezclar este cliente con supabaseServer (ChehiAppAbril).
 */
const url = process.env.PANEL_SUPABASE_URL;
const serviceKey = process.env.PANEL_SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.warn(
    "[supabase-panel] PANEL_SUPABASE_URL o PANEL_SUPABASE_SERVICE_KEY no definidas. " +
    "Los endpoints del panel de WhatsApp fallarán."
  );
}

export const supabasePanel = createClient(url ?? "", serviceKey ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
