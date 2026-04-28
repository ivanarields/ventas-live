/**
 * send.js — Módulo de ENVÍO del WhatsApp Bridge
 * Registra dos endpoints nuevos en el servidor HTTP existente:
 *   POST /api/send   — Envía un mensaje de texto
 *   GET  /api/health — Devuelve el estado de la sesión (para polling del Panel)
 *
 * Este archivo NO arranca su propio servidor.
 * Recibe el servidor http existente, el cliente WA y el flag `connected`.
 * Se invoca desde index.js después de que el cliente está inicializado.
 */

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

/**
 * Registra las rutas de envío en el servidor HTTP existente de index.js.
 * @param {import('http').Server} server   - El servidor http ya creado
 * @param {object}               client    - El cliente whatsapp-web.js
 * @param {() => boolean}        isConnected - Función que devuelve el estado actual
 */
export function registerSendRoutes(server, client, isConnected) {
  // Acumulamos listeners en el evento 'request' del servidor
  server.on('request', async (req, res) => {
    // ─── CORS para desarrollo local ───
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-webhook-secret');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ─────────────────────────────────────────────
    // GET /api/health
    // Devuelve estado de la sesión WhatsApp.
    // Sin autenticación (solo info pública: conectado sí/no).
    // ─────────────────────────────────────────────
    if (req.method === 'GET' && req.url === '/api/health') {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({
        connected: isConnected(),
        timestamp: new Date().toISOString(),
        service: 'whatsapp-bridge',
      }));
      return;
    }

    // ─────────────────────────────────────────────
    // POST /api/send
    // Envía un mensaje de texto a un número de WhatsApp.
    // Requiere header: x-webhook-secret
    // Body JSON: { phone: "+59178...", message: "Hola!" }
    // ─────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/api/send') {
      // 1. Verificar secret
      const secret = req.headers['x-webhook-secret'];
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      // 2. Verificar que WA esté conectado
      if (!isConnected()) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'WhatsApp no conectado. Escanea el QR primero.' }));
        return;
      }

      // 3. Parsear body
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const { phone, message } = JSON.parse(body);

          if (!phone || !message) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Se requieren phone y message' }));
            return;
          }

          // 4. Formatear chatId de WhatsApp (sin '+', con @c.us)
          const rawPhone = phone.replace(/^\+/, '').replace(/\D/g, '');
          const chatId = `${rawPhone}@c.us`;

          // 5. Enviar mensaje
          console.log(`📤 Enviando mensaje a ${chatId}...`);
          await client.sendMessage(chatId, message);
          console.log(`✅ Mensaje enviado a ${chatId}`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, chatId, sent_at: new Date().toISOString() }));

        } catch (err) {
          console.error('❌ Error al enviar mensaje:', err.message);
          // Si WhatsApp rechaza (número inválido, bloqueado, etc.) → 400
          const isClientError = err.message?.includes('invalid') ||
                                err.message?.includes('not found') ||
                                err.message?.includes('number');
          const statusCode = isClientError ? 400 : 500;
          res.writeHead(statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Error al enviar' }));
        }
      });

      return; // importante: no pasar al siguiente handler
    }

    // Si ninguna ruta coincide, dejamos que el handler original de index.js responda
    // (no llamamos res.end aquí)
  });

  console.log('📨 Rutas de envío registradas: GET /api/health · POST /api/send');
}
