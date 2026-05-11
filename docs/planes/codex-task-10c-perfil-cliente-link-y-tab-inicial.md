# Perfil de clienta: link correcto y tab inicial de pedidos

Lee primero los archivos indicados. No toques nada fuera de estos bloques.

Objetivo:
- El mensaje automático debe llevar al perfil de la clienta.
- Al abrir el perfil, debe mostrarse primero el sector de pedidos/prendas.

---

## Archivos a leer antes de empezar

- `server.ts`
- `src/storefront-v2/StorefrontApp.tsx`
- `src/storefront-v2/components/StoreProfile.tsx`

---

## CAMBIO 1 - Abrir el perfil en la pestaña de pedidos

**Archivo:** `src/storefront-v2/components/StoreProfile.tsx`

Buscar exactamente esto:
```tsx
  const [tab, setTab] = useState<Tab>(initialTab ?? 'saved');
```

Reemplazar con:
```tsx
  const [tab, setTab] = useState<Tab>(initialTab ?? 'orders');
```

Buscar exactamente esto:
```tsx
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'saved', label: 'Favoritos' },
    { id: 'orders', label: 'Pedidos' },
    { id: 'entrega', label: 'Entrega' },
    { id: 'confirmar', label: 'Confirmar' },
    { id: 'settings', label: 'Ajustes' },
  ];
```

Reemplazar con:
```tsx
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'orders', label: 'Pedidos' },
    { id: 'saved', label: 'Favoritos' },
    { id: 'confirmar', label: 'Confirmar' },
    { id: 'entrega', label: 'Entrega' },
    { id: 'settings', label: 'Ajustes' },
  ];
```

---

## CAMBIO 2 - Link del mensaje de compra de tienda al perfil correcto

**Archivo:** `server.ts`

Buscar exactamente esto:
```ts
          const profileLink = `${storeBase}/tienda#profile`;
```

Reemplazar con:
```ts
          const profileLink = `${storeBase}/tienda#profile/orders`;
```

---

## CAMBIO 3 - Link del mensaje de confirmacion live al sector correcto

**Archivo:** `server.ts`

Buscar exactamente esto:
```ts
      const storeLink = `${storeBase}/tienda#profile/confirmar`;
```

Reemplazar con:
```ts
      const storeLink = `${storeBase}/tienda#profile/confirmar`;
```

No cambiar este link si el flujo Live debe seguir entrando a confirmar prendas. Solo verificar que el perfil ya abra en `orders` por defecto.

---

## Verificacion

1. Abrir un perfil de clienta y confirmar que entra primero a `Pedidos`.
2. Confirmar que el link del mensaje de tienda abre el perfil correcto.
3. Confirmar que el flow Live sigue entrando a `Confirmar` cuando usa ese subtab.
