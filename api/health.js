export default function handler(req, res) {
  res.json({
    ok: true,
    env: {
      mainUrl: !!process.env.SUPABASE_URL,
      mainKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      panelUrl: !!process.env.PANEL_SUPABASE_URL,
      panelKey: !!process.env.PANEL_SUPABASE_SERVICE_KEY,
      storeUrl: !!process.env.VITE_STORE_SUPABASE_URL,
      storeKey: !!process.env.STORE_SUPABASE_SERVICE_ROLE_KEY,
    },
  });
}
