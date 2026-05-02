const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

function sendJson(res, statusCode, payload) {
  if (res.writableEnded) return;
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-webhook-secret',
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export async function handleBridgeApiRoute(req, res, client, isConnected) {
  const url = req.url?.split('?')[0] || '/';
  const isOurRoute =
    req.method === 'OPTIONS' ||
    (req.method === 'GET' && url === '/api/health') ||
    (req.method === 'POST' && url === '/api/send');

  if (!isOurRoute) return false;

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  if (req.method === 'GET' && url === '/api/health') {
    sendJson(res, 200, {
      connected: isConnected(),
      timestamp: new Date().toISOString(),
      service: 'whatsapp-bridge',
    });
    return true;
  }

  if (req.method === 'POST' && url === '/api/send') {
    const secret = req.headers['x-webhook-secret'];
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return true;
    }

    if (!isConnected()) {
      sendJson(res, 503, { error: 'WhatsApp no conectado. Escanea el QR primero.' });
      return true;
    }

    try {
      const { phone, message } = await readJsonBody(req);
      if (!phone || !message) {
        sendJson(res, 400, { error: 'Se requieren phone y message' });
        return true;
      }

      const rawPhone = String(phone).replace(/^\+/, '').replace(/\D/g, '');
      const chatId = `${rawPhone}@c.us`;

      console.log(`Enviando mensaje a ${chatId}...`);
      await client.sendMessage(chatId, message);
      console.log(`Mensaje enviado a ${chatId}`);

      sendJson(res, 200, { ok: true, chatId, sent_at: new Date().toISOString() });
    } catch (err) {
      console.error('Error al enviar mensaje:', err?.message || err);
      const msg = err?.message || 'Error al enviar';
      const isClientError =
        msg.includes('invalid') ||
        msg.includes('not found') ||
        msg.includes('number');
      sendJson(res, isClientError ? 400 : 500, { error: msg });
    }
    return true;
  }

  return false;
}

export function registerSendRoutes() {
  console.warn('registerSendRoutes esta obsoleto; usa handleBridgeApiRoute dentro del servidor principal.');
}
