import React, { useState, useEffect, useCallback } from 'react';
import { CartItem, cartTotal } from '../StorefrontApp';
import { storeOrdersApi } from '../services/storeOrdersApi';
import { storeAuth } from '../services/storeAuth';

const BRAND = '#ff2d78';
const WA_NUMBER = '59160003230';

interface Props {
  items: CartItem[];
  onBack: () => void;
  onOrderComplete: () => void;
}

type Screen = 'loading' | 'empty_cart' | 'identify' | 'payment' | 'verified';

export function Checkout({ items, onBack, onOrderComplete }: Props) {
  const total = cartTotal(items);

  const [screen, setScreen] = useState<Screen>('loading');

  // Formulario
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [showConfirm, setShowConfirm] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Pedido
  const [orderId, setOrderId] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(2 * 60); // 2 minutos
  const [expired, setExpired] = useState(false);
  const [verified, setVerified] = useState(false);
  const [waNudge, setWaNudge] = useState(false); // true después de 60 seg sin verificar
  const [elapsedSec, setElapsedSec] = useState(0);

  // ── Al montar: detectar sesión y decidir pantalla ─────────────
  useEffect(() => {
    if (items.length === 0) {
      setScreen('empty_cart');
      return;
    }

    const session = storeAuth.getCurrentUserSync();
    if (session) {
      // ✅ Ya tiene sesión → crear pedido automáticamente y saltar al pago
      createOrder(session.phone);
    } else {
      // No tiene sesión → mostrar formulario
      setScreen('identify');
    }
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
      };
      const order = await storeOrdersApi.create(payload);
      setOrderId(order?.id ?? null);
    } catch (err: any) {
      // Manejar producto reservado
      if (err?.message?.includes('409') || err?.message?.includes('reservado') || err?.message?.includes('disponible')) {
        setAuthError('⏰ Este producto está reservado por otra persona. Intenta de nuevo en unos segundos.');
        setScreen('identify');
        return;
      }
      console.error('Error al crear pedido:', err);
      setOrderId(null);
    } finally {
      setAuthLoading(false);
      setScreen('payment');
    }
  };

  // ── Countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'payment') return;
    const t = setInterval(() => {
      setTimeLeft(s => {
        if (s <= 1) { setExpired(true); clearInterval(t); return 0; }
        return s - 1;
      });
      setElapsedSec(e => {
        const next = e + 1;
        if (next >= 60 && !waNudge) setWaNudge(true);
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [screen, waNudge]);

  // ── Polling de verificación (cada 5 s) ────────────────────────
  const checkPayment = useCallback(async () => {
    if (!orderId || verified) return;
    try {
      const res = await fetch(`/api/store-orders/${orderId}/status`);
      if (res.ok) {
        const { status } = await res.json();
        if (status === 'paid' || status === 'confirmed') {
          setVerified(true);
          setScreen('verified');
        }
      }
    } catch {}
  }, [orderId, verified]);

  useEffect(() => {
    if (screen !== 'payment' || verified) return;
    const interval = setInterval(checkPayment, 3000); // cada 3 seg para respuesta inmediata
    return () => clearInterval(interval);
  }, [screen, verified, checkPayment]);

  // ── Registro / Login al identificarse ─────────────────────────
  const handleIdentify = async () => {
    setAuthError('');
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length < 8) { setAuthError('Número de WhatsApp inválido'); return; }
    if (pin.length !== 4) { setAuthError('El PIN debe tener 4 dígitos'); return; }
    if (showConfirm && pin !== pinConfirm) { setAuthError('Los PINs no coinciden'); return; }

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
        storeAuth.saveSession(token!, { id: loginData.user.id, phone: cleanPhone, name: '' });
      } else {
        // 2. Si login falla → registrar
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
        storeAuth.saveSession(token!, { id: loginData2.user.id, phone: cleanPhone, name: '' });
      }

      // 3. Crear pedido
      await createOrder(cleanPhone);
    } catch (err: any) {
      setAuthError(err.message || 'Error inesperado. Intenta de nuevo.');
      setAuthLoading(false);
    }
  };

  // ── PANTALLAS ─────────────────────────────────────────────────

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white">
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: BRAND, borderTopColor: 'transparent' }} />
        <p className="text-sm font-bold text-gray-400">Preparando tu pedido...</p>
      </div>
    );
  }

  if (screen === 'empty_cart') {
    return (
      <div className="flex flex-col min-h-screen bg-white items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">🛍️</div>
        <h2 className="text-xl font-black text-gray-900 mb-2">Tu carrito está vacío</h2>
        <p className="text-sm text-gray-400 mb-6">Agrega prendas para poder pagar.</p>
        <button onClick={onBack} className="px-8 py-3 rounded-2xl font-black text-white"
          style={{ background: BRAND }}>
          Ver catálogo
        </button>
      </div>
    );
  }

  if (screen === 'verified') {
    return (
      <div className="flex flex-col min-h-screen bg-white items-center justify-center p-6 text-center">
        <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 animate-bounce"
          style={{ background: '#d1fae5' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">¡Pago Verificado!</h1>
        <p className="text-gray-500 text-sm mb-1">Pedido <strong>#{orderId}</strong> confirmado.</p>
        <p className="text-gray-400 text-xs mb-8">Tus prendas están apartadas. ✨</p>
        <button onClick={onOrderComplete}
          className="w-full max-w-xs h-14 rounded-2xl font-black text-white"
          style={{ background: BRAND }}>
          Ver mis pedidos
        </button>
      </div>
    );
  }

  if (screen === 'payment') {
    const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
    const secs = String(timeLeft % 60).padStart(2, '0');
    const pct = (timeLeft / (2 * 60)) * 100;
    const tColor = timeLeft < 30 ? '#ef4444' : timeLeft < 60 ? '#f59e0b' : BRAND;

    const sendWA = () => {
      const msg = encodeURIComponent(
        `Hola! Pagué el pedido #${orderId ?? '?'} por ${total.toFixed(2)} Bs. Adjunto comprobante 📸`
      );
      window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, '_blank');
    };

    return (
      <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#ffe6ef] via-[#fffbfd] to-white relative">
        {/* Header minimalista */}
        <div className="px-6 pt-6 pb-2 flex justify-between items-center relative z-10">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-white/60 flex items-center justify-center shadow-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          
          {!expired ? (
            <div className="flex items-center gap-1.5 bg-white/80 px-3 py-1.5 rounded-full shadow-sm border border-pink-50">
              <span className="text-[12px] font-black text-[#ff2d78] uppercase tracking-wider">⏳ {mins}:{secs}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-full shadow-sm border border-red-100">
              <span className="text-[12px] font-black text-red-500 uppercase tracking-wider">Expirado</span>
            </div>
          )}
        </div>

        {/* Contenido Centrado */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-12 w-full max-w-md mx-auto text-center relative z-10">
          
          {/* Monto y Resumen */}
          <div className="mb-8">
            <p className="text-[13px] font-bold text-gray-500 uppercase tracking-widest mb-2">Total a Pagar</p>
            <p className="text-[52px] font-black leading-none text-gray-900 tracking-tight">
              {total.toFixed(2)} <span className="text-[22px] text-[#ff2d78]">Bs</span>
            </p>
            <p className="text-[13px] text-gray-400 font-medium mt-3">
              Pedido {orderId ? `#${orderId}` : ''} • {items.reduce((acc, i) => acc + i.quantity, 0)} artículo(s)
            </p>
          </div>

          {/* QR */}
          <div className="relative mb-6">
            <div className="w-56 h-56 rounded-3xl overflow-hidden bg-white shadow-[0_15px_40px_rgb(255,45,120,0.15)] border-4 border-white mx-auto">
              <img src="/qr-yape.jpg" alt="QR" className="w-full h-full object-cover mix-blend-multiply" />
            </div>
          </div>

          {/* Beneficiario */}
          <div className="mb-10">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Beneficiario (Yape)</p>
            <p className="text-[16px] font-black text-gray-800">Leidy Candy Diaz Sanchez</p>
          </div>

          {/* Acciones */}
          <div className="w-full space-y-3">
            {!expired ? (
              <>
                <button 
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = '/qr-yape.jpg';
                    link.download = 'QR-Leidy-Candy.jpg';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="w-full py-4 rounded-2xl font-black text-white text-[15px] shadow-[0_8px_20px_rgb(255,45,120,0.3)] active:scale-95 transition-all flex items-center justify-center gap-2"
                  style={{ background: BRAND }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  Descargar QR
                </button>

                <button 
                  onClick={sendWA}
                  className="w-full py-4 rounded-2xl font-black text-[14px] text-gray-700 bg-white border border-gray-100 shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <span className="text-lg">💬</span>
                  Ya pagué, enviar comprobante
                </button>
              </>
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
    <div className="flex flex-col min-h-screen bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3">
        <button onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-50">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div>
          <h2 className="text-[17px] font-black text-gray-900">Confirmar pedido</h2>
          <p className="text-[11px] text-gray-400">Ingresa tu número para finalizar</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Resumen compacto */}
        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Tu pedido</p>
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 py-1">
              {item.product.images?.[0] && (
                <img src={item.product.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-white" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-black text-gray-800 truncate">{item.product.title}</p>
                {item.size && <p className="text-[10px] text-gray-400">Talla {item.size} · ×{item.quantity}</p>}
              </div>
              <p className="text-[12px] font-black text-gray-800 flex-shrink-0">
                {(item.product.price * item.quantity).toFixed(2)} Bs
              </p>
            </div>
          ))}
          <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between">
            <span className="text-[11px] text-gray-500 font-bold">Total</span>
            <span className="text-[16px] font-black" style={{ color: BRAND }}>{total.toFixed(2)} Bs</span>
          </div>
        </div>

        <div className="space-y-4">
          {/* WhatsApp */}
          <div>
            <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5 block">
              Número de WhatsApp
            </label>
            <p className="text-[10px] text-gray-400 mb-2 leading-relaxed">
              📱 Usa tu número real de WhatsApp. Lo necesitamos para confirmar tu pago automáticamente y enviarte el estado de tu pedido.
            </p>
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-pink-400 transition-colors">
              <span className="px-3 text-[13px] font-black text-gray-400 bg-gray-50 border-r border-gray-200 py-3.5">+591</span>
              <input
                type="tel" inputMode="numeric" placeholder="60001234"
                value={phone} onChange={e => setPhone(e.target.value)}
                className="flex-1 px-3 py-3.5 text-[15px] font-bold bg-white outline-none"
                maxLength={8} autoFocus
              />
            </div>
          </div>

          {/* PIN */}
          <div>
            <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5 block">
              PIN de 4 dígitos
              {showConfirm && <span className="text-gray-400 font-medium normal-case"> — primera vez aquí</span>}
            </label>
            <input
              type="password" inputMode="numeric" placeholder="• • • •"
              value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-[22px] font-black text-center tracking-[0.6em] outline-none focus:border-pink-400 transition-colors"
              maxLength={4}
            />
          </div>

          {/* Confirmar PIN */}
          {showConfirm && (
            <div>
              <label className="text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5 block">
                Confirmar PIN
              </label>
              <input
                type="password" inputMode="numeric" placeholder="• • • •"
                value={pinConfirm} onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-[22px] font-black text-center tracking-[0.6em] outline-none focus:border-pink-400 transition-colors"
                maxLength={4}
              />
            </div>
          )}

          {/* Toggle */}
          <button type="button"
            onClick={() => { setShowConfirm(!showConfirm); setPinConfirm(''); setAuthError(''); }}
            className="text-[12px] font-bold text-gray-400 underline">
            {showConfirm ? '¿Ya tienes cuenta? No confirmar PIN' : '¿Primera vez? Confirmar PIN'}
          </button>

          {authError && (
            <div className="flex items-start gap-2 bg-red-50 rounded-xl px-3 py-2.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" className="flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <p className="text-[12px] font-bold text-red-600">{authError}</p>
            </div>
          )}

          <p className="text-[10px] text-gray-400 text-center leading-relaxed">
            🔒 Solo usamos tu número para enviarte actualizaciones por WhatsApp.
          </p>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-gray-100">
        <button onClick={handleIdentify}
          disabled={authLoading || pin.length !== 4 || phone.replace(/\D/g, '').length < 8}
          className="w-full h-14 rounded-2xl font-black text-white text-[15px] shadow-lg transition-all active:scale-[0.98] disabled:opacity-40"
          style={{ background: BRAND }}>
          {authLoading ? 'Procesando...' : `🛍️ Pagar ${total.toFixed(2)} Bs`}
        </button>
      </div>
    </div>
  );
}
