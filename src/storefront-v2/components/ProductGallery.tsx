import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { productsApi, Product, storeDirectThumbUrl, storeImageFallbackUrl } from '../services/productsApi';
import { StoreChip, parseStoreChips } from '../config/storefrontConfig';
import { storeFavoritesApi } from '../services/storeFavoritesApi';
import { getStoreSettings } from '../services/storeSettingsApi';

interface Props {
  onProductSelect: (product: Product) => void;
  onQuickBuy: (product: Product) => void;
  onBack: () => void;
  onAddToCart: (product: Product, size: string) => void;
  onOpenCart: () => void;
  onOpenProfile: (tab?: string) => void;
  cartCount: number;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
}

export function ProductGallery({ onProductSelect, onBack, onOpenCart, onOpenProfile, cartCount, darkMode, onToggleDarkMode }: Props) {
  const cachedProducts = productsApi.getCachedProducts();
  const [products, setProducts] = useState<Product[]>(cachedProducts?.data ?? []);
  const [loading, setLoading] = useState(!cachedProducts?.data?.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(cachedProducts?.hasMore ?? false);
  const [reservedMap, setReservedMap] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>('');
  const [chips, setChips] = useState<StoreChip[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<Record<string, Product>>(() => storeFavoritesApi.readLocal());
  const [headerHidden, setHeaderHidden] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);

  const favoriteCount = Object.keys(favorites).length;

  const favoritesRef = useRef(favorites);
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  const toggleFavorite = useCallback(async (product: Product) => {
    const current = favoritesRef.current;
    const next = { ...current };
    const liked = !next[product.id];
    if (liked) next[product.id] = product;
    else delete next[product.id];
    favoritesRef.current = next;
    setFavorites(next);
    const synced = await storeFavoritesApi.set(product, liked);
    const syncedMap = Object.fromEntries(synced.map(item => [String(item.id), item]));
    favoritesRef.current = syncedMap;
    setFavorites(syncedMap);
  }, []);

  const fetchReserved = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const r = await fetch('/api/store-orders/reserved-products');
      if (r.ok) setReservedMap(await r.json());
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    if (loading || products.length === 0) return;
    const initial = window.setTimeout(fetchReserved, 2200);
    const t = setInterval(fetchReserved, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchReserved();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(initial);
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchReserved, loading, products.length]);

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    getStoreSettings()
      .then(settings => {
        const next = parseStoreChips(settings?.store_chips);
        setChips(next);
        if (filter && !next.some(chip => chip.active && chip.value === filter)) setFilter('');
      })
      .catch(() => setChips([]));
  }, []);

  useEffect(() => {
    setPage(1);
    if (products.length === 0) setLoading(true);
    productsApi.getProducts({
      page: 1,
      limit: 8,
      category: filter || undefined,
      search: debouncedSearch
    }).then(res => {
      setProducts(res.data);
      setHasMore(res.hasMore);
      setLoading(false);
    });
  }, [filter, debouncedSearch]);

  useEffect(() => {
    if (page === 1) return;
    setLoadingMore(true);
    productsApi.getProducts({
      page,
      limit: 8,
      category: filter || undefined,
      search: debouncedSearch
    }).then(res => {
      setProducts(prev => [...prev, ...res.data]);
      setHasMore(res.hasMore);
      setLoadingMore(false);
    });
  }, [page, filter, debouncedSearch]);

  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setPage(p => p + 1);
    }, { rootMargin: '100px' });
    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
    return () => observerRef.current?.disconnect();
  }, [loading, loadingMore, hasMore]);

  const visibleChips = chips
    .filter(chip => chip.active && chip.id !== 'all' && chip.value !== 'Todos')
    .sort((a, b) => a.sort - b.sort);

  const openSearch = () => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const openFavorites = () => {
    onOpenProfile('saved');
  };

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const nextTop = event.currentTarget.scrollTop;
    const prevTop = lastScrollTopRef.current;
    if (nextTop > 90 && nextTop > prevTop + 12) setHeaderHidden(true);
    if (nextTop < prevTop - 12 || nextTop < 30) setHeaderHidden(false);
    lastScrollTopRef.current = nextTop;
  };

  return (
    <div ref={galleryScrollRef} onScroll={handleScroll} className="flex flex-col h-[100dvh] overflow-y-auto bg-gradient-to-b from-[#fff0f5] via-white to-white">
      <header className={`sticky top-0 z-50 bg-white/82 backdrop-blur-md border-b border-[#ff2d78]/8 transition-transform duration-300 ${headerHidden && !searchOpen ? '-translate-y-full' : 'translate-y-0'}`}>
        <div className="flex items-center gap-3 px-5 h-14">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0" aria-label="Volver">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-black text-[18px] text-gray-800 leading-none">Catalogo</p>
            <p className="text-[11px] font-black" style={{ color: '#ff2d78' }}>Leidy Shop</p>
          </div>
          <button onClick={onToggleDarkMode} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors" title="Modo visual">
            {darkMode ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8z"/></svg>
            )}
          </button>
          <button onClick={onOpenCart} className="relative w-9 h-9 rounded-full flex items-center justify-center bg-[#fff0f5] text-[#ff2d78] transition-colors" aria-label="Ver carrito">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[#ff2d78] text-white text-[9px] font-black flex items-center justify-center">{cartCount}</span>
            )}
          </button>
        </div>

        {searchOpen && (
          <div className="px-5 pb-3">
            <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-4 h-10">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-300 flex-shrink-0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar producto..."
                className="flex-1 bg-transparent text-[14px] font-medium outline-none text-gray-800"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-gray-300 hover:text-gray-600 transition-colors flex-shrink-0" aria-label="Limpiar busqueda">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              )}
            </div>
          </div>
        )}

        {visibleChips.length > 0 && (
          <div className="flex gap-5 px-5 pb-2 overflow-x-auto scrollbar-hide">
            {visibleChips.map(chip => (
              <button
                key={chip.id}
                onClick={() => setFilter(filter === chip.value ? '' : chip.value)}
                className="relative flex-shrink-0 py-2 text-[11px] font-black uppercase tracking-[0.08em] transition-colors"
                style={{ color: filter === chip.value ? '#ff2d78' : darkMode ? '#bdaeb8' : '#8a8f98' }}
              >
                {chip.label}
                {filter === chip.value && <span className="absolute left-0 right-0 -bottom-0.5 mx-auto h-0.5 rounded-full bg-[#ff2d78]" />}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 px-4 pt-4 pb-24 overflow-visible">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(n => <div key={n} className="bg-gray-100 rounded-[22px] aspect-[3/4] animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {products.map((p, idx) => {
              const liked = Boolean(favorites[p.id]);
              return (
                <ProductCard
                  key={p.id}
                  product={p}
                  index={idx}
                  liked={liked}
                  reserved={Boolean(reservedMap[String(p.id)])}
                  darkMode={darkMode}
                  onSelect={onProductSelect}
                  onToggleFavorite={toggleFavorite}
                />
              );
            })}
          </div>
        )}

        {loadingMore && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            {[1, 2].map(n => <div key={n} className="bg-gray-100 rounded-[22px] aspect-[3/4] animate-pulse" />)}
          </div>
        )}
        <div ref={loadMoreRef} className="h-20 w-full" />
      </div>

      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 w-[min(260px,calc(100%-40px))] h-[42px] rounded-[21px] bg-white border border-gray-100 shadow-[0_10px_25px_rgba(0,0,0,0.10)] flex items-center justify-around px-1.5">
        <button onClick={() => setSearchOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#ff2d78]" aria-label="Tienda">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5 12 4l8 6.5"/><path d="M6.5 9.5V20h11V9.5"/><path d="M9 20v-6h6v6"/></svg>
        </button>
        <button onClick={openSearch} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400" aria-label="Buscar">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
        <button onClick={openFavorites} className="relative w-8 h-8 rounded-lg flex items-center justify-center text-gray-400" aria-label="Favoritos">
          <svg width="17" height="17" viewBox="0 0 24 24" fill={favoriteCount ? '#ff2d78' : 'none'} stroke={favoriteCount ? '#ff2d78' : 'currentColor'} strokeWidth="2.4"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          {favoriteCount > 0 && <span className="absolute top-0.5 right-0.5 min-w-4 h-4 rounded-full bg-[#ff2d78] text-white text-[9px] font-black flex items-center justify-center">{favoriteCount}</span>}
        </button>
        <button onClick={() => onOpenProfile()} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400" aria-label="Mi perfil">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </button>
      </nav>
    </div>
  );
}

const ProductCard = memo(function ProductCard({
  product,
  index,
  liked,
  reserved,
  darkMode,
  onSelect,
  onToggleFavorite,
}: {
  product: Product;
  index: number;
  liked: boolean;
  reserved: boolean;
  darkMode?: boolean;
  onSelect: (product: Product) => void;
  onToggleFavorite: (product: Product) => void;
}) {
  const image = product.images[0];
  const fallbackSrc = storeImageFallbackUrl(image, 'thumb');
  const [imageSrc, setImageSrc] = useState(() => storeDirectThumbUrl(image));

  useEffect(() => {
    setImageSrc(storeDirectThumbUrl(image));
  }, [image]);

  return (
    <article>
      <div
        onClick={() => product.stock > 0 && !reserved && onSelect(product)}
        className="relative aspect-[3/4] rounded-[22px] bg-gray-100 overflow-hidden cursor-pointer"
        style={{ boxShadow: darkMode ? 'none' : '0 2px 10px rgba(0,0,0,0.06)' }}
      >
        <img
          src={imageSrc}
          alt={product.title}
          loading={index < 2 ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={index === 0 ? 'high' : 'low'}
          width={260}
          height={347}
          onError={() => {
            if (imageSrc !== fallbackSrc) setImageSrc(fallbackSrc);
          }}
          className="w-full h-full object-cover"
        />
        <button
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(product);
          }}
          className="absolute right-2 bottom-2 w-7 h-7 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm active:scale-90 transition-transform"
          aria-label={liked ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={liked ? '#ff2d78' : 'none'} stroke={liked ? '#ff2d78' : '#ff2d78'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
        {product.stock === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="absolute inset-0 bg-black/35" />
            <span className="relative bg-red-600 text-white text-[10px] font-black px-4 py-2 rounded-lg uppercase tracking-widest shadow-lg -rotate-12">Vendido</span>
          </div>
        ) : reserved ? (
          <div className="absolute inset-0 bg-amber-50/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1">
            <span className="bg-amber-500 text-white text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest">Reservado</span>
          </div>
        ) : null}
      </div>
      <p className="mt-2 px-1 font-black text-[14px] leading-none" style={{ color: '#ff2d78' }}>
        {product.price} <span className="text-[10px] text-gray-400 font-bold">Bs</span>
      </p>
    </article>
  );
});
