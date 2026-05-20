import React, { useState, useEffect, useRef } from 'react';
import {
  ExternalLink, Plus, Edit2, Trash2, Package, ShoppingBag,
  Check, X, Image as ImageIcon, ChevronDown, ChevronUp,
  Send, AlertCircle, RefreshCw, Camera, Loader2, Users, RotateCcw,
} from 'lucide-react';
import { DEFAULT_STORE_CHIPS, StoreChip, parseStoreChips, serializeStoreChips } from '../storefront-v2/config/storefrontConfig';

const MAX_PHOTOS = 3;

// 🚀 Función para comprimir imagen usando Canvas antes de subirla
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        // Reducimos al maximo de 800px para web
        const MAX_SIZE = 800;
        if (width > height && width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No canvas context');
        ctx.drawImage(img, 0, 0, width, height);
        // Calidad 80% en formato WEBP, retornamos el string en base64 comprimido
        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 🚀 Sube la imagen comprimida vía el backend seguro para evadir políticas RLS restrictivas
async function uploadToStorage(base64Data: string, originalName: string): Promise<string> {
  const ext = 'webp';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
  
  const res = await fetch('/api/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Data, fileName, contentType: 'image/webp' })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Error al subir la imagen al servidor');
  }

  const { publicUrl } = await res.json();
  return publicUrl;
}

interface StoreProduct {
  id: number;
  name: string;
  price: number;
  description: string;
  category: string;
  sizes: string[];
  image_url: string;
  images: string[];
  available: boolean;
  stock?: number;
  priority_order: number;
  compare_at_price?: number | null;
}

interface StoreOrder {
  id: number;
  items: Array<{ productId: string; productName: string; price: number; size: string; quantity: number }>;
  total: number;
  customer_name: string;
  customer_wa: string;
  status: 'pending' | 'paid' | 'ready' | 'delivered' | 'cancelled';
  payment_verified_at: string | null;
  payment_method: string | null;
  wa_sent: boolean;
  created_at: string;
  expires_at: string | null;
  is_verified_customer?: boolean;
  verified_source?: string | null;
}

const TALLAS_COMUNES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '34', '36', '38', '40', '42', 'Único'];
const BRAND = '#ff2d78';
const DISCOUNT_CATEGORY = 'Descuento';
type ProductFilter = 'active' | 'reserved' | 'sold' | 'hidden' | 'all';

const catColor = (cat: string) => {
  const colors: Record<string, string> = {
    'Blusas': '#e879f9', 'Vestidos': '#818cf8', 'Chaquetas': '#38bdf8',
    'Conjuntos': '#34d399', 'Accesorios': '#fbbf24', 'Pantalones': '#f97316',
    'Faldas': '#ec4899', 'General': '#94a3b8',
  };
  return colors[cat] ?? '#94a3b8';
};

const EMPTY_FORM = {
  name: '',
  price: '',
  compare_at_price: '',
  description: '',
  category: 'Blusas',
  sizes: [] as string[],
  images: [] as string[],
  available: true,
};

const isSoldProduct = (product: StoreProduct) => Number(product.stock ?? 1) <= 0;

export function AdminTiendaView({ userId, authToken }: { userId: string; authToken: string }) {
  const [subTab, setSubTab] = useState<'productos' | 'pedidos' | 'clientes' | 'confirmaciones' | 'config'>('productos');
  const [configTab, setConfigTab] = useState<'categorias' | 'tienda' | 'retiros'>('categorias');
  const [pickupDates, setPickupDates] = useState<Array<{ date: string; label: string; slots: string[] }>>([]);
  const [pickupSaving, setPickupSaving] = useState(false);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [selectionRequests, setSelectionRequests] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [storeChips, setStoreChips] = useState<StoreChip[]>([]);
  const [storeChipsLoaded, setStoreChipsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [productFilter, setProductFilter] = useState<ProductFilter>('active');
  const [talla, setTalla] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [aiError, setAiError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'paid' | 'cancelled'>('all');
  const [storeProfiles, setStoreProfiles] = useState<any[]>([]);
  const [macroHealth, setMacroHealth] = useState<{ alert: boolean; lastIngestAgeSec: number | null; pendingCount: number } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoryOptions = storeChips
    .filter(chip => (chip.kind === 'category' || chip.kind === 'discount') && chip.active && chip.value !== 'Todos')
    .map(chip => chip.value);
  const formCategoryOptions = categoryOptions.length > 0 ? categoryOptions : DEFAULT_STORE_CHIPS.filter(chip => chip.active).map(chip => chip.value);
  const firstOfficialCategory = formCategoryOptions[0] ?? DISCOUNT_CATEGORY;
  const isDiscountProduct = form.category === DISCOUNT_CATEGORY;
  const reservedProductIds = new Set(
    orders
      .filter(order => order.status === 'pending')
      .flatMap(order => order.items.map(item => String(item.productId)))
  );
  const productCounts = {
    active: products.filter(product => product.available && !isSoldProduct(product) && !reservedProductIds.has(String(product.id))).length,
    reserved: products.filter(product => reservedProductIds.has(String(product.id))).length,
    sold: products.filter(isSoldProduct).length,
    hidden: products.filter(product => !product.available && !isSoldProduct(product)).length,
    all: products.length,
  };
  const visibleProducts = products.filter(product => {
    const reserved = reservedProductIds.has(String(product.id));
    const sold = isSoldProduct(product);
    if (productFilter === 'active') return product.available && !sold && !reserved;
    if (productFilter === 'reserved') return reserved;
    if (productFilter === 'sold') return sold;
    if (productFilter === 'hidden') return !product.available && !sold;
    return true;
  });

  // Auto-refresco de pedidos cada 15 segundos cuando se está en la pestaña
  useEffect(() => {
    if (subTab !== 'pedidos') return;
    const interval = setInterval(() => loadOrders(), 15000);
    return () => clearInterval(interval);
  }, [subTab]);

  // Health check de MacroDroid: si hace > 10 min que no llega notificación
  // y hay pedidos pending, mostramos banner rojo (revisar el teléfono).
  useEffect(() => {
    if (subTab !== 'pedidos') return;
    let alive = true;
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/store/macrodroid-health');
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setMacroHealth({
          alert: !!data.alert,
          lastIngestAgeSec: data.lastIngestAgeSec ?? null,
          pendingCount: data.pendingCount ?? 0,
        });
      } catch {}
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => { alive = false; clearInterval(interval); };
  }, [subTab]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const toProcess = files.slice(0, MAX_PHOTOS - form.images.length);
    setCompressing(true);
    setSaveError('');
    try {
      // Comprimir y subir en paralelo (vía backend)
      const urls = await Promise.all(toProcess.map(async (file) => {
        const compressedBase64 = await compressImage(file);
        return await uploadToStorage(compressedBase64, file.name);
      }));
      setForm(f => ({ ...f, images: [...f.images, ...urls] }));
    } catch (err: any) {
      setSaveError('Error al subir imagen. Revisa tu conexión.');
      console.error(err);
    } finally {
      setCompressing(false);
      e.target.value = '';
    }
  };

  const handleAiFill = async () => {
    if (form.images.length === 0) return;
    setAiStatus('loading');
    setAiError('');

    try {
      const res = await fetch('/api/ai/product-from-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ imageUrls: form.images, categories: formCategoryOptions }),
      });

      const json = await res.json().catch(() => ({ ok: false, error: 'Respuesta inválida del servidor' }));

      if (!res.ok || !json.ok) {
        setAiError(json.error || 'No se pudo analizar las imágenes.');
        setAiStatus('error');
        return;
      }

      const ai = json.data;

      // Mapear categoría contra las opciones disponibles
      const catMatch = formCategoryOptions.includes(ai.categoria) ? ai.categoria : firstOfficialCategory;

      // Mapear tallas: solo las que coincidan con las opciones disponibles
      const tallasValidas = (ai.tallas as string[]).filter(
        (t: string) => TALLAS_COMUNES.includes(t.toUpperCase()) || t.length <= 5
      );

      setForm(f => ({
        ...f,
        name: ai.nombre || f.name,
        description: ai.descripcion || f.description,
        category: catMatch,
        sizes: tallasValidas.length > 0 ? tallasValidas : f.sizes,
      }));

      setAiStatus('success');
      // Resetear el badge de éxito después de 6 segundos
      setTimeout(() => setAiStatus('idle'), 6000);

    } catch (err: any) {
      console.error('[AI fill]', err);
      setAiError('Error de conexión. Intenta de nuevo.');
      setAiStatus('error');
    }
  };

  const loadOrders = async (silent = true) => {
    if (!silent) setLoading(true);
    try {
      const oRes = await fetch('/api/store-orders/admin', { headers: { 'x-user-id': userId, Authorization: `Bearer ${authToken}` } });
      if (oRes.ok) setOrders(await oRes.json());
    } catch (e) { console.error('Error cargando pedidos:', e); }
    finally { if (!silent) setLoading(false); }
  };

  const loadSelectionRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/store/selection-requests?status=pending_customer', { headers: { 'x-user-id': userId, Authorization: `Bearer ${authToken}` } });
      if (res.ok) setSelectionRequests(await res.json());
    } catch (e) { console.error('Error cargando confirmaciones:', e); }
    finally { setLoading(false); }
  };

  const sendSelectionLink = async (id: number) => {
    try {
      const res = await fetch(`/api/store/selection/${id}/send-link`, {
        method: 'POST',
        headers: { 'x-user-id': userId, Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (res.ok && data.message) {
        const msg = encodeURIComponent(data.message);
        window.open(`https://wa.me/${data.phone}?text=${msg}`, '_blank');
      }
    } catch (e) { console.error(e); }
  };

  const loadStoreProfiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/store-profiles', { headers: { 'x-user-id': userId, Authorization: `Bearer ${authToken}` } });
      if (res.ok) setStoreProfiles(await res.json());
    } catch (e) { console.error('Error cargando clientes tienda:', e); }
    finally { setLoading(false); }
  };

  const loadSettings = async () => {
    setStoreChipsLoaded(false);
    try {
      const res = await fetch('/api/store/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setStoreChips(parseStoreChips(data.store_chips));
      }
      try {
        const pdRes = await fetch('/api/store/pickup-dates');
        if (pdRes.ok) {
          const pdData = await pdRes.json();
          setPickupDates(pdData.dates ?? []);
        }
      } catch {}
    } catch (e) { console.error(e); }
    finally { setStoreChipsLoaded(true); }
  };

  const savePickupDates = async (dates: typeof pickupDates) => {
    setPickupSaving(true);
    try {
      await fetch('/api/store/pickup-dates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates }),
      });
      setPickupDates(dates);
    } finally {
      setPickupSaving(false);
    }
  };

  const saveSetting = async (key: string, value: string) => {
    try {
      await fetch('/api/store/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ [key]: value }),
      });
      setSettings(prev => ({ ...prev, [key]: value }));
    } catch (e) { console.error(e); }
  };

  const saveStoreChips = async (next: StoreChip[]) => {
    const normalized = next.map((chip, idx) => ({ ...chip, sort: idx * 10 }));
    setStoreChips(normalized);
    await saveSetting('store_chips', serializeStoreChips(normalized));
  };

  const handleQrUpload = async (file: File) => {
    setQrUploading(true);
    try {
      const compressed = await compressImage(file);
      const url = await uploadToStorage(compressed, file.name);
      await saveSetting('payment_qr_url', url);
    } catch (err: any) {
      alert(err?.message || 'No se pudo subir el QR');
    } finally {
      setQrUploading(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pRes, oRes] = await Promise.all([
        fetch('/api/products?admin=true&limit=500', { headers: { 'x-user-id': userId } }),
        fetch('/api/store-orders/admin', { headers: { 'x-user-id': userId, Authorization: `Bearer ${authToken}` } }),
      ]);
      if (pRes.ok) {
        const json = await pRes.json();
        setProducts(Array.isArray(json) ? json : json.data || []);
      }
      if (oRes.ok) setOrders(await oRes.json());
    } catch (e) {
      console.error('Error cargando tienda:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const openNew = () => {
    setForm({ ...EMPTY_FORM, category: firstOfficialCategory });
    setEditingId(null);
    setSaveError('');
    setAiStatus('idle');
    setAiError('');
    setUrlInput('');
    setTalla('');
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const openEdit = (p: StoreProduct) => {
    const officialCategory = formCategoryOptions.includes(p.category) ? p.category : firstOfficialCategory;
    setForm({
      name: p.name,
      price: String(p.price),
      compare_at_price: p.compare_at_price ? String(p.compare_at_price) : '',
      description: p.description ?? '',
      category: officialCategory,
      sizes: [...(p.sizes ?? [])],
      images: [...(p.images ?? [])],
      available: p.available,
    });
    setEditingId(p.id);
    setSaveError('');
    setUrlInput('');
    setTalla('');
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const addTalla = (t: string) => {
    const v = t.trim().toUpperCase();
    if (v && !form.sizes.includes(v)) setForm(f => ({ ...f, sizes: [...f.sizes, v] }));
    setTalla('');
  };

  const removeTalla = (t: string) => setForm(f => ({ ...f, sizes: f.sizes.filter(s => s !== t) }));

  const addImageUrl = () => {
    const url = urlInput.trim();
    if (url && !form.images.includes(url) && form.images.length < 5) {
      setForm(f => ({ ...f, images: [...f.images, url] }));
      setUrlInput('');
    }
  };

  const removeImage = (idx: number) => setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));
  const moveImage = (idx: number, direction: -1 | 1) => {
    setForm(f => {
      const nextIndex = idx + direction;
      if (nextIndex < 0 || nextIndex >= f.images.length) return f;
      const images = [...f.images];
      [images[idx], images[nextIndex]] = [images[nextIndex], images[idx]];
      return { ...f, images };
    });
  };
  const makeCoverImage = (idx: number) => {
    setForm(f => {
      if (idx <= 0 || idx >= f.images.length) return f;
      const images = [...f.images];
      const [cover] = images.splice(idx, 1);
      return { ...f, images: [cover, ...images] };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price) return;
    if (form.category === DISCOUNT_CATEGORY) {
      const before = Number(form.compare_at_price);
      const final = Number(form.price);
      if (!Number.isFinite(before) || before <= final) {
        setSaveError('En Descuento, el precio antes debe ser mayor que el precio final.');
        return;
      }
    }
    setSaving(true);
    setSaveError('');
    try {
      const body = {
        name: form.name.trim(),
        price: Number(form.price),
        compare_at_price: form.category === DISCOUNT_CATEGORY ? Number(form.compare_at_price) : null,
        description: form.description.trim(),
        category: form.category,
        sizes: form.sizes,
        images: form.images,
        available: form.available,
      };
      const url = editingId ? `/api/products/${editingId}` : '/api/products';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Error ${res.status}` }));
        throw new Error(err.error ?? `Error ${res.status}`);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM, category: firstOfficialCategory });
      setAiStatus('idle');
      setAiError('');
      await loadAll();
    } catch (err: any) {
      setSaveError(err.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE',
      headers: { 'x-user-id': userId },
    });
    if (res.ok) await loadAll();
    else alert('Error al eliminar');
  };

  const handleRelist = async (id: number, name: string) => {
    if (!confirm(`¿Volver a poner "${name}" a la venta con código nuevo?`)) return;
    const res = await fetch(`/api/products/${id}/relist`, {
      method: 'POST',
      headers: { 'x-user-id': userId },
    });
    if (res.ok) await loadAll();
    else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'No se pudo volver a poner a la venta');
    }
  };

  const handleRelistOrderItems = async (order: StoreOrder) => {
    const productIds = [...new Set((order.items ?? []).map(item => Number(item.productId)).filter(Boolean))];
    if (productIds.length === 0) {
      alert('Este pedido no tiene prendas para volver a vender.');
      return;
    }
    if (!confirm(`¿Volver a poner ${productIds.length} prenda(s) de este pedido a la venta con código nuevo?`)) return;
    try {
      for (const productId of productIds) {
        const res = await fetch(`/api/products/${productId}/relist`, {
          method: 'POST',
          headers: { 'x-user-id': userId },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `No se pudo relistar producto ${productId}`);
        }
      }
      await loadAll();
    } catch (err: any) {
      alert(err?.message || 'No se pudieron volver a poner las prendas a la venta');
    }
  };

  const moveActiveProduct = async (productId: number, direction: -1 | 1) => {
    if (reorderSaving) return;
    const activeProducts = products.filter(product => {
      const reserved = reservedProductIds.has(String(product.id));
      const sold = isSoldProduct(product);
      return product.available && !sold && !reserved;
    });
    const currentIndex = activeProducts.findIndex(product => product.id === productId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= activeProducts.length) return;

    const reorderedActive = [...activeProducts];
    [reorderedActive[currentIndex], reorderedActive[nextIndex]] = [reorderedActive[nextIndex], reorderedActive[currentIndex]];
    const nextPriorities = new Map(reorderedActive.map((product, index) => [product.id, (index + 1) * 10]));
    const previousProducts = products;

    setProducts(prev => {
      const activeSet = new Set(reorderedActive.map(product => product.id));
      const inactive = prev.filter(product => !activeSet.has(product.id));
      return [
        ...reorderedActive.map(product => ({ ...product, priority_order: nextPriorities.get(product.id) ?? product.priority_order })),
        ...inactive,
      ];
    });

    setReorderSaving(true);
    try {
      const res = await fetch('/api/products/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ productIds: reorderedActive.map(product => product.id) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo guardar el orden');
      }
    } catch (err) {
      console.error(err);
      setProducts(previousProducts);
      alert(err instanceof Error ? err.message : 'No se pudo guardar el orden. Intenta de nuevo.');
    } finally {
      setReorderSaving(false);
    }
  };

  const updateOrder = async (id: number, body: object) => {
    const res = await fetch(`/api/store-orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(body),
    });
    if (res.ok) await loadAll();
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900">Panel de Tienda</h2>
          <p className="text-xs text-gray-400 font-medium">LeidyCandy</p>
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href="/tienda"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-black border transition-all hover:scale-105"
            style={{ borderColor: BRAND, color: BRAND, background: '#fff0f5' }}
          >
            <ExternalLink size={12} />
            Ver tienda
          </a>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
        <button
          onClick={() => setSubTab('productos')}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-black transition-all"
          style={subTab === 'productos'
            ? { background: 'white', color: BRAND, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }
            : { color: '#9ca3af' }}
        >
          <Package size={14} />
          Productos
          <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full font-black">
            {products.length}
          </span>
        </button>
        <button
          onClick={() => setSubTab('pedidos')}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-black transition-all"
          style={subTab === 'pedidos'
            ? { background: 'white', color: BRAND, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }
            : { color: '#9ca3af' }}
        >
          <ShoppingBag size={14} />
          Pedidos
          {orders.filter(o => o.status === 'pending').length > 0 && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-white" style={{ background: BRAND }}>
              {orders.filter(o => o.status === 'pending').length}
            </span>
          )}
        </button>
        <button
          onClick={() => { setSubTab('config'); loadSettings(); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-black transition-all"
          style={subTab === 'config'
            ? { background: 'white', color: BRAND, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }
            : { color: '#9ca3af' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.67 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.67 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.67a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.33 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Config
        </button>
      </div>

      {/* ─── PRODUCTOS ─── */}
      {subTab === 'productos' && (
        <div className="space-y-3">
          {/* Formulario */}
          {showForm && (
            <div ref={formRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <p className="text-sm font-black text-gray-800">
                {editingId ? '✏️ Editar producto' : '➕ Nuevo producto'}
              </p>

              {/* Error */}
              {saveError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                  <p className="text-xs font-bold text-red-600">{saveError}</p>
                </div>
              )}

              {/* 1. Fotos y Botón IA */}
              <div className="grid grid-cols-[1fr_96px] gap-2 rounded-xl border border-gray-100 bg-gray-50 p-2.5">
                <div className="grid grid-cols-3 gap-1.5">
                  {Array.from({ length: MAX_PHOTOS }).map((_, idx) => {
                    const img = form.images[idx];
                    return (
                      <div key={idx} className="relative aspect-[4/5] overflow-hidden rounded-xl border bg-white shadow-sm" style={{ borderColor: idx === 0 ? BRAND : '#e5e7eb' }}>
                        {img ? (
                          <>
                            <img src={img} alt="" className="h-full w-full object-cover" />
                            <button type="button" onClick={() => removeImage(idx)} className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white shadow">
                              <X size={8} />
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={compressing} className="flex h-full w-full items-center justify-center text-pink-500 disabled:opacity-50">
                            {compressing ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                          </button>
                        )}
                        <button
                          type="button"
                          title={`Foto ${idx + 1}`}
                          onClick={() => img && makeCoverImage(idx)}
                          disabled={!img || idx === 0}
                          className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/75 px-1 text-[10px] font-black text-white disabled:cursor-default"
                        >
                          {idx + 1}
                        </button>
                        {img && form.images.length > 1 && (
                          <div className="absolute bottom-1 left-1 right-1 flex justify-center gap-1">
                            {idx > 0 && (
                              <button type="button" title="Subir en orden" onClick={() => moveImage(idx, -1)} className="h-5 rounded-md bg-white/90 px-1.5 text-[10px] font-black text-gray-700 shadow-sm">
                                -
                              </button>
                            )}
                            {idx < form.images.length - 1 && (
                              <button type="button" title="Bajar en orden" onClick={() => moveImage(idx, 1)} className="h-5 rounded-md bg-white/90 px-1.5 text-[10px] font-black text-gray-700 shadow-sm">
                                +
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />

                {/* Botón IA */}
                <button
                  type="button"
                  onClick={handleAiFill}
                  disabled={form.images.length === 0 || aiStatus === 'loading' || compressing}
                  className="flex h-full min-h-[92px] w-full flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center font-black text-[12px] leading-tight transition-all disabled:opacity-50"
                  style={form.images.length === 0 || aiStatus === 'loading'
                    ? { background: '#e5e7eb', color: '#9ca3af' }
                    : { background: 'linear-gradient(135deg, #a855f7, #ec4899)', color: 'white', boxShadow: '0 2px 8px rgba(168,85,247,0.3)' }
                  }
                >
                  {aiStatus === 'loading' ? <><Loader2 size={14} className="animate-spin" /> Analizando...</> : <><span>IA</span><span>Rellenar</span></>}
                </button>
                {(aiStatus === 'success' || aiStatus === 'error') && (
                  <p className={`col-span-2 text-center text-[10px] font-bold ${aiStatus === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                    {aiStatus === 'success' ? 'Listo. Revisa los datos.' : aiError}
                  </p>
                )}
              </div>

              {/* 2. Datos del Producto */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase">Nombre *</label>
                  <input type="text" className="w-full mt-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] font-medium outline-none focus:border-pink-400" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">{isDiscountProduct ? 'Precio final (Bs)*' : 'Precio (Bs)*'}</label>
                  <input type="number" className="w-full mt-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] font-medium outline-none focus:border-pink-400" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">Categoría</label>
                  <select className="w-full mt-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[12px] font-medium outline-none bg-white" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, compare_at_price: e.target.value === DISCOUNT_CATEGORY ? f.compare_at_price : '' }))}>
                    {formCategoryOptions.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">Tallas</label>
                  <div className="mt-1 flex items-center">
                    <input type="text" placeholder="Ej: S, M" className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-[12px] font-medium outline-none" value={form.sizes.join(', ')} onChange={e => setForm(f => ({ ...f, sizes: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) }))} />
                  </div>
                </div>
              </div>

              {isDiscountProduct && (
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">Precio antes (Bs)</label>
                  <input type="number" className="w-full mt-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] font-medium outline-none focus:border-pink-400" value={form.compare_at_price} onChange={e => setForm(f => ({ ...f, compare_at_price: e.target.value }))} />
                </div>
              )}

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase">Descripción</label>
                <textarea rows={2} className="w-full mt-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] font-medium outline-none resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              {/* Toggle disponible */}
              <button type="button" onClick={() => setForm(f => ({ ...f, available: !f.available }))} className="flex items-center gap-2">
                <div className="w-8 h-4 rounded-full transition-all flex items-center px-0.5" style={{ background: form.available ? BRAND : '#e5e7eb' }}>
                  <div className="w-3 h-3 rounded-full bg-white shadow-sm transition-all" style={{ transform: form.available ? 'translateX(16px)' : 'translateX(0)' }} />
                </div>
                <span className="text-[12px] font-bold text-gray-600">{form.available ? 'Visible en tienda' : 'Oculto'}</span>
              </button>

              {/* Botón guardar */}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.price}
                className="w-full h-11 rounded-xl font-black text-sm text-white transition-all active:scale-95 disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${BRAND}, #ff6fa3)` }}
              >
                {saving ? 'Guardando...' : editingId ? '✓ Actualizar Producto' : '✓ Crear Producto'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-5 gap-1">
            {([
              ['active', 'Activos', productCounts.active],
              ['reserved', 'Reservados', productCounts.reserved],
              ['sold', 'Vendidos', productCounts.sold],
              ['hidden', 'Ocultos', productCounts.hidden],
            ] as Array<[ProductFilter, string, number]>).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setProductFilter(key)}
                className="min-w-0 rounded-xl px-1.5 py-2 text-[10px] font-black transition-colors"
                style={productFilter === key
                  ? { background: BRAND, color: 'white', boxShadow: '0 4px 12px rgba(255,45,120,0.22)' }
                  : { background: 'white', color: '#6b7280', border: '1px solid #eef0f4' }}
              >
                <span className="truncate">{label}</span> <span className={productFilter === key ? 'text-white/80' : 'text-gray-400'}>{count}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={showForm ? () => { setShowForm(false); setEditingId(null); } : openNew}
              className="min-w-0 flex items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[10px] font-black text-white transition-all active:scale-[0.98]"
              style={{ background: showForm ? '#6b7280' : `linear-gradient(135deg, ${BRAND}, #ff6fa3)` }}
            >
              {showForm ? <X size={12} /> : <Plus size={12} />}
              {showForm ? 'Cancelar' : 'Nuevo'}
            </button>
          </div>

          {/* Lista */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(n => <div key={n} className="h-[76px] rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-black text-sm">Sin productos aún</p>
              <p className="text-xs mt-1">Crea tu primer producto arriba</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {visibleProducts.map((p, visibleIndex) => {
                const isReserved = reservedProductIds.has(String(p.id));
                const sold = isSoldProduct(p);
                const status = sold ? 'Vendido' : isReserved ? 'Reservado' : p.available ? 'Activo' : 'Oculto';
                const statusColor = sold ? '#ef4444' : isReserved ? '#3b82f6' : p.available ? '#10b981' : '#9ca3af';
                const photoCount = p.images?.length ?? 0;
                const canReorder = productFilter === 'active' && !isReserved && !sold && p.available;
                const meta = [
                  p.category,
                  ...(p.sizes ?? []),
                  p.category === DISCOUNT_CATEGORY && p.compare_at_price ? `${p.compare_at_price}→${p.price} Bs` : `${p.price} Bs`,
                  `${photoCount} foto${photoCount === 1 ? '' : 's'}`,
                ];
                return (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-2.5 py-2 flex gap-2.5 items-center">
                  {/* Foto */}
                  <div className="w-[58px] h-[66px] rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 border border-gray-100">
                    {p.images?.[0] || p.image_url ? (
                      <img src={p.images?.[0] || p.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={20} className="text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 self-stretch flex flex-col justify-center">
                    <div className="flex items-start gap-2">
                      <p className="font-black text-[13px] text-gray-950 leading-[1.15] flex-1 line-clamp-2">{p.name}</p>
                      <span
                        className="flex-shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full text-white"
                        style={{ background: statusColor }}
                      >
                        {status}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] font-bold text-gray-500 truncate">
                      {meta.filter(Boolean).join(' · ')}
                    </p>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center justify-end gap-2 flex-shrink-0">
                    {canReorder && (
                      <div className="flex flex-col gap-1">
                        <button
                          title="Subir en la tienda"
                          disabled={visibleIndex === 0 || reorderSaving}
                          onClick={() => moveActiveProduct(p.id, -1)}
                          className="w-7 h-7 rounded-lg bg-gray-50 text-gray-500 flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          title="Bajar en la tienda"
                          disabled={visibleIndex === visibleProducts.length - 1 || reorderSaving}
                          onClick={() => moveActiveProduct(p.id, 1)}
                          className="w-7 h-7 rounded-lg bg-gray-50 text-gray-500 flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                        >
                          <ChevronDown size={13} />
                        </button>
                      </div>
                    )}
                    {(!p.available || sold) && (
                      <button
                        title="Volver a poner a la venta con código nuevo"
                        onClick={() => handleRelist(p.id, p.name)}
                          className="w-7 h-7 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center hover:bg-pink-100 transition-colors"
                        >
                          <RotateCcw size={12} />
                      </button>
                    )}
                    <button
                      title="Editar"
                      onClick={() => openEdit(p)}
                        className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors"
                      >
                        <Edit2 size={13} />
                    </button>
                    {/* Toggle disponibilidad: un toque oculta/muestra en tienda */}
                    <button
                      title={p.available ? 'Ocultar de la tienda' : 'Mostrar en la tienda'}
                      onClick={async () => {
                        await fetch(`/api/products/${p.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                          body: JSON.stringify({ available: !p.available })
                        });
                        setProducts(ps => ps.map(x => x.id === p.id ? { ...x, available: !x.available } : x));
                      }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                      style={{ background: p.available ? '#dcfce7' : '#f3f4f6', color: p.available ? '#16a34a' : '#9ca3af' }}
                    >
                      {p.available
                          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      }
                    </button>
                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                        className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors"
                      >
                        <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── PEDIDOS ─── */}
      {subTab === 'pedidos' && (
        <div className="space-y-3">

          {/* Banner: MacroDroid sin notificaciones */}
          {macroHealth?.alert && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 flex items-start gap-2">
              <div className="text-red-500 text-lg leading-none mt-0.5">⚠</div>
              <div className="flex-1">
                <p className="text-[12px] font-black text-red-700">MacroDroid sin notificaciones hace {Math.floor((macroHealth.lastIngestAgeSec ?? 0) / 60)} min</p>
                <p className="text-[10px] text-red-600 mt-0.5">
                  Hay {macroHealth.pendingCount} pedido(s) esperando pago. Revisa el teléfono que envía notificaciones del banco.
                </p>
              </div>
            </div>
          )}

          {/* Stats rápidas */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Hoy', value: orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).length, color: '#6366f1' },
              { label: 'Pendientes', value: orders.filter(o => o.status === 'pending').length, color: '#f59e0b' },
              { label: 'Verificados', value: orders.filter(o => o.status === 'paid' || o.status === 'delivered').length, color: '#10b981' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl p-3 text-center border border-gray-100">
                <p className="text-[22px] font-black" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Filtro + refresh */}
          <div className="flex gap-2">
            <div className="flex bg-gray-100 rounded-xl p-0.5 flex-1">
              {(['all', 'pending', 'paid', 'cancelled'] as const).map(f => (
                <button key={f} onClick={() => setOrderFilter(f)}
                  className="flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all"
                  style={orderFilter === f ? { background: 'white', color: BRAND, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: '#9ca3af' }}>
                  {f === 'all' ? 'Todos' : f === 'pending' ? 'Pend.' : f === 'paid' ? 'Pagados' : 'Canc.'}
                </button>
              ))}
            </div>
            <button onClick={() => loadOrders(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600">
              <RefreshCw size={14} />
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(n => <div key={n} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <ShoppingBag size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-black text-sm">Sin pedidos aún</p>
              <p className="text-xs mt-1">Aparecerán cuando lleguen desde la tienda</p>
            </div>
          ) : (() => {
            const STATUS_CFG = {
              pending:   { label: 'Esperando pago', bg: '#e0f2fe', text: '#0369a1', dot: '#0ea5e9' },
              paid:      { label: '✅ Pago Verificado', bg: '#d1fae5', text: '#065f46', dot: '#10b981' },
              ready:     { label: '📦 Listo para entrega', bg: '#ede9fe', text: '#6d28d9', dot: '#8b5cf6' },
              delivered: { label: '🎉 Entregado', bg: '#f0fdf4', text: '#166534', dot: '#22c55e' },
              cancelled: { label: 'Cancelado', bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
            };
            const filtered = orderFilter === 'all' ? orders
              : orders.filter(o => orderFilter === 'paid' ? (o.status === 'paid' || o.status === 'ready' || o.status === 'delivered') : o.status === orderFilter);

            return filtered.map(order => {
              const cfg = STATUS_CFG[order.status] ?? STATUS_CFG.pending;
              const isExpanded = expandedOrder === order.id;
              const isExpired = order.expires_at && new Date(order.expires_at) < new Date() && order.status === 'pending';

              return (
                <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <button onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                    className="w-full p-3 flex items-start gap-3 text-left">
                    <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: cfg.dot }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <p className="text-sm font-black text-gray-800">#{order.id}</p>
                        {order.is_verified_customer && (
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white" title="Cliente verificado">
                            <Check size={11} strokeWidth={4} />
                          </span>
                        )}
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.text }}>
                          {cfg.label}
                        </span>
                        {isExpired && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-50 text-red-500">EXPIRADO</span>}
                        {Number((order as any).payment_shortfall) > 0 && order.status === 'pending' && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600" title={`Pagó Bs ${(order as any).partial_payment_amount} de Bs ${order.total}`}>
                            ⚠ PAGO PARCIAL · falta Bs {Number((order as any).payment_shortfall).toFixed(2)}
                          </span>
                        )}
                        {String((order as any).payment_ref ?? '').includes('bank-detected') && !(order as any).wa_proof_received && order.status === 'pending' && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">SIN COMPROBANTE</span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400">
                        {new Date(order.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {order.customer_wa && <span className="ml-1 text-gray-500">· {order.customer_wa}</span>}
                      </p>
                      {order.customer_name && (
                        <p className="text-[11px] text-gray-600 font-bold truncate flex items-center gap-1">
                          <span className="truncate">{order.customer_name}</span>
                          {order.is_verified_customer && <Check size={12} className="text-emerald-500 flex-shrink-0" strokeWidth={4} />}
                        </p>
                      )}
                      <p className="text-[14px] font-black mt-0.5" style={{ color: BRAND }}>{Number(order.total).toFixed(2)} Bs
                        <span className="text-[10px] text-gray-400 font-medium ml-1">{order.items?.length ?? 0} prenda{(order.items?.length ?? 0) !== 1 ? 's' : ''}</span>
                      </p>
                      {order.payment_verified_at && (
                        <p className="text-[10px] text-green-600 font-bold mt-0.5">
                          ✓ Verificado {new Date(order.payment_verified_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-gray-50 pt-2 space-y-2">
                      {/* Detalle de items */}
                      <div className="bg-gray-50 rounded-xl p-2 space-y-1">
                        {(order.items ?? []).map((item, idx) => (
                          <div key={idx} className="flex justify-between text-[11px]">
                            <span className="text-gray-700 truncate flex-1">{item.productName}{item.size && ` (${item.size})`} ×{item.quantity}</span>
                            <span className="font-black text-gray-800 ml-2">{(item.price * item.quantity).toFixed(2)} Bs</span>
                          </div>
                        ))}
                        <div className="border-t border-gray-200 pt-1 flex justify-between">
                          <span className="text-[10px] font-black text-gray-400 uppercase">Total</span>
                          <span className="text-[13px] font-black" style={{ color: BRAND }}>{Number(order.total).toFixed(2)} Bs</span>
                        </div>
                      </div>

                      {(order.items ?? []).length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleRelistOrderItems(order)}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl font-black text-[11px] bg-pink-50 text-pink-600 hover:bg-pink-100 transition-colors"
                        >
                          <RotateCcw size={12} />
                          Volver a vender prendas
                        </button>
                      )}

                      {/* Acciones según estado */}
                      {order.status === 'pending' && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button onClick={() => updateOrder(order.id, { status: 'paid', hideProducts: true })}
                            className="flex items-center justify-center gap-1 py-2 rounded-xl font-black text-[11px] text-white" style={{ background: BRAND }}>
                            <Check size={12} /> Vendido + Ocultar
                          </button>
                          <button onClick={() => updateOrder(order.id, { status: 'cancelled' })}
                            className="flex items-center justify-center gap-1 py-2 rounded-xl font-black text-[11px] bg-red-50 text-red-600">
                            <X size={12} /> Cancelar
                          </button>
                          <button
                            onClick={() => {
                              const storeLink = `https://leidycandy.me/tienda#profile/confirmar`;
                              const msg = encodeURIComponent(`Hola! Por favor revisa las prendas de tu pedido #${order.id} y confirma si todo está correcto: ${storeLink}\n\n(Necesitarás tu PIN de la tienda)`);
                              window.open(`https://wa.me/591${order.customer_wa}?text=${msg}`, '_blank');
                            }}
                            className="col-span-2 flex items-center justify-center gap-1 py-2 rounded-xl font-black text-[11px] text-white"
                            style={{ background: '#f59e0b' }}>
                            📋 Pedir confirmación a la clienta
                          </button>
                        </div>
                      )}
                      {order.status === 'paid' && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button onClick={() => updateOrder(order.id, { status: 'ready' })}
                            className="flex items-center justify-center gap-1 py-2 rounded-xl font-black text-[11px] text-white" style={{ background: '#8b5cf6' }}>
                            📦 Marcar Listo
                          </button>
                          <button
                            onClick={() => { const msg = encodeURIComponent(`Hola! Tu pedido #${order.id} está listo para entrega 🎉`); window.open(`https://wa.me/591${order.customer_wa}?text=${msg}`, '_blank'); }}
                            className="flex items-center justify-center gap-1 py-2 rounded-xl font-black text-[11px] text-white" style={{ background: '#25D366' }}>
                            <Send size={11} /> Avisar WA
                          </button>
                        </div>
                      )}
                      {order.status === 'ready' && (
                        <button onClick={() => updateOrder(order.id, { status: 'delivered' })}
                          className="w-full py-2 rounded-xl font-black text-[12px] text-white" style={{ background: '#22c55e' }}>
                          🎉 Marcar Entregado
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* ─── CONFIRMACIONES ─── */}
      {subTab === 'confirmaciones' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-gray-800">Confirmaciones pendientes</p>
            <button onClick={loadSelectionRequests} className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500">
              <RefreshCw size={15} />
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(n => <div key={n} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : selectionRequests.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <AlertCircle size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-black text-sm">Sin confirmaciones pendientes</p>
              <p className="text-xs mt-1">Apareceran cuando la IA tenga dudas</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectionRequests.map(req => (
                <div key={req.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-gray-800">{req.customer_name || 'Cliente'}</p>
                      <p className="text-[11px] text-gray-400">{req.customer_wa}</p>
                      <p className="text-[11px] text-amber-600 font-bold mt-0.5">
                        Confianza IA: {Math.round((req.confidence_score || 0) * 100)}%
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {req.candidate_photos?.length || 0} fotos candidatas
                      </p>
                    </div>
                    <button
                      onClick={() => sendSelectionLink(req.id)}
                      className="flex-shrink-0 h-9 px-3 rounded-xl font-black text-[11px] text-white flex items-center gap-1.5"
                      style={{ background: '#25D366' }}
                    >
                      <Send size={12} />
                      Enviar link
                    </button>
                  </div>
                  {req.candidate_photos && req.candidate_photos.length > 0 && (
                    <div className="flex gap-2 mt-2 overflow-x-auto">
                      {req.candidate_photos.map((url: string, idx: number) => (
                        <img key={idx} src={url} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── CLIENTES ─── */}
      {subTab === 'clientes' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-gray-800">Clientes registrados</p>
              <p className="text-[11px] text-gray-400">Compraron en la tienda o tienen perfil</p>
            </div>
            <button onClick={loadStoreProfiles} className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500">
              <RefreshCw size={15} />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-2xl p-3 text-center border border-gray-100">
              <p className="text-[26px] font-black" style={{ color: BRAND }}>{storeProfiles.length}</p>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Total clientes</p>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center border border-gray-100">
              <p className="text-[26px] font-black text-emerald-500">
                {storeProfiles.filter(p => p.orders && p.orders.length > 0).length}
              </p>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Con pedidos</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(n => <div key={n} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : storeProfiles.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Users size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-black text-sm">Sin clientes aún</p>
              <p className="text-xs mt-1">Aparecerán cuando alguien compre en la tienda</p>
            </div>
          ) : (
            <div className="space-y-2">
              {storeProfiles.map((profile: any, idx: number) => {
                const phone = profile.phone || '';
                const name = profile.name || 'Cliente tienda';
                const orderCount = profile.orders?.length ?? 0;
                const total = Number(profile.total ?? 0);
                const verified = !!profile.is_verified_customer;
                return (
                  <div key={profile.key || idx} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-black text-white text-[13px]"
                      style={{ background: `hsl(${(phone.charCodeAt(0) || 0) * 47 % 360}, 60%, 60%)` }}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-gray-800 truncate flex items-center gap-1">
                        <span className="truncate">{name}</span>
                        {verified && (
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white flex-shrink-0" title="Cliente verificado">
                            <Check size={11} strokeWidth={4} />
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-400">{phone ? `+591 ${phone}` : 'Sin teléfono'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[13px] font-black" style={{ color: BRAND }}>
                        {total > 0 ? `${total.toFixed(0)} Bs` : '—'}
                      </p>
                      <p className="text-[10px] text-gray-400 font-medium">
                        {orderCount} pedido{orderCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {phone && (
                      <a href={`https://wa.me/591${phone}`} target="_blank" rel="noopener noreferrer"
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: '#dcfce7', color: '#16a34a' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.119.554 4.106 1.523 5.824L0 24l6.335-1.505A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.895 0-3.667-.497-5.2-1.367l-.37-.22-3.86.917.955-3.769-.241-.386A9.959 9.959 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                        </svg>
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── CONFIGURACION ─── */}
      {subTab === 'config' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-gray-100 p-1">
            {[
              { key: 'categorias', label: 'Categorias' },
              { key: 'tienda', label: 'Tienda' },
              { key: 'retiros', label: 'Retiros' },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setConfigTab(tab.key as 'categorias' | 'tienda' | 'retiros')}
                className={`h-9 rounded-xl text-[11px] font-black transition-all ${configTab === tab.key ? 'bg-white text-[#ff2d78] shadow-sm' : 'text-gray-400'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {configTab === 'categorias' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-gray-800">Categorias y botones</p>
                <p className="text-[11px] text-gray-400 font-medium">Controla los chips del catalogo oficial.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!confirm('Restaurar las categorias por defecto? Esto reemplaza la configuracion actual.')) return;
                  saveStoreChips(DEFAULT_STORE_CHIPS);
                }}
                className="px-3 py-1.5 rounded-full bg-gray-100 text-[11px] font-black text-gray-500"
              >
                Restaurar
              </button>
            </div>

            <div className="space-y-2">
              {!storeChipsLoaded ? (
                [1, 2, 3].map(n => (
                  <div key={n} className="h-[50px] rounded-xl border border-gray-100 bg-gray-50 animate-pulse" />
                ))
              ) : storeChips.map((chip, idx) => (
                <div key={chip.id} className="grid grid-cols-[1fr_76px_34px_34px] gap-2 items-center rounded-xl border border-gray-100 bg-gray-50 p-2">
                  <input
                    value={chip.label}
                    onChange={e => {
                      const nextLabel = e.target.value;
                      const next = storeChips.map((c, i) => {
                        if (i !== idx) return c;
                        if (c.kind === 'discount') return { ...c, label: DISCOUNT_CATEGORY, value: DISCOUNT_CATEGORY };
                        const shouldMoveValue = c.id.startsWith('chip-') || c.value === c.label;
                        return { ...c, label: nextLabel, value: shouldMoveValue ? nextLabel : c.value };
                      });
                      setStoreChips(next);
                    }}
                    readOnly={chip.kind === 'discount'}
                    className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[12px] font-bold outline-none"
                  />
                  <select
                    value={chip.kind}
                    onChange={e => {
                      const next = storeChips.map((c, i) => i === idx ? { ...c, kind: (e.target.value === 'discount' ? 'discount' : 'category') as 'discount' | 'category', label: e.target.value === 'discount' ? DISCOUNT_CATEGORY : c.label, value: e.target.value === 'discount' ? DISCOUNT_CATEGORY : c.value } : c);
                      setStoreChips(next);
                      saveStoreChips(next);
                    }}
                    className="rounded-lg border border-gray-200 bg-white px-1.5 py-1.5 text-[11px] font-black outline-none"
                  >
                    <option value="category">Cat.</option>
                    <option value="discount">Desc.</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const next = storeChips.map((c, i) => i === idx ? { ...c, active: !c.active } : c);
                      saveStoreChips(next);
                    }}
                    className="h-8 rounded-lg text-[10px] font-black"
                    style={{ background: chip.active ? '#dcfce7' : '#fee2e2', color: chip.active ? '#16a34a' : '#dc2626' }}
                  >
                    {chip.active ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    title="Eliminar etiqueta"
                    onClick={() => {
                      if (!confirm(`Eliminar "${chip.label}"? Los productos existentes no se borran.`)) return;
                      saveStoreChips(storeChips.filter((_, i) => i !== idx));
                    }}
                    className="h-8 rounded-lg bg-red-50 text-red-500 text-[13px] font-black"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={!storeChipsLoaded}
              onClick={() => {
                const id = `chip-${Date.now()}`;
                const next = [...storeChips, { id, label: 'Nueva', value: 'Nueva', kind: 'category' as const, icon: '', active: true, sort: storeChips.length * 10 }];
                saveStoreChips(next);
              }}
              className="w-full h-10 rounded-xl border border-dashed border-pink-200 bg-pink-50 text-[12px] font-black text-[#ff2d78] disabled:opacity-50"
            >
              Agregar categoria
            </button>
            <button
              type="button"
              disabled={!storeChipsLoaded}
              onClick={() => saveStoreChips(storeChips)}
              className="w-full h-10 rounded-xl bg-[#ff2d78] text-[12px] font-black text-white shadow-sm disabled:opacity-50"
            >
              Guardar categorias
            </button>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Nota: las categorias de esta lista mandan en el catalogo y en crear/editar productos. Descuento muestra precio antes y precio final.
            </p>
          </div>
          )}

          {configTab === 'tienda' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-800">Publicar productos en redes</p>
                <p className="text-[11px] text-gray-400 font-medium">Cuando esta activo, los productos nuevos se envian a Buffer.</p>
              </div>
              <button
                type="button"
                onClick={() => saveSetting('buffer_publish_enabled', settings.buffer_publish_enabled === 'false' ? 'true' : 'false')}
                className="h-8 w-14 rounded-full p-1 transition-colors"
                style={{ background: settings.buffer_publish_enabled === 'false' ? '#e5e7eb' : BRAND }}
                aria-pressed={settings.buffer_publish_enabled !== 'false'}
              >
                <span
                  className="block h-6 w-6 rounded-full bg-white shadow-sm transition-transform"
                  style={{ transform: settings.buffer_publish_enabled === 'false' ? 'translateX(0)' : 'translateX(24px)' }}
                />
              </button>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Nombre tienda</label>
              <input type="text" value={settings.store_name || ''}
                onChange={e => saveSetting('store_name', e.target.value)}
                className="w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium outline-none focus:border-pink-400" />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">QR de pago</label>
              <input type="text" value={settings.payment_qr_url || '/qr-leidy-shop.jpg'}
                onChange={e => saveSetting('payment_qr_url', e.target.value)}
                placeholder="/qr-leidy-shop.jpg o URL de imagen"
                className="w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium outline-none focus:border-pink-400" />
              <label className="mt-2 flex h-10 items-center justify-center rounded-xl border border-dashed border-pink-200 bg-pink-50 text-[12px] font-black text-[#ff2d78] cursor-pointer">
                {qrUploading ? 'Subiendo QR...' : 'Subir imagen QR'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) void handleQrUpload(file);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              <p className="mt-1 text-[10px] text-gray-400 font-medium">Puedes subir una imagen, pegar una URL o dejar /qr-leidy-shop.jpg.</p>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Direccion</label>
              <textarea value={settings.address || ''}
                onChange={e => saveSetting('address', e.target.value)}
                rows={2}
                className="w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium outline-none focus:border-pink-400 resize-none" />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Nota de entregas</label>
              <textarea value={settings.delivery_note || ''}
                onChange={e => saveSetting('delivery_note', e.target.value)}
                rows={2}
                className="w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium outline-none focus:border-pink-400 resize-none" />
            </div>
          </div>
          )}

          {/* ─── Fechas de retiro disponibles ─── */}
          {configTab === 'retiros' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div>
              <p className="text-sm font-black text-gray-800">Fechas de retiro disponibles</p>
              <p className="text-[11px] text-gray-400 font-medium">Las clientas verán estas fechas en su perfil para elegir cuándo retirar.</p>
            </div>

            {pickupDates.length === 0 && (
              <p className="text-[12px] text-gray-400 font-bold py-2 text-center">Sin fechas configuradas</p>
            )}

            {pickupDates.map((pd, idx) => (
              <div key={idx} className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={pd.date}
                    onChange={e => {
                      const d = new Date(e.target.value + 'T12:00:00');
                      const label = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                      const next = pickupDates.map((x, i) => i === idx ? { ...x, date: e.target.value, label } : x);
                      setPickupDates(next);
                    }}
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[12px] font-bold outline-none"
                  />
                  <button
                    onClick={() => savePickupDates(pickupDates.filter((_, i) => i !== idx))}
                    className="w-8 h-8 rounded-lg bg-red-50 text-red-500 text-[15px] font-black flex items-center justify-center"
                  >×</button>
                </div>
                <div className="flex gap-2">
                  {['Mañana', 'Tarde', 'Noche'].map(slot => (
                    <button
                      key={slot}
                      onClick={() => {
                        const slots = pd.slots.includes(slot) ? pd.slots.filter(s => s !== slot) : [...pd.slots, slot];
                        const next = pickupDates.map((x, i) => i === idx ? { ...x, slots } : x);
                        setPickupDates(next);
                      }}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-black transition-colors"
                      style={{
                        background: pd.slots.includes(slot) ? '#ff2d78' : '#f3f4f6',
                        color: pd.slots.includes(slot) ? 'white' : '#6b7280',
                      }}
                    >{slot}</button>
                  ))}
                </div>
              </div>
            ))}

            <button
              onClick={() => setPickupDates(prev => [...prev, { date: '', label: 'Nueva fecha', slots: ['Tarde'] }])}
              className="w-full h-10 rounded-xl border border-dashed border-pink-200 bg-pink-50 text-[12px] font-black text-[#ff2d78]"
            >+ Agregar fecha</button>

            <button
              onClick={() => savePickupDates(pickupDates)}
              disabled={pickupSaving}
              className="w-full h-10 rounded-xl bg-[#ff2d78] text-[12px] font-black text-white shadow-sm disabled:opacity-50"
            >{pickupSaving ? 'Guardando...' : 'Guardar fechas'}</button>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
