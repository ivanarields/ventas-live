import React, { useEffect, useState } from 'react';
import { storeAuth } from '../services/storeAuth';
import { Product } from '../services/productsApi';
import { storeFavoritesApi } from '../services/storeFavoritesApi';
import { getStoreSettings } from '../services/storeSettingsApi';
import { ProductThumb } from './ProductThumb';

const BRAND = '#ff2d78';

interface StoreOrder {
  id: number;
  items: Array<{ productName: string; price: number; size: string; quantity: number }>;
  total: number;
  status: 'pending' | 'paid' | 'ready' | 'delivered' | 'cancelled';
  payment_verified_at: string | null;
  created_at: string;
  customer_wa: string;
  customer_selection: { confirmed?: boolean; confirmed_at?: string; confirmed_by?: string } | null;
}

interface Props {
  onBack: () => void;
  onLogout: () => void;
  onProductSelect?: (product: Product) => void;
  onOpenCart?: () => void;
  initialTab?: Tab;
}

type Tab = 'saved' | 'orders' | 'entrega' | 'confirmar' | 'settings';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Esperando pago',
  paid: 'Pago verificado',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export function StoreProfile({ onBack, onLogout, onProductSelect, onOpenCart, initialTab }: Props) {
  const [user, setUser] = useState<{ phone: string; name: string } | null>(null);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'orders');
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  const [pickupDates, setPickupDates] = useState<Array<{ date: string; label: string; slots: string[] }>>([]);
  const [selectedPickup, setSelectedPickup] = useState<{ date: string; slot: string } | null>(null);
  const [wantsOtherDate, setWantsOtherDate] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [deliverySaved, setDeliverySaved] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [storePhone, setStorePhone] = useState('59160003230');

  useEffect(() => {
    const session = storeAuth.getCurrentUserSync();
    if (!session) { setLoading(false); return; }
    setUser({ phone: session.phone, name: session.name ?? '' });
    loadProfile(session.token);
  }, []);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const loadProfile = async (token: string) => {
    setLoading(true);
    try {
      // Todas las llamadas son independientes → corren en paralelo (~0.9s vs ~1.8s secuencial)
      const [phoneData, , meRes, pdRes] = await Promise.all([
        getStoreSettings().catch(() => null),
        storeFavoritesApi.syncLocal(),
        fetch('/api/store-auth/me', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/store/pickup-dates'),
      ]);

      const num = String((phoneData as any)?.official_wa_number || (phoneData as any)?.store_phone || '').replace(/\D/g, '');
      if (num) setStorePhone(num);

      if (meRes.ok) {
        const data = await meRes.json();
        setOrders(data.orders ?? []);
        setFavorites(data.favorites ?? []);
        storeFavoritesApi.saveLocal(Object.fromEntries((data.favorites ?? []).map((p: Product) => [String(p.id), p])));
      }

      if (pdRes.ok) {
        const pdData = await pdRes.json();
        setPickupDates(pdData.dates ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  const removeFavorite = async (product: Product) => {
    const next = await storeFavoritesApi.set(product, false);
    setFavorites(next);
  };

  const handleLogout = () => {
    storeAuth.logout();
    setUser(null);
    onLogout();
  };

  const handleProfileAuth = async () => {
    setAuthError('');
    const cleanPhone = phoneInput.replace(/\D/g, '');
    if (cleanPhone.length < 8) return setAuthError('Ingresa tu WhatsApp.');
    if (pinInput.length !== 4) return setAuthError('El PIN debe tener 4 digitos.');
    setLoading(true);
    try {
      let loginRes = await fetch('/api/store-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, pin: pinInput }),
      });
      let loginData = await loginRes.json();
      if (!loginRes.ok) {
        const regRes = await fetch('/api/store-auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanPhone, pin: pinInput }),
        });
        const regData = await regRes.json();
        if (regRes.status === 409) throw new Error('PIN incorrecto para este numero.');
        if (!regRes.ok) throw new Error(regData.error || 'No se pudo crear tu perfil.');
        loginRes = await fetch('/api/store-auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanPhone, pin: pinInput }),
        });
        loginData = await loginRes.json();
      }
      if (!loginRes.ok || !loginData.session?.access_token) throw new Error(loginData.error || 'No se pudo ingresar.');
      storeAuth.saveSession(loginData.session.access_token, { id: loginData.user.id, phone: cleanPhone, name: '' }, loginData.session);
      setUser({ phone: cleanPhone, name: '' });
      await loadProfile(loginData.session.access_token);
    } catch (err: any) {
      setAuthError(err?.message || 'Error al ingresar.');
      setLoading(false);
    }
  };

  const handleSaveDelivery = async () => {
    const session = storeAuth.getCurrentUserSync();
    if (!session || !nextOrder) return;
    if (!selectedPickup && !(customDate && customTime)) return;
    setDeliverySaving(true);
    try {
      const res = await fetch(`/api/store-orders/${nextOrder.id}/set-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          delivery_date: selectedPickup?.date ?? customDate,
          delivery_slot: selectedPickup?.slot ?? customTime,
        }),
      });
      if (!res.ok) throw new Error('No se pudo guardar la fecha de retiro.');
      setDeliverySaved(true);
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo guardar la fecha de retiro.');
    } finally {
      setDeliverySaving(false);
    }
  };

  const handleCustomerConfirm = async (orderId: number) => {
    const session = storeAuth.getCurrentUserSync();
    if (!session) return;
    setConfirmLoading(true);
    try {
      const res = await fetch(`/api/store-orders/${orderId}/customer-confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) throw new Error('No se pudo confirmar el pedido.');
      setConfirmDone(true);
      await loadProfile(session.token);
    } catch (err: any) {
      setAuthError(err?.message || 'No se pudo confirmar el pedido.');
    } finally {
      setConfirmLoading(false);
    }
  };

  const activeOrders = orders.filter(order => order.status !== 'cancelled');
  const totalSpent = activeOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const nextOrder = activeOrders[0];

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'orders', label: 'Pedidos' },
    { id: 'saved', label: 'Favoritos' },
    { id: 'confirmar', label: 'Confirmar' },
    { id: 'entrega', label: 'Entrega' },
    { id: 'settings', label: 'Ajustes' },
  ];

  if (!user) {
    return (
      <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#ffe6ef] via-[#fffbfd] to-white">
        <header className="px-5 py-4 flex items-center gap-3">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-white/70 flex items-center justify-center shadow-sm" aria-label="Volver">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div>
            <h1 className="text-[18px] font-black text-gray-800">Mi perfil</h1>
            <p className="text-[11px] text-gray-400 font-bold">WhatsApp y PIN para entrar</p>
          </div>
        </header>
        <main className="flex-1 px-5 pt-8">
          <div className="rounded-[28px] bg-white/82 border border-white/70 shadow-sm p-5 space-y-4">
            <div>
              <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider">WhatsApp</label>
              <div className="mt-2 flex items-center border border-gray-200 rounded-2xl overflow-hidden bg-white">
                <span className="px-3 py-3.5 text-[13px] font-black text-gray-400 bg-gray-50 border-r border-gray-200">+591</span>
                <input value={phoneInput} onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" className="flex-1 px-3 py-3.5 text-[15px] font-bold outline-none" placeholder="60001234" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider">PIN de 4 digitos</label>
              <input value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" type="password" className="mt-2 w-full px-4 py-3.5 border border-gray-200 rounded-2xl text-[20px] font-black text-center tracking-[0.55em] outline-none" placeholder="••••" />
              <p className="mt-2 text-[11px] text-gray-400 font-bold">Si eres nueva, este PIN queda guardado.</p>
            </div>
            {authError && <p className="rounded-2xl bg-red-50 px-3 py-2 text-[12px] font-bold text-red-600">{authError}</p>}
            <button onClick={handleProfileAuth} disabled={loading || phoneInput.length < 8 || pinInput.length !== 4} className="w-full h-12 rounded-2xl bg-[#ff2d78] text-white text-[14px] font-black disabled:opacity-40">
              {loading ? 'Entrando...' : 'Entrar a mi perfil'}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#fdf5f7]">
      <header className="bg-white px-5 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-50" aria-label="Volver">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button onClick={handleLogout} className="text-[11px] font-black text-gray-400 hover:text-red-500 transition-colors">
            Cerrar sesion
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md flex-shrink-0 text-white font-black text-[18px]"
            style={{ background: 'linear-gradient(135deg, #ff2d78, #ff6fa3)' }}>
            LA
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[18px] font-black text-gray-800 leading-tight">Mi perfil</h1>
            <p className="text-[12px] text-gray-400 font-bold">+591 {user?.phone}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          {[
            { label: 'Favoritos', value: favorites.length },
            { label: 'Pedidos', value: activeOrders.length },
            { label: 'Total Bs', value: totalSpent.toFixed(0) },
          ].map(item => (
            <div key={item.label} className="bg-gray-50 rounded-2xl p-2.5 text-center">
              <p className="text-[18px] font-black text-[#ff2d78]">{item.value}</p>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-4 overflow-x-auto scrollbar-hide">
          {tabs.map(item => (
            <button key={item.id} onClick={() => setTab(item.id)} className="relative flex-shrink-0 py-2 text-[10px] font-black uppercase tracking-[0.08em]" style={{ color: tab === item.id ? BRAND : '#9ca3af' }}>
              {item.label}
              {tab === item.id && <span className="absolute left-0 right-0 -bottom-0.5 h-0.5 rounded-full bg-[#ff2d78]" />}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(n => <div key={n} className="h-24 rounded-3xl bg-white animate-pulse" />)}
          </div>
        ) : tab === 'saved' ? (
          <section className="space-y-3">
            {favorites.length === 0 ? (
              <EmptyState title="Sin favoritos todavia" text="Marca prendas con corazon para encontrarlas aqui." />
            ) : favorites.map(product => (
              <div key={product.id} className="rounded-3xl bg-white border border-gray-100 shadow-sm p-3 flex gap-3">
                <button onClick={() => onProductSelect?.(product)} className="w-20 h-24 rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0">
                  <ProductThumb image={product.images[0]} className="w-full h-full object-cover" width={80} height={96} />
                </button>
                <div className="min-w-0 flex-1 py-1">
                  <p className="text-[13px] font-black text-gray-800 leading-snug line-clamp-2">{product.title}</p>
                  <p className="text-[11px] text-gray-400 font-bold mt-0.5">{product.category}</p>
                  <p className="text-[15px] font-black text-[#ff2d78] mt-2">{product.price.toFixed(2)} Bs</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => onProductSelect?.(product)} className="px-3 py-2 rounded-full bg-[#ff2d78] text-white text-[11px] font-black">Comprar</button>
                  <button onClick={() => removeFavorite(product)} className="w-9 h-9 rounded-full bg-[#fff0f5] text-[#ff2d78] flex items-center justify-center self-end" aria-label="Quitar favorito">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </section>
        ) : tab === 'orders' ? (
          <section className="space-y-3">
            {orders.length === 0 ? (
              <EmptyState title="Sin pedidos" text="Tus compras apareceran aqui." />
            ) : orders.map(order => (
              <div key={order.id} className="rounded-3xl bg-white border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-black text-gray-800">Pedido #{order.id}</p>
                    <p className="text-[11px] text-gray-400 font-bold">{new Date(order.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</p>
                  </div>
                  <p className="text-[15px] font-black text-[#ff2d78]">{Number(order.total).toFixed(2)} Bs</p>
                </div>
                <div className="mt-3 rounded-2xl bg-gray-50 p-3 space-y-1">
                  {(order.items ?? []).slice(0, 3).map((item, idx) => (
                    <p key={idx} className="text-[11px] font-bold text-gray-600 truncate">{item.productName} {item.size ? `(${item.size})` : ''}</p>
                  ))}
                </div>
                <span className="inline-block mt-3 rounded-full bg-[#fff0f5] px-3 py-1 text-[10px] font-black text-[#ff2d78]">
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>
            ))}
          </section>
        ) : tab === 'entrega' ? (
          <section className="space-y-3">
            {deliverySaved ? (
              <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-5 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-green-50 text-green-500 flex items-center justify-center mx-auto">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p className="text-[15px] font-black text-gray-800">¡Fecha guardada!</p>
                <p className="text-[12px] text-gray-400 font-bold">
                  {selectedPickup
                    ? `${pickupDates.find(d => d.date === selectedPickup.date)?.label ?? selectedPickup.date} — ${selectedPickup.slot}`
                    : `${customDate} a las ${customTime}`}
                </p>
              </div>
            ) : (
              <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-4 space-y-4">
                <div>
                  <p className="text-[15px] font-black text-gray-800">¿Cuándo retirás tu pedido?</p>
                  <p className="text-[12px] text-gray-400 font-bold">Elegí una de las fechas disponibles o pedí otro día.</p>
                </div>

                {pickupDates.length === 0 ? (
                  <p className="text-[12px] text-gray-400 font-bold py-2 text-center">Pronto habrá fechas disponibles.</p>
                ) : (
                  <div className="space-y-2">
                    {pickupDates.flatMap(pd =>
                      pd.slots.map(slot => ({
                        key: `${pd.date}-${slot}`,
                        date: pd.date,
                        label: pd.label,
                        slot,
                      }))
                    ).map(option => {
                      const isSelected = !wantsOtherDate && selectedPickup?.date === option.date && selectedPickup?.slot === option.slot;
                      return (
                        <button
                          key={option.key}
                          onClick={() => { setSelectedPickup({ date: option.date, slot: option.slot }); setWantsOtherDate(false); }}
                          className="w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors"
                          style={{
                            borderColor: isSelected ? '#ff2d78' : '#e5e7eb',
                            background: isSelected ? '#fff0f5' : 'white',
                          }}
                        >
                          <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                            style={{ borderColor: isSelected ? '#ff2d78' : '#d1d5db' }}>
                            {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-[#ff2d78]" />}
                          </div>
                          <div>
                            <p className="text-[13px] font-black text-gray-800 capitalize">{option.label}</p>
                            <p className="text-[11px] font-bold text-gray-400">{option.slot}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <button
                  onClick={() => { setWantsOtherDate(true); setSelectedPickup(null); }}
                  className="w-full py-3 rounded-2xl border-2 text-[13px] font-black transition-colors"
                  style={{
                    borderColor: wantsOtherDate ? '#ff2d78' : '#e5e7eb',
                    color: wantsOtherDate ? '#ff2d78' : '#6b7280',
                    background: wantsOtherDate ? '#fff0f5' : 'white',
                  }}
                >
                  📅 Quiero otro día
                </button>

                {wantsOtherDate && (
                  <div className="space-y-3 rounded-2xl bg-gray-50 p-3">
                    <div>
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Fecha</label>
                      <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
                        className="w-full mt-1 h-11 rounded-xl border border-gray-200 bg-white px-3 text-[13px] font-bold outline-none" />
                    </div>
                    <div>
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Hora aproximada</label>
                      <input type="time" value={customTime} onChange={e => setCustomTime(e.target.value)}
                        className="w-full mt-1 h-11 rounded-xl border border-gray-200 bg-white px-3 text-[13px] font-bold outline-none" />
                    </div>
                    {customDate && customTime && (
                      <button
                        onClick={() => {
                          const dateLabel = new Date(customDate + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                          const msg = encodeURIComponent(`Hola! Soy clienta de la tienda y quiero retirar mi pedido${nextOrder ? ` #${nextOrder.id}` : ''} el ${dateLabel} a las ${customTime}. ¿Está disponible esa fecha?`);
                          window.open(`https://wa.me/${storePhone}?text=${msg}`, '_blank');
                        }}
                        className="w-full h-12 rounded-2xl font-black text-[13px] text-white flex items-center justify-center gap-2"
                        style={{ background: '#25D366' }}
                      >
                        <span>💬</span> Avisarle a Leidy Shop
                      </button>
                    )}
                  </div>
                )}

                {selectedPickup && !wantsOtherDate && (
                  <button
                    onClick={handleSaveDelivery}
                    disabled={deliverySaving}
                    className="w-full h-12 rounded-2xl text-white font-black text-[14px] disabled:opacity-50 active:scale-95 transition-all"
                    style={{ background: 'linear-gradient(135deg, #ff2d78, #ff6fa3)' }}
                  >
                    {deliverySaving ? 'Guardando...' : 'Confirmar fecha de retiro'}
                  </button>
                )}
              </div>
            )}
          </section>
        ) : tab === 'confirmar' ? (
          <section className="space-y-3">
            {!nextOrder ? (
              <EmptyState title="Sin pedidos activos" text="Cuando tengas un pedido pendiente aparecerá aquí para que puedas confirmarlo." />
            ) : nextOrder.customer_selection?.confirmed ? (
              <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-5 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-green-50 text-green-500 flex items-center justify-center mx-auto">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p className="text-[16px] font-black text-gray-800">¡Prendas confirmadas!</p>
                <p className="text-[12px] text-gray-400 font-bold">
                  Confirmaste tu pedido #{nextOrder.id}. Ya estamos preparando todo para vos.
                </p>
                <span className="inline-block rounded-full bg-green-50 px-4 py-1.5 text-[11px] font-black text-green-600">
                  ✓ Confirmado por ti
                </span>
              </div>
            ) : (
              <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-4 space-y-4">
                <div>
                  <p className="text-[15px] font-black text-gray-800">Confirmá tus prendas</p>
                  <p className="text-[12px] text-gray-400 font-bold">Pedido #{nextOrder.id} · {Number(nextOrder.total).toFixed(2)} Bs</p>
                </div>
                <div className="space-y-2">
                  {(nextOrder.items ?? []).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 rounded-2xl bg-[#fff0f5] p-3">
                      <div className="w-8 h-8 rounded-xl bg-[#ff2d78]/10 flex items-center justify-center flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff2d78" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-black text-gray-800 truncate">{item.productName}</p>
                        {item.size && <p className="text-[11px] font-bold text-gray-400">Talla: {item.size}</p>}
                      </div>
                      <p className="text-[13px] font-black text-[#ff2d78] flex-shrink-0">{item.price.toFixed(2)} Bs</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 font-bold text-center">¿Estas prendas son correctas?</p>
                <button
                  onClick={() => handleCustomerConfirm(nextOrder.id)}
                  disabled={confirmLoading || confirmDone}
                  className="w-full h-[52px] rounded-2xl text-white font-black text-[14px] shadow-lg disabled:opacity-50 transition-all active:scale-95"
                  style={{ background: `linear-gradient(135deg, ${BRAND}, #ff6fa3)` }}
                >
                  {confirmLoading ? 'Guardando...' : confirmDone ? '✓ Confirmado' : '✓ Confirmar mis prendas'}
                </button>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-3">
            <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-4">
              <p className="text-[13px] font-black text-gray-800">Numero de WhatsApp</p>
              <p className="text-[13px] text-gray-500 font-bold mt-1">+591 {user?.phone}</p>
            </div>
            <button onClick={handleLogout} className="w-full h-12 rounded-2xl bg-gray-100 text-gray-500 font-black text-[13px]">Cerrar sesion</button>
          </section>
        )}
      </main>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-8 text-center">
      <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-[#fff0f5] text-[#ff2d78] flex items-center justify-center">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </div>
      <p className="text-[15px] font-black text-gray-800">{title}</p>
      <p className="mt-1 text-[12px] text-gray-400 font-bold">{text}</p>
    </div>
  );
}
