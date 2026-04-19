import React, { useState } from 'react';
import { CartItem, cartTotal } from '../StorefrontApp';
import { storeOrdersApi } from '../services/storeOrdersApi';

interface Props {
  items: CartItem[];
  onBack: () => void;
  onOrderComplete: () => void;
}

export function Checkout({ items, onBack, onOrderComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const total = cartTotal(items);

  const handleWhatsApp = async () => {
    try {
      setLoading(true);

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
        customerPhone: '',
      };

      await storeOrdersApi.create(payload);

      const itemsList = items
        .map(
          i =>
            `• ${i.product.title} (${i.size}) x${i.quantity} = ${(i.product.price * i.quantity).toFixed(2)} Bs`
        )
        .join('%0A');

      const message = `Hola, quisiera confirmar mi compra en Leydi American:%0A%0A${itemsList}%0A%0ATotal: ${total.toFixed(2)} Bs`;

      window.open(`https://wa.me/59160003230?text=${message}`, '_blank');

      onOrderComplete();
    } catch (error) {
      console.error('Error al crear pedido:', error);
      const itemsList = items
        .map(
          i =>
            `• ${i.product.title} (${i.size}) x${i.quantity} = ${(i.product.price * i.quantity).toFixed(2)} Bs`
        )
        .join('%0A');

      const message = `Hola, quisiera confirmar mi compra en Leydi American:%0A%0A${itemsList}%0A%0ATotal: ${total.toFixed(2)} Bs`;

      window.open(`https://wa.me/59160003230?text=${message}`, '_blank');

      onOrderComplete();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h2 className="text-[18px] font-black text-gray-900">Confirmar pedido</h2>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 p-5">
        {/* Resumen de items */}
        <div className="space-y-3">
          <p className="text-[12px] font-black text-gray-400 uppercase tracking-wider">Tu pedido</p>
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 bg-gray-50 rounded-xl p-3"
            >
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-white flex-shrink-0 border border-gray-100">
                <img
                  src={item.product.images[0]}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-black text-gray-900 line-clamp-2">
                  {item.product.title}
                </p>
                {item.size && (
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                    Talla: {item.size}
                  </p>
                )}
                <p className="text-[12px] font-black text-gray-700 mt-1">
                  x{item.quantity} = {(item.product.price * item.quantity).toFixed(2)} Bs
                </p>
              </div>
              <p className="text-[13px] font-black text-gray-900 flex-shrink-0">
                {item.product.price} Bs
              </p>
            </div>
          ))}
        </div>

        {/* QR (provisional) */}
        <div className="space-y-3">
          <p className="text-[12px] font-black text-gray-400 uppercase tracking-wider">Escanea para pagar</p>
          <div className="bg-gray-50 rounded-2xl p-6 flex items-center justify-center">
            <div className="w-40 h-40 bg-white rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
              <svg
                width="60"
                height="60"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-gray-300"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="4" height="4" />
              </svg>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 text-center">
            QR provisional • Reemplazar cuando esté disponible
          </p>
        </div>
      </div>

      {/* Total + botón WhatsApp */}
      <div className="border-t border-gray-100 px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-bold text-gray-500">Total:</p>
          <p className="text-[24px] font-black" style={{ color: '#ff2d78' }}>
            {total.toFixed(2)} Bs
          </p>
        </div>
        <button
          onClick={handleWhatsApp}
          disabled={loading}
          className="w-full h-14 rounded-2xl font-black text-white text-[16px] shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: '#25D366' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-4.869 1.176l-.348.213-3.613-.952.969 3.536-.235.365a9.847 9.847 0 001.517 5.585c.618.987 1.523 1.87 2.583 2.543 1.324.744 2.787 1.114 4.276 1.114 2.419 0 4.687-.891 6.389-2.528.998-.943 1.843-2.111 2.489-3.415.646-1.304 1.08-2.722 1.273-4.167.024-.158.036-.315.036-.474 0-2.685-1.068-5.21-3.007-7.115-1.939-1.905-4.542-2.96-7.297-2.96z" />
          </svg>
          {loading ? 'Procesando...' : 'Ya pagué · Confirmar por WhatsApp'}
        </button>
      </div>
    </div>
  );
}
