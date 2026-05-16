export function mimeToExt(mime) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'audio/ogg; codecs=opus': 'ogg',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'video/mp4': 'mp4',
    'application/pdf': 'pdf',
  };
  return map[mime] || 'bin';
}

export function safeMediaId(value) {
  const clean = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return clean.slice(-40);
}

export function buildMediaPath(phone, timestamp, mimetype, messageId, fallbackUnique) {
  const ext = mimeToExt(mimetype);
  const unique = safeMediaId(messageId) || fallbackUnique;
  return `${phone}/${timestamp}-${unique}.${ext}`;
}
