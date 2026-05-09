export interface Product {
  id: string;
  name: string;
  title: string;
  price: number;
  description: string;
  images: string[];
  sizes: string[];
  available: boolean;
  stock: number;
  category: string;
  priority_order?: number;
}

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&q=70&w=480';

type ImagePreset = 'thumb' | 'detail';

const PRESETS: Record<ImagePreset, { width: number; quality: number }> = {
  thumb: { width: 360, quality: 58 },
  detail: { width: 600, quality: 72 },
};

export function storeImageUrl(src: string | undefined, preset: ImagePreset = 'thumb'): string {
  if (!src) return FALLBACK_IMG;

  try {
    const url = new URL(src);
    const { width, quality } = PRESETS[preset];

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
      url.searchParams.set('resize', 'cover');
      return url.toString();
    }

    return src;
  } catch {
    return src;
  }
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
    description: row.description ?? '',
    images,
    sizes: Array.isArray(row.sizes) ? row.sizes : [],
    available: row.available ?? true,
    stock: row.stock ?? 1,
    category: row.category ?? 'General',
    priority_order: row.priority_order ?? 0,
  };
}

export interface PaginatedProducts {
  data: Product[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export const productsApi = {
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

    return {
      ...json,
      data: json.data.map(mapRow),
    };
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
