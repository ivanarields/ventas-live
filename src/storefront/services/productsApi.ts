export interface Product {
  id: string;
  name: string;
  title: string;
  price: number;
  description: string;
  images: string[];
  sizes: string[];
  available: boolean;
  category: string;
  priority_order?: number;
}

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&q=80&w=800';

function mapRow(row: any): Product {
  let images: string[];
  if (Array.isArray(row.images) && row.images.length > 0) {
    images = row.images;
  } else if (row.image_url) {
    images = [row.image_url];
  } else {
    images = [FALLBACK_IMG];
  }

  return {
    id: String(row.id),
    name: row.name,
    title: row.name,
    price: Number(row.price),
    description: row.description ?? '',
    images,
    sizes: Array.isArray(row.sizes) ? row.sizes : [],
    available: row.available ?? true,
    category: row.category ?? 'General',
    priority_order: row.priority_order ?? 0,
  };
}

// Caché en memoria: evita repetir la misma petición durante 5 minutos
let _cache: { data: Product[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos en milisegundos

// Promesa compartida para evitar llamadas duplicadas simultáneas
let _inflight: Promise<Product[]> | null = null;

export const productsApi = {
  /**
   * Obtiene los productos. Si hay caché reciente la usa directamente.
   * Si hay una petición en vuelo la reutiliza (sin hacer dos fetch al mismo tiempo).
   */
  getProducts: async (): Promise<Product[]> => {
    // 1. Devolver caché si sigue vigente
    if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
      return _cache.data;
    }
    // 2. Si ya hay una petición en vuelo, reutilizarla
    if (_inflight) return _inflight;
    // 3. Nueva petición
    _inflight = fetch('/api/products')
      .then(res => (res.ok ? res.json() : []))
      .then((rows: any[]) => {
        const data = rows.map(mapRow);
        _cache = { data, ts: Date.now() };
        return data;
      })
      .catch(() => [])
      .finally(() => { _inflight = null; });
    return _inflight;
  },

  /** Pre-carga los productos sin bloquear (fire-and-forget). */
  prefetch: () => { productsApi.getProducts().catch(() => {}); },

  getProduct: async (id: string): Promise<Product | undefined> => {
    const all = await productsApi.getProducts();
    return all.find(p => p.id === id);
  },

  /** Invalida la caché manualmente (útil tras crear/editar productos en el panel). */
  invalidate: () => { _cache = null; },
};
