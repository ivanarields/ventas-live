import React, { useState } from 'react';
import { ProductGallery } from './components/ProductGallery';
import { ProductDetail } from './components/ProductDetail';
import { Checkout } from './components/Checkout';
import { CartView } from './components/CartView';
import { Product } from './services/productsApi';

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

type View = 'welcome' | 'gallery' | 'detail' | 'checkout' | 'cart';

export default function StorefrontApp() {
  const [view, setView]                     = useState<View>('welcome');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize]     = useState<string>('');
  const [cart, setCart]                     = useState<CartItem[]>([]);

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
    setView('detail');
  };

  const handleQuickBuy = (product: Product) => {
    setSelectedProduct(product);
    setSelectedSize(product.sizes[0] || '');
    setView('checkout');
  };

  const handleBuyFromDetail = (product: Product, size: string) => {
    setSelectedProduct(product);
    setSelectedSize(size);
    setView('checkout');
  };

  const addToCart = (product: Product, size: string) => {
    setCart(prev => {
      const existing = prev.findIndex(i => i.product.id === product.id && i.size === size);
      if (existing >= 0) {
        return prev.map((item, idx) =>
          idx === existing ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, size, quantity: 1 }];
    });
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

  return (
    <div className="bg-[#fdf5f7] min-h-screen font-sans sm:py-8">
      <div className="max-w-[430px] mx-auto bg-white min-h-screen sm:min-h-[850px] shadow-2xl relative overflow-x-hidden sm:rounded-[40px]">

        {view === 'welcome' && <WelcomeScreen onEnter={() => setView('gallery')} />}

        {view === 'gallery' && (
          <ProductGallery
            onProductSelect={handleProductSelect}
            onQuickBuy={handleQuickBuy}
            onBack={() => setView('welcome')}
            onAddToCart={addToCart}
            onOpenCart={() => setView('cart')}
            cartCount={cartCount(cart)}
          />
        )}

        {view === 'detail' && selectedProduct && (
          <ProductDetail
            product={selectedProduct}
            onBack={() => setView('gallery')}
            onBuy={handleBuyFromDetail}
            onAddToCart={addToCart}
          />
        )}

        {view === 'cart' && (
          <CartView
            items={cart}
            onBack={() => setView('gallery')}
            onCheckout={() => setView('checkout')}
            onUpdateQuantity={updateQuantity}
            onRemove={removeFromCart}
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
          />
        )}
      </div>
    </div>
  );
}

function WelcomeScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#fff0f5] via-white to-white" />
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-[#ff2d78]/8 blur-3xl" />
      <div className="absolute top-40 -left-16 w-48 h-48 rounded-full bg-[#ff2d78]/6 blur-2xl" />

      <div className="relative flex flex-col items-center justify-center flex-1 px-8 text-center">
        <div className="mb-8">
          <div className="w-20 h-20 rounded-[28px] bg-gradient-to-br from-[#ff2d78] to-[#ff6fa3] flex items-center justify-center mx-auto mb-5 shadow-lg shadow-[#ff2d78]/30">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </div>
          <h1 className="text-[32px] font-black text-gray-900 tracking-tight leading-none">
            Leydi
          </h1>
          <h1 className="text-[32px] font-black tracking-tight leading-none" style={{ color: '#ff2d78' }}>
            American
          </h1>
          <p className="text-[13px] text-gray-400 font-medium mt-3 leading-relaxed">
            Moda femenina con estilo y calidad
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {['Blusas', 'Vestidos', 'Chaquetas', 'Conjuntos'].map(cat => (
            <span key={cat} className="px-3 py-1.5 bg-[#fff0f5] text-[#ff2d78] text-[11px] font-black rounded-full uppercase tracking-wider">
              {cat}
            </span>
          ))}
        </div>

        <button
          onClick={onEnter}
          className="w-full max-w-[280px] h-14 rounded-2xl font-black text-white text-[16px] shadow-lg shadow-[#ff2d78]/30 active:scale-95 transition-all"
          style={{ background: 'linear-gradient(135deg, #ff2d78, #ff6fa3)' }}
        >
          Ver catálogo
        </button>

        <p className="text-[11px] text-gray-400 mt-4 font-medium">
          Pago seguro · Envío rápido · 100% original
        </p>
      </div>

      <div className="relative pb-10 text-center">
        <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">
          Leydi American © 2025
        </p>
      </div>
    </div>
  );
}
