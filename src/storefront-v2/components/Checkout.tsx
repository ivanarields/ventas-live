import React, { useState, useEffect, useCallback } from 'react';
import { CartItem, cartTotal } from '../StorefrontApp';
import { storeOrdersApi } from '../services/storeOrdersApi';
import { storeAuth } from '../services/storeAuth';
import { storeImageUrl } from '../services/productsApi';
import { storeFavoritesApi } from '../services/storeFavoritesApi';
import { getStoreSettings } from '../services/storeSettingsApi';
import { ProductThumb } from './ProductThumb';

const BRAND = '#ff2d78';
const WA_NUMBER = (import.meta.env.VITE_STORE_WA_NUMBER as string | undefined) ?? '59160003230';
const PAYMENT_SECONDS = 120; // 2 minutos
export const PENDING_ORDER_KEY = 'tienda.pendingOrder';

export type PendingOrderSnapshot = {
  orderId: number;
  expiresAt: string; // ISO
  total: number;
  phone: string;
};

export function readPendingOrder(): PendingOrderSnapshot | null {
  try {
    const raw = localStorage.getItem(PENDING_ORDER_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PendingOrderSnapshot;
    if (!data?.orderId || !data?.expiresAt) return null;
    if (new Date(data.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(PENDING_ORDER_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearPendingOrder() {
  try { localStorage.removeItem(PENDING_ORDER_KEY); } catch {}
}

function savePendingOrder(snap: PendingOrderSnapshot) {
  try { localStorage.setItem(PENDING_ORDER_KEY, JSON.stringify(snap)); } catch {}
}

interface Props {
  items: CartItem[];
  onBack: () => void;
  onOrderComplete: () => void;
  darkMode?: boolean;
}

type Screen = 'loading' | 'empty_cart' | 'identify' | 'payment' | 'verified';

export function Checkout({ items, onBack, onOrderComplete, darkMode }: Props) {
  const total = cartTotal(items);
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);
  const primaryItem = items[0];
  const primaryImage = primaryItem?.product.images?.[0];

  const [screen, setScreen] = useState<Screen>('loading');

  // Formulario
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Pedido
  const [orderId, setOrderId] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(PAYMENT_SECONDS);
  const [expired, setExpired] = useState(false);
  const [verified, setVerified] = useState(false);
  const [bankDetected, setBankDetected] = useState(false);
  const [waNudge, setWaNudge] = useState(false); // true después de 60 seg sin verificar
  const [elapsedSec, setElapsedSec] = useState(0);
  const [paymentQrUrl, setPaymentQrUrl] = useState('/qr-leidy-shop.jpg');
  const [waNumber, setWaNumber] = useState(WA_NUMBER);
  const [serverTotal, setServerTotal] = useState<number | null>(null);

  // ── Al montar: detectar sesión y decidir pantalla ─────────────
  useEffect(() => {
    getStoreSettings()
      .then(settings => {
        const qr = String(settings?.payment_qr_url || '').trim();
        if (qr) setPaymentQrUrl(qr);
        const num = String(settings?.official_wa_number || settings?.store_phone || '').replace(/\D/g, '');
        if (num) setWaNumber(num);
      })
      .catch(() => {});

    // ── RETOMAR pedido pendiente: si el cliente cerró el QR y volvió,
    // localStorage tiene un pedido vivo → ir directo a la pantalla de pago
    // sin necesidad del carrito en memoria.
    const pending = readPendingOrder();
    if (pending) {
      fetch(`/api/store-orders/${pending.orderId}/status`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data || data.status !== 'pending') {
            clearPendingOrder();
            if (items.length === 0) setScreen('empty_cart');
            else setScreen('identify');
            return;
          }
          const remaining = data.expiresAt
            ? Math.max(0, Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000))
            : PAYMENT_SECONDS;
          setOrderId(data.id);
          setServerTotal(Number(data.total) || pending.total);
          setPhone(pending.phone || data.customerWa || '');
          setTimeLeft(remaining);
          setScreen('payment');
        })
        .catch(() => {
          clearPendingOrder();
          if (items.length === 0) setScreen('empty_cart');
          else setScreen('identify');
        });
      return;
    }

    if (items.length === 0) {
      setScreen('empty_cart');
      return;
    }

    const session = storeAuth.getCurrentUserSync();
    if (session) {
      // ✅ Ya tiene sesión → ir directo al pago
      storeAuth.getCurrentUser()
        .then(validUser => {
          if (!validUser) {
            setScreen('identify');
            return;
          }
          setPhone(validUser.phone);
          createOrder(validUser.phone);
        })
        .catch(() => setScreen('identify'));
      return;
    }

    // No tiene sesión → mostrar formulario.
    // Si vino con ?phone=... en la URL (link de WhatsApp), pre-llenar.
    try {
      const params = new URLSearchParams(window.location.search);
      const phoneFromUrl = params.get('phone');
      if (phoneFromUrl) {
        const cleaned = phoneFromUrl.replace(/\D/g, '').replace(/^591/, '').slice(0, 8);
        if (cleaned.length === 8) setPhone(cleaned);
      }
    } catch {}
    setScreen('identify');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createOrder = async (customerPhone: string) => {
    setAuthLoading(true);
    try {
      const payload = {
        items: items.map(i => ({
          productId: i.product.id,
          productName: i.product.title,
          price: i.product.price,
          size: i.size,
          quantity: i.quantity,
        })),
        total,
        customerName: '',
        customerPhone,
        delivery_type: 'retiro' as const,
        delivery_date: null,
        delivery_slot: null,
        delivery_address: null,
        delivery_notes: null,
      };
      const order = await storeOrdersApi.create(payload);
      if (!order?.id) throw new Error('No se pudo crear el pedido. Intenta de nuevo.');
      setOrderId(order.id);
      setServerTotal(Number(order.total) || total);
      savePendingOrder({
        orderId: order.id,
        expiresAt: (order as any).expires_at ?? new Date(Date.now() + PAYMENT_SECONDS * 1000).toISOString(),
        total: Number(order.total) || total,
        phone: customerPhone,
      });
      setScreen('payment');
    } catch (err: any) {
      // Pedido pendiente del mismo cliente → retomarlo en vez de crear otro
      if (err?.duplicate && err?.existingOrderId) {
        const exp = err.expiresAt ?? new Date(Date.now() + PAYMENT_SECONDS * 1000).toISOString();
        const remaining = Math.max(0, Math.floor((new Date(exp).getTime() - Date.now()) / 1000));
        setOrderId(err.existingOrderId);
        setServerTotal(Number(err.total) || total);
        setTimeLeft(remaining || PAYMENT_SECONDS);
        savePendingOrder({
          orderId: err.existingOrderId,
          expiresAt: exp,
          total: Number(err.total) || total,
          phone: customerPhone,
        });
        setScreen('payment');
        return;
      }
      if (err?.message?.includes('409') || err?.message?.includes('reservado') || err?.message?.includes('disponible')) {
        setAuthError('⏰ Este producto está reservado por otra persona. Intenta de nuevo en unos segundos.');
        setScreen('identify');
        return;
      }
      console.error('Error al crear pedido:', err);
      setOrderId(null);
      setAuthError(err?.message || 'No se pudo crear el pedido. Intenta de nuevo.');
      setScreen('identify');
    } finally {
      setAuthLoading(false);
    }
  };

  // ── Countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'payment' || !orderId) return;
    const t = setInterval(() => {
      setTimeLeft(s => {
        if (s <= 1) { setExpired(true); clearPendingOrder(); clearInterval(t); return 0; }
        return s - 1;
      });
      setElapsedSec(e => {
        const next = e + 1;
        if (next >= 60 && !waNudge) setWaNudge(true);
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [screen, waNudge, orderId]);

  // ── Polling de verificación (cada 3 s) ────────────────────────
  const checkPayment = useCallback(async () => {
    if (!orderId || verified) return;
    try {
      const res = await fetch(`/api/store-orders/${orderId}/status`);
      if (res.ok) {
        const { status, bankDetected: detected } = await res.json();
        setBankDetected(!!detected);
        if (status === 'paid' || status === 'confirmed') {
          setVerified(true);
          clearPendingOrder();
          setScreen('verified');
        }
        if (status === 'cancelled') {
          clearPendingOrder();
        }
      }
    } catch {}
  }, [orderId, verified]);

  useEffect(() => {
    if (screen !== 'payment' || verified) return;
    const interval = setInterval(checkPayment, 3000);
    return () => clearInterval(interval);
  }, [screen, verified, checkPayment]);

  // ── Registro / Login al identificarse ─────────────────────────
  const handleIdentify = async () => {
    setAuthError('');
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length < 8) { setAuthError('Número de WhatsApp inválido'); return; }
    if (pin.length !== 4) { setAuthError('El PIN debe tener 4 dígitos'); return; }

    setAuthLoading(true);
    setAuthError('');
    try {
      // 1. Intentar login primero
      let token: string | null = null;
      const loginRes = await fetch('/api/store-auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, pin })
      });
      const loginData = await loginRes.json();

      if (loginRes.ok && loginData.session?.access_token) {
        token = loginData.session.access_token;
        storeAuth.saveSession(token!, { id: loginData.user.id, phone: cleanPhone, name: '' }, loginData.session);
        void storeFavoritesApi.syncLocal();
      } else {
        // 2. Si login falla → registrar (primera vez, mismo PIN)
        const regRes = await fetch('/api/store-auth/register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanPhone, pin })
        });
        const regData = await regRes.json();

        if (regRes.status === 409) {
          setAuthError('PIN incorrecto para este número. Inténtalo de nuevo.');
          setAuthLoading(false); return;
        }
        if (!regRes.ok) throw new Error(regData.error || 'Error al crear tu perfil');

        // Auto-login tras registro
        const loginRes2 = await fetch('/api/store-auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanPhone, pin })
        });
        const loginData2 = await loginRes2.json();
        if (!loginRes2.ok) throw new Error('Cuenta creada. Ya puedes ingresar con tu PIN.');
        token = loginData2.session?.access_token;
        storeAuth.saveSession(token!, { id: loginData2.user.id, phone: cleanPhone, name: '' }, loginData2.session);
        void storeFavoritesApi.syncLocal();
      }

      // 3. Ir directo al pago
      await createOrder(cleanPhone);
    } catch (err: any) {
      setAuthError(err.message || 'Error inesperado. Intenta de nuevo.');
      setAuthLoading(false);
    }
  };

  // ── PANTALLAS ─────────────────────────────────────────────────

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: darkMode ? '#1a0c12' : '#fef1f5' }}>
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: BRAND, borderTopColor: 'transparent' }} />
        <p className="text-sm font-bold" style={{ color: darkMode ? '#e8d0da' : '#9ca3af' }}>Preparando tu pedido...</p>
      </div>
    );
  }

  if (screen === 'empty_cart') {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center p-6 text-center" style={{ background: darkMode ? '#1a0c12' : '#fef1f5' }}>
        <div className="text-5xl mb-4">🛍️</div>
        <h2 className="text-xl font-black mb-2" style={{ color: darkMode ? 'white' : '#475467' }}>Tu carrito está vacío</h2>
        <p className="text-sm mb-6" style={{ color: darkMode ? '#e8d0da' : '#9ca3af' }}>Agrega prendas para poder pagar.</p>
        <button onClick={onBack} className="px-8 py-3 rounded-2xl font-black text-white"
          style={{ background: BRAND }}>
          Ver catálogo
        </button>
      </div>
    );
  }

  if (screen === 'verified') {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center p-6 text-center" style={{ background: darkMode ? '#1a0c12' : '#fef1f5' }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 animate-bounce"
          style={{ background: '#d1fae5' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-black mb-2" style={{ color: darkMode ? 'white' : '#475467' }}>¡Pago Verificado!</h1>
        <p className="text-sm mb-1" style={{ color: darkMode ? '#e8d0da' : '#6b7280' }}>Pedido <strong>#{orderId}</strong> confirmado.</p>
        <p className="text-xs mb-8" style={{ color: darkMode ? '#e8d0da' : '#9ca3af' }}>Tus prendas están apartadas. ✨</p>
        <button onClick={onOrderComplete}
          className="w-full max-w-xs h-14 rounded-2xl font-black text-white"
          style={{ background: BRAND }}>
          Ver mis pedidos
        </button>
      </div>
    );
  }

  if (screen === 'payment') {
    if (!orderId) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: darkMode ? '#1a0c12' : '#fef1f5' }}>
          <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: BRAND, borderTopColor: 'transparent' }} />
          <p className="text-sm font-bold" style={{ color: darkMode ? '#e8d0da' : '#9ca3af' }}>Creando tu pedido...</p>
        </div>
      );
    }

    const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
    const secs = String(timeLeft % 60).padStart(2, '0');
    const pct = (timeLeft / PAYMENT_SECONDS) * 100;
    const tColor = timeLeft < 30 ? '#ef4444' : timeLeft < 60 ? '#f59e0b' : BRAND;
    const payableTotal = serverTotal ?? total;

    const sendWA = () => {
      const msg = encodeURIComponent(
        `Hola! Ya pague mi pedido de tienda #${orderId} por ${payableTotal.toFixed(2)} Bs. Mi numero es ${phone}. Adjunto comprobante.`
      );
      window.open(`https://wa.me/${waNumber}?text=${msg}`, '_blank');
    };

    const downloadVisibleQr = async () => {
      try {
        const response = await fetch(paymentQrUrl);
        if (!response.ok) throw new Error('No se pudo descargar el QR');
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const extension = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `QR-Leidy-Shop.${extension}`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch (error) {
        console.error('Error descargando QR:', error);
        window.location.href = paymentQrUrl;
      }
    };

    return (
      <div className="flex flex-col relative overflow-y-auto" style={{ height: '100dvh', maxHeight: '100dvh', background: darkMode ? '#1a0c12' : '#fef1f5' }}>
        {/* Header minimalista */}
        <div className="px-5 pt-[max(14px,env(safe-area-inset-top))] pb-1 flex justify-between items-center relative z-10 flex-shrink-0">
          <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm" style={{ background: darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.60)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={darkMode ? '#ff2d78' : 'currentColor'} strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
          </button>

          {!expired ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-sm border border-pink-50" style={{ background: darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.80)' }}>
              <span className="text-[12px] font-black text-[#ff2d78] uppercase tracking-wider">⏳ {mins}:{secs}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-full shadow-sm border border-red-100">
              <span className="text-[12px] font-black text-red-500 uppercase tracking-wider">Expirado</span>
            </div>
          )}
        </div>

        {/* Contenido Centrado */}
        <div className="flex flex-col items-center px-6 pt-1 pb-[max(16px,env(safe-area-inset-bottom))] w-full max-w-md mx-auto text-center relative z-10">

          {/* Monto y Resumen */}
          <div className="mb-3">
            <p className="text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: darkMode ? '#e8d0da' : '#6b7280' }}>Total a Pagar</p>
            <p className="font-black leading-none tracking-tight" style={{ fontSize: 'clamp(38px, 9dvh, 52px)', color: darkMode ? 'white' : '#475467' }}>
              {payableTotal.toFixed(2)} <span className="text-[20px] text-[#ff2d78]">Bs</span>
            </p>
            <p className="text-[12px] font-medium mt-2" style={{ color: darkMode ? '#e8d0da' : '#9ca3af' }}>
              Pedido {orderId ? `#${orderId}` : 'creando'} - {itemCount} articulo(s)
            </p>
          </div>

          {itemCount > 1 ? (
            <div
              className="w-full mb-3 rounded-3xl border shadow-sm p-3"
              style={{
                background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
                borderColor: darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.75)',
              }}
            >
              <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: darkMode ? '#e8d0da' : '#9ca3af' }}>Resumen · {itemCount} prendas</p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {items.flatMap(item =>
                  Array.from({ length: item.quantity }, (_, qi) => ({ img: item.product.images?.[0], title: item.product.title, key: `${item.product.id}-${qi}` }))
                ).map(({ img, title, key }) => (
                  <div key={key} className="flex-shrink-0 w-16 h-20 rounded-2xl overflow-hidden bg-[#fff0f5]">
                    {img ? (
                      <ProductThumb image={img} alt={title} className="w-full h-full object-cover" width={64} height={80} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#ff2d78] font-black text-[10px]">LA</div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[11px] font-bold mt-1.5" style={{ color: darkMode ? '#e8d0da' : '#6b7280' }}>Retiro coordinado</p>
            </div>
          ) : (
            <div
              className="w-full mb-3 rounded-3xl border shadow-sm p-2.5 flex items-center gap-3 text-left"
              style={{
                background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
                borderColor: darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.75)',
              }}
            >
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#fff0f5] flex-shrink-0">
                {primaryImage ? (
                  <ProductThumb image={primaryImage} className="w-full h-full object-cover" width={56} height={56} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#ff2d78] font-black">LA</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: darkMode ? '#e8d0da' : '#9ca3af' }}>Resumen</p>
              <p className="text-[13px] font-black truncate" style={{ color: darkMode ? '#f0e0e8' : '#475467' }}>
                  {primaryItem ? primaryItem.product.title : 'Pedido LeidyCandy'}
                </p>
                <p className="text-[11px] font-bold" style={{ color: darkMode ? '#e8d0da' : '#6b7280' }}>1 prenda - Retiro coordinado</p>
              </div>
            </div>
          )}

          {/* QR */}
          <div className="relative mb-3">
            <div className="rounded-3xl overflow-hidden bg-white shadow-[0_15px_40px_rgb(255,45,120,0.15)] border-4 border-white mx-auto" style={{ width: 'clamp(200px, 40dvh, 260px)', height: 'clamp(200px, 40dvh, 260px)' }}>
              <img src={storeImageUrl(paymentQrUrl, 'qr')} alt="QR" className="w-full h-full object-contain mix-blend-multiply" loading="eager" decoding="async" fetchPriority="high" />
            </div>
          </div>

          {/* Beneficiario */}
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: darkMode ? '#e8d0da' : '#9ca3af' }}>Beneficiario</p>
            <p className="text-[14px] font-black" style={{ color: darkMode ? 'white' : '#475467' }}>Leidy Candy Diaz Sanchez</p>
          </div>

          {bankDetected && !verified && (
            <div className="w-full mb-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-left">
              <p className="text-[11px] font-black text-amber-700 uppercase tracking-wider">Pago detectado</p>
              <p className="text-[12px] font-bold text-amber-700 mt-1">
                Envia el mensaje de WhatsApp y adjunta tu comprobante para confirmar el pedido.
              </p>
            </div>
          )}

          {/* Acciones */}
          <div className="w-full">
            {(!expired || bankDetected) ? (
              <div className="flex gap-2.5 justify-center">
                <button
                  onClick={downloadVisibleQr}
                  className="h-11 px-5 rounded-2xl font-black text-white text-[13px] shadow-[0_6px_16px_rgb(255,45,120,0.28)] active:scale-95 transition-all flex items-center gap-1.5"
                  style={{ background: BRAND }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  Descargar QR
                </button>

                <button
                  onClick={sendWA}
                  className="h-11 px-5 rounded-2xl font-black text-[13px] shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
                  style={{
                    background: darkMode ? 'rgba(255,255,255,0.12)' : 'white',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: darkMode ? 'rgba(255,255,255,0.15)' : '#f3f4f6',
                    color: darkMode ? 'white' : '#374151',
                  }}
                >
                  <span>💬</span>
                  Ya pagué
                </button>
              </div>
            ) : (
              <button onClick={onBack} className="w-full py-4 bg-gray-100 text-gray-500 font-black rounded-2xl active:scale-95 transition-all">
                Volver al catálogo
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── PANTALLA: Identificación (solo si no hay sesión) ──────────
  return (
    <div className="flex flex-col min-h-screen" style={{ background: darkMode ? '#1a0c12' : '#fef1f5' }}>
      <div className="sticky top-0 z-10 px-5 py-4 flex items-center gap-3">
        <button onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          style={{ background: darkMode ? 'rgba(255,255,255,0.08)' : 'transparent' }}
          onMouseEnter={e => !darkMode && (e.currentTarget.style.background = '#f9fafb')}
          onMouseLeave={e => !darkMode && (e.currentTarget.style.background = 'transparent')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div>
          <h2 className="text-[17px] font-black" style={{ color: darkMode ? 'white' : '#475467' }}>Confirmar pedido</h2>
          <p className="text-[11px]" style={{ color: darkMode ? '#e8d0da' : '#9ca3af' }}>Numero y PIN para apartar</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-5 flex flex-col justify-start space-y-4">
        {/* Resumen compacto */}
        <div
          className="rounded-3xl p-4 shadow-sm border"
          style={{
            background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.80)',
            borderColor: darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.70)',
          }}
        >
          <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: darkMode ? '#e8d0da' : '#9ca3af' }}>Tu pedido</p>
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 py-1">
              {item.product.images?.[0] && (
                <ProductThumb image={item.product.images[0]} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-white" width={40} height={40} />
              )}
              <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black truncate" style={{ color: darkMode ? '#f0e0e8' : '#475467' }}>{item.product.title}</p>
                {item.size && <p className="text-[10px]" style={{ color: darkMode ? '#e8d0da' : '#9ca3af' }}>Talla {item.size} · ×{item.quantity}</p>}
              </div>
              <p className="text-[12px] font-black flex-shrink-0" style={{ color: darkMode ? '#f0e0e8' : '#475467' }}>
                {(item.product.price * item.quantity).toFixed(2)} Bs
              </p>
            </div>
          ))}
          <div className="border-t mt-2 pt-2 flex justify-between" style={{ borderColor: darkMode ? 'rgba(255,255,255,0.12)' : '#e5e7eb' }}>
            <span className="text-[11px] font-bold" style={{ color: darkMode ? '#e8d0da' : '#6b7280' }}>Total</span>
            <span className="text-[16px] font-black" style={{ color: BRAND }}>{total.toFixed(2)} Bs</span>
          </div>
        </div>

        <div className="space-y-4">
          {/* WhatsApp */}
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: darkMode ? '#e8d0da' : '#6b7280' }}>
              WhatsApp
            </label>
            <p className="text-[10px] mb-2 leading-relaxed" style={{ color: darkMode ? '#e8d0da' : '#9ca3af' }}>Tu numero para ordenar.</p>
            <div
              className="flex items-center rounded-xl overflow-hidden border focus-within:border-pink-400 transition-colors"
              style={{ borderColor: darkMode ? 'rgba(255,45,120,0.20)' : '#e5e7eb' }}
            >
              <span
                className="px-3 text-[13px] font-black border-r py-3.5"
                style={{
                  color: darkMode ? '#e8d0da' : '#9ca3af',
                  background: darkMode ? 'rgba(255,255,255,0.08)' : '#f9fafb',
                  borderColor: darkMode ? 'rgba(255,45,120,0.20)' : '#e5e7eb',
                }}
              >+591</span>
              <input
                type="tel" inputMode="numeric" placeholder="60001234"
                value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                className="flex-1 px-3 py-3.5 text-[15px] font-bold outline-none"
                style={{
                  background: darkMode ? 'rgba(255,255,255,0.05)' : 'white',
                  color: darkMode ? '#f0e0e8' : '#475467',
                }}
                maxLength={8} autoFocus={phone.length !== 8}
              />
            </div>
          </div>

          {/* PIN */}
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider mb-1.5 block" style={{ color: darkMode ? '#e8d0da' : '#6b7280' }}>
              PIN de 4 digitos
            </label>
            <p className="text-[10px] mb-2 leading-relaxed" style={{ color: darkMode ? '#e8d0da' : '#9ca3af' }}>Si eres nueva, este PIN queda guardado.</p>
            <input
              type="password" inputMode="numeric" placeholder="• • • •"
              value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full px-4 py-3.5 rounded-xl text-[22px] font-black text-center tracking-[0.6em] outline-none border focus:border-pink-400 transition-colors"
              style={{
                background: darkMode ? 'rgba(255,255,255,0.05)' : 'white',
                borderColor: darkMode ? 'rgba(255,45,120,0.20)' : '#e5e7eb',
                  color: darkMode ? '#f0e0e8' : '#475467',
              }}
              maxLength={4} autoFocus={phone.length === 8}
            />
          </div>

          {authError && (
            <div className="flex items-start gap-2 bg-red-50 rounded-xl px-3 py-2.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" className="flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <p className="text-[12px] font-bold text-red-600">{authError}</p>
            </div>
          )}

          <p className="text-[10px] text-center leading-relaxed" style={{ color: darkMode ? '#e8d0da' : '#9ca3af' }}>Pago seguro por QR.</p>

          <button onClick={handleIdentify}
            disabled={authLoading || pin.length !== 4 || phone.replace(/\D/g, '').length < 8}
            className="w-full h-[52px] rounded-2xl font-black text-white text-[15px] shadow-lg transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: BRAND }}>
            {authLoading
              ? <><div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Procesando...</>
              : `Pagar ${total.toFixed(2)} Bs`}
          </button>
        </div>
      </div>

      <div className="hidden px-5 pb-8 pt-2">
        <button onClick={handleIdentify}
          disabled={authLoading || pin.length !== 4 || phone.replace(/\D/g, '').length < 8}
          className="w-full h-14 rounded-2xl font-black text-white text-[15px] shadow-lg transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: BRAND }}>
          {authLoading
            ? <><div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Procesando...</>
            : `🛍️ Pagar ${total.toFixed(2)} Bs`}
        </button>
      </div>
    </div>
  );
}
