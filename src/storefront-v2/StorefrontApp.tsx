import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Rocket } from 'lucide-react';

import { Product, productsApi } from './services/productsApi';

const ProductGallery = lazy(() => import('./components/ProductGallery').then(m => ({ default: m.ProductGallery })));
const ProductDetail = lazy(() => import('./components/ProductDetail').then(m => ({ default: m.ProductDetail })));
const Checkout = lazy(() => import('./components/Checkout').then(m => ({ default: m.Checkout })));
const CartView = lazy(() => import('./components/CartView').then(m => ({ default: m.CartView })));
const StoreProfile = lazy(() => import('./components/StoreProfile').then(m => ({ default: m.StoreProfile })));
const LiveConfirmation = lazy(() => import('./components/LiveConfirmation').then(m => ({ default: m.LiveConfirmation })));
const SelectionConfirmation = lazy(() => import('./components/SelectionConfirmation'));
const CustomerCenter = lazy(() => import('./components/CustomerCenter').then(m => ({ default: m.CustomerCenter })));

const prefetchGallery = () => {
  void import('./components/ProductGallery');
};

export interface CartItem {
  product: Product;
  size: string;
  quantity: number;
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((acc, i) => acc + i.product.price * i.quantity, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((acc, i) => acc + i.quantity, 0);
}

type View = 'welcome' | 'gallery' | 'detail' | 'checkout' | 'cart' | 'profile' | 'live-confirmation' | 'selection' | 'customer-center';


export default function StorefrontApp() {
  const [view, setViewInternal]             = useState<View>('welcome');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [profileInitialTab, setProfileInitialTab] = useState<string | undefined>(undefined);
  const [selectedSize, setSelectedSize]     = useState<string>('');
  const [cart, setCart]                     = useState<CartItem[]>([]);
  const [darkMode, setDarkMode]             = useState(() => localStorage.getItem('store_theme') === 'dark');

  // PWA Install Prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstallable(false);
    }
  };

  // ── AUTO-RETOMAR PEDIDO ───────────────────────────────────────
  // Si el cliente cerró la página del QR pero su pedido sigue vivo,
  // al volver a /tienda lo enviamos directo al checkout (decisión C).
  // El botón "← Volver al catálogo" del checkout permite escapar.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('tienda.pendingOrder');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data?.orderId || !data?.expiresAt) return;
      if (new Date(data.expiresAt).getTime() <= Date.now()) {
        localStorage.removeItem('tienda.pendingOrder');
        return;
      }
      // Forzar la vista de checkout (Checkout.tsx detecta el pendingOrder y retoma)
      if (window.location.hash.replace('#', '') !== 'checkout') {
        window.location.hash = 'checkout';
      }
    } catch {}
  }, []);

  // Sincronización con Hash URL
  useEffect(() => {
    const handleHash = async () => {
      if (window.location.pathname.startsWith('/tienda/selection')) {
        setViewInternal('selection');
        return;
      }

      const hash = window.location.hash.replace('#', '');
      if (!hash) {
        setViewInternal('welcome');
        return;
      }

      if (hash.startsWith('producto/')) {
        const id = hash.split('/')[1];
        if (id) {
          const prod = await productsApi.getProduct(id);
          if (prod) {
            setSelectedProduct(prod);
            setViewInternal('detail');
            return;
          }
        }
        setViewInternal('gallery'); // fallback
        return;
      }

      if (hash === 'cart') {
        setViewInternal('cart');
        return;
      }

      if (hash.startsWith('profile/')) {
        const subTab = hash.split('/')[1];
        setProfileInitialTab(subTab);
        setViewInternal('profile');
        return;
      }

      if (['gallery', 'checkout', 'profile', 'live-confirmation', 'selection', 'customer-center'].includes(hash)) {
        setProfileInitialTab(undefined);
        setViewInternal(hash as View);
        return;
      }

      
      setViewInternal('welcome');
    };

    window.addEventListener('hashchange', handleHash);
    handleHash(); // Ejecutar al inicio

    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const setView = (newView: View, productId?: string) => {
    if (newView === 'welcome') window.location.hash = '';
    else if (newView === 'detail' && productId) window.location.hash = `producto/${productId}`;
    else window.location.hash = newView;
  };

  const openProfile = (tab?: string) => {
    window.location.hash = tab ? `profile/${tab}` : 'profile';
  };

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
    setView('detail', product.id);
  };

  const handleQuickBuy = (product: Product) => {
    const size = product.sizes?.[0] || '';
    // Añadir al carrito con cantidad 1 antes de ir al checkout
    setCart(prev => {
      const exists = prev.some(i => i.product.id === product.id && i.size === size);
      if (exists) return prev;
      return [...prev, { product, size, quantity: 1 }];
    });
    setSelectedProduct(product);
    setSelectedSize(size);
    setView('checkout');
  };

  const handleBuyFromDetail = (product: Product, size: string) => {
    // Añadir al carrito antes de ir al checkout
    setCart(prev => {
      const exists = prev.some(i => i.product.id === product.id && i.size === size);
      if (exists) return prev;
      return [...prev, { product, size, quantity: 1 }];
    });
    setSelectedProduct(product);
    setSelectedSize(size);
    setView('checkout');
  };

  const addToCart = (product: Product, size: string) => {
    setCart(prev => {
      // Desde galería/detalle: si ya existe, no duplicar ni incrementar
      const exists = prev.some(i => i.product.id === product.id && i.size === size);
      if (exists) return prev;
      return [...prev, { product, size, quantity: 1 }];
    });
  };

  const incrementCartItem = (productId: string, size: string) => {
    setCart(prev =>
      prev.map(i => i.product.id === productId && i.size === size ? { ...i, quantity: i.quantity + 1 } : i)
    );
  };

  const removeFromCart = (productId: string, size: string) => {
    setCart(prev => prev.filter(i => !(i.product.id === productId && i.size === size)));
  };

  const updateQuantity = (productId: string, size: string, delta: number) => {
    setCart(prev =>
      prev
        .map(i =>
          i.product.id === productId && i.size === size
            ? { ...i, quantity: i.quantity + delta }
            : i
        )
        .filter(i => i.quantity > 0)
    );
  };

  const clearCart = () => setCart([]);

  const toggleDarkMode = () => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('store_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  return (
    <div className={`store-shell ${darkMode ? 'store-dark' : ''} min-h-screen font-sans sm:py-8`} style={{ background: darkMode ? '#1a0c12' : '#fef1f5' }}>
      <div className="max-w-[430px] mx-auto min-h-screen sm:min-h-[850px] shadow-2xl relative overflow-x-hidden sm:rounded-[40px]" style={{ background: darkMode ? '#1a0c12' : '#fef1f5' }}>

        {view === 'welcome' && (
          <WelcomeScreen 
            onEnter={() => setView('gallery')} 
            isInstallable={isInstallable}
            onInstall={handleInstallClick}
          />
        )}

        {view !== 'welcome' && (
          <Suspense fallback={<StoreSkeleton />}>
            {view === 'gallery' && (
              <ProductGallery
                onProductSelect={handleProductSelect}
                onQuickBuy={handleQuickBuy}
                onBack={() => setView('welcome')}
                onAddToCart={addToCart}
                onOpenCart={() => setView('cart')}
                onOpenProfile={openProfile}
                cartCount={cartCount(cart)}
                darkMode={darkMode}
                onToggleDarkMode={toggleDarkMode}
              />
            )}

            {view === 'detail' && selectedProduct && (
              <ProductDetail
                product={selectedProduct}
                onBack={() => setView('gallery')}
                onBuy={handleBuyFromDetail}
                onAddToCart={addToCart}
                cartCount={cartCount(cart)}
                onOpenCart={() => setView('cart')}
                darkMode={darkMode}
              />
            )}

            {view === 'cart' && (
              <CartView
                items={cart}
                onBack={() => setView('gallery')}
                onCheckout={() => setView('checkout')}
                onUpdateQuantity={updateQuantity}
                onRemove={removeFromCart}
                darkMode={darkMode}
              />
            )}

            {view === 'checkout' && (
              <Checkout
                items={cart}
                onBack={() => setView('gallery')}
                onOrderComplete={() => {
                  clearCart();
                  openProfile('orders');
                }}
                darkMode={darkMode}
              />
            )}
            {view === 'profile' && (
              <StoreProfile
                onBack={() => setView('gallery')}
                onLogout={() => setView('welcome')}
                onProductSelect={handleProductSelect}
                onOpenCart={() => setView('cart')}
                initialTab={profileInitialTab as any}
                darkMode={darkMode}
              />
            )}
            {view === 'live-confirmation' && (
              <LiveConfirmation
                onBack={() => setView('gallery')}
              />
            )}
            {view === 'selection' && <SelectionConfirmation />}
            {view === 'customer-center' && (
              <CustomerCenter onBack={() => setView('welcome')} />
            )}
          </Suspense>
        )}

      </div>
    </div>
  );
}

function StoreSkeleton() {
  return (
    <div className="min-h-screen bg-white p-4">
      <div className="h-12 rounded-2xl bg-gray-100 animate-pulse mb-4" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(n => (
          <div key={n} className="aspect-[3/4] rounded-[24px] bg-gray-100 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function WelcomeScreen({ onEnter, isInstallable, onInstall }: { onEnter: () => void, isInstallable: boolean, onInstall: () => void }) {
  // La carga inicial ahora se hace bajo demanda (paginada) en el componente ProductGallery
  // por lo que no necesitamos prefetch masivo.

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-white">
      
      {/* PWA Banner */}
      {isInstallable && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 w-[min(310px,calc(100%-48px))] flex items-center justify-between bg-white/92 backdrop-blur rounded-2xl px-3 py-2 border border-[#ff2d78]/10 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#ff2d78] flex items-center justify-center shadow-md shadow-[#ff2d78]/20">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[12px] font-black text-gray-800 leading-tight">Instalar app</p>
              <p className="text-[9px] font-medium text-gray-500">Más rápida, sin barras</p>
            </div>
          </div>
          <button 
            onClick={onInstall} 
            className="bg-gradient-to-r from-[#ff2d78] to-[#ff6fa3] text-white font-black py-1.5 px-3 rounded-full text-[10px] shadow-sm active:scale-95 transition-all"
          >
            Instalar
          </button>
        </div>
      )}

      {/* Fondo rosado original — sin fotos de collage que consuman recursos */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,#ffd4e4_0%,#fff0f6_34%,#fff8fb_62%,#ffffff_100%)] z-0" />

      {/* Contenido Frontal */}
      <div className="relative flex flex-col items-center justify-center flex-1 px-8 text-center z-10">
        <div className="mb-7">
          <div className="w-20 h-20 mx-auto mb-5 overflow-hidden">
            <img src="/logo.png" alt="LeidyCandy" className="w-full h-full object-contain" loading="eager" decoding="async" />
          </div>
          <h1 className="text-[32px] font-black tracking-tight leading-none">
            <span style={{ color: '#ff2d78' }}>Leidy</span>{' '}
            <span style={{ color: '#6b7280' }}>Candy</span>
          </h1>
          <p className="text-[13px] text-gray-400 font-medium mt-3 leading-relaxed">
            Moda femenina con estilo y calidad
          </p>
        </div>

        <button
          onClick={onEnter}
          onPointerEnter={prefetchGallery}
          onTouchStart={prefetchGallery}
          onFocus={prefetchGallery}
          className="w-[min(210px,100%)] h-11 rounded-full font-black text-white text-[14px] shadow-md shadow-[#ff2d78]/20 active:scale-95 transition-all"
          style={{ background: '#ff2d78' }}
        >
          Ver catálogo
        </button>

        <p className="text-[11px] text-gray-400 mt-4 font-medium">
          Pago seguro · Envío rápido
        </p>
      </div>

      <div className="relative pb-10 text-center z-10">
        <div className="mb-3 flex items-center justify-center gap-4 text-[11px] font-bold">
          <a href="/tienda/terminos" className="text-[#ff2d78] underline underline-offset-2">Terms of Service</a>
          <a href="/tienda/privacidad" className="text-[#ff2d78] underline underline-offset-2">Privacy Policy</a>
        </div>
        <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">
          LeidyCandy © 2026
        </p>
      </div>
    </div>
  );
}
