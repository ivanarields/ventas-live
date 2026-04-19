import React from 'react';
import { CartItem, cartTotal } from '../StorefrontApp';

interface Props {
  items: CartItem[];
  onBack: () => void;
  onCheckout: () => void;
  onUpdateQuantity: (productId: string, size: string, delta: number) => void;
  onRemove: (productId: string, size: string) => void;
}

export function CartView({ items, onBack, onCheckout, onUpdateQuantity, onRemove }: Props) {
  const total = cartTotal(items);
  const isEmpty = items.length === 0;

  return (
    <div className="flex flex-col bg-white min-h-screen">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h2 className="text-[18px] font-black text-gray-900">Tu carrito</h2>
      </div>

      <div className="flex-1 flex flex-col">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center px-5 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#fff0f5] flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ff2d78" strokeWidth="2">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </div>
            <p className="text-[14px] font-black text-gray-900 mb-1">Carrito vacío</p>
            <p className="text-[12px] text-gray-400 leading-relaxed">Agrega productos para empezar a comprar</p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1">
            <div className="divide-y divide-gray-100">
              {items.map((item, idx) => (
                <div key={idx} className="p-4 flex gap-3">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0">
                    <img src={item.product.images[0]} alt="" className="w-full h-full object-cover" />
                  </div>

                  <div className="flex-1 flex flex-col">
                    <p className="text-[13px] font-black text-gray-900 line-clamp-2">{item.product.title}</p>
                    {item.size && (
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">
                        Talla: {item.size}
                      </span>
                    )}
                    <p className="mt-auto text-[14px] font-black" style={{ color: '#ff2d78' }}>
                      {item.product.price} Bs
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1.5 bg-[#f5f5f5] rounded-lg p-1">
                      <button
                        onClick={() => onUpdateQuantity(item.product.id, item.size, -1)}
                        className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-900 font-bold text-[12px]"
                      >
                        −
                      </button>
                      <span className="w-6 text-center font-black text-[12px]">{item.quantity}</span>
                      <button
                        onClick={() => onUpdateQuantity(item.product.id, item.size, 1)}
                        className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-900 font-bold text-[12px]"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => onRemove(item.product.id, item.size)}
                      className="text-[10px] font-bold text-gray-300 hover:text-red-400 transition-colors"
                    >
                      Eliminar
                    </button>
                    <p className="text-[12px] font-black text-gray-900 mt-auto">
                      {(item.product.price * item.quantity).toFixed(2)} Bs
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {!isEmpty && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-bold text-gray-500">Total:</p>
            <p className="text-[22px] font-black" style={{ color: '#ff2d78' }}>
              {total.toFixed(2)} Bs
            </p>
          </div>
          <button
            onClick={onCheckout}
            className="w-full h-14 rounded-2xl font-black text-white text-[15px] shadow-lg transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #ff2d78, #ff6fa3)', boxShadow: '0 8px 20px rgba(255,45,120,0.3)' }}
          >
            Confirmar pedido
          </button>
        </div>
      )}
    </div>
  );
}
