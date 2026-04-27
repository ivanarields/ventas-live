import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcodeImg from 'qrcode';
import axios from 'axios';
import http from 'http';
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
const BUCKET         = 'whatsapp-media';
const PORT           = process.env.PORT || 3000;
const IS_RAILWAY     = !!process.env.RAILWAY_ENVIRONMENT;

// ─── Estado global para el QR ───
let qrDataUrl  = null;   // imagen base64 del QR
let connected  = false;

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
function mimeToExt(mime) {
  const map = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp',
    'audio/ogg; codecs=opus':'ogg','audio/ogg':'ogg','audio/mpeg':'mp3',
    'video/mp4':'mp4','application/pdf':'pdf' };
  return map[mime] || 'bin';
}
function normalizePhone(raw) {
  if (!raw) return null;
  let p = raw.replace(/@[a-z.]+$/, '');
  if (/^[678]\d{7}$/.test(p)) p = '591' + p;
  return p;
}

async function uploadMedia(base64, mimetype, phone, timestamp) {
  try {
    const ext  = mimeToExt(mimetype);
    const path = `${phone}/${timestamp}.${ext}`;
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

// ─── Cliente WhatsApp ───
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: join(__dirname, '.wwebjs_auth') }),
  puppeteer: {
    headless: true,
    executablePath: IS_RAILWAY
      ? (process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable')
      : undefined,
    args: IS_RAILWAY
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
  if (!IS_RAILWAY) {
    // En local, también imprimimos en terminal
    const { default: qrcodeTerminal } = await import('qrcode-terminal');
    qrcodeTerminal.generate(qr, { small: true });
  }
});

client.on('ready', () => {
  connected = true;
  qrDataUrl = null;
  console.log('✅ WhatsApp conectado y listo para recibir mensajes');
});

client.on('auth_failure', () => {
  console.error('❌ Fallo de autenticación — la sesión expiró. Reinicia el servicio para escanear QR nuevo.');
});

client.on('message_create', async (msg) => {
  try {
    let mediaUrl = null;
    let mediaMimetype = null;

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

    if (msg.hasMedia) {
      console.log('📥 Descargando media...');
      const media = await msg.downloadMedia();
      if (media && SUPABASE_URL && SUPABASE_KEY) {
        mediaMimetype = media.mimetype;
        mediaUrl = await uploadMedia(
          media.data, media.mimetype,
          fromPhone, msg.timestamp
        );
      }
    }

    const payload = {
      id: msg.id._serialized,
      from: msg.from,          // ID interno de WhatsApp (para referencia)
      fromPhone,               // ← número real limpio (ej: 59178456789)
      fromMe: msg.fromMe,      // true si el operador envió este mensaje
      to: msg.to,
      body: msg.body,
      hasMedia: msg.hasMedia,
      mediaMimetype, mediaUrl,
      timestamp: msg.timestamp,
    };

    console.log(`🚀 Enviando [${msg.hasMedia ? 'Media' : 'Texto'}] de ${fromPhone}...`);
    const r = await axios.post(WEBHOOK_URL, payload, { timeout: 15000 });
    if (r.status === 200) console.log('✔️  Mensaje guardado en Supabase');

  } catch (e) {
    console.error('❌ Error:', e.message);
  }
});

client.initialize();
