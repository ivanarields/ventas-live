import { Product } from './productsApi';
import { storeAuth } from './storeAuth';

export const FAVORITES_KEY = 'store_favorites_v2';

function readLocal(): Record<string, Product> {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeLocal(next: Record<string, Product>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
}

export const storeFavoritesApi = {
  readLocal,

  saveLocal(products: Record<string, Product>) {
    writeLocal(products);
  },

  async list(): Promise<Product[]> {
    const session = storeAuth.getCurrentUserSync();
    if (!session?.token) return Object.values(readLocal());
    const res = await fetch('/api/store-favorites', {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (!res.ok) return Object.values(readLocal());
    const data = await res.json();
    const products = Array.isArray(data.products) ? data.products : [];
    writeLocal(Object.fromEntries(products.map((p: Product) => [String(p.id), p])));
    return products;
  },

  async set(product: Product, liked: boolean): Promise<Product[]> {
    const local = readLocal();
    if (liked) local[product.id] = product;
    else delete local[product.id];
    writeLocal(local);

    const session = storeAuth.getCurrentUserSync();
    if (!session?.token) return Object.values(local);

    const res = await fetch('/api/store-favorites', {
      method: liked ? 'POST' : 'DELETE',
      headers: {
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId: Number(product.id) }),
    });
    if (!res.ok) return Object.values(local);
    const data = await res.json();
    const products = Array.isArray(data.products) ? data.products : Object.values(local);
    writeLocal(Object.fromEntries(products.map((p: Product) => [String(p.id), p])));
    return products;
  },

  async syncLocal(): Promise<Product[]> {
    const session = storeAuth.getCurrentUserSync();
    const local = Object.values(readLocal());
    if (!session?.token || local.length === 0) return local;
    const res = await fetch('/api/store-favorites/sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productIds: local.map(p => Number(p.id)) }),
    });
    if (!res.ok) return local;
    const data = await res.json();
    const products = Array.isArray(data.products) ? data.products : local;
    writeLocal(Object.fromEntries(products.map((p: Product) => [String(p.id), p])));
    return products;
  },
};
