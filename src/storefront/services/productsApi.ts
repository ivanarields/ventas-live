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
    // Compatibilidad por si json es un array (viejo backend)
    if (Array.isArray(json)) {
      return { data: json.map(mapRow), total: json.length, page: 1, limit: json.length, hasMore: false };
    }

    return {
      ...json,
      data: json.data.map(mapRow)
    };
  },

  getProduct: async (id: string): Promise<Product | undefined> => {
    const res = await productsApi.getProducts({ limit: 1000 });
    return res.data.find(p => p.id === id);
  },
};
