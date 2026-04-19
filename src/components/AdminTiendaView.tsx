import React, { useState, useEffect, useRef } from 'react';
import {
  ExternalLink, Plus, Edit2, Trash2, Package, ShoppingBag,
  Check, X, Image as ImageIcon, ChevronDown, ChevronUp,
  CheckCircle, Clock, XCircle, Send, AlertCircle, RefreshCw,
} from 'lucide-react';

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
  customer_phone: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  wa_sent: boolean;
  created_at: string;
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
  const [saveError, setSaveError] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pRes, oRes] = await Promise.all([
        fetch('/api/products?admin=true', { headers: { 'x-user-id': userId } }),
        fetch('/api/store-orders', { headers: { Authorization: `Bearer ${authToken}` } }),
      ]);
      if (pRes.ok) setProducts(await pRes.json());
      if (oRes.ok) setOrders(await oRes.json());
    } catch (e) {
      console.error('Error cargando tienda:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const openNew = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setSaveError('');
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

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900">Mi Tienda</h2>
          <p className="text-xs text-gray-400 font-medium">Leydi American</p>
        </div>
        <a
          href="/tienda"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border transition-all hover:scale-105"
          style={{ borderColor: BRAND, color: BRAND, background: '#fff0f5' }}
        >
          <ExternalLink size={12} />
          Ver tienda
        </a>
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

              {/* Nombre */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Nombre *</label>
                <input
                  type="text"
                  placeholder="Ej. Blusa floral manga larga"
                  className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-pink-400"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              {/* Precio + Categoría */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Precio *</label>
                  <div className="relative mt-1">
                    <input
                      type="number"
                      placeholder="0"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 pr-9 text-sm font-medium outline-none focus:border-pink-400"
                      value={form.price}
                      onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400">Bs</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Categoría</label>
                  <select
                    className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-pink-400 bg-white"
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  >
                    {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Descripción</label>
                <textarea
                  placeholder="Describe el producto..."
                  rows={2}
                  className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-pink-400 resize-none"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Tallas */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">Tallas</label>
                <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                  {TALLAS_COMUNES.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => form.sizes.includes(t) ? removeTalla(t) : addTalla(t)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-black transition-all"
                      style={form.sizes.includes(t)
                        ? { background: BRAND, color: 'white' }
                        : { background: '#f5f5f5', color: '#888' }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Talla personalizada + Enter"
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium outline-none focus:border-pink-400"
                    value={talla}
                    onChange={e => setTalla(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTalla(talla); } }}
                  />
                  <button type="button" onClick={() => addTalla(talla)}
                    className="px-3 py-2 rounded-xl font-black text-white text-sm flex-shrink-0"
                    style={{ background: BRAND }}
                  >+</button>
                </div>
                {form.sizes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.sizes.map(s => (
                      <span key={s} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black text-white" style={{ background: BRAND }}>
                        {s}
                        <button type="button" onClick={() => removeTalla(s)} className="opacity-70 hover:opacity-100">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Fotos por URL */}
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">
                  Fotos por URL ({form.images.length}/5)
                </label>
                <p className="text-[10px] text-gray-400 ml-1 mb-1">
                  Pega el enlace de una imagen (Pinterest, Instagram, etc.)
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://..."
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium outline-none focus:border-pink-400"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addImageUrl(); } }}
                  />
                  <button
                    type="button"
                    onClick={addImageUrl}
                    disabled={!urlInput.trim() || form.images.length >= 5}
                    className="px-3 py-2 rounded-xl font-black text-white text-sm flex-shrink-0 disabled:opacity-40"
                    style={{ background: BRAND }}
                  >
                    +
                  </button>
                </div>

                {/* Miniaturas */}
                {form.images.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-2">
                    {form.images.map((img, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={img}
                          alt=""
                          className="w-16 h-16 rounded-xl object-cover border-2"
                          style={{ borderColor: idx === 0 ? BRAND : '#e5e7eb' }}
                          onError={e => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64?text=Error'; }}
                        />
                        {idx === 0 && (
                          <span className="absolute -top-1.5 left-0 right-0 text-center text-[8px] font-black" style={{ color: BRAND }}>
                            principal
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Toggle disponible */}
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, available: !f.available }))}
                className="flex items-center gap-2.5"
              >
                <div
                  className="w-10 h-5 rounded-full transition-all flex items-center px-0.5"
                  style={{ background: form.available ? BRAND : '#e5e7eb' }}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-white shadow-sm transition-all"
                    style={{ transform: form.available ? 'translateX(20px)' : 'translateX(0)' }}
                  />
                </div>
                <span className="text-sm font-bold text-gray-700">
                  {form.available ? '✓ Disponible en tienda' : '✗ Oculto (no disponible)'}
                </span>
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
                      <span
                        className="flex-shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full text-white"
                        style={{ background: p.available ? '#10b981' : '#9ca3af' }}
                      >
                        {p.available ? 'Activo' : 'Oculto'}
                      </span>
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
        <div className="space-y-2">
          <button onClick={loadAll} className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-gray-100 text-gray-600 text-sm font-bold">
            <RefreshCw size={14} /> Actualizar pedidos
          </button>

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
          ) : (
            orders.map(order => {
              const statusConfig = {
                pending:   { label: 'Pendiente',  bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
                confirmed: { label: 'Confirmado', bg: '#d1fae5', text: '#065f46', dot: '#10b981' },
                cancelled: { label: 'Cancelado',  bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
              };
              const cfg = statusConfig[order.status];
              const isExpanded = expandedOrder === order.id;

              return (
                <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <button
                    onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                    className="w-full p-3 flex items-start gap-3 text-left"
                  >
                    <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{ background: cfg.dot }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-sm font-black text-gray-800">Pedido #{order.id}</p>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.text }}>
                          {cfg.label}
                        </span>
                        {order.wa_sent && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-green-50 text-green-600 flex items-center gap-0.5">
                            <Send size={9} /> WA enviado
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 font-medium">
                        {new Date(order.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[13px] font-black" style={{ color: BRAND }}>{Number(order.total).toFixed(2)} Bs</p>
                        <span className="text-[11px] text-gray-400">{order.items.length} prod.</span>
                        {order.customer_name && <span className="text-[11px] text-gray-500">· {order.customer_name}</span>}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-gray-50 pt-2 space-y-3">
                      <div className="space-y-1">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[12px]">
                            <span className="text-gray-700 flex-1 truncate">
                              {item.productName}
                              {item.size && <span className="text-gray-400"> · {item.size}</span>}
                              <span className="text-gray-400"> ×{item.quantity}</span>
                            </span>
                            <span className="font-black text-gray-800 ml-2 flex-shrink-0">
                              {(item.price * item.quantity).toFixed(2)} Bs
                            </span>
                          </div>
                        ))}
                      </div>
                      {order.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => updateOrder(order.id, { status: 'confirmed' })}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl font-black text-[12px] bg-green-50 text-green-700">
                            <Check size={13} /> Confirmar
                          </button>
                          <button onClick={() => updateOrder(order.id, { status: 'cancelled' })}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl font-black text-[12px] bg-red-50 text-red-600">
                            <X size={13} /> Cancelar
                          </button>
                          {!order.wa_sent && (
                            <button onClick={() => updateOrder(order.id, { wa_sent: true })}
                              className="px-3 py-2 rounded-xl font-black text-[12px] bg-green-50 text-green-700">
                              <Send size={13} />
                            </button>
                          )}
                        </div>
                      )}
                      {order.status === 'confirmed' && (
                        <button onClick={() => updateOrder(order.id, { status: 'cancelled' })}
                          className="w-full py-2 rounded-xl font-black text-[12px] bg-red-50 text-red-600">
                          Cancelar pedido
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
