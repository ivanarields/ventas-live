let appPromise: Promise<any> | null = null;

const getApp = async () => {
  if (!appPromise) {
    appPromise = import('./server-bundle.js').then((module) => module.default);
  }
  return appPromise;
};

export default async function handler(req: any, res: any) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error: any) {
    console.error('[api] server boot error:', error?.message ?? error);
    return res.status(500).json({ error: 'Error iniciando el servidor' });
  }
}
