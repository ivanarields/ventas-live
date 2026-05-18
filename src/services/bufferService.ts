/**
 * bufferService.ts
 * Publica productos nuevos de la tienda en Buffer → TikTok, Facebook, Instagram.
 * Solo se llama desde el backend (server.ts). Nunca exponer la API key al frontend.
 */

const BUFFER_ENDPOINT = "https://api.buffer.com";

interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  category?: string;
  images?: string[];
}

interface PublishResult {
  channel: "facebook" | "instagram" | "tiktok";
  status: "publicado" | "error" | "sin_canal";
  buffer_post_id?: string;
  error_message?: string;
}

function buildPostText(product: Product): string {
  const emoji: Record<string, string> = {
    Blusas: "👚", Vestidos: "👗", Chaquetas: "🧥", Conjuntos: "✨",
    Pantalones: "👖", Faldas: "🩱", Accesorios: "💍", General: "🛍️",
  };
  const icon = emoji[product.category ?? ""] ?? "🛍️";
  const hashCategory = product.category && product.category !== "General"
    ? `#${product.category.replace(/\s+/g, "")} `
    : "";

  const lines: string[] = [];
  lines.push("✨ ¡Nuevo en tienda!");
  lines.push("", `${icon} ${product.name}`);
  if (product.description) lines.push("", product.description.trim());
  lines.push("", `💵 Precio: Bs ${Number(product.price).toFixed(2)}`);
  lines.push("", "👉 Visitá nuestra tienda y pedí el tuyo:");
  lines.push("https://leidycandy.me/tienda");
  lines.push("", "#Ropa #Moda #Bolivia #LeidyCandy #TiendaOnline");
  return lines.join("\n");
}

async function publishToChannel(
  apiKey: string,
  channelId: string,
  channelName: "facebook" | "instagram" | "tiktok",
  product: Product,
): Promise<PublishResult> {
  const images = (product.images ?? []).filter(Boolean).slice(0, 3);
  if (images.length === 0) {
    return { channel: channelName, status: "error", error_message: "Producto sin imágenes" };
  }

  const text = buildPostText(product);

  const assets = images.map((url) => ({ image: { url } }));

  // metadata varía por canal según schema de Buffer GraphQL
  const metadataByChannel: Record<string, object> = {
    facebook: { facebook: { type: "post" } },
    instagram: { instagram: { type: "post", shouldShareToFeed: true } },
    tiktok: {},
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
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    const json = await res.json() as any;

    if (json.errors?.length) {
      const msg = json.errors.map((e: any) => e.message).join(", ");
      return { channel: channelName, status: "error", error_message: msg };
    }

    const result = json.data?.createPost;
    if (result?.message) {
      // MutationError
      return { channel: channelName, status: "error", error_message: result.message };
    }

    const postId = result?.post?.id ?? null;
    return { channel: channelName, status: "publicado", buffer_post_id: postId };
  } catch (err: any) {
    return { channel: channelName, status: "error", error_message: err?.message ?? "Error de red" };
  }
}

export async function publishProductToBuffer(
  product: Product,
): Promise<PublishResult[]> {
  const apiKey = process.env.BUFFER_API_KEY;
  if (!apiKey) {
    console.log("[buffer] BUFFER_API_KEY no configurada — publicación omitida");
    return [];
  }

  const channels: Array<{ id: string; name: "facebook" | "instagram" | "tiktok" }> = [
    { id: (process.env.BUFFER_CHANNEL_ID_FACEBOOK ?? "").trim(), name: "facebook" },
    { id: (process.env.BUFFER_CHANNEL_ID_INSTAGRAM ?? "").trim(), name: "instagram" },
    { id: (process.env.BUFFER_CHANNEL_ID_TIKTOK ?? "").trim(), name: "tiktok" },
  ];

  const results: PublishResult[] = [];

  for (const ch of channels) {
    if (!ch.id) {
      console.log(`[buffer] Canal ${ch.name} no configurado — omitido`);
      results.push({ channel: ch.name, status: "sin_canal" });
      continue;
    }

    const result = await publishToChannel(apiKey, ch.id, ch.name, product);
    console.log(`[buffer] ${ch.name}: ${result.status}${result.error_message ? " — " + result.error_message : ""}`);
    results.push(result);
  }

  return results;
}

export async function savePublicationResults(
  supabaseStore: any,
  productId: number,
  results: PublishResult[],
): Promise<void> {
  if (!results.length) return;
  try {
    const rows = results.map((r) => ({
      product_id: productId,
      channel: r.channel,
      buffer_post_id: r.buffer_post_id ?? null,
      status: r.status,
      error_message: r.error_message ?? null,
    }));
    const { error } = await supabaseStore.from("buffer_publications").insert(rows);
    if (error) console.warn("[buffer] No se pudo guardar estado en buffer_publications:", error.message);
  } catch (err: any) {
    console.warn("[buffer] Error guardando publicaciones:", err?.message);
  }
}
