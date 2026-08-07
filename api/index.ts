import { createClient } from '@supabase/supabase-js';

let appPromise: Promise<any> | null = null;

const getApp = async () => {
  if (!appPromise) {
    appPromise = import('../server-bundle.mjs').then((module) => module.default);
  }
  return appPromise;
};

const readBody = (req: any) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
};

async function handleSimpleLogin(req: any, res: any) {
  try {
    const body = readBody(req);
    const username = String(body?.username ?? '').trim().toLowerCase();
    const pin = String(body?.pin ?? '').trim();
    const allowedUsername = String(process.env.ADMIN_SIMPLE_USERNAME || 'leidycandy').trim().toLowerCase();
    const allowedPin = String(process.env.ADMIN_SIMPLE_PIN || '7020').trim();

    if (username !== allowedUsername || pin !== allowedPin) {
      return res.status(401).json({ error: 'Usuario o PIN incorrecto' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: 'Autenticación no configurada' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const ownerUserId = String(process.env.STORE_OWNER_USER_ID || '13dcb065-6099-4776-982c-18e98ff2b27a').trim();
    const { data: ownerData, error: ownerError } = await supabase.auth.admin.getUserById(ownerUserId);
    const owner = ownerData?.user;
    if (ownerError || !owner?.email) {
      return res.status(500).json({ error: 'Usuario principal no encontrado' });
    }

    const password = `pin-${pin}`;
    let login = await supabase.auth.signInWithPassword({ email: owner.email, password });
    if (login.error) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(owner.id, { password });
      if (updateError) return res.status(500).json({ error: updateError.message });
      login = await supabase.auth.signInWithPassword({ email: owner.email, password });
    }
    if (login.error) return res.status(401).json({ error: 'No se pudo iniciar sesion' });
    return res.json({ user: login.data.user, session: login.data.session });
  } catch (error: any) {
    console.error('[auth] simple-login error:', error?.message ?? error);
    return res.status(500).json({ error: 'Error de login' });
  }
}

export default async function handler(req: any, res: any) {
  const body = readBody(req);
  const isSimpleLoginPayload = body && typeof body === 'object' && ('username' in body) && ('pin' in body);
  if (req.method === 'POST' && isSimpleLoginPayload) {
    return handleSimpleLogin(req, res);
  }

  try {
    const app = await getApp();
    return app(req, res);
  } catch (error: any) {
    console.error('[api] server boot error:', error?.message ?? error);
    return res.status(500).json({ error: 'Error iniciando el servidor' });
  }
}
