# CODEX TASK 02 — Tienda: icono perfil en galería + botones QR compactos + imágenes horizontales

Ejecuta exactamente los cambios descritos abajo. No toques nada que no esté listado.

---

## CAMBIO 1 — ProductGallery.tsx: agregar icono de perfil en la barra inferior

**Archivo:** `src/storefront-v2/components/ProductGallery.tsx`

**Paso 1A — Agregar `onOpenProfile` a la interfaz Props.**

Busca:
```typescript
interface Props {
  onProductSelect: (product: Product) => void;
  onQuickBuy: (product: Product) => void;
  onBack: () => void;
  onAddToCart: (product: Product, size: string) => void;
  onOpenCart: () => void;
  cartCount: number;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
}
```

Reemplázalo por:
```typescript
interface Props {
  onProductSelect: (product: Product) => void;
  onQuickBuy: (product: Product) => void;
  onBack: () => void;
  onAddToCart: (product: Product, size: string) => void;
  onOpenCart: () => void;
  onOpenProfile: () => void;
  cartCount: number;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
}
```

**Paso 1B — Agregar `onOpenProfile` a la desestructuración del componente.**

Busca:
```typescript
export function ProductGallery({ onProductSelect, onBack, onOpenCart, cartCount, darkMode, onToggleDarkMode }: Props) {
```

Reemplázalo por:
```typescript
export function ProductGallery({ onProductSelect, onBack, onOpenCart, onOpenProfile, cartCount, darkMode, onToggleDarkMode }: Props) {
```

**Paso 1C — Agregar botón de perfil en la nav inferior.**

Busca este bloque completo (es la nav fija inferior):
```typescript
      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 w-[min(360px,calc(100%-40px))] h-11 rounded-[23px] bg-white/68 backdrop-blur-xl border border-white/70 shadow-[0_14px_35px_rgba(0,0,0,0.12)] flex items-center justify-around">
        <button onClick={() => { setSearchOpen(false); setFavoritesOpen(false); }} className="w-10 h-10 rounded-xl flex items-center justify-center text-[#ff2d78]" aria-label="Tienda">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5 12 4l8 6.5"/><path d="M6.5 9.5V20h11V9.5"/><path d="M9 20v-6h6v6"/></svg>
        </button>
        <button onClick={openSearch} className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400" aria-label="Buscar">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
        <button onClick={openFavorites} className="relative w-10 h-10 rounded-xl flex items-center justify-center text-gray-400" aria-label="Favoritos">
          <svg width="19" height="19" viewBox="0 0 24 24" fill={favoriteCount ? '#ff2d78' : 'none'} stroke={favoriteCount ? '#ff2d78' : 'currentColor'} strokeWidth="2.4"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          {favoriteCount > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 rounded-full bg-[#ff2d78] text-white text-[9px] font-black flex items-center justify-center">{favoriteCount}</span>}
        </button>
      </nav>
```

Reemplázalo por (agrega el botón de perfil al final, antes de cerrar la nav):
```typescript
      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 w-[min(360px,calc(100%-40px))] h-11 rounded-[23px] bg-white/68 backdrop-blur-xl border border-white/70 shadow-[0_14px_35px_rgba(0,0,0,0.12)] flex items-center justify-around">
        <button onClick={() => { setSearchOpen(false); setFavoritesOpen(false); }} className="w-10 h-10 rounded-xl flex items-center justify-center text-[#ff2d78]" aria-label="Tienda">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5 12 4l8 6.5"/><path d="M6.5 9.5V20h11V9.5"/><path d="M9 20v-6h6v6"/></svg>
        </button>
        <button onClick={openSearch} className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400" aria-label="Buscar">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
        <button onClick={openFavorites} className="relative w-10 h-10 rounded-xl flex items-center justify-center text-gray-400" aria-label="Favoritos">
          <svg width="19" height="19" viewBox="0 0 24 24" fill={favoriteCount ? '#ff2d78' : 'none'} stroke={favoriteCount ? '#ff2d78' : 'currentColor'} strokeWidth="2.4"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          {favoriteCount > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 rounded-full bg-[#ff2d78] text-white text-[9px] font-black flex items-center justify-center">{favoriteCount}</span>}
        </button>
        <button onClick={onOpenProfile} className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400" aria-label="Mi perfil">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </button>
      </nav>
```

---

## CAMBIO 2 — StorefrontApp.tsx: pasar onOpenProfile a ProductGallery

**Archivo:** `src/storefront-v2/StorefrontApp.tsx`

Busca:
```typescript
              <ProductGallery
                onProductSelect={handleProductSelect}
                onQuickBuy={handleQuickBuy}
                onBack={() => setView('welcome')}
                onAddToCart={addToCart}
                onOpenCart={() => setView('cart')}
                cartCount={cartCount(cart)}
                darkMode={darkMode}
                onToggleDarkMode={toggleDarkMode}
              />
```

Reemplázalo por:
```typescript
              <ProductGallery
                onProductSelect={handleProductSelect}
                onQuickBuy={handleQuickBuy}
                onBack={() => setView('welcome')}
                onAddToCart={addToCart}
                onOpenCart={() => setView('cart')}
                onOpenProfile={() => setView('profile')}
                cartCount={cartCount(cart)}
                darkMode={darkMode}
                onToggleDarkMode={toggleDarkMode}
              />
```

---

## CAMBIO 3 — Checkout.tsx: botones "Descargar QR" y "Ya pagué" más compactos

**Archivo:** `src/storefront-v2/components/Checkout.tsx`

Busca este bloque completo (los dos botones dentro del div `w-full space-y-2`):
```typescript
          {/* Acciones */}
          <div className="w-full space-y-2">
            {!expired ? (
              <>
                <button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = '/api/store/download-qr';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="w-full h-12 rounded-2xl font-black text-white text-[14px] shadow-[0_8px_20px_rgb(255,45,120,0.3)] active:scale-95 transition-all flex items-center justify-center gap-2"
                  style={{ background: BRAND }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  Descargar QR
                </button>

                <button
                  onClick={sendWA}
                  className="w-full h-12 rounded-2xl font-black text-[13px] text-gray-700 bg-white border border-gray-100 shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <span className="text-lg">💬</span>
                  Ya pagué, enviar comprobante
                </button>
              </>
            ) : (
```

Reemplázalo por:
```typescript
          {/* Acciones */}
          <div className="w-full">
            {!expired ? (
              <div className="flex gap-2.5 justify-center">
                <button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = '/api/store/download-qr';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="h-11 px-5 rounded-2xl font-black text-white text-[13px] shadow-[0_6px_16px_rgb(255,45,120,0.28)] active:scale-95 transition-all flex items-center gap-1.5"
                  style={{ background: BRAND }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  Descargar QR
                </button>
                <button
                  onClick={sendWA}
                  className="h-11 px-5 rounded-2xl font-black text-[13px] text-gray-700 bg-white border border-gray-100 shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <span>💬</span>
                  Ya pagué
                </button>
              </div>
            ) : (
```

---

## CAMBIO 4 — Checkout.tsx: mostrar imágenes horizontales cuando hay más de 1 prenda

**Archivo:** `src/storefront-v2/components/Checkout.tsx`

Busca este bloque completo (es el resumen del pedido con imagen y texto):
```typescript
          <div
            className="w-full mb-3 rounded-3xl border shadow-sm p-2.5 flex items-center gap-3 text-left"
            style={{
              background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
              borderColor: darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.75)',
            }}
          >
            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#fff0f5] flex-shrink-0">
              {primaryImage ? (
                <img src={storeImageUrl(primaryImage, 'thumb')} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#ff2d78] font-black">LA</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Resumen</p>
              <p className="text-[13px] font-black text-gray-900 truncate">
                {itemCount > 1
                  ? `${primaryItem?.product.title ?? 'Pedido'} + ${itemCount - 1} prenda${itemCount - 1 === 1 ? '' : 's'}`
                  : (primaryItem ? primaryItem.product.title : 'Pedido Leidy American')}
              </p>
              <p className="text-[11px] font-bold text-gray-500">
                {itemCount > 1 ? `${itemCount} prendas en total` : '1 prenda'} - Retiro coordinado
              </p>
            </div>
          </div>
```

Reemplázalo por:
```typescript
          {itemCount > 1 ? (
            <div
              className="w-full mb-3 rounded-3xl border shadow-sm p-3"
              style={{
                background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
                borderColor: darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.75)',
              }}
            >
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-2">Resumen · {itemCount} prendas</p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {items.flatMap(item =>
                  Array.from({ length: item.quantity }, (_, qi) => ({ img: item.product.images?.[0], title: item.product.title, key: `${item.product.id}-${qi}` }))
                ).map(({ img, title, key }) => (
                  <div key={key} className="flex-shrink-0 w-16 h-20 rounded-2xl overflow-hidden bg-[#fff0f5]">
                    {img ? (
                      <img src={storeImageUrl(img, 'thumb')} alt={title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#ff2d78] font-black text-[10px]">LA</div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[11px] font-bold text-gray-500 mt-1.5">Retiro coordinado</p>
            </div>
          ) : (
            <div
              className="w-full mb-3 rounded-3xl border shadow-sm p-2.5 flex items-center gap-3 text-left"
              style={{
                background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
                borderColor: darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.75)',
              }}
            >
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#fff0f5] flex-shrink-0">
                {primaryImage ? (
                  <img src={storeImageUrl(primaryImage, 'thumb')} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#ff2d78] font-black">LA</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Resumen</p>
                <p className="text-[13px] font-black text-gray-900 truncate">
                  {primaryItem ? primaryItem.product.title : 'Pedido Leidy American'}
                </p>
                <p className="text-[11px] font-bold text-gray-500">1 prenda - Retiro coordinado</p>
              </div>
            </div>
          )}
```

---

## NO TOCAR

- No toques ningún otro archivo
- No toques el WelcomeScreen en StorefrontApp.tsx
- No toques server.ts ni ningún endpoint
- No toques ningún otro componente

---

## Verificación esperada

Después de los cambios, correr:
```
git diff --stat
```
Debe mostrar exactamente 3 archivos modificados:
- `src/storefront-v2/components/ProductGallery.tsx`
- `src/storefront-v2/components/Checkout.tsx`
- `src/storefront-v2/StorefrontApp.tsx`
