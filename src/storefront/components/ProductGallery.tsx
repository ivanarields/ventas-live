import React, { useState, useEffect, useRef } from 'react';
import { productsApi, Product } from '../services/productsApi';

interface Props {
  onProductSelect: (product: Product) => void;
  onQuickBuy: (product: Product) => void;
  onBack: () => void;
  onAddToCart: (product: Product, size: string) => void;
  onOpenCart: () => void;
  cartCount: number;
}

export function ProductGallery({ onProductSelect, onQuickBuy, onBack, onAddToCart, onOpenCart, cartCount }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('Todos');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    productsApi.getProducts().then(data => {
      setProducts(data);
      setLoading(false);
    });
  }, []);

  const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category)))];
  const filtered = products
    .filter(p => filter === 'Todos' || p.category === filter)
    .filter(p =>
      searchQuery.trim() === '' ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="flex items-center gap-3 px-5 h-16">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div className="flex-1">
            <p className="font-black text-[18px] text-gray-900 leading-none">Catálogo</p>
            <p className="text-[11px] text-gray-400 font-medium">Leydi American</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSearchOpen(o => !o);
                if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 100);
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </button>
            <button
              onClick={onOpenCart}
              className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black" style={{ background: '#ff2d78' }}>
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="px-5 pb-3">
            <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-4 h-10">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-300 flex-shrink-0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                ref={searchInputRef}
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar producto..."
                className="flex-1 bg-transparent text-[14px] font-medium outline-none text-gray-800"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-gray-300 hover:text-gray-600 transition-colors flex-shrink-0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 px-5 pb-3 overflow-x-auto scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-[12px] font-black transition-all"
              style={filter === cat
                ? { background: '#ff2d78', color: 'white' }
                : { background: '#f5f5f5', color: '#888' }
              }
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 p-4 pb-8">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="bg-gray-100 rounded-[24px] aspect-[3/4] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(p => (
              <div
                key={p.id}
                onClick={() => p.available && onProductSelect(p)}
                className="bg-white rounded-[20px] overflow-hidden flex flex-col border border-gray-100 shadow-sm cursor-pointer active:scale-[0.98] transition-transform"
              >
                <div className="aspect-[3/4] bg-gray-50 relative">
                  <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" />
                  {!p.available && (
                    <div className="absolute inset-0 bg-white/75 backdrop-blur-[2px] flex items-center justify-center">
                      <span className="bg-gray-800 text-white text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-wider">
                        Agotado
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-3 flex-1 flex flex-col">
                  <p className="font-bold text-[12px] text-gray-800 leading-snug line-clamp-2 mb-1">
                    {p.title}
                  </p>
                  <p className="font-black text-[16px] mb-3" style={{ color: '#ff2d78' }}>
                    {p.price} <span className="text-[11px] text-gray-400 font-bold">Bs</span>
                  </p>

                  <button
                    disabled={!p.available}
                    onClick={e => {
                      e.stopPropagation();
                      onAddToCart(p, p.sizes[0] ?? '');
                    }}
                    className="mt-auto w-full h-9 rounded-xl font-black text-[11px] transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1.5"
                    style={p.available
                      ? { background: '#fff0f5', color: '#ff2d78' }
                      : { background: '#f0f0f0', color: '#bbb' }
                    }
                  >
                    {p.available ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="9" cy="21" r="1" />
                          <circle cx="20" cy="21" r="1" />
                          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                        </svg>
                        Agregar
                      </>
                    ) : 'Agotado'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
