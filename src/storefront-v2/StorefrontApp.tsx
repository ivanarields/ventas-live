import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Rocket } from 'lucide-react';

import { Product, productsApi } from './services/productsApi';
import { DEFAULT_STORE_CHIPS, StoreChip, parseStoreChips } from './config/storefrontConfig';

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

      if (['gallery', 'checkout', 'profile', 'live-confirmation', 'selection', 'customer-center'].includes(hash)) {
        setViewInternal(hash as View);
        return;
      }

      
      setViewInternal('welcome');
    };

    window.addEventListener('hashchange', handleHash);
    handleHash(); // Ejecutar al inicio

    return () => window.removeEventListener('hashchange', handleHash);
  }, [cart.length]);

  const setView = (newView: View, productId?: string) => {
    if (newView === 'welcome') window.location.hash = '';
    else if (newView === 'detail' && productId) window.location.hash = `producto/${productId}`;
    else window.location.hash = newView;
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
    <div className={`store-shell ${darkMode ? 'store-dark' : ''} bg-[#fdf5f7] min-h-screen font-sans sm:py-8`}>
      <div className="max-w-[430px] mx-auto bg-white min-h-screen sm:min-h-[850px] shadow-2xl relative overflow-x-hidden sm:rounded-[40px]">

        {view === 'welcome' && (
          <WelcomeScreen 
            onEnter={() => setView('gallery')} 
            onOpenProfile={() => setView('profile')}
            onOpenCustomerCenter={() => setView('customer-center')}
            isInstallable={isInstallable}
            onInstall={handleInstallClick}
            darkMode={darkMode}
            onToggleDarkMode={toggleDarkMode}
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
                onOpenProfile={() => setView('profile')}
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
                  setView('gallery');
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

function WelcomeScreen({ onEnter, onOpenProfile, onOpenCustomerCenter, isInstallable, onInstall, darkMode, onToggleDarkMode }: { onEnter: () => void, onOpenProfile: () => void, onOpenCustomerCenter: () => void, isInstallable: boolean, onInstall: () => void, darkMode: boolean, onToggleDarkMode: () => void }) {
  const [mainCategories, setMainCategories] = useState<StoreChip[]>(DEFAULT_STORE_CHIPS.slice(0, 4));

  useEffect(() => {
    fetch('/api/store/settings')
      .then(r => r.ok ? r.json() : null)
      .then(settings => {
        const next = parseStoreChips(settings?.store_chips).filter(chip => chip.active).slice(0, 4);
        if (next.length > 0) setMainCategories(next);
      })
      .catch(() => {});
  }, []);

  // La carga inicial ahora se hace bajo demanda (paginada) en el componente ProductGallery
  // por lo que no necesitamos prefetch masivo.

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-white">
      
      {/* PWA Banner */}
      {isInstallable && (
        <div className="absolute top-4 left-4 right-16 z-40 flex items-center justify-between bg-white/90 backdrop-blur rounded-2xl px-3 py-2.5 border border-[#ff2d78]/10 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#ff2d78] flex items-center justify-center shadow-md shadow-[#ff2d78]/20">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[12px] font-black text-gray-900 leading-tight">Instalar app</p>
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

      {/* Botón de Perfil */}
      <button 
        onClick={onOpenProfile}
        className="absolute top-6 right-6 z-30 p-2.5 bg-white/30 backdrop-blur-md rounded-full shadow-sm hover:scale-105 active:scale-95 transition-all text-white border border-white/50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </button>
      <button
        onClick={onToggleDarkMode}
        className="absolute top-6 left-6 z-30 h-10 w-16 rounded-full border border-white/60 bg-white/45 backdrop-blur-md shadow-sm flex items-center px-1 transition-all"
        aria-label="Cambiar modo visual"
        title="Cambiar modo visual"
      >
        <span
          className="h-8 w-8 rounded-full bg-white shadow flex items-center justify-center text-[13px] font-black transition-transform"
          style={{ transform: darkMode ? 'translateX(24px)' : 'translateX(0)', color: darkMode ? '#111827' : '#ff2d78' }}
        >
          {darkMode ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8z"/></svg>
          )}
        </span>
      </button>
      {/* Fondo rosado original — sin fotos de collage que consuman recursos */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#fff0f5] via-white to-white z-0" />
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-[#ff2d78]/8 blur-3xl z-0" />
      <div className="absolute top-40 -left-16 w-48 h-48 rounded-full bg-[#ff2d78]/6 blur-2xl z-0" />

      {/* Contenido Frontal */}
      <div className="relative flex flex-col items-center justify-center flex-1 px-8 text-center z-10">
        <div className="mb-8">
          <div className="w-20 h-20 rounded-[28px] bg-gradient-to-br from-[#ff2d78] to-[#ff6fa3] flex items-center justify-center mx-auto mb-5 shadow-lg shadow-[#ff2d78]/30">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </div>
          <h1 className="text-[32px] font-black text-gray-900 tracking-tight leading-none">
            Leidy
          </h1>
          <h1 className="text-[32px] font-black tracking-tight leading-none" style={{ color: '#ff2d78' }}>
            American
          </h1>
          <p className="text-[13px] text-gray-400 font-medium mt-3 leading-relaxed">
            Moda femenina con estilo y calidad
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-10 w-full px-4">
          {mainCategories.map(cat => (
            <span key={cat.id} className="px-3 py-1.5 bg-[#fff0f5] text-[#ff2d78] text-[11px] font-black rounded-full uppercase tracking-wider">
              {cat.label}
            </span>
          ))}
        </div>

        <button
          onClick={onEnter}
          onPointerEnter={prefetchGallery}
          onTouchStart={prefetchGallery}
          onFocus={prefetchGallery}
          className="w-full max-w-[280px] h-14 rounded-2xl font-black text-white text-[16px] shadow-lg shadow-[#ff2d78]/30 active:scale-95 transition-all"
          style={{ background: 'linear-gradient(135deg, #ff2d78, #ff6fa3)' }}
        >
          Ver catálogo
        </button>

        <button
          onClick={onOpenCustomerCenter}
          className="w-full max-w-[280px] h-11 rounded-2xl font-black text-[#ff2d78] text-[14px] border-2 border-[#ff2d78]/20 bg-white mt-3 active:scale-95 transition-all"
        >
          Centro de clientas
        </button>

        <p className="text-[11px] text-gray-400 mt-4 font-medium">
          Pago seguro · Envío rápido
        </p>
      </div>

      <div className="relative pb-10 text-center z-10">
        <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">
          Leidy American © 2025
        </p>
      </div>
    </div>
  );
}
