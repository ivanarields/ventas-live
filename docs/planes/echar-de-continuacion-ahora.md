# Echar de continuación ahora

Documento informativo para continuar esta conversación sin perder contexto.

## Estado general

La app ya fue reseteada de datos y se subieron a `main` varias correcciones de tienda, pagos, perfil, IA y fechas.

Después del push, quedaron cambios nuevos locales sin subir:

- `server.ts`
- `src/routes/ai-gateway.ts`
- `src/storefront-v2/components/Checkout.tsx`
- `docs/planes/codex-task-12-verificacion-flujo-pagos-etiquetas-casilleros.md`

También hay archivos locales sueltos de logs/backups que no son parte de la app y no se deben subir sin revisar.

## Cambios ya trabajados

### Tienda y checkout

- La tienda crea pedido al entrar al pago QR.
- El checkout volvió a `60` segundos.
- La reserva del pedido volvió a `1` minuto.
- Producto comprado debe quedar con `stock = 0` y `available = false`.
- Producto vendido no debe poder abrirse ni comprarse.

### Cruce automático de pago QR

Se está corrigiendo el flujo donde MacroDroid recibe el pago, pero la tienda no muestra `Pago Verificado`.

Estado actual del código:

- MacroDroid manda el pago a `/api/store/ingest-bank`.
- El cruce bancario busca pedidos recientes por monto.
- La ventana bancaria quedó en `2` minutos.
- El cruce ahora permite rescatar pedidos recientes con estado `pending` o `cancelled`.
- La confirmación también permite pasar de `pending` o `cancelled` a `paid`.

Motivo del cambio:

- En pruebas reales, el pago entraba a la app, pero el pedido quedaba `cancelled`.
- Por eso el pago aparecía como recibido, pero no se cruzaba con el pedido de tienda.

### Perfil y mensaje automático

- El link del mensaje automático de tienda apunta a:

```txt
/tienda#profile/orders
```

- El perfil de tienda abre primero en `Pedidos`.
- El mensaje automático usa el perfil del cliente para ver sus pedidos.

### Pagos

- El pago manual ahora guarda siempre la fecha elegida.
- Ya no debe mezclar pagos de fechas diferentes.
- Pagos de tienda muestran etiqueta `WEB`.

### IA de producto

- Se corrigió el parser de JSON para `Rellenar con IA`.
- Ahora intenta extraer un JSON balanceado real aunque la IA devuelva texto extra.
- Si vuelve a fallar, hay que revisar la respuesta cruda de la IA.

## Problema actual

El problema pendiente más importante es:

```txt
Pago QR de tienda llega por MacroDroid, pero no siempre se cruza automáticamente con el pedido de tienda.
```

La prueba real mostró:

- pago de `3 Bs` sí aparece en pagos
- pedido de tienda quedó `cancelled`
- no apareció `Pago Verificado` en la pantalla del QR

La corrección local actual intenta resolver eso permitiendo que el pago rescate el pedido si se canceló justo antes o durante el webhook.

## Qué falta hacer ahora

1. Probar otra compra rápida de tienda con pago QR.
2. Confirmar si la pantalla QR muestra `Pago Verificado`.
3. Confirmar que el pedido cambia a `paid`.
4. Confirmar que aparece pago `WEB` en la app principal.
5. Confirmar que el producto queda vendido/no comprable.
6. Si funciona, hacer commit y push de los cambios locales.
7. Si no funciona, revisar el registro exacto del último `payment_events` y el `store_order` relacionado.

## Qué no hacer

- No borrar datos todavía.
- No tocar productos reales sin necesidad.
- No subir logs/backups.
- No cambiar más el tiempo sin verificar primero el cruce.

## Archivos clave

- `server.ts`
- `src/storefront-v2/components/Checkout.tsx`
- `src/routes/ai-gateway.ts`
- `src/components/PaymentHistoryTape.tsx`
- `src/storefront-v2/components/ProductGallery.tsx`
- `src/storefront-v2/components/StoreProfile.tsx`

## Siguiente paso recomendado

Hacer una prueba real nueva con una prenda barata:

```txt
1. Comprar en tienda.
2. Pagar QR rápido.
3. Esperar en la pantalla QR.
4. Confirmar si aparece Pago Verificado.
5. Revisar si el pedido queda paid o cancelled.
```

Si falla, no seguir cambiando a ciegas. Hay que mirar el último pago recibido y el pedido exacto por ID.
