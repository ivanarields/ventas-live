# Verificación total de correcciones

Lee primero los archivos indicados. No toques código. Este documento es solo para probar que todo quedó bien.

Objetivo:
- Confirmar que las 5 correcciones anteriores funcionan.
- Detectar fallas antes de mover nada a producción.

---

## Archivos a leer antes de empezar

- `server.ts`
- `src/App.tsx`
- `src/routes/ai-gateway.ts`
- `src/components/AdminTiendaView.tsx`
- `src/components/PaymentHistoryTape.tsx`
- `src/storefront-v2/StorefrontApp.tsx`
- `src/storefront-v2/components/Checkout.tsx`
- `src/storefront-v2/components/ProductGallery.tsx`
- `src/storefront-v2/components/StoreProfile.tsx`

---

## Pruebas a ejecutar

### 1) Checkout y comprobante

- Abrir la tienda.
- Iniciar un checkout.
- Confirmar que el contador usa 90 segundos.
- Confirmar que al llegar al límite el producto vuelve a quedar disponible si no llega comprobante.
- Enviar un comprobante con código `#PEDIDO`.
- Confirmar que el sistema lo toma para revisión/manual o cruce correcto.

### 2) Tienda WEB y producto no comprable

- Comprar un producto de la tienda.
- Confirmar que queda en `stock = 0` y `available = false`.
- Volver a abrir la galería.
- Confirmar que el producto vendido no se puede tocar ni comprar.
- Confirmar que en el historial de pagos aparece la etiqueta `WEB` para pagos de `Tienda Online`.

### 3) Perfil de clienta

- Abrir un perfil de tienda desde el mensaje automático.
- Confirmar que entra primero a `Pedidos`.
- Confirmar que el link usado apunta a `#profile/orders`.
- Confirmar que el subtab `confirmar` sigue funcionando para el flujo Live.

### 4) Pago manual por fecha

- Crear un pago manual para hoy.
- Crear otro pago manual para otra fecha.
- Confirmar que quedan en grupos separados.
- Confirmar que el sistema no mezcla una fecha con otra.

### 5) Rellenar con IA

- Subir 3 fotos en `Editar producto`.
- Tocar `Rellenar con IA`.
- Confirmar que no aparece el error crudo de JSON.
- Confirmar que, si la IA falla, el mensaje es legible.
- Confirmar que el formulario sigue vivo después del error.

---

## Verificación final

1. Correr `npm run build`.
2. Probar cada flujo arriba.
3. Si algo falla, anotar archivo y paso exacto.
4. No hacer cambios hasta tener el fallo reproducido.
