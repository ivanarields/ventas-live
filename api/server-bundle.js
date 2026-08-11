// server.ts
import express from "express";
import { createClient as createClient5 } from "@supabase/supabase-js";
import crypto2 from "crypto";
import path from "path";
import { fileURLToPath } from "url";

// src/lib/supabaseServer.ts
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
var url = process.env.SUPABASE_URL;
var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.warn(
    "[supabase-server] SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no definidas. Los endpoints de etiquetas fallar\xE1n."
  );
}
var supabaseServer = createClient(url ?? "", serviceKey ?? "", {
  auth: { persistSession: false, autoRefreshToken: false }
});

// src/lib/supabaseStore.ts
import "dotenv/config";
import { createClient as createClient2 } from "@supabase/supabase-js";
var url2 = process.env.VITE_STORE_SUPABASE_URL;
var serviceKey2 = process.env.STORE_SUPABASE_SERVICE_ROLE_KEY;
if (!url2 || !serviceKey2) {
  console.warn(
    "[supabase-store] VITE_STORE_SUPABASE_URL o STORE_SUPABASE_SERVICE_ROLE_KEY no definidas. Los endpoints de tienda fallar\xE1n."
  );
}
var supabaseStore = createClient2(url2 ?? "", serviceKey2 ?? "", {
  auth: { persistSession: false, autoRefreshToken: false }
});

// src/lib/supabasePanel.ts
import "dotenv/config";
import { createClient as createClient3 } from "@supabase/supabase-js";
var url3 = process.env.PANEL_SUPABASE_URL;
var serviceKey3 = process.env.PANEL_SUPABASE_SERVICE_KEY;
if (!url3 || !serviceKey3) {
  console.warn(
    "[supabase-panel] PANEL_SUPABASE_URL o PANEL_SUPABASE_SERVICE_KEY no definidas. Los endpoints del panel de WhatsApp fallar\xE1n."
  );
}
var supabasePanel = createClient3(url3 ?? "", serviceKey3 ?? "", {
  auth: { persistSession: false, autoRefreshToken: false }
});

// src/services/bufferService.ts
var BUFFER_ENDPOINT = "https://api.buffer.com";
function buildPostText(product) {
  const emoji = {
    Blusas: "\u{1F45A}",
    Vestidos: "\u{1F457}",
    Chaquetas: "\u{1F9E5}",
    Conjuntos: "\u2728",
    Pantalones: "\u{1F456}",
    Faldas: "\u{1FA71}",
    Accesorios: "\u{1F48D}",
    General: "\u{1F6CD}\uFE0F"
  };
  const icon = emoji[product.category ?? ""] ?? "\u{1F6CD}\uFE0F";
  const hashCategory = product.category && product.category !== "General" ? `#${product.category.replace(/\s+/g, "")} ` : "";
  const lines = [];
  lines.push("\u2728 \xA1Nuevo en tienda!");
  lines.push("", `${icon} ${product.name}`);
  if (product.description) lines.push("", product.description.trim());
  lines.push("", `\u{1F4B5} Precio: Bs ${Number(product.price).toFixed(2)}`);
  lines.push("", "\u{1F449} Visit\xE1 nuestra tienda y ped\xED el tuyo:");
  lines.push("https://leidycandy.me/tienda");
  const tagPrenda = product.category && product.category !== "General" ? `#${product.category.replace(/\s+/g, "")}` : "#Moda";
  lines.push("", `#TiendaOnline #LeidyCandy #SantaCruz ${tagPrenda}`);
  return lines.join("\n");
}
async function publishToChannel(apiKey, channelId, channelName, product) {
  const images = (product.images ?? []).filter(Boolean).slice(0, 3);
  if (images.length === 0) {
    return { channel: channelName, status: "error", error_message: "Producto sin im\xE1genes" };
  }
  const text = buildPostText(product);
  const assets = images.map((url4) => ({ image: { url: url4 } }));
  const metadataByChannel = {
    facebook: { facebook: { type: "post" } },
    instagram: { instagram: { type: "post", shouldShareToFeed: true } },
    tiktok: {}
  };
  const metadata = metadataByChannel[channelName] ?? {};
  const mutation = `
    mutation CreatePost($text: String!, $assets: [AssetInput!]!, $metadata: PostInputMetaData) {
      createPost(input: {
        channelId: "${channelId}"
        text: $text
        assets: $assets
        metadata: $metadata
        schedulingType: automatic
        mode: shareNow
      }) {
        ... on PostActionSuccess {
          post { id text }
        }
        ... on MutationError {
          message
        }
      }
    }
  `;
  const variables = { text, assets, metadata };
  try {
    const res = await fetch(BUFFER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: mutation, variables })
    });
    const json = await res.json();
    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message).join(", ");
      return { channel: channelName, status: "error", error_message: msg };
    }
    const result = json.data?.createPost;
    if (result?.message) {
      return { channel: channelName, status: "error", error_message: result.message };
    }
    const postId = result?.post?.id ?? null;
    return { channel: channelName, status: "publicado", buffer_post_id: postId };
  } catch (err) {
    return { channel: channelName, status: "error", error_message: err?.message ?? "Error de red" };
  }
}
async function publishProductToBuffer(product) {
  const apiKey = process.env.BUFFER_API_KEY;
  if (!apiKey) {
    console.log("[buffer] BUFFER_API_KEY no configurada \u2014 publicaci\xF3n omitida");
    return [];
  }
  const channels = [
    { id: (process.env.BUFFER_CHANNEL_ID_FACEBOOK ?? "").trim(), name: "facebook" },
    { id: (process.env.BUFFER_CHANNEL_ID_INSTAGRAM ?? "").trim(), name: "instagram" },
    { id: (process.env.BUFFER_CHANNEL_ID_TIKTOK ?? "").trim(), name: "tiktok" }
  ];
  const results = [];
  for (const ch of channels) {
    if (!ch.id) {
      console.log(`[buffer] Canal ${ch.name} no configurado \u2014 omitido`);
      results.push({ channel: ch.name, status: "sin_canal" });
      continue;
    }
    const result = await publishToChannel(apiKey, ch.id, ch.name, product);
    console.log(`[buffer] ${ch.name}: ${result.status}${result.error_message ? " \u2014 " + result.error_message : ""}`);
    results.push(result);
  }
  return results;
}
async function savePublicationResults(supabaseStore2, productId, results) {
  if (!results.length) return;
  try {
    const rows = results.map((r) => ({
      product_id: productId,
      channel: r.channel,
      buffer_post_id: r.buffer_post_id ?? null,
      status: r.status,
      error_message: r.error_message ?? null
    }));
    const { error } = await supabaseStore2.from("buffer_publications").insert(rows);
    if (error) console.warn("[buffer] No se pudo guardar estado en buffer_publications:", error.message);
  } catch (err) {
    console.warn("[buffer] Error guardando publicaciones:", err?.message);
  }
}

// src/routes/ai-gateway.ts
import { Router } from "express";
import { createClient as createClient4 } from "@supabase/supabase-js";

// src/ai/prompts/product-catalog.ts
var CATEGORIAS_VALIDAS = [
  "Blusas",
  "Vestidos",
  "Chaquetas",
  "Conjuntos",
  "Pantalones",
  "Faldas",
  "Accesorios",
  "General"
];
var TALLAS_VALIDAS = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "34",
  "36",
  "38",
  "40",
  "42",
  "\xDAnico"
];
function buildProductCatalogPrompt(categories = CATEGORIAS_VALIDAS) {
  return `Eres un experto catalogando ropa de segunda mano.
Analizar\xE1s 1 a 3 im\xE1genes de una prenda (foto completa, etiqueta, o textura).
Devuelve \xDANICAMENTE un JSON v\xE1lido sin texto extra ni markdown:
{
  "nombre": "M\xC1XIMO 2 o 3 PALABRAS. Solo el tipo de prenda (Ej: 'Blusa manga corta', 'Jean skinny', 'Vestido floral'). PROHIBIDO incluir la marca aqu\xED.",
  "descripcion": "M\xE1ximo 2 l\xEDneas breves. Si se ve la MARCA en la etiqueta, ponla aqu\xED al principio. Describe material y estilo.",
  "categoria": "Una de: ${categories.join(" / ")}",
  "marca": "Marca legible en la etiqueta. Si no \u2192 'Gen\xE9rica'",
  "tipoPrenda": "Top / Blusa / Camisa / Vestido / Polera / Chaqueta / Pantal\xF3n / Jean / Falda / Conjunto / Shorts / Accesorio",
  "colorPrincipal": "Color o colores principales",
  "tallas": ["Tallas visibles. Array vac\xEDo si no hay. Valores: ${TALLAS_VALIDAS.join(", ")}"],
  "confianza": "alta / media / baja"
}
Reglas cr\xEDticas:
- 'nombre' DEBE SER CORT\xCDSIMO (2 o 3 palabras). JAM\xC1S LA MARCA.
- La marca va SOLO en 'descripcion' y 'marca'.
- 'categoria' debe ser EXACTAMENTE una de las opciones.
- JSON 100% v\xE1lido y parseable.`;
}

// src/ai/prompts/image-classifier.ts
function buildImageClassifierPrompt() {
  return `Analiza esta imagen y clasif\xEDcala en UNA de estas 3 categor\xEDas:

A) COMPROBANTE_PAGO: Screenshot de Yape, transferencia bancaria, QR pagado, voucher.
   Extrae exactamente: {"tipo":"COMPROBANTE_PAGO","pagador":"NOMBRE del que pag\xF3 (MAYUSCULAS exacto)","receptor":"NOMBRE del que recibi\xF3","monto":numero,"moneda":"BOB","banco_app":"Yape|BancoUnion|BCP|TigoMoney|etc","fecha":"YYYY-MM-DD o null","hora":"HH:MM o null","nro_operacion":"string o null","confianza":"alta|media|baja"}

B) PRENDA_ROPA: Foto de ropa, prenda de vestir, accesorio de moda.
   Extrae exactamente: {"tipo":"PRENDA_ROPA","nombre":"2-3 palabras m\xE1x","color":"color principal","categoria":"Blusas|Pantalones|Vestidos|Chaquetas|Faldas|Accesorios|General","talla":null,"confianza":"alta|media|baja"}

C) OTRO: Cualquier otra imagen.
   Extrae exactamente: {"tipo":"OTRO","descripcion":"breve descripci\xF3n de 10 palabras","confianza":"baja"}

REGLAS CR\xCDTICAS:
- NUNCA inventes datos. Si un campo no es legible con certeza \u2192 null
- Si es comprobante pero no puedes leer el nombre \u2192 "pagador": null
- JSON 100% v\xE1lido y parseable, sin texto adicional`;
}

// src/ai/prompts/receipt-qr.ts
function buildReceiptQrPrompt(ownerName = "LEIDY CANDY DIAZ SANCHEZ") {
  return `Eres un extractor de comprobantes de pago bolivianos.

CONTEXTO: La due\xF1a del negocio es "${ownerName}". Ella SIEMPRE recibe los pagos del negocio.

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
PASO 1 \u2014 \xBFEs un comprobante de pago a este negocio?
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Es comprobante SOLO si cumple LAS 3 condiciones:
1. La imagen muestra una transacci\xF3n de dinero (no ropa, no chat, no selfie, no foto de producto, no documento de identidad).
2. Aparece "${ownerName}" o variante parcial (LEIDY DIAZ, CANDY DIAZ, LEIDY CANDY DIAZ, LEIDY C. DIAZ, etc.) como RECEPTOR del dinero, en campos como "Para", "Destino", "Beneficiario", "Cuenta a acreditar", "A".
3. Hay un monto num\xE9rico en bolivianos visible.

Si falta CUALQUIERA de las 3 \u2192 devuelve exactamente:
{"es_comprobante":false,"pagador":null,"receptor":null,"monto":null,"hora":null,"es_transferencia_propia":false}

EXCEPCI\xD3N \u2014 TRANSFERENCIA PROPIA:
Si "${ownerName}" aparece como QUIEN ENVI\xD3 el dinero (pagador) en lugar de receptor \u2192 es_comprobante: true, es_transferencia_propia: true. No es pago de cliente al negocio.

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
PASO 2 \u2014 Receptor
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Extrae el nombre que aparece como receptor (en campos "Para", "Destino", "Beneficiario", "Cuenta a acreditar", etc.).
Normalmente ser\xE1 "${ownerName}" o variante parcial. Extrae exactamente como aparece.

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
PASO 3 \u2014 Pagador (cliente que pag\xF3)
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
Busca en campos "De", "Origen", "Enviado por", "Remitente", "Cuenta a debitar", "Pagado por".

REGLA SAGRADA: Si no aparece nombre real de persona \u2192 pagador: null. NUNCA inventes.

NO es nombre de persona (devolver null si solo aparece esto):
- Tipo de cuenta: "Caja de Ahorros", "Cuenta Corriente", "Cuenta Vista"
- Solo el nombre del banco sin nombre de persona
- N\xFAmero de tel\xE9fono (8+ d\xEDgitos seguidos)
- Email (texto con @)
- Campo vac\xEDo o ausente

S\xCD es nombre v\xE1lido (extraer tal cual aparece, al menos 2 palabras):
- Nombre completo: "SALAZAR PRADO SILVIA LINETH"
- Con inicial: "CRUZ J. INES", "M. RODRIGUEZ QUISPE"
- Cualquier combinaci\xF3n con nombre + apellido

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
PASO 4 \u2014 Monto y hora
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
monto: n\xFAmero puro sin s\xEDmbolo (ej: 25, 150.50). Si hay varios montos, extrae el MONTO PRINCIPAL del pago, NO comisi\xF3n ni saldo de cuenta.
hora: formato HH:MM 24h (ej: "14:30"). Si no aparece visible \u2192 null.

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
RESPUESTA \u2014 Solo JSON puro, sin markdown ni texto adicional:
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
{"es_comprobante":true,"pagador":"NOMBRE o null","receptor":"NOMBRE o null","monto":150.50,"hora":"14:30","es_transferencia_propia":false}`;
}

// src/services/nameMatching.ts
var STOP_WORDS = /* @__PURE__ */ new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y"]);
function normalizePersonName(raw) {
  return String(raw ?? "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z\s]/g, " ").replace(/\s+/g, " ").trim();
}
function splitName(raw) {
  const parts = normalizePersonName(raw).split(" ").filter(Boolean);
  const words = parts.filter((part) => part.length >= 3 && !STOP_WORDS.has(part));
  const initials = parts.filter((part) => part.length === 1);
  return { normalized: parts.join(" "), words, initials };
}
function sameWordSet(a, b) {
  if (a.length !== b.length || a.length < 2) return false;
  const setB = new Set(b);
  return a.every((word) => setB.has(word));
}
function containsAll(shortWords, longWords) {
  const setLong = new Set(longWords);
  return shortWords.every((word) => setLong.has(word));
}
var TRUNCATION_THRESHOLD = 24;
var MIN_PREFIX_LENGTH = 4;
function looksLikeTruncationMatch(a, b, normA, normB) {
  if (normA.length < TRUNCATION_THRESHOLD && normB.length < TRUNCATION_THRESHOLD) return false;
  if (a.length !== b.length || a.length < 2) return false;
  const setA = [...a];
  const setB = [...b];
  let exactMatches = 0;
  for (let i = setA.length - 1; i >= 0; i--) {
    const idx = setB.indexOf(setA[i]);
    if (idx >= 0) {
      setB.splice(idx, 1);
      setA.splice(i, 1);
      exactMatches++;
    }
  }
  if (setA.length === 0 && setB.length === 0) return false;
  if (setA.length !== setB.length) return false;
  if (setA.length > 1) return false;
  const wordA = setA[0];
  const wordB = setB[0];
  if (!wordA || !wordB) return false;
  if (wordA.length < MIN_PREFIX_LENGTH || wordB.length < MIN_PREFIX_LENGTH) return false;
  const shorter = wordA.length <= wordB.length ? wordA : wordB;
  const longer = wordA.length > wordB.length ? wordA : wordB;
  if (!longer.startsWith(shorter)) return false;
  if (longer.length - shorter.length > 3) return false;
  return exactMatches >= a.length - 1;
}
function initialsMatch(initials, words) {
  if (initials.length === 0) return true;
  const available = [...words];
  return initials.every((initial) => {
    const index = available.findIndex((word) => word.startsWith(initial));
    if (index < 0) return false;
    available.splice(index, 1);
    return true;
  });
}
function scorePersonName(a, b) {
  const left = splitName(a);
  const right = splitName(b);
  if (!left.normalized || !right.normalized) return { score: 0, kind: "empty", sharedWords: 0 };
  if (left.normalized === right.normalized) return { score: 1, kind: "exact", sharedWords: left.words.length };
  const shared = left.words.filter((word) => right.words.includes(word)).length;
  const minWords = Math.min(left.words.length, right.words.length);
  if (sameWordSet(left.words, right.words)) {
    return { score: 0.98, kind: "same_words", sharedWords: shared };
  }
  if (looksLikeTruncationMatch(left.words, right.words, left.normalized, right.normalized)) {
    return { score: 0.97, kind: "same_words", sharedWords: shared };
  }
  if (minWords >= 2) {
    const shorter = left.words.length <= right.words.length ? left.words : right.words;
    const longer = left.words.length > right.words.length ? left.words : right.words;
    if (containsAll(shorter, longer)) {
      return { score: 0.88, kind: "contained_words", sharedWords: shared };
    }
  }
  const oneSideHasInitials = left.initials.length > 0 || right.initials.length > 0;
  if (oneSideHasInitials && shared >= 1) {
    const initialsOk = initialsMatch(left.initials, right.words) && initialsMatch(right.initials, left.words);
    if (initialsOk && shared + left.initials.length + right.initials.length >= 3) {
      return { score: 0.78, kind: "initials", sharedWords: shared };
    }
  }
  if (minWords > 0 && shared > 0) {
    return { score: shared / Math.max(left.words.length, right.words.length), kind: "weak", sharedWords: shared };
  }
  return { score: 0, kind: "weak", sharedWords: 0 };
}
function isStrongNameMatch(a, b) {
  const result = scorePersonName(a, b);
  return result.score >= 0.96 || result.kind === "contained_words" && result.sharedWords >= 2;
}
function isContextualNameMatch(a, b) {
  const result = scorePersonName(a, b);
  return result.score >= 0.78 && result.sharedWords >= 1;
}

// src/services/identityService.ts
function normalizeName(name) {
  return normalizePersonName(name);
}
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 8) return `+591${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return phone.trim();
}
function wordOverlap(a, b) {
  const wordsA = a.split(" ").filter(Boolean);
  const wordsB = new Set(b.split(" ").filter(Boolean));
  if (wordsA.length === 0) return 0;
  const matches = wordsA.filter((w) => wordsB.has(w)).length;
  return matches / wordsA.length;
}
function profileNameScore(inputName, profileName) {
  const score = scorePersonName(inputName, profileName);
  if (score.score >= 0.96) return { confidence: score.score, matchType: "name_exact" };
  if (score.kind === "contained_words" && score.sharedWords >= 2) return { confidence: 0.86, matchType: "name_partial" };
  if (score.kind === "initials" && score.sharedWords >= 1) return { confidence: 0.72, matchType: "name_partial" };
  return null;
}
async function findOrCreateProfile(supabase, userId, input) {
  const phone = input.phone ? normalizePhone(input.phone) : null;
  const nameNorm = input.name ? normalizeName(input.name) : null;
  if (phone) {
    const { data } = await supabase.from("identity_profiles").select("*").eq("user_id", userId).eq("phone", phone).limit(1).single();
    if (data) return { profile: data, confidence: 1, match_type: "phone_exact" };
  }
  if (input.clienteId) {
    const { data } = await supabase.from("identity_profiles").select("*").eq("user_id", userId).eq("cliente_id", input.clienteId).limit(1).single();
    if (data) return { profile: data, confidence: 1, match_type: "phone_exact" };
  }
  if (nameNorm) {
    const { data: profiles } = await supabase.from("identity_profiles").select("*").eq("user_id", userId);
    if (profiles?.length) {
      let bestMatch = null;
      let bestConfidence = 0;
      let bestType = "name_partial";
      for (const p of profiles) {
        const result = profileNameScore(nameNorm, p.display_name);
        if (result && result.confidence > bestConfidence) {
          bestMatch = p;
          bestConfidence = result.confidence;
          bestType = result.matchType;
        }
      }
      if (bestMatch) return { profile: bestMatch, confidence: bestConfidence, match_type: bestType };
      const words = nameNorm.split(" ").filter(Boolean);
      if (words.length >= 2) {
        let bestMatch2 = null;
        let bestScore = 0;
        for (const p of profiles) {
          const score = wordOverlap(nameNorm, normalizeName(p.display_name));
          if (score >= 0.75 && score > bestScore) {
            bestScore = score;
            bestMatch2 = p;
          }
        }
        if (bestMatch2) {
          return { profile: bestMatch2, confidence: Math.round(bestScore * 0.6 * 1e3) / 1e3, match_type: "name_partial" };
        }
      }
    }
  }
  const { data: newProfile, error } = await supabase.from("identity_profiles").insert({
    user_id: userId,
    display_name: input.name ?? (phone ?? "Sin nombre"),
    phone,
    cliente_id: input.clienteId ?? null,
    confidence: 1,
    origin: input.origin ?? "auto"
  }).select().single();
  if (error || !newProfile) throw new Error(`Error creando perfil: ${error?.message}`);
  return { profile: newProfile, confidence: 1, match_type: "new" };
}
async function depositEvidence(supabase, userId, profileId, input) {
  const nameNorm = input.name_raw ? normalizeName(input.name_raw) : null;
  const phone = input.phone ? normalizePhone(input.phone) : null;
  const { data, error } = await supabase.from("identity_evidence").insert({
    user_id: userId,
    profile_id: profileId,
    source: input.source,
    source_id: input.source_id ?? null,
    source_ref: input.source_ref ?? null,
    event_type: input.event_type,
    amount: input.amount ?? null,
    phone,
    name_raw: input.name_raw ?? null,
    name_normalized: nameNorm,
    event_at: input.event_at ?? (/* @__PURE__ */ new Date()).toISOString(),
    payload: input.payload ?? {}
  }).select().single();
  if (error || !data) throw new Error(`Error depositando evidencia: ${error?.message}`);
  return data;
}
async function getProfileWithEvidence(supabase, userId, profileId) {
  const [{ data: profile }, { data: evidence }] = await Promise.all([
    supabase.from("identity_profiles").select("*").eq("id", profileId).eq("user_id", userId).single(),
    supabase.from("identity_evidence").select("*").eq("profile_id", profileId).eq("user_id", userId).order("event_at", { ascending: false })
  ]);
  if (!profile) return null;
  return { profile, evidence: evidence ?? [] };
}
async function listProfiles(supabase, userId, opts) {
  if (opts?.source) {
    const { data: evidenceRows } = await supabase.from("identity_evidence").select("profile_id").eq("user_id", userId).eq("source", opts.source);
    const ids = [...new Set((evidenceRows ?? []).map((e) => e.profile_id).filter(Boolean))];
    if (ids.length === 0) return [];
    const { data: data2 } = await supabase.from("identity_profiles").select("*").eq("user_id", userId).in("id", ids).order("updated_at", { ascending: false });
    return data2 ?? [];
  }
  let query = supabase.from("identity_profiles").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
  if (opts?.search) query = query.ilike("display_name", `%${opts.search}%`);
  if (opts?.limit) query = query.limit(opts.limit);
  if (opts?.offset) query = query.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);
  const { data } = await query;
  return data ?? [];
}
async function recalculateAllConfidences(supabase, userId) {
  const [{ data: profiles }, { data: evidence }] = await Promise.all([
    supabase.from("identity_profiles").select("id, phone, panel_phone, store_phone").eq("user_id", userId),
    supabase.from("identity_evidence").select("profile_id, source").eq("user_id", userId).not("profile_id", "is", null)
  ]);
  if (!profiles?.length) return { updated: 0 };
  const sourcesByProfile = /* @__PURE__ */ new Map();
  for (const e of evidence ?? []) {
    if (!e.profile_id) continue;
    if (!sourcesByProfile.has(e.profile_id)) sourcesByProfile.set(e.profile_id, /* @__PURE__ */ new Set());
    sourcesByProfile.get(e.profile_id).add(e.source);
  }
  let updated = 0;
  for (const profile of profiles) {
    const sources = sourcesByProfile.get(profile.id) ?? /* @__PURE__ */ new Set();
    const hasWhatsapp = sources.has("whatsapp");
    const hasPhone = !!(profile.phone || profile.panel_phone || profile.store_phone);
    const otherChannels = [...sources].filter((s) => s !== "whatsapp").length;
    let confidence;
    if (hasWhatsapp && otherChannels >= 2) {
      confidence = 0.97;
    } else if (hasWhatsapp && otherChannels >= 1) {
      confidence = 0.85;
    } else if (hasWhatsapp) {
      confidence = 0.6;
    } else if (sources.has("macrodroid")) {
      confidence = 0.45;
    } else if (hasPhone) {
      confidence = 0.55;
    } else {
      confidence = 0.3;
    }
    await supabase.from("identity_profiles").update({ confidence }).eq("id", profile.id).eq("user_id", userId);
    updated++;
  }
  return { updated };
}
async function ingestManualPayment(supabase, userId, pago) {
  const result = await findOrCreateProfile(supabase, userId, {
    name: pago.nombre,
    clienteId: pago.clienteId
  });
  await depositEvidence(supabase, userId, result.profile.id, {
    source: "manual_payment",
    source_id: pago.id,
    event_type: "payment",
    amount: pago.monto,
    name_raw: pago.nombre,
    event_at: pago.fecha,
    payload: { cliente_id: pago.clienteId }
  });
  return result;
}

// src/services/liveSalesService.ts
var BOLIVIA_OFFSET_MS = 4 * 60 * 60 * 1e3;
function normalizeLivePhone(raw) {
  if (raw == null) return null;
  let phone = String(raw).trim().replace(/\s+/g, "").replace(/@[a-z.]+$/i, "");
  phone = phone.replace(/[^\d+]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (/^[678]\d{7}$/.test(phone)) phone = `591${phone}`;
  return phone || null;
}
function canonicalName(raw) {
  return normalizePersonName(raw);
}
function namesMatch(a, b) {
  const ca = canonicalName(a);
  const cb = canonicalName(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  if (isContextualNameMatch(ca, cb)) return true;
  const short = ca.length <= cb.length ? ca : cb;
  const long = ca.length > cb.length ? ca : cb;
  return short.length >= 10 && long.includes(short);
}
function isMissingVerifiedCustomerColumn(error) {
  return (error?.code === "42703" || error?.code === "PGRST204") && /is_verified_customer|verified_at|verified_source/i.test(String(error.message ?? ""));
}
async function markMainCustomerVerified(mainDb, input) {
  if (!input.userId) return;
  const updates = {
    is_verified_customer: true,
    verified_at: (/* @__PURE__ */ new Date()).toISOString(),
    verified_source: input.source,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const phone = normalizeLivePhone(input.phone);
  if (phone) {
    updates.phone = phone;
    updates.wa_number = phone;
    updates.wa_linked_at = (/* @__PURE__ */ new Date()).toISOString();
  }
  if (input.name) {
    updates.full_name = input.name;
    updates.normalized_name = canonicalName(input.name);
    updates.canonical_name = canonicalName(input.name);
  }
  let query = mainDb.from("customers").update(updates).eq("user_id", input.userId);
  query = input.customerId ? query.eq("id", input.customerId) : query.or(`wa_number.eq.${phone},phone.eq.${phone}`);
  const { error } = await query;
  if (error && !isMissingVerifiedCustomerColumn(error)) throw error;
}
function boliviaDateKey(value = /* @__PURE__ */ new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() - BOLIVIA_OFFSET_MS).toISOString().slice(0, 10);
}
function boliviaDayUtcRange(fechaPedido) {
  const start = /* @__PURE__ */ new Date(`${fechaPedido}T04:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1e3);
  return { start: start.toISOString(), end: end.toISOString() };
}
function receiptAtFromMessage(messageCreatedAt, hora) {
  const base = messageCreatedAt ? new Date(messageCreatedAt) : /* @__PURE__ */ new Date();
  const fecha = boliviaDateKey(base);
  const match = String(hora ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return base.toISOString();
  const hh = Math.max(0, Math.min(23, Number(match[1])));
  const mm = Math.max(0, Math.min(59, Number(match[2])));
  const utc = /* @__PURE__ */ new Date(`${fecha}T00:00:00.000Z`);
  utc.setUTCHours(hh + 4, mm, 0, 0);
  if (utc.getTime() > base.getTime() + 2 * 60 * 60 * 1e3) {
    utc.setUTCDate(utc.getUTCDate() - 1);
  }
  return utc.toISOString();
}
function parseLiveMonto(raw) {
  if (raw == null || raw === "") return null;
  const value = Number(String(raw).replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
function resolveLivePaymentMatchAt(pagoLive) {
  return pagoLive?.comprobante_at ?? pagoLive?.message_created_at ?? pagoLive?.panel_message_created_at ?? pagoLive?.whatsapp_message_created_at ?? pagoLive?.comprobante_message_created_at ?? null;
}
function resolveLivePaymentMatchTimes(pagoLive) {
  const values = [
    pagoLive?.comprobante_at,
    pagoLive?.message_created_at,
    pagoLive?.panel_message_created_at,
    pagoLive?.whatsapp_message_created_at,
    pagoLive?.comprobante_message_created_at
  ];
  const seen = /* @__PURE__ */ new Set();
  return values.filter((value) => {
    if (!value) return false;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return false;
    const iso = new Date(time).toISOString();
    if (seen.has(iso)) return false;
    seen.add(iso);
    return true;
  });
}
function findMacrodroidMatchForLivePayment(pagoLive, candidates, input = {}) {
  const monto = parseLiveMonto(pagoLive?.monto);
  const matchTimes = resolveLivePaymentMatchTimes(pagoLive);
  if (!monto || matchTimes.length === 0 || !pagoLive?.nombre_detectado) return null;
  const windowMs = (input.windowMinutes ?? 5) * 60 * 1e3;
  for (const matchAt of matchTimes) {
    const center = new Date(matchAt).getTime();
    if (!Number.isFinite(center)) continue;
    const from = center - windowMs;
    const to = center + windowMs;
    const matched = (candidates ?? []).find((p) => {
      const paidTimes = [p.date, p.created_at].map((value) => new Date(value).getTime()).filter(Number.isFinite);
      if (!paidTimes.some((paidAt) => paidAt >= from && paidAt <= to)) return false;
      if (parseLiveMonto(p.pago) !== monto) return false;
      const sameCustomer = input.mainCustomerId && Number(p.customer_id) === Number(input.mainCustomerId);
      return sameCustomer || namesMatch(pagoLive.nombre_detectado, p.nombre);
    });
    if (matched) return matched;
  }
  return null;
}
async function ensureMainCustomerForLive(mainDb, userId, name, phone) {
  const canonical = canonicalName(name);
  const normalized = canonical.toLowerCase();
  let query = mainDb.from("customers").select("*").eq("user_id", userId).eq("canonical_name", canonical).order("updated_at", { ascending: false }).limit(1);
  const { data: byName, error: byNameError } = await query;
  if (byNameError) throw byNameError;
  let customer = byName?.[0] ?? null;
  if (!customer) {
    const { data: data2, error: error2 } = await mainDb.from("customers").select("*").eq("user_id", userId).eq("is_active", true).order("updated_at", { ascending: false }).limit(300);
    if (error2) throw error2;
    const matches = (data2 ?? []).filter((c) => isStrongNameMatch(c.canonical_name || c.full_name || c.normalized_name, canonical));
    if (matches.length === 1) customer = matches[0];
  }
  if (!customer && phone && !canonical) {
    const { data: data2, error: error2 } = await mainDb.from("customers").select("*").eq("user_id", userId).or(`wa_number.eq.${phone},phone.eq.${phone}`).order("updated_at", { ascending: false }).limit(1);
    if (error2) throw error2;
    customer = data2?.[0] ?? null;
  }
  if (!customer) {
    const { data: data2, error: error2 } = await mainDb.from("customers").insert({
      full_name: name,
      normalized_name: normalized,
      canonical_name: canonical,
      phone: phone ?? "",
      wa_number: phone ?? null,
      wa_linked_at: phone ? (/* @__PURE__ */ new Date()).toISOString() : null,
      is_active: true,
      source: "whatsapp_live",
      user_id: userId
    }).select("*").single();
    if (error2) throw error2;
    return data2;
  }
  const updates = {
    full_name: customer.full_name || name,
    normalized_name: customer.normalized_name || normalized,
    canonical_name: customer.canonical_name || canonical,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (phone && !customer.wa_number) {
    updates.wa_number = phone;
    updates.wa_linked_at = (/* @__PURE__ */ new Date()).toISOString();
  }
  if (phone && !customer.phone) updates.phone = phone;
  const { data, error } = await mainDb.from("customers").update(updates).eq("id", customer.id).eq("user_id", userId).select("*").single();
  if (error) throw error;
  return data;
}
async function ensureMainDailyPedido(mainDb, input) {
  const range = boliviaDayUtcRange(input.fechaPedido);
  const { data: existing, error: existingError } = await mainDb.from("pedidos").select("*").eq("user_id", input.userId).eq("customer_id", input.customerId).gte("date", range.start).lt("date", range.end).order("created_at", { ascending: true }).limit(20);
  if (existingError) throw existingError;
  const current = (existing ?? []).find((pedido) => String(pedido.source ?? "").toUpperCase() !== "WEB" && String(pedido.label_type ?? "").toUpperCase() !== "WEB" && !String(pedido.label ?? "").toUpperCase().startsWith("WEB-")) ?? null;
  if (current) {
    const status = String(current.status ?? "").toLowerCase();
    const keepStatus = ["listo", "preparado", "ready", "entregado"].includes(status);
    const { data: data2, error: error2 } = await mainDb.from("pedidos").update({
      customer_name: input.customerName,
      total_amount: input.totalAmount,
      status: keepStatus ? current.status : "procesar",
      source: current.source ?? "live_sales",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", current.id).eq("user_id", input.userId).select("*").single();
    if (error2) throw error2;
    return data2;
  }
  const { data, error } = await mainDb.from("pedidos").insert({
    customer_id: input.customerId,
    customer_name: input.customerName,
    item_count: 0,
    bag_count: 1,
    label: "",
    label_type: "",
    status: "procesar",
    total_amount: input.totalAmount,
    date: range.start,
    user_id: input.userId,
    source: "live_sales"
  }).select("*").single();
  if (error) throw error;
  return data;
}
async function ensurePanelLiveOrder(panelDb, input) {
  const { data: existing, error: existingError } = await panelDb.from("pedidos_venta_live").select("*").eq("phone", input.phone).eq("fecha_pedido", input.fechaPedido).neq("estado", "archivado").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    const { data: data2, error: error2 } = await panelDb.from("pedidos_venta_live").update({
      cliente_id: input.clienteId,
      nombre_detectado: input.nombreDetectado ?? existing.nombre_detectado,
      is_test: input.isTest ?? existing.is_test ?? true
    }).eq("id", existing.id).select("*").single();
    if (error2) throw error2;
    return data2;
  }
  const { data, error } = await panelDb.from("pedidos_venta_live").insert({
    cliente_id: input.clienteId,
    phone: input.phone,
    fecha_pedido: input.fechaPedido,
    nombre_detectado: input.nombreDetectado ?? null,
    estado: "conversacion",
    is_test: input.isTest ?? true
  }).select("*").single();
  if (error) throw error;
  return data;
}
async function upsertLiveEvidence(panelDb, input) {
  const payload = {
    pedido_live_id: input.pedidoLiveId,
    cliente_id: input.clienteId,
    panel_mensaje_id: input.panelMensajeId ?? null,
    tipo: input.tipo,
    media_url: input.mediaUrl ?? null,
    media_type: input.mediaType ?? null,
    content: input.content ?? null,
    descripcion: input.descripcion ?? null,
    message_created_at: input.messageCreatedAt ?? null,
    metadata: input.metadata ?? {}
  };
  if (input.panelMensajeId) {
    const { data: data2, error: error2 } = await panelDb.from("evidencias_venta_live").upsert(payload, { onConflict: "panel_mensaje_id" }).select("*").single();
    if (error2) throw error2;
    return data2;
  }
  const { data, error } = await panelDb.from("evidencias_venta_live").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}
async function recomputeLiveOrderTotals(panelDb, pedidoLiveId) {
  const { data: pagos, error } = await panelDb.from("pagos_venta_live").select("monto, estado").eq("pedido_live_id", pedidoLiveId);
  if (error) throw error;
  let totalComprobantes = 0;
  let totalVerificado = 0;
  let hasRevision = false;
  let hasPending = false;
  for (const pago of pagos ?? []) {
    const monto = parseLiveMonto(pago.monto) ?? 0;
    const estado2 = String(pago.estado ?? "");
    if (estado2 === "rechazado" || estado2 === "posible_duplicado") continue;
    totalComprobantes += monto;
    if (estado2 === "verificado_macrodroid" || estado2 === "verificado_manual") totalVerificado += monto;
    else if (estado2 === "revision_manual") hasRevision = true;
    else if (monto > 0) hasPending = true;
  }
  const totalPendiente = Math.max(0, Math.round((totalComprobantes - totalVerificado) * 100) / 100);
  let estado = "conversacion";
  if (hasRevision) estado = "revision_manual";
  else if (hasPending || totalPendiente > 0) estado = "con_pagos_pendientes";
  else if (totalVerificado > 0) estado = "pagos_verificados";
  const { data, error: updateError } = await panelDb.from("pedidos_venta_live").update({
    total_comprobantes: totalComprobantes,
    total_verificado: totalVerificado,
    total_pendiente: totalPendiente,
    estado
  }).eq("id", pedidoLiveId).select("*").single();
  if (updateError) throw updateError;
  return data;
}
async function syncMainPedidoForLiveOrder(panelDb, mainDb, userId, pedidoLive) {
  const name = pedidoLive.nombre_detectado;
  if (!name) return pedidoLive;
  const total = parseLiveMonto(pedidoLive.total_verificado) || 0;
  const customer = await ensureMainCustomerForLive(mainDb, userId, name, pedidoLive.phone);
  const pedido = await ensureMainDailyPedido(mainDb, {
    userId,
    customerId: Number(customer.id),
    customerName: customer.full_name || name,
    fechaPedido: pedidoLive.fecha_pedido,
    totalAmount: total
  });
  if (String(pedidoLive.estado ?? "") === "pagos_verificados") {
    await markMainCustomerVerified(mainDb, {
      userId,
      customerId: Number(customer.id),
      name: customer.full_name || name,
      phone: pedidoLive.phone,
      source: "live"
    });
  }
  const { data, error } = await panelDb.from("pedidos_venta_live").update({
    main_customer_id: Number(customer.id),
    main_pedido_id: Number(pedido.id)
  }).eq("id", pedidoLive.id).select("*").single();
  if (error) throw error;
  return data;
}
async function matchLivePaymentWithMacrodroid(panelDb, mainDb, input) {
  const monto = parseLiveMonto(input.pagoLive.monto);
  if (!monto || !input.pagoLive.nombre_detectado) return input.pagoLive;
  if (["verificado_macrodroid", "verificado_manual"].includes(String(input.pagoLive.estado)) && input.pagoLive.main_pago_id) {
    return input.pagoLive;
  }
  let messageCreatedAt = null;
  if (input.pagoLive.panel_mensaje_id) {
    const { data: message, error: messageError } = await panelDb.from("panel_mensajes").select("created_at").eq("id", input.pagoLive.panel_mensaje_id).limit(1).maybeSingle();
    if (messageError) throw messageError;
    messageCreatedAt = message?.created_at ?? null;
  }
  const pagoLiveForMatch = {
    ...input.pagoLive,
    message_created_at: messageCreatedAt ?? resolveLivePaymentMatchAt(input.pagoLive)
  };
  const matchTimes = resolveLivePaymentMatchTimes(pagoLiveForMatch);
  if (matchTimes.length === 0) return input.pagoLive;
  const windowMs = (input.windowMinutes ?? 5) * 60 * 1e3;
  const centers = matchTimes.map((value) => new Date(value).getTime()).filter(Number.isFinite);
  if (centers.length === 0) return input.pagoLive;
  const from = new Date(Math.min(...centers) - windowMs).toISOString();
  const to = new Date(Math.max(...centers) + windowMs).toISOString();
  let alreadyMatchedQuery = panelDb.from("pagos_venta_live").select("main_pago_id").not("main_pago_id", "is", null).eq("estado", "verificado_macrodroid");
  if (input.pagoLive.id) {
    alreadyMatchedQuery = alreadyMatchedQuery.neq("id", input.pagoLive.id);
  }
  const { data: alreadyMatched } = await alreadyMatchedQuery;
  const excludeIds = (alreadyMatched ?? []).map((p) => p.main_pago_id).filter(Boolean);
  let query = mainDb.from("pagos").select("id,nombre,pago,date,created_at,method,customer_id").eq("user_id", input.userId).eq("pago", monto).order("created_at", { ascending: false }).limit(100);
  if (excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }
  const { data: candidates, error } = await query;
  if (error) throw error;
  if (!candidates?.length) {
    const { data: data2, error: updateError2 } = await panelDb.from("pagos_venta_live").update({
      estado: "revision_manual",
      match_score: 0.5,
      match_reason: "sin_pago_macrodroid_en_ventana"
    }).eq("id", input.pagoLive.id).select("*").single();
    if (updateError2) throw updateError2;
    return data2;
  }
  const matched = findMacrodroidMatchForLivePayment(pagoLiveForMatch, candidates, {
    mainCustomerId: input.mainCustomerId,
    windowMinutes: input.windowMinutes
  });
  if (matched) {
    const { data: data2, error: updateError2 } = await panelDb.from("pagos_venta_live").update({
      estado: "verificado_macrodroid",
      main_pago_id: Number(matched.id),
      match_score: 1,
      match_reason: messageCreatedAt ? "monto_nombre_whatsapp_5m" : "monto_nombre_comprobante_5m"
    }).eq("id", input.pagoLive.id).select("*").single();
    if (updateError2) throw updateError2;
    if (input.mainCustomerId) {
      await markMainCustomerVerified(mainDb, {
        userId: input.userId,
        customerId: Number(input.mainCustomerId),
        name: input.pagoLive.nombre_detectado,
        phone: input.pagoLive.phone,
        source: "live"
      });
    }
    return data2;
  }
  const { data, error: updateError } = await panelDb.from("pagos_venta_live").update({
    estado: "revision_manual",
    match_score: 0.5,
    match_reason: "monto_hora_nombre_no_coincide"
  }).eq("id", input.pagoLive.id).select("*").single();
  if (updateError) throw updateError;
  return data;
}
async function upsertWhatsappLivePayment(panelDb, input) {
  const monto = parseLiveMonto(input.monto);
  const nombre = input.nombreDetectado ? canonicalName(input.nombreDetectado) : null;
  const basePayload = {
    pedido_live_id: input.pedidoLiveId,
    cliente_id: input.clienteId,
    phone: input.phone,
    fecha_pedido: input.fechaPedido,
    nombre_detectado: nombre,
    nombre_canonico: nombre,
    monto,
    comprobante_hora: input.comprobanteHora ?? null,
    comprobante_at: input.comprobanteAt ?? null,
    comprobante_texto: input.comprobanteTexto ?? null,
    comprobante_media_url: input.comprobanteMediaUrl ?? null,
    panel_mensaje_id: input.panelMensajeId ?? null,
    estado: nombre && monto ? "pendiente_whatsapp" : "revision_manual",
    is_test: input.isTest ?? false
  };
  let existing = null;
  if (input.panelMensajeId) {
    const { data: data2, error: error2 } = await panelDb.from("pagos_venta_live").select("*").eq("panel_mensaje_id", input.panelMensajeId).limit(1).maybeSingle();
    if (error2) throw error2;
    existing = data2;
  }
  if (!existing && !input.panelMensajeId && input.comprobanteMediaUrl) {
    const { data: data2, error: error2 } = await panelDb.from("pagos_venta_live").select("*").eq("comprobante_media_url", input.comprobanteMediaUrl).limit(1).maybeSingle();
    if (error2) throw error2;
    existing = data2;
  }
  let duplicateOf = null;
  if (!existing && nombre && monto && input.comprobanteAt) {
    const from = new Date(new Date(input.comprobanteAt).getTime() - 5 * 60 * 1e3).toISOString();
    const to = new Date(new Date(input.comprobanteAt).getTime() + 5 * 60 * 1e3).toISOString();
    const { data: dupes, error: error2 } = await panelDb.from("pagos_venta_live").select("*").eq("pedido_live_id", input.pedidoLiveId).gte("comprobante_at", from).lte("comprobante_at", to).neq("estado", "rechazado").order("created_at", { ascending: true }).limit(20);
    if (error2) throw error2;
    const dupe = (dupes ?? []).find(
      (p) => parseLiveMonto(p.monto) === monto && namesMatch(p.nombre_canonico, nombre)
    );
    const esMensajeDiferente = input.panelMensajeId && dupe?.panel_mensaje_id && input.panelMensajeId !== dupe.panel_mensaje_id;
    if (dupe && !esMensajeDiferente && dupe.estado === "pendiente_whatsapp") {
      existing = dupe;
    }
  }
  const payload = {
    ...basePayload,
    estado: duplicateOf ? "posible_duplicado" : basePayload.estado,
    duplicate_of: duplicateOf
  };
  if (existing) {
    const keepVerified = ["verificado_macrodroid", "verificado_manual"].includes(String(existing.estado));
    const { data: data2, error: error2 } = await panelDb.from("pagos_venta_live").update({
      ...payload,
      estado: keepVerified ? existing.estado : payload.estado,
      main_pago_id: existing.main_pago_id
    }).eq("id", existing.id).select("*").single();
    if (error2) throw error2;
    return data2;
  }
  const { data, error } = await panelDb.from("pagos_venta_live").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

// src/routes/ai-gateway.ts
function createAiRouter(supabase, supabasePanel2) {
  const router = Router();
  const adminSupabase = (() => {
    const url4 = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url4 || !key) return null;
    return createClient4(url4, key, { auth: { persistSession: false, autoRefreshToken: false } });
  })();
  const storeSupabase = (() => {
    const url4 = process.env.VITE_STORE_SUPABASE_URL;
    const key = process.env.STORE_SUPABASE_SERVICE_ROLE_KEY;
    if (!url4 || !key) return null;
    return createClient4(url4, key, { auth: { persistSession: false, autoRefreshToken: false } });
  })();
  const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini";
  function extractProviderError(raw) {
    const text = raw?.trim();
    if (!text) return "";
    try {
      const parsed = JSON.parse(text);
      const message = parsed?.error?.message ?? parsed?.message ?? parsed?.error;
      if (message) return String(message).replace(/\s+/g, " ").slice(0, 350);
    } catch {
    }
    return text.replace(/\s+/g, " ").slice(0, 350);
  }
  function formatCaughtAiError(err, provider, timeoutMs) {
    const name = String(err?.name ?? "");
    const message = String(err?.message ?? err ?? "Error desconocido");
    const lower = `${name} ${message}`.toLowerCase();
    if (lower.includes("timeout") || lower.includes("abort")) {
      return `${provider} timeout (${Math.round(timeoutMs / 1e3)}s)`;
    }
    return `${provider}: ${message}`;
  }
  function maskKey(k) {
    return k ? `\u2022\u2022\u2022\u2022${k.slice(-4)}` : "";
  }
  function isOpenRouterKey(k) {
    const value = k?.trim() ?? "";
    return value.length > 20 && !value.startsWith("AIza");
  }
  function normalizeOpenRouterModel(raw) {
    const value = String(raw ?? "").trim();
    if (!value || !value.includes("/")) return DEFAULT_OPENROUTER_MODEL;
    return value;
  }
  function extractFirstBalancedJson(text) {
    const cleaned = String(text ?? "").trim().replace(/```json|```/g, "");
    const starts = [];
    const objStart = cleaned.indexOf("{");
    const arrStart = cleaned.indexOf("[");
    if (objStart >= 0) starts.push(objStart);
    if (arrStart >= 0) starts.push(arrStart);
    starts.sort((a, b) => a - b);
    for (const start of starts) {
      const open = cleaned[start];
      const close = open === "{" ? "}" : "]";
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === "\\") {
            escaped = true;
            continue;
          }
          if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === open) {
          depth += 1;
          continue;
        }
        if (ch === close) {
          depth -= 1;
          if (depth === 0) return cleaned.slice(start, i + 1);
        }
      }
    }
    return null;
  }
  async function getOpenRouterKey(userId) {
    const envKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
    try {
      if (userId) {
        const { data } = await supabase.from("ai_config").select("primary_key_encrypted").eq("user_id", userId).single();
        const dbKey = data?.primary_key_encrypted?.trim();
        if (isOpenRouterKey(dbKey)) return { key: dbKey, source: "db" };
      }
    } catch {
    }
    return isOpenRouterKey(envKey) ? { key: envKey, source: "env" } : null;
  }
  const DEFAULT_COMPROBANTE_PROMPT = `Eres un extractor de comprobantes de pago bolivianos. Analiza la imagen y extrae 3 datos: qui\xE9n pag\xF3, cu\xE1nto y a qu\xE9 hora.

La due\xF1a del negocio es: {{OWNER_NAME}}
Ella SIEMPRE recibe el dinero. Nunca lo env\xEDa.

Tu tarea: identificar al CLIENTE que envi\xF3 el dinero, el MONTO y la HORA.

REGLA \xDANICA E IRROMPIBLE \u2014 El cliente debe ser una persona real:
Escribe null para "cliente" si ves cualquiera de estas situaciones:
- El texto es un tipo de cuenta: "Caja de Ahorros", "Cuenta Corriente", "Cuenta Vista"
- El texto es nombre de banco o app: BANCO, COOPERATIVA, YAPE, TIGO, QR, BILLETERA, DEPOSITO
- El texto es un n\xFAmero de tel\xE9fono (ej: 79123456)
- El texto es un email (contiene @)
- El pagador es EXACTAMENTE "{{OWNER_NAME}}" con las 4 palabras completas \u2192 eso ser\xEDa transferencia propia, desc\xE1rtalo
  ATENCI\xD3N: si faltan palabras del nombre (ej: "LEIDY DIAZ SANCHEZ" sin CANDY, o "CANDY DIAZ SANCHEZ" sin LEIDY) \u2192 NO es la due\xF1a, es un cliente v\xE1lido, extr\xE1elo normalmente
- El nombre no aparece en el comprobante

Un nombre v\xE1lido tiene nombre + apellido: "JUAN MAMANI", "ANA GARCIA", "M. RODRIGUEZ".
Extrae el nombre exactamente como aparece, en MAY\xDASCULAS.
El monto es solo el n\xFAmero, sin Bs ni BOB.
La hora en formato HH:MM (24h).

Responde \xDANICAMENTE con este JSON (sin texto adicional, sin markdown):
{"cliente": "NOMBRE EN MAY\xDASCULAS o null", "monto": n\xFAmero_o_null, "hora": "HH:MM o null"}`;
  async function getComprobanteMode(userId) {
    try {
      const { data } = await supabase.from("ai_prompts").select("prompt_text").eq("user_id", userId).eq("prompt_key", "comprobante_mode").single();
      if (data?.prompt_text === "completo") return "completo";
    } catch {
    }
    return "simple";
  }
  async function getPrompt(userId, promptKey) {
    if (promptKey === "comprobante_extraction") {
      const mode = await getComprobanteMode(userId);
      if (mode === "completo") {
        const ownerName = await getOwnerName2(userId);
        return buildReceiptQrPrompt(ownerName);
      }
      return DEFAULT_COMPROBANTE_PROMPT;
    }
    try {
      const { data } = await supabase.from("ai_prompts").select("prompt_text").eq("user_id", userId).eq("prompt_key", promptKey).single();
      if (data?.prompt_text) return data.prompt_text;
    } catch {
    }
    return "";
  }
  function normalizeComprobanteResponse(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.es_comprobante === false) return null;
    if (raw.es_transferencia_propia === true) return null;
    const cliente = raw.cliente ?? raw.pagador ?? null;
    const monto = raw.monto != null ? String(raw.monto) : null;
    const hora = raw.hora ?? null;
    return { cliente, monto: monto || null, hora };
  }
  function normalizePanelPhoneForLiveSales(raw) {
    return normalizeLivePhone(raw);
  }
  function configuredLiveSalesTestPhones() {
    const raw = process.env.LIVE_SALES_TEST_PHONES || process.env.LIVE_SALES_TEST_PHONE || "";
    return new Set(
      raw.split(",").map((phone) => normalizePanelPhoneForLiveSales(phone)).filter(Boolean)
    );
  }
  function isLiveSalesTestPhone(phone) {
    const normalized = normalizePanelPhoneForLiveSales(phone);
    if (!normalized) return false;
    const allowed = configuredLiveSalesTestPhones();
    return allowed.size > 0 && allowed.has(normalized);
  }
  function parseComprobanteMonto(raw) {
    return parseLiveMonto(raw);
  }
  function parseReceiptTextFallback(raw) {
    if (!raw) return { nombre: null, monto: null };
    const text = raw.replace(/\s+/g, " ").trim();
    const amountMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:bs|bob|bolivianos)?/i);
    const monto = amountMatch ? parseComprobanteMonto(amountMatch[1]) : null;
    let nombre = null;
    if (amountMatch?.index != null && amountMatch.index > 0) {
      const beforeAmount = text.slice(0, amountMatch.index).replace(/^comprobante\s*[:\-]\s*/i, "").trim();
      const pieces = beforeAmount.split(/\s+-\s+|:/).map((p) => p.trim()).filter(Boolean);
      const candidate = pieces[pieces.length - 1] ?? beforeAmount;
      const normalized = candidate.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z\u00D1.\s]/g, "").replace(/\s+/g, " ").trim();
      const words = normalized.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && !/\b(BANCO|YAPE|QR|CUENTA|DEPOSITO|TRANSFERENCIA)\b/.test(normalized)) {
        nombre = normalized;
      }
    }
    return { nombre, monto };
  }
  async function getOwnerName2(userId) {
    const DEFAULT = "LEIDY CANDY DIAZ SANCHEZ";
    try {
      const { data } = await supabase.from("ai_config").select("owner_name").eq("user_id", userId).single();
      return data?.owner_name?.trim() || DEFAULT;
    } catch {
      return DEFAULT;
    }
  }
  async function getAiFeatureConfig(userId, feature) {
    const defaults = defaultAiFeatures();
    try {
      const { data } = await supabase.from("ai_config").select("features").eq("user_id", userId).single();
      if (data?.features?.[feature]) {
        return {
          enabled: data.features[feature].enabled !== false,
          model: normalizeOpenRouterModel(data.features[feature].model)
        };
      }
    } catch {
    }
    if (defaults[feature]) {
      return {
        enabled: defaults[feature].enabled,
        model: normalizeOpenRouterModel(defaults[feature].model)
      };
    }
    return { enabled: true, model: DEFAULT_OPENROUTER_MODEL };
  }
  function defaultAiFeatures() {
    return {
      product_vision: { enabled: true, model: DEFAULT_OPENROUTER_MODEL },
      photo_selection: { enabled: false, model: DEFAULT_OPENROUTER_MODEL },
      notif_parser: { enabled: true, model: DEFAULT_OPENROUTER_MODEL }
    };
  }
  function normalizeAiFeatures(raw) {
    const defaults = defaultAiFeatures();
    for (const key of Object.keys(defaults)) {
      if (raw?.[key]) {
        defaults[key] = {
          enabled: raw[key].enabled !== false,
          model: normalizeOpenRouterModel(raw[key].model)
        };
      }
    }
    return defaults;
  }
  async function logAiUsage(entry) {
    try {
      await supabase.from("ai_usage_log").insert({
        user_id: entry.userId,
        feature: entry.feature,
        model: entry.model,
        input_tokens: entry.inputTokens ?? 0,
        output_tokens: entry.outputTokens ?? 0,
        latency_ms: entry.latencyMs,
        success: entry.success,
        error_message: entry.errorMessage ?? null,
        metadata: entry.metadata ?? null
      });
    } catch (e) {
      console.error("[ai-gateway] Error guardando log:", e?.message);
    }
  }
  async function callAi(params) {
    const config = await getAiFeatureConfig(params.userId, params.feature);
    if (!config.enabled) return null;
    const keyConfig = await getOpenRouterKey(params.userId);
    const model = normalizeOpenRouterModel(config.model);
    if (!keyConfig) {
      const msg = "OpenRouter no configurado: falta OPENROUTER_API_KEY o una key valida en Configuracion > IA";
      await logAiUsage({ userId: params.userId, feature: params.feature, model: `openrouter:${model}`, latencyMs: 0, success: false, errorMessage: msg });
      throw new Error(msg);
    }
    const start = Date.now();
    try {
      const content = [{ type: "text", text: params.prompt }];
      for (const part of params.imageParts ?? []) {
        if (!part.inlineData.mimeType.startsWith("image/")) {
          throw new Error(`OpenRouter no soporta ${part.inlineData.mimeType} en este endpoint`);
        }
        content.push({
          type: "image_url",
          image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }
        });
      }
      const body = {
        model,
        messages: [{ role: "user", content: content.length === 1 ? params.prompt : content }],
        temperature: params.temperature ?? 0.2,
        max_tokens: params.maxTokens ?? 400
      };
      if (params.jsonMode) body.response_format = { type: "json_object" };
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keyConfig.key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_URL || "https://ventas-live.vercel.app",
          "X-Title": "Ventas Live"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15e3)
      });
      const latencyMs = Date.now() - start;
      if (!resp.ok) {
        const errText = await resp.text();
        const details = extractProviderError(errText);
        const msg = `OpenRouter HTTP ${resp.status}${details ? `: ${details}` : ""}`;
        console.error(`[openrouter] ${msg}`);
        await logAiUsage({
          userId: params.userId,
          feature: params.feature,
          model: `openrouter:${model}`,
          latencyMs,
          success: false,
          errorMessage: msg
        });
        throw new Error(msg);
      }
      const data = await resp.json();
      const contentResp = data.choices?.[0]?.message?.content;
      const textResp = Array.isArray(contentResp) ? contentResp.map((item) => item?.text ?? "").join("").trim() : String(contentResp ?? "").trim();
      await logAiUsage({
        userId: params.userId,
        feature: params.feature,
        model: `openrouter:${model}`,
        latencyMs,
        success: !!textResp,
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        errorMessage: textResp ? null : "Respuesta vacia"
      });
      if (!textResp) throw new Error("OpenRouter sin texto en la respuesta");
      return { text: textResp, model: `openrouter:${model}`, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const msg = formatCaughtAiError(err, "OpenRouter", 15e3);
      await logAiUsage({
        userId: params.userId,
        feature: params.feature,
        model: `openrouter:${model}`,
        latencyMs,
        success: false,
        errorMessage: msg
      });
      throw new Error(msg);
    }
  }
  function dataUriToImagePart(dataUri) {
    const m = dataUri.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return null;
    return { inlineData: { mimeType: m[1], data: m[2] } };
  }
  function normalizeName2(name) {
    return name.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z\s]/g, "").replace(/\s+/g, " ").trim();
  }
  function enrichReceiptData(parsed, ownerName) {
    const ownerWords = normalizeName2(ownerName).split(" ").filter(Boolean);
    const pagadorWords = parsed.pagador ? normalizeName2(parsed.pagador).split(" ").filter(Boolean) : [];
    const matchingWords = ownerWords.filter((w) => pagadorWords.includes(w)).length;
    const wordOverlap2 = ownerWords.length > 0 ? matchingWords / ownerWords.length : 0;
    const isSelfTransfer = wordOverlap2 >= 0.75;
    return { ...parsed, es_transferencia_propia: isSelfTransfer || !!parsed.es_transferencia_propia };
  }
  router.post("/product-from-images", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ ok: false, error: "Autenticaci\xF3n requerida" });
      const { imageUrls, categories } = req.body;
      if (!imageUrls?.length) return res.status(400).json({ ok: false, error: "imageUrls requerido" });
      const imageParts = [];
      for (const url4 of imageUrls.slice(0, 3)) {
        try {
          const r = await fetch(url4);
          if (!r.ok) continue;
          const buf = await r.arrayBuffer();
          imageParts.push({ inlineData: { mimeType: r.headers.get("content-type") || "image/jpeg", data: Buffer.from(buf).toString("base64") } });
        } catch {
        }
      }
      if (imageParts.length === 0) return res.status(422).json({ ok: false, error: "No se pudieron cargar las im\xE1genes" });
      const categoryOptions = Array.isArray(categories) && categories.length > 0 ? categories.map((c) => String(c).trim()).filter(Boolean).slice(0, 12) : void 0;
      const result = await callAi({ userId, feature: "product_vision", prompt: buildProductCatalogPrompt(categoryOptions), imageParts, maxTokens: 400, temperature: 0.2, jsonMode: true });
      if (!result?.text) return res.status(422).json({ ok: false, error: "Sin respuesta de la IA" });
      const jsonText = extractFirstBalancedJson(String(result.text ?? ""));
      if (!jsonText) {
        return res.status(422).json({ ok: false, error: "Respuesta no parseable" });
      }
      try {
        const parsed = JSON.parse(jsonText);
        res.json({ ok: true, data: parsed });
      } catch (parseErr) {
        return res.status(422).json({ ok: false, error: parseErr?.message || "Respuesta no parseable" });
      }
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });
  router.post("/analyze-image", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ ok: false, error: "x-user-id requerido" });
      const { imageUrls } = req.body;
      if (!imageUrls?.length) return res.status(400).json({ ok: false, error: "imageUrls requerido" });
      const imageParts = (await Promise.all(imageUrls.map(async (url4) => {
        try {
          const r = await fetch(url4, { signal: AbortSignal.timeout(8e3) });
          if (!r.ok) return null;
          const buf = await r.arrayBuffer();
          return { inlineData: { mimeType: r.headers.get("content-type") || "image/jpeg", data: Buffer.from(buf).toString("base64") } };
        } catch {
          return null;
        }
      }))).filter(Boolean);
      if (imageParts.length === 0) return res.status(422).json({ ok: false, error: "No se pudieron cargar las im\xE1genes" });
      const result = await callAi({ userId, feature: "product_vision", prompt: buildImageClassifierPrompt(), imageParts, maxTokens: 300, temperature: 0, jsonMode: true });
      if (!result?.text) return res.status(422).json({ ok: false, error: "Sin respuesta" });
      const m = result.text.match(/\{[\s\S]*\}/);
      if (!m) return res.status(422).json({ ok: false, error: "JSON inv\xE1lido" });
      res.json({ ok: true, data: JSON.parse(m[0]) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });
  router.post("/analyze-qr", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ ok: false, error: "x-user-id requerido" });
      const { imageUrl, waNumber } = req.body;
      if (!imageUrl) return res.status(400).json({ ok: false, error: "imageUrl requerido" });
      let imagePart;
      try {
        const r = await fetch(imageUrl, { signal: AbortSignal.timeout(8e3) });
        if (!r.ok) return res.status(422).json({ ok: false, error: "No se pudo cargar la imagen" });
        const buf = await r.arrayBuffer();
        imagePart = { inlineData: { mimeType: r.headers.get("content-type") || "image/jpeg", data: Buffer.from(buf).toString("base64") } };
      } catch {
        return res.status(422).json({ ok: false, error: "Error descargando imagen" });
      }
      const ownerName = await getOwnerName2(userId);
      const result = await callAi({ userId, feature: "product_vision", prompt: buildReceiptQrPrompt(ownerName), imageParts: [imagePart], maxTokens: 300, temperature: 0, jsonMode: true });
      if (!result?.text) return res.status(422).json({ ok: false, error: "Sin respuesta de la IA" });
      const m = result.text.match(/\{[\s\S]*\}/);
      if (!m) return res.status(422).json({ ok: false, error: "JSON inv\xE1lido" });
      const parsed = enrichReceiptData(JSON.parse(m[0]), ownerName);
      if (parsed.es_comprobante && parsed.pagador && waNumber) {
        const canonical = parsed.pagador.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z\s]/g, "").trim();
        try {
          await supabase.rpc("fn_link_customer_wa", { p_canonical_name: canonical, p_wa_number: String(waNumber).replace(/\D/g, ""), p_user_id: userId });
        } catch (e) {
          console.error("[link-wa]", e);
        }
      }
      res.json({ ok: true, data: parsed });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });
  router.post("/analyze-qr-base64", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ ok: false, error: "x-user-id requerido" });
      const imagePart = dataUriToImagePart(req.body.imageData ?? "");
      if (!imagePart) return res.status(400).json({ ok: false, error: "imageData inv\xE1lido" });
      const ownerName = await getOwnerName2(userId);
      const result = await callAi({ userId, feature: "product_vision", prompt: buildReceiptQrPrompt(ownerName), imageParts: [imagePart], maxTokens: 300, temperature: 0, jsonMode: true });
      if (!result?.text) return res.status(422).json({ ok: false, error: "Sin respuesta" });
      const m = result.text.match(/\{[\s\S]*\}/);
      if (!m) return res.status(422).json({ ok: false, error: "JSON inv\xE1lido" });
      res.json({ ok: true, data: enrichReceiptData(JSON.parse(m[0]), ownerName) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });
  router.post("/analyze-image-base64", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ ok: false, error: "x-user-id requerido" });
      const imagePart = dataUriToImagePart(req.body.imageData ?? "");
      if (!imagePart) return res.status(400).json({ ok: false, error: "imageData inv\xE1lido" });
      const result = await callAi({ userId, feature: "product_vision", prompt: buildImageClassifierPrompt(), imageParts: [imagePart], maxTokens: 150, temperature: 0, jsonMode: true });
      if (!result?.text) return res.status(422).json({ ok: false, error: "Sin respuesta" });
      const m = result.text.match(/\{[\s\S]*\}/);
      if (!m) return res.status(422).json({ ok: false, error: "JSON inv\xE1lido" });
      res.json({ ok: true, data: JSON.parse(m[0]) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });
  router.get("/prompts", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const { data } = await supabase.from("ai_prompts").select("prompt_key, prompt_text, updated_at").eq("user_id", userId);
      const prompts = {};
      for (const row of data ?? []) {
        prompts[row.prompt_key] = { text: row.prompt_text, updated_at: row.updated_at };
      }
      if (!prompts["comprobante_extraction"]) {
        prompts["comprobante_extraction"] = { text: DEFAULT_COMPROBANTE_PROMPT, updated_at: "" };
      }
      if (!prompts["comprobante_mode"]) {
        prompts["comprobante_mode"] = { text: "simple", updated_at: "" };
      }
      res.json({ ok: true, prompts });
    } catch (err) {
      res.status(500).json({ error: err?.message });
    }
  });
  router.patch("/prompts/:key", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const { key } = req.params;
      const { text } = req.body;
      if (typeof text !== "string") return res.status(400).json({ error: "text requerido" });
      const { error } = await supabase.from("ai_prompts").upsert({
        user_id: userId,
        prompt_key: key,
        prompt_text: text,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }, { onConflict: "user_id,prompt_key" });
      if (error) throw error;
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err?.message });
    }
  });
  router.get("/config", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const { data, error } = await supabase.from("ai_config").select("*").eq("user_id", userId).single();
      const envKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
      const envActive = isOpenRouterKey(envKey);
      if (error || !data) {
        return res.json({
          provider: "openrouter",
          openrouter: {
            masked: envActive ? maskKey(envKey) : "",
            active: envActive,
            model: DEFAULT_OPENROUTER_MODEL,
            active_model: DEFAULT_OPENROUTER_MODEL,
            source: envActive ? "env" : "none"
          },
          keys: [{ slot: 1, masked: envActive ? maskKey(envKey) : "", active: envActive }],
          primary_key: envActive ? maskKey(envKey) : "",
          has_primary: envActive,
          fallback_key: "",
          has_fallback: false,
          owner_name: "",
          features: defaultAiFeatures(),
          daily_limit: 0,
          source: envActive ? "env" : "none"
        });
      }
      const dbKey = data.primary_key_encrypted?.trim();
      const dbActive = isOpenRouterKey(dbKey);
      const activeKey = dbActive ? dbKey : envActive ? envKey : "";
      const keySource = dbActive ? "db" : envActive ? "env" : "none";
      const features = normalizeAiFeatures(data.features);
      const model = normalizeOpenRouterModel(Object.values(features)[0]?.model);
      res.json({
        provider: "openrouter",
        openrouter: {
          masked: activeKey ? maskKey(activeKey) : "",
          active: !!activeKey,
          model,
          active_model: DEFAULT_OPENROUTER_MODEL,
          source: keySource
        },
        keys: [{ slot: 1, masked: activeKey ? maskKey(activeKey) : "", active: !!activeKey }],
        primary_key: activeKey ? maskKey(activeKey) : "",
        has_primary: !!activeKey,
        fallback_key: "",
        has_fallback: false,
        owner_name: data.owner_name ?? "",
        features,
        daily_limit: 0,
        source: keySource
      });
    } catch (err) {
      res.status(500).json({ error: err?.message });
    }
  });
  router.post("/config", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const { keys, primaryKey, openRouterKey, openRouterModel, features, ownerName } = req.body;
      const upsertData = { user_id: userId, updated_at: /* @__PURE__ */ new Date() };
      const keyCandidate = openRouterKey ?? primaryKey ?? (Array.isArray(keys) ? keys[0] : void 0);
      if (keyCandidate !== void 0) {
        const keyValue = String(keyCandidate ?? "").trim();
        if (keyValue && !isOpenRouterKey(keyValue)) return res.status(400).json({ error: "La key no parece ser de OpenRouter" });
        upsertData.primary_key_encrypted = keyValue || null;
        upsertData.fallback_key_encrypted = null;
        upsertData.fallback2_key_encrypted = null;
        upsertData.key3_encrypted = null;
        upsertData.key4_encrypted = null;
        upsertData.key5_encrypted = null;
      }
      if (features || openRouterModel) {
        const normalized = normalizeAiFeatures(features);
        if (openRouterModel) {
          const model = normalizeOpenRouterModel(openRouterModel);
          for (const key of Object.keys(normalized)) normalized[key].model = model;
        }
        upsertData.features = normalized;
      }
      if (ownerName !== void 0) upsertData.owner_name = ownerName || null;
      let result = await supabase.from("ai_config").upsert(upsertData, { onConflict: "user_id" }).select().single();
      if (result.error && /row-level security/i.test(result.error.message) && adminSupabase) {
        result = await adminSupabase.from("ai_config").upsert(upsertData, { onConflict: "user_id" }).select().single();
      }
      if (result.error) throw result.error;
      const data = result.data;
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ error: err?.message });
    }
  });
  router.post("/test-key", async (req, res) => {
    try {
      const { apiKey, model: rawModel } = req.body;
      if (!apiKey) return res.status(400).json({ error: "apiKey requerida" });
      if (!isOpenRouterKey(apiKey)) return res.status(400).json({ error: "La key no parece ser de OpenRouter" });
      const start = Date.now();
      const model = normalizeOpenRouterModel(rawModel);
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${String(apiKey).trim()}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_URL || "https://ventas-live.vercel.app",
          "X-Title": "Ventas Live"
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Responde solo: OK" }],
          max_tokens: 5,
          temperature: 0
        }),
        signal: AbortSignal.timeout(15e3)
      });
      const latency = Date.now() - start;
      if (resp.ok) {
        res.json({ ok: true, latency, message: `Key OpenRouter valida (${latency}ms)` });
      } else {
        const errText = await resp.text().catch(() => "");
        res.json({ ok: false, latency, message: extractProviderError(errText) || `HTTP ${resp.status}` });
      }
    } catch (err) {
      res.json({ ok: false, message: err?.message ?? "Error de conexion" });
    }
  });
  router.get("/usage", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const days = Number(req.query.days) || 7;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1e3).toISOString();
      const { data, error } = await supabase.from("ai_usage_log").select("feature, model, success, latency_ms, created_at, error_message, input_tokens, output_tokens").eq("user_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(200);
      if (error) return res.json({ total: 0, today: 0, errors: 0, byFeature: {}, log: [] });
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const todayCount = (data ?? []).filter((r) => r.created_at?.startsWith(today)).length;
      const errors = (data ?? []).filter((r) => !r.success).length;
      const byFeature = {};
      for (const r of data ?? []) {
        byFeature[r.feature] = (byFeature[r.feature] || 0) + 1;
      }
      res.json({ total: data?.length ?? 0, today: todayCount, errors, byFeature, log: (data ?? []).slice(0, 50) });
    } catch {
      res.json({ total: 0, today: 0, errors: 0, byFeature: {}, log: [] });
    }
  });
  router.post("/summarize-conversation", async (req, res) => {
    return res.status(410).json({ error: "Funci\xF3n desactivada" });
    try {
      let phoneDigits2 = function(value) {
        return String(value ?? "").replace(/\D/g, "");
      }, phoneVariants2 = function(value) {
        const digits = phoneDigits2(value);
        const variants = /* @__PURE__ */ new Set();
        if (!digits) return [];
        variants.add(digits);
        variants.add(`+${digits}`);
        if (digits.startsWith("591")) variants.add(digits.slice(3));
        else variants.add(`591${digits}`);
        return [...variants].filter(Boolean);
      }, extractStoreRefs = function(text) {
        const value = String(text ?? "");
        return [...value.matchAll(/#(\d{1,8})/g)].map((match) => Number(match[1])).filter(Number.isFinite);
      }, extractPanelMessageIds = function(text) {
        const value = String(text ?? "");
        return [...value.matchAll(/panel_message_id=([^\s]+)/g)].map((match) => match[1]).filter(Boolean);
      }, extractMediaUrls = function(text) {
        const value = String(text ?? "");
        return [...value.matchAll(/media=(https?:\/\/[^\s]+)/g)].map((match) => match[1]).filter(Boolean);
      }, isValidStoreProofSummary = function(text) {
        const value = String(text ?? "");
        if (!value.includes("media=")) return false;
        if (/proof_amount_mismatch=/i.test(value)) return false;
        const receiptMatch = value.match(/receipt=(\{[^\n]+\})/);
        if (!receiptMatch) return false;
        try {
          const receipt = JSON.parse(receiptMatch[1]);
          const amount = Number(String(receipt?.monto ?? "").replace(",", "."));
          const name = String(receipt?.cliente ?? "").trim().toLowerCase();
          return Number.isFinite(amount) && amount > 0 && name !== "" && name !== "null";
        } catch {
          return false;
        }
      }, normalizeTrafficDirection = function(direction) {
        const value = String(direction ?? "").trim().toLowerCase();
        if (!value) return "unknown";
        if (["out", "outgoing", "sent", "saliente", "company", "empresa"].includes(value)) return "outgoing";
        if (["in", "incoming", "received", "entrante", "entrada", "customer", "cliente"].includes(value)) return "incoming";
        if (value.startsWith("out")) return "outgoing";
        if (value.startsWith("in")) return "incoming";
        return "unknown";
      }, isOutgoingDirection = function(direction) {
        return normalizeTrafficDirection(direction) === "outgoing";
      }, isLateLiveProof = function(itemCreatedAt) {
        if (!hasLiveRange || !itemCreatedAt || !liveQueryEnd) return false;
        const time = new Date(itemCreatedAt).getTime();
        return Number.isFinite(time) && time > rangeEnd.getTime() && time <= liveQueryEnd.getTime();
      }, registrarComprobanteDetectado = function(item, texto, extraido) {
        comprobanteDetectado = true;
        comprobanteMediaUrl = comprobanteMediaUrl ?? item.url;
        comprobanteTexto = comprobanteTexto ?? texto;
        if (extraido && !comprobanteExtraido) {
          comprobanteExtraido = extraido;
          const datos = [
            extraido.cliente,
            extraido.monto ? `${extraido.monto} Bs` : null,
            extraido.hora
          ].filter(Boolean).join(" - ");
          comprobanteTexto = datos || comprobanteTexto;
        }
        const alreadyAdded = item.id ? comprobantesDetectados.some((existing) => existing.item.id === item.id) : comprobantesDetectados.some((existing) => existing.item.url === item.url);
        if (!alreadyAdded) comprobantesDetectados.push({ item, texto, extraido });
      }, ensureAllLiveImagesAreVisibleAsCandidates = function() {
        const knownIds = new Set(prendasDetectadas.map((p) => p.item.id ?? p.item.url));
        for (const item of fotoItems) {
          const key = item.id ?? item.url;
          if (knownIds.has(key)) continue;
          const cached = analisisFotos.get(key);
          if (cached?.tipo === "comprobante") continue;
          prendasDetectadas.push({
            item,
            descripcion: cached?.desc?.replace(/^PRENDA:\s*/i, "").trim() || "Imagen de prenda enviada durante el Live."
          });
          knownIds.add(key);
        }
      };
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const { clienteId, startAt, endAt, skipPayments } = req.body;
      if (!clienteId) return res.status(400).json({ error: "clienteId requerido" });
      const skipPaymentCreation = skipPayments === true || skipPayments === "true";
      const rangeStart = startAt ? new Date(startAt) : null;
      const rangeEnd = endAt ? new Date(endAt) : null;
      const hasLiveRange = Boolean(
        rangeStart && rangeEnd && Number.isFinite(rangeStart.getTime()) && Number.isFinite(rangeEnd.getTime()) && rangeEnd > rangeStart
      );
      if ((startAt || endAt) && !hasLiveRange) {
        return res.status(400).json({ error: "Rango de Live invalido" });
      }
      const LIVE_LATE_PROOF_GRACE_MINUTES = 0;
      const liveQueryEnd = hasLiveRange ? new Date(rangeEnd.getTime() + LIVE_LATE_PROOF_GRACE_MINUTES * 60 * 1e3) : rangeEnd;
      const panelDb = supabasePanel2 ?? supabase;
      const { data: clienteData } = await panelDb.from("panel_clientes").select("phone").eq("id", clienteId).single();
      const panelPhone = clienteData?.phone ?? null;
      let mensajesQuery = panelDb.from("panel_mensajes").select("id, content, media_url, media_type, has_media, direction, created_at").eq("cliente_id", clienteId).order("created_at", { ascending: true });
      if (hasLiveRange) {
        mensajesQuery = mensajesQuery.gte("created_at", rangeStart.toISOString()).lte("created_at", liveQueryEnd.toISOString());
      }
      const { data: mensajes, error: dbErr } = await mensajesQuery;
      if (dbErr) return res.status(500).json({ error: dbErr.message });
      if (!mensajes?.length) return res.status(404).json({ error: hasLiveRange ? "Sin mensajes en esta sesion Live" : "Sin mensajes" });
      const hadMessageInsideLiveRange = hasLiveRange ? mensajes.some((m) => {
        const time = m.created_at ? new Date(m.created_at).getTime() : NaN;
        return Number.isFinite(time) && time >= rangeStart.getTime() && time <= rangeEnd.getTime();
      }) : true;
      if (hasLiveRange && !hadMessageInsideLiveRange) {
        return res.json({ ok: true, skipped: true, reason: "sin_participacion_en_live" });
      }
      let mensajesLive = mensajes;
      if (storeSupabase) {
        try {
          const refs = [...new Set(mensajes.flatMap((m) => extractStoreRefs(m.content)))];
          const validStoreRefs = /* @__PURE__ */ new Set();
          if (refs.length > 0) {
            const { data: storeOrders } = await storeSupabase.from("store_orders").select("id").in("id", refs);
            for (const order of storeOrders ?? []) validStoreRefs.add(Number(order.id));
          }
          const phones = phoneVariants2(panelPhone);
          const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3).toISOString();
          const storePanelMessageIds = /* @__PURE__ */ new Set();
          const storeMediaUrls = /* @__PURE__ */ new Set();
          if (phones.length > 0) {
            const { data: storeWaMessages } = await storeSupabase.from("wa_messages").select("summary,matched_order_id,order_ref").in("from_wa", phones).limit(200);
            for (const event of storeWaMessages ?? []) {
              const orderRef = Number(event.order_ref);
              const belongsToStoreOrder = Boolean(event.matched_order_id) || Number.isFinite(orderRef) && validStoreRefs.has(orderRef);
              if (!belongsToStoreOrder) continue;
              const hasMedia = String(event.summary ?? "").includes("media=");
              const validStoreProof = isValidStoreProofSummary(event.summary);
              if (!hasMedia || validStoreProof) {
                for (const id of extractPanelMessageIds(event.summary)) storePanelMessageIds.add(id);
              }
              if (validStoreProof) {
                for (const url4 of extractMediaUrls(event.summary)) storeMediaUrls.add(url4);
              }
            }
            const { data: storePaymentEvents } = await storeSupabase.from("payment_events").select("raw_text, created_at,matched_order_id").in("sender_wa", phones).gte("created_at", since).limit(200);
            for (const event of storePaymentEvents ?? []) {
              if (!event.matched_order_id) continue;
              const hasMedia = String(event.raw_text ?? "").includes("media=");
              const validStoreProof = isValidStoreProofSummary(event.raw_text);
              if (!hasMedia || validStoreProof) {
                for (const id of extractPanelMessageIds(event.raw_text)) storePanelMessageIds.add(id);
              }
              if (validStoreProof) {
                for (const url4 of extractMediaUrls(event.raw_text)) storeMediaUrls.add(url4);
              }
            }
          }
          mensajesLive = mensajes.filter((m) => {
            const id = String(m.id ?? "");
            const contentRefs = extractStoreRefs(m.content);
            if (contentRefs.some((ref) => validStoreRefs.has(ref))) return false;
            if (id && storePanelMessageIds.has(id)) return false;
            if (m.media_url && storeMediaUrls.has(m.media_url)) return false;
            return true;
          });
          if (mensajesLive.length !== mensajes.length) {
            console.log(`[summarize] ${mensajes.length - mensajesLive.length} mensaje(s) de tienda ignorados para Live`);
          }
        } catch (filterError) {
          console.warn("[summarize] filtro tienda/live no aplicado:", filterError?.message ?? filterError);
        }
      }
      if (!mensajesLive.length) {
        await panelDb.from("panel_clientes").update({ resumen_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", clienteId);
        return res.json({ ok: true, skipped: true, reason: "solo_mensajes_tienda" });
      }
      const textos = [];
      const fotoItems = [];
      const audioUrls = [];
      const aiErrors = /* @__PURE__ */ new Set();
      async function safeCallAi(params, label) {
        try {
          return await callAi(params);
        } catch (err) {
          const message = String(err?.message ?? err ?? "Error desconocido");
          aiErrors.add(`${label}: ${message}`);
          console.warn(`[summarize] ${label}: ${message}`);
          return null;
        }
      }
      for (const m of mensajesLive) {
        if (m.content?.trim()) textos.push(m.content.trim());
        if (m.media_url) {
          const mt = m.media_type || "";
          const isImage = mt.startsWith("image/") || /\.(jpg|jpeg|png|webp)/i.test(m.media_url);
          const isAudio = mt.startsWith("audio/") || mt.startsWith("video/") || /\.(ogg|mp3|mp4|m4a)/i.test(m.media_url);
          if (isImage) fotoItems.push({
            id: m.id ?? null,
            url: m.media_url,
            mediaType: mt || null,
            direction: m.direction ?? null,
            createdAt: m.created_at ?? null,
            content: m.content ?? null
          });
          else if (isAudio) audioUrls.push(m.media_url);
        }
      }
      const fotoUrls = fotoItems.map((item) => item.url);
      const allFotoItems = (mensajes ?? []).filter((m) => m.media_url).filter((m) => {
        const mt = m.media_type || "";
        return mt.startsWith("image/") || /\.(jpg|jpeg|png|webp)/i.test(m.media_url);
      }).map((m) => ({
        id: m.id ?? null,
        url: m.media_url,
        mediaType: m.media_type || null,
        direction: m.direction ?? null,
        createdAt: m.created_at ?? null,
        content: m.content ?? null
      }));
      const fotoUrlsRecientes = [...fotoItems].sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      }).map((item) => item.url);
      async function fetchBase64(url4) {
        try {
          const r = await fetch(url4, { signal: AbortSignal.timeout(1e4) });
          if (!r.ok) return null;
          const buf = await r.arrayBuffer();
          return { b64: Buffer.from(buf).toString("base64"), mime: r.headers.get("content-type") || "application/octet-stream" };
        } catch {
          return null;
        }
      }
      const ownerName = await getOwnerName2(userId);
      const rawComprobantePrompt = await getPrompt(userId, "comprobante_extraction");
      const comprobantePrompt = rawComprobantePrompt.replace(/\{\{OWNER_NAME\}\}/g, ownerName);
      const transcripciones = [];
      for (const url4 of audioUrls.slice(0, 3)) {
        const media = await fetchBase64(url4);
        if (!media) continue;
        const mime = url4.includes(".mp3") ? "audio/mpeg" : "audio/ogg";
        const result = await safeCallAi({
          userId,
          feature: "chat_summary",
          prompt: "Transcribe exactamente lo que dice este audio en espa\xF1ol. Solo el texto, sin explicaciones.",
          imageParts: [{ inlineData: { mimeType: mime, data: media.b64 } }],
          maxTokens: 300,
          temperature: 0
        }, "transcripcion de audio");
        if (result?.text) transcripciones.push(result.text.trim());
      }
      const descripciones = [];
      let comprobanteExtraido = null;
      let comprobanteDetectado = false;
      let comprobanteMediaUrl = null;
      let comprobanteTexto = null;
      const comprobantesDetectados = [];
      const prendasDetectadas = [];
      const analisisFotos = /* @__PURE__ */ new Map();
      const CLASIFICADOR_PROMPT = `Analiza esta imagen y responde con UNA SOLA l\xEDnea:
- Si es un COMPROBANTE de pago, transferencia o captura de QR bancario: escribe "COMPROBANTE: [nombre del pagador] - [monto] Bs - [banco o app]".
- Si es una PRENDA de ropa: escribe "PRENDA: [color, tipo, caracter\xEDsticas]". M\xE1ximo 15 palabras.
- Si es otra cosa: escribe "OTRO: [descripci\xF3n breve]".
Responde SOLO con una l\xEDnea, sin explicaciones.`;
      const receiptHintRegex = /\b(comprobante|pago|pagado|transferencia|qr|banco|importe|remitente|operaci[oó]n|transacci[oó]n|autorizaci[oó]n|bs\.?|bob)\b/i;
      async function extraerComprobanteDesdeImagen(imagePart, label) {
        const extractResult = await safeCallAi({
          userId,
          feature: "chat_summary",
          prompt: comprobantePrompt,
          imageParts: [imagePart],
          maxTokens: 250,
          temperature: 0,
          jsonMode: true
        }, label);
        if (!extractResult?.text) return null;
        const match = extractResult.text.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
          return normalizeComprobanteResponse(JSON.parse(match[0]));
        } catch {
          return null;
        }
      }
      async function clasificarYExtraer(item, options = {}) {
        const cacheKey = item.id ?? item.url;
        const cached = analisisFotos.get(cacheKey);
        if (cached) {
          if (cached.desc && options.addDescription !== false) descripciones.push(cached.desc);
          return cached.tipo;
        }
        const media = await fetchBase64(item.url);
        if (!media) return "sin_datos";
        const mime = media.mime || item.mediaType || (item.url.endsWith(".png") ? "image/png" : item.url.endsWith(".webp") ? "image/webp" : "image/jpeg");
        const imagePart = { inlineData: { mimeType: mime, data: media.b64 } };
        const outgoing = isOutgoingDirection(item.direction);
        const classificationPrompt = `${CLASIFICADOR_PROMPT}

CONTEXTO DEL REMITENTE:
${outgoing ? "- La imagen la envi\xF3 la EMPRESA al cliente. Nunca puede ser un comprobante de pago. Si parece ropa, cat\xE1logo o anuncio, clasif\xEDcala como PRENDA o OTRO." : "- La imagen la envi\xF3 el CLIENTE o no est\xE1 claro qui\xE9n la envi\xF3."}`;
        const classResult = await safeCallAi({
          userId,
          feature: "chat_summary",
          prompt: classificationPrompt,
          imageParts: [imagePart],
          maxTokens: 200,
          temperature: 0
        }, "clasificacion de imagen");
        const desc = classResult?.text?.trim() ?? "";
        if (desc && options.addDescription !== false) descripciones.push(desc);
        const upperDesc = desc.toUpperCase();
        const esComprobante = !outgoing && upperDesc.startsWith("COMPROBANTE");
        const esPrenda = upperDesc.startsWith("PRENDA");
        let extraido = null;
        if (esComprobante) {
          extraido = await extraerComprobanteDesdeImagen(imagePart, "extraccion de comprobante");
          registrarComprobanteDetectado(item, desc, extraido);
        } else if (esPrenda) {
          prendasDetectadas.push({ item, descripcion: desc.replace(/^PRENDA:\s*/i, "").trim() || desc });
        } else {
          if (!outgoing) {
            const fallbackExtraido = await extraerComprobanteDesdeImagen(imagePart, "extraccion de comprobante fallback live");
            if (fallbackExtraido?.cliente || fallbackExtraido?.monto) {
              extraido = fallbackExtraido;
              registrarComprobanteDetectado(item, desc || "COMPROBANTE: posible comprobante de pago", extraido);
            }
          }
        }
        const tipo = comprobantesDetectados.some(
          (existing) => item.id && existing.item.id === item.id || existing.item.url === item.url
        ) ? "comprobante" : esPrenda ? "prenda" : "otro";
        analisisFotos.set(cacheKey, { tipo, desc, extraido });
        return tipo;
      }
      const fotoItemsRecientes = [...fotoItems].sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      });
      const LIMITE_FOTOS_LEGACY = 8;
      const LIMITE_FOTOS_SEGURIDAD = 40;
      const itemsAClasificar = hasLiveRange ? fotoItemsRecientes.slice(0, LIMITE_FOTOS_SEGURIDAD) : fotoItemsRecientes.slice(0, LIMITE_FOTOS_LEGACY);
      for (const item of itemsAClasificar) {
        await clasificarYExtraer(item, { addDescription: false });
      }
      ensureAllLiveImagesAreVisibleAsCandidates();
      const textoConversacion = textos.join("\n");
      const textoConversacionEntrante = mensajesLive.filter((m) => !isOutgoingDirection(m.direction)).map((m) => m.content?.trim() ?? "").filter(Boolean).join("\n");
      const hayContextoPago = /\b(pagu[eé]|pago|pagado|comprobante|transferencia|deposit[eé]|qr|envi[oó]\s+el\s+pago|le\s+env[ií]o\s+el\s+pago)\b/i.test(textoConversacionEntrante);
      if (hayContextoPago && comprobantesDetectados.length === 0 && (fotoItemsRecientes.length > 0 || allFotoItems.length > 0)) {
        const fallbackCandidates = [...fotoItemsRecientes, ...allFotoItems].filter((item, index, list) => list.findIndex((other) => other.url === item.url) === index).filter((item) => !isOutgoingDirection(item.direction)).sort((a, b) => {
          const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
          const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
          return tb - ta;
        });
        const fallbackItem = fallbackCandidates.find((item) => {
          const cached = analisisFotos.get(item.id ?? item.url);
          return cached?.tipo !== "prenda";
        }) ?? fallbackCandidates[0];
        registrarComprobanteDetectado(
          fallbackItem,
          "COMPROBANTE: imagen pendiente de revision manual",
          null
        );
      }
      const comprobanteDesc = comprobanteExtraido?.cliente ? `${comprobanteExtraido.cliente}${comprobanteExtraido.monto ? " - " + comprobanteExtraido.monto + " Bs" : ""}${comprobanteExtraido.hora ? " - " + comprobanteExtraido.hora : ""}` : null;
      const promptFinal = `Eres un asistente que resume conversaciones de WhatsApp para ventas live de ropa en Bolivia.

MENSAJES DE TEXTO:
${textos.join("\n") || "(ninguno)"}

CLASIFICACION INTERNA DE FOTOS:
${descripciones.map((d, i) => `Foto ${i + 1}: ${d}`).join("\n") || "(ninguna)"}

TRANSCRIPCI\xD3N DE AUDIOS:
${transcripciones.map((t, i) => `Audio ${i + 1}: "${t}"`).join("\n") || "(ninguno)"}

Reglas:
- No describas colores, tallas, modelos ni caracteristicas de prendas.
- Resume solo el avance de la conversacion: si eligio prendas, cuantas fotos/prendas parecen relevantes, cuantos comprobantes/pagos hay, si falta verificar algo.
- Si no puedes contar prendas con seguridad, escribe "no especificado".
- En "pedido" escribe una frase corta operativa, no una lista de prendas.
- En "pago" resume cantidad/montos de pagos o comprobantes detectados.

Genera este JSON exacto (sin backticks, sin texto antes o despues):
{"pedido":"resumen operativo de la conversacion","cantidad":"cantidad de prendas elegidas o no especificado","talla":"no especificada","pago":"cantidad y monto de pagos/comprobantes o no especificado","entrega":"cuando o donde o no especificado","comprobante":${comprobanteDesc ? JSON.stringify(comprobanteDesc) : '"Si hay un comprobante de pago en las fotos, escribe: nombre del pagador - monto Bs - banco. Si no hay comprobante, escribe null"'},"notas":"pendientes de verificacion u observaciones o null"}`;
      const finalResult = await safeCallAi({
        userId,
        feature: "chat_summary",
        prompt: promptFinal,
        maxTokens: 400,
        temperature: 0,
        jsonMode: true
      }, "resumen final");
      let resumen = {
        pedido: textos.length > 0 ? textos.slice(-3).join(" ") : "Conversacion recibida",
        cantidad: fotoItems.length > 0 ? String(fotoItems.length) : "no especificado",
        talla: "no especificada",
        pago: comprobantesDetectados.length > 0 ? `${comprobantesDetectados.length} comprobante(s)` : "no especificado",
        entrega: "no especificado",
        comprobante: comprobanteDesc,
        notas: null
      };
      if (finalResult?.text) {
        const match = finalResult.text.match(/\{[\s\S]*?\}/s);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (typeof parsed.pedido === "string" && parsed.pedido.trimStart().startsWith("{")) {
              try {
                resumen = JSON.parse(parsed.pedido);
              } catch {
                resumen = parsed;
              }
            } else {
              resumen = parsed;
            }
          } catch {
            console.warn("[summarize] JSON parse fall\xF3, reintentando con regex no-greedy");
            const m2 = finalResult.text.match(/\{[^{}]*\}/);
            if (m2) {
              try {
                resumen = JSON.parse(m2[0]);
              } catch {
              }
            }
          }
        }
      }
      if (comprobanteDesc) resumen.comprobante = comprobanteDesc;
      const photoSelectionConfig = await getAiFeatureConfig(userId, "photo_selection");
      const selectedPrendaMessageIds = /* @__PURE__ */ new Set();
      let contextoVisual = null;
      let timelineSteps = [];
      if (photoSelectionConfig.enabled && prendasDetectadas.length > 0) {
        const candidates = prendasDetectadas.map((p, i) => ({
          n: i + 1,
          id: p.item.id,
          descripcion: p.descripcion,
          fecha: p.item.createdAt,
          texto: p.item.content
        }));
        const selectionPrompt = `Eres asistente de preparacion de pedidos de ropa vendidos por WhatsApp/TikTok Live.

Debes decidir cuales fotos de prendas fueron REALMENTE elegidas o compradas por la clienta, usando toda la conversacion.

MENSAJES:
${textos.join("\n") || "(sin textos)"}

TRANSCRIPCIONES DE AUDIO:
${transcripciones.map((t, i) => `Audio ${i + 1}: ${t}`).join("\n") || "(sin audios)"}

FOTOS CANDIDATAS DE PRENDA:
${candidates.map((c) => `${c.n}. ${c.descripcion}${c.texto ? ` | texto foto: ${c.texto}` : ""}`).join("\n")}

Reglas:
- Selecciona solo prendas que la clienta confirmo, eligio, pidio reservar o pago.
- Si una prenda fue preguntada pero luego descartada, no la selecciones.
- Si hay duda razonable, no la selecciones.
- No inventes datos.

Responde SOLO este JSON:
{"selected_numbers":[1,2],"timeline_steps":["1. ...","2. ...","3. ...","4. ..."],"contexto_visual":"explicacion corta para la operadora"}

Reglas de timeline_steps:
- Maximo 4 pasos, minimo 2 si hay informacion.
- Estilo operativo y breve.
- Enfocado en el flujo de decision (consulta/cambio/cierre), no en descripcion de prendas.
- No mencionar "operadora envio comprobante" ni frases obvias repetitivas.
- Si no hay cambio relevante, igual incluir cierre final de decision.`;
        const selectionResult = await safeCallAi({
          userId,
          feature: "photo_selection",
          prompt: selectionPrompt,
          maxTokens: 500,
          temperature: 0,
          jsonMode: true
        }, "seleccion de prendas");
        if (selectionResult?.text) {
          const match = selectionResult.text.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              const parsed = JSON.parse(match[0]);
              const nums = Array.isArray(parsed.selected_numbers) ? parsed.selected_numbers : [];
              for (const value of nums) {
                const idx = Number(value) - 1;
                const itemId = prendasDetectadas[idx]?.item.id;
                if (itemId) selectedPrendaMessageIds.add(itemId);
              }
              if (Array.isArray(parsed.timeline_steps)) {
                timelineSteps = parsed.timeline_steps.map((step) => String(step ?? "").trim()).filter(Boolean).slice(0, 4);
              }
              if (typeof parsed.contexto_visual === "string" && parsed.contexto_visual.trim()) {
                contextoVisual = parsed.contexto_visual.trim();
              }
            } catch {
            }
          }
        }
        const prendasSeleccionadas = prendasDetectadas.filter((p) => p.item.id && selectedPrendaMessageIds.has(p.item.id)).map((p) => ({ id: p.item.id, url: p.item.url, descripcion: p.descripcion }));
        const prendasNoSeleccionadas = prendasDetectadas.filter((p) => !p.item.id || !selectedPrendaMessageIds.has(p.item.id)).map((p) => ({ id: p.item.id, url: p.item.url, descripcion: p.descripcion }));
        if (timelineSteps.length === 0) {
          timelineSteps = [
            "La clienta consult\xF3 prendas durante el live.",
            prendasNoSeleccionadas.length > 0 ? "Compar\xF3 opciones y descart\xF3 algunas prendas." : null,
            prendasSeleccionadas.length > 0 ? `Confirm\xF3 ${prendasSeleccionadas.length} prenda(s) como decisi\xF3n final.` : "No confirm\xF3 prendas finales con suficiente claridad.",
            "Cierre de conversaci\xF3n registrado para preparaci\xF3n del pedido."
          ].filter(Boolean);
        }
        timelineSteps = timelineSteps.slice(0, 4).map((step, idx) => {
          const clean = step.replace(/^\d+\s*[\).:-]?\s*/, "").trim();
          return `${idx + 1}. ${clean}`;
        });
        resumen.prendas_seleccionadas = prendasSeleccionadas;
        resumen.prendas_no_seleccionadas = prendasNoSeleccionadas;
        resumen.timeline_steps = timelineSteps;
        resumen.contexto_visual = contextoVisual ?? "La IA no tuvo suficiente seguridad para seleccionar prendas automaticamente.";
      }
      let estadoPago = null;
      let pagoAlerta = null;
      let tarjetaVenta = null;
      let pedidosVentaLive = [];
      if (comprobanteExtraido?.cliente) {
        const nombreCliente = comprobanteExtraido.cliente;
        const montoNum = comprobanteExtraido.monto ? parseFloat(comprobanteExtraido.monto) : null;
        const nameNorm = nombreCliente.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z\s]/g, "").replace(/\s+/g, " ").trim();
        await panelDb.from("panel_clientes").update({ nombre: nombreCliente }).eq("id", clienteId);
        if (panelPhone) {
          const waPhone = panelPhone.replace(/\D/g, "");
          try {
            const { data: linkedCustomerId } = await supabase.rpc("fn_link_customer_wa", {
              p_canonical_name: nameNorm,
              p_wa_number: waPhone,
              p_user_id: userId
            });
            let customerId = linkedCustomerId;
            if (!customerId) {
              const { data: possibleCustomers } = await supabase.from("customers").select("id, full_name, canonical_name, normalized_name, phone, wa_number").eq("user_id", userId).eq("is_active", true).limit(300);
              const nameMatch = possibleCustomers?.filter(
                (c) => isStrongNameMatch(c.canonical_name || c.full_name || c.normalized_name, nameNorm)
              ) ?? [];
              if (nameMatch.length === 1) {
                customerId = nameMatch[0].id;
                await supabase.from("customers").update({
                  wa_number: waPhone,
                  phone: nameMatch[0].phone || waPhone,
                  wa_linked_at: (/* @__PURE__ */ new Date()).toISOString(),
                  updated_at: (/* @__PURE__ */ new Date()).toISOString()
                }).eq("id", customerId).eq("user_id", userId);
                console.log(`[summarize] Cliente existente vinculado por nombre flexible: "${nombreCliente}" id=${customerId}`);
              }
            }
            if (!customerId) {
              await supabase.from("customers").insert({
                full_name: nombreCliente,
                canonical_name: nameNorm,
                normalized_name: nameNorm.toLowerCase(),
                wa_number: waPhone,
                phone: waPhone,
                active_label: null,
                active_label_type: null,
                user_id: userId,
                is_active: true,
                source: "whatsapp"
              });
              console.log(`[summarize] Cliente nuevo creado en customers: "${nombreCliente}" wa=${waPhone}`);
            } else {
              console.log(`[summarize] customers.wa_number actualizado: "${nombreCliente}" (id=${customerId}) wa=${waPhone}`);
            }
          } catch (e) {
            console.warn("[summarize] fn_link_customer_wa (no cr\xEDtico):", e?.message);
          }
        }
        if (montoNum && montoNum > 0) {
          const since24h = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString();
          const { data: pagosCandidates } = await supabase.from("pagos").select("id, nombre, pago, date").eq("user_id", userId).eq("method", "Notificaci\xF3n bancaria").gte("date", since24h).gte("pago", montoNum * 0.97).lte("pago", montoNum * 1.03);
          const pagosMatch = (pagosCandidates ?? []).filter(
            (p) => isContextualNameMatch(p.nombre, nombreCliente)
          );
          estadoPago = pagosMatch?.length ? "pagado_verificado" : "solo_comprobante";
        } else {
          estadoPago = "solo_comprobante";
        }
        if (estadoPago === "solo_comprobante") {
          pagoAlerta = { nombre: nombreCliente, monto: comprobanteExtraido.monto, hora: comprobanteExtraido.hora };
        }
        await panelDb.from("panel_clientes").update({ estado: estadoPago }).eq("id", clienteId);
        if (panelPhone) {
          try {
            const waPhone = panelPhone.replace(/\D/g, "");
            const match = await findOrCreateProfile(supabase, userId, {
              name: nombreCliente,
              phone: waPhone
            });
            const updates = {};
            if (!match.profile.panel_phone) updates.panel_phone = waPhone;
            if (nombreCliente.length > (match.profile.display_name?.trim()?.length ?? 0)) updates.display_name = nombreCliente;
            if (Object.keys(updates).length > 0) {
              await supabase.from("identity_profiles").update(updates).eq("id", match.profile.id);
            }
            const { data: duplicates } = await supabase.from("identity_profiles").select("id, display_name, phone, panel_phone, store_phone, cliente_id, merged_from").eq("user_id", userId).neq("id", match.profile.id);
            const duplicate = duplicates?.find((p) => {
              const pNorm = (p.display_name ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z\s]/g, "").replace(/\s+/g, " ").trim();
              return pNorm.length > 0 && isStrongNameMatch(pNorm, nameNorm);
            });
            if (duplicate) {
              await supabase.from("identity_evidence").update({ profile_id: match.profile.id }).eq("profile_id", duplicate.id).eq("user_id", userId);
              const mergeUpdates = {
                merged_from: [...match.profile.merged_from ?? [], duplicate.id]
              };
              if (!match.profile.phone && duplicate.phone) mergeUpdates.phone = duplicate.phone;
              if (!match.profile.panel_phone && duplicate.panel_phone) mergeUpdates.panel_phone = duplicate.panel_phone;
              if (!match.profile.store_phone && duplicate.store_phone) mergeUpdates.store_phone = duplicate.store_phone;
              if (!match.profile.cliente_id && duplicate.cliente_id) mergeUpdates.cliente_id = duplicate.cliente_id;
              await supabase.from("identity_profiles").update(mergeUpdates).eq("id", match.profile.id);
              await supabase.from("identity_profiles").delete().eq("id", duplicate.id).eq("user_id", userId);
              console.log(`[summarize] Pulpo auto-merge: eliminado duplicado ${duplicate.id} \u2192 fusionado en ${match.profile.id}`);
            }
            await depositEvidence(supabase, userId, match.profile.id, {
              source: "whatsapp",
              event_type: "comprobante_pago",
              phone: waPhone,
              name_raw: nombreCliente,
              amount: comprobanteExtraido?.monto ? parseFloat(comprobanteExtraido.monto) : void 0,
              event_at: (/* @__PURE__ */ new Date()).toISOString(),
              payload: { estado: estadoPago, hora: comprobanteExtraido?.hora }
            });
            console.log(`[summarize] Pulpo: "${nombreCliente}" \u2194 ${waPhone} \u2192 perfil ${match.profile.id} (${match.match_type})`);
          } catch (e) {
            console.warn("[summarize] Pulpo link (no cr\xEDtico):", e?.message);
          }
        }
      }
      if (panelPhone && comprobantesDetectados.length > 0 && !skipPaymentCreation) {
        try {
          const phone = normalizePanelPhoneForLiveSales(panelPhone);
          if (!phone) throw new Error("Telefono invalido para venta live");
          const touchedOrderIds = /* @__PURE__ */ new Set();
          for (const comprobante of comprobantesDetectados) {
            const fallback = parseReceiptTextFallback(comprobante.texto);
            const nombreDetectado = comprobante.extraido?.cliente ?? fallback.nombre;
            const montoDetectado = parseLiveMonto(comprobante.extraido?.monto) ?? fallback.monto;
            const comprobanteAt = receiptAtFromMessage(comprobante.item.createdAt, comprobante.extraido?.hora);
            const fechaPedido = hasLiveRange ? boliviaDateKey(rangeStart.toISOString()) : boliviaDateKey(comprobanteAt);
            const comprobanteTextoFinal = [
              nombreDetectado,
              montoDetectado ? `Bs ${montoDetectado}` : null,
              comprobante.extraido?.hora
            ].filter(Boolean).join(" - ") || comprobante.texto;
            const order = await ensurePanelLiveOrder(panelDb, {
              clienteId,
              phone,
              fechaPedido,
              nombreDetectado,
              isTest: false
            });
            touchedOrderIds.add(order.id);
            await upsertLiveEvidence(panelDb, {
              pedidoLiveId: order.id,
              clienteId,
              panelMensajeId: comprobante.item.id,
              tipo: "comprobante",
              mediaUrl: comprobante.item.url,
              mediaType: comprobante.item.mediaType,
              content: comprobante.item.content,
              descripcion: comprobanteTextoFinal,
              messageCreatedAt: comprobante.item.createdAt,
              metadata: {
                extracted: comprobante.extraido,
                classifier_text: comprobante.texto,
                live_range: hasLiveRange ? {
                  start_at: rangeStart.toISOString(),
                  end_at: rangeEnd.toISOString(),
                  late_proof_grace_minutes: LIVE_LATE_PROOF_GRACE_MINUTES,
                  late_proof: isLateLiveProof(comprobante.item.createdAt)
                } : null
              }
            });
            for (const prenda of prendasDetectadas) {
              if (hasLiveRange) {
                const prendaTime = prenda.item.createdAt ? new Date(prenda.item.createdAt).getTime() : NaN;
                if (!Number.isFinite(prendaTime) || prendaTime < rangeStart.getTime() || prendaTime > rangeEnd.getTime()) continue;
              } else if (boliviaDateKey(prenda.item.createdAt ?? comprobanteAt) !== fechaPedido) {
                continue;
              }
              const selectedByAi = !!prenda.item.id && selectedPrendaMessageIds.has(prenda.item.id);
              await upsertLiveEvidence(panelDb, {
                pedidoLiveId: order.id,
                clienteId,
                panelMensajeId: prenda.item.id,
                tipo: "prenda",
                mediaUrl: prenda.item.url,
                mediaType: prenda.item.mediaType,
                content: prenda.item.content,
                descripcion: prenda.descripcion,
                messageCreatedAt: prenda.item.createdAt,
                metadata: {
                  source: "ai_classifier",
                  selected_by_ai: selectedByAi,
                  selected_final: selectedByAi,
                  selection_source: selectedByAi ? "ai" : "ai_unselected",
                  contexto_visual: contextoVisual,
                  live_range: hasLiveRange ? {
                    start_at: rangeStart.toISOString(),
                    end_at: rangeEnd.toISOString()
                  } : null
                }
              });
            }
            let pagoLive = await upsertWhatsappLivePayment(panelDb, {
              pedidoLiveId: order.id,
              clienteId,
              phone,
              fechaPedido,
              nombreDetectado,
              monto: montoDetectado,
              comprobanteHora: comprobante.extraido?.hora,
              comprobanteAt,
              comprobanteTexto: comprobanteTextoFinal,
              comprobanteMediaUrl: comprobante.item.url,
              panelMensajeId: comprobante.item.id,
              isTest: false
            });
            let updatedOrder = await recomputeLiveOrderTotals(panelDb, order.id);
            updatedOrder = await syncMainPedidoForLiveOrder(panelDb, supabase, userId, updatedOrder);
            pagoLive = await matchLivePaymentWithMacrodroid(panelDb, supabase, {
              userId,
              pagoLive,
              mainCustomerId: updatedOrder.main_customer_id,
              windowMinutes: 5
            });
            if (isLateLiveProof(comprobante.item.createdAt) && pagoLive?.estado !== "verificado_macrodroid") {
              const { data: latePago, error: latePagoError } = await panelDb.from("pagos_venta_live").update({
                estado: "revision_manual",
                match_score: 0.5,
                match_reason: "comprobante_tardio_live_5min_sin_macrodroid"
              }).eq("id", pagoLive.id).select("*").single();
              if (latePagoError) throw latePagoError;
              pagoLive = latePago;
            }
            if (pagoLive?.estado === "verificado_macrodroid") {
              estadoPago = "pagado_verificado";
            } else if (!estadoPago) {
              estadoPago = "solo_comprobante";
            }
            if (pagoLive?.estado !== "verificado_macrodroid" && nombreDetectado) {
              pagoAlerta = {
                nombre: nombreDetectado,
                monto: montoDetectado != null ? String(montoDetectado) : null,
                hora: comprobante.extraido?.hora ?? null
              };
            }
            updatedOrder = await recomputeLiveOrderTotals(panelDb, order.id);
            updatedOrder = await syncMainPedidoForLiveOrder(panelDb, supabase, userId, updatedOrder);
          }
          if (touchedOrderIds.size > 0) {
            const { data: orders } = await panelDb.from("pedidos_venta_live").select("*").in("id", [...touchedOrderIds]).order("fecha_pedido", { ascending: false });
            pedidosVentaLive = orders ?? [];
          }
        } catch (e) {
          console.warn("[summarize] pedidos venta live no guardados:", e?.message);
        }
      }
      if (comprobanteDetectado && panelPhone) {
        try {
          const phone = normalizePanelPhoneForLiveSales(panelPhone);
          const resumenComprobante = typeof resumen.comprobante === "string" && resumen.comprobante !== "null" ? resumen.comprobante : null;
          const comprobanteTextoFinal = comprobanteDesc ?? resumenComprobante ?? comprobanteTexto;
          const fallbackComprobante = parseReceiptTextFallback(comprobanteTextoFinal);
          const nombreDetectado = comprobanteExtraido?.cliente ?? fallbackComprobante.nombre;
          const montoDetectado = parseComprobanteMonto(comprobanteExtraido?.monto) ?? fallbackComprobante.monto;
          const estadoPanel = estadoPago ?? "solo_comprobante";
          const cardEstado = nombreDetectado && montoDetectado && estadoPago === "pagado_verificado" ? "comprobante_recibido" : "revision_manual";
          await panelDb.from("panel_clientes").update({
            ...nombreDetectado ? { nombre: nombreDetectado } : {},
            estado: estadoPanel
          }).eq("id", clienteId);
          const payload = {
            cliente_id: clienteId,
            phone,
            nombre_detectado: nombreDetectado,
            monto_detectado: montoDetectado,
            resumen,
            comprobante_texto: comprobanteTextoFinal,
            comprobante_media_url: comprobanteMediaUrl ?? fotoUrls[fotoUrls.length - 1] ?? null,
            estado: cardEstado,
            is_test: false
          };
          const { data: existing, error: existingError } = await panelDb.from("tarjetas_venta_live").select("*").eq("phone", phone).neq("estado", "archivado").order("updated_at", { ascending: false }).limit(1).maybeSingle();
          if (existingError) throw existingError;
          if (existing) {
            const { data, error } = await panelDb.from("tarjetas_venta_live").update(payload).eq("id", existing.id).select("*").single();
            if (error) throw error;
            tarjetaVenta = data;
          } else {
            const { data, error } = await panelDb.from("tarjetas_venta_live").insert(payload).select("*").single();
            if (error) throw error;
            tarjetaVenta = data;
          }
        } catch (e) {
          console.warn("[summarize] tarjeta venta live no guardada:", e?.message);
        }
      }
      await panelDb.from("panel_clientes").update({
        resumen: JSON.stringify(resumen),
        resumen_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", clienteId);
      res.json({
        ok: true,
        resumen,
        comprobante_extraido: comprobanteExtraido,
        estado_pago: estadoPago,
        pago_alerta: pagoAlerta,
        tarjeta_venta: tarjetaVenta,
        pedidos_venta_live: pedidosVentaLive,
        ai_warning: aiErrors.size > 0 ? [...aiErrors][0] : null,
        ai_errors: [...aiErrors]
      });
    } catch (err) {
      res.status(500).json({ error: err?.message });
    }
  });
  return router;
}

// src/routes/identity.ts
import { Router as Router2 } from "express";
function createIdentityRouter(supabase, supabaseStore2, supabasePanel2) {
  const router = Router2();
  function uid2(req) {
    return req.headers["x-user-id"] || null;
  }
  function parseLiveSessionNotes(notes) {
    try {
      const parsed = typeof notes === "string" ? JSON.parse(notes) : notes;
      return {
        startAt: typeof parsed?.started_at === "string" ? parsed.started_at : null,
        endAt: typeof parsed?.ended_at === "string" ? parsed.ended_at : typeof parsed?.closed_at === "string" ? parsed.closed_at : null,
        processedAt: typeof parsed?.processed_at === "string" ? parsed.processed_at : null
      };
    } catch {
      return { startAt: null, endAt: null, processedAt: null };
    }
  }
  async function resolveLiveOrderWindow(userId, liveOrder) {
    if (!liveOrder) return null;
    const { data: evidenceRows } = await supabasePanel2.from("evidencias_venta_live").select("metadata").eq("pedido_live_id", liveOrder.id).not("metadata", "is", null).limit(20);
    for (const row of evidenceRows ?? []) {
      const range = row?.metadata?.live_range;
      if (range?.start_at && range?.end_at) {
        return { from: range.start_at, to: range.end_at, source: "evidence_live_range" };
      }
    }
    const orderCreated = liveOrder.created_at ? new Date(liveOrder.created_at).getTime() : Date.now();
    const { data: sessions } = await supabase.from("live_sessions").select("id,notes,created_at,status,user_id").eq("user_id", userId).eq("status", "completed").order("created_at", { ascending: false }).limit(20);
    let best = null;
    for (const session of sessions ?? []) {
      const parsed = parseLiveSessionNotes(session.notes);
      if (!parsed.startAt || !parsed.endAt) continue;
      const processedAt = parsed.processedAt ? new Date(parsed.processedAt).getTime() : new Date(session.created_at).getTime();
      const distance = Math.abs(orderCreated - processedAt);
      if (distance > 8 * 60 * 60 * 1e3) continue;
      if (!best || distance < best.distance) {
        best = { from: parsed.startAt, to: parsed.endAt, source: `live_session:${session.id}`, distance };
      }
    }
    return best ? { from: best.from, to: best.to, source: best.source } : null;
  }
  router.get("/profiles", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const profiles = await listProfiles(supabase, userId, {
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0,
        search: req.query.search,
        source: req.query.source
      });
      res.json(profiles);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.get("/profiles/:id", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const result = await getProfileWithEvidence(supabase, userId, req.params.id);
      if (!result) return res.status(404).json({ error: "Perfil no encontrado" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.post("/profiles", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { name, phone, cliente_id, origin } = req.body;
    if (!name && !phone) return res.status(400).json({ error: "Se requiere name o phone" });
    try {
      const result = await findOrCreateProfile(supabase, userId, {
        name,
        phone,
        clienteId: cliente_id,
        origin: origin === "manual" ? "manual" : "auto"
      });
      res.status(result.match_type === "new" ? 201 : 200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.patch("/profiles/:id", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { display_name, phone, store_phone, panel_phone, cliente_id } = req.body;
    const updates = {};
    if (display_name !== void 0) updates.display_name = display_name;
    if (phone !== void 0) updates.phone = normalizePhone(phone);
    if (store_phone !== void 0) updates.store_phone = store_phone;
    if (panel_phone !== void 0) updates.panel_phone = panel_phone;
    if (cliente_id !== void 0) updates.cliente_id = cliente_id;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Nada que actualizar" });
    }
    try {
      const { data, error } = await supabase.from("identity_profiles").update(updates).eq("id", req.params.id).eq("user_id", userId).select().single();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: "Perfil no encontrado" });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.post("/profiles/:id/evidence", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { source, source_id, event_type, amount, phone, name_raw, event_at, payload } = req.body;
    if (!source || !event_type) {
      return res.status(400).json({ error: "source y event_type requeridos" });
    }
    try {
      const evidence = await depositEvidence(supabase, userId, req.params.id, {
        source,
        source_id,
        event_type,
        amount,
        phone,
        name_raw,
        event_at,
        payload
      });
      res.status(201).json(evidence);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.get("/evidence", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      let query = supabase.from("identity_evidence").select("*").eq("user_id", userId).order("event_at", { ascending: false });
      if (req.query.source) query = query.eq("source", req.query.source);
      if (req.query.profile_id) query = query.eq("profile_id", req.query.profile_id);
      const limit = parseInt(req.query.limit) || 50;
      query = query.limit(limit);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.post("/resolve", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { name, phone } = req.body;
    if (!name && !phone) return res.status(400).json({ error: "Se requiere name o phone" });
    try {
      const phoneNorm = phone ? normalizePhone(phone) : null;
      const nameNorm = name ? normalizeName(name) : null;
      let query = supabase.from("identity_profiles").select("*").eq("user_id", userId);
      if (phoneNorm) {
        const { data } = await query.eq("phone", phoneNorm).limit(1).single();
        if (data) return res.json({ profile: data, confidence: 1, match_type: "phone_exact" });
      }
      if (nameNorm) {
        const { data: profiles } = await supabase.from("identity_profiles").select("*").eq("user_id", userId);
        const exact = profiles?.find((p) => normalizeName(p.display_name) === nameNorm);
        if (exact) return res.json({ profile: exact, confidence: 0.85, match_type: "name_exact" });
      }
      res.status(404).json({ error: "Sin coincidencia" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.post("/sync-store", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    if (!supabaseStore2) return res.status(503).json({ error: "supabaseStore no configurado" });
    try {
      const { data: existing } = await supabase.from("identity_evidence").select("source_id").eq("user_id", userId).eq("source", "store_order");
      const syncedIds = new Set((existing ?? []).map((e) => e.source_id));
      const { data: orders, error } = await supabaseStore2.from("store_orders").select("id, customer_name, customer_wa, total, status, created_at").order("created_at", { ascending: false }).limit(500);
      if (error) return res.status(500).json({ error: error.message });
      let created = 0;
      let skipped = 0;
      for (const o of orders ?? []) {
        const orderId = String(o.id);
        if (syncedIds.has(orderId)) {
          skipped++;
          continue;
        }
        const result = await findOrCreateProfile(supabase, userId, {
          name: o.customer_name,
          phone: o.customer_wa
        });
        if (o.customer_wa && !result.profile.store_phone) {
          await supabase.from("identity_profiles").update({ store_phone: normalizePhone(o.customer_wa) }).eq("id", result.profile.id);
        }
        await depositEvidence(supabase, userId, result.profile.id, {
          source: "store_order",
          source_id: orderId,
          event_type: "order",
          amount: o.total,
          phone: o.customer_wa,
          name_raw: o.customer_name,
          event_at: o.created_at,
          payload: { status: o.status }
        });
        created++;
      }
      await recalculateAllConfidences(supabase, userId);
      res.json({ ok: true, created, skipped, total: (orders ?? []).length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.post("/sync-whatsapp", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    if (!supabasePanel2) return res.status(503).json({ error: "supabasePanel no configurado" });
    try {
      const { data: existing } = await supabase.from("identity_evidence").select("source_id").eq("user_id", userId).eq("source", "whatsapp");
      const syncedIds = new Set((existing ?? []).map((e) => e.source_id));
      const { data: clientes, error } = await supabasePanel2.from("panel_clientes").select("id, phone, nombre, last_interaction, created_at").order("last_interaction", { ascending: false }).limit(500);
      if (error) return res.status(500).json({ error: error.message });
      let created = 0;
      let skipped = 0;
      for (const c of clientes ?? []) {
        const clienteId = String(c.id);
        if (syncedIds.has(clienteId)) {
          skipped++;
          continue;
        }
        const result = await findOrCreateProfile(supabase, userId, {
          name: c.nombre,
          phone: c.phone
        });
        if (c.phone && !result.profile.panel_phone) {
          await supabase.from("identity_profiles").update({ panel_phone: normalizePhone(c.phone) }).eq("id", result.profile.id);
        }
        await depositEvidence(supabase, userId, result.profile.id, {
          source: "whatsapp",
          source_id: clienteId,
          source_ref: c.phone,
          event_type: "contact",
          phone: c.phone,
          name_raw: c.nombre,
          event_at: c.last_interaction ?? c.created_at,
          payload: {}
        });
        created++;
      }
      await recalculateAllConfidences(supabase, userId);
      res.json({ ok: true, created, skipped, total: (clientes ?? []).length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.post("/sync-pagos", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const { data: existing } = await supabase.from("identity_evidence").select("source_id").eq("user_id", userId).in("source", ["manual_payment", "macrodroid"]);
      const syncedIds = new Set((existing ?? []).map((e) => e.source_id));
      const { data: pagos, error } = await supabase.from("pagos").select("id, nombre, pago, method, date, customer_id").eq("user_id", userId).order("date", { ascending: false }).limit(500);
      if (error) return res.status(500).json({ error: error.message });
      let created = 0;
      let skipped = 0;
      for (const p of pagos ?? []) {
        const pagoId = String(p.id);
        if (syncedIds.has(pagoId)) {
          skipped++;
          continue;
        }
        const source = p.method === "Notificaci\xF3n bancaria" ? "macrodroid" : "manual_payment";
        const result = await findOrCreateProfile(supabase, userId, {
          name: p.nombre,
          clienteId: p.customer_id ?? void 0
        });
        await depositEvidence(supabase, userId, result.profile.id, {
          source,
          source_id: pagoId,
          event_type: "payment",
          amount: p.pago,
          name_raw: p.nombre,
          event_at: p.date,
          payload: { customer_id: p.customer_id, method: p.method }
        });
        created++;
      }
      await recalculateAllConfidences(supabase, userId);
      res.json({ ok: true, created, skipped, total: (pagos ?? []).length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.get("/whatsapp-photos", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    if (!supabasePanel2) return res.status(503).json({ error: "supabasePanel no configurado" });
    const { phone, date, days = "4", mainPedidoId, mode } = req.query;
    if (!phone) return res.status(400).json({ error: "phone requerido" });
    try {
      const phoneNorm = normalizePhone(phone);
      const mainPedidoNumber = Number(mainPedidoId);
      let liveOrder = null;
      if (Number.isFinite(mainPedidoNumber)) {
        const { data } = await supabasePanel2.from("pedidos_venta_live").select("id, main_pedido_id, fecha_pedido, cliente_id").eq("main_pedido_id", mainPedidoNumber).order("updated_at", { ascending: false }).limit(1).maybeSingle();
        liveOrder = data ?? null;
      }
      let cliente = null;
      if (liveOrder?.cliente_id) {
        const { data } = await supabasePanel2.from("panel_clientes").select("id,resumen").eq("id", liveOrder.cliente_id).maybeSingle();
        cliente = data ?? null;
      }
      if (!cliente) {
        const phoneVariants2 = [phoneNorm, phoneNorm.replace(/^\+/, "")];
        for (const variant of phoneVariants2) {
          const { data } = await supabasePanel2.from("panel_clientes").select("id,resumen").eq("phone", variant).limit(1).maybeSingle();
          if (data) {
            cliente = data;
            break;
          }
        }
      }
      if (!cliente) return res.json({ photos: [], cliente_found: false });
      if (mode === "comprobantes") {
        const pivot2 = date ? /* @__PURE__ */ new Date(`${String(date).slice(0, 10)}T12:00:00-04:00`) : /* @__PURE__ */ new Date();
        const rangeDays = Math.max(1, Math.min(Number.parseInt(days, 10) || 4, 14));
        const rangeMs2 = rangeDays * 24 * 60 * 60 * 1e3;
        const from2 = new Date(pivot2.getTime() - rangeMs2).toISOString();
        const to2 = new Date(pivot2.getTime() + rangeMs2).toISOString();
        const [{ data: mensajes2, error: mensajesError }, { data: pagos, error: pagosError }] = await Promise.all([
          supabasePanel2.from("panel_mensajes").select("id, media_url, media_type, direction, created_at, content").eq("cliente_id", cliente.id).eq("direction", "in").eq("has_media", true).not("media_url", "is", null).gte("created_at", from2).lte("created_at", to2).order("created_at", { ascending: false }).limit(30),
          supabasePanel2.from("pagos_venta_live").select("panel_mensaje_id, comprobante_media_url, comprobante_texto, estado, created_at").eq("cliente_id", cliente.id).in("estado", ["pendiente_whatsapp", "revision_manual"]).gte("created_at", from2).lte("created_at", to2).order("created_at", { ascending: false }).limit(30)
        ]);
        if (mensajesError) throw mensajesError;
        if (pagosError) throw pagosError;
        const paymentByMessageId2 = /* @__PURE__ */ new Map();
        const paymentByMediaUrl2 = /* @__PURE__ */ new Map();
        for (const payment of pagos ?? []) {
          if (payment.panel_mensaje_id) paymentByMessageId2.set(String(payment.panel_mensaje_id), payment);
          if (payment.comprobante_media_url) paymentByMediaUrl2.set(String(payment.comprobante_media_url), payment);
        }
        const photos2 = (mensajes2 ?? []).map((message) => {
          const payment = paymentByMessageId2.get(String(message.id)) ?? paymentByMediaUrl2.get(String(message.media_url));
          return {
            ...message,
            // En este panel todas las imágenes entrantes son comprobantes.
            // Si el pago todavía está siendo analizado, igual se muestra como pendiente.
            tipo: "comprobante",
            descripcion: payment?.comprobante_texto ?? null,
            payment_status: payment?.estado ?? null,
            selected_by_ai: false,
            selected_final: false,
            selection_source: null
          };
        }).filter(
          (photo) => photo.payment_status === "pendiente_whatsapp" || photo.payment_status === "revision_manual"
        );
        return res.json({
          photos: photos2,
          cliente_found: true,
          cliente_id: cliente.id,
          pedido_live_id: liveOrder?.id ?? null
        });
      }
      if (!liveOrder) {
        const fechaPedido = date ? String(date).slice(0, 10) : null;
        let q = supabasePanel2.from("pedidos_venta_live").select("id, main_pedido_id, fecha_pedido").eq("cliente_id", cliente.id).neq("estado", "archivado").order("fecha_pedido", { ascending: false }).limit(1);
        if (fechaPedido) q = q.eq("fecha_pedido", fechaPedido);
        const { data } = await q.maybeSingle();
        liveOrder = data ?? null;
      }
      const liveWindow = await resolveLiveOrderWindow(userId, liveOrder);
      const pivot = date ? new Date(date) : liveOrder?.fecha_pedido ? new Date(liveOrder.fecha_pedido) : /* @__PURE__ */ new Date();
      const rangeMs = parseInt(days) * 24 * 60 * 60 * 1e3;
      const from = liveWindow?.from ?? new Date(pivot.getTime() - rangeMs).toISOString();
      const to = liveWindow?.to ?? new Date(pivot.getTime() + rangeMs).toISOString();
      const mensajesQuery = supabasePanel2.from("panel_mensajes").select("id, media_url, media_type, direction, created_at, content").eq("cliente_id", cliente.id).eq("has_media", true).gte("created_at", from).lte("created_at", to).order("created_at", { ascending: false }).limit(30);
      const pagosPendientesQuery = supabasePanel2.from("pagos_venta_live").select("panel_mensaje_id, comprobante_media_url, comprobante_texto, estado, created_at").eq("cliente_id", cliente.id).in("estado", ["pendiente_whatsapp", "revision_manual"]).order("created_at", { ascending: false }).limit(30);
      const evidenciasQuery = liveOrder?.id ? supabasePanel2.from("evidencias_venta_live").select("panel_mensaje_id,tipo,descripcion,metadata").eq("pedido_live_id", liveOrder.id).not("panel_mensaje_id", "is", null) : Promise.resolve({ data: [] });
      const [{ data: mensajes }, { data: evidencias }, { data: pagosPendientes }] = await Promise.all([
        mensajesQuery,
        evidenciasQuery,
        pagosPendientesQuery
      ]);
      const pendingMessageIds = (pagosPendientes ?? []).map((p) => p.panel_mensaje_id).filter(Boolean);
      const pendingMediaUrls = (pagosPendientes ?? []).map((p) => p.comprobante_media_url).filter(Boolean);
      const [{ data: pendingMessagesById }, { data: pendingMessagesByMedia }] = await Promise.all([
        pendingMessageIds.length > 0 ? supabasePanel2.from("panel_mensajes").select("id, media_url, media_type, direction, created_at, content").in("id", pendingMessageIds) : Promise.resolve({ data: [] }),
        pendingMediaUrls.length > 0 ? supabasePanel2.from("panel_mensajes").select("id, media_url, media_type, direction, created_at, content").in("media_url", pendingMediaUrls) : Promise.resolve({ data: [] })
      ]);
      const uniqueMessages = /* @__PURE__ */ new Map();
      for (const message of [
        ...mensajes ?? [],
        ...pendingMessagesById ?? [],
        ...pendingMessagesByMedia ?? []
      ]) {
        if (message?.id) uniqueMessages.set(String(message.id), message);
      }
      const photosRaw = [...uniqueMessages.values()].filter(
        (m) => m.media_url && (m.media_type && m.media_type.startsWith("image/") || /\.(jpg|jpeg|png|webp)/i.test(m.media_url))
      );
      const evidenceByMessageId = /* @__PURE__ */ new Map();
      for (const ev of evidencias ?? []) {
        if (ev.panel_mensaje_id) evidenceByMessageId.set(ev.panel_mensaje_id, ev);
      }
      const paymentByMessageId = /* @__PURE__ */ new Map();
      const paymentByMediaUrl = /* @__PURE__ */ new Map();
      for (const payment of pagosPendientes ?? []) {
        if (payment.panel_mensaje_id) paymentByMessageId.set(String(payment.panel_mensaje_id), payment);
        if (payment.comprobante_media_url) paymentByMediaUrl.set(String(payment.comprobante_media_url), payment);
      }
      const storeProofMsgIds = /* @__PURE__ */ new Set();
      if (supabaseStore2) {
        const panelMsgIds = photosRaw.map((m) => m.id);
        if (panelMsgIds.length > 0) {
          const { data: storeProofs } = await supabaseStore2.from("payment_events").select("hash").eq("source", "wa_proof");
          for (const sp of storeProofs ?? []) {
            const parts = (sp.hash ?? "").split(":");
            const msgId = parts[2];
            if (msgId && panelMsgIds.includes(msgId)) storeProofMsgIds.add(msgId);
          }
        }
      }
      let resumenObj = null;
      try {
        resumenObj = cliente.resumen ? JSON.parse(cliente.resumen) : null;
      } catch {
        resumenObj = null;
      }
      const aiSelected = new Set((Array.isArray(resumenObj?.prendas_seleccionadas) ? resumenObj.prendas_seleccionadas : []).map((p) => p?.id).filter(Boolean));
      const photos = photosRaw.map((photo) => {
        const ev = evidenceByMessageId.get(photo.id);
        const payment = paymentByMessageId.get(String(photo.id)) ?? paymentByMediaUrl.get(String(photo.media_url));
        const meta = ev?.metadata && typeof ev.metadata === "object" ? ev.metadata : {};
        const selectedByAi = meta.selected_by_ai === true || aiSelected.has(photo.id);
        const selectedFinal = typeof meta.selected_final === "boolean" ? meta.selected_final : selectedByAi;
        return {
          ...photo,
          tipo: storeProofMsgIds.has(photo.id) || payment ? "comprobante" : ev?.tipo ?? null,
          descripcion: payment?.comprobante_texto ?? ev?.descripcion ?? null,
          selected_by_ai: selectedByAi,
          selected_final: selectedFinal,
          selection_source: meta.selection_source ?? (selectedByAi ? "ai" : null)
        };
      });
      res.json({
        photos,
        cliente_found: true,
        cliente_id: cliente.id,
        pedido_live_id: liveOrder?.id ?? null,
        live_window: liveWindow,
        timeline_steps: Array.isArray(resumenObj?.timeline_steps) ? resumenObj.timeline_steps.map((s) => String(s ?? "").trim()).filter(Boolean).slice(0, 4) : [],
        contexto_visual: resumenObj?.contexto_visual ?? null
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.post("/whatsapp-photo-selection", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    if (!supabasePanel2) return res.status(503).json({ error: "supabasePanel no configurado" });
    const { phone, mainPedidoId, orderDate, photos = [], contextoVisual } = req.body ?? {};
    if (!phone) return res.status(400).json({ error: "phone requerido" });
    try {
      const phoneNorm = normalizePhone(String(phone));
      const phoneVariants2 = [phoneNorm, phoneNorm.replace(/^\+/, "")];
      let cliente = null;
      for (const variant of phoneVariants2) {
        const { data } = await supabasePanel2.from("panel_clientes").select("id").eq("phone", variant).limit(1).maybeSingle();
        if (data) {
          cliente = data;
          break;
        }
      }
      if (!cliente) return res.status(404).json({ error: "Cliente WhatsApp no encontrado" });
      const cleanPhone = phoneNorm.replace(/^\+/, "");
      const fechaPedido = orderDate ? String(orderDate).slice(0, 10) : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const mainPedidoNumber = Number(mainPedidoId);
      let liveOrder = null;
      if (Number.isFinite(mainPedidoNumber)) {
        const { data } = await supabasePanel2.from("pedidos_venta_live").select("*").eq("main_pedido_id", mainPedidoNumber).order("updated_at", { ascending: false }).limit(1).maybeSingle();
        liveOrder = data ?? null;
      }
      if (!liveOrder) {
        const { data } = await supabasePanel2.from("pedidos_venta_live").select("*").eq("cliente_id", cliente.id).eq("fecha_pedido", fechaPedido).neq("estado", "archivado").limit(1).maybeSingle();
        liveOrder = data ?? null;
      }
      if (!liveOrder) {
        const { data, error } = await supabasePanel2.from("pedidos_venta_live").insert({
          cliente_id: cliente.id,
          phone: cleanPhone,
          fecha_pedido: fechaPedido,
          estado: "procesar",
          main_pedido_id: Number.isFinite(mainPedidoNumber) ? mainPedidoNumber : null,
          is_test: false
        }).select("*").single();
        if (error) throw error;
        liveOrder = data;
      }
      let saved = 0;
      for (const photo of Array.isArray(photos) ? photos : []) {
        if (!photo?.id || !photo?.media_url) continue;
        const selected = photo.selected === true;
        const { data: existing } = await supabasePanel2.from("evidencias_venta_live").select("id,tipo,metadata").eq("panel_mensaje_id", photo.id).maybeSingle();
        if (!selected && !existing) continue;
        const metadata = {
          ...existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {},
          selected_final: selected,
          selection_source: "operator",
          contexto_visual: contextoVisual ?? null
        };
        const payload = {
          pedido_live_id: liveOrder.id,
          cliente_id: cliente.id,
          panel_mensaje_id: photo.id,
          tipo: selected ? "prenda" : existing?.tipo ?? "otro",
          media_url: photo.media_url,
          media_type: photo.media_type ?? null,
          content: photo.content ?? null,
          descripcion: photo.descripcion ?? null,
          message_created_at: photo.created_at ?? null,
          metadata
        };
        const { error } = await supabasePanel2.from("evidencias_venta_live").upsert(payload, { onConflict: "panel_mensaje_id" });
        if (error) throw error;
        saved += 1;
      }
      res.json({ ok: true, pedido_live_id: liveOrder.id, saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.post("/recalculate-confidence", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const result = await recalculateAllConfidences(supabase, userId);
      res.json({ ok: true, updated: result.updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.get("/stats", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const [{ data: profiles }, { data: evidence }] = await Promise.all([
        supabase.from("identity_profiles").select("id, confidence, panel_phone, store_phone, cliente_id").eq("user_id", userId),
        supabase.from("identity_evidence").select("source").eq("user_id", userId)
      ]);
      const bySource = {};
      for (const e of evidence ?? []) bySource[e.source] = (bySource[e.source] ?? 0) + 1;
      const lowConfidence = (profiles ?? []).filter((p) => p.confidence < 0.7).length;
      const multiChannel = (profiles ?? []).filter(
        (p) => [p.panel_phone, p.store_phone, p.cliente_id].filter(Boolean).length >= 2
      ).length;
      res.json({
        total_profiles: (profiles ?? []).length,
        low_confidence: lowConfidence,
        multi_channel: multiChannel,
        evidence_by_source: bySource,
        total_evidence: (evidence ?? []).length
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.post("/profiles/:id/merge", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { source_id } = req.body;
    if (!source_id) return res.status(400).json({ error: "source_id requerido" });
    const targetId = req.params.id;
    if (targetId === source_id) return res.status(400).json({ error: "target y source no pueden ser iguales" });
    try {
      const [{ data: target }, { data: source }] = await Promise.all([
        supabase.from("identity_profiles").select("*").eq("id", targetId).eq("user_id", userId).single(),
        supabase.from("identity_profiles").select("*").eq("id", source_id).eq("user_id", userId).single()
      ]);
      if (!target) return res.status(404).json({ error: "Perfil destino no encontrado" });
      if (!source) return res.status(404).json({ error: "Perfil origen no encontrado" });
      await supabase.from("identity_evidence").update({ profile_id: targetId }).eq("profile_id", source_id).eq("user_id", userId);
      const updates = {
        merged_from: [...target.merged_from ?? [], source_id]
      };
      if (!target.phone && source.phone) updates.phone = source.phone;
      if (!target.panel_phone && source.panel_phone) updates.panel_phone = source.panel_phone;
      if (!target.store_phone && source.store_phone) updates.store_phone = source.store_phone;
      if (!target.cliente_id && source.cliente_id) updates.cliente_id = source.cliente_id;
      await supabase.from("identity_profiles").update(updates).eq("id", targetId);
      await supabase.from("identity_profiles").delete().eq("id", source_id).eq("user_id", userId);
      const { data: merged } = await supabase.from("identity_profiles").select("*").eq("id", targetId).single();
      res.json({ ok: true, profile: merged });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.patch("/evidence/:id/reassign", async (req, res) => {
    const userId = uid2(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { profile_id } = req.body;
    if (!profile_id) return res.status(400).json({ error: "profile_id requerido" });
    try {
      const { data, error } = await supabase.from("identity_evidence").update({ profile_id }).eq("id", req.params.id).eq("user_id", userId).select().single();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: "Evidencia no encontrada" });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  return router;
}

// src/routes/live-sales.ts
import { Router as Router3 } from "express";

// src/services/liveReceiptAnalyzer.ts
var DEFAULT_OWNER_NAME = "LEIDY CANDY DIAZ SANCHEZ";
var DEFAULT_VISION_MODEL = "google/gemini-2.5-flash-lite";
var MAX_AMOUNT_AUTO_VERIFY_BS = 1e3;
var ANALYSIS_TIMEOUT_MS = 15e3;
function firstJsonObject(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}
function parseAmount(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^\d.,-]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}
function normalizeReceiptResponse(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    es_comprobante: raw.es_comprobante === true,
    pagador: typeof raw.pagador === "string" && raw.pagador.trim() ? raw.pagador.trim() : null,
    receptor: typeof raw.receptor === "string" && raw.receptor.trim() ? raw.receptor.trim() : null,
    monto: parseAmount(raw.monto),
    hora: typeof raw.hora === "string" && raw.hora.trim() ? raw.hora.trim() : null,
    es_transferencia_propia: raw.es_transferencia_propia === true
  };
}
function boliviaDateKey2(value = /* @__PURE__ */ new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const offsetMs = 4 * 60 * 60 * 1e3;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 10);
}
async function getOwnerName(mainDb, userId) {
  try {
    const { data } = await mainDb.from("ai_config").select("owner_name").eq("user_id", userId).single();
    const value = data?.owner_name?.trim();
    return value || DEFAULT_OWNER_NAME;
  } catch {
    return DEFAULT_OWNER_NAME;
  }
}
async function getVisionModel(_mainDb, _userId) {
  return process.env.OPENROUTER_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;
}
async function callVisionExtraction(params) {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://ventas-live.vercel.app",
      "X-Title": "Ventas Live - An\xE1lisis Autom\xE1tico"
    },
    body: JSON.stringify({
      model: params.model,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 300,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: params.prompt },
          { type: "image_url", image_url: { url: params.imageDataUrl } }
        ]
      }]
    }),
    signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS)
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`OpenRouter HTTP ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  const textResp = typeof content === "string" ? content : Array.isArray(content) ? content.map((item) => item?.text ?? "").join("") : "";
  const jsonStr = firstJsonObject(textResp) ?? textResp;
  try {
    return normalizeReceiptResponse(JSON.parse(jsonStr));
  } catch {
    return null;
  }
}
async function fetchImageAsDataUrl(url4) {
  try {
    const resp = await fetch(url4, { signal: AbortSignal.timeout(1e4) });
    if (!resp.ok) return null;
    const mime = resp.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await resp.arrayBuffer());
    return { dataUrl: `data:${mime};base64,${buf.toString("base64")}`, mime };
  } catch {
    return null;
  }
}
async function isAmountRepeatedAcrossClients(panelDb, amount, clienteId, windowHours = 1) {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1e3).toISOString();
  const { data } = await panelDb.from("pagos_venta_live").select("id, cliente_id").eq("monto", amount).gte("created_at", since);
  if (!data || data.length < 2) return false;
  const distinctClients = new Set(data.map((p) => p.cliente_id).filter(Boolean));
  distinctClients.add(clienteId);
  return distinctClients.size >= 3;
}
async function analyzeLiveReceipt(panelDb, mainDb, input) {
  const phone = normalizeLivePhone(input.phone);
  if (!phone) return { ok: false, error: "Tel\xE9fono inv\xE1lido" };
  if (!input.mediaUrl) return { ok: true, created: false, reason: "sin_media" };
  const mediaType = (input.mediaType || "").toLowerCase();
  const looksLikeImage = mediaType.startsWith("image/") || /\.(jpe?g|png|webp)/i.test(input.mediaUrl);
  if (!looksLikeImage) return { ok: true, created: false, reason: "no_es_imagen" };
  const { data: existing } = await panelDb.from("pagos_venta_live").select("id, estado").eq("panel_mensaje_id", input.panelMensajeId).limit(1).maybeSingle();
  if (existing) {
    return {
      ok: true,
      created: true,
      pagoLiveId: existing.id,
      estado: existing.estado,
      matchedMacrodroid: existing.estado === "verificado_macrodroid"
    };
  }
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "OPENROUTER_API_KEY no configurada" };
  const image = await fetchImageAsDataUrl(input.mediaUrl);
  if (!image) return { ok: true, created: false, reason: "no_se_pudo_descargar_imagen" };
  const ownerName = await getOwnerName(mainDb, input.userId);
  const model = await getVisionModel(mainDb, input.userId);
  const prompt = buildReceiptQrPrompt(ownerName);
  let extraction = null;
  try {
    extraction = await callVisionExtraction({ apiKey, model, prompt, imageDataUrl: image.dataUrl });
  } catch (err) {
    return { ok: false, error: `IA: ${err?.message ?? "error desconocido"}` };
  }
  if (!extraction) return { ok: true, created: false, reason: "respuesta_ia_invalida" };
  if (!extraction.es_comprobante) {
    return { ok: true, created: false, reason: "no_es_comprobante" };
  }
  if (extraction.es_transferencia_propia) {
    return { ok: true, created: false, reason: "transferencia_propia_de_la_due\xF1a" };
  }
  if (!extraction.monto || extraction.monto <= 0) {
    return { ok: true, created: false, reason: "sin_monto_extraido" };
  }
  if (extraction.monto > MAX_AMOUNT_AUTO_VERIFY_BS && !extraction.pagador) {
    return { ok: true, created: false, reason: "monto_alto_sin_pagador_probable_alucinacion" };
  }
  let pagadorFinal = extraction.pagador;
  let pagadorEsTemporal = false;
  if (!pagadorFinal) {
    const { data: clientePanel } = await panelDb.from("panel_clientes").select("nombre").eq("id", input.clienteId).maybeSingle();
    const nombrePanel = (clientePanel?.nombre || "").trim();
    if (nombrePanel && nombrePanel.toLowerCase() !== "sin nombre") {
      pagadorFinal = nombrePanel.toUpperCase();
    } else {
      pagadorFinal = `WHATSAPP ${phone}`;
      pagadorEsTemporal = true;
    }
  }
  const amountRepeated = await isAmountRepeatedAcrossClients(panelDb, extraction.monto, input.clienteId);
  const isHighAmount = extraction.monto > MAX_AMOUNT_AUTO_VERIFY_BS;
  const forceManualReview = amountRepeated || isHighAmount;
  const initialEstado = forceManualReview ? "revision_manual" : "pendiente_whatsapp";
  const fechaPedido = boliviaDateKey2(input.messageCreatedAt);
  const messageTime = new Date(input.messageCreatedAt).getTime();
  let comprobanteAt = receiptAtFromMessage(input.messageCreatedAt, extraction.hora);
  const compTime = new Date(comprobanteAt).getTime();
  const diffHours = Math.abs(messageTime - compTime) / (60 * 60 * 1e3);
  if (diffHours > 12) {
    comprobanteAt = input.messageCreatedAt;
  }
  const comprobanteTexto = [
    pagadorFinal,
    `Bs ${extraction.monto}`,
    extraction.hora
  ].filter(Boolean).join(" - ");
  const order = await ensurePanelLiveOrder(panelDb, {
    clienteId: input.clienteId,
    phone,
    fechaPedido,
    nombreDetectado: pagadorFinal,
    isTest: false
  });
  await upsertLiveEvidence(panelDb, {
    pedidoLiveId: order.id,
    clienteId: input.clienteId,
    panelMensajeId: input.panelMensajeId,
    tipo: "comprobante",
    mediaUrl: input.mediaUrl,
    mediaType: input.mediaType,
    content: input.messageContent,
    descripcion: comprobanteTexto || "Comprobante detectado autom\xE1ticamente",
    messageCreatedAt: input.messageCreatedAt,
    metadata: {
      source: "auto_analyzer",
      extracted: extraction,
      pagador_temporal: pagadorEsTemporal,
      flagged_amount_repeated: amountRepeated,
      flagged_high_amount: isHighAmount
    }
  });
  let pagoLive = await upsertWhatsappLivePayment(panelDb, {
    pedidoLiveId: order.id,
    clienteId: input.clienteId,
    phone,
    fechaPedido,
    nombreDetectado: pagadorFinal,
    monto: extraction.monto,
    comprobanteHora: extraction.hora,
    comprobanteAt,
    comprobanteTexto: comprobanteTexto || null,
    comprobanteMediaUrl: input.mediaUrl,
    panelMensajeId: input.panelMensajeId,
    isTest: false
  });
  if (forceManualReview && pagoLive.estado === "pendiente_whatsapp") {
    const reasons = [];
    if (amountRepeated) reasons.push("monto_repetido_entre_clientes");
    if (isHighAmount) reasons.push(`monto_alto_>_${MAX_AMOUNT_AUTO_VERIFY_BS}`);
    const { data: updated } = await panelDb.from("pagos_venta_live").update({
      estado: "revision_manual",
      match_score: 0.4,
      match_reason: reasons.join("|")
    }).eq("id", pagoLive.id).select("*").single();
    if (updated) pagoLive = updated;
  }
  let updatedOrder = await recomputeLiveOrderTotals(panelDb, order.id);
  updatedOrder = await syncMainPedidoForLiveOrder(panelDb, mainDb, input.userId, updatedOrder);
  pagoLive = await matchLivePaymentWithMacrodroid(panelDb, mainDb, {
    userId: input.userId,
    pagoLive,
    mainCustomerId: updatedOrder.main_customer_id,
    windowMinutes: 5
  });
  updatedOrder = await recomputeLiveOrderTotals(panelDb, order.id);
  await syncMainPedidoForLiveOrder(panelDb, mainDb, input.userId, updatedOrder);
  return {
    ok: true,
    created: true,
    pagoLiveId: pagoLive.id,
    estado: pagoLive.estado,
    matchedMacrodroid: pagoLive.estado === "verificado_macrodroid"
  };
}

// src/routes/live-sales.ts
var ESTADOS_TARJETA = [
  "conversacion",
  "comprobante_recibido",
  "esperando_macrodroid",
  "revision_manual",
  "archivado"
];
function uid(req) {
  return req.headers["x-user-id"] || null;
}
function normalizePanelPhone(raw) {
  return normalizeLivePhone(raw);
}
function parseMonto(raw) {
  return parseLiveMonto(raw);
}
function whatsappMediaPath(raw) {
  if (!raw) return null;
  const value = String(raw);
  const marker = "/object/public/whatsapp-media/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex >= 0) return value.slice(markerIndex + marker.length).split("?")[0] || null;
  if (!value.startsWith("http") && value.includes("/")) return value.replace(/^whatsapp-media\//, "");
  return null;
}
async function deleteWhatsappMediaFiles(panelDb, urls) {
  const paths = [...new Set(urls.map(whatsappMediaPath).filter(Boolean))];
  if (paths.length === 0) return 0;
  let deleted = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { data, error } = await panelDb.storage.from("whatsapp-media").remove(chunk);
    if (error) throw error;
    deleted += data?.length ?? chunk.length;
  }
  return deleted;
}
function normalizeEstado(raw, fallback) {
  return ESTADOS_TARJETA.includes(raw) ? raw : fallback;
}
function normalizeResumen(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { texto: raw };
    } catch {
      return { texto: raw };
    }
  }
  return typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}
async function findExistingMainPayment(supabaseMain, input) {
  const center = input.centerAt ? new Date(input.centerAt).getTime() : Date.now();
  const safeCenter = Number.isFinite(center) ? center : Date.now();
  const from = new Date(safeCenter - 24 * 60 * 60 * 1e3).toISOString();
  const to = new Date(safeCenter + 24 * 60 * 60 * 1e3).toISOString();
  const { data, error } = await supabaseMain.from("pagos").select("id,nombre,pago,date,created_at,customer_id,method").eq("user_id", input.userId).eq("pago", input.monto).gte("created_at", from).lte("created_at", to).order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  return (data ?? []).find((p) => {
    if (Number(p.customer_id) === Number(input.customerId)) return true;
    return namesMatch(p.nombre, input.nombre);
  }) ?? null;
}
function buildCardPayload(body, fallbackEstado) {
  const phone = normalizePanelPhone(body.phone);
  const estado = normalizeEstado(body.estado, fallbackEstado);
  return {
    cliente_id: body.clienteId ?? body.cliente_id ?? null,
    phone,
    nombre_detectado: body.nombreDetectado ?? body.nombre_detectado ?? null,
    monto_detectado: parseMonto(body.montoDetectado ?? body.monto_detectado),
    resumen: normalizeResumen(body.resumen),
    comprobante_texto: body.comprobanteTexto ?? body.comprobante_texto ?? null,
    comprobante_media_url: body.comprobanteMediaUrl ?? body.comprobante_media_url ?? null,
    estado,
    is_test: body.isTest ?? body.is_test ?? true
  };
}
function createLiveSalesRouter(supabasePanel2, supabaseMain, supabaseStore2) {
  const router = Router3();
  function parseSessionNotes(raw) {
    if (!raw) return {};
    if (typeof raw !== "string") return typeof raw === "object" ? raw : {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  function sessionRange(session) {
    if (!session?.scheduled_at) return null;
    const start = new Date(session.scheduled_at);
    if (!Number.isFinite(start.getTime())) return null;
    const notes = parseSessionNotes(session.notes);
    const explicitEnd = notes.ended_at ?? notes.end_at ?? null;
    const end = explicitEnd ? new Date(explicitEnd) : new Date(start.getTime() + Math.max(1, Number(session.duration ?? 0)) * 60 * 1e3);
    if (!Number.isFinite(end.getTime()) || end <= start) return null;
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  }
  function publicSession(session) {
    if (!session) return null;
    const range = sessionRange(session);
    return {
      id: session.id,
      title: session.title ?? "",
      status: session.status ?? "",
      startAt: range?.startAt ?? session.scheduled_at ?? null,
      endAt: range?.endAt ?? null,
      duration: session.duration ?? null,
      createdAt: session.created_at ?? null,
      notes: parseSessionNotes(session.notes)
    };
  }
  async function getActiveProcessingLive(userId) {
    if (!supabaseMain) return null;
    const { data, error } = await supabaseMain.from("live_sessions").select("id,title,scheduled_at,duration,status,notes,created_at").eq("user_id", userId).eq("status", "live").ilike("title", "Procesamiento Live%").order("scheduled_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }
  async function getLastCompletedProcessingLive(userId) {
    if (!supabaseMain) return null;
    const { data, error } = await supabaseMain.from("live_sessions").select("id,title,scheduled_at,duration,status,notes,created_at").eq("user_id", userId).eq("status", "completed").ilike("title", "Procesamiento Live%").order("scheduled_at", { ascending: false }).limit(10);
    if (error) throw error;
    return (data ?? []).find((session) => !parseSessionNotes(session.notes).processed_at) ?? null;
  }
  async function getLastAnyLive(userId) {
    if (!supabaseMain) return null;
    const { data, error } = await supabaseMain.from("live_sessions").select("id,title,scheduled_at,duration,status,notes,created_at").eq("user_id", userId).in("status", ["completed", "live"]).ilike("title", "Procesamiento Live%").order("scheduled_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }
  router.get("/sessions/current", async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    if (!supabaseMain) return res.status(503).json({ error: "Base principal no disponible" });
    try {
      const [active, lastCompleted, lastAny] = await Promise.all([
        getActiveProcessingLive(userId),
        getLastCompletedProcessingLive(userId),
        getLastAnyLive(userId)
      ]);
      res.json({
        active: publicSession(active),
        lastCompleted: publicSession(lastCompleted),
        lastAny: publicSession(lastAny)
      });
    } catch (err) {
      console.error("[live-sales/sessions/current]", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });
  router.post("/sessions/start", async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    if (!supabaseMain) return res.status(503).json({ error: "Base principal no disponible" });
    try {
      const existing = await getActiveProcessingLive(userId);
      if (existing) return res.json({ ok: true, reused: true, session: publicSession(existing) });
      const now = /* @__PURE__ */ new Date();
      const { data, error } = await supabaseMain.from("live_sessions").insert({
        title: `Procesamiento Live ${now.toLocaleDateString("es-BO")}`,
        scheduled_at: now.toISOString(),
        duration: 1,
        status: "live",
        notes: JSON.stringify({
          kind: "whatsapp_live_processing",
          started_at: now.toISOString(),
          source: "payments_live_button"
        }),
        user_id: userId
      }).select("id,title,scheduled_at,duration,status,notes,created_at").single();
      if (error) throw error;
      res.status(201).json({ ok: true, session: publicSession(data) });
    } catch (err) {
      console.error("[live-sales/sessions/start]", err);
      res.status(500).json({ error: err?.message ?? "No se pudo iniciar Live" });
    }
  });
  router.post("/sessions/close", async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    if (!supabaseMain) return res.status(503).json({ error: "Base principal no disponible" });
    try {
      const active = await getActiveProcessingLive(userId);
      if (!active) return res.status(409).json({ error: "No hay Live iniciado para cerrar" });
      if (!active.scheduled_at) return res.status(409).json({ error: "El Live activo no tiene hora de inicio guardada" });
      const requestedEndAt = req.body?.endAt ? new Date(req.body.endAt) : null;
      const now = requestedEndAt && Number.isFinite(requestedEndAt.getTime()) ? requestedEndAt : /* @__PURE__ */ new Date();
      const start = new Date(active.scheduled_at);
      if (!Number.isFinite(start.getTime())) return res.status(409).json({ error: "La hora de inicio del Live no es valida" });
      if (now <= start) return res.status(409).json({ error: "La hora de cierre debe ser posterior al inicio del Live" });
      if (now.getTime() > Date.now() + 5 * 60 * 1e3) return res.status(409).json({ error: "La hora de cierre no puede estar en el futuro" });
      const duration = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 6e4));
      const notes = {
        ...parseSessionNotes(active.notes),
        kind: "whatsapp_live_processing",
        started_at: start.toISOString(),
        ended_at: now.toISOString(),
        closed_at: now.toISOString(),
        source: "payments_live_button"
      };
      const { data, error } = await supabaseMain.from("live_sessions").update({
        duration,
        status: "completed",
        notes: JSON.stringify(notes)
      }).eq("id", active.id).eq("user_id", userId).eq("status", "live").select("id,title,scheduled_at,duration,status,notes,created_at").single();
      if (error) throw error;
      res.json({ ok: true, session: publicSession(data) });
    } catch (err) {
      console.error("[live-sales/sessions/close]", err);
      res.status(500).json({ error: err?.message ?? "No se pudo cerrar Live" });
    }
  });
  router.post("/sessions/:id/processed", async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    if (!supabaseMain) return res.status(503).json({ error: "Base principal no disponible" });
    try {
      const { data: session, error: readError } = await supabaseMain.from("live_sessions").select("id,title,scheduled_at,duration,status,notes,created_at").eq("id", req.params.id).eq("user_id", userId).eq("status", "completed").single();
      if (readError) throw readError;
      const notes = {
        ...parseSessionNotes(session.notes),
        processed_at: (/* @__PURE__ */ new Date()).toISOString(),
        processed_source: "payments_live_button"
      };
      const { data, error } = await supabaseMain.from("live_sessions").update({ notes: JSON.stringify(notes) }).eq("id", req.params.id).eq("user_id", userId).select("id,title,scheduled_at,duration,status,notes,created_at").single();
      if (error) throw error;
      res.json({ ok: true, session: publicSession(data) });
    } catch (err) {
      console.error("[live-sales/sessions/processed]", err);
      res.status(500).json({ error: err?.message ?? "No se pudo marcar Live como procesado" });
    }
  });
  async function listDayOrders(filters) {
    let query = supabasePanel2.from("pedidos_venta_live").select("*").order("fecha_pedido", { ascending: false }).order("updated_at", { ascending: false });
    if (filters.clienteId) query = query.eq("cliente_id", filters.clienteId);
    if (filters.phone) query = query.eq("phone", filters.phone);
    if (filters.fecha) query = query.eq("fecha_pedido", filters.fecha);
    if (!filters.includeArchived) query = query.neq("estado", "archivado");
    const { data: orders, error } = await query;
    if (error) throw error;
    const ids = (orders ?? []).map((order) => order.id);
    if (ids.length === 0) return [];
    const [{ data: pagos, error: pagosError }, { data: evidencias, error: evidenciasError }] = await Promise.all([
      supabasePanel2.from("pagos_venta_live").select("*").in("pedido_live_id", ids).order("comprobante_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
      supabasePanel2.from("evidencias_venta_live").select("*").in("pedido_live_id", ids).order("message_created_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false })
    ]);
    if (pagosError) throw pagosError;
    if (evidenciasError) throw evidenciasError;
    return (orders ?? []).map((order) => ({
      ...order,
      pagos: (pagos ?? []).filter((p) => p.pedido_live_id === order.id),
      evidencias: (evidencias ?? []).filter((e) => e.pedido_live_id === order.id)
    }));
  }
  async function recomputeAndSync(userId, pedidoLiveId) {
    let order = await recomputeLiveOrderTotals(supabasePanel2, pedidoLiveId);
    if (supabaseMain) {
      order = await syncMainPedidoForLiveOrder(supabasePanel2, supabaseMain, userId, order);
    }
    return order;
  }
  async function syncPanelClientEstado(clienteId, order) {
    const estadoPanel = String(order?.estado ?? "") === "pagos_verificados" ? "pagado_verificado" : "solo_comprobante";
    await supabasePanel2.from("panel_clientes").update({ estado: estadoPanel }).eq("id", clienteId);
  }
  router.get("/cards", async (req, res) => {
    if (!uid(req)) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const clienteId = req.query.clienteId ?? req.query.cliente_id;
      const phone = normalizePanelPhone(req.query.phone);
      const includeArchived = req.query.includeArchived === "true";
      let query = supabasePanel2.from("tarjetas_venta_live").select("*").order("updated_at", { ascending: false });
      if (clienteId) query = query.eq("cliente_id", String(clienteId));
      if (phone) query = query.eq("phone", phone);
      if (!includeArchived) query = query.neq("estado", "archivado");
      const { data, error } = await query;
      if (error) throw error;
      res.json({ ok: true, cards: data ?? [] });
    } catch (err) {
      console.error("[live-sales/cards:get]", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });
  router.post("/cards", async (req, res) => {
    if (!uid(req)) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const payload = buildCardPayload(req.body, "conversacion");
      if (!payload.phone) return res.status(400).json({ error: "phone requerido" });
      if (!payload.cliente_id) return res.status(400).json({ error: "clienteId requerido" });
      const { data: existing, error: existingError } = await supabasePanel2.from("tarjetas_venta_live").select("*").eq("phone", payload.phone).neq("estado", "archivado").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const { data: data2, error: error2 } = await supabasePanel2.from("tarjetas_venta_live").update(payload).eq("id", existing.id).select("*").single();
        if (error2) throw error2;
        return res.json({ ok: true, card: data2 });
      }
      const { data, error } = await supabasePanel2.from("tarjetas_venta_live").insert(payload).select("*").single();
      if (error) throw error;
      res.status(201).json({ ok: true, card: data });
    } catch (err) {
      console.error("[live-sales/cards:post]", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });
  router.patch("/cards/:id", async (req, res) => {
    if (!uid(req)) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const payload = {};
      if ("clienteId" in req.body || "cliente_id" in req.body) payload.cliente_id = req.body.clienteId ?? req.body.cliente_id;
      if ("phone" in req.body) {
        const phone = normalizePanelPhone(req.body.phone);
        if (!phone) return res.status(400).json({ error: "phone invalido" });
        payload.phone = phone;
      }
      if ("nombreDetectado" in req.body || "nombre_detectado" in req.body) payload.nombre_detectado = req.body.nombreDetectado ?? req.body.nombre_detectado ?? null;
      if ("montoDetectado" in req.body || "monto_detectado" in req.body) payload.monto_detectado = parseMonto(req.body.montoDetectado ?? req.body.monto_detectado);
      if ("resumen" in req.body) payload.resumen = normalizeResumen(req.body.resumen);
      if ("comprobanteTexto" in req.body || "comprobante_texto" in req.body) payload.comprobante_texto = req.body.comprobanteTexto ?? req.body.comprobante_texto ?? null;
      if ("comprobanteMediaUrl" in req.body || "comprobante_media_url" in req.body) payload.comprobante_media_url = req.body.comprobanteMediaUrl ?? req.body.comprobante_media_url ?? null;
      if ("estado" in req.body) payload.estado = normalizeEstado(req.body.estado, "revision_manual");
      if ("isTest" in req.body || "is_test" in req.body) payload.is_test = req.body.isTest ?? req.body.is_test;
      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ error: "No hay cambios para guardar" });
      }
      const { data, error } = await supabasePanel2.from("tarjetas_venta_live").update(payload).eq("id", req.params.id).select("*").single();
      if (error) throw error;
      res.json({ ok: true, card: data });
    } catch (err) {
      console.error("[live-sales/cards:patch]", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });
  router.post("/cards/:id/archive", async (req, res) => {
    if (!uid(req)) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const { data, error } = await supabasePanel2.from("tarjetas_venta_live").update({ estado: "archivado" }).eq("id", req.params.id).select("*").single();
      if (error) throw error;
      res.json({ ok: true, card: data });
    } catch (err) {
      console.error("[live-sales/cards:archive]", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });
  router.get("/day-orders", async (req, res) => {
    if (!uid(req)) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const clienteId = req.query.clienteId ?? req.query.cliente_id;
      const phone = normalizePanelPhone(req.query.phone);
      const fecha = req.query.fecha ? String(req.query.fecha) : null;
      const includeArchived = req.query.includeArchived === "true";
      const orders = await listDayOrders({
        clienteId: clienteId ? String(clienteId) : null,
        phone,
        fecha,
        includeArchived
      });
      res.json({ ok: true, orders });
    } catch (err) {
      console.error("[live-sales/day-orders:get]", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });
  router.post("/payments/:id/verify-manual", async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    if (!supabaseMain) return res.status(503).json({ error: "Base principal no configurada" });
    try {
      const { data: pagoLive, error: pagoError } = await supabasePanel2.from("pagos_venta_live").select("*").eq("id", req.params.id).single();
      if (pagoError) throw pagoError;
      const monto = parseMonto(pagoLive.monto);
      if (!monto || monto <= 0) return res.status(400).json({ error: "El pago no tiene monto valido" });
      const { data: pedidoLive, error: orderError } = await supabasePanel2.from("pedidos_venta_live").select("*").eq("id", pagoLive.pedido_live_id).single();
      if (orderError) throw orderError;
      const nombre = pagoLive.nombre_detectado || pedidoLive.nombre_detectado;
      if (!nombre) return res.status(400).json({ error: "Falta nombre detectado para verificar manualmente" });
      const customer = await ensureMainCustomerForLive(supabaseMain, userId, nombre, pagoLive.phone);
      await ensureMainDailyPedido(supabaseMain, {
        userId,
        customerId: Number(customer.id),
        customerName: customer.full_name || nombre,
        fechaPedido: pagoLive.fecha_pedido,
        totalAmount: parseMonto(pedidoLive.total_comprobantes) ?? monto
      });
      let mainPagoId = pagoLive.main_pago_id ? Number(pagoLive.main_pago_id) : null;
      let reusedExistingPayment = !!mainPagoId;
      if (!mainPagoId) {
        const existingPago = await findExistingMainPayment(supabaseMain, {
          userId,
          customerId: Number(customer.id),
          nombre,
          monto,
          centerAt: pagoLive.comprobante_at ?? pagoLive.created_at
        });
        if (existingPago) {
          mainPagoId = Number(existingPago.id);
          reusedExistingPayment = true;
        } else {
          const { data: pagoMain, error: mainPagoError } = await supabaseMain.from("pagos").insert({
            nombre,
            pago: monto,
            method: "Verificacion manual WhatsApp",
            status: "pending",
            verified: true,
            date: pagoLive.comprobante_at ?? (/* @__PURE__ */ new Date()).toISOString(),
            user_id: userId,
            customer_id: Number(customer.id)
          }).select("id").single();
          if (mainPagoError) throw mainPagoError;
          mainPagoId = Number(pagoMain.id);
        }
      }
      if (supabaseStore2 && pagoLive.phone && monto) {
        try {
          const phoneRaw = String(pagoLive.phone).replace(/\D/g, "");
          const phoneShort = phoneRaw.slice(-8);
          const todayStart = /* @__PURE__ */ new Date();
          todayStart.setHours(0, 0, 0, 0);
          const { data: storeOrder, error: storeErr } = await supabaseStore2.from("store_orders").select("id,items").or(`customer_wa.eq.${phoneRaw},customer_wa.eq.${phoneShort}`).eq("total", monto).eq("status", "pending").gte("created_at", todayStart.toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (!storeErr && storeOrder) {
            await supabaseStore2.from("store_orders").update({
              status: "paid",
              payment_verified_at: (/* @__PURE__ */ new Date()).toISOString(),
              payment_method: "qr",
              payment_ref: "whatsapp_manual"
            }).eq("id", storeOrder.id);
            try {
              const productIds = (storeOrder.items ?? []).map((i) => i.productId).filter(Boolean);
              if (productIds.length > 0) {
                await supabaseStore2.from("products").update({ stock: 0 }).in("id", productIds);
                console.log(`[live-sales] ${productIds.length} productos marcados como vendidos de orden #${storeOrder.id}`);
              }
            } catch (prodErr) {
              console.error("[live-sales] Error marcando productos vendidos:", prodErr);
            }
            console.log(`[live-sales] Orden de tienda #${storeOrder.id} marcada como pagada via verificaci\xF3n manual`);
          }
        } catch (storeLinkErr) {
          console.error("[live-sales] Error vinculando orden de tienda:", storeLinkErr);
        }
      }
      const { data: updatedPago, error: updateError } = await supabasePanel2.from("pagos_venta_live").update({
        estado: "verificado_manual",
        main_pago_id: mainPagoId,
        match_score: 1,
        match_reason: reusedExistingPayment ? "verificado_por_operador_pago_existente" : "verificado_por_operador"
      }).eq("id", pagoLive.id).select("*").single();
      if (updateError) throw updateError;
      const order = await recomputeAndSync(userId, pagoLive.pedido_live_id);
      await markMainCustomerVerified(supabaseMain, {
        userId,
        customerId: Number(customer.id),
        name: nombre,
        phone: pagoLive.phone,
        source: "manual"
      });
      await syncPanelClientEstado(String(pagoLive.cliente_id), order);
      res.json({ ok: true, payment: updatedPago, order });
    } catch (err) {
      console.error("[live-sales/payments:verify-manual]", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });
  router.post("/payments/:id/reject", async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const { data: pagoLive, error: pagoError } = await supabasePanel2.from("pagos_venta_live").select("*").eq("id", req.params.id).single();
      if (pagoError) throw pagoError;
      const { data: updatedPago, error: updateError } = await supabasePanel2.from("pagos_venta_live").update({
        estado: "rechazado",
        match_reason: req.body?.reason || "rechazado_por_operador"
      }).eq("id", pagoLive.id).select("*").single();
      if (updateError) throw updateError;
      const order = await recomputeAndSync(userId, pagoLive.pedido_live_id);
      await syncPanelClientEstado(String(pagoLive.cliente_id), order);
      res.json({ ok: true, payment: updatedPago, order });
    } catch (err) {
      console.error("[live-sales/payments:reject]", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });
  router.post("/day-orders/:id/archive", async (req, res) => {
    if (!uid(req)) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const { data, error } = await supabasePanel2.from("pedidos_venta_live").update({ estado: "archivado" }).eq("id", req.params.id).select("*").single();
      if (error) throw error;
      res.json({ ok: true, order: data });
    } catch (err) {
      console.error("[live-sales/day-orders:archive]", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });
  router.post("/test-cleanup", async (req, res) => {
    if (!uid(req)) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const phone = normalizePanelPhone(req.body.phone);
      if (!phone) return res.status(400).json({ error: "phone requerido" });
      const { data: clientes, error: clientesError } = await supabasePanel2.from("panel_clientes").select("id, phone").eq("phone", phone);
      if (clientesError) throw clientesError;
      const clienteIds = (clientes ?? []).map((c) => c.id).filter(Boolean);
      const { data: pedidosByPhone, error: pedidosPhoneError } = await supabasePanel2.from("pedidos_venta_live").select("id").eq("phone", phone);
      if (pedidosPhoneError && pedidosPhoneError.code !== "42P01") throw pedidosPhoneError;
      let pedidosByCliente = [];
      if (clienteIds.length > 0) {
        const { data, error } = await supabasePanel2.from("pedidos_venta_live").select("id").in("cliente_id", clienteIds);
        if (error && error.code !== "42P01") throw error;
        pedidosByCliente = data ?? [];
      }
      const pedidoIds = [...new Set([...pedidosByPhone ?? [], ...pedidosByCliente].map((p) => p.id).filter(Boolean))];
      const mediaUrls = [];
      if (clienteIds.length > 0) {
        const { data: mensajesMedia, error: mensajesMediaError } = await supabasePanel2.from("panel_mensajes").select("media_url").in("cliente_id", clienteIds).not("media_url", "is", null);
        if (mensajesMediaError) throw mensajesMediaError;
        mediaUrls.push(...(mensajesMedia ?? []).map((m) => m.media_url));
      }
      if (pedidoIds.length > 0) {
        const [{ data: pagosMedia, error: pagosMediaError }, { data: evidenciasMedia, error: evidenciasMediaError }] = await Promise.all([
          supabasePanel2.from("pagos_venta_live").select("comprobante_media_url").in("pedido_live_id", pedidoIds).not("comprobante_media_url", "is", null),
          supabasePanel2.from("evidencias_venta_live").select("media_url").in("pedido_live_id", pedidoIds).not("media_url", "is", null)
        ]);
        if (pagosMediaError && pagosMediaError.code !== "42P01") throw pagosMediaError;
        if (evidenciasMediaError && evidenciasMediaError.code !== "42P01") throw evidenciasMediaError;
        mediaUrls.push(...(pagosMedia ?? []).map((p) => p.comprobante_media_url));
        mediaUrls.push(...(evidenciasMedia ?? []).map((e) => e.media_url));
      }
      const deleted = {
        mediaFiles: 0,
        tarjetasPorPhone: 0,
        tarjetasPorCliente: 0,
        pagosLivePorPhone: 0,
        pagosLivePorPedido: 0,
        evidenciasLivePorPedido: 0,
        pedidosLivePorPhone: 0,
        pedidosLivePorCliente: 0,
        mensajes: 0,
        clientes: 0
      };
      deleted.mediaFiles = await deleteWhatsappMediaFiles(supabasePanel2, mediaUrls);
      const pagosByPhone = await supabasePanel2.from("pagos_venta_live").delete({ count: "exact" }).eq("phone", phone);
      if (pagosByPhone.error && pagosByPhone.error.code !== "42P01") throw pagosByPhone.error;
      deleted.pagosLivePorPhone = pagosByPhone.count ?? 0;
      if (pedidoIds.length > 0) {
        const evidenciasByPedido = await supabasePanel2.from("evidencias_venta_live").delete({ count: "exact" }).in("pedido_live_id", pedidoIds);
        if (evidenciasByPedido.error && evidenciasByPedido.error.code !== "42P01") throw evidenciasByPedido.error;
        deleted.evidenciasLivePorPedido = evidenciasByPedido.count ?? 0;
        const pagosByPedido = await supabasePanel2.from("pagos_venta_live").delete({ count: "exact" }).in("pedido_live_id", pedidoIds);
        if (pagosByPedido.error && pagosByPedido.error.code !== "42P01") throw pagosByPedido.error;
        deleted.pagosLivePorPedido = pagosByPedido.count ?? 0;
      }
      const cardsByPhone = await supabasePanel2.from("tarjetas_venta_live").delete({ count: "exact" }).eq("phone", phone);
      if (cardsByPhone.error) throw cardsByPhone.error;
      deleted.tarjetasPorPhone = cardsByPhone.count ?? 0;
      const liveOrdersByPhone = await supabasePanel2.from("pedidos_venta_live").delete({ count: "exact" }).eq("phone", phone);
      if (liveOrdersByPhone.error && liveOrdersByPhone.error.code !== "42P01") throw liveOrdersByPhone.error;
      deleted.pedidosLivePorPhone = liveOrdersByPhone.count ?? 0;
      if (clienteIds.length > 0) {
        const cardsByCliente = await supabasePanel2.from("tarjetas_venta_live").delete({ count: "exact" }).in("cliente_id", clienteIds);
        if (cardsByCliente.error) throw cardsByCliente.error;
        deleted.tarjetasPorCliente = cardsByCliente.count ?? 0;
        const liveOrdersByCliente = await supabasePanel2.from("pedidos_venta_live").delete({ count: "exact" }).in("cliente_id", clienteIds);
        if (liveOrdersByCliente.error && liveOrdersByCliente.error.code !== "42P01") throw liveOrdersByCliente.error;
        deleted.pedidosLivePorCliente = liveOrdersByCliente.count ?? 0;
        const mensajes = await supabasePanel2.from("panel_mensajes").delete({ count: "exact" }).in("cliente_id", clienteIds);
        if (mensajes.error) throw mensajes.error;
        deleted.mensajes = mensajes.count ?? 0;
        const clientesDelete = await supabasePanel2.from("panel_clientes").delete({ count: "exact" }).in("id", clienteIds);
        if (clientesDelete.error) throw clientesDelete.error;
        deleted.clientes = clientesDelete.count ?? 0;
      }
      res.json({ ok: true, phone, clienteIds, deleted });
    } catch (err) {
      console.error("[live-sales/test-cleanup]", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });
  router.get("/conversations", async (req, res) => {
    if (!uid(req)) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const { data: clientes, error } = await supabasePanel2.from("panel_clientes").select("id, nombre, phone, resumen_at, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (clientes ?? []).map((c) => c.id);
      let msgCounts = {};
      if (ids.length > 0) {
        const { data: msgs } = await supabasePanel2.from("panel_mensajes").select("cliente_id").in("cliente_id", ids);
        for (const m of msgs ?? []) {
          msgCounts[m.cliente_id] = (msgCounts[m.cliente_id] ?? 0) + 1;
        }
      }
      const result = (clientes ?? []).map((c) => ({
        id: c.id,
        nombre: c.nombre ?? null,
        phone: c.phone ?? null,
        resumen_at: c.resumen_at ?? null,
        created_at: c.created_at,
        mensajes: msgCounts[c.id] ?? 0
      }));
      res.json({ conversaciones: result });
    } catch (err) {
      console.error("[live-sales/conversations GET]", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });
  router.delete("/conversations", async (req, res) => {
    if (!uid(req)) return res.status(401).json({ error: "x-user-id requerido" });
    const { ids } = req.body;
    try {
      let clienteIds;
      if (!ids || ids.length === 0) {
        const { data } = await supabasePanel2.from("panel_clientes").select("id");
        clienteIds = (data ?? []).map((c) => c.id);
      } else {
        clienteIds = ids;
      }
      if (clienteIds.length === 0) return res.json({ ok: true, borrados: 0 });
      await supabasePanel2.from("evidencias_venta_live").delete().in(
        "pedido_live_id",
        (await supabasePanel2.from("pedidos_venta_live").select("id").in("cliente_id", clienteIds)).data?.map((p) => p.id) ?? []
      );
      await supabasePanel2.from("pagos_venta_live").delete().in("cliente_id", clienteIds);
      await supabasePanel2.from("pedidos_venta_live").delete().in("cliente_id", clienteIds);
      await supabasePanel2.from("panel_mensajes").delete().in("cliente_id", clienteIds);
      await supabasePanel2.from("panel_clientes").delete().in("id", clienteIds);
      res.json({ ok: true, borrados: clienteIds.length });
    } catch (err) {
      console.error("[live-sales/conversations DELETE]", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });
  router.get("/pending-conversations", async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    try {
      const startAtRaw = typeof req.query.startAt === "string" ? req.query.startAt : "";
      const endAtRaw = typeof req.query.endAt === "string" ? req.query.endAt : "";
      const startAt = startAtRaw ? new Date(startAtRaw) : null;
      const endAt = endAtRaw ? new Date(endAtRaw) : null;
      const hasRange = Boolean(startAt && endAt && Number.isFinite(startAt.getTime()) && Number.isFinite(endAt.getTime()) && endAt > startAt);
      if ((startAtRaw || endAtRaw) && !hasRange) {
        return res.status(400).json({ error: "Rango de Live invalido" });
      }
      const { data: clientes, error } = await supabasePanel2.from("panel_clientes").select("id, nombre, phone, resumen_at").order("nombre", { ascending: true });
      if (error) throw error;
      const clienteIds = (clientes ?? []).map((c) => c.id);
      if (clienteIds.length === 0) return res.json({ clientes: [] });
      let mensajesQuery = supabasePanel2.from("panel_mensajes").select("cliente_id, created_at").in("cliente_id", clienteIds).order("created_at", { ascending: false });
      if (hasRange) {
        mensajesQuery = mensajesQuery.gte("created_at", startAt.toISOString()).lte("created_at", endAt.toISOString());
      }
      const { data: ultimosMensajes } = await mensajesQuery;
      const ultimoPorCliente = {};
      for (const m of ultimosMensajes ?? []) {
        if (!ultimoPorCliente[m.cliente_id]) {
          ultimoPorCliente[m.cliente_id] = m.created_at;
        }
      }
      const reanalyze = req.query.reanalyze === "true";
      if (reanalyze && await getActiveProcessingLive(userId)) {
        return res.status(409).json({ error: "No se puede re-analizar mientras hay un Live activo" });
      }
      const pendientes = (clientes ?? []).filter((c) => {
        const ultimoMsg = ultimoPorCliente[c.id];
        if (!ultimoMsg) return false;
        if (reanalyze) return true;
        if (!c.resumen_at) return true;
        return new Date(ultimoMsg) > new Date(c.resumen_at);
      }).map((c) => ({ id: c.id, nombre: c.nombre ?? "Sin nombre", phone: c.phone }));
      res.json({
        clientes: pendientes,
        range: hasRange ? { startAt: startAt.toISOString(), endAt: endAt.toISOString() } : null
      });
    } catch (err) {
      console.error("[live-sales/pending-conversations]", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });
  router.post("/analyze-receipt", async (req, res) => {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    if (!supabaseMain) return res.status(503).json({ error: "Base principal no disponible" });
    try {
      const { clienteId, phone, panelMensajeId, mediaUrl, mediaType, messageContent, messageCreatedAt, allowWithoutActiveLive } = req.body ?? {};
      if (!clienteId || !phone || !panelMensajeId || !mediaUrl || !messageCreatedAt) {
        return res.status(400).json({
          error: "Faltan campos: clienteId, phone, panelMensajeId, mediaUrl, messageCreatedAt"
        });
      }
      if (!allowWithoutActiveLive) {
        const activeSession = await getActiveProcessingLive(userId);
        if (!activeSession) {
          return res.json({ ok: true, skipped: true, reason: "sin_live_activo" });
        }
      }
      const result = await analyzeLiveReceipt(supabasePanel2, supabaseMain, {
        userId,
        clienteId: String(clienteId),
        phone: String(phone),
        panelMensajeId: String(panelMensajeId),
        mediaUrl: String(mediaUrl),
        mediaType: mediaType ? String(mediaType) : null,
        messageContent: messageContent ? String(messageContent) : null,
        messageCreatedAt: String(messageCreatedAt)
      });
      return res.json(result);
    } catch (err) {
      console.error("[live-sales/analyze-receipt]", err);
      res.status(500).json({ error: err?.message ?? "Error interno" });
    }
  });
  return router;
}

// src/routes/whatsapp.ts
import { Router as Router4 } from "express";
var BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL || "http://localhost:3000";
var BOLIVIA_TZ_OFFSET_MS = 4 * 60 * 60 * 1e3;
function boliviaTodayUtcRange(now = /* @__PURE__ */ new Date()) {
  const boliviaNow = new Date(now.getTime() - BOLIVIA_TZ_OFFSET_MS);
  const y = boliviaNow.getUTCFullYear();
  const m = String(boliviaNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(boliviaNow.getUTCDate()).padStart(2, "0");
  const start = /* @__PURE__ */ new Date(`${y}-${m}-${d}T04:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1e3);
  return { start, end };
}
function createWhatsappRouter(_supabase) {
  const router = Router4();
  router.get("/status", async (_req, res) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5e3);
      const response = await fetch(`${BRIDGE_URL}/status`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await response.json();
      res.status(response.ok ? 200 : 502).json(data);
    } catch {
      res.status(503).json({ connected: false, qrDataUrl: null, error: "connector_unreachable" });
    }
  });
  router.get("/health", async (_req, res) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5e3);
      const response = await fetch(`${BRIDGE_URL}/status`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await response.json();
      res.status(response.ok ? 200 : 502).json(data);
    } catch {
      res.status(503).json({ connected: false, error: "bridge_unreachable", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    }
  });
  router.get("/incoming-stats", async (_req, res) => {
    try {
      const { start, end } = boliviaTodayUtcRange();
      const [{ count, error: countError }, { data: todayRows, error: todayError }, { data: lastRows, error: lastError }, { data: auditRows, error: auditError }] = await Promise.all([
        supabasePanel.from("panel_mensajes").select("id", { count: "exact", head: true }).gte("created_at", start.toISOString()).lt("created_at", end.toISOString()),
        supabasePanel.from("panel_mensajes").select("cliente_id, has_media").gte("created_at", start.toISOString()).lt("created_at", end.toISOString()).limit(5e3),
        supabasePanel.from("panel_mensajes").select("id, content, has_media, media_type, created_at").order("created_at", { ascending: false }).limit(1),
        supabasePanel.from("panel_raw_webhooks").select("status, created_at").gte("created_at", start.toISOString()).lt("created_at", end.toISOString()).order("created_at", { ascending: false }).limit(5e3)
      ]);
      if (countError) return res.status(500).json({ error: countError.message });
      if (todayError) return res.status(500).json({ error: todayError.message });
      if (lastError) return res.status(500).json({ error: lastError.message });
      const last = lastRows?.[0] ?? null;
      const today = todayRows ?? [];
      const uniqueContactsToday = new Set(today.map((row) => row.cliente_id).filter(Boolean)).size;
      const mediaCountToday = today.filter((row) => row.has_media === true).length;
      const webhookStatusesToday = (auditRows ?? []).reduce((acc, row) => {
        const status = String(row.status ?? "unknown");
        acc[status] = (acc[status] ?? 0) + 1;
        return acc;
      }, {});
      res.json({
        todayCount: count ?? 0,
        uniqueContactsToday,
        textCountToday: Math.max(0, (count ?? 0) - mediaCountToday),
        mediaCountToday,
        webhookAuditAvailable: !auditError,
        webhookEventsToday: auditRows?.length ?? 0,
        webhookStatusesToday,
        lastMessageAt: last?.created_at ?? null,
        lastMessageHasMedia: !!last?.has_media,
        lastMessageType: last?.media_type ?? null,
        lastMessagePreview: String(last?.content ?? "").slice(0, 80)
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router.all(["/send-next", "/queue", "/queue/stats", "/queue/:id", "/retry/:id"], (_req, res) => {
    res.status(410).json({ error: "WhatsApp saliente desactivado. Solo se permite vincular y recibir." });
  });
  return router;
}
async function enqueueStoreConfirmation(..._args) {
  return { ok: false, queued: null, error: "WhatsApp saliente desactivado" };
}

// src/routes/store-selection.ts
import { Router as Router5 } from "express";
import crypto from "crypto";
function createStoreSelectionRouter(supabaseStore2) {
  const router = Router5();
  function generateToken() {
    return crypto.randomBytes(16).toString("hex");
  }
  function normalizePhone2(raw) {
    const p = String(raw ?? "").replace(/\D/g, "");
    if (!p) return "";
    if (p.startsWith("591")) return p;
    return "591" + p;
  }
  async function ensureStoreCustomer(customerWa, customerName) {
    const whatsapp = normalizePhone2(customerWa);
    if (!whatsapp) throw new Error("customer_wa requerido");
    const displayName = String(customerName ?? "").trim();
    const { data: existing, error: findError } = await supabaseStore2.from("store_customers").select("id, whatsapp, display_name").eq("whatsapp", whatsapp).maybeSingle();
    if (findError) throw findError;
    if (existing) return { ...existing, whatsapp, display_name: existing.display_name || displayName };
    const { data, error } = await supabaseStore2.from("store_customers").insert({ whatsapp, display_name: displayName, pin_hash: "profile-only" }).select("id, whatsapp, display_name").single();
    if (error) throw error;
    return data;
  }
  async function saveMediaReferences(input) {
    const customer = await ensureStoreCustomer(input.customerWa, input.customerName);
    const rows = (Array.isArray(input.media) ? input.media : []).map((item) => typeof item === "string" ? { media_url: item } : item).filter((item) => item?.media_url || item?.url).map((item) => ({
      customer_id: customer.id,
      customer_wa: customer.whatsapp,
      customer_name: customer.display_name || String(input.customerName ?? "").trim() || null,
      media_url: item.media_url ?? item.url,
      media_type: item.media_type ?? null,
      panel_mensaje_id: item.panel_mensaje_id ?? item.message_id ?? null,
      source_type: item.source_type ?? input.sourceType ?? "whatsapp_panel",
      source_id: String(item.source_id ?? input.sourceId ?? "") || null,
      tipo: item.tipo ?? "prenda",
      status: item.status ?? input.status,
      description: item.description ?? item.descripcion ?? null,
      message_created_at: item.message_created_at ?? item.created_at ?? null,
      metadata: item.metadata ?? {}
    }));
    if (rows.length === 0) return { customer, saved: 0 };
    const { error } = await supabaseStore2.from("store_customer_media").upsert(rows, { onConflict: "customer_wa,media_url" });
    if (error) throw error;
    return { customer, saved: rows.length };
  }
  router.post("/selection-request", async (req, res) => {
    try {
      const { customer_wa, customer_name, suggested_items, candidate_photos, confidence_score, source_type, source_id } = req.body;
      if (!customer_wa) {
        return res.status(400).json({ error: "customer_wa requerido" });
      }
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3);
      const customer = await ensureStoreCustomer(customer_wa, customer_name);
      const { data, error } = await supabaseStore2.from("store_selection_requests").insert({
        customer_id: customer.id,
        customer_wa: customer.whatsapp,
        customer_name: customer_name || "",
        suggested_items: suggested_items || [],
        candidate_photos: candidate_photos || [],
        confidence_score: confidence_score || 0,
        source_type: source_type || "live_payment",
        source_id: source_id || null,
        token,
        expires_at: expiresAt.toISOString(),
        status: "pending_customer"
      }).select().single();
      if (error) throw error;
      await saveMediaReferences({
        customerWa: customer.whatsapp,
        customerName: customer_name,
        media: candidate_photos || [],
        status: "candidata",
        sourceType: source_type || "selection_request",
        sourceId: data.id
      });
      res.status(201).json({
        ok: true,
        request: data,
        link: `/tienda/selection?token=${token}`
      });
    } catch (err) {
      console.error("[store/selection-request]", err);
      res.status(500).json({ error: err.message || "Error interno" });
    }
  });
  router.get("/selection/:token", async (req, res) => {
    try {
      const { data, error } = await supabaseStore2.from("store_selection_requests").select("*").eq("token", req.params.token).single();
      if (error || !data) {
        return res.status(404).json({ error: "Link no encontrado o vencido" });
      }
      if (data.expires_at && new Date(data.expires_at) < /* @__PURE__ */ new Date()) {
        return res.status(410).json({ error: "Link vencido" });
      }
      const { token, ...safe } = data;
      res.json({ ok: true, request: safe });
    } catch (err) {
      res.status(500).json({ error: err.message || "Error interno" });
    }
  });
  router.post("/selection/:token/confirm", async (req, res) => {
    try {
      const { selected_items, notes } = req.body;
      const { data: existing, error: findErr } = await supabaseStore2.from("store_selection_requests").select("*").eq("token", req.params.token).single();
      if (findErr || !existing) {
        return res.status(404).json({ error: "Link no encontrado" });
      }
      if (existing.expires_at && new Date(existing.expires_at) < /* @__PURE__ */ new Date()) {
        return res.status(410).json({ error: "Link vencido" });
      }
      if (existing.status !== "pending_customer" && existing.status !== "opened") {
        return res.status(409).json({ error: "Este link ya fue usado o cancelado" });
      }
      const { data, error } = await supabaseStore2.from("store_selection_requests").update({
        status: "confirmed",
        selected_items: selected_items || [],
        notes: notes || ""
      }).eq("id", existing.id).select().single();
      if (error) throw error;
      await saveMediaReferences({
        customerWa: existing.customer_wa,
        customerName: existing.customer_name,
        media: selected_items || [],
        status: "seleccionada",
        sourceType: "selection_confirmation",
        sourceId: existing.id
      });
      res.json({ ok: true, message: "Prendas confirmadas. Gracias!" });
    } catch (err) {
      res.status(500).json({ error: err.message || "Error interno" });
    }
  });
  router.post("/selection/:token/reject", async (req, res) => {
    try {
      const { notes } = req.body;
      const { data: existing, error: findErr } = await supabaseStore2.from("store_selection_requests").select("*").eq("token", req.params.token).single();
      if (findErr || !existing) {
        return res.status(404).json({ error: "Link no encontrado" });
      }
      if (existing.status !== "pending_customer" && existing.status !== "opened") {
        return res.status(409).json({ error: "Este link ya fue usado o cancelado" });
      }
      const { data, error } = await supabaseStore2.from("store_selection_requests").update({
        status: "rejected",
        notes: notes || "Cliente indica que ninguna prenda es correcta"
      }).eq("id", existing.id).select().single();
      if (error) throw error;
      res.json({ ok: true, message: "Respuesta registrada. Te contactaremos." });
    } catch (err) {
      res.status(500).json({ error: err.message || "Error interno" });
    }
  });
  router.post("/selection/:id/send-link", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const { data: request, error: findErr } = await supabaseStore2.from("store_selection_requests").select("*").eq("id", Number(req.params.id)).single();
      if (findErr || !request) {
        return res.status(404).json({ error: "Solicitud no encontrada" });
      }
      const link = `${process.env.STORE_URL || "https://tienda.ventas-live.com"}/tienda/selection?token=${request.token}`;
      const message = `Hola! Necesitamos que confirmes las prendas de tu pedido. Entra aqui para ver las fotos y seleccionar las correctas: ${link}`;
      await supabaseStore2.from("store_message_log").insert({
        selection_request_id: request.id,
        customer_wa: request.customer_wa,
        template_key: "selection_request",
        message_body: message,
        status: "draft"
      });
      res.json({
        ok: true,
        link,
        message,
        phone: request.customer_wa
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Error interno" });
    }
  });
  router.get("/selection-requests", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const status = req.query.status;
      let query = supabaseStore2.from("store_selection_requests").select("*").order("created_at", { ascending: false });
      if (status) query = query.eq("status", status);
      const { data, error } = await query.limit(200);
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message || "Error interno" });
    }
  });
  return router;
}

// src/routes/store-settings.ts
import { Router as Router6 } from "express";
function createStoreSettingsRouter(supabaseStore2) {
  const router = Router6();
  let settingsCache = null;
  const SETTINGS_TTL_MS = 5 * 60 * 1e3;
  const DEFAULT_SETTINGS = {
    store_name: "Leidy Shop",
    store_phone: "59160003230",
    reservation_minutes: "1",
    delivery_enabled: "true",
    pickup_enabled: "true",
    next_live_date: "",
    next_live_time: "",
    delivery_note: "Entregas de lunes a sabado.",
    address: "Consulta por WhatsApp",
    store_chips: "",
    payment_qr_url: "/qr-leidy-shop.jpg",
    buffer_publish_enabled: "true"
  };
  const DEFAULT_DELIVERY_SLOTS = [
    { id: 1, name: "Manana", start_time: "08:00", end_time: "12:00", active: true, sort_order: 1 },
    { id: 2, name: "Tarde", start_time: "12:00", end_time: "17:00", active: true, sort_order: 2 },
    { id: 3, name: "Noche", start_time: "17:00", end_time: "21:00", active: true, sort_order: 3 }
  ];
  function isMissingTable(err) {
    const message = String(err?.message ?? err ?? "").toLowerCase();
    return err?.code === "42P01" || err?.code === "PGRST205" || message.includes("could not find the table") || message.includes("does not exist") || message.includes("schema cache");
  }
  function normalizePhone2(raw) {
    const clean = String(raw ?? "").replace(/\D/g, "");
    if (!clean) return "";
    return clean.startsWith("591") ? clean : `591${clean}`;
  }
  async function ensureStoreCustomer(customerWa, customerName) {
    const whatsapp = normalizePhone2(customerWa);
    if (!whatsapp) throw new Error("customer_wa requerido");
    const displayName = String(customerName ?? "").trim();
    const { data: existing, error: findError } = await supabaseStore2.from("store_customers").select("id, whatsapp, display_name").eq("whatsapp", whatsapp).maybeSingle();
    if (findError) throw findError;
    if (existing) {
      if (displayName && !existing.display_name) {
        await supabaseStore2.from("store_customers").update({ display_name: displayName }).eq("id", existing.id);
      }
      return { ...existing, whatsapp, display_name: existing.display_name || displayName };
    }
    const { data, error } = await supabaseStore2.from("store_customers").insert({
      whatsapp,
      display_name: displayName,
      pin_hash: "profile-only"
    }).select("id, whatsapp, display_name").single();
    if (error) throw error;
    return data;
  }
  async function saveCustomerMediaReferences(input) {
    const customer = await ensureStoreCustomer(input.customerWa, input.customerName);
    const rows = (Array.isArray(input.media) ? input.media : []).map((item) => typeof item === "string" ? { media_url: item } : item).filter((item) => item?.media_url || item?.url).map((item) => ({
      customer_id: customer.id,
      customer_wa: customer.whatsapp,
      customer_name: customer.display_name || String(input.customerName ?? "").trim() || null,
      media_url: item.media_url ?? item.url,
      media_type: item.media_type ?? null,
      panel_mensaje_id: item.panel_mensaje_id ?? item.message_id ?? null,
      source_type: item.source_type ?? input.sourceType ?? "whatsapp_panel",
      source_id: String(item.source_id ?? input.sourceId ?? "") || null,
      order_id: item.order_id ?? input.orderId ?? null,
      purchase_id: item.purchase_id ?? input.purchaseId ?? null,
      tipo: item.tipo ?? input.defaultTipo ?? "prenda",
      status: item.status ?? input.defaultStatus ?? "candidata",
      description: item.description ?? item.descripcion ?? null,
      message_created_at: item.message_created_at ?? item.created_at ?? null,
      metadata: item.metadata ?? {}
    }));
    if (rows.length === 0) return { customer, saved: 0 };
    const { error } = await supabaseStore2.from("store_customer_media").upsert(rows, { onConflict: "customer_wa,media_url" });
    if (error) throw error;
    return { customer, saved: rows.length };
  }
  router.get("/settings", async (_req, res) => {
    const now = Date.now();
    if (settingsCache && now - settingsCache.ts < SETTINGS_TTL_MS) {
      res.setHeader("Cache-Control", "public, max-age=30, s-maxage=120, stale-while-revalidate=300");
      return res.json(settingsCache.payload);
    }
    try {
      const { data, error } = await supabaseStore2.from("store_settings").select("*");
      if (error) {
        if (isMissingTable(error)) return res.json(DEFAULT_SETTINGS);
        throw error;
      }
      const settings = { ...DEFAULT_SETTINGS };
      for (const row of data || []) {
        settings[row.setting_key] = row.setting_value || "";
      }
      settingsCache = { payload: settings, ts: now };
      res.setHeader("Cache-Control", "public, max-age=30, s-maxage=120, stale-while-revalidate=300");
      res.json(settings);
    } catch (err) {
      if (isMissingTable(err)) return res.json(DEFAULT_SETTINGS);
      res.status(500).json({ error: err.message || "Error interno" });
    }
  });
  router.patch("/settings", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const updates = req.body;
      for (const [key, value] of Object.entries(updates)) {
        await supabaseStore2.from("store_settings").upsert({ setting_key: key, setting_value: String(value) }, { onConflict: "setting_key" });
      }
      settingsCache = null;
      res.json({ ok: true });
    } catch (err) {
      if (isMissingTable(err)) {
        return res.status(503).json({ error: "La configuracion de tienda requiere aplicar la migracion TiendaOnline." });
      }
      res.status(500).json({ error: err.message || "Error interno" });
    }
  });
  router.get("/delivery-slots", async (_req, res) => {
    try {
      const { data, error } = await supabaseStore2.from("store_delivery_slots").select("*").eq("active", true).order("sort_order", { ascending: true });
      if (error) {
        if (isMissingTable(error)) return res.json(DEFAULT_DELIVERY_SLOTS);
        throw error;
      }
      res.json(data || []);
    } catch (err) {
      if (isMissingTable(err)) return res.json(DEFAULT_DELIVERY_SLOTS);
      res.status(500).json({ error: err.message || "Error interno" });
    }
  });
  router.get("/customer-media/:phone", async (req, res) => {
    try {
      const clean = normalizePhone2(req.params.phone);
      const { data, error } = await supabaseStore2.from("store_customer_media").select("*").eq("customer_wa", clean).order("created_at", { ascending: false }).limit(200);
      if (error) {
        if (isMissingTable(error)) return res.json([]);
        throw error;
      }
      res.json(data || []);
    } catch (err) {
      if (isMissingTable(err)) return res.json([]);
      res.status(500).json({ error: err.message || "Error interno" });
    }
  });
  router.post("/customer-media", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const result = await saveCustomerMediaReferences({
        customerWa: req.body.customer_wa ?? req.body.phone,
        customerName: req.body.customer_name,
        media: req.body.media ?? req.body.photos ?? [],
        defaultStatus: req.body.status,
        defaultTipo: req.body.tipo,
        sourceType: req.body.source_type,
        sourceId: req.body.source_id,
        orderId: req.body.order_id,
        purchaseId: req.body.purchase_id
      });
      res.status(201).json({ ok: true, ...result });
    } catch (err) {
      if (isMissingTable(err)) {
        return res.status(503).json({ error: "El historial visual requiere aplicar la migracion TiendaOnline." });
      }
      res.status(500).json({ error: err.message || "Error interno" });
    }
  });
  router.get("/external-purchases/:phone", async (req, res) => {
    try {
      const clean = normalizePhone2(req.params.phone);
      const { data, error } = await supabaseStore2.from("store_external_purchases").select("*").ilike("customer_wa", `%${clean}%`).order("purchase_date", { ascending: false }).limit(100);
      if (error) {
        if (isMissingTable(error)) return res.json([]);
        throw error;
      }
      res.json(data || []);
    } catch (err) {
      if (isMissingTable(err)) return res.json([]);
      res.status(500).json({ error: err.message || "Error interno" });
    }
  });
  router.post("/external-purchases", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
      const { customer_wa, customer_name, items, total, status, purchase_date, source, source_id, payload, media } = req.body;
      const customer = await ensureStoreCustomer(customer_wa, customer_name);
      const { data, error } = await supabaseStore2.from("store_external_purchases").insert({
        customer_id: customer.id,
        customer_wa: customer.whatsapp,
        customer_name: customer_name || "",
        items: items || [],
        total: total || 0,
        status: status || "completed",
        purchase_date: purchase_date || (/* @__PURE__ */ new Date()).toISOString(),
        source: source || "manual",
        source_id: source_id || null,
        payload: payload || {}
      }).select().single();
      if (error) throw error;
      const mediaItems = Array.isArray(media) ? media : Array.isArray(payload?.media) ? payload.media : [];
      if (mediaItems.length > 0) {
        await saveCustomerMediaReferences({
          customerWa: customer.whatsapp,
          customerName: customer_name,
          media: mediaItems,
          defaultStatus: "comprada",
          defaultTipo: "prenda",
          sourceType: source || "external_purchase",
          sourceId: source_id || data.id,
          purchaseId: data.id
        });
      }
      res.status(201).json(data);
    } catch (err) {
      if (isMissingTable(err)) {
        return res.status(503).json({ error: "Las compras externas requieren aplicar la migracion TiendaOnline." });
      }
      res.status(500).json({ error: err.message || "Error interno" });
    }
  });
  return router;
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var createStoreAuthClient = /* @__PURE__ */ (() => {
  let _client = null;
  return () => {
    if (_client) return _client;
    const url4 = process.env.VITE_STORE_SUPABASE_URL;
    const anonKey = process.env.VITE_STORE_SUPABASE_ANON_KEY;
    if (!url4 || !anonKey) throw new Error("Faltan variables publicas de auth de tienda");
    _client = createClient5(url4, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    return _client;
  };
})();
var cleanName = (name) => {
  if (!name) return "";
  let cleaned = name.trim();
  const prefixes = [
    /^QR de\s+/i,
    /^Pago de\s+/i,
    /^Transferencia de\s+/i,
    /^Transf\.\s+/i,
    /^Sr\.\s+/i,
    /^Sra\.\s+/i,
    /^Lic\.\s+/i
  ];
  prefixes.forEach((reg) => {
    cleaned = cleaned.replace(reg, "");
  });
  cleaned = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  cleaned = cleaned.replace(/\s+/g, " ").toUpperCase().trim();
  return cleaned;
};
var phoneDigits = (value) => String(value ?? "").replace(/\D/g, "");
var phoneVariants = (...values) => {
  const set = /* @__PURE__ */ new Set();
  for (const value of values) {
    const digits = phoneDigits(value);
    if (!digits) continue;
    set.add(digits);
    if (digits.startsWith("591") && digits.length > 3) set.add(digits.slice(3));
    if (!digits.startsWith("591")) set.add(`591${digits}`);
  }
  return [...set];
};
var publicStoreBaseUrl = (value) => {
  const base = String(value || "https://leidycandy.me").replace(/\s+/g, "").replace(/\/+$/, "");
  return base || "https://leidycandy.me";
};
var normalizeMoney = (value) => {
  const parsed = Number(String(value ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
};
var parseMacrodroidBankPayload = (payload) => {
  const title = String(payload?.title ?? "");
  const text = String(payload?.text ?? "");
  const bigText = String(payload?.big_text ?? "");
  const rawText = [title, text, bigText].filter(Boolean).join(" | ");
  const amountMatch = rawText.match(/(?:bs\.?|bob)\s*([0-9]+(?:[,.][0-9]{1,2})?)/i) || rawText.match(/([0-9]+(?:[,.][0-9]{1,2})?)\s*(?:bs\.?|bob)/i);
  const amount = normalizeMoney(amountMatch?.[1]);
  let senderName = "";
  const nameMatch = rawText.match(/^(.+?)\s+te\s+ha\s+enviado\b/i) || rawText.match(/^(.+?)\s+te\s+envio\b/i) || rawText.match(/^qr\s+de\s+(.+?)\s+te\s+/i);
  if (nameMatch?.[1]) senderName = String(nameMatch[1]).trim();
  const hashBase = [
    payload?.raw_hash,
    payload?.rawHash,
    payload?.event_uuid,
    payload?.captured_at_ms,
    payload?.app_package,
    title,
    text,
    bigText
  ].filter(Boolean).join("|");
  const hash = crypto2.createHash("sha256").update(hashBase || JSON.stringify(payload ?? {})).digest("hex");
  return { amount, senderName, rawText, hash };
};
var isMissingDbObject = (error) => {
  const code = error?.code;
  const message = String(error?.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || code === "PGRST204" || message.includes("does not exist") || message.includes("schema cache");
};
async function safeSelect(client, table, columns, apply) {
  try {
    const { data, error } = await apply(client.from(table).select(columns));
    if (error) {
      if (isMissingDbObject(error)) return [];
      throw error;
    }
    return data ?? [];
  } catch (error) {
    if (isMissingDbObject(error)) return [];
    throw error;
  }
}
async function safeDelete(client, table, key, deleted, apply) {
  try {
    const { count, error } = await apply(client.from(table).delete({ count: "exact" }));
    if (error) {
      if (isMissingDbObject(error)) return;
      throw error;
    }
    deleted[key] = (deleted[key] ?? 0) + (count ?? 0);
  } catch (error) {
    if (isMissingDbObject(error)) return;
    throw error;
  }
}
async function safeUpdate(client, table, key, updated, values, apply) {
  try {
    const { count, error } = await apply(client.from(table).update(values, { count: "exact" }));
    if (error) {
      if (isMissingDbObject(error)) return;
      throw error;
    }
    updated[key] = (updated[key] ?? 0) + (count ?? 0);
  } catch (error) {
    if (isMissingDbObject(error)) return;
    throw error;
  }
}
function getBoliviaTodayRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(/* @__PURE__ */ new Date());
  const value = (type) => Number(parts.find((p) => p.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const start = new Date(Date.UTC(year, month - 1, day, 4, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1e3);
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    start: start.toISOString(),
    end: end.toISOString()
  };
}
async function recalcAllContainers() {
  const containers = await safeSelect(supabaseServer, "storage_containers", "id", (q) => q);
  for (const container of containers) {
    try {
      await supabaseServer.rpc("fn_recalc_container_state", { p_container_id: container.id });
    } catch {
    }
  }
}
async function resetLabelsForUser(userId, options = {}) {
  const changed = {};
  const allOrders = await safeSelect(supabaseServer, "orders", "id", (q) => q.not("id", "is", null));
  const orderIds = [...new Set([
    ...options.orderIds ?? [],
    ...allOrders.map((o) => Number(o.id))
  ].map(Number).filter(Boolean))];
  if (orderIds.length > 0) {
    await safeDelete(supabaseServer, "container_allocations", "casilleros_asignaciones", changed, (q) => q.in("order_id", orderIds));
    await safeDelete(supabaseServer, "order_bags", "bolsas", changed, (q) => q.in("order_id", orderIds));
    await safeDelete(supabaseServer, "orders", "pedidos_etiquetas", changed, (q) => q.in("id", orderIds));
  }
  const pedidoUpdate = { label: "", label_type: "", updated_at: /* @__PURE__ */ new Date() };
  if (options.resetPedidoStatus) pedidoUpdate.status = "procesar";
  await safeUpdate(supabaseServer, "pedidos", "pedidos_limpiados", changed, pedidoUpdate, (q) => q.eq("user_id", userId));
  await safeUpdate(supabaseServer, "customers", "clientes_limpiados", changed, {
    active_label: "",
    active_label_type: "",
    active_bag_count: 0,
    label_updated_at: /* @__PURE__ */ new Date()
  }, (q) => q.eq("user_id", userId));
  await recalcAllContainers();
  await safeUpdate(supabaseServer, "storage_containers", "casilleros_reseteados", changed, {
    current_simple_orders: 0,
    current_bags_used: 0,
    state: "AVAILABLE"
  }, (q) => q.select("id"));
  await safeDelete(supabasePanel, "evidencias_venta_live", "panel_evidencias", changed, (q) => q.not("id", "is", null));
  await safeDelete(supabasePanel, "pagos_venta_live", "panel_pagos", changed, (q) => q.not("id", "is", null));
  await safeDelete(supabasePanel, "pedidos_venta_live", "panel_pedidos", changed, (q) => q.not("id", "is", null));
  await safeDelete(supabasePanel, "tarjetas_venta_live", "panel_tarjetas", changed, (q) => q.not("id", "is", null));
  await safeDelete(supabasePanel, "panel_mensajes", "panel_mensajes", changed, (q) => q.not("id", "is", null));
  await safeDelete(supabasePanel, "panel_clientes", "panel_conversaciones", changed, (q) => q.not("id", "is", null));
  return { orderIds, changed };
}
async function deleteTodayPaymentsForUser(userId) {
  const range = getBoliviaTodayRange();
  const deleted = {};
  const pagos = await safeSelect(supabaseServer, "pagos", "id,customer_id", (q) => q.eq("user_id", userId).gte("date", range.start).lt("date", range.end));
  const pedidos = await safeSelect(supabaseServer, "pedidos", "id,customer_id", (q) => q.eq("user_id", userId).gte("date", range.start).lt("date", range.end));
  const pagoIds = pagos.map((p) => Number(p.id)).filter(Boolean);
  const pedidoIds = pedidos.map((p) => Number(p.id)).filter(Boolean);
  const customerIds = [...new Set([...pagos, ...pedidos].map((r) => Number(r.customer_id)).filter(Boolean))];
  const orderRows = [];
  if (pedidoIds.length > 0) {
    orderRows.push(...await safeSelect(supabaseServer, "orders", "id", (q) => q.in("firebase_id", pedidoIds.map(String))));
  }
  if (customerIds.length > 0) {
    orderRows.push(...await safeSelect(supabaseServer, "orders", "id", (q) => q.in("customer_id", customerIds).gte("created_at", range.start).lt("created_at", range.end)));
  }
  const orderIds = [...new Set(orderRows.map((o) => Number(o.id)).filter(Boolean))];
  if (orderIds.length > 0) {
    await safeDelete(supabaseServer, "container_allocations", "casilleros_asignaciones", deleted, (q) => q.in("order_id", orderIds));
    await safeDelete(supabaseServer, "order_bags", "bolsas", deleted, (q) => q.in("order_id", orderIds));
    await safeDelete(supabaseServer, "orders", "pedidos_etiquetas", deleted, (q) => q.in("id", orderIds));
  }
  if (pagoIds.length > 0) {
    await safeDelete(supabaseServer, "identity_evidence", "identidad_evidencia", deleted, (q) => q.eq("user_id", userId).eq("source", "manual_payment").in("source_id", pagoIds.map(String)));
    await safeDelete(supabasePanel, "pagos_venta_live", "panel_pagos_vinculados", deleted, (q) => q.in("main_pago_id", pagoIds));
  }
  if (pedidoIds.length > 0) {
    await safeDelete(supabasePanel, "pedidos_venta_live", "panel_pedidos_vinculados", deleted, (q) => q.in("main_pedido_id", pedidoIds));
  }
  const rawEvents = await safeSelect(supabaseServer, "raw_notification_events", "id", (q) => q.gte("received_at", range.start).lt("received_at", range.end));
  const rawIds = rawEvents.map((r) => r.id).filter(Boolean);
  if (rawIds.length > 0) {
    await safeDelete(supabaseServer, "raw_notification_events", "notificaciones_banco", deleted, (q) => q.in("id", rawIds));
  }
  if (pedidoIds.length > 0) {
    await safeDelete(supabaseServer, "pedidos", "pedidos", deleted, (q) => q.eq("user_id", userId).in("id", pedidoIds));
  }
  if (pagoIds.length > 0) {
    await safeDelete(supabaseServer, "pagos", "pagos", deleted, (q) => q.eq("user_id", userId).in("id", pagoIds));
  }
  await recalcAllContainers();
  return { success: true, date: range.date, pagoIds, pedidoIds, orderIds, deleted };
}
async function deleteTodayForUser(userId) {
  const range = getBoliviaTodayRange();
  const deleted = {};
  const pagos = await safeSelect(supabaseServer, "pagos", "id,customer_id", (q) => q.eq("user_id", userId).gte("date", range.start).lt("date", range.end));
  const pedidos = await safeSelect(supabaseServer, "pedidos", "id,customer_id", (q) => q.eq("user_id", userId).gte("date", range.start).lt("date", range.end));
  const pagoIds = pagos.map((p) => Number(p.id)).filter(Boolean);
  const pedidoIds = pedidos.map((p) => Number(p.id)).filter(Boolean);
  const customerIds = [...new Set([...pagos, ...pedidos].map((r) => Number(r.customer_id)).filter(Boolean))];
  const orderRows = [];
  if (pedidoIds.length > 0) {
    orderRows.push(...await safeSelect(supabaseServer, "orders", "id", (q) => q.in("firebase_id", pedidoIds.map(String))));
    orderRows.push(...await safeSelect(supabaseServer, "orders", "id", (q) => q.in("id", pedidoIds)));
  }
  if (customerIds.length > 0) {
    orderRows.push(...await safeSelect(supabaseServer, "orders", "id", (q) => q.in("customer_id", customerIds).gte("created_at", range.start).lt("created_at", range.end)));
  }
  const orderIds = [...new Set(orderRows.map((o) => Number(o.id)).filter(Boolean))];
  if (orderIds.length > 0) {
    await safeDelete(supabaseServer, "container_allocations", "casilleros_asignaciones", deleted, (q) => q.in("order_id", orderIds));
    await safeDelete(supabaseServer, "order_bags", "bolsas", deleted, (q) => q.in("order_id", orderIds));
    await safeDelete(supabaseServer, "orders", "pedidos_etiquetas", deleted, (q) => q.in("id", orderIds));
  }
  if (pagoIds.length > 0) {
    await safeDelete(supabaseServer, "identity_evidence", "identidad_evidencia", deleted, (q) => q.eq("user_id", userId).eq("source", "manual_payment").in("source_id", pagoIds.map(String)));
  }
  const rawEvents = await safeSelect(supabaseServer, "raw_notification_events", "id", (q) => q.gte("received_at", range.start).lt("received_at", range.end));
  const rawIds = rawEvents.map((r) => r.id).filter(Boolean);
  if (rawIds.length > 0) {
    await safeDelete(supabaseServer, "raw_notification_events", "notificaciones_banco", deleted, (q) => q.in("id", rawIds));
  }
  const panelClientesToday = await safeSelect(supabasePanel, "panel_clientes", "id,phone", (q) => q.gte("created_at", range.start).lt("created_at", range.end));
  const panelPedidosToday = await safeSelect(supabasePanel, "pedidos_venta_live", "id,cliente_id,phone", (q) => q.gte("created_at", range.start).lt("created_at", range.end));
  const panelPagosToday = await safeSelect(supabasePanel, "pagos_venta_live", "id,pedido_live_id,cliente_id,phone", (q) => q.gte("created_at", range.start).lt("created_at", range.end));
  const panelPedidosLinked = pedidoIds.length > 0 ? await safeSelect(supabasePanel, "pedidos_venta_live", "id,cliente_id,phone", (q) => q.in("main_pedido_id", pedidoIds)) : [];
  const panelPagosLinked = pagoIds.length > 0 ? await safeSelect(supabasePanel, "pagos_venta_live", "id,pedido_live_id,cliente_id,phone", (q) => q.in("main_pago_id", pagoIds)) : [];
  const panelClienteIds = [...new Set([
    ...panelClientesToday.map((r) => r.id),
    ...panelPedidosToday.map((r) => r.cliente_id),
    ...panelPagosToday.map((r) => r.cliente_id),
    ...panelPedidosLinked.map((r) => r.cliente_id),
    ...panelPagosLinked.map((r) => r.cliente_id)
  ].filter(Boolean))];
  const panelPedidoIds = [...new Set([
    ...panelPedidosToday.map((r) => r.id),
    ...panelPagosToday.map((r) => r.pedido_live_id),
    ...panelPedidosLinked.map((r) => r.id),
    ...panelPagosLinked.map((r) => r.pedido_live_id)
  ].filter(Boolean))];
  const panelPagoIds = [...new Set([
    ...panelPagosToday.map((r) => r.id),
    ...panelPagosLinked.map((r) => r.id)
  ].filter(Boolean))];
  const panelPhones = [...new Set([
    ...panelClientesToday.map((r) => r.phone),
    ...panelPedidosToday.map((r) => r.phone),
    ...panelPagosToday.map((r) => r.phone),
    ...panelPedidosLinked.map((r) => r.phone),
    ...panelPagosLinked.map((r) => r.phone)
  ].map(phoneDigits).filter(Boolean))];
  if (panelPagoIds.length > 0) {
    await safeDelete(supabasePanel, "pagos_venta_live", "panel_pagos_ids", deleted, (q) => q.in("id", panelPagoIds));
  }
  if (panelPedidoIds.length > 0) {
    await safeDelete(supabasePanel, "evidencias_venta_live", "panel_evidencias", deleted, (q) => q.in("pedido_live_id", panelPedidoIds));
    await safeDelete(supabasePanel, "pagos_venta_live", "panel_pagos", deleted, (q) => q.in("pedido_live_id", panelPedidoIds));
    await safeDelete(supabasePanel, "pedidos_venta_live", "panel_pedidos", deleted, (q) => q.in("id", panelPedidoIds));
  }
  if (panelClienteIds.length > 0) {
    await safeDelete(supabasePanel, "evidencias_venta_live", "panel_evidencias_cliente", deleted, (q) => q.in("cliente_id", panelClienteIds));
    await safeDelete(supabasePanel, "pagos_venta_live", "panel_pagos_cliente", deleted, (q) => q.in("cliente_id", panelClienteIds));
    await safeDelete(supabasePanel, "pedidos_venta_live", "panel_pedidos_cliente", deleted, (q) => q.in("cliente_id", panelClienteIds));
    await safeDelete(supabasePanel, "tarjetas_venta_live", "panel_tarjetas", deleted, (q) => q.in("cliente_id", panelClienteIds));
    await safeDelete(supabasePanel, "panel_mensajes", "panel_mensajes", deleted, (q) => q.in("cliente_id", panelClienteIds));
    await safeDelete(supabasePanel, "panel_clientes", "panel_conversaciones", deleted, (q) => q.in("id", panelClienteIds));
  }
  if (panelPhones.length > 0) {
    await safeDelete(supabasePanel, "pagos_venta_live", "panel_pagos_phone", deleted, (q) => q.in("phone", panelPhones));
    await safeDelete(supabasePanel, "pedidos_venta_live", "panel_pedidos_phone", deleted, (q) => q.in("phone", panelPhones));
    await safeDelete(supabasePanel, "tarjetas_venta_live", "panel_tarjetas_phone", deleted, (q) => q.in("phone", panelPhones));
  }
  if (pedidoIds.length > 0) {
    await safeDelete(supabaseServer, "pedidos", "pedidos", deleted, (q) => q.eq("user_id", userId).in("id", pedidoIds));
  }
  if (pagoIds.length > 0) {
    await safeDelete(supabaseServer, "pagos", "pagos", deleted, (q) => q.eq("user_id", userId).in("id", pagoIds));
  }
  await resetLabelsForUser(userId, { orderIds, resetPedidoStatus: true });
  return { success: true, date: range.date, pagoIds, pedidoIds, orderIds, panelClienteIds, deleted };
}
async function deleteStoreAuthUsers(phones) {
  const shortPhones = phones.map(phoneDigits).filter(Boolean).map((p) => p.startsWith("591") ? p.slice(3) : p);
  const emails = [...new Set(shortPhones.map((p) => `${p}@tiendaleydi.com`))];
  for (const email of emails) {
    try {
      const { data } = await supabaseStore.auth.admin.listUsers({ page: 1, perPage: 1e3 });
      const user = data.users.find((u) => u.email === email);
      if (user?.id) await supabaseStore.auth.admin.deleteUser(user.id);
    } catch (error) {
      console.warn("[root-delete] No se pudo borrar usuario de tienda:", email, error?.message);
    }
  }
}
async function deletePersonFromRoot(input) {
  const deleted = {};
  const selectedCustomers = input.customerId ? await safeSelect(supabaseServer, "customers", "*", (q) => q.eq("id", input.customerId).eq("user_id", input.userId)) : [];
  const baseCustomer = selectedCustomers[0] ?? null;
  const canonical = cleanName(input.name ?? baseCustomer?.full_name ?? baseCustomer?.canonical_name ?? baseCustomer?.normalized_name ?? "");
  const phones = phoneVariants(input.phone, baseCustomer?.phone, baseCustomer?.wa_number, baseCustomer?.whatsapp_number);
  const allCustomers = await safeSelect(supabaseServer, "customers", "*", (q) => q.eq("user_id", input.userId));
  const customerIds = [...new Set(allCustomers.filter((c) => {
    if (input.customerId && String(c.id) === String(input.customerId)) return true;
    const nameMatch = canonical && [c.full_name, c.canonical_name, c.normalized_name].some((v) => cleanName(v) === canonical);
    const customerPhones = phoneVariants(c.phone, c.wa_number, c.whatsapp_number);
    const phoneMatch = phones.length > 0 && customerPhones.some((p) => phones.includes(p));
    return nameMatch || phoneMatch;
  }).map((c) => Number(c.id)).filter(Boolean))];
  const pagos = await safeSelect(supabaseServer, "pagos", "id,nombre,customer_id", (q) => q.eq("user_id", input.userId));
  const pagoIds = [...new Set(pagos.filter((p) => customerIds.includes(Number(p.customer_id)) || canonical && cleanName(p.nombre) === canonical).map((p) => Number(p.id)).filter(Boolean))];
  const pedidos = await safeSelect(supabaseServer, "pedidos", "id,customer_id,customer_name", (q) => q.eq("user_id", input.userId));
  const pedidoIds = [...new Set(pedidos.filter((p) => customerIds.includes(Number(p.customer_id)) || canonical && cleanName(p.customer_name) === canonical).map((p) => Number(p.id)).filter(Boolean))];
  const labelOrders = customerIds.length > 0 ? await safeSelect(supabaseServer, "orders", "id", (q) => q.in("customer_id", customerIds)) : [];
  const orderIds = [...new Set(labelOrders.map((o) => Number(o.id)).filter(Boolean))];
  const profileRows = await safeSelect(supabaseServer, "identity_profiles", "id,cliente_id,phone,display_name,store_phone,panel_phone", (q) => q.eq("user_id", input.userId));
  const profileIds = [...new Set(profileRows.filter((p) => {
    const identityPhones = phoneVariants(p.phone, p.store_phone, p.panel_phone);
    return customerIds.includes(Number(p.cliente_id)) || canonical && cleanName(p.display_name) === canonical || phones.length > 0 && identityPhones.some((v) => phones.includes(v));
  }).map((p) => String(p.id)).filter(Boolean))];
  if (profileIds.length > 0) {
    await safeDelete(supabaseServer, "identity_evidence", "identidad_evidencia", deleted, (q) => q.in("profile_id", profileIds));
  }
  if (pagoIds.length > 0) {
    await safeDelete(supabaseServer, "identity_evidence", "identidad_evidencia", deleted, (q) => q.eq("user_id", input.userId).eq("source", "manual_payment").in("source_id", pagoIds.map(String)));
  }
  if (profileIds.length > 0) {
    await safeDelete(supabaseServer, "identity_profiles", "identidad_perfiles", deleted, (q) => q.in("id", profileIds));
  }
  const rawIdsFromCandidates = canonical ? await safeSelect(supabaseServer, "parsed_payment_candidates", "raw_event_id", (q) => q.eq("payer_name_canonical", canonical)) : [];
  const rawIds = [...new Set(rawIdsFromCandidates.map((r) => r.raw_event_id).filter(Boolean))];
  if (rawIds.length > 0) {
    await safeDelete(supabaseServer, "raw_notification_events", "notificaciones_banco", deleted, (q) => q.in("id", rawIds));
  }
  if (phones.length > 0) {
    await safeDelete(supabaseServer, "whatsapp_message_queue", "cola_whatsapp", deleted, (q) => q.in("phone", phones));
  }
  if (orderIds.length > 0) {
    for (const orderId of orderIds) {
      try {
        await supabaseServer.rpc("fn_release_container", {
          p_order_id: orderId,
          p_released_by: "root-delete",
          p_reason: "ROOT_DELETE"
        });
      } catch {
      }
    }
    await safeDelete(supabaseServer, "container_allocations", "casilleros_asignaciones", deleted, (q) => q.in("order_id", orderIds));
    await safeDelete(supabaseServer, "order_bags", "bolsas", deleted, (q) => q.in("order_id", orderIds));
    await safeDelete(supabaseServer, "orders", "pedidos_etiquetas", deleted, (q) => q.in("id", orderIds));
  }
  if (pedidoIds.length > 0) {
    await safeDelete(supabaseServer, "pedidos", "pedidos", deleted, (q) => q.in("id", pedidoIds).eq("user_id", input.userId));
  }
  if (pagoIds.length > 0) {
    await safeDelete(supabaseServer, "pagos", "pagos", deleted, (q) => q.in("id", pagoIds).eq("user_id", input.userId));
  }
  if (customerIds.length > 0) {
    await safeDelete(supabaseServer, "customers", "perfiles", deleted, (q) => q.in("id", customerIds).eq("user_id", input.userId));
  }
  const storeCustomers = phones.length > 0 ? await safeSelect(supabaseStore, "store_customers", "id,whatsapp,display_name", (q) => q.in("whatsapp", phones)) : [];
  const storeCustomerIds = [...new Set(storeCustomers.map((c) => Number(c.id)).filter(Boolean))];
  const storeOrders = await safeSelect(supabaseStore, "store_orders", "id,customer_id,customer_wa,customer_name", (q) => q.select("*"));
  const storeOrderIds = [...new Set(storeOrders.filter((o) => {
    const orderPhones = phoneVariants(o.customer_wa, o.customer_phone);
    return storeCustomerIds.includes(Number(o.customer_id)) || canonical && cleanName(o.customer_name) === canonical || phones.length > 0 && orderPhones.some((v) => phones.includes(v));
  }).map((o) => Number(o.id)).filter(Boolean))];
  if (storeOrderIds.length > 0) {
    await safeDelete(supabaseStore, "payment_events", "tienda_pagos_banco", deleted, (q) => q.in("matched_order_id", storeOrderIds));
    await safeDelete(supabaseStore, "wa_messages", "tienda_whatsapp", deleted, (q) => q.in("matched_order_id", storeOrderIds));
    await safeDelete(supabaseStore, "store_orders", "tienda_pedidos", deleted, (q) => q.in("id", storeOrderIds));
  }
  if (phones.length > 0) {
    await safeDelete(supabaseStore, "payment_events", "tienda_pagos_banco", deleted, (q) => q.in("sender_wa", phones));
    await safeDelete(supabaseStore, "wa_messages", "tienda_whatsapp", deleted, (q) => q.in("from_wa", phones));
  }
  if (storeCustomerIds.length > 0) {
    await safeDelete(supabaseStore, "store_customers", "tienda_perfiles", deleted, (q) => q.in("id", storeCustomerIds));
  }
  if (phones.length > 0) await deleteStoreAuthUsers(phones);
  const panelClientes = phones.length > 0 ? await safeSelect(supabasePanel, "panel_clientes", "id,phone", (q) => q.in("phone", phones)) : [];
  const panelClienteIds = [...new Set(panelClientes.map((c) => String(c.id)).filter(Boolean))];
  if (phones.length > 0) {
    await safeDelete(supabasePanel, "tarjetas_venta_live", "panel_tarjetas", deleted, (q) => q.in("phone", phones));
    await safeDelete(supabasePanel, "pedidos_venta_live", "panel_pedidos", deleted, (q) => q.in("phone", phones));
    await safeDelete(supabasePanel, "pagos_venta_live", "panel_pagos", deleted, (q) => q.in("phone", phones));
  }
  if (panelClienteIds.length > 0) {
    await safeDelete(supabasePanel, "evidencias_venta_live", "panel_evidencias", deleted, (q) => q.in("cliente_id", panelClienteIds));
    await safeDelete(supabasePanel, "pagos_venta_live", "panel_pagos", deleted, (q) => q.in("cliente_id", panelClienteIds));
    await safeDelete(supabasePanel, "pedidos_venta_live", "panel_pedidos", deleted, (q) => q.in("cliente_id", panelClienteIds));
    await safeDelete(supabasePanel, "tarjetas_venta_live", "panel_tarjetas", deleted, (q) => q.in("cliente_id", panelClienteIds));
    await safeDelete(supabasePanel, "panel_mensajes", "panel_chats", deleted, (q) => q.in("cliente_id", panelClienteIds));
    await safeDelete(supabasePanel, "panel_clientes", "panel_perfiles", deleted, (q) => q.in("id", panelClienteIds));
  }
  return { success: true, customerIds, canonical, phones, deleted };
}
var app = express();
var PORT = Number(process.env.PORT || 3001);
var isServerlessRuntime = Boolean(
  process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_REGION || process.env.AWS_LAMBDA_FUNCTION_VERSION
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.post("/api/orders", async (req, res) => {
  try {
    const { customerId, totalItems, totalBags, totalAmount = 0, notes, assignedBy = "operator" } = req.body;
    if (!customerId || !totalBags) {
      return res.status(400).json({ error: "customerId y totalBags son requeridos" });
    }
    const logistics_type = totalBags >= 2 ? "COMPLEX" : "SIMPLE";
    const order_code = `ORD-${Date.now()}-${Math.floor(Math.random() * 1e3)}`;
    const { data: order, error: orderErr } = await supabaseServer.from("orders").insert({
      customer_id: customerId,
      order_code,
      logistics_type,
      total_bags: totalBags,
      total_items: totalItems ?? 0,
      total_amount: totalAmount,
      notes,
      order_status: "IN_PROCESS"
    }).select().single();
    if (orderErr || !order) throw orderErr ?? new Error("No se cre\xF3 el pedido");
    const bagsRows = Array.from({ length: totalBags }, (_, i) => ({
      order_id: order.id,
      bag_number: i + 1
    }));
    await supabaseServer.from("order_bags").insert(bagsRows);
    const { data: assignData, error: assignErr } = await supabaseServer.rpc("fn_assign_container", {
      p_order_id: order.id,
      p_assigned_by: assignedBy
    });
    if (assignErr) throw assignErr;
    const raw = Array.isArray(assignData) ? assignData[0] : assignData;
    const label = {
      container_id: raw.out_container_id,
      container_code: raw.out_container_code,
      allocation_id: raw.out_allocation_id
    };
    res.status(201).json({ order, label });
  } catch (err) {
    console.error("[/api/orders] error:", err);
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.post("/api/orders/:id/update-bags", async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { newTotalBags, migratedBy = "operator" } = req.body;
    if (!newTotalBags || newTotalBags < 1) {
      return res.status(400).json({ error: "newTotalBags inv\xE1lido" });
    }
    const { data: current, error: readErr } = await supabaseServer.from("orders").select("logistics_type, total_bags").eq("id", orderId).single();
    if (readErr || !current) return res.status(404).json({ error: "Pedido no encontrado" });
    const wasSimple = current.logistics_type === "SIMPLE";
    const shouldBeComplex = newTotalBags >= 2;
    if (wasSimple && shouldBeComplex) {
      const { data, error } = await supabaseServer.rpc("fn_migrate_to_complex", {
        p_order_id: orderId,
        p_new_total_bags: newTotalBags,
        p_migrated_by: migratedBy
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return res.json({
        migrated: true,
        label: {
          container_id: row.out_new_container_id,
          container_code: row.out_new_container_code,
          allocation_id: row.out_new_allocation_id,
          old_container_code: row.out_old_container_code
        }
      });
    }
    await supabaseServer.from("orders").update({ total_bags: newTotalBags }).eq("id", orderId);
    res.json({ migrated: false });
  } catch (err) {
    console.error("[/api/orders/:id/update-bags] error:", err);
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.post("/api/orders/:id/deliver", async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { releasedBy = "operator" } = req.body ?? {};
    const { error } = await supabaseServer.rpc("fn_release_container", {
      p_order_id: orderId,
      p_released_by: releasedBy,
      p_reason: "DELIVERED"
    });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("[/api/orders/:id/deliver] error:", err);
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.get("/api/storage/containers", async (_req, res) => {
  try {
    const { data, error } = await supabaseServer.from("storage_containers").select("*").order("priority_order", { ascending: true });
    if (error) throw error;
    res.json({ containers: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.get("/api/orders/:id/allocation-history", async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { data, error } = await supabaseServer.from("container_allocations").select("*, storage_containers(container_code)").eq("order_id", orderId).order("assigned_at", { ascending: false });
    if (error) throw error;
    res.json({ history: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.get("/api/storage/config", async (_req, res) => {
  try {
    const { data, error } = await supabaseServer.from("app_config").select("value").eq("key", "numeric_container_capacity").single();
    if (error) throw error;
    res.json({ numeric_capacity: Number(data?.value ?? 4) });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.patch("/api/storage/config/numeric-capacity", async (req, res) => {
  try {
    const { capacity } = req.body;
    const cap = Number(capacity);
    if (!cap || cap < 1 || cap > 999) {
      return res.status(400).json({ error: "Capacidad debe ser un n\xFAmero entre 1 y 999" });
    }
    await supabaseServer.from("app_config").upsert({ key: "numeric_container_capacity", value: String(cap), updated_at: /* @__PURE__ */ new Date() });
    const { error: updateErr } = await supabaseServer.from("storage_containers").update({ max_simple_orders: cap, max_bags_capacity: cap }).eq("container_type", "NUMERIC_SHARED");
    if (updateErr) throw updateErr;
    res.json({ success: true, numeric_capacity: cap });
  } catch (err) {
    console.error("[/api/storage/config/numeric-capacity] error:", err);
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.get("/api/clientes", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("customers").select("*").eq("user_id", userId).eq("is_active", true).order("full_name", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});
app.post("/api/clientes", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { name, canonicalName: canonicalName2, phone } = req.body;
  const candidateName = canonicalName2 ?? cleanName(name);
  const { data: existingCustomers } = await supabaseServer.from("customers").select("*").eq("user_id", userId).eq("is_active", true).limit(300);
  const matches = (existingCustomers ?? []).filter(
    (c) => isStrongNameMatch(c.canonical_name || c.full_name || c.normalized_name, candidateName)
  );
  if (matches.length === 1) {
    const updates = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    if (phone && !matches[0].phone) updates.phone = phone;
    const { data: data2, error: error2 } = await supabaseServer.from("customers").update(updates).eq("id", matches[0].id).eq("user_id", userId).select().single();
    if (error2) return res.status(500).json({ error: error2.message });
    return res.status(200).json(data2);
  }
  const { data, error } = await supabaseServer.from("customers").insert({
    full_name: name,
    normalized_name: candidateName,
    canonical_name: candidateName,
    phone: phone ?? "",
    active_label: "",
    active_label_type: "",
    user_id: userId
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});
app.patch("/api/clientes/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("customers").update(req.body).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
app.delete("/api/clientes/:id", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const result = await deletePersonFromRoot({
      userId,
      customerId: req.params.id,
      name: req.body?.name,
      phone: req.body?.phone
    });
    res.json(result);
  } catch (error) {
    console.error("[/api/clientes/:id DELETE] root delete error:", error);
    res.status(500).json({ error: error?.message ?? "Error interno" });
  }
});
app.post("/api/admin/root-delete", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { customerId, name, phone } = req.body ?? {};
    if (!customerId && !name && !phone) {
      return res.status(400).json({ error: "Falta cliente, nombre o tel\xE9fono" });
    }
    const result = await deletePersonFromRoot({ userId, customerId, name, phone });
    res.json(result);
  } catch (error) {
    console.error("[/api/admin/root-delete] error:", error);
    res.status(500).json({ error: error?.message ?? "Error interno" });
  }
});
app.post("/api/admin/reset-labels", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    if (req.body?.confirm !== "RESET") return res.status(400).json({ error: "Confirmaci\xF3n inv\xE1lida" });
    const result = await resetLabelsForUser(userId, { resetPedidoStatus: true });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("[/api/admin/reset-labels] error:", error);
    res.status(500).json({ error: error?.message ?? "Error interno" });
  }
});
app.post("/api/admin/delete-today", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    if (req.body?.confirm !== "BORRAR HOY") return res.status(400).json({ error: "Confirmaci\xF3n inv\xE1lida" });
    const result = await deleteTodayForUser(userId);
    res.json(result);
  } catch (error) {
    console.error("[/api/admin/delete-today] error:", error);
    res.status(500).json({ error: error?.message ?? "Error interno" });
  }
});
app.post("/api/admin/delete-today-payments", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    if (req.body?.confirm !== "BORRAR PAGOS HOY") return res.status(400).json({ error: "Confirmaci\xF3n inv\xE1lida" });
    const result = await deleteTodayPaymentsForUser(userId);
    res.json(result);
  } catch (error) {
    console.error("[/api/admin/delete-today-payments] error:", error);
    res.status(500).json({ error: error?.message ?? "Error interno" });
  }
});
app.get("/api/admin/store-profiles", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const [storeCustomers, storeOrders] = await Promise.all([
      safeSelect(supabaseStore, "store_customers", "id,whatsapp,display_name,total_orders,total_spent,created_at", (q) => q.order("created_at", { ascending: false }).limit(300)),
      safeSelect(supabaseStore, "store_orders", "id,customer_id,customer_name,customer_wa,total,status,items,payment_verified_at,wa_proof_received,payment_ref,partial_payment_amount,payment_shortfall,created_at", (q) => q.order("created_at", { ascending: false }).limit(500))
    ]);
    const productImageMap = /* @__PURE__ */ new Map();
    const { data: productRows } = await supabaseStore.from("products").select("id, images, image_url");
    for (const product of productRows ?? []) {
      const image = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : product.image_url ?? "";
      if (image) productImageMap.set(String(product.id), image);
    }
    const groups = {};
    for (const customer of storeCustomers) {
      const phone = phoneDigits(customer.whatsapp);
      const key = phone || `store-${customer.id}`;
      groups[key] = {
        key,
        source: "store",
        storeCustomerId: customer.id,
        name: customer.display_name || "Cliente tienda",
        phone,
        orders: [],
        total: Number(customer.total_spent ?? 0)
      };
    }
    for (const order of storeOrders) {
      const phone = phoneDigits(order.customer_wa);
      const key = phone || `store-order-${order.id}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          source: "store",
          storeCustomerId: order.customer_id ?? null,
          name: order.customer_name || "Cliente tienda",
          phone,
          orders: [],
          total: 0
        };
      }
      const enrichedItems = Array.isArray(order.items) ? order.items.map((item) => ({
        ...item,
        image: String(item?.image ?? "").trim() || productImageMap.get(String(item?.productId)) || "",
        imageUrl: String(item?.imageUrl ?? "").trim() || productImageMap.get(String(item?.productId)) || ""
      })) : [];
      groups[key].orders.push({
        ...order,
        items: enrichedItems
      });
      groups[key].total += Number(order.total ?? 0);
      if ((!groups[key].name || groups[key].name === "Cliente tienda") && order.customer_name) {
        groups[key].name = order.customer_name;
      }
    }
    res.json(Object.values(groups));
  } catch (error) {
    console.error("[/api/admin/store-profiles] error:", error);
    res.status(500).json({ error: error?.message ?? "Error interno" });
  }
});
app.get("/api/pagos-lista", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("pagos").select("*").eq("user_id", userId).order("date", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const pagos = data ?? [];
  const pagoIds = pagos.map((p) => Number(p.id)).filter(Number.isFinite);
  const linkedLiveRequest = pagoIds.length > 0 ? supabasePanel.from("pagos_venta_live").select("id,main_pago_id,estado,match_reason").in("main_pago_id", pagoIds) : Promise.resolve({ data: [], error: null });
  const pendingLiveRequest = supabasePanel.from("pagos_venta_live").select("id,nombre_detectado,monto,estado,comprobante_at,created_at,phone,main_pago_id").in("estado", ["pendiente_whatsapp", "revision_manual"]).is("main_pago_id", null).order("created_at", { ascending: false });
  const [linkedLiveResult, pendingLiveResult] = await Promise.all([linkedLiveRequest, pendingLiveRequest]);
  const liveByPagoId = /* @__PURE__ */ new Map();
  if (!linkedLiveResult.error) {
    liveByPagoId.clear();
    for (const livePago of linkedLiveResult.data ?? []) {
      liveByPagoId.set(Number(livePago.main_pago_id), livePago);
    }
  } else {
    console.warn("[pagos-lista] no se pudo enriquecer con panel WhatsApp:", linkedLiveResult.error.message);
  }
  const enriched = pagos.map((p) => {
    const livePago = liveByPagoId.get(Number(p.id));
    const method = String(p.method ?? "").toLowerCase();
    let verification_origin = "other";
    if (livePago?.estado === "pendiente_whatsapp" || livePago?.estado === "revision_manual") {
      verification_origin = "whatsapp_pending";
    } else if (livePago?.estado === "verificado_manual" || method.includes("manual")) {
      verification_origin = "manual";
    } else if (livePago?.estado === "verificado_macrodroid") {
      verification_origin = "automatic";
    } else if (method.includes("notificaci\xF3n bancaria") || method.includes("notificacion bancaria")) {
      verification_origin = "macrodroid_only";
    }
    return {
      ...p,
      verification_origin,
      live_payment_id: livePago?.id ?? null,
      live_payment_status: livePago?.estado ?? null
    };
  });
  const { data: pendingLivePagos, error: pendingLiveError } = pendingLiveResult;
  if (pendingLiveError) {
    console.warn("[pagos-lista] no se pudo incluir pendientes WhatsApp:", pendingLiveError.message);
  }
  const pendingWhatsapp = (pendingLivePagos ?? []).map((p) => ({
    id: `live:${p.id}`,
    nombre: p.nombre_detectado || "COMPROBANTE WHATSAPP PENDIENTE",
    pago: Number(p.monto ?? 0),
    method: "Comprobante WhatsApp pendiente",
    status: "pending",
    verified: false,
    date: p.comprobante_at ?? p.created_at,
    customer_id: null,
    user_id: userId,
    phone: p.phone ?? null,
    verification_origin: "whatsapp_pending",
    live_payment_id: p.id,
    live_payment_status: p.estado,
    is_live_pending: true
  }));
  res.json([...pendingWhatsapp, ...enriched]);
});
app.post("/api/pagos", async (req, res) => {
  try {
    const { nombre, pago, method, status, fecha, customerId, ...rest } = req.body;
    const userId = req.headers["x-user-id"] ?? "mobile";
    if (!nombre || !pago) return res.status(400).json({ error: "Nombre y pago son requeridos" });
    const { data, error } = await supabaseServer.from("pagos").insert({
      nombre: cleanName(nombre),
      pago: Number(pago),
      method: method ?? "HTTP Request",
      status: status ?? "pending",
      date: fecha ? new Date(fecha) : /* @__PURE__ */ new Date(),
      customer_id: customerId ?? null,
      user_id: userId
    }).select().single();
    if (error) throw error;
    res.status(201).json({ success: true, id: data.id, data });
    try {
      const storeMatch = await tryMatchOrder({
        amount: Number(pago),
        senderPhone: rest.phone ?? rest.senderPhone ?? rest.sender_wa ?? "",
        windowMinutes: 2
      });
      if (storeMatch) {
        const canAutoConfirm = storeMatch.confidence === "alta" && await isStoreCustomerVerifiedForAuto(storeMatch.order);
        if (canAutoConfirm) {
          await confirmStoreOrder(storeMatch.order.id, `pagos:${data.id}:${storeMatch.confidence}`, data);
        } else {
          await markStoreOrderBankDetected(storeMatch.order, `pagos:${data.id}:${storeMatch.confidence}`);
        }
      }
    } catch (storeMatchError) {
      console.warn("[pagos] store match error:", storeMatchError?.message ?? storeMatchError);
    }
    ingestManualPayment(supabaseServer, userId, {
      id: String(data.id),
      nombre: cleanName(nombre),
      monto: Number(pago),
      fecha: data.date,
      clienteId: customerId ?? void 0
    }).catch((e) => console.warn("[identity] ingestManualPayment error:", e?.message));
  } catch (error) {
    console.error("Error registrando pago:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});
app.patch("/api/pagos/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("pagos").update(req.body).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
app.delete("/api/pagos/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  await safeDelete(
    supabaseServer,
    "identity_evidence",
    "identidad_evidencia",
    {},
    (q) => q.eq("user_id", userId).eq("source", "manual_payment").eq("source_id", String(req.params.id))
  );
  await safeDelete(
    supabasePanel,
    "pagos_venta_live",
    "panel_pagos",
    {},
    (q) => q.eq("main_pago_id", Number(req.params.id))
  );
  const { error } = await supabaseServer.from("pagos").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});
app.get("/api/pedidos", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("pedidos").select("*").eq("user_id", userId).order("date", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});
app.post("/api/pedidos", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { customerId, customerName, itemCount, bagCount, label, labelType, status, totalAmount } = req.body;
  const { data, error } = await supabaseServer.from("pedidos").insert({
    customer_id: customerId ?? null,
    customer_name: customerName,
    item_count: itemCount ?? 0,
    bag_count: bagCount ?? 1,
    label: label ?? "",
    label_type: labelType ?? "",
    status: status ?? "procesar",
    total_amount: totalAmount ?? 0,
    user_id: userId
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});
app.patch("/api/pedidos/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("pedidos").update({ ...req.body, updated_at: /* @__PURE__ */ new Date() }).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  const isWebOrder = data?.source === "WEB" || data?.label_type === "WEB";
  if (req.body.status === "listo" && data?.customer_id && !isWebOrder) {
    (async () => {
      try {
        const { data: customer } = await supabaseServer.from("customers").select("phone, name").eq("id", data.customer_id).maybeSingle();
        if (!customer?.phone) return;
        await supabaseStore.from("store_customers").upsert(
          {
            whatsapp: customer.phone,
            display_name: customer.name ?? data.customer_name ?? ""
          },
          { onConflict: "whatsapp", ignoreDuplicates: false }
        );
        const storeBase = publicStoreBaseUrl(process.env.STORE_PUBLIC_URL || `${req.protocol}://${req.get("host")}`);
        const profileLink = `${storeBase}/tienda#profile/orders`;
        const pedidoLabel = data.label ? ` #${data.label}` : "";
        const message = `\xA1Hola ${(customer.name ?? "").split(" ")[0] || ""}! \u{1F389}
Tu pedido${pedidoLabel} est\xE1 listo. \xA1Muchas gracias por tu compra!

Mir\xE1 los detalles en tu perfil:
${profileLink}`;
        const ownerUserId = (process.env.STORE_OWNER_USER_ID || userId).trim();
        await enqueueStoreConfirmation(
          supabaseServer,
          ownerUserId,
          customer.phone,
          data.id,
          message
        );
      } catch (waErr) {
        console.error('[PATCH /pedidos] Error enviando WA "listo":', waErr?.message);
      }
    })();
  }
  res.json(data);
});
app.post("/api/pedidos/:id/prepare-label", async (req, res) => {
  if (String(process.env.FAST_LABEL_SAVE ?? "").trim() !== "true") {
    return res.status(409).json({ error: "FAST_LABEL_SAVE desactivado" });
  }
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  try {
    const pedidoId = String(req.params.id);
    const updateData = { updated_at: /* @__PURE__ */ new Date() };
    if (req.body.status) updateData.status = req.body.status;
    if (req.body.bag_count !== void 0) updateData.bag_count = Number(req.body.bag_count);
    if (req.body.item_count !== void 0) updateData.item_count = Number(req.body.item_count);
    const { data: updatedPedido, error: updateError } = await supabaseServer.from("pedidos").update(updateData).eq("id", pedidoId).eq("user_id", userId).select().single();
    if (updateError || !updatedPedido) throw updateError ?? new Error("Pedido no encontrado");
    const customerId = String(req.body.customer_id ?? updatedPedido.customer_id ?? "");
    if (!customerId) {
      return res.json({ ok: true, pedido: updatedPedido, pedidos: [updatedPedido], customer: null, labels: [] });
    }
    const { data: customer, error: customerError } = await supabaseServer.from("customers").select("id, full_name, canonical_name, normalized_name, phone, whatsapp_number, active_label, active_label_type").eq("id", customerId).eq("user_id", userId).maybeSingle();
    if (customerError) throw customerError;
    if (!customer) {
      return res.json({ ok: true, pedido: updatedPedido, pedidos: [updatedPedido], customer: null, labels: [] });
    }
    const { data: customerPedidos, error: pedidosError } = await supabaseServer.from("pedidos").select("*").eq("user_id", userId).eq("customer_id", customerId).order("date", { ascending: false });
    if (pedidosError) throw pedidosError;
    const activePedidos = (customerPedidos ?? []).filter((p) => {
      const status = String(p.status ?? "").toLowerCase();
      return status === "listo" || status === "preparado" || status === "ready";
    });
    for (const pedido of activePedidos) {
      const { error } = await supabaseServer.rpc("fn_upsert_order_and_assign", {
        p_firebase_id: String(pedido.id),
        p_customer_id: Number(customerId),
        p_total_bags: Number(pedido.bag_count || 1),
        p_total_items: Number(pedido.item_count || 0),
        p_total_amount: Number(pedido.total_amount || 0),
        p_assigned_by: "app"
      });
      if (error) throw new Error(`upsert order: ${error.message}`);
    }
    const activePedidoIds = activePedidos.map((p) => String(p.id));
    let labelUpdates = [];
    if (activePedidoIds.length > 0) {
      const { data: orderRows, error: orderRowsError } = await supabaseServer.from("orders").select("id, firebase_id").in("firebase_id", activePedidoIds);
      if (orderRowsError) throw orderRowsError;
      const orderIds = (orderRows ?? []).map((o) => o.id).filter(Boolean);
      const { data: allocationRows, error: allocationError } = orderIds.length > 0 ? await supabaseServer.from("container_allocations").select("order_id, container_id").in("order_id", orderIds).eq("status", "ACTIVE") : { data: [], error: null };
      if (allocationError) throw allocationError;
      const containerIds = [...new Set((allocationRows ?? []).map((a) => a.container_id).filter(Boolean))];
      const { data: containerRows, error: containerError } = containerIds.length > 0 ? await supabaseServer.from("storage_containers").select("id, container_code").in("id", containerIds) : { data: [], error: null };
      if (containerError) throw containerError;
      const orderIdByFirebase = new Map((orderRows ?? []).map((o) => [String(o.firebase_id), o.id]));
      const containerById = new Map((containerRows ?? []).map((c) => [c.id, c.container_code]));
      const allocationByOrder = new Map((allocationRows ?? []).map((a) => [a.order_id, a]));
      labelUpdates = activePedidos.flatMap((pedido) => {
        const orderId = orderIdByFirebase.get(String(pedido.id));
        const allocation = orderId ? allocationByOrder.get(orderId) : null;
        const label = allocation ? containerById.get(allocation.container_id) : null;
        return label ? [{ id: String(pedido.id), label: String(label), type: /^\d+$/.test(String(label)) ? "number" : "letter" }] : [];
      });
      await Promise.all(labelUpdates.map(
        (label) => supabaseServer.from("pedidos").update({ label: label.label, label_type: label.type, updated_at: /* @__PURE__ */ new Date() }).eq("id", label.id).eq("user_id", userId)
      ));
    }
    const primaryLabel = labelUpdates[0] ?? null;
    if (primaryLabel) {
      await supabaseServer.from("customers").update({
        active_label: primaryLabel.label,
        active_label_type: primaryLabel.type,
        label_updated_at: /* @__PURE__ */ new Date()
      }).eq("id", customerId).eq("user_id", userId);
    }
    if (updateData.status === "listo" && updatedPedido.customer_id && updatedPedido.source !== "WEB" && updatedPedido.label_type !== "WEB") {
      (async () => {
        try {
          const { data: readyCustomer } = await supabaseServer.from("customers").select("phone, full_name").eq("id", updatedPedido.customer_id).maybeSingle();
          if (!readyCustomer?.phone) return;
          await supabaseStore.from("store_customers").upsert(
            {
              whatsapp: readyCustomer.phone,
              display_name: readyCustomer.full_name ?? updatedPedido.customer_name ?? ""
            },
            { onConflict: "whatsapp", ignoreDuplicates: false }
          );
          const storeBase = publicStoreBaseUrl(process.env.STORE_PUBLIC_URL || `${req.protocol}://${req.get("host")}`);
          const profileLink = `${storeBase}/tienda#profile/orders`;
          const currentLabel = labelUpdates.find((l) => l.id === String(updatedPedido.id))?.label ?? updatedPedido.label;
          const pedidoLabel = currentLabel ? ` #${currentLabel}` : "";
          const message = `Hola ${(readyCustomer.full_name ?? "").split(" ")[0] || ""}!
Tu pedido${pedidoLabel} esta listo. Muchas gracias por tu compra!

Mira los detalles en tu perfil:
${profileLink}`;
          const ownerUserId = (process.env.STORE_OWNER_USER_ID || userId).trim();
          await enqueueStoreConfirmation(
            supabaseServer,
            ownerUserId,
            readyCustomer.phone,
            updatedPedido.id,
            message
          );
        } catch (waErr) {
          console.error("[prepare-label] Error enviando WA listo:", waErr?.message);
        }
      })();
    }
    const { data: refreshedPedidos, error: refreshedPedidosError } = await supabaseServer.from("pedidos").select("*").eq("user_id", userId).eq("customer_id", customerId).order("date", { ascending: false });
    if (refreshedPedidosError) throw refreshedPedidosError;
    const { data: refreshedCustomer } = await supabaseServer.from("customers").select("*").eq("id", customerId).eq("user_id", userId).maybeSingle();
    res.json({
      ok: true,
      pedido: (refreshedPedidos ?? []).find((p) => String(p.id) === pedidoId) ?? updatedPedido,
      pedidos: refreshedPedidos ?? [updatedPedido],
      customer: refreshedCustomer ?? customer,
      labels: labelUpdates
    });
  } catch (err) {
    console.error("[prepare-label] error:", err);
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.delete("/api/pedidos/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabaseServer.from("pedidos").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});
app.get("/api/transacciones", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("transactions").select("*").eq("user_id", userId).order("fecha", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});
app.post("/api/transacciones", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("transactions").insert({ ...req.body, user_id: userId, fecha: req.body.fecha ?? /* @__PURE__ */ new Date() }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});
app.patch("/api/transacciones/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("transactions").update(req.body).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
app.delete("/api/transacciones/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabaseServer.from("transactions").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});
app.get("/api/categorias", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("categories").select("*").eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});
app.post("/api/categorias", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("categories").insert({ ...req.body, user_id: userId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});
app.patch("/api/categorias/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("categories").update({ ...req.body, updated_at: /* @__PURE__ */ new Date() }).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
app.delete("/api/categorias/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabaseServer.from("categories").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});
app.get("/api/lives", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("live_sessions").select("*").eq("user_id", userId).order("scheduled_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});
app.post("/api/lives", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("live_sessions").insert({ ...req.body, user_id: userId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});
app.patch("/api/lives/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("live_sessions").update(req.body).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
app.delete("/api/lives/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabaseServer.from("live_sessions").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});
app.get("/api/ideas", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("ideas").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});
app.post("/api/ideas", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("ideas").insert({ ...req.body, user_id: userId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email y contrase\xF1a requeridos" });
  const { data, error } = await supabaseServer.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});
app.post("/api/auth/simple-login", async (req, res) => {
  try {
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const pin = String(req.body?.pin ?? "").trim();
    const allowedUsername = String(process.env.ADMIN_SIMPLE_USERNAME || "leidycandy").trim().toLowerCase();
    const allowedPin = String(process.env.ADMIN_SIMPLE_PIN || "7020").trim();
    if (username !== allowedUsername || pin !== allowedPin) {
      return res.status(401).json({ error: "Usuario o PIN incorrecto" });
    }
    const ownerUserId = String(process.env.STORE_OWNER_USER_ID || "13dcb065-6099-4776-982c-18e98ff2b27a").trim();
    const { data: ownerData, error: ownerError } = await supabaseServer.auth.admin.getUserById(ownerUserId);
    const owner = ownerData?.user;
    if (ownerError || !owner?.email) {
      return res.status(500).json({ error: "Usuario principal no encontrado" });
    }
    const password = `pin-${pin}`;
    let login = await supabaseServer.auth.signInWithPassword({ email: owner.email, password });
    if (login.error) {
      const { error: updateError } = await supabaseServer.auth.admin.updateUserById(owner.id, { password });
      if (updateError) return res.status(500).json({ error: updateError.message });
      login = await supabaseServer.auth.signInWithPassword({ email: owner.email, password });
    }
    if (login.error) return res.status(401).json({ error: "No se pudo iniciar sesion" });
    res.json({ user: login.data.user, session: login.data.session });
  } catch (err) {
    console.error("[auth] simple-login error:", err);
    res.status(500).json({ error: err?.message ?? "Error de login" });
  }
});
app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email y contrase\xF1a requeridos" });
  const { data, error } = await supabaseServer.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ user: data.user });
});
app.post("/api/auth/logout", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) await supabaseServer.auth.admin.signOut(token);
  res.json({ success: true });
});
app.get("/api/auth/me", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Token requerido" });
  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Token inv\xE1lido" });
  res.json({ user: data.user });
});
app.post("/api/store-auth/register", async (req, res) => {
  try {
    const { phone, pin, name } = req.body;
    if (!phone || !pin) return res.status(400).json({ error: "Faltan datos" });
    if (String(pin).length !== 4) return res.status(400).json({ error: "El PIN debe tener 4 d\xEDgitos" });
    const cleanPhone = phone.trim().replace(/\D/g, "");
    const email = `${cleanPhone}@tiendaleydi.com`;
    const password = `pin-${pin.trim()}`;
    const { data, error } = await supabaseStore.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // Sin verificación de email — experiencia sin fricción
      user_metadata: { name: name || "", phone: cleanPhone }
    });
    if (error) {
      if (error.message?.includes("already registered")) {
        return res.status(409).json({ error: "Este n\xFAmero ya tiene cuenta. Ingresa tu PIN para entrar." });
      }
      throw error;
    }
    await supabaseStore.from("store_customers").upsert({
      whatsapp: cleanPhone,
      pin_hash: password,
      // En producción usar bcrypt. Por ahora guardamos referencia.
      display_name: name || ""
    }, { onConflict: "whatsapp" }).select().single();
    res.json({ success: true, userId: data.user?.id });
  } catch (err) {
    console.error("[store-auth] Register error:", err);
    res.status(500).json({ error: err?.message || "Error al crear perfil" });
  }
});
app.post("/api/store-auth/login", async (req, res) => {
  try {
    const { phone, pin } = req.body;
    if (!phone || !pin) return res.status(400).json({ error: "N\xFAmero y PIN requeridos" });
    const cleanPhone = phone.trim().replace(/\D/g, "");
    const email = `${cleanPhone}@tiendaleydi.com`;
    const password = `pin-${pin.trim()}`;
    const { data, error } = await createStoreAuthClient().auth.signInWithPassword({ email, password });
    if (error) {
      return res.status(401).json({ error: "N\xFAmero o PIN incorrecto" });
    }
    const { data: customer } = await supabaseStore.from("store_customers").select("id, display_name, whatsapp, total_orders, total_spent").eq("whatsapp", cleanPhone).single();
    res.json({
      success: true,
      session: data.session,
      user: { ...data.user?.user_metadata, id: data.user?.id },
      customer
    });
  } catch (err) {
    console.error("[store-auth] Login error:", err);
    res.status(500).json({ error: err?.message || "Error al iniciar sesi\xF3n" });
  }
});
app.get("/api/store-auth/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Token requerido" });
    const { data, error } = await createStoreAuthClient().auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida" });
    const cleanPhone = data.user.email?.replace("@tiendaleydi.com", "") ?? "";
    const [{ data: customer }, { data: orders }] = await Promise.all([
      supabaseStore.from("store_customers").select("*").eq("whatsapp", cleanPhone).single(),
      supabaseStore.from("store_orders").select("id, status, total, created_at, items, payment_verified_at, expires_at, customer_wa, customer_name, customer_selection, delivery_date, delivery_slot, wa_proof_received, payment_ref, partial_payment_amount, payment_shortfall").eq("customer_wa", cleanPhone).order("created_at", { ascending: false }).limit(20)
    ]);
    const paidOrderWithName = (orders ?? []).find(
      (order) => order.status === "paid" && isUsableStoreName(order.customer_name)
    );
    const profileCustomer = {
      ...customer ?? {},
      display_name: customer?.display_name || paidOrderWithName?.customer_name || null,
      is_verified_customer: !!customer?.is_verified_customer || !!paidOrderWithName,
      verified_at: customer?.verified_at ?? paidOrderWithName?.payment_verified_at ?? null,
      verified_source: customer?.verified_source ?? (paidOrderWithName ? "store" : null)
    };
    res.json({
      user: data.user,
      customer: profileCustomer,
      orders: orders ?? []
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Error interno" });
  }
});
var mapStoreProducts = (rows, preferredOrder = []) => {
  const order = new Map(preferredOrder.map((id, index) => [Number(id), index]));
  return [...rows].sort((a, b) => (order.get(Number(a.id)) ?? 9999) - (order.get(Number(b.id)) ?? 9999)).map((row) => ({
    id: String(row.id),
    name: row.name,
    title: row.name,
    price: Number(row.price),
    description: row.description ?? "",
    images: Array.isArray(row.images) && row.images.length > 0 ? row.images : row.image_url ? [row.image_url] : [],
    sizes: Array.isArray(row.sizes) ? row.sizes : [],
    available: row.available ?? true,
    stock: row.stock ?? 1,
    category: row.category ?? "General",
    priority_order: row.priority_order ?? 0,
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0)
  }));
};
var getStoreUserPhone = async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "Token requerido" });
    return null;
  }
  const { data, error } = await createStoreAuthClient().auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Sesion invalida" });
    return null;
  }
  return data.user.email?.replace("@tiendaleydi.com", "").replace(/\D/g, "") ?? "";
};
var loadFavoriteProducts = async (phone) => {
  const cleanPhone = String(phone ?? "").replace(/\D/g, "");
  if (!cleanPhone) return [];
  const { data: favoriteRows, error } = await supabaseStore.from("store_favorites").select("product_id").eq("customer_wa", cleanPhone).order("created_at", { ascending: false });
  if (error) throw error;
  const ids = [...new Set((favoriteRows ?? []).map((row) => Number(row.product_id)).filter(Boolean))];
  if (ids.length === 0) return [];
  const { data, error: productsError } = await supabaseStore.from("products").select("*").in("id", ids).eq("available", true);
  if (productsError) throw productsError;
  return mapStoreProducts(data ?? [], ids);
};
app.get("/api/store-favorites", async (req, res) => {
  try {
    const phone = await getStoreUserPhone(req, res);
    if (!phone) return;
    res.json({ products: await loadFavoriteProducts(phone) });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Error al cargar favoritos" });
  }
});
app.post("/api/store-favorites", async (req, res) => {
  try {
    const phone = await getStoreUserPhone(req, res);
    if (!phone) return;
    const productId = Number(req.body?.productId);
    if (!productId) return res.status(400).json({ error: "productId requerido" });
    await supabaseStore.from("store_favorites").delete().eq("customer_wa", phone).eq("product_id", productId);
    const { error } = await supabaseStore.from("store_favorites").insert({ customer_wa: phone, product_id: productId });
    if (error) throw error;
    res.json({ products: await loadFavoriteProducts(phone) });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Error al guardar favorito" });
  }
});
app.post("/api/store-favorites/sync", async (req, res) => {
  try {
    const phone = await getStoreUserPhone(req, res);
    if (!phone) return;
    const productIds = Array.isArray(req.body?.productIds) ? [...new Set(req.body.productIds.map((id) => Number(id)).filter(Boolean))] : [];
    for (const productId of productIds) {
      await supabaseStore.from("store_favorites").delete().eq("customer_wa", phone).eq("product_id", productId);
    }
    if (productIds.length > 0) {
      const { error } = await supabaseStore.from("store_favorites").insert(productIds.map((productId) => ({ customer_wa: phone, product_id: productId })));
      if (error) throw error;
    }
    res.json({ products: await loadFavoriteProducts(phone) });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Error al sincronizar favoritos" });
  }
});
app.delete("/api/store-favorites", async (req, res) => {
  try {
    const phone = await getStoreUserPhone(req, res);
    if (!phone) return;
    const productId = Number(req.body?.productId);
    if (!productId) return res.status(400).json({ error: "productId requerido" });
    const { error } = await supabaseStore.from("store_favorites").delete().eq("customer_wa", phone).eq("product_id", productId);
    if (error) throw error;
    res.json({ products: await loadFavoriteProducts(phone) });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Error al eliminar favorito" });
  }
});
app.post("/api/upload-image", async (req, res) => {
  try {
    const { base64Data, fileName, contentType } = req.body;
    if (!base64Data || !fileName) return res.status(400).json({ error: "Faltan datos" });
    const base64String = base64Data.split(",")[1] || base64Data;
    const buffer = Buffer.from(base64String, "base64");
    let uploadClient = supabaseStore;
    let uploadResult = await supabaseStore.storage.from("store_images").upload(fileName, buffer, { contentType: contentType || "image/webp", upsert: true });
    if (uploadResult.error) {
      const message = String(uploadResult.error.message ?? "").toLowerCase();
      if (message.includes("row-level security") || message.includes("violates row-level security")) {
        uploadClient = supabaseServer;
        uploadResult = await supabaseServer.storage.from("store_images").upload(fileName, buffer, { contentType: contentType || "image/webp", upsert: true });
      }
      if (uploadResult.error) throw uploadResult.error;
    }
    const { data: publicUrlData } = uploadClient.storage.from("store_images").getPublicUrl(uploadResult.data.path);
    try {
      const publicUrl = publicUrlData.publicUrl;
      const renderUrl = new URL(publicUrl);
      renderUrl.pathname = renderUrl.pathname.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
      renderUrl.searchParams.set("width", "320");
      renderUrl.searchParams.set("quality", "58");
      renderUrl.searchParams.set("resize", "cover");
      const thumbResponse = await fetch(renderUrl.toString());
      if (thumbResponse.ok) {
        const thumbBuffer = Buffer.from(await thumbResponse.arrayBuffer());
        const cleanPath = String(uploadResult.data.path ?? "").replace(/^\/+/, "");
        const dot = cleanPath.lastIndexOf(".");
        const base = dot >= 0 ? cleanPath.slice(0, dot) : cleanPath;
        await uploadClient.storage.from("store_images").upload(`thumbs/${base}.jpg`, thumbBuffer, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
      }
    } catch (thumbErr) {
      console.warn("[store/upload-image] No se pudo crear thumbnail directo:", thumbErr);
    }
    res.json({ publicUrl: publicUrlData.publicUrl });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err?.message || "Error al subir imagen" });
  }
});
app.use("/api/ai", createAiRouter(supabaseServer, supabasePanel));
app.use("/api/identity", createIdentityRouter(supabaseServer, supabaseStore, supabasePanel));
app.use("/api/live-sales", createLiveSalesRouter(supabasePanel, supabaseServer, supabaseStore));
app.use("/api/whatsapp", createWhatsappRouter(supabaseServer));
app.use("/api/store", createStoreSelectionRouter(supabaseStore));
app.use("/api/store", createStoreSettingsRouter(supabaseStore));
app.get("/api/products", async (req, res) => {
  try {
    const showAll = req.query.admin === "true" && req.headers["x-user-id"];
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const category = req.query.category;
    const search = req.query.search;
    const publicStorefront = !showAll;
    let query = showAll ? supabaseStore.from("products").select("*", { count: "exact" }) : supabaseStore.from("products").select("*");
    if (!showAll) query = query.eq("available", true);
    if (category && category !== "Todos") {
      query = query.eq("category", category);
    }
    if (search) {
      query = query.ilike("name", `%${search}%`);
    }
    const endRange = page * limit - 1 + (publicStorefront ? 1 : 0);
    query = query.order("created_at", { ascending: false }).range((page - 1) * limit, endRange);
    const { data, count, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    const responseData = publicStorefront ? rows.slice(0, limit) : rows;
    const hasMore = publicStorefront ? rows.length > limit : count ? page * limit < count : false;
    if (publicStorefront) {
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    } else {
      res.setHeader("Cache-Control", "no-store");
    }
    res.json({
      data: responseData,
      total: publicStorefront ? (page - 1) * limit + responseData.length + (hasMore ? 1 : 0) : count ?? responseData.length,
      page,
      limit,
      hasMore
    });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.get("/api/products/:id", async (req, res) => {
  try {
    const { data, error } = await supabaseStore.from("products").select("*").eq("id", Number(req.params.id)).single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Producto no encontrado" });
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.post("/api/products/:id/view", async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const { data, error } = await supabaseStore.from("products").select("views").eq("id", productId).single();
    if (error || !data) return res.status(404).json({ error: "Producto no encontrado" });
    const newViews = (data.views || 0) + 1;
    await supabaseStore.from("products").update({ views: newViews }).eq("id", productId);
    res.json({ success: true, views: newViews });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.post("/api/products/:id/like", async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const { data, error } = await supabaseStore.from("products").select("likes").eq("id", productId).single();
    if (error || !data) return res.status(404).json({ error: "Producto no encontrado" });
    const newLikes = (data.likes || 0) + 1;
    await supabaseStore.from("products").update({ likes: newLikes }).eq("id", productId);
    res.json({ success: true, likes: newLikes });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.post("/api/products", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { name, price, description, category, sizes, image_url, images, available } = req.body;
    if (!name || price === void 0) {
      return res.status(400).json({ error: "name y price requeridos" });
    }
    const { data, error } = await supabaseStore.from("products").insert({
      name,
      price: Number(price),
      description: description ?? "",
      category: category ?? "General",
      sizes: Array.isArray(sizes) ? sizes : [],
      images: Array.isArray(images) ? images : [],
      available: available ?? true
    }).select().single();
    if (error) throw error;
    if (data) {
      try {
        const results = await publishProductToBuffer(data);
        await savePublicationResults(supabaseStore, data.id, results);
      } catch (err) {
        console.warn("[buffer] Error en publicaci\xF3n:", err?.message);
      }
    }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.patch("/api/products/:id", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { image_url, ...safeBody } = req.body ?? {};
    const { data, error } = await supabaseStore.from("products").update(safeBody).eq("id", Number(req.params.id)).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.post("/api/products/:id/relist", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const productId = Number(req.params.id);
    const { data: product, error: readError } = await supabaseStore.from("products").select("*").eq("id", productId).single();
    if (readError) throw readError;
    if (!product) return res.status(404).json({ error: "Producto no encontrado" });
    const { id, created_at, updated_at, ...copy } = product;
    const { data, error } = await supabaseStore.from("products").insert({
      ...copy,
      available: true,
      stock: 1
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.delete("/api/products/:id", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { error } = await supabaseStore.from("products").delete().eq("id", Number(req.params.id));
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.get("/api/store-orders/reserved-products", async (req, res) => {
  try {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data: pendingOrders } = await supabaseStore.from("store_orders").select("id, items, expires_at, wa_proof_received, partial_payment_amount").eq("status", "pending").or(`expires_at.gt.${now},wa_proof_received.eq.true,partial_payment_amount.not.is.null`);
    const reservedMap = {};
    for (const order of pendingOrders ?? []) {
      const expiresAt = order.expires_at;
      for (const item of order.items ?? []) {
        if (item.productId) {
          reservedMap[String(item.productId)] = expiresAt;
        }
      }
    }
    res.setHeader("Cache-Control", "public, s-maxage=3, stale-while-revalidate=10");
    res.json(reservedMap);
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.get("/api/store-orders/:id/status", async (req, res) => {
  try {
    const { data, error } = await supabaseStore.from("store_orders").select("id, status, payment_verified_at, payment_ref, wa_proof_received, items, total, expires_at, customer_wa, partial_payment_amount, payment_shortfall").eq("id", Number(req.params.id)).single();
    if (error) throw error;
    const paymentRef = String(data.payment_ref ?? "");
    res.json({
      id: data.id,
      status: data.status,
      verifiedAt: data.payment_verified_at,
      bankDetected: paymentRef.includes("bank-detected"),
      proofReceived: !!data.wa_proof_received,
      requiresProof: data.status !== "paid" && data.status !== "confirmed" && paymentRef.includes("bank-detected"),
      items: data.items ?? [],
      total: data.total ?? 0,
      partialPaymentAmount: data.partial_payment_amount ?? null,
      paymentShortfall: data.payment_shortfall ?? null,
      expiresAt: data.expires_at ?? null,
      customerWa: data.customer_wa ?? ""
    });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.post("/api/store-orders", async (req, res) => {
  try {
    const {
      items,
      customerName,
      customerPhone,
      delivery_type,
      delivery_date,
      delivery_slot,
      delivery_address,
      delivery_notes
    } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items requerido (array no vac\xEDo)" });
    }
    const normalizedItems = items.map((item) => ({
      productId: String(item?.productId ?? "").trim(),
      productName: String(item?.productName ?? "").trim(),
      size: String(item?.size ?? "").trim(),
      quantity: Math.max(1, Math.floor(Number(item?.quantity) || 1))
    })).filter((item) => item.productId);
    if (normalizedItems.length === 0) {
      return res.status(400).json({ error: "items requerido (array no vac\xEDo)" });
    }
    const customerWa = String(customerPhone ?? "").trim();
    if (customerWa) {
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const { data: existingPending } = await supabaseStore.from("store_orders").select("id, expires_at, total").eq("customer_wa", customerWa).eq("status", "pending").gt("expires_at", nowIso).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existingPending) {
        return res.status(409).json({
          error: "Ya tienes un pedido activo esperando pago. Contin\xFAa con ese antes de crear otro.",
          existingOrderId: existingPending.id,
          expiresAt: existingPending.expires_at,
          total: existingPending.total,
          duplicate: true
        });
      }
    }
    const productIds = [...new Set(normalizedItems.map((i) => String(i.productId)).filter(Boolean))];
    if (productIds.length > 0) {
      const { data: pendingOrders } = await supabaseStore.from("store_orders").select("id, items, expires_at").eq("status", "pending");
      const now = /* @__PURE__ */ new Date();
      const conflictProducts = [];
      for (const po of pendingOrders ?? []) {
        if (po.expires_at && new Date(po.expires_at) < now) continue;
        const poProductIds = (po.items ?? []).map((i) => String(i.productId));
        for (const pid of productIds) {
          if (poProductIds.includes(pid)) {
            conflictProducts.push(pid);
          }
        }
      }
      if (conflictProducts.length > 0) {
        return res.status(409).json({
          error: "Uno o m\xE1s productos est\xE1n reservados por otra persona. Se liberar\xE1n pronto si no se confirma el pago.",
          conflictProducts
        });
      }
    }
    let orderItems = normalizedItems;
    let computedTotal = 0;
    if (productIds.length > 0) {
      const { data: prods } = await supabaseStore.from("products").select("id, name, price, available, stock").in("id", productIds);
      const productsById = new Map((prods ?? []).map((p) => [String(p.id), p]));
      const unavailable = normalizedItems.filter((item) => {
        const product = productsById.get(String(item.productId));
        const stock = Number(product?.stock ?? 1);
        return !product || !product.available || stock <= 0 || stock < item.quantity;
      });
      if (unavailable.length > 0) {
        return res.status(409).json({
          error: "Uno o m\xE1s productos ya no est\xE1n disponibles.",
          unavailableProducts: unavailable.map((item) => item.productId)
        });
      }
      orderItems = normalizedItems.map((item) => {
        const product = productsById.get(String(item.productId));
        const price = Number(product?.price ?? 0);
        computedTotal += price * item.quantity;
        return {
          productId: item.productId,
          productName: product?.name ?? item.productName,
          price,
          size: item.size,
          quantity: item.quantity
        };
      });
    }
    let userId = null;
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      const { data: authUser } = await supabaseServer.auth.getUser(token);
      if (authUser?.user) {
        userId = authUser.user.id;
      }
    }
    const RESERVATION_MINUTES = 2;
    const { data, error } = await supabaseStore.from("store_orders").insert({
      items: orderItems,
      total: computedTotal,
      customer_name: customerName ?? "",
      customer_wa: customerPhone ?? "",
      delivery_type: delivery_type ?? null,
      delivery_date: delivery_date ?? null,
      delivery_slot: delivery_slot ?? null,
      delivery_address: delivery_address ?? null,
      delivery_notes: delivery_notes ?? null,
      delivery_status: "pending",
      status: "pending",
      expires_at: new Date(Date.now() + RESERVATION_MINUTES * 60 * 1e3).toISOString()
    }).select().single();
    if (error) throw error;
    console.log(`[store] \u{1F6D2} Pedido #${data.id} creado. ${productIds.length} productos reservados por ${RESERVATION_MINUTES} min.`);
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
setInterval(async () => {
  try {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const { data: expired } = await supabaseStore.from("store_orders").select("id, items").eq("status", "pending").eq("wa_proof_received", false).is("partial_payment_amount", null).lt("expires_at", now);
    if (!expired?.length) return;
    for (const order of expired) {
      await supabaseStore.from("store_orders").update({ status: "cancelled" }).eq("id", order.id).eq("status", "pending").eq("wa_proof_received", false);
      const pIds = (order.items ?? []).map((i) => i.productId).filter(Boolean);
      console.log(`[store] \u23F0 Pedido #${order.id} expirado. ${pIds.length} reservas removidas.`);
    }
  } catch (e) {
  }
}, 30 * 1e3);
setInterval(async () => {
  return;
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1e3).toISOString();
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1e3).toISOString();
    const { data: needReminder } = await supabaseStore.from("store_orders").select("id, customer_wa, total, payment_verified_at").like("payment_ref", "bank-detected:%").eq("wa_proof_received", false).is("reminder_sent_at", null).not("payment_verified_at", "is", null).lt("payment_verified_at", fiveMinAgo);
    for (const o of needReminder ?? []) {
      const waNumber = String(o.customer_wa ?? "").replace(/\D/g, "");
      if (!waNumber) continue;
      try {
        await supabaseServer.from("whatsapp_message_queue").insert({
          user_id: String(process.env.STORE_OWNER_USER_ID || "store-auto"),
          phone: waNumber.startsWith("591") ? waNumber : `591${waNumber}`,
          message_body: `Hola! Vimos tu pago de Bs ${o.total}. Falta tu comprobante para confirmar el pedido #${o.id}. Env\xEDalo aqu\xED por WhatsApp, por favor.`,
          type: "store_proof_reminder",
          reference_id: String(o.id),
          reference_type: "store_order"
        });
        await supabaseStore.from("store_orders").update({ reminder_sent_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", o.id);
        console.log(`[store] \u{1F4E9} Recordatorio de comprobante enviado para pedido #${o.id}`);
      } catch (e) {
        console.error("[store] Error encolando recordatorio:", e?.message);
      }
    }
    const { data: needAutoConfirm } = await supabaseStore.from("store_orders").select("id, payment_ref, customer_wa, customer_name").like("payment_ref", "bank-detected:%").eq("wa_proof_received", false).in("status", ["pending", "cancelled"]).not("payment_verified_at", "is", null).lt("payment_verified_at", fifteenMinAgo);
    for (const o of needAutoConfirm ?? []) {
      try {
        if (!await isStoreCustomerVerifiedForAuto(o)) continue;
        await confirmStoreOrder(o.id, `${o.payment_ref}:auto-confirm-15min`);
        console.log(`[store] \u2705 Pedido #${o.id} auto-confirmado tras 15 min sin comprobante`);
      } catch (e) {
        console.error("[store] Error auto-confirmando:", e?.message);
      }
    }
  } catch (e) {
  }
}, 60 * 1e3);
app.get("/api/store-orders/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Token requerido" });
    const { data: authUser, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !authUser.user) return res.status(401).json({ error: "Token inv\xE1lido" });
    const userId = authUser.user.id;
    const { data, error } = await supabaseStore.from("store_orders").select("*").eq("customer_wa", authUser.user.email?.replace("@tiendaleydi.com", "") ?? "").order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.get("/api/store-orders/admin", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
    const { data, error } = await supabaseStore.from("store_orders").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.get("/api/store-orders", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Token requerido" });
    const { data: user, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user.user) return res.status(401).json({ error: "Token inv\xE1lido" });
    const customerPhone = user.user.email?.replace("@tiendaleydi.com", "") ?? "";
    const { data, error } = await supabaseStore.from("store_orders").select("*").eq("customer_wa", customerPhone).order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.patch("/api/store-orders/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Token requerido" });
    const { data: user, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user.user) return res.status(401).json({ error: "Token inv\xE1lido" });
    const { status, wa_sent, hideProducts } = req.body;
    const updateData = {};
    if (status) updateData.status = status;
    if (wa_sent !== void 0) updateData.wa_sent = wa_sent;
    const { data, error } = await supabaseStore.from("store_orders").update(updateData).eq("id", Number(req.params.id)).select().single();
    if (error) throw error;
    if (hideProducts && status === "confirmed" && data.items) {
      try {
        const productIds = data.items.map((i) => i.productId).filter(Boolean);
        if (productIds.length > 0) {
          await supabaseStore.from("products").update({ stock: 0, available: false }).in("id", productIds);
        }
      } catch (e) {
        console.error("Error al ocultar productos del pedido:", e);
      }
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
async function tryMatchOrder(params) {
  const { amount, senderPhone, orderRef, windowMinutes = 2 } = params;
  const cleanSender = senderPhone ? senderPhone.replace(/\D/g, "") : "";
  if (orderRef) {
    const refId = Number(String(orderRef).replace(/\D/g, ""));
    if (!Number.isFinite(refId) || refId <= 0) return null;
    const { data: exact, error: exactError } = await supabaseStore.from("store_orders").select("*").eq("id", refId).in("status", ["pending", "cancelled", "paid", "confirmed"]).maybeSingle();
    if (exactError || !exact) return null;
    if (amount && Number(exact.total) !== Number(amount)) {
      console.warn(`[store-match] Pedido #${refId} encontrado, pero monto no coincide (${exact.total} != ${amount})`);
      return null;
    }
    if (cleanSender) {
      const orderPhones = phoneVariants(exact.customer_wa, exact.customer_phone);
      const phoneMatches = orderPhones.some((p) => p === cleanSender || p.endsWith(cleanSender) || cleanSender.endsWith(p));
      if (!phoneMatches) {
        console.warn(`[store-match] Pedido #${refId} encontrado, pero WhatsApp no coincide (${cleanSender})`);
        return null;
      }
    }
    console.log(`[store-match] MAXIMA: pedido #${refId} verificado por codigo + WhatsApp`);
    return { order: exact, confidence: "maxima" };
  }
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1e3).toISOString();
  let query = supabaseStore.from("store_orders").select("*").in("status", ["pending", "cancelled"]).gt("created_at", windowStart);
  if (amount) query = query.eq("total", amount);
  const { data: candidates, error } = await query.order("created_at", { ascending: false });
  if (error || !candidates?.length) return null;
  if (orderRef) {
    const refId = Number(orderRef.replace(/\D/g, ""));
    const exact = candidates.find((o) => o.id === refId);
    if (exact) {
      console.log(`[store-match] MAXIMA: pedido #${refId} verificado por c\xF3digo + monto`);
      return { order: exact, confidence: "maxima" };
    }
  }
  if (candidates.length === 1) {
    console.log(`[store-match] ALTA: pedido #${candidates[0].id} \u2014 monto \xFAnico (${amount} Bs)`);
    return { order: candidates[0], confidence: "alta" };
  }
  if (cleanSender) {
    const byPhone = candidates.filter((o) => {
      const orderPhones = phoneVariants(o.customer_wa, o.customer_phone);
      return orderPhones.some((p) => p === cleanSender || p.endsWith(cleanSender) || cleanSender.endsWith(p));
    });
    if (byPhone.length === 1) {
      console.log(`[store-match] ALTA: pedido #${byPhone[0].id} \u2014 desempate por WA ${cleanSender}`);
      return { order: byPhone[0], confidence: "alta" };
    }
  }
  console.log(`[store-match] SIN MATCH AUTOMATICO: ${candidates.length} pedidos con ${amount} Bs; se requiere #pedido por WhatsApp`);
  return null;
}
function isUsableStoreName(name) {
  const value = String(name ?? "").trim().toLowerCase();
  return value.length >= 6 && !value.startsWith("cliente tienda") && value !== "cliente";
}
async function isStoreCustomerVerifiedForAuto(order) {
  const waNumber = String(order?.customer_wa ?? "").replace(/\D/g, "");
  if (!waNumber) return false;
  const { data: customer } = await supabaseStore.from("store_customers").select("*").eq("whatsapp", waNumber).maybeSingle();
  if (customer?.is_verified_customer === true) return true;
  const hasRealName = isUsableStoreName(customer?.display_name) || isUsableStoreName(order?.customer_name);
  if (!hasRealName) return false;
  const { data: previousPaid } = await supabaseStore.from("store_orders").select("id").eq("customer_wa", waNumber).eq("status", "paid").neq("id", Number(order.id)).limit(1);
  return !!previousPaid?.length || Number(customer?.total_orders ?? 0) > 0 || Number(customer?.total_spent ?? 0) > 0;
}
async function enqueueStoreProofRequest(order) {
  return;
  const orderId = Number(order?.id);
  const waNumber = String(order?.customer_wa ?? "").replace(/\D/g, "");
  if (!orderId || !waNumber) return;
  const { data: current } = await supabaseStore.from("store_orders").select("reminder_sent_at").eq("id", orderId).maybeSingle();
  if (current?.reminder_sent_at) return;
  await supabaseServer.from("whatsapp_message_queue").insert({
    user_id: String(process.env.STORE_OWNER_USER_ID || "store-auto"),
    phone: waNumber.startsWith("591") ? waNumber : `591${waNumber}`,
    message_body: `Hola! Vimos tu pago de Bs ${Number(order.total).toFixed(2)}. Falta tu comprobante para confirmar el pedido #${orderId}. Env\xC3\xADalo aqu\xC3\xAD por WhatsApp, por favor.`,
    type: "store_proof_reminder",
    reference_id: String(orderId),
    reference_type: "store_order"
  });
  await supabaseStore.from("store_orders").update({ reminder_sent_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", orderId);
}
async function markStoreOrderBankDetected(order, source) {
  const currentRef = String(order?.payment_ref ?? "");
  const nextRef = currentRef.includes("bank-detected") ? currentRef : `bank-detected:${source}`;
  await supabaseStore.from("store_orders").update({
    payment_method: "qr",
    payment_ref: nextRef,
    // marca timestamp para que el cron de recordatorio pueda medir el tiempo transcurrido
    payment_verified_at: order?.payment_verified_at ?? (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", Number(order.id)).in("status", ["pending", "cancelled"]);
  await enqueueStoreProofRequest(order);
}
async function markStoreOrderAmountMismatch(order, paidAmount, source) {
  const total = Number(order?.total ?? 0);
  const paid = Number(paidAmount);
  if (!Number.isFinite(total) || !Number.isFinite(paid) || total <= 0 || paid <= 0) return null;
  if (Math.abs(paid - total) < 0.01) return null;
  const difference = Number(Math.abs(paid - total).toFixed(2));
  const type = paid < total ? "less" : "more";
  const currentRef = String(order?.payment_ref ?? "");
  const nextRef = currentRef.includes("amount-mismatch:") ? currentRef : `amount-mismatch:${type}:${source}`;
  const { error } = await supabaseStore.from("store_orders").update({
    partial_payment_amount: paid,
    payment_shortfall: type === "less" ? difference : 0,
    payment_method: "qr",
    payment_ref: nextRef
  }).eq("id", Number(order.id)).eq("status", "pending");
  if (error) {
    console.warn("[store-match] no se pudo marcar diferencia de monto:", error.message);
    return null;
  }
  return { type, difference, paid, total };
}
async function captureStoreBankInbox(payload, paymentTime) {
  const parsed = parseMacrodroidBankPayload(payload);
  if (!parsed.amount) return { captured: false, reason: "missing_amount" };
  const windowStart = new Date(paymentTime.getTime() - 35 * 60 * 1e3).toISOString();
  const windowEnd = new Date(paymentTime.getTime() + 5 * 60 * 1e3).toISOString();
  const { data: candidates, error: candidateError } = await supabaseStore.from("store_orders").select("id,total,customer_wa,customer_name,status,created_at").in("status", ["pending", "cancelled"]).eq("total", parsed.amount).gte("created_at", windowStart).lte("created_at", windowEnd).order("created_at", { ascending: false });
  if (candidateError) {
    console.warn("[store-bank-inbox] no se pudo buscar pedidos tienda:", candidateError.message);
    return { captured: false, reason: "candidate_error" };
  }
  if (!candidates?.length) {
    const { data: mismatchCandidates } = await supabaseStore.from("store_orders").select("id,total,customer_wa,customer_name,status,created_at").in("status", ["pending", "cancelled"]).gte("created_at", windowStart).lte("created_at", windowEnd).order("created_at", { ascending: false }).limit(20);
    const senderName = cleanName(parsed.senderName ?? "");
    if (!senderName) return { captured: false, reason: "no_store_candidate" };
    const verifiedMismatchCandidates = [];
    for (const order of mismatchCandidates ?? []) {
      if (Math.abs(Number(order.total) - Number(parsed.amount)) < 0.01) continue;
      const isVerified = await isStoreCustomerVerifiedForAuto(order);
      let orderName = cleanName(order.customer_name ?? "");
      if (!orderName) {
        const waNumber = String(order.customer_wa ?? "").replace(/\D/g, "");
        const { data: customerForName } = waNumber ? await supabaseStore.from("store_customers").select("display_name").eq("whatsapp", waNumber).maybeSingle() : { data: null };
        orderName = cleanName(customerForName?.display_name ?? "");
      }
      const nameMatches = !!orderName && (orderName === senderName || orderName.includes(senderName) || senderName.includes(orderName));
      if (isVerified && nameMatches) verifiedMismatchCandidates.push(order);
    }
    if (verifiedMismatchCandidates.length === 1) {
      const order = verifiedMismatchCandidates[0];
      const mismatch = await markStoreOrderAmountMismatch(order, parsed.amount, `store-bank:${parsed.hash}`);
      const hash2 = `store-bank-mismatch:${parsed.hash}`;
      const { data: existing2 } = await supabaseStore.from("payment_events").select("id").eq("hash", hash2).maybeSingle();
      if (!existing2) {
        await supabaseStore.from("payment_events").insert({
          source: "macrodroid_bank_amount_mismatch",
          raw_text: parsed.rawText,
          amount: parsed.amount,
          sender_name: parsed.senderName,
          sender_wa: "",
          processed: false,
          match_confidence: mismatch?.type === "more" ? "amount_excess" : "amount_partial",
          hash: hash2,
          matched_order_id: order.id
        });
      }
      return { captured: true, candidateCount: 1, amountMismatch: mismatch };
    }
    return { captured: false, reason: "no_store_candidate" };
  }
  const matchedOrder = candidates.length === 1 ? candidates[0] : null;
  if (matchedOrder) {
    if (await isStoreCustomerVerifiedForAuto(matchedOrder)) {
      await confirmStoreOrder(matchedOrder.id, `store-bank:${parsed.hash}:verified-customer`, {
        nombre: parsed.senderName,
        pago: parsed.amount
      });
    } else {
      await markStoreOrderBankDetected(matchedOrder, `store-bank:${parsed.hash}:pending-proof`);
    }
  }
  const hash = `store-bank:${parsed.hash}`;
  const { data: existing } = await supabaseStore.from("payment_events").select("id").eq("hash", hash).maybeSingle();
  if (existing) return { captured: true, duplicate: true, candidateCount: candidates.length };
  const { error: insertError } = await supabaseStore.from("payment_events").insert({
    source: "macrodroid_bank_pending",
    raw_text: parsed.rawText,
    amount: parsed.amount,
    sender_name: parsed.senderName,
    sender_wa: "",
    processed: !!matchedOrder && await isStoreCustomerVerifiedForAuto(matchedOrder),
    match_confidence: candidates.length === 1 ? "pending_single_candidate" : "pending_multiple_candidates",
    hash,
    matched_order_id: matchedOrder?.id ?? null
  });
  if (insertError) {
    console.warn("[store-bank-inbox] no se pudo guardar pago tienda:", insertError.message);
    return { captured: false, reason: "insert_error" };
  }
  console.log(`[store-bank-inbox] pago guardado pendiente en tienda: ${parsed.amount} Bs, candidatos=${candidates.length}`);
  return { captured: true, candidateCount: candidates.length };
}
async function confirmStoreOrder(orderId, source, linkedPago) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const { data, error } = await supabaseStore.from("store_orders").update({
    status: "paid",
    payment_verified_at: now,
    payment_method: "qr",
    payment_ref: source
  }).eq("id", orderId).in("status", ["pending", "cancelled"]).select().single();
  if (error || !data) return false;
  const ownerUserId = String(process.env.STORE_OWNER_USER_ID || data.user_id || "store-auto").trim();
  try {
    const productIds = (data.items ?? []).map((i) => i.productId).filter(Boolean);
    if (productIds.length > 0) {
      await supabaseStore.from("products").update({ stock: 0, available: false }).in("id", productIds);
    }
  } catch (e) {
    console.error("[store-match] Error ocultando productos:", e);
  }
  let finalName = "";
  try {
    console.log(`[store-match] Iniciando fusi\xF3n log\xEDstica para pedido #${orderId}`);
    console.log(`[store-match] source: ${source}`);
    console.log(`[store-match] ownerUserId: ${ownerUserId}`);
    console.log(`[store-match] data.customer_wa: ${data.customer_wa}`);
    console.log(`[store-match] data.customer_name: ${data.customer_name}`);
    console.log(`[store-match] data.total: ${data.total}`);
    if (linkedPago?.nombre) {
      finalName = String(linkedPago.nombre).trim();
      console.log(`[store-match] Nombre desde pago vinculado #${linkedPago.id}: ${finalName}`);
    }
    if (!finalName && (source.includes("bank") || source.includes("macrodroid"))) {
      const { data: bankEvent } = await supabaseServer.from("payment_events").select("sender_name").eq("matched_order_id", orderId).maybeSingle();
      console.log(`[store-match] bankEvent: ${bankEvent ? "encontrado" : "null"}`);
      if (bankEvent?.sender_name) finalName = bankEvent.sender_name;
    }
    if (!finalName) {
      const { data: storeEvent } = await supabaseStore.from("payment_events").select("sender_name").eq("matched_order_id", orderId).maybeSingle();
      if (storeEvent?.sender_name) {
        finalName = String(storeEvent.sender_name).trim();
        console.log(`[store-match] Nombre desde TiendaOnline payment_events: ${finalName}`);
      }
    }
    if (!finalName && data.customer_name) {
      finalName = String(data.customer_name).trim();
      console.log(`[store-match] Nombre desde store_orders.customer_name: ${finalName}`);
    }
    const waNumber = String(data.customer_wa || "").trim();
    if (waNumber && finalName) {
      const { data: updatedStoreCustomers, error: storeCustomerNameErr } = await supabaseStore.from("store_customers").update({ display_name: finalName }).eq("whatsapp", waNumber).select("id");
      if (storeCustomerNameErr) {
        console.error(`[store-match] Error actualizando nombre de cliente tienda (${waNumber}): ${storeCustomerNameErr.message}`);
      }
      if (!updatedStoreCustomers?.length) {
        await supabaseStore.from("store_customers").insert({ whatsapp: waNumber, display_name: finalName, pin_hash: "auto" });
      }
      await supabaseStore.from("store_orders").update({ customer_name: finalName }).eq("id", orderId);
    }
    console.log(`[store-match] waNumber: ${waNumber}`);
    console.log(`[store-match] finalName: ${finalName || "(vac\xEDo)"}`);
    try {
      const storeCustomerIdRef = data.customer_id ?? null;
      const { data: existingStorePago, error: existingStorePagoErr } = await supabaseStore.from("pagos_tienda").select("id").eq("store_order_id", orderId).maybeSingle();
      if (existingStorePagoErr && existingStorePagoErr.code !== "PGRST116") {
        console.error(`[store-pago] ERROR buscando pago de tienda: ${existingStorePagoErr.message}`);
      }
      if (!existingStorePago) {
        const pagoTiendaPayload = {
          store_order_id: orderId,
          store_customer_id: storeCustomerIdRef,
          customer_name: finalName || data.customer_name || "Cliente Tienda",
          customer_wa: data.customer_wa ?? null,
          amount: data.total,
          method: "Tienda Online",
          status: "completed",
          payment_date: now,
          owner_user_id: ownerUserId
        };
        if (linkedPago?.id) {
          pagoTiendaPayload.bank_sender_name = linkedPago.nombre ?? null;
          console.log(`[store-pago] Pago bancario #${linkedPago.id} se traslada a TiendaOnline`);
          const { error: deletePagoErr } = await supabaseServer.from("pagos").delete().eq("id", linkedPago.id);
          if (deletePagoErr) {
            console.error(`[store-pago] ERROR borrando pago bancario #${linkedPago.id}: ${deletePagoErr.message}`);
          }
        }
        const { data: newPagoTienda, error: pagoTiendaErr } = await supabaseStore.from("pagos_tienda").insert(pagoTiendaPayload).select("id").single();
        if (pagoTiendaErr) {
          console.error(`[store-pago] ERROR al crear pago_tienda: ${pagoTiendaErr.message}`);
        } else {
          console.log(`[store-pago] \u{1F4B0} Pago de tienda creado en TiendaOnline, ID: ${newPagoTienda?.id}`);
        }
      } else {
        console.log(`[store-pago] \u23ED\uFE0F Pago de tienda ya existe para pedido #${orderId}, omitido`);
      }
    } catch (pagoErr) {
      console.error("[store-pago] Error al crear pago en TiendaOnline:", pagoErr);
    }
  } catch (e) {
    console.error("[store-match] Error en fusi\xF3n log\xEDstica:", e);
  }
  try {
    const ghostWindowStart = new Date(Date.now() - 3 * 60 * 1e3).toISOString();
    const nameToMatch = (finalName || data.customer_name || "").trim().toUpperCase();
    if (nameToMatch && data.total) {
      const { data: ghosts } = await supabaseServer.from("pedidos").select("id, customer_name, total_amount").eq("source", "macrodroid").eq("total_amount", data.total).eq("label", "").eq("label_type", "").eq("item_count", 0).is("web_items_list", null).eq("status", "procesar").gte("created_at", ghostWindowStart);
      const realGhosts = (ghosts ?? []).filter(
        (p) => String(p.customer_name ?? "").trim().toUpperCase() === nameToMatch
      );
      for (const ghost of realGhosts) {
        const { error: delErr } = await supabaseServer.from("pedidos").delete().eq("id", ghost.id);
        if (delErr) {
          console.warn(`[store-ghost] No se pudo borrar pedido fantasma #${ghost.id}: ${delErr.message}`);
        } else {
          console.log(`[store-ghost] \u{1F9F9} Pedido fantasma #${ghost.id} eliminado (${ghost.customer_name}, ${ghost.total_amount} Bs)`);
        }
      }
    }
  } catch (ghostErr) {
    console.warn("[store-ghost] Error limpiando pedido fantasma:", ghostErr?.message ?? ghostErr);
  }
  if (data.customer_wa) {
    try {
      const storeBase = publicStoreBaseUrl(process.env.STORE_PUBLIC_URL);
      const profileLink = `${storeBase}/tienda#profile/orders`;
      const nameForGreeting = (finalName || data.customer_name || "").trim();
      const firstName = nameForGreeting.split(" ")[0] || "";
      const greeting = firstName ? `\xA1Hola ${firstName}! ` : "\xA1Hola! ";
      const storeMessage = `${greeting}\u{1F389}
Leidy Shop confirm\xF3 tu pago. Tu pedido #${data.id} est\xE1 listo. \xA1Muchas gracias por tu compra!

Mir\xE1 los detalles en tu perfil:
${profileLink}`;
      await enqueueStoreConfirmation(
        supabaseServer,
        ownerUserId,
        data.customer_wa,
        data.id,
        storeMessage
      );
    } catch (waErr) {
      console.error("[whatsapp-queue] Error encolando confirmaci\xF3n:", waErr?.message ?? waErr);
    }
  }
  console.log(`[store-match] \u2705 Pedido #${orderId} VERIFICADO y unificado via ${source}`);
  return true;
}
app.post("/api/store/ingest-bank", async (req, res) => {
  try {
    const { amount, senderName, senderPhone, rawText, hash } = req.body;
    if (!amount) return res.status(400).json({ error: "amount requerido" });
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "amount inv\xE1lido" });
    }
    if (hash) {
      const { data: existing } = await supabaseServer.from("payment_events").select("id").eq("hash", hash).single();
      if (existing) {
        return res.json({ ok: true, duplicate: true, message: "Ya procesado" });
      }
    }
    let result = await tryMatchOrder({
      amount: parsedAmount,
      senderPhone: senderPhone ?? "",
      windowMinutes: 2
    });
    let mismatchKind = null;
    let mismatchOrder = null;
    let mismatchDetails = null;
    const cleanSender = (senderPhone ?? "").replace(/\D/g, "");
    if (!result && cleanSender) {
      const windowStart = new Date(Date.now() - 5 * 60 * 1e3).toISOString();
      const { data: candidates } = await supabaseStore.from("store_orders").select("*").eq("status", "pending").gt("created_at", windowStart).order("created_at", { ascending: false });
      const sameWa = (candidates ?? []).find((o) => {
        const phones = phoneVariants(o.customer_wa, o.customer_phone);
        return phones.some((p) => p === cleanSender || p.endsWith(cleanSender) || cleanSender.endsWith(p));
      });
      if (sameWa) {
        const total = Number(sameWa.total);
        if (Math.abs(parsedAmount - total) >= 0.01) {
          mismatchKind = parsedAmount < total ? "partial" : "excess";
          mismatchOrder = sameWa;
          mismatchDetails = await markStoreOrderAmountMismatch(sameWa, parsedAmount, `bank:${hash ?? "manual"}`);
          console.log(`[store-match] MONTO ${mismatchKind === "partial" ? "MENOR" : "MAYOR"}: pedido #${sameWa.id}, pago ${parsedAmount}, total ${total}`);
        } else if (parsedAmount >= total) {
          result = { order: sameWa, confidence: "alta" };
        }
      }
    }
    const eventData = {
      source: "macrodroid",
      raw_text: rawText ?? "",
      amount: parsedAmount,
      sender_name: senderName ?? "",
      sender_wa: senderPhone ?? "",
      processed: !!result,
      match_confidence: result ? result.confidence : mismatchKind === "partial" ? "partial" : "none",
      hash: hash ?? null
    };
    if (result) {
      eventData.matched_order_id = result.order.id;
      const canAutoConfirm = result.confidence === "alta" && await isStoreCustomerVerifiedForAuto(result.order);
      if (canAutoConfirm) {
        await confirmStoreOrder(result.order.id, `bank:${hash ?? "manual"}:${result.confidence}${mismatchKind === "excess" ? ":excess" : ""}`);
        eventData.processed = true;
      } else {
        await markStoreOrderBankDetected(result.order, `bank:${hash ?? "manual"}:${result.confidence}`);
        eventData.processed = false;
      }
    } else if (mismatchOrder) {
      eventData.matched_order_id = mismatchOrder.id;
      eventData.processed = false;
      eventData.match_confidence = mismatchKind === "excess" ? "amount_excess" : "amount_partial";
      if (mismatchDetails) {
        eventData.raw_text = `${eventData.raw_text}
amount_mismatch=${mismatchDetails.type};paid=${mismatchDetails.paid};total=${mismatchDetails.total};diff=${mismatchDetails.difference}`.trim();
      }
    }
    await supabaseServer.from("payment_events").insert(eventData);
    res.json({
      ok: true,
      matched: !!result,
      orderId: result?.order.id ?? mismatchOrder?.id ?? null,
      confidence: result?.confidence ?? "none",
      amountMismatch: mismatchDetails
    });
  } catch (err) {
    console.error("[store/ingest-bank]", err);
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
function parseStoreReceiptAmount(raw) {
  if (raw == null) return null;
  const text = String(raw).replace(",", ".").replace(/[^\d.]/g, "");
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}
function extractStoreDeclaredPhone(text) {
  const value = String(text ?? "");
  const explicit = value.match(/(?:mi\s*n[uú]mero\s*(?:es)?|numero\s*(?:es)?|tel[eé]fono\s*(?:es)?|whats?app\s*(?:es)?)\D*(591)?\s*([67]\d{7})/i);
  if (explicit?.[2]) return explicit[2];
  const anyPhone = value.match(/\b(?:591)?([67]\d{7})\b/);
  return anyPhone?.[1] ?? "";
}
function firstJsonObject2(text) {
  const cleaned = String(text ?? "").trim().replace(/```json|```/g, "");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}
async function analyzeStoreReceipt(mediaUrl) {
  const imageUrl = String(mediaUrl ?? "").trim();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!imageUrl || !apiKey) return null;
  try {
    const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(12e3) });
    if (!imageResponse.ok) return { cliente: null, monto: null, hora: null, error: `No se pudo descargar imagen: ${imageResponse.status}` };
    const mime = imageResponse.headers.get("content-type") || "image/jpeg";
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
    const ownerName = process.env.STORE_OWNER_NAME || "LEIDY CANDY DIAZ SANCHEZ";
    const prompt = `Analiza este comprobante de pago boliviano de una compra de tienda online.
La due\xF1a que recibe el dinero es: ${ownerName}.
Extrae SOLO estos datos:
- cliente: nombre de quien pago, no la due\xF1a, no el banco, no una cuenta.
- monto: numero pagado.
- hora: HH:MM si aparece.

Responde solo JSON:
{"cliente":"NOMBRE o null","monto":numero_o_null,"hora":"HH:MM o null"}`;
    const preferredModels = [
      process.env.OPENROUTER_VISION_MODEL,
      "openai/gpt-4o-mini",
      "google/gemini-2.0-flash-001"
    ].map((model) => String(model ?? "").trim()).filter((model, index, list) => model && list.indexOf(model) === index);
    let bodyText = "";
    let lastError = "";
    for (const model of preferredModels) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": publicStoreBaseUrl(process.env.STORE_PUBLIC_URL),
          "X-Title": "Ventas Live Store Receipt"
        },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 250,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } }
            ]
          }]
        })
      });
      bodyText = await response.text();
      if (response.ok) {
        lastError = "";
        break;
      }
      lastError = `${model}: ${bodyText.slice(0, 240)}`;
      bodyText = "";
    }
    if (!bodyText) return { cliente: null, monto: null, hora: null, error: lastError || "No se pudo analizar comprobante" };
    const parsed = JSON.parse(firstJsonObject2(bodyText) ?? bodyText);
    const content = parsed?.choices?.[0]?.message?.content ?? bodyText;
    const receiptJson = typeof content === "string" ? JSON.parse(firstJsonObject2(content) ?? content) : content;
    return {
      cliente: receiptJson?.cliente ? String(receiptJson.cliente).trim() : null,
      monto: parseStoreReceiptAmount(receiptJson?.monto),
      hora: receiptJson?.hora ? String(receiptJson.hora).trim() : null,
      raw: receiptJson
    };
  } catch (error) {
    return { cliente: null, monto: null, hora: null, error: error?.message ?? "Error analizando comprobante" };
  }
}
app.post("/api/store/ingest-wa", async (req, res) => {
  try {
    const {
      fromWa,
      messageText,
      hasProof,
      mediaUrl,
      mediaType,
      panelMessageId,
      messageCreatedAt
    } = req.body;
    if (!fromWa) return res.status(400).json({ error: "fromWa requerido" });
    const refMatch = messageText?.match(/#(\d+)/);
    let orderRef = refMatch?.[1] ?? null;
    const cleanFrom = fromWa.replace(/\D/g, "");
    let declaredPhone = extractStoreDeclaredPhone(messageText);
    if (!orderRef && mediaUrl) {
      const since = new Date(Date.now() - 6 * 60 * 60 * 1e3).toISOString();
      const { data: previousMessage } = await supabaseStore.from("wa_messages").select("order_ref, summary, matched_order_id, received_at").eq("from_wa", cleanFrom).not("order_ref", "is", null).gte("received_at", since).order("received_at", { ascending: false }).limit(1).maybeSingle();
      if (previousMessage?.order_ref) {
        const previousOrderId = Number(previousMessage.matched_order_id ?? previousMessage.order_ref);
        const { data: previousOrder } = Number.isFinite(previousOrderId) ? await supabaseStore.from("store_orders").select("status, wa_proof_received, payment_verified_at").eq("id", previousOrderId).maybeSingle() : { data: null };
        const stillNeedsProof = !previousOrder || !previousOrder.wa_proof_received && !previousOrder.payment_verified_at && !["paid", "confirmed"].includes(String(previousOrder.status ?? "").toLowerCase());
        if (stillNeedsProof) {
          orderRef = String(previousMessage.order_ref);
          declaredPhone = declaredPhone || extractStoreDeclaredPhone(previousMessage.summary);
        }
      }
    }
    const matchPhone = declaredPhone || cleanFrom;
    const receipt = mediaUrl ? await analyzeStoreReceipt(mediaUrl) : null;
    const summaryParts = [
      messageText ?? "",
      mediaUrl ? `media=${mediaUrl}` : null,
      mediaType ? `media_type=${mediaType}` : null,
      panelMessageId ? `panel_message_id=${panelMessageId}` : null,
      receipt ? `receipt=${JSON.stringify(receipt)}` : null
    ].filter(Boolean);
    const waEvent = {
      from_wa: cleanFrom,
      summary: summaryParts.join("\n"),
      has_proof: !!hasProof || !!mediaUrl,
      order_ref: orderRef
    };
    if (!orderRef) {
      await supabaseStore.from("wa_messages").insert(waEvent);
      return res.json({ ok: true, matched: false, orderId: null, reason: "missing_order_code" });
    }
    const result = await tryMatchOrder({
      senderPhone: matchPhone,
      orderRef,
      windowMinutes: 10
    });
    if (result) {
      waEvent.matched_order_id = result.order.id;
      const receiptAmount = parseStoreReceiptAmount(receipt?.monto);
      const orderTotal = Number(result.order.total);
      const proofReceived = !!mediaUrl || !!hasProof;
      const amountMatches = receiptAmount == null || Math.abs(receiptAmount - orderTotal) < 0.01;
      if (!proofReceived) {
        waEvent.summary += "\nproof_required=true";
        await supabaseStore.from("wa_messages").insert(waEvent);
        return res.json({
          ok: true,
          matched: true,
          confirmed: false,
          requiresProof: true,
          orderId: result.order.id,
          reason: "proof_required",
          receipt
        });
      }
      if (!amountMatches) {
        waEvent.summary += `
proof_amount_mismatch=${receiptAmount}!=${orderTotal}`;
        const mismatch = await markStoreOrderAmountMismatch(result.order, receiptAmount, `wa:${fromWa}`);
        await supabaseStore.from("store_orders").update({ wa_proof_received: true, wa_message_id: panelMessageId ?? fromWa }).eq("id", result.order.id).eq("status", "pending");
        if (mediaUrl || receipt) {
          try {
            const proofHash = `wa-mismatch:${result.order.id}:${panelMessageId ?? mediaUrl ?? Date.now()}`;
            const { data: existingProof } = await supabaseStore.from("payment_events").select("id").eq("hash", proofHash).maybeSingle();
            if (!existingProof) {
              await supabaseStore.from("payment_events").insert({
                source: "wa_amount_mismatch",
                raw_text: waEvent.summary.slice(0, 1e3),
                amount: receiptAmount,
                sender_name: receipt?.cliente ?? "",
                sender_wa: cleanFrom,
                processed: false,
                match_confidence: mismatch?.type === "more" ? "amount_excess" : "amount_partial",
                hash: proofHash,
                matched_order_id: result.order.id
              });
            }
          } catch (proofErr) {
            console.warn("[store-wa] No se pudo guardar evidencia de monto distinto:", proofErr?.message ?? proofErr);
          }
        }
        await supabaseStore.from("wa_messages").insert(waEvent);
        return res.json({
          ok: true,
          matched: true,
          confirmed: false,
          manualReview: true,
          orderId: result.order.id,
          reason: "amount_mismatch_manual_review",
          amountMismatch: mismatch,
          receipt
        });
      }
      await supabaseStore.from("store_orders").update({ wa_proof_received: true, wa_message_id: panelMessageId ?? fromWa }).eq("id", result.order.id);
      if (mediaUrl || receipt) {
        try {
          const proofHash = `wa-proof:${result.order.id}:${panelMessageId ?? mediaUrl ?? Date.now()}`;
          const { data: existingProof } = await supabaseStore.from("payment_events").select("id").eq("hash", proofHash).maybeSingle();
          if (!existingProof) {
            await supabaseStore.from("payment_events").insert({
              source: "wa_proof",
              raw_text: waEvent.summary.slice(0, 1e3),
              amount: receiptAmount ?? orderTotal,
              sender_name: receipt?.cliente ?? "",
              sender_wa: cleanFrom,
              processed: false,
              match_confidence: result.confidence,
              hash: proofHash,
              matched_order_id: result.order.id
            });
          }
        } catch (proofErr) {
          console.warn("[store-wa] No se pudo guardar evidencia de comprobante:", proofErr?.message ?? proofErr);
        }
      }
      let { data: bankEvent } = await supabaseStore.from("payment_events").select("id").eq("matched_order_id", result.order.id).eq("processed", true).maybeSingle();
      const { data: pendingBankEvents } = await supabaseStore.from("payment_events").select("id,sender_name,amount").eq("amount", orderTotal).eq("processed", false).is("matched_order_id", null).in("source", ["macrodroid_bank_pending", "macrodroid"]).order("id", { ascending: false }).limit(10);
      if (!bankEvent && pendingBankEvents?.length) {
        const receiptNameForBank = cleanName(receipt?.cliente ?? "");
        const byName = receiptNameForBank ? pendingBankEvents.filter((event) => {
          const bankName = cleanName(event.sender_name ?? "");
          return bankName && (bankName === receiptNameForBank || bankName.includes(receiptNameForBank) || receiptNameForBank.includes(bankName));
        }) : [];
        const selectedBankEvent = byName.length === 1 ? byName[0] : pendingBankEvents.length === 1 ? pendingBankEvents[0] : null;
        if (selectedBankEvent) {
          const { data: updatedBankEvent } = await supabaseStore.from("payment_events").update({
            processed: true,
            match_confidence: "maxima",
            matched_order_id: result.order.id
          }).eq("id", selectedBankEvent.id).select("id").maybeSingle();
          bankEvent = updatedBankEvent ?? { id: selectedBankEvent.id };
        } else {
          console.warn(`[store-wa] ${pendingBankEvents.length} pagos bancarios pendientes de ${orderTotal} Bs; no se confirma sin nombre unico`);
        }
      }
      let mainBankPago = null;
      const orderCreatedAt = result.order.created_at ? new Date(new Date(result.order.created_at).getTime() - 2 * 60 * 1e3).toISOString() : new Date(Date.now() - 30 * 60 * 1e3).toISOString();
      const { data: pagos } = await supabaseServer.from("pagos").select("id,nombre,pago,created_at,date,method,status").eq("pago", Number(result.order.total)).gte("created_at", orderCreatedAt).order("created_at", { ascending: false }).limit(10);
      const candidates = (pagos ?? []).filter((p) => !String(p.method ?? "").toLowerCase().includes("tienda online"));
      const receiptName = cleanName(receipt?.cliente ?? "");
      const nameMatches = receiptName ? candidates.filter((p) => {
        const bankName = cleanName(p.nombre ?? "");
        return bankName === receiptName || bankName.includes(receiptName) || receiptName.includes(bankName);
      }) : [];
      if (nameMatches.length === 1) {
        mainBankPago = nameMatches[0];
      } else if (!receiptName && candidates.length === 1) {
        mainBankPago = candidates[0];
      } else if (receiptName && candidates.length === 1) {
        mainBankPago = candidates[0];
      } else if (candidates.length > 1) {
        console.warn(`[store-wa] ${candidates.length} pagos bancarios de ${result.order.total} Bs; no se confirma sin nombre unico`);
      }
      if (bankEvent || mainBankPago) {
        if (mainBankPago && !bankEvent) {
          await supabaseStore.from("payment_events").insert({
            source: "wa_proof_main_bank",
            raw_text: messageText ?? "",
            amount: Number(result.order.total),
            sender_name: receipt?.cliente ?? mainBankPago.nombre ?? "",
            sender_wa: cleanFrom,
            processed: true,
            match_confidence: "maxima",
            hash: `wa-proof:${result.order.id}:${mainBankPago.id}`,
            matched_order_id: result.order.id
          });
        }
        const linkedPagoForConfirm = mainBankPago ? { ...mainBankPago, nombre: receipt?.cliente || mainBankPago.nombre } : receipt?.cliente ? { nombre: receipt.cliente, pago: orderTotal } : null;
        await confirmStoreOrder(result.order.id, `wa+bank:${fromWa}:maxima`, linkedPagoForConfirm);
      } else {
        console.log(`[store-wa] Pedido #${result.order.id} \u2014 WA recibido, esperando banco`);
      }
    }
    await supabaseStore.from("wa_messages").insert(waEvent);
    res.json({
      ok: true,
      matched: !!result,
      orderId: result?.order.id ?? null,
      receipt,
      messageCreatedAt: messageCreatedAt ?? null
    });
  } catch (err) {
    console.error("[store/ingest-wa]", err);
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.get("/api/store/download-qr", async (_req, res) => {
  try {
    const { data } = await supabaseStore.from("store_settings").select("setting_value").eq("setting_key", "payment_qr_url").maybeSingle();
    const qrUrl = String(data?.setting_value || "").trim();
    if (qrUrl && /^https?:\/\//i.test(qrUrl)) {
      const response = await fetch(qrUrl);
      if (!response.ok) throw new Error(`No se pudo descargar QR configurado: ${response.status}`);
      const contentType = response.headers.get("content-type") || "image/jpeg";
      const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
      const buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader("Content-Disposition", `attachment; filename="Leidy-American-QR.${extension}"`);
      res.setHeader("Content-Type", contentType);
      res.send(buffer);
      return;
    }
    if (qrUrl && qrUrl.startsWith("/")) {
      const fileName = qrUrl.replace(/^\/+/, "");
      const qrPath2 = path.join(process.cwd(), "public", fileName);
      res.setHeader("Content-Disposition", `attachment; filename="Leidy-American-QR${path.extname(fileName) || ".jpg"}"`);
      res.sendFile(qrPath2);
      return;
    }
    const qrPath = path.join(process.cwd(), "public", "qr-yape.jpg");
    res.setHeader("Content-Disposition", 'attachment; filename="Leidy-American-QR.jpg"');
    res.setHeader("Content-Type", "image/jpeg");
    res.sendFile(qrPath);
  } catch (err) {
    console.error("[store/download-qr]", err?.message ?? err);
    res.status(500).json({ error: "No se pudo descargar el QR configurado" });
  }
});
app.post("/api/store-orders/:id/customer-confirm", async (req, res) => {
  const orderId = Number(req.params.id);
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "No autenticado" });
  const { data: authData, error: authError } = await createStoreAuthClient().auth.getUser(token);
  if (authError || !authData?.user) return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida" });
  const phone = authData.user.email?.replace("@tiendaleydi.com", "") ?? "";
  const { data: order, error: orderErr } = await supabaseStore.from("store_orders").select("id, customer_wa, status, customer_selection").eq("id", orderId).single();
  if (orderErr || !order) return res.status(404).json({ error: "Pedido no encontrado" });
  if (order.customer_wa !== phone) return res.status(403).json({ error: "No autorizado" });
  const { error: updateErr } = await supabaseStore.from("store_orders").update({
    customer_selection: {
      ...typeof order.customer_selection === "object" && order.customer_selection ? order.customer_selection : {},
      confirmed: true,
      confirmed_at: (/* @__PURE__ */ new Date()).toISOString(),
      confirmed_by: "customer"
    }
  }).eq("id", orderId);
  if (updateErr) return res.status(500).json({ error: "No se pudo guardar" });
  return res.json({ ok: true });
});
var pickupDatesCache = null;
var PICKUP_DATES_TTL_MS = 5 * 60 * 1e3;
app.get("/api/store/pickup-dates", async (_req, res) => {
  const now = Date.now();
  if (pickupDatesCache && now - pickupDatesCache.ts < PICKUP_DATES_TTL_MS) {
    return res.json(pickupDatesCache.payload);
  }
  try {
    const { data } = await supabaseStore.from("store_settings").select("setting_value").eq("setting_key", "pickup_dates").maybeSingle();
    const raw = data?.setting_value;
    const dates = raw ? JSON.parse(raw) : [];
    pickupDatesCache = { payload: { dates }, ts: now };
    return res.json({ dates });
  } catch {
    return res.json({ dates: [] });
  }
});
app.patch("/api/store/pickup-dates", async (req, res) => {
  const { dates } = req.body;
  if (!Array.isArray(dates)) return res.status(400).json({ error: "dates debe ser array" });
  try {
    const { error } = await supabaseStore.from("store_settings").upsert({ setting_key: "pickup_dates", setting_value: JSON.stringify(dates) }, { onConflict: "setting_key" });
    if (error) throw error;
    pickupDatesCache = null;
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
app.post("/api/store-orders/:id/set-delivery", async (req, res) => {
  const orderId = Number(req.params.id);
  const { delivery_date, delivery_slot } = req.body;
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "No autenticado" });
  const { data: authData, error: authError } = await createStoreAuthClient().auth.getUser(token);
  if (authError || !authData?.user) return res.status(401).json({ error: "Sesi\xF3n inv\xE1lida" });
  const phone = authData.user.email?.replace("@tiendaleydi.com", "") ?? "";
  const { data: order, error: orderErr } = await supabaseStore.from("store_orders").select("id, customer_wa").eq("id", orderId).single();
  if (orderErr || !order) return res.status(404).json({ error: "Pedido no encontrado" });
  if (order.customer_wa !== phone) return res.status(403).json({ error: "No autorizado" });
  const { error: updateErr } = await supabaseStore.from("store_orders").update({ delivery_date, delivery_slot, delivery_type: "retiro" }).eq("id", orderId);
  if (updateErr) return res.status(500).json({ error: "No se pudo guardar" });
  return res.json({ ok: true });
});
app.get("/api/store/pending-manual", async (_req, res) => {
  try {
    const todayStart = /* @__PURE__ */ new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data, error } = await supabaseStore.from("store_orders").select("id, customer_wa, customer_name, total, items, created_at, wa_proof_received, payment_ref, partial_payment_amount, payment_shortfall").eq("status", "pending").gte("created_at", todayStart.toISOString()).or("wa_proof_received.eq.true,partial_payment_amount.not.is.null").order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.get("/api/pagos-tienda", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    const date = req.query.date ?? null;
    let q = supabaseStore.from("pagos_tienda").select("id, store_order_id, store_customer_id, customer_name, customer_wa, amount, method, status, payment_date, bank_sender_name, owner_user_id, created_at");
    if (userId) q = q.eq("owner_user_id", userId);
    if (date) {
      const dayStart = /* @__PURE__ */ new Date(`${date}T00:00:00`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1e3);
      q = q.gte("payment_date", dayStart.toISOString()).lt("payment_date", dayEnd.toISOString());
    }
    const { data, error } = await q.order("payment_date", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.post("/api/store/verify-manual/:storeOrderId", async (req, res) => {
  try {
    const storeOrderId = parseInt(req.params.storeOrderId);
    if (isNaN(storeOrderId)) return res.status(400).json({ error: "ID inv\xE1lido" });
    const confirmed = await confirmStoreOrder(storeOrderId, "manual-web");
    if (!confirmed) return res.status(400).json({ error: "No se pudo confirmar \u2014 ya pagado o no existe" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.post("/api/store/reject-manual/:storeOrderId", async (req, res) => {
  try {
    const storeOrderId = parseInt(req.params.storeOrderId);
    if (isNaN(storeOrderId)) return res.status(400).json({ error: "ID inv\xE1lido" });
    const { data, error } = await supabaseStore.from("store_orders").update({ status: "cancelled", payment_ref: "rejected-manual" }).eq("id", storeOrderId).in("status", ["pending", "cancelled"]).select("id").single();
    if (error || !data) return res.status(400).json({ error: "No se pudo rechazar \u2014 ya pagado o no existe" });
    console.log(`[store] \u274C Pedido #${storeOrderId} rechazado manualmente`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.get("/api/store/favorites/:phone", async (req, res) => {
  const phone = req.params.phone.replace(/\D/g, "");
  const { data, error } = await supabaseStore.from("store_favorites").select("product_id, created_at").eq("customer_wa", phone).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});
app.post("/api/store/favorites/toggle", async (req, res) => {
  const { phone, productId } = req.body ?? {};
  if (!phone || !productId) return res.status(400).json({ error: "phone y productId requeridos" });
  const cleanPhone = String(phone).replace(/\D/g, "");
  const { data: existing } = await supabaseStore.from("store_favorites").select("id").eq("customer_wa", cleanPhone).eq("product_id", String(productId)).maybeSingle();
  if (existing) {
    await supabaseStore.from("store_favorites").delete().eq("customer_wa", cleanPhone).eq("product_id", String(productId));
    return res.json({ liked: false });
  }
  await supabaseStore.from("store_favorites").insert({ customer_wa: cleanPhone, product_id: String(productId) });
  res.json({ liked: true });
});
app.get("/api/store/favorites/:phone/products", async (req, res) => {
  const phone = req.params.phone.replace(/\D/g, "");
  const { data: favs } = await supabaseStore.from("store_favorites").select("product_id").eq("customer_wa", phone);
  if (!favs?.length) return res.json([]);
  const ids = favs.map((f) => f.product_id);
  const { data: products, error } = await supabaseStore.from("products").select("id, title, price, images, sizes, available, stock").in("id", ids);
  if (error) return res.status(500).json({ error: error.message });
  res.json(products ?? []);
});
app.get("/api/store/whatsapp-photos", async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: "phone requerido" });
    const cleanPhone = String(phone).replace(/\D/g, "");
    const { data: cliente } = await supabasePanel.from("panel_clientes").select("id").eq("phone", cleanPhone).single();
    if (!cliente) return res.json([]);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3).toISOString();
    const { data: mensajes, error } = await supabasePanel.from("panel_mensajes").select("id, media_url, media_type, created_at, content").eq("cliente_id", cliente.id).eq("direction", "in").eq("has_media", true).gt("created_at", weekAgo).order("created_at", { ascending: false });
    if (error) throw error;
    res.json(mensajes ?? []);
  } catch (err) {
    console.error("[store/whatsapp-photos]", err);
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.post("/api/store/notify-live-ready", async (req, res) => {
  return res.status(410).json({ error: "WhatsApp saliente desactivado. Solo se permite vincular y recibir." });
  try {
    const { customerId, phone } = req.body;
    const userId = req.headers["x-user-id"];
    if (!userId || !phone) return res.status(400).json({ error: "userId y phone requeridos" });
    const cleanPhone = phone.replace(/\D/g, "");
    const storeBase = publicStoreBaseUrl(process.env.STORE_URL);
    const storeLink = `${storeBase}/tienda#profile/confirmar`;
    const message = `\xA1Hola! \u{1F457} Ya tenemos tus prendas del Live listas para confirmaci\xF3n. Ingresa aqu\xED para seleccionar las tuyas: ${storeLink}

(Necesitar\xE1s tu PIN de la tienda)`;
    const { ok, error, queued } = await enqueueStoreConfirmation(
      supabaseServer,
      userId,
      phone,
      `LIVE-${Date.now()}`,
      message
    );
    if (!ok) throw new Error(error);
    res.json({ ok: true, queued });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.post("/api/store/match-payment", async (req, res) => {
  try {
    const { amount, senderPhone, orderRef, orderId, source } = req.body;
    let order = null;
    if (orderId) {
      const { data } = await supabaseStore.from("store_orders").select("*").eq("id", Number(orderId)).single();
      order = data;
    } else {
      const result = await tryMatchOrder({ amount, senderPhone, orderRef });
      order = result?.order ?? null;
    }
    if (!order) {
      return res.status(404).json({ ok: false, error: "No se encontr\xF3 pedido pendiente que coincida" });
    }
    let linkedPago = null;
    if (String(source ?? "").startsWith("chehi:")) {
      const orderWindowStart = order.created_at ? new Date(new Date(order.created_at).getTime() - 2 * 60 * 1e3).toISOString() : new Date(Date.now() - 5 * 60 * 1e3).toISOString();
      const { data: recentPagos, error: recentPagoErr } = await supabaseServer.from("pagos").select("id,nombre,pago,method,status,customer_id,user_id,created_at,date").eq("pago", Number(order.total)).gte("created_at", orderWindowStart).order("created_at", { ascending: false }).limit(5);
      if (recentPagoErr) {
        console.warn("[store/match-payment] no se pudo buscar pago vinculado:", recentPagoErr.message);
      } else {
        const candidates = (recentPagos ?? []).filter((p) => {
          const method = String(p.method ?? "").toLowerCase();
          return !method.includes("tienda online");
        });
        if (candidates.length === 1) {
          linkedPago = candidates[0];
          console.log(`[store/match-payment] Pago bancario #${linkedPago.id} vinculado a pedido #${order.id}`);
        } else if (candidates.length > 1) {
          console.warn(`[store/match-payment] ${candidates.length} pagos recientes de ${order.total} Bs; no se vincula sin codigo WA`);
        }
      }
    }
    const sourceText = String(source ?? "manual");
    const autoCandidate = sourceText.startsWith("chehi:") || sourceText.startsWith("bank:") || sourceText.startsWith("pagos:");
    const sourceConfidence = sourceText.split(":").pop();
    const canAutoConfirm = !autoCandidate || sourceConfidence === "alta" && await isStoreCustomerVerifiedForAuto(order);
    if (!canAutoConfirm) {
      await markStoreOrderBankDetected(order, sourceText);
      return res.json({
        ok: true,
        matched: true,
        confirmed: false,
        requiresProof: true,
        orderId: order.id,
        total: order.total,
        customerWa: order.customer_wa
      });
    }
    const ok = await confirmStoreOrder(order.id, sourceText, linkedPago);
    if (!ok) {
      return res.status(409).json({ ok: false, error: "El pedido ya fue procesado o no est\xE1 pendiente" });
    }
    res.json({ ok: true, confirmed: true, orderId: order.id, total: order.total, customerWa: order.customer_wa });
  } catch (err) {
    console.error("[store/match-payment]", err);
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.get("/api/store/macrodroid-health", async (_req, res) => {
  try {
    const { data: lastEvent } = await supabaseServer.from("payment_events").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const { data: pending } = await supabaseStore.from("store_orders").select("id", { count: "exact", head: true }).eq("status", "pending").gt("expires_at", nowIso);
    const lastIngestAt = lastEvent?.created_at ?? null;
    const lastIngestAgeSec = lastIngestAt ? Math.floor((Date.now() - new Date(lastIngestAt).getTime()) / 1e3) : null;
    const pendingCount = pending?.length ?? 0;
    const stale = lastIngestAgeSec != null && lastIngestAgeSec > 600;
    const alert = stale && pendingCount > 0;
    res.json({
      ok: true,
      lastIngestAt,
      lastIngestAgeSec,
      pendingCount,
      alert
    });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.post("/api/store/verify-order/:id", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) return res.status(401).json({ error: "No autorizado" });
    const ok = await confirmStoreOrder(Number(req.params.id), "admin:manual");
    if (!ok) return res.status(409).json({ ok: false, error: "No se pudo verificar (ya procesado o no pendiente)" });
    res.json({ ok: true, message: "Pedido verificado manualmente" });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? "Error interno" });
  }
});
app.post("/api/ingest-notification", async (req, res) => {
  try {
    const deviceId = req.headers["x-device-id"] ?? "";
    const deviceSecret = req.headers["x-device-secret"] ?? "";
    const { data: sessions } = await supabaseServer.from("live_sessions").select("id,status,notes").in("status", ["live", "completed"]).ilike("title", "Procesamiento Live%").order("created_at", { ascending: false }).limit(3);
    const capturedAtMs = req.body?.captured_at_ms ? Number(req.body.captured_at_ms) : null;
    const paymentTime = capturedAtMs && Number.isFinite(capturedAtMs) ? new Date(capturedAtMs) : /* @__PURE__ */ new Date();
    try {
      await captureStoreBankInbox(req.body, paymentTime);
    } catch (storeInboxErr) {
      console.warn("[store-bank-inbox] error no bloqueante:", storeInboxErr?.message ?? storeInboxErr);
    }
    const allowed = (sessions ?? []).some((s) => {
      if (s.status === "live") return true;
      try {
        const notes = typeof s.notes === "string" ? JSON.parse(s.notes) : s.notes;
        const startAt = notes?.started_at ? new Date(notes.started_at) : null;
        const endAt = notes?.ended_at ? new Date(notes.ended_at) : null;
        if (!startAt) return false;
        const end = endAt ?? /* @__PURE__ */ new Date();
        return paymentTime >= startAt && paymentTime <= end;
      } catch {
        return false;
      }
    });
    if (!allowed) {
      console.log("[ingest-notification] Pago fuera de ventana Live, descartado", paymentTime.toISOString());
      return res.json({ ok: true, ignored: true, reason: "live_off" });
    }
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
    const response = await fetch(
      `${supabaseUrl}/functions/v1/ingest-notification`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...supabaseAnonKey ? { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` } : {},
          "x-device-id": deviceId,
          "x-device-secret": deviceSecret
        },
        body: JSON.stringify(req.body)
      }
    );
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("[ingest-notification bridge]", err?.message);
    res.status(500).json({ error: "Error enviando a Supabase", detail: err?.message });
  }
});
app.post("/api/ingest-bank-store", async (req, res) => {
  try {
    const storeSupabaseUrl = process.env.VITE_STORE_SUPABASE_URL;
    if (!storeSupabaseUrl) {
      return res.status(500).json({ error: "Tienda no configurada" });
    }
    const response = await fetch(
      `${storeSupabaseUrl}/functions/v1/ingest-bank-store`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      }
    );
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return res.status(response.status).json(JSON.parse(text));
    }
    return res.status(response.status).send(text);
  } catch (err) {
    console.error("[ingest-bank-store bridge]", err?.message);
    res.status(500).json({ error: "Error enviando pago a tienda", detail: err?.message });
  }
});
if (!isServerlessRuntime && process.env.NODE_ENV !== "production") {
  void (async () => {
    try {
      const viteModule = await import("vite");
      const vite = await viteModule.createServer({
        server: { middlewareMode: true },
        appType: "custom"
      });
      app.use(vite.middlewares);
      const renderViteHtml = async (req, res, next, fileName) => {
        try {
          const { readFileSync } = await import("fs");
          const html = readFileSync(path.join(process.cwd(), fileName), "utf-8");
          const transformed = await vite.transformIndexHtml(req.url, html);
          res.status(200).set({ "Content-Type": "text/html" }).end(transformed);
        } catch (e) {
          next(e);
        }
      };
      app.get("/tienda/terminos", (_req, res) => {
        res.sendFile(path.join(process.cwd(), "public/terminos.html"));
      });
      app.get("/tienda/privacidad", (_req, res) => {
        res.sendFile(path.join(process.cwd(), "public/privacidad.html"));
      });
      app.get(["/tienda", "/tienda/*"], (req, res, next) => {
        renderViteHtml(req, res, next, "tienda.html");
      });
      app.get("*", async (req, res, next) => {
        renderViteHtml(req, res, next, "index.html");
      });
    } catch (e) {
      console.log("Vite no disponible en este entorno", e);
    }
  })();
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("/tienda/terminos", (_req, res) => {
    res.sendFile(path.join(distPath, "terminos.html"));
  });
  app.get("/tienda/privacidad", (_req, res) => {
    res.sendFile(path.join(distPath, "privacidad.html"));
  });
  app.get(["/tienda", "/tienda/*"], (_req, res) => {
    res.sendFile(path.join(distPath, "tienda.html"));
  });
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
if (!isServerlessRuntime) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Endpoint for mobile payments: http://localhost:${PORT}/api/pagos`);
    (async () => {
      const url4 = process.env.VITE_STORE_SUPABASE_URL;
      const key = process.env.STORE_SUPABASE_SERVICE_ROLE_KEY;
      if (!url4 || !key) return;
      try {
        const res = await fetch(`${url4.replace(/\/$/, "")}/rest/v1/rpc/exec_sql`, {
          method: "POST",
          headers: {
            "apikey": key,
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ sql: "ALTER TABLE products ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;" })
        });
        if (res.ok) {
          console.log("\u2705 Base de datos de tienda migrada con \xE9xito (columna 'likes').");
        } else {
          const res2 = await fetch(`${url4.replace(/\/$/, "")}/rest/v1/rpc/exec`, {
            method: "POST",
            headers: {
              "apikey": key,
              "Authorization": `Bearer ${key}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ query: "ALTER TABLE products ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;" })
          });
          if (res2.ok) {
            console.log("\u2705 Base de datos de tienda migrada con \xE9xito (columna 'likes' via exec).");
          }
        }
      } catch (err) {
        console.warn("\u26A0\uFE0F Nota: No se pudo auto-migrar la base de datos de la tienda:", err.message);
      }
    })();
  });
}
var server_default = app;
export {
  server_default as default
};
