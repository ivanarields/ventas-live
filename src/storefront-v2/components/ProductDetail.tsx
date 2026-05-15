import React, { useEffect, useState } from 'react';
import { Product, storeImageUrl } from '../services/productsApi';
import { storeFavoritesApi } from '../services/storeFavoritesApi';

interface Props {
  product: Product;
  onBack: () => void;
  onBuy: (product: Product, size: string) => void;
  onAddToCart: (product: Product, size: string) => void;
  cartCount?: number;
  onOpenCart?: () => void;
  darkMode?: boolean;
}

const BRAND = '#ff2d78';

export function ProductDetail({ product, onBack, onBuy, onAddToCart, cartCount = 0, onOpenCart, darkMode }: Props) {
  const [activeImg, setActiveImg]     = useState(0);
  const [selectedSize, setSelectedSize] = useState<string>(product.sizes[0] ?? '');
  const [liked, setLiked]             = useState(() => Boolean(storeFavoritesApi.readLocal()[product.id]));
  const [likes, setLikes]             = useState(Math.floor(Math.random() * 80 + 12));
  const [views]                       = useState(Math.floor(Math.random() * 400 + 80));

  useEffect(() => {
    storeFavoritesApi.list()
      .then(items => setLiked(items.some(item => String(item.id) === String(product.id))))
      .catch(() => {});
  }, [product.id]);

  const handleLike = async () => {
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikes(n => nextLiked ? n + 1 : Math.max(0, n - 1));
    await storeFavoritesApi.set(product, nextLiked);
  };

  const handleShare = () => {
    const url = `https://leidycandy.me/tienda#producto/${product.id}`;
    const text = `${product.title} — ${product.price} Bs`;
    if (navigator.share) {
      navigator.share({ title: 'Leidy Shop', text, url });
    } else {
      navigator.clipboard?.writeText(url);
    }
  };

  return (
    <div className="flex flex-col bg-white overflow-hidden" style={{ height: '100dvh', maxHeight: '100dvh' }}>

      {/* ── IMAGEN PRINCIPAL (GALERÍA SWIPABLE) ── */}
      <div
        className="relative w-full flex-1 min-h-0 bg-gray-100 overflow-hidden"
        onDoubleClick={handleLike}
      >
        <div 
          className="flex w-full h-full overflow-x-auto snap-x snap-mandatory"
          style={{ scrollBehavior: 'smooth', scrollbarWidth: 'none' /* Ocultar scroll en Firefox */ }}
          onScroll={(e) => {
            // Actualizar el dot activo al hacer swipe
            const idx = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth);
            setActiveImg(idx);
          }}
        >
          {/* Para ocultar scrollbar en Webkit */}
          <style dangerouslySetInnerHTML={{__html: `div::-webkit-scrollbar { display: none; }`}} />
          
          {product.images.map((img, idx) => (
            <img
              key={idx}
              src={storeImageUrl(img, 'detail')}
              alt={`${product.title} - ${idx + 1}`}
              loading={idx === 0 ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={idx === 0 ? 'high' : 'low'}
              width={720}
              height={960}
              className="w-full h-full shrink-0 snap-center object-cover object-top"
              style={{ touchAction: 'pan-x pan-y' }}
            />
          ))}
        </div>

        {/* Overlay degradado suave en la parte baja */}
        <div
          className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
          style={{ background: darkMode ? 'linear-gradient(to top, rgba(25,18,25,1) 0%, rgba(25,18,25,0) 100%)' : 'linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%)' }}
        />

        {/* Botón volver — esquina superior izquierda */}
        <button
          onClick={onBack}
          className="absolute top-4 left-4 w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-sm"
          style={{ background: 'rgba(255,255,255,0.95)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        {/* Botón favorito — esquina superior derecha */}
        <button
          onClick={handleLike}
          className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-sm"
          style={{ background: 'rgba(255,255,255,0.95)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? BRAND : 'none'} stroke={liked ? BRAND : '#111'} strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>

        {cartCount > 0 && (
          <button
            onClick={onOpenCart}
            className="absolute top-16 right-4 w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-sm text-[#ff2d78]"
            style={{ background: 'rgba(255,255,255,0.95)' }}
            aria-label="Ver carrito"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[#ff2d78] text-white text-[9px] font-black flex items-center justify-center">
              {cartCount}
            </span>
          </button>
        )}

        {/* Badge vendido */}
        {product.stock === 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
            <span className="bg-red-600 text-white text-[11px] font-black px-4 py-1.5 rounded-lg uppercase tracking-widest shadow-lg">
              VENDIDO
            </span>
          </div>
        )}

        {/* Dots indicadores de imagen — solo si hay más de 1 */}
        {product.images.length > 1 && (
          <div className="absolute bottom-6 left-0 right-0 flex gap-1.5 justify-center items-center z-10 pointer-events-none">
            {product.images.map((_, idx) => (
              <div
                key={idx}
                className="rounded-full transition-all shadow-sm"
                style={{
                  width:  activeImg === idx ? 24 : 8,
                  height: 8,
                  background: activeImg === idx ? BRAND : '#e5e7eb',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── CONTENIDO SCROLLABLE ── */}
      <div className="-mt-4 relative z-10 bg-white rounded-t-[28px] pt-3 pb-1.5 shadow-[0_-10px_28px_rgba(255,255,255,0.75)] flex-shrink-0">

        {/* Categoría */}
        <div className="px-5 mb-0.5">
           <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: BRAND }}>
              {product.category}
           </p>
        </div>

        {/* Nombre + Precio al estilo de la referencia 1 */}
        <div className="px-5 flex items-start justify-between gap-3">
          <h1 className="text-[19px] font-extrabold text-gray-800 leading-[1.08] flex-1 truncate">
            {product.title}
          </h1>
          <div className="flex-shrink-0 text-right">
            {/* Precio en el color de la marca (rosado) */}
            <p className="text-[21px] font-black leading-none mt-0.5" style={{ color: BRAND }}>
              <span className="text-[14px] font-bold mr-0.5">Bs</span>{product.price}
            </p>
          </div>
        </div>

        {/* Descripción sin título extra, directo al texto (como en el mockup) */}
        {product.description && (
          <div className="px-5 mt-1.5">
            <p className="text-[12px] text-gray-400 font-medium leading-snug line-clamp-2">
              {product.description}
            </p>
          </div>
        )}

        {/* ── Contador social + Talla elegante ── */}
        <div className="mx-5 mt-2.5 border-t border-b border-gray-100 py-2 flex items-center justify-between gap-2">
          
          <div className="flex items-center gap-3 min-w-0">
            {/* Vistas */}
            <div className="flex items-center gap-1 text-gray-400">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
              </svg>
              <span className="text-[11px] font-bold">{views}</span>
            </div>

            {/* Like */}
            <button onClick={handleLike} className="flex items-center gap-1 text-gray-400 transition-transform active:scale-95">
              <svg width="15" height="15" viewBox="0 0 24 24" fill={liked ? BRAND : 'none'} stroke={liked ? BRAND : 'currentColor'} strokeWidth="2.5">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span className="text-[11px] font-bold" style={{ color: liked ? BRAND : '#9ca3af' }}>{likes}</span>
            </button>

            {/* Compartir */}
            <button onClick={handleShare} className="flex items-center gap-1 text-gray-400 transition-transform active:scale-95">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span className="text-[11px] font-bold tracking-wide">Compartir</span>
            </button>
          </div>

          {/* Talla estilo minimalista (derecha) */}
          {product.sizes.length > 0 && (
            <div className="flex items-center flex-shrink-0">
              <div className="flex gap-1">
                {product.sizes.map(size => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size)}
                    className="min-w-6 h-6 px-1.5 rounded-lg font-black text-[10px] transition-all active:scale-95 border"
                    style={
                      selectedSize === size
                        ? { background: BRAND, color: 'white', borderColor: BRAND }
                        : {
                            background: darkMode ? 'rgba(255,255,255,0.1)' : 'white',
                            color: darkMode ? '#f8eef4' : '#6b7280',
                            borderColor: darkMode ? 'rgba(255,255,255,0.16)' : '#e5e7eb',
                          }
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

      {/* ── FOOTER FIJO (Z-INDEX 50 PARA SIEMPRE ESTAR ARRIBA) ── */}
      {product.stock > 0 && (
        <div
          className="flex-shrink-0 px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] z-50"
          style={{
            background: darkMode ? 'rgba(25,18,25,0.96)' : 'rgba(255,255,255,0.96)',
            backdropFilter: 'blur(10px)',
            borderColor: darkMode ? 'rgba(255,255,255,0.12)' : undefined,
          }}
        >
          <div className="flex gap-2">
            <button
              onClick={() => onAddToCart(product, selectedSize)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl font-black text-[12px] transition-all active:scale-95"
              style={{ height: 42, background: '#fff0f5', color: BRAND }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              Al carrito
            </button>
            <button
              onClick={() => onBuy(product, selectedSize)}
              className="flex-[1.45] rounded-xl font-black text-white text-[13px] transition-all active:scale-[0.97]"
              style={{
                height: 42,
                background: `linear-gradient(135deg, ${BRAND}, #ff6fa3)`,
                boxShadow: `0 6px 18px ${BRAND}55`,
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
