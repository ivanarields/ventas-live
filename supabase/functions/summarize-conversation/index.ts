import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('PANEL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_KEY = Deno.env.get('PANEL_SUPABASE_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || '';
const OPENROUTER_MODEL = Deno.env.get('OPENROUTER_MODEL') || 'openai/gpt-4o-mini';

// ── Convertir ArrayBuffer a base64 sin spread (evita stack overflow) ──
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const PROMPT_SISTEMA = `Eres un asistente que analiza conversaciones de WhatsApp de una tienda de ropa en Bolivia.
Genera un resumen del pedido del cliente. Responde únicamente con un objeto JSON válido, sin texto adicional ni markdown.`;

const PROMPT_USUARIO = (textos: string, fotos: string, audios: string) =>
`Conversación del cliente:

MENSAJES DE TEXTO:
${textos || '(ninguno)'}

ANÁLISIS DE FOTOGRAFÍAS (pueden ser prendas de ropa O comprobantes de pago):
${fotos || '(ninguna)'}

TRANSCRIPCIÓN DE AUDIOS:
${audios || '(ninguno)'}

Genera este JSON exacto (sin backticks, sin texto antes o después):
{"pedido":"qué quiere el cliente","cantidad":"número o no especificado","talla":"talla o no especificada","pago":"forma de pago o no especificado","entrega":"cuándo o dónde o no especificado","comprobante":"Si hay un comprobante de pago en las fotos, escribe: nombre del pagador - monto Bs - banco. Si no hay comprobante, escribe null","notas":"observaciones adicionales o null"}`;

async function openRouterText(prompt: string, maxTokens = 400): Promise<string> {
  if (!OPENROUTER_API_KEY) return '';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': Deno.env.get('APP_URL') || 'https://ventas-live.vercel.app',
      'X-Title': 'Ventas Live',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: PROMPT_SISTEMA },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: maxTokens,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('OpenRouter API error:', JSON.stringify(json));
    return '';
  }
  const content = json.choices?.[0]?.message?.content;
  return Array.isArray(content)
    ? content.map((item: any) => item?.text ?? '').join('').trim()
    : String(content ?? '').trim();
}

async function openRouterWithImage(prompt: string, mimeType: string, base64Data: string): Promise<string> {
  if (!OPENROUTER_API_KEY || !mimeType.startsWith('image/')) return '';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': Deno.env.get('APP_URL') || 'https://ventas-live.vercel.app',
      'X-Title': 'Ventas Live',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } },
        ],
      }],
      temperature: 0,
      max_tokens: 200,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('OpenRouter media error:', JSON.stringify(json));
    return '';
  }
  const content = json.choices?.[0]?.message?.content;
  return Array.isArray(content)
    ? content.map((item: any) => item?.text ?? '').join('').trim()
    : String(content ?? '').trim();
}

async function callOpenRouter(prompt: string): Promise<Record<string, string>> {
  if (!OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY no configurada');
    return { pedido: 'Error: OpenRouter no configurado.' };
  }

  const text = await openRouterText(prompt, 400);
  console.log('OpenRouter texto raw:', text.slice(0, 200));

  // Extraer JSON del texto (puede venir con markdown ```json ... ```)
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { pedido: text || 'Sin respuesta de IA' };
  try { return JSON.parse(match[0]); }
  catch { return { pedido: text }; }
}

async function transcribirAudio(url: string): Promise<string> {
  try {
    const r = await fetch(url);
    if (!r.ok) { console.warn('Audio fetch failed:', r.status, url); return ''; }
    const buf = await r.arrayBuffer();
    const b64 = toBase64(buf);
    const mime = url.includes('.mp3') ? 'audio/mpeg' : 'audio/ogg';
    console.warn('Transcripcion de audio omitida: OpenRouter chat solo procesa imagenes en esta funcion.', mime, b64.length);
    return '';
  } catch (e) {
    console.error('Audio error:', e);
    return '';
  }
}

async function describirFoto(url: string): Promise<string> {
  try {
    const r = await fetch(url);
    if (!r.ok) { console.warn('Foto fetch failed:', r.status, url); return ''; }
    const buf = await r.arrayBuffer();
    const b64 = toBase64(buf);
    const mime = url.endsWith('.png') ? 'image/png' : url.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const d = await openRouterWithImage(`Analiza esta imagen y responde con UNA SOLA línea:
- Si es un COMPROBANTE de pago, transferencia o captura de QR bancario: escribe "COMPROBANTE: [nombre del pagador] - [monto] Bs - [banco o app]". Extrae el nombre REAL que aparece en el comprobante.
- Si es una PRENDA de ropa: escribe "PRENDA: [color, tipo, características]". Máximo 15 palabras.
- Si es otra cosa: escribe "OTRO: [descripción breve]".
Responde SOLO con una línea, sin explicaciones.`, mime, b64);
    console.log('Descripcion foto:', d);
    return d;
  } catch (e) {
    console.error('Foto error:', e);
    return '';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }

  try {
    const { clienteId } = await req.json();
    if (!clienteId) return new Response(JSON.stringify({ error: 'clienteId requerido' }), { status: 400 });

    console.log('OPENROUTER_KEY presente:', !!OPENROUTER_API_KEY, '| URL:', SUPABASE_URL.slice(0, 30));

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: mensajes, error } = await supabase
      .from('panel_mensajes')
      .select('content, media_url, media_type, has_media, direction')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: true });

    if (error) { console.error('DB error:', error); return new Response(JSON.stringify({ error: error.message }), { status: 500 }); }
    if (!mensajes?.length) return new Response(JSON.stringify({ error: 'Sin mensajes' }), { status: 404 });

    console.log(`${mensajes.length} mensajes encontrados`);

    const textos: string[]   = [];
    const fotoUrls: string[] = [];
    const audioUrls: string[]= [];

    for (const m of mensajes) {
      if (m.content?.trim()) textos.push(m.content.trim());
      if (m.media_url) {
        const mt: string = m.media_type || '';
        const isImage = mt.startsWith('image/') || /\.(jpg|jpeg|png|webp)/i.test(m.media_url);
        const isAudio = mt.startsWith('audio/') || mt.startsWith('video/') || /\.(ogg|mp3|mp4|m4a)/i.test(m.media_url);
        if (isImage) fotoUrls.push(m.media_url);
        else if (isAudio) audioUrls.push(m.media_url);
      }
    }

    console.log(`Textos:${textos.length} Fotos:${fotoUrls.length} Audios:${audioUrls.length}`);

    // Transcribir audios (máx 3)
    const transcripciones: string[] = [];
    for (const u of audioUrls.slice(0, 3)) {
      const t = await transcribirAudio(u);
      if (t) transcripciones.push(t);
    }

    // Describir fotos (máx 3)
    const descripciones: string[] = [];
    for (const u of fotoUrls.slice(0, 3)) {
      const d = await describirFoto(u);
      if (d) descripciones.push(d);
    }

    const prompt = PROMPT_USUARIO(
      textos.join('\n'),
      descripciones.map((d, i) => `Foto ${i+1}: ${d}`).join('\n'),
      transcripciones.map((t, i) => `Audio ${i+1}: "${t}"`).join('\n'),
    );

    console.log('Prompt enviado a OpenRouter (primeros 300 chars):', prompt.slice(0, 300));
    const resumen = await callOpenRouter(prompt);

    await supabase.from('panel_clientes').update({
      resumen: JSON.stringify(resumen),
      resumen_at: new Date().toISOString(),
    }).eq('id', clienteId);

    console.log('Resumen guardado:', JSON.stringify(resumen));

    return new Response(JSON.stringify({ ok: true, resumen }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    console.error('Error general:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
