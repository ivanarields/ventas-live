# CODEX TASK 01 — Tienda: QR download + quitar botón perfil en galería

Ejecuta exactamente los cambios descritos abajo. No toques nada que no esté listado.

---

## CAMBIO 1 — server.ts: agregar endpoint de descarga del QR

**Archivo:** `server.ts`

**Busca este bloque** (aproximadamente en la línea que dice `/api/store/pending-manual`):
```
  app.get('/api/store/pending-manual',
```

**Agrega ANTES de esa línea:**
```typescript
  app.get('/api/store/download-qr', (_req, res) => {
    const qrPath = require('path').join(process.cwd(), 'public', 'qr-yape.jpg');
    res.setHeader('Content-Disposition', 'attachment; filename="QR-Yape.jpg"');
    res.setHeader('Content-Type', 'image/jpeg');
    res.sendFile(qrPath);
  });

```

---

## CAMBIO 2 — Checkout.tsx: usar el endpoint en vez de blob

**Archivo:** `src/storefront/components/Checkout.tsx`

**Busca y reemplaza este bloque completo** (es el onClick del botón "Descargar QR"):
```typescript
                  onClick={async () => {
                    try {
                      const blob = await fetch('/qr-yape.jpg').then(r => r.blob());
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = 'QR-Leidy-Candy.jpg';
                      link.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } catch {
                      const link = document.createElement('a');
                      link.href = '/qr-yape.jpg';
                      link.download = 'QR-Leidy-Candy.jpg';
                      link.click();
                    }
                  }}
```

**Reemplázalo por:**
```typescript
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = '/api/store/download-qr';
                    link.click();
                  }}
```

**Razón:** El servidor responde con `Content-Disposition: attachment`, así que el navegador descarga el archivo sin navegar fuera de la página. Funciona en iOS y Android.

---

## CAMBIO 3 — ProductGallery.tsx: quitar el botón de perfil del header

**Archivo:** `src/storefront/components/ProductGallery.tsx`

**Busca y elimina este bloque completo** (es el botón con el ícono de persona):
```typescript
            <button
              onClick={onOpenProfile}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </button>
```

**También en la misma línea de la interfaz Props** (arriba en el archivo), busca y elimina:
```typescript
  onOpenProfile: () => void;
```

**Y en la desestructuración del componente**, busca:
```typescript
export function ProductGallery({ onProductSelect, onQuickBuy, onBack, onAddToCart, onOpenCart, onOpenProfile, cartCount }:
```
Reemplázalo por (sin `onOpenProfile`):
```typescript
export function ProductGallery({ onProductSelect, onQuickBuy, onBack, onAddToCart, onOpenCart, cartCount }:
```

---

## NO TOCAR

- No toques ningún otro archivo
- No toques los endpoints existentes de server.ts
- No toques el carrito, los favoritos, ni ningún otro componente
- No toques el WelcomeScreen en StorefrontApp.tsx

---

## Verificación esperada

Después de los cambios, correr:
```
git diff --stat
```
Debe mostrar exactamente 3 archivos modificados: `server.ts`, `src/storefront/components/Checkout.tsx`, `src/storefront/components/ProductGallery.tsx`.
