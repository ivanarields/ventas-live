# Verificar match automatico QR de tienda

Modo: solo verificacion tecnica. No cambiar codigo.

Objetivo:
- Confirmar si la correccion local del match QR/MacroDroid esta lista para probar.
- Verificar que el pago QR de tienda pueda cruzarse con el pedido correcto.
- Detectar por que un pago recibido queda gris o no muestra `Pago Verificado`.

## Contexto actual

El problema observado:

- Se compra una prenda en tienda.
- La pantalla QR muestra un pedido, por ejemplo `#111` o `#112`.
- Se paga rapido el monto exacto.
- MacroDroid recibe el pago.
- El pago aparece en la app principal.
- Pero la pantalla QR no muestra `Pago Verificado`.
- El pedido de tienda queda `cancelled`.

Cambios locales recientes:

- `server.ts`
  - reserva de tienda: `RESERVATION_MINUTES = 1`
  - match bancario: `windowMinutes: 2`
  - el match busca pedidos recientes con estado `pending` o `cancelled`
  - `confirmStoreOrder` puede rescatar pedidos `pending` o `cancelled`

- `src/storefront-v2/components/Checkout.tsx`
  - contador QR: `PAYMENT_SECONDS = 60`

## Archivos a leer

- `server.ts`
- `src/storefront-v2/components/Checkout.tsx`
- `src/storefront-v2/services/storeOrdersApi.ts`
- `src/components/PaymentHistoryTape.tsx`
- `src/lib/supabaseStore.ts`
- `src/lib/supabaseServer.ts`

## Pruebas tecnicas obligatorias

### 1) Verificar codigo del match

Confirmar en `server.ts`:

- `tryMatchOrder` busca en `store_orders`
- usa monto exacto
- busca estados `pending` y `cancelled`
- usa ventana de `2` minutos para `/api/store/ingest-bank`
- si encuentra un pedido, llama a `confirmStoreOrder`
- `confirmStoreOrder` cambia el pedido a `paid`

### 2) Verificar status que lee la pantalla QR

Confirmar en `Checkout.tsx`:

- la pantalla consulta `/api/store-orders/:id/status`
- si el status es `paid` o `confirmed`, muestra `Pago Verificado`
- el polling sigue activo mientras esta en pantalla de pago

### 3) Verificar endpoint de estado

Confirmar en `server.ts`:

- `/api/store-orders/:id/status` lee `store_orders`
- devuelve `status`
- si el pedido cambia a `paid`, la tienda deberia verlo

### 4) Verificar por que puede quedar gris

Revisar si hay una de estas causas:

- MacroDroid envia a produccion pero la tienda local crea el pedido en otra base.
- MacroDroid envia el pago a otro endpoint distinto.
- `payment_events` se guarda en una base y `store_orders` se lee en otra.
- el monto llega como texto raro y no coincide con `total`.
- el pedido ya no esta en la ventana de tiempo.
- el pedido cambia a `cancelled` antes de que llegue el pago.
- el frontend esta mirando un pedido distinto al que se marco `paid`.

### 5) Verificar estado local vs produccion

Reportar claramente:

- a que Supabase apunta `supabaseStore`
- a que Supabase apunta `supabaseServer`
- si local esta usando bases reales o placeholders
- si MacroDroid esta enviando al servidor local o al servidor de produccion

No mostrar secretos completos. Solo nombres/refs del proyecto.

### 6) Prueba simulada sin pago real

Si es posible sin tocar codigo:

- crear o ubicar un pedido reciente de tienda `pending`
- simular un POST a `/api/store/ingest-bank` con el mismo monto
- confirmar que responde `matched: true`
- confirmar que el pedido queda `paid`
- confirmar que `/api/store-orders/:id/status` devuelve `paid`

Si no se puede hacer sin crear datos, detenerse y reportar que requiere prueba real.

## Que no debe hacer Qwen

- No cambiar codigo.
- No borrar datos.
- No hacer push.
- No resetear base.
- No modificar productos.
- No cambiar tiempos.

## Salida esperada

Responder con:

```txt
Resultado match QR:
- Codigo listo: si/no
- Local y MacroDroid usan la misma base: si/no/no confirmado
- Endpoint correcto: si/no
- Prueba simulada: paso/fallo/no ejecutada
- Causa probable del fallo:
- Siguiente accion:
```

Si detecta el fallo exacto, reportarlo con archivo y linea aproximada.
