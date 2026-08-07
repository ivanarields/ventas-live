let appPromise: Promise<any> | null = null;

// La función de Vercel debe ejecutar el backend en modo producción incluso
// cuando NODE_ENV/VERCEL no estén presentes en el runtime.
process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';

function loadApp() {
  appPromise ??= import('../server.ts').then((module) => module.default);
  return appPromise;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await loadApp();
    return app(req, res);
  } catch (error: any) {
    console.error('[api] backend startup error:', error);
    return res.status(500).json({ error: 'Error iniciando el backend' });
  }
}
