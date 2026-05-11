import React from 'react';
import { CartItem, cartTotal } from '../StorefrontApp';
import { storeImageUrl } from '../services/productsApi';

interface Props {
  items: CartItem[];
  onBack: () => void;
  onCheckout: () => void;
  onUpdateQuantity: (productId: string, size: string, delta: number) => void;
  onRemove: (productId: string, size: string) => void;
  darkMode?: boolean;
}

export function CartView({ items, onBack, onCheckout, onRemove }: Props) {
  const total = cartTotal(items);
  const isEmpty = items.length === 0;

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-gradient-to-b from-[#fff0f5] via-white to-white">
      <header className="sticky top-0 z-20 bg-white/82 backdrop-blur-md border-b border-[#ff2d78]/8 px-5 h-14 flex items-center gap-3">
        <button type="button" onClick={onBack} className="relative z-30 w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors" aria-label="Volver">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div className="flex-1 text-center -ml-10">
          <h2 className="text-[16px] font-black text-gray-800 leading-tight">Carrito</h2>
          <p className="text-[11px] text-gray-400 font-bold">{items.length} prenda{items.length === 1 ? '' : 's'}</p>
        </div>
      </header>

      <div className="flex-1 px-5 py-4 pb-32">
        {isEmpty ? (
          <div className="min-h-[70vh] flex flex-col items-center justify-center text-center">
            <div className="w-[72px] h-[72px] rounded-3xl bg-[#fff0f5] flex items-center justify-center mb-4">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ff2d78" strokeWidth="2.3">
                <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </div>
            <p className="text-[16px] font-black text-gray-800 mb-1">Carrito vacio</p>
            <p className="text-[12px] text-gray-400 font-bold">Agrega prendas desde el detalle del producto.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map(item => (
              <div key={`${item.product.id}-${item.size}`} className="rounded-[22px] bg-white/88 backdrop-blur border border-white/70 shadow-sm p-2.5 flex gap-3">
                <div className="w-[68px] h-[78px] rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0">
                  <img src={storeImageUrl(item.product.images[0], 'thumb')} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="text-[13px] font-black text-gray-800 leading-snug line-clamp-2">{item.product.title}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[11px] font-black text-gray-400">1x</span>
                    <span className="text-[15px] font-black text-[#ff2d78]">{item.product.price.toFixed(2)} Bs</span>
                  </div>
                  {item.size && <p className="mt-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.size}</p>}
                </div>
                <button
                  onClick={() => onRemove(item.product.id, item.size)}
                  className="w-9 h-9 rounded-full bg-[#fff0f5] text-[#ff2d78] flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
                  aria-label="Eliminar producto"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isEmpty && (
        <footer className="fixed bottom-2 left-3 right-3 max-w-[406px] mx-auto rounded-[24px] bg-white/84 backdrop-blur-md border border-white/70 px-4 pt-3 pb-4 space-y-3 z-20 shadow-[0_14px_35px_rgba(0,0,0,0.1)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-[#ff2d78]">Envio no incluido</p>
              <p className="text-[13px] font-black text-gray-700">Total</p>
            </div>
            <p className="text-[21px] font-black text-gray-800">{total.toFixed(2)} Bs</p>
          </div>
          <button
            onClick={onCheckout}
            className="w-full h-12 rounded-2xl font-black text-white text-[14px] shadow-lg transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #ff2d78, #ff6fa3)', boxShadow: '0 8px 20px rgba(255,45,120,0.3)' }}
          >
            Pagar pedido
          </button>
        </footer>
      )}
    </div>
  );
}
