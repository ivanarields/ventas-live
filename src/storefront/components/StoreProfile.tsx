import React, { useState, useEffect } from 'react';
import { storeAuth } from '../services/storeAuth';

const BRAND = '#ff2d78';
const WA_BIZ = '59160003230'; // Cambiar al número real

interface StoreOrder {
  id: number;
  items: Array<{ productName: string; price: number; size: string; quantity: number }>;
  total: number;
  status: 'pending' | 'paid' | 'ready' | 'delivered' | 'cancelled';
  payment_verified_at: string | null;
  created_at: string;
  customer_wa: string;
}

interface Props {
  onBack: () => void;
  onLogout: () => void;
}

const STATUS = {
  pending:   { label: 'Esperando pago',  icon: '⏳', bg: '#e0f2fe', text: '#0369a1' },
  paid:      { label: 'Pago verificado', icon: '✅', bg: '#d1fae5', text: '#065f46' },
  ready:     { label: 'Listo para entrega', icon: '📦', bg: '#ede9fe', text: '#6d28d9' },
  delivered: { label: 'Entregado',       icon: '🎉', bg: '#f0fdf4', text: '#166534' },
  cancelled: { label: 'Cancelado',       icon: '❌', bg: '#f3f4f6', text: '#6b7280' },
};

export function StoreProfile({ onBack, onLogout }: Props) {
  const [user, setUser] = useState<{ phone: string; name: string } | null>(null);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const session = storeAuth.getCurrentUserSync();
    if (!session) { onBack(); return; }

    setUser({ phone: session.phone, name: session.name ?? '' });
    loadOrders(session.token);
  }, []);

  const loadOrders = async (token: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/store-auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Sesión expirada');
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    storeAuth.logout();
    onLogout();
  };

  const totalGastado = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + Number(o.total), 0);

  const session = storeAuth.getCurrentUserSync();

  return (
    <div className="flex flex-col min-h-screen bg-[#fdf5f7]">
      {/* Header */}
      <div className="bg-white px-5 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-50">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button onClick={handleLogout}
            className="text-[11px] font-black text-gray-400 hover:text-red-500 transition-colors">
            Cerrar sesión
          </button>
        </div>

        {/* Avatar + info */}
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-md flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #ff2d78, #ff6fa3)' }}>
            👤
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[17px] font-black text-gray-900">Mi Perfil</h1>
            <p className="text-[12px] text-gray-400 font-medium">📱 +591 {user?.phone}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[
            { label: 'Pedidos', value: orders.filter(o => o.status !== 'cancelled').length, color: '#6366f1' },
            { label: 'Verificados', value: orders.filter(o => o.status === 'paid' || o.status === 'delivered').length, color: '#10b981' },
            { label: 'Total Bs', value: totalGastado.toFixed(0), color: BRAND },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-2xl p-2.5 text-center">
              <p className="text-[18px] font-black" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Lista de pedidos */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider px-1">Mis Pedidos</p>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(n => <div key={n} className="h-20 rounded-2xl bg-white animate-pulse border border-gray-100" />)}
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-sm font-bold text-red-400">{error}</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-5xl mb-3">🛍️</div>
            <p className="text-[15px] font-black text-gray-700">Aún no tienes pedidos</p>
            <p className="text-[12px] text-gray-400 mt-1 mb-5">¡Explora el catálogo y haz tu primera compra!</p>
            <button onClick={onBack}
              className="px-6 py-2.5 rounded-2xl font-black text-white text-sm shadow-md"
              style={{ background: BRAND }}>
              Ver catálogo
            </button>
          </div>
        ) : (
          orders.map(order => {
            const st = STATUS[order.status] ?? STATUS.pending;
            const isExpanded = expanded === order.id;
            const date = new Date(order.created_at).toLocaleDateString('es-ES', {
              day: '2-digit', month: 'short', year: 'numeric',
            });
            const time = new Date(order.created_at).toLocaleTimeString('es-ES', {
              hour: '2-digit', minute: '2-digit'
            });

            return (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Encabezado del pedido */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : order.id)}
                  className="w-full p-4 flex items-start gap-3 text-left"
                >
                  {/* Status icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: st.bg }}>
                    {st.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-[13px] font-black text-gray-800">Pedido #{order.id}</p>
                      <p className="text-[13px] font-black flex-shrink-0" style={{ color: BRAND }}>
                        {Number(order.total).toFixed(2)} Bs
                      </p>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{date} · {time}</p>
                    <span className="inline-block mt-1 text-[10px] font-black px-2 py-0.5 rounded-full"
                      style={{ background: st.bg, color: st.text }}>
                      {st.label}
                    </span>
                  </div>
                </button>

                {/* Detalle expandido */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
                    {/* Items */}
                    <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                      {(order.items ?? []).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-[12px]">
                          <span className="text-gray-700 flex-1 truncate">
                            {item.productName}
                            {item.size && <span className="text-gray-400"> ({item.size})</span>}
                            <span className="text-gray-400"> ×{item.quantity}</span>
                          </span>
                          <span className="font-black text-gray-800 ml-2 flex-shrink-0">
                            {(item.price * item.quantity).toFixed(2)} Bs
                          </span>
                        </div>
                      ))}
                      <div className="border-t border-gray-200 pt-1.5 flex justify-between">
                        <span className="text-[10px] font-black text-gray-400 uppercase">Total</span>
                        <span className="text-[14px] font-black" style={{ color: BRAND }}>
                          {Number(order.total).toFixed(2)} Bs
                        </span>
                      </div>
                    </div>

                    {/* Timeline de estado */}
                    <div className="space-y-1.5">
                      {[
                        { key: 'pending', label: 'Pedido registrado', done: true },
                        { key: 'paid', label: 'Pago verificado', done: order.status !== 'pending' && order.status !== 'cancelled', time: order.payment_verified_at },
                        { key: 'ready', label: 'Listo para entrega', done: order.status === 'ready' || order.status === 'delivered' },
                        { key: 'delivered', label: 'Entregado', done: order.status === 'delivered' },
                      ].map(step => (
                        <div key={step.key} className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: step.done ? '#10b981' : '#e5e7eb' }}>
                            {step.done && (
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <p className={`text-[11px] font-bold ${step.done ? 'text-gray-800' : 'text-gray-300'}`}>
                            {step.label}
                            {step.time && step.done && (
                              <span className="text-gray-400 font-medium ml-1">
                                · {new Date(step.time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Botón contactar si hay problema */}
                    {order.status === 'pending' && (
                      <button
                        onClick={() => {
                          const msg = encodeURIComponent(`Hola! Tengo el pedido #${order.id} por ${Number(order.total).toFixed(2)} Bs y quiero consultar el estado 🙏`);
                          window.open(`https://wa.me/${WA_BIZ}?text=${msg}`, '_blank');
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-[12px] text-white"
                        style={{ background: '#25D366' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-4.869 1.176l-.348.213-3.613-.952.969 3.536-.235.365a9.847 9.847 0 001.517 5.585c.618.987 1.523 1.87 2.583 2.543 1.324.744 2.787 1.114 4.276 1.114 2.419 0 4.687-.891 6.389-2.528.998-.943 1.843-2.111 2.489-3.415.646-1.304 1.08-2.722 1.273-4.167.024-.158.036-.315.036-.474 0-2.685-1.068-5.21-3.007-7.115-1.939-1.905-4.542-2.96-7.297-2.96z" />
                        </svg>
                        Consultar por WhatsApp
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Botón nuevo pedido */}
      {orders.length > 0 && !loading && (
        <div className="px-5 py-4 border-t border-gray-100 bg-white">
          <button onClick={onBack}
            className="w-full h-13 rounded-2xl font-black text-white text-[14px] py-3.5 shadow-lg"
            style={{ background: `linear-gradient(135deg, ${BRAND}, #ff6fa3)` }}>
            🛍️ Seguir comprando
          </button>
        </div>
      )}
    </div>
  );
}
