# Verificación de flujo de pagos, etiquetas y casilleros

Lee primero los archivos indicados. No cambies código. Este documento es solo para probar lógica y conexiones.

Objetivo:
- Confirmar el flujo completo de pago.
- Confirmar la fecha correcta de los pagos.
- Confirmar etiquetas, casilleros y mensajes.
- Confirmar que las conexiones recientes siguen bien.

---

## Archivos a leer antes de empezar

- `server.ts`
- `src/App.tsx`
- `src/components/PanelPedidos.tsx`
- `src/components/PaymentHistoryTape.tsx`
- `src/routes/ai-gateway.ts`
- `src/routes/whatsapp.ts`
- `src/storefront-v2/StorefrontApp.tsx`
- `src/storefront-v2/components/Checkout.tsx`
- `src/storefront-v2/components/StoreProfile.tsx`
- `src/storefront-v2/components/ProductGallery.tsx`
- `src/components/AdminTiendaView.tsx`

---

## Pruebas que debe hacer Qwen

### 1) Flujo de pago

- Confirmar que un pago entra al sistema correcto.
- Confirmar que el pago se registra una sola vez.
- Confirmar que no se duplica si llega dos veces el mismo evento.
- Confirmar que el flujo de confirmación no rompe la UI.

### 2) Fecha de pagos

- Crear un pago manual para hoy.
- Crear otro pago manual para otra fecha.
- Confirmar que quedan separados por fecha.
- Confirmar que no se agrupan por error en el mismo día.

### 3) Etiquetas

- Confirmar que un pago de tienda muestra `WEB`.
- Confirmar que un pago de tienda no se ve igual que un pago manual.
- Confirmar que un pago automático y uno manual no quedan confundidos.

### 4) Casilleros

- Probar un flujo con casillero numérico.
- Probar un flujo con casillero alfabético.
- Confirmar que cada uno entra al lugar correcto.
- Confirmar que el casillero no rompe el cruce del pago.

### 5) Tienda

- Confirmar que un producto ya comprado no se puede volver a comprar.
- Confirmar que el checkout sigue con 90 segundos.
- Confirmar que el perfil abre en `Pedidos`.
- Confirmar que el mensaje automático lleva al perfil correcto.

### 6) Mensajes y verificación

- Confirmar que el mensaje automático de tienda sale con el link correcto.
- Confirmar que el comprobante con código cruza bien.
- Confirmar que el comprobante sin código no cruza mal.
- Confirmar que el error de IA en producto sigue mostrando mensaje legible.

---

## Qué no debe hacer Qwen

- No editar código.
- No borrar datos.
- No tocar producción.
- No cambiar configuración.

---

## Qué sí debes hacer tú

- Pago real por MacroDroid.
- Pago manual real con número.
- Verificación real de WhatsApp.
- Confirmación final en la tienda y en el sistema principal.

---

## Verificación final

1. Correr `npm run build`.
2. Hacer cada prueba de la lista.
3. Anotar qué pasó en cada una.
4. Si algo falla, reportar archivo y paso exacto.
