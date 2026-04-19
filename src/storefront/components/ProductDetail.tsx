import React, { useState } from 'react';
import { Product } from '../services/productsApi';

interface Props {
  product: Product;
  onBack: () => void;
  onBuy: (product: Product, size: string) => void;
  onAddToCart: (product: Product, size: string) => void;
}

export function ProductDetail({ product, onBack, onBuy, onAddToCart }: Props) {
  const [activeImg, setActiveImg] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string>(product.sizes[0] ?? '');

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
        <h2 className="text-[18px] font-black text-gray-900">Detalle del producto</h2>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {/* Imagen principal con carousel */}
        <div className="relative bg-gray-50 aspect-[3/4]">
          <img
            src={product.images[activeImg]}
            alt={product.title}
            className="w-full h-full object-cover"
          />

          {/* Thumbnails - mostrar solo si hay múltiples imágenes */}
          {product.images.length > 1 && (
            <div className="absolute bottom-4 left-0 right-0 flex gap-2 justify-center px-4">
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImg(idx)}
                  className="w-12 h-12 rounded-lg overflow-hidden bg-white border-2 transition-all flex-shrink-0"
                  style={{ borderColor: activeImg === idx ? '#ff2d78' : '#f0f0f0' }}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info del producto */}
        <div className="p-5 space-y-4">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              {product.category}
            </p>
            <h1 className="text-[22px] font-black text-gray-900 leading-tight mb-2">
              {product.title}
            </h1>
            <p className="text-[28px] font-black" style={{ color: '#ff2d78' }}>
              {product.price} <span className="text-[14px] text-gray-400 font-bold">Bs</span>
            </p>
          </div>

          {product.description && (
            <div>
              <p className="text-[13px] text-gray-600 leading-relaxed">
                {product.description}
              </p>
            </div>
          )}

          {/* Selector de tallas */}
          {product.sizes.length > 0 && (
            <div>
              <p className="text-[12px] font-black text-gray-700 uppercase tracking-wider mb-2">
                Talla
              </p>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map(size => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size)}
                    className="px-4 py-2 rounded-lg font-bold text-[12px] transition-all"
                    style={
                      selectedSize === size
                        ? { background: '#ff2d78', color: 'white' }
                        : { background: '#f5f5f5', color: '#888' }
                    }
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Botones de acción */}
      {product.available && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-2">
          <button
            onClick={() => onAddToCart(product, selectedSize)}
            className="w-full h-12 rounded-2xl font-black text-[14px] transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{ background: '#fff0f5', color: '#ff2d78' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            Agregar al carrito
          </button>
          <button
            onClick={() => onBuy(product, selectedSize)}
            className="w-full h-12 rounded-2xl font-black text-white text-[14px] shadow-lg transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #ff2d78, #ff6fa3)', boxShadow: '0 8px 20px rgba(255,45,120,0.3)' }}
          >
            Comprar ahora
          </button>
        </div>
      )}
    </div>
  );
}
