# Etiqueta WEB y productos ya vendidos no comprables

Lee primero los archivos indicados. No toques nada fuera de estos bloques.

Objetivo:
- Toda compra de tienda debe verse como `WEB` en la vista de pagos.
- Un producto comprado y verificado no debe seguir comprable.
- La UI de tienda no debe dejar entrar a un producto ya vendido.

---

## Archivos a leer antes de empezar

- `server.ts`
- `src/components/PaymentHistoryTape.tsx`
- `src/components/AdminTiendaView.tsx`
- `src/storefront-v2/components/ProductGallery.tsx`
- `src/storefront-v2/components/ProductDetail.tsx`

---

## CAMBIO 1 - Marcar productos vendidos como desactivados

**Archivo:** `server.ts`

Buscar exactamente esto:
```ts
        await supabaseStore.from('products').update({ stock: 0 }).in('id', productIds);
```

Reemplazar con:
```ts
        await supabaseStore.from('products').update({ stock: 0, available: false }).in('id', productIds);
```

---

## CAMBIO 2 - Mostrar etiqueta WEB en el historial de pagos

**Archivo:** `src/components/PaymentHistoryTape.tsx`

Buscar exactamente esto:
```tsx
                <span style={{ fontSize: '16px', fontWeight: 900, color: isActive ? accentColor : '#94a3b8', lineHeight: 1 }}>
                  {payment.amount}
                </span>
                <span style={{ fontSize: '9px', color: isActive ? mutedColor : '#cbd5e1', marginTop: '4px', fontWeight: 700, textTransform: 'uppercase' }}>
                  {formattedTime}
                </span>
```

Reemplazar con:
```tsx
                <span style={{ fontSize: '16px', fontWeight: 900, color: isActive ? accentColor : '#94a3b8', lineHeight: 1 }}>
                  {payment.amount}
                </span>
                <span style={{ fontSize: '9px', color: isActive ? mutedColor : '#cbd5e1', marginTop: '4px', fontWeight: 700, textTransform: 'uppercase' }}>
                  {formattedTime}
                </span>
                {payment.method === 'Tienda Online' && (
                  <span style={{ marginTop: '4px', fontSize: '8px', fontWeight: 900, color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: '999px', textTransform: 'uppercase' }}>
                    WEB
                  </span>
                )}
```

---

## CAMBIO 3 - No dejar tocar un producto vendido desde la grilla

**Archivo:** `src/storefront-v2/components/ProductGallery.tsx`

Buscar exactamente esto:
```tsx
                    onClick={() => !reservedMap[String(p.id)] && onProductSelect(p)}
```

Reemplazar con:
```tsx
                    onClick={() => p.stock > 0 && !reservedMap[String(p.id)] && onProductSelect(p)}
```

---

## Verificacion

1. Confirmar que un pedido WEB confirmado deja el producto con `stock = 0` y `available = false`.
2. Abrir la vista de pagos y confirmar que la compra de tienda muestra `WEB`.
3. Abrir la grilla de tienda y confirmar que un producto vendido no abre detalle.
4. Confirmar que un producto reservado sigue bloqueado mientras dura la reserva.
