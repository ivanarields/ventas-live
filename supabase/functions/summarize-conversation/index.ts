import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('PANEL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_KEY = Deno.env.get('PANEL_SUPABASE_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ENV_GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

// La key activa — se puede sobreescribir con la que manda el cliente
let ACTIVE_GEMINI_KEY = ENV_GEMINI_KEY;

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

async function callGemini(prompt: string): Promise<Record<string, string>> {
  if (!ACTIVE_GEMINI_KEY) {
    console.error('❌ GEMINI_API_KEY no configurada');
    return { pedido: 'Error: API key no configurada. Agrégala en Configuración IA del panel.' };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${ACTIVE_GEMINI_KEY}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: PROMPT_SISTEMA }] },
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 400,
      // Sin responseMimeType para evitar conflicto con thinkingBudget:0
    },
  };

  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();

  if (!res.ok) {
    console.error('❌ Gemini API error:', JSON.stringify(json));
    return { pedido: `Error Gemini: ${json.error?.message || res.status}` };
  }

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  console.log('🤖 Gemini texto raw:', text.slice(0, 200));

  // Extraer JSON del texto (puede venir con markdown ```json ... ```)
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { pedido: text || 'Sin respuesta de IA' };
  try { return JSON.parse(match[0]); }
  catch { return { pedido: text }; }
}

async function geminiText(prompt: string): Promise<string> {
  if (!ACTIVE_GEMINI_KEY) return '';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${ACTIVE_GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 300 },
    }),
  });
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function geminiWithMedia(prompt: string, mimeType: string, base64Data: string): Promise<string> {
  if (!ACTIVE_GEMINI_KEY) return '';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${ACTIVE_GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: prompt },
      ]}],
      generationConfig: { temperature: 0, maxOutputTokens: 200 },
    }),
  });
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function transcribirAudio(url: string): Promise<string> {
  try {
    const r = await fetch(url);
    if (!r.ok) { console.warn('Audio fetch failed:', r.status, url); return ''; }
    const buf = await r.arrayBuffer();
    const b64 = toBase64(buf);
    const mime = url.includes('.mp3') ? 'audio/mpeg' : 'audio/ogg';
    const t = await geminiWithMedia('Transcribe exactamente lo que dice este audio en español. Solo el texto, sin explicaciones.', mime, b64);
    console.log('🎙️ Transcripción:', t.slice(0, 100));
    return t;
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
    const d = await geminiWithMedia(`Analiza esta imagen y responde con UNA SOLA línea:
- Si es un COMPROBANTE de pago, transferencia o captura de QR bancario: escribe "COMPROBANTE: [nombre del pagador] - [monto] Bs - [banco o app]". Extrae el nombre REAL que aparece en el comprobante.
- Si es una PRENDA de ropa: escribe "PRENDA: [color, tipo, características]". Máximo 15 palabras.
- Si es otra cosa: escribe "OTRO: [descripción breve]".
Responde SOLO con una línea, sin explicaciones.`, mime, b64);
    console.log('🖼️ Descripción foto:', d);
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
    const { clienteId, geminiKey } = await req.json();
    if (!clienteId) return new Response(JSON.stringify({ error: 'clienteId requerido' }), { status: 400 });

    // Si el cliente envía su propia key, usarla (permite rotación desde el panel)
    if (geminiKey?.startsWith('AIza')) {
      ACTIVE_GEMINI_KEY = geminiKey;
      console.log('🔑 Usando API key personalizada del panel');
    } else {
      ACTIVE_GEMINI_KEY = ENV_GEMINI_KEY;
    }

    console.log('🔑 GEMINI_KEY presente:', !!ACTIVE_GEMINI_KEY, '| URL:', SUPABASE_URL.slice(0, 30));

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: mensajes, error } = await supabase
      .from('panel_mensajes')
      .select('content, media_url, media_type, has_media, direction')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: true });

    if (error) { console.error('DB error:', error); return new Response(JSON.stringify({ error: error.message }), { status: 500 }); }
    if (!mensajes?.length) return new Response(JSON.stringify({ error: 'Sin mensajes' }), { status: 404 });

    console.log(`📊 ${mensajes.length} mensajes encontrados`);

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

    console.log(`📝 Textos:${textos.length} 🖼️ Fotos:${fotoUrls.length} 🎙️ Audios:${audioUrls.length}`);

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

    console.log('📤 Prompt enviado a Gemini (primeros 300 chars):', prompt.slice(0, 300));
    const resumen = await callGemini(prompt);

    await supabase.from('panel_clientes').update({
      resumen: JSON.stringify(resumen),
      resumen_at: new Date().toISOString(),
    }).eq('id', clienteId);

    console.log('✅ Resumen guardado:', JSON.stringify(resumen));

    return new Response(JSON.stringify({ ok: true, resumen }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    console.error('Error general:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
