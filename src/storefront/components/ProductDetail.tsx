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

      {/* ── Imagen principal (protagonista) ── */}
      <div className="relative w-full bg-gray-100" style={{ minHeight: '55vw', maxHeight: '70vh' }}>
        <img
          src={product.images[activeImg]}
          alt={product.title}
          className="w-full h-full object-cover"
          style={{ minHeight: '55vw', maxHeight: '70vh' }}
        />

        {/* Botón volver flotante */}
        <button
          onClick={onBack}
          className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-md active:scale-95 transition-transform"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        {/* Badge agotado */}
        {!product.available && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex items-center justify-center">
            <span className="bg-gray-800 text-white text-[11px] font-black px-4 py-2 rounded-full uppercase tracking-wider">
              Agotado
            </span>
          </div>
        )}

        {/* Thumbnails cuando hay varias fotos */}
        {product.images.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex gap-1.5 justify-center">
            {product.images.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveImg(idx)}
                className="w-2 h-2 rounded-full transition-all"
                style={{ background: activeImg === idx ? '#ff2d78' : 'rgba(255,255,255,0.6)' }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Miniaturas clicables si hay más de 1 foto */}
      {product.images.length > 1 && (
        <div className="flex gap-2 px-4 py-2 bg-white overflow-x-auto">
          {product.images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => setActiveImg(idx)}
              className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all"
              style={{ borderColor: activeImg === idx ? '#ff2d78' : 'transparent' }}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* ── Info del producto (scrollable) ── */}
      <div className="flex-1 overflow-y-auto pb-32">
        <div className="px-5 pt-4 pb-2">
          {/* Categoría */}
          <span
            className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full"
            style={{ background: '#fff0f5', color: '#ff2d78' }}
          >
            {product.category}
          </span>

          {/* Nombre */}
          <h1 className="text-[22px] font-black text-gray-900 leading-tight mt-2 mb-1">
            {product.title}
          </h1>

          {/* Precio */}
          <p className="text-[30px] font-black leading-none" style={{ color: '#ff2d78' }}>
            {product.price}
            <span className="text-[15px] text-gray-400 font-bold ml-1">Bs</span>
          </p>
        </div>

        {/* Descripción */}
        {product.description && (
          <div className="px-5 py-3 border-t border-gray-50">
            <p className="text-[13px] text-gray-500 leading-relaxed">{product.description}</p>
          </div>
        )}

        {/* Selector de tallas */}
        {product.sizes.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-50">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-2">Talla</p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map(size => (
                <button
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  className="px-4 py-2 rounded-xl font-black text-[13px] transition-all active:scale-95"
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

      {/* ── Botones fijos al fondo ── */}
      {product.available && (
        <div
          className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto px-4 pt-3 pb-5 bg-white/95 backdrop-blur-md border-t border-gray-100"
          style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.06)' }}
        >
          <div className="flex gap-2">
            <button
              onClick={() => onAddToCart(product, selectedSize)}
              className="flex-1 h-13 rounded-2xl font-black text-[13px] transition-all active:scale-95 flex items-center justify-center gap-1.5"
              style={{ background: '#fff0f5', color: '#ff2d78', height: 52 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              Al carrito
            </button>
            <button
              onClick={() => onBuy(product, selectedSize)}
              className="flex-[1.6] rounded-2xl font-black text-white text-[14px] transition-all active:scale-[0.98] flex items-center justify-center"
              style={{
                height: 52,
                background: 'linear-gradient(135deg, #ff2d78, #ff6fa3)',
                boxShadow: '0 6px 18px rgba(255,45,120,0.35)',
              }}
            >
              Comprar ahora
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
