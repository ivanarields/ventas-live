import http from 'node:http';
import { mkdir, appendFile, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const PORT = Number(process.env.PORT || 3000);
const FORWARD_URL = process.env.FORWARD_URL || 'https://leidycandy.me/api/ingest-notification';
const DEVICE_ID = process.env.DEVICE_ID || '';
const DEVICE_SECRET = process.env.DEVICE_SECRET || '';
const RECEIVER_SECRET = process.env.RECEIVER_SECRET || '';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const DATA_DIR = process.env.DATA_DIR || './data';
const QUEUE_FILE = join(DATA_DIR, 'queue.jsonl');
const DEAD_FILE = join(DATA_DIR, 'dead-letter.jsonl');
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 720);
const FORWARD_TIMEOUT_MS = Number(process.env.FORWARD_TIMEOUT_MS || 20000);
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 5000);

let processing = false;

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-receiver-secret, x-device-id, x-device-secret'
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Body demasiado grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('JSON invalido'));
      }
    });
    req.on('error', reject);
  });
}

async function enqueue(payload, req) {
  await mkdir(DATA_DIR, { recursive: true });
  const item = {
    id: randomUUID(),
    received_at: new Date().toISOString(),
    attempts: 0,
    payload,
    forward_headers: {
      device_id: req.headers['x-device-id'] || DEVICE_ID || 'android-caja-01',
      device_secret: req.headers['x-device-secret'] || DEVICE_SECRET || ''
    },
    meta: {
      user_agent: req.headers['user-agent'] || null,
      remote_addr: req.socket.remoteAddress || null
    }
  };
  await appendFile(QUEUE_FILE, `${JSON.stringify(item)}\n`, 'utf8');
  return item.id;
}

async function loadQueue() {
  if (!existsSync(QUEUE_FILE)) return [];
  const raw = await readFile(QUEUE_FILE, 'utf8');
  return raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

async function loadDeadLetter() {
  if (!existsSync(DEAD_FILE)) return [];
  const raw = await readFile(DEAD_FILE, 'utf8');
  return raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

async function saveQueue(items) {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${QUEUE_FILE}.tmp`;
  const body = items.map(item => JSON.stringify(item)).join('\n');
  await writeFile(tmp, body ? `${body}\n` : '', 'utf8');
  await rename(tmp, QUEUE_FILE);
}

async function saveDeadLetter(items) {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DEAD_FILE}.tmp`;
  const body = items.map(item => JSON.stringify(item)).join('\n');
  await writeFile(tmp, body ? `${body}\n` : '', 'utf8');
  await rename(tmp, DEAD_FILE);
}

function isAuthorized(req) {
  if (!ADMIN_SECRET && !RECEIVER_SECRET) return false;
  const provided =
    req.headers['x-admin-secret'] ||
    req.headers['x-receiver-secret'] ||
    new URL(req.url || '/', 'http://localhost').searchParams.get('secret');
  return Boolean(provided && (provided === ADMIN_SECRET || provided === RECEIVER_SECRET));
}

async function forwardItem(item) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  const deviceId = item.forward_headers?.device_id || DEVICE_ID || 'android-caja-01';
  const deviceSecret = item.forward_headers?.device_secret || DEVICE_SECRET || '';
  try {
    const response = await fetch(FORWARD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
        'x-device-secret': deviceSecret
      },
      body: JSON.stringify(item.payload),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    console.log(`[receiver] reenviado ${item.id} -> ${response.status}`);
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    const queue = await loadQueue();
    const remaining = [];
    for (const item of queue) {
      try {
        await forwardItem(item);
      } catch (err) {
        item.attempts = Number(item.attempts || 0) + 1;
        item.last_error = err?.message || String(err);
        item.last_attempt_at = new Date().toISOString();
        console.error(`[receiver] fallo ${item.id} intento ${item.attempts}: ${item.last_error}`);
        if (item.attempts >= MAX_ATTEMPTS) {
          await appendFile(DEAD_FILE, `${JSON.stringify(item)}\n`, 'utf8');
        } else {
          remaining.push(item);
        }
      }
    }
    await saveQueue(remaining);
  } finally {
    processing = false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url?.split('?')[0] || '/';

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && url === '/api/health') {
    const queue = await loadQueue().catch(() => []);
    const dead = await loadDeadLetter().catch(() => []);
    sendJson(res, 200, {
      ok: true,
      service: 'macrodroid-receiver',
      queued: queue.length,
      dead_letter: dead.length,
      max_attempts: MAX_ATTEMPTS,
      retry_delay_ms: RETRY_DELAY_MS,
      forward_timeout_ms: FORWARD_TIMEOUT_MS,
      forward_url: FORWARD_URL,
      forward_url_configured: Boolean(FORWARD_URL),
      device_id_configured: Boolean(DEVICE_ID),
      device_secret_configured: Boolean(DEVICE_SECRET),
      admin_recovery_enabled: Boolean(ADMIN_SECRET || RECEIVER_SECRET),
      accepts_forwarded_device_headers: true,
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (req.method === 'POST' && url === '/api/retry-dead-letter') {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }

    const dead = await loadDeadLetter().catch(() => []);
    if (!dead.length) {
      sendJson(res, 200, { ok: true, moved: 0 });
      return;
    }

    const queue = await loadQueue().catch(() => []);
    const restored = dead.map(item => ({
      ...item,
      attempts: 0,
      restored_at: new Date().toISOString(),
      last_error: undefined,
      last_attempt_at: undefined
    }));
    await saveQueue([...queue, ...restored]);
    await saveDeadLetter([]);
    sendJson(res, 200, { ok: true, moved: restored.length });
    setTimeout(processQueue, 10);
    return;
  }

  if (req.method === 'POST' && (url === '/api/macrodroid' || url === '/api/ingest-notification')) {
    if (RECEIVER_SECRET) {
      const provided = req.headers['x-receiver-secret'] || new URL(req.url || '/', 'http://localhost').searchParams.get('secret');
      if (provided !== RECEIVER_SECRET) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized' });
        return;
      }
    }

    try {
      const payload = await readJson(req);
      const id = await enqueue(payload, req);
      sendJson(res, 200, { ok: true, queued: true, id });
      setTimeout(processQueue, 10);
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err?.message || 'Invalid request' });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[receiver] escuchando en puerto ${PORT}`);
  console.log(`[receiver] reenviando a ${FORWARD_URL}`);
});

setInterval(processQueue, RETRY_DELAY_MS).unref();
