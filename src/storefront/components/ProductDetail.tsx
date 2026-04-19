import React, { useState } from 'react';
import { Product } from '../services/productsApi';

interface Props {
  product: Product;
  onBack: () => void;
  onBuy: (product: Product, size: string) => void;
  onAddToCart: (product: Product, size: string) => void;
}

const BRAND = '#ff2d78';

export function ProductDetail({ product, onBack, onBuy, onAddToCart }: Props) {
  const [activeImg, setActiveImg]     = useState(0);
  const [selectedSize, setSelectedSize] = useState<string>(product.sizes[0] ?? '');
  const [liked, setLiked]             = useState(false);
  const [likes, setLikes]             = useState(Math.floor(Math.random() * 80 + 12));
  const [views]                       = useState(Math.floor(Math.random() * 400 + 80));

  const handleLike = () => {
    setLiked(l => !l);
    setLikes(n => liked ? n - 1 : n + 1);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: product.title, text: `${product.title} — ${product.price} Bs`, url: window.location.href });
    } else {
      navigator.clipboard?.writeText(window.location.href);
    }
  };

  return (
    <div className="flex flex-col bg-white" style={{ minHeight: '100dvh' }}>

      {/* ── IMAGEN PRINCIPAL ── */}
      <div
        className="relative w-full flex-shrink-0 bg-gray-100 overflow-hidden"
        style={{ height: '62vh' }}
      >
        <img
          src={product.images[activeImg]}
          alt={product.title}
          className="w-full h-full object-cover"
          style={{ touchAction: 'pan-y' }}
        />

        {/* Overlay degradado suave en la parte baja */}
        <div
          className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.25), transparent)' }}
        />

        {/* Botón volver — esquina superior izquierda */}
        <button
          onClick={onBack}
          className="absolute top-4 left-4 w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(6px)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        {/* Botón favorito — esquina superior derecha */}
        <button
          onClick={handleLike}
          className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(6px)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? BRAND : 'none'} stroke={liked ? BRAND : '#111'} strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>

        {/* Badge agotado */}
        {!product.available && (
          <div className="absolute inset-0 bg-white/65 backdrop-blur-[2px] flex items-center justify-center">
            <span className="bg-gray-900 text-white text-[11px] font-black px-5 py-2 rounded-full uppercase tracking-widest">
              Agotado
            </span>
          </div>
        )}

        {/* Dots indicadores de imagen — solo si hay más de 1 */}
        {product.images.length > 1 && (
          <div className="absolute bottom-4 left-0 right-0 flex gap-1.5 justify-center items-center">
            {product.images.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveImg(idx)}
                className="rounded-full transition-all"
                style={{
                  width:  activeImg === idx ? 20 : 6,
                  height: 6,
                  background: activeImg === idx ? 'white' : 'rgba(255,255,255,0.5)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── CONTENIDO SCROLLABLE ── */}
      <div className="flex-1 overflow-y-auto pb-32">

        {/* Nombre + Precio */}
        <div className="px-5 pt-4 pb-1 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: BRAND }}>
              {product.category}
            </p>
            <h1 className="text-[19px] font-black text-gray-900 leading-tight">
              {product.title}
            </h1>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-[26px] font-black leading-none" style={{ color: BRAND }}>
              {product.price}
            </p>
            <p className="text-[11px] text-gray-400 font-bold">Bs</p>
          </div>
        </div>

        {/* Descripción */}
        {product.description && (
          <p className="px-5 text-[12px] text-gray-400 leading-relaxed mt-1">
            {product.description}
          </p>
        )}

        {/* ── Contador social ── */}
        <div className="mx-5 mt-3 mb-1 flex items-center gap-4 border-t border-b border-gray-100 py-2.5">
          {/* Vistas */}
          <div className="flex items-center gap-1 text-gray-400">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
            </svg>
            <span className="text-[11px] font-bold">{views}</span>
          </div>

          {/* Me gusta */}
          <button onClick={handleLike} className="flex items-center gap-1 transition-transform active:scale-90">
            <svg width="13" height="13" viewBox="0 0 24 24" fill={liked ? BRAND : 'none'} stroke={liked ? BRAND : '#9ca3af'} strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span className="text-[11px] font-bold" style={{ color: liked ? BRAND : '#9ca3af' }}>{likes}</span>
          </button>

          {/* Compartir */}
          <button onClick={handleShare} className="flex items-center gap-1 text-gray-400 active:scale-90 transition-transform">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span className="text-[11px] font-bold">Compartir</span>
          </button>
        </div>

        {/* Selector de tallas */}
        {product.sizes.length > 0 && (
          <div className="px-5 mt-3">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Talla</p>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map(size => (
                <button
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  className="px-4 py-2 rounded-xl font-black text-[12px] transition-all active:scale-95"
                  style={
                    selectedSize === size
                      ? { background: BRAND, color: 'white' }
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

      {/* ── FOOTER FIJO ── */}
      {product.available && (
        <div
          className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto px-4 pt-3 pb-5 border-t border-gray-100"
          style={{ background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(10px)' }}
        >
          <div className="flex gap-2">
            <button
              onClick={() => onAddToCart(product, selectedSize)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl font-black text-[13px] transition-all active:scale-95"
              style={{ height: 50, background: '#fff0f5', color: BRAND }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              Al carrito
            </button>
            <button
              onClick={() => onBuy(product, selectedSize)}
              className="flex-[1.6] rounded-2xl font-black text-white text-[14px] transition-all active:scale-[0.97]"
              style={{
                height: 50,
                background: `linear-gradient(135deg, ${BRAND}, #ff6fa3)`,
                boxShadow: '0 6px 18px rgba(255,45,120,0.32)',
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
