import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcodeImg from 'qrcode';
import axios from 'axios';
import http from 'http';
import { buildMediaPath } from './media-path.js';

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
dotenv.config({ path: join(__dirname, '.env') });

const WEBHOOK_URL    = process.env.WEBHOOK_URL;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const LIVE_STATUS_URL = process.env.LIVE_STATUS_URL;
const LIVE_STATUS_USER_ID = process.env.LIVE_STATUS_USER_ID || process.env.INGEST_USER_ID;
const WHATSAPP_LIVE_ONLY = (process.env.WHATSAPP_LIVE_ONLY || 'true').toLowerCase() !== 'false';
const BUCKET         = 'whatsapp-media';
const PORT           = process.env.PORT || 3000;
const IS_HEADLESS    = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.DOCKER_ENV;

// ─── Estado global para el QR ───
let qrDataUrl  = null;   // imagen base64 del QR
let connected  = false;
let client     = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY   = 5000;

// ─── Servidor HTTP para mostrar el QR por URL ───
const server = http.createServer(async (req, res) => {
  // Endpoint JSON para la app principal
  if (req.url === '/status') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify({ connected, qrDataUrl }));
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (connected) {
    res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#111;color:#fff">
      <h1>✅ WhatsApp Conectado</h1><p>El bridge está activo y recibiendo mensajes.</p></body></html>`);
    return;
  }
  if (qrDataUrl) {
    res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="25">
      <title>Escanear QR — Ventas Live</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:40px;background:#111;color:#fff">
        <h2>📲 Escanea este QR con WhatsApp</h2>
        <img src="${qrDataUrl}" style="max-width:320px;border-radius:16px;margin:24px auto;display:block">
        <p style="color:#888;font-size:13px">Se actualiza cada 25 segundos · Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
      </body></html>`);
  } else {
    res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="10">
      <body style="font-family:sans-serif;text-align:center;padding:60px;background:#111;color:#fff">
        <h2>⏳ Iniciando bridge...</h2><p>Espera 20-30 segundos y recarga esta página.</p>
      </body></html>`);
  }
});
server.listen(PORT, () => console.log(`🌐 Servidor QR escuchando en puerto ${PORT}`));

// ─── Helpers ───
function normalizePhone(raw) {
  if (!raw) return null;
  let p = raw.replace(/@[a-z.]+$/, '');
  if (/^[678]\d{7}$/.test(p)) p = '591' + p;
  return p;
}

async function hasActiveProcessingLive() {
  if (!WHATSAPP_LIVE_ONLY) return true;
  if (!LIVE_STATUS_URL || !LIVE_STATUS_USER_ID) {
    console.warn('LIVE_STATUS_URL/LIVE_STATUS_USER_ID no configurado; se permite reenviar al webhook.');
    return true;
  }

  try {
    const response = await axios.get(LIVE_STATUS_URL, {
      timeout: 5000,
      headers: { 'x-user-id': LIVE_STATUS_USER_ID },
    });
    return !!response.data?.active;
  } catch (error) {
    console.error('No se pudo consultar Live activo; se permite reenviar para evitar perdida:', error.message);
    return true;
  }
}

async function uploadMedia(base64, mimetype, phone, timestamp, messageId) {
  try {
    const fallbackUnique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const path = buildMediaPath(phone, timestamp, mimetype, messageId, fallbackUnique);
    const buf  = Buffer.from(base64, 'base64');
    const res  = await axios.post(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, buf, {
      headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY,
                 'Content-Type': mimetype, 'x-upsert': 'true' },
      maxBodyLength: Infinity,
    });
    if (res.status === 200 || res.status === 201) {
      console.log(`📁 Media subida: ${path}`);
      return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    }
  } catch (e) { console.error('❌ Error subiendo media:', e.message); }
  return null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadMediaWithRetry(msg) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const candidate = attempt === 1 ? msg : await refreshMessage(msg);
    try {
      const media = await candidate?.downloadMedia?.();
      if (media?.data && media?.mimetype) return media;
      console.warn(`⚠️ Media vacía en intento ${attempt}/5`);
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ Error descargando media (${attempt}/5):`, error?.message || String(error));
    }
    if (attempt < 5) await wait(attempt * 1000);
  }
  if (lastError) console.error('❌ No se pudo descargar la media después de 5 intentos:', lastError?.message || String(lastError));
  return null;
}

// ─── Cliente WhatsApp ───
client = new Client({
  authStrategy: new LocalAuth({ dataPath: join(__dirname, '.wwebjs_auth') }),
  puppeteer: {
    protocolTimeout: 120000,
    timeout: 120000,
    headless: true,
    executablePath: IS_HEADLESS
      ? (process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium')
      : undefined,
    args: IS_HEADLESS
      ? [
          '--no-sandbox', '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', '--disable-gpu',
          '--no-first-run', '--no-zygote', '--single-process',
        ]
      : [
          '--no-sandbox', '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', '--disable-gpu',
        ],
  },
});

client.on('qr', async (qr) => {
  console.log('📲 QR generado — visita la URL del servicio para escanearlo');
  qrDataUrl = await qrcodeImg.toDataURL(qr, { scale: 8 });
  if (!IS_HEADLESS) {
    // En local, también imprimimos en terminal
    const { default: qrcodeTerminal } = await import('qrcode-terminal');
    qrcodeTerminal.generate(qr, { small: true });
  }
});

client.on('ready', () => {
  connected = true;
  qrDataUrl = null;
  reconnectAttempts = 0;
  console.log('✅ WhatsApp conectado y listo para recibir mensajes');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Fallo de autenticación — la sesión expiró:', msg);
  console.log('🔄 Cerrando cliente para reinicio automático...');
  connected = false;
  setTimeout(() => {
    client.destroy().then(() => {
      client.initialize();
    }).catch(() => {
      console.error('❌ Error al destruir cliente, reiniciando proceso...');
      process.exit(1);
    });
  }, 5000);
});

client.on('disconnected', (reason) => {
  console.warn('⚠️ WhatsApp desconectado:', reason);
  connected = false;
  qrDataUrl = null;
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    const delay = RECONNECT_BASE_DELAY * (reconnectAttempts + 1);
    console.log(`🔄 Reconectando intento ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS} en ${delay / 1000}s...`);
    reconnectAttempts++;
    setTimeout(() => {
      client.destroy().then(() => {
        client.initialize();
      }).catch(() => {
        console.error('❌ Error al destruir cliente, reiniciando proceso...');
        process.exit(1);
      });
    }, delay);
  } else {
    console.error('❌ Máximo de intentos de reconexión alcanzado. Reiniciando proceso...');
    process.exit(1);
  }
});

client.on('change_state', (state) => {
  console.log(`🔄 Estado de WhatsApp: ${state}`);
});

// WhatsApp Web.js puede emitir un mensaje entrante por `message` y, según
// la versión/sesión, también por `message_create`. Procesamos ambos eventos
// pero deduplicamos por el ID de WhatsApp para no guardar dos veces.
const processingMessages = new Set();
const recentlyProcessedMessages = new Set();

function serializedMessageId(msg) {
  const idData = msg?.id && typeof msg.id === 'object'
    ? msg.id
    : (msg?._data?.id && typeof msg._data.id === 'object' ? msg._data.id : {});
  const isComplete = (candidate) => (
    typeof candidate === 'string'
    && candidate.trim()
    && (candidate.includes('_') || candidate.includes('@'))
  );
  const candidates = [
    msg?.id?._serialized,
    msg?.id?.serialized,
    typeof msg?.id === 'string' ? msg.id : null,
    msg?._data?.id?._serialized,
    msg?._data?.id?.serialized,
  ];
  const value = candidates.find(isComplete);
  if (value) return value.trim();

  const idPart = idData?.id;
  const remote = idData?.remote || msg?.from || msg?._data?.from;
  if (typeof idPart === 'string' && idPart.trim() && typeof remote === 'string' && remote.trim()) {
    const fromMe = idData?.fromMe ?? msg?.fromMe ?? false;
    return `${fromMe ? 'true' : 'false'}_${remote.trim()}_${idPart.trim()}`;
  }

  return null;
}

async function refreshMessage(msg) {
  const messageId = serializedMessageId(msg);
  if (!messageId || !client?.getMessageById) return msg;
  try {
    const fresh = await client.getMessageById(messageId);
    if (fresh) return fresh;
  } catch (error) {
    console.warn('⚠️ No se pudo refrescar el mensaje antes de descargar media:', error?.message || String(error));
  }
  return msg;
}

function messageKey(msg) {
  return serializedMessageId(msg) || [
    msg?.from || '',
    msg?.to || '',
    msg?.timestamp || '',
    msg?.fromMe ? 'out' : 'in',
    msg?.hasMedia ? 'media' : String(msg?.body || ''),
  ].join('|');
}

async function forwardMessage(msg, eventName) {
  const key = messageKey(msg);
  const messageId = serializedMessageId(msg);
  if (!key || processingMessages.has(key) || recentlyProcessedMessages.has(key)) {
    console.log(`↪️ Mensaje duplicado omitido (${eventName})`);
    return;
  }
  processingMessages.add(key);

  try {
    let mediaUrl = null;
    let mediaMimetype = null;
    let mediaDownloadFailed = false;

    // ── Obtener número REAL (WhatsApp moderno usa LID interno, no el número) ──
    let realPhone = null;
    try {
      const contact = await msg.getContact();
      // contact.number es el número real sin +, ej: 59178456789
      realPhone = contact.number || null;
      console.log(`📱 Número real: ${realPhone || 'no disponible'} (raw: ${msg.from})`);
    } catch (e) {
      console.warn('⚠️ No se pudo obtener contacto:', e.message);
    }

    // Usar número real si existe, sino normalizar el from (que puede ser LID)
    const fromPhone = realPhone ? normalizePhone(realPhone) : normalizePhone(msg.from);

    if (WHATSAPP_LIVE_ONLY && !(await hasActiveProcessingLive())) {
      console.log(`WhatsApp ignorado fuera de Live activo | De: ${fromPhone || msg.from} | Media: ${msg.hasMedia ? 'si' : 'no'}`);
      return;
    }

    if (msg.hasMedia) {
      console.log(`📥 Descargando media... id=${messageId || 'sin-id'}`);
      const media = await downloadMediaWithRetry(msg);
      if (media && SUPABASE_URL && SUPABASE_KEY) {
        mediaMimetype = media.mimetype;
        mediaUrl = await uploadMedia(
          media.data, media.mimetype,
          fromPhone, msg.timestamp,
          messageId
        );
      }
      mediaDownloadFailed = !media || !mediaUrl;
    }

    const payload = {
      id: messageId,
      from: msg.from,          // ID interno de WhatsApp (para referencia)
      fromPhone,               // ← número real limpio (ej: 59178456789)
      fromMe: msg.fromMe,      // true si el operador envió este mensaje
      to: msg.to,
      body: msg.body,
      hasMedia: msg.hasMedia,
      mediaMimetype: mediaMimetype || msg._data?.mimetype || null,
      mediaUrl,
      mediaDownloadFailed,
      timestamp: msg.timestamp,
    };

    console.log(`🚀 Enviando [${msg.hasMedia ? 'Media' : 'Texto'}] de ${fromPhone} (${eventName})...`);
    const webhookHeaders = SUPABASE_KEY
      ? { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY }
      : {};
    const r = await axios.post(WEBHOOK_URL, payload, { timeout: 15000, headers: webhookHeaders });
    if (r.status === 200) console.log('✔️  Mensaje guardado en Supabase');
    recentlyProcessedMessages.add(key);
    const timer = setTimeout(() => recentlyProcessedMessages.delete(key), 60_000);
    timer.unref?.();

  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    processingMessages.delete(key);
  }
}

client.on('message', (msg) => forwardMessage(msg, 'message').catch((error) => {
  console.error('❌ Error en evento message:', error.message);
}));

client.on('message_create', (msg) => forwardMessage(msg, 'message_create').catch((error) => {
  console.error('❌ Error en evento message_create:', error.message);
}));

client.initialize();
