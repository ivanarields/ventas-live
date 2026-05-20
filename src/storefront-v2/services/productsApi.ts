export interface Product {
  id: string;
  name: string;
  title: string;
  price: number;
  compare_at_price?: number | null;
  description: string;
  images: string[];
  sizes: string[];
  available: boolean;
  stock: number;
  category: string;
  priority_order?: number;
  views?: number;
  likes?: number;
}

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&q=70&w=480';

type ImagePreset = 'thumb' | 'detail' | 'qr';

const PRESETS: Record<ImagePreset, { width: number; quality: number; resize: 'cover' | 'contain' }> = {
  thumb: { width: 320, quality: 58, resize: 'cover' },
  detail: { width: 720, quality: 74, resize: 'cover' },
  qr: { width: 520, quality: 82, resize: 'contain' },
};

function storeRenderedImageUrl(src: string | undefined, preset: ImagePreset = 'thumb'): string {
  if (!src) return FALLBACK_IMG;

  try {
    const url = new URL(src);
    const { width, quality, resize } = PRESETS[preset];

    if (url.hostname.includes('images.unsplash.com')) {
      url.searchParams.set('w', String(width));
      url.searchParams.set('q', String(quality));
      if (preset === 'thumb') {
        url.searchParams.set('auto', 'format');
        url.searchParams.set('fit', 'crop');
      }
      return url.toString();
    }

    if (url.pathname.includes('/storage/v1/object/public/')) {
      url.pathname = url.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
      url.searchParams.set('width', String(width));
      url.searchParams.set('quality', String(quality));
      url.searchParams.set('resize', resize);
      return url.toString();
    }

    return src;
  } catch {
    return src;
  }
}

export function storeImageFallbackUrl(src: string | undefined, preset: ImagePreset = 'thumb'): string {
  return storeRenderedImageUrl(src, preset);
}

export function storeImageUrl(src: string | undefined, preset: ImagePreset = 'thumb'): string {
  return storeRenderedImageUrl(src, preset);
}

export function storeDirectThumbUrl(src: string | undefined): string {
  if (!src) return FALLBACK_IMG;

  try {
    const url = new URL(src);
    if (url.pathname.includes('/storage/v1/object/public/store_images/')) {
      const path = decodeURIComponent(url.pathname.split('/storage/v1/object/public/store_images/')[1] ?? '');
      if (path && !path.startsWith('thumbs/')) {
        const cleanPath = path.replace(/^\/+/, '');
        const dot = cleanPath.lastIndexOf('.');
        const base = dot >= 0 ? cleanPath.slice(0, dot) : cleanPath;
        url.pathname = `/storage/v1/object/public/store_images/thumbs/${base}.jpg`;
        url.search = '';
        return url.toString();
      }
    }
  } catch {
    return storeRenderedImageUrl(src, 'thumb');
  }

  return storeRenderedImageUrl(src, 'thumb');
}

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
    compare_at_price: getCompareAtPrice(row),
    description: row.description ?? '',
    images,
    sizes: Array.isArray(row.sizes) ? row.sizes : [],
    available: row.available ?? true,
    stock: row.stock ?? 1,
    category: row.category ?? 'General',
    priority_order: row.priority_order ?? 0,
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
  };
}

function getCompareAtPrice(row: any): number | null {
  const direct = Number(row.compare_at_price);
  if (Number.isFinite(direct) && direct > Number(row.price)) return direct;

  const raw = typeof row.material === 'string' ? row.material : '';
  if (!raw.startsWith('STORE_META:')) return null;
  try {
    const meta = JSON.parse(raw.slice('STORE_META:'.length));
    const fallback = Number(meta.compare_at_price);
    return Number.isFinite(fallback) && fallback > Number(row.price) ? fallback : null;
  } catch {
    return null;
  }
}

export interface PaginatedProducts {
  data: Product[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

const PRODUCT_CACHE_KEY = 'storefront_products_page1_v3';

function canUseCache(params?: { page?: number; limit?: number; category?: string; search?: string; admin?: boolean; token?: string }) {
  return !params?.admin && !params?.token && !params?.category && !params?.search && (!params?.page || params.page === 1);
}

function readCachedProducts(): PaginatedProducts | null {
  try {
    const raw = localStorage.getItem(PRODUCT_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || !Array.isArray(cached.data)) return null;
    return cached;
  } catch {
    return null;
  }
}

function writeCachedProducts(products: PaginatedProducts) {
  try {
    localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(products));
  } catch {
    // Cache opcional; no debe afectar la compra.
  }
}

export const productsApi = {
  getCachedProducts: readCachedProducts,

  getProducts: async (params?: { page?: number; limit?: number; category?: string; search?: string; admin?: boolean; token?: string }): Promise<PaginatedProducts> => {
    const p = new URLSearchParams();
    if (params?.page) p.append('page', params.page.toString());
    if (params?.limit) p.append('limit', params.limit.toString());
    if (params?.category) p.append('category', params.category);
    if (params?.search) p.append('search', params.search);
    if (params?.admin) p.append('admin', 'true');

    const headers: Record<string, string> = {};
    if (params?.token) headers['x-user-id'] = params.token;

    const res = await fetch(`/api/products?${p.toString()}`, { headers });
    if (!res.ok) return { data: [], total: 0, page: 1, limit: 10, hasMore: false };

    const json = await res.json();
    if (Array.isArray(json)) {
      return { data: json.map(mapRow), total: json.length, page: 1, limit: json.length, hasMore: false };
    }

    const result = {
      ...json,
      data: json.data.map(mapRow),
    };
    if (canUseCache(params)) writeCachedProducts(result);
    return result;
  },

  getProduct: async (id: string): Promise<Product | undefined> => {
    try {
      const res = await fetch(`/api/products/${id}`);
      if (!res.ok) return undefined;
      return mapRow(await res.json());
    } catch {
      return undefined;
    }
  },
};
