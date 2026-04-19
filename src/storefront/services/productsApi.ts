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

export const productsApi = {
  getProducts: async (): Promise<Product[]> => {
    const res = await fetch('/api/products');
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map(mapRow);
  },
  getProduct: async (id: string): Promise<Product | undefined> => {
    const all = await productsApi.getProducts();
    return all.find(p => p.id === id);
  },
};
