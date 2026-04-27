import React, { useState, useEffect, useRef } from 'react';
import {
  ExternalLink, Plus, Edit2, Trash2, Package, ShoppingBag,
  Check, X, Image as ImageIcon, ChevronDown, ChevronUp,
  Send, AlertCircle, RefreshCw, Camera, Loader2, Copy,
} from 'lucide-react';

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
  priority_order: number;
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
}

const CATEGORIAS = ['General', 'Blusas', 'Vestidos', 'Chaquetas', 'Conjuntos', 'Accesorios', 'Pantalones', 'Faldas'];
const TALLAS_COMUNES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '34', '36', '38', '40', '42', 'Único'];
const BRAND = '#ff2d78';

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
  description: '',
  category: 'General',
  sizes: [] as string[],
  images: [] as string[],
  available: true,
};

export function AdminTiendaView({ userId, authToken }: { userId: string; authToken: string }) {
  const [subTab, setSubTab] = useState<'productos' | 'pedidos'>('productos');
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [talla, setTalla] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [aiError, setAiError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'paid' | 'cancelled'>('all');
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-refresco de pedidos cada 15 segundos cuando se está en la pestaña
  useEffect(() => {
    if (subTab !== 'pedidos') return;
    const interval = setInterval(() => loadOrders(), 15000);
    return () => clearInterval(interval);
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
        body: JSON.stringify({ imageUrls: form.images }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setAiError(json.error || 'No se pudo analizar las imágenes.');
        setAiStatus('error');
        return;
      }

      const ai = json.data;

      // Mapear categoría contra las opciones disponibles
      const catMatch = CATEGORIAS.includes(ai.categoria) ? ai.categoria : 'General';

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

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pRes, oRes] = await Promise.all([
        fetch('/api/products?admin=true', { headers: { 'x-user-id': userId } }),
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

  const verifyOrderManual = async (orderId: number) => {
    setVerifyingId(orderId);
    try {
      const res = await fetch(`/api/store/verify-order/${orderId}`, {
        method: 'POST',
        headers: { 'x-user-id': userId, Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) await loadOrders(true);
      else { const e = await res.json(); alert(e.error || 'Error al verificar'); }
    } catch (e) { console.error(e); }
    finally { setVerifyingId(null); }
  };

  useEffect(() => { loadAll(); }, []);

  const openNew = () => {
    setForm({ ...EMPTY_FORM });
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
    setForm({
      name: p.name,
      price: String(p.price),
      description: p.description ?? '',
      category: p.category,
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

  const handleSave = async () => {
    if (!form.name.trim() || !form.price) return;
    setSaving(true);
    setSaveError('');
    try {
      const body = {
        name: form.name.trim(),
        price: Number(form.price),
        description: form.description.trim(),
        category: form.category,
        sizes: form.sizes,
        image_url: form.images[0] ?? '',
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
      setForm({ ...EMPTY_FORM });
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

  const updateOrder = async (id: number, body: object) => {
    const res = await fetch(`/api/store-orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(body),
    });
    if (res.ok) await loadAll();
  };

  const [copied, setCopied] = useState(false);
  const storeUrl = `${window.location.origin}/tienda`;
  const handleCopy = () => {
    navigator.clipboard.writeText(storeUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900">Panel de Tienda</h2>
          <p className="text-xs text-gray-400 font-medium">Leydi American</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-black border transition-all"
            style={{ borderColor: '#e5e7eb', color: copied ? '#10b981' : '#9ca3af', background: 'white' }}
            title="Copiar link de tienda"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
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
      </div>

      {/* ─── PRODUCTOS ─── */}
      {subTab === 'productos' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={showForm ? () => { setShowForm(false); setEditingId(null); } : openNew}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-black text-sm text-white transition-all active:scale-[0.98]"
              style={{ background: showForm ? '#6b7280' : `linear-gradient(135deg, ${BRAND}, #ff6fa3)` }}
            >
              {showForm ? <X size={15} /> : <Plus size={15} />}
              {showForm ? 'Cancelar' : 'Nuevo Producto'}
            </button>
            <button
              onClick={loadAll}
              className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <RefreshCw size={15} />
            </button>
          </div>

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
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                  1. Sube fotos ({form.images.length}/{MAX_PHOTOS})
                </label>
                
                <div className="flex gap-2 flex-wrap">
                  {form.images.map((img, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border-2" style={{ borderColor: idx === 0 ? BRAND : '#e5e7eb' }}>
                      <img src={img} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeImage(idx)} className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center shadow">
                        <X size={8} />
                      </button>
                    </div>
                  ))}

                  {form.images.length < MAX_PHOTOS && (
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={compressing} className="w-16 h-16 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-50" style={{ borderColor: BRAND, background: 'white' }}>
                      {compressing ? <Loader2 size={16} className="animate-spin" style={{ color: BRAND }} /> : <Camera size={16} style={{ color: BRAND }} />}
                    </button>
                  )}
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />

                {/* Botón IA */}
                <button
                  type="button"
                  onClick={handleAiFill}
                  disabled={form.images.length === 0 || aiStatus === 'loading' || compressing}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl font-black text-[13px] transition-all disabled:opacity-50"
                  style={form.images.length === 0 || aiStatus === 'loading'
                    ? { background: '#e5e7eb', color: '#9ca3af' }
                    : { background: 'linear-gradient(135deg, #a855f7, #ec4899)', color: 'white', boxShadow: '0 2px 8px rgba(168,85,247,0.3)' }
                  }
                >
                  {aiStatus === 'loading' ? <><Loader2 size={14} className="animate-spin" /> Analizando...</> : <><span>✨</span> 2. Rellenar con IA</>}
                </button>
                {aiStatus === 'success' && <p className="text-[10px] font-bold text-green-600 text-center">¡Listo! Revisa los datos abajo ↓</p>}
                {aiStatus === 'error' && <p className="text-[10px] font-bold text-red-500 text-center">{aiError}</p>}
              </div>

              {/* 2. Datos del Producto */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase">Nombre *</label>
                  <input type="text" className="w-full mt-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] font-medium outline-none focus:border-pink-400" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">Precio (Bs)*</label>
                  <input type="number" className="w-full mt-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] font-medium outline-none focus:border-pink-400" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">Categoría</label>
                  <select className="w-full mt-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[12px] font-medium outline-none bg-white" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">Tallas</label>
                  <div className="mt-1 flex items-center">
                    <input type="text" placeholder="Ej: S, M" className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-[12px] font-medium outline-none" value={form.sizes.join(', ')} onChange={e => setForm(f => ({ ...f, sizes: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) }))} />
                  </div>
                </div>
              </div>

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

          {/* Lista */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(n => <div key={n} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-black text-sm">Sin productos aún</p>
              <p className="text-xs mt-1">Crea tu primer producto arriba</p>
            </div>
          ) : (
            <div className="space-y-2">
              {products.map(p => (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex gap-3">
                  {/* Foto */}
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 border border-gray-100">
                    {p.images?.[0] || p.image_url ? (
                      <img src={p.images?.[0] || p.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={20} className="text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-1 mb-0.5">
                      <p className="font-black text-sm text-gray-900 leading-tight flex-1 truncate">{p.name}</p>
                      {(() => {
                        const isReserved = orders.some(o => o.status === 'pending' && o.items.some(i => String(i.productId) === String(p.id)));
                        if (isReserved) {
                          return <span className="flex-shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full text-white bg-blue-500">Reservado</span>;
                        }
                        return (
                          <span
                            className="flex-shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full text-white"
                            style={{ background: p.available ? '#10b981' : '#9ca3af' }}
                          >
                            {p.available ? 'Activo' : 'Oculto'}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[10px] font-black px-2 py-0.5 rounded-full text-white"
                        style={{ background: catColor(p.category) }}
                      >
                        {p.category}
                      </span>
                      <span className="text-sm font-black" style={{ color: BRAND }}>{p.price} Bs</span>
                    </div>
                    {p.sizes?.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {p.sizes.map(s => (
                          <span key={s} className="text-[9px] font-black bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{s}</span>
                        ))}
                      </div>
                    )}
                    {p.images?.length > 1 && (
                      <p className="text-[10px] text-blue-500 font-bold mt-0.5">{p.images.length} fotos</p>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
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
                          method: 'PUT',
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
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── PEDIDOS ─── */}
      {subTab === 'pedidos' && (
        <div className="space-y-3">

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
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.text }}>
                          {cfg.label}
                        </span>
                        {isExpired && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-50 text-red-500">EXPIRADO</span>}
                      </div>
                      <p className="text-[11px] text-gray-400">
                        {new Date(order.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {order.customer_wa && <span className="ml-1 text-gray-500">· {order.customer_wa}</span>}
                      </p>
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

                      {/* Acciones según estado */}
                      {order.status === 'pending' && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => verifyOrderManual(order.id)}
                            disabled={verifyingId === order.id}
                            className="col-span-2 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-black text-[12px] text-white shadow-md disabled:opacity-60"
                            style={{ background: '#10b981' }}>
                            {verifyingId === order.id ? '...' : '✅ Verificar Pago Manualmente'}
                          </button>
                          <button onClick={() => updateOrder(order.id, { status: 'confirmed', hideProducts: true })}
                            className="flex items-center justify-center gap-1 py-2 rounded-xl font-black text-[11px] text-white" style={{ background: BRAND }}>
                            <Check size={12} /> Vendido + Ocultar
                          </button>
                          <button onClick={() => updateOrder(order.id, { status: 'cancelled' })}
                            className="flex items-center justify-center gap-1 py-2 rounded-xl font-black text-[11px] bg-red-50 text-red-600">
                            <X size={12} /> Cancelar
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
    </div>
  );
}
