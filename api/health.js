export default function handler(req, res) {
  res.json({ ok: true, env: !!process.env.SUPABASE_URL });
}
