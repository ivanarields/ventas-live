# 01 - App Principal Y Operacion Del Panel

Actualizado: 2026-05-20.

Este documento explica lo que ve y hace el operador en el panel principal.

## Pestañas principales

| Pestaña | Para que sirve |
|---|---|
| Inicio | Resumen rapido, acceso al panel tienda y estado general |
| Entrega | Pedidos listos, etiquetas activas y entrega final |
| Pagos | Pagos normales, pagos Live, pagos Web y revision manual |
| Finanzas | Resumen financiero |
| Tienda | Productos, pedidos web, clientes, confirmaciones y configuracion |
| Config | WhatsApp oficial, etiquetas y configuracion general |

## Login del operador

El operador puede entrar con:

```text
leidycandy
7020
```

El endpoint usado es `/api/auth/simple-login`. Entra al usuario dueño real de la app, no a una cuenta nueva vacia.

## Estados principales de pedidos

| Estado | Que significa |
|---|---|
| `procesar` | Pedido confirmado y pendiente de preparar/contar |
| `listo` / `ready` | Pedido preparado y con etiqueta asignada |
| `entregado` / `delivered` | Pedido entregado a la clienta; la etiqueta se libera |
| `cancelled` | Pedido cancelado o rechazado |

## Etiquetas numericas y alfabeticas

Las etiquetas se asignan cuando un pedido pasa a listo/preparado.

Regla operativa:

- Pedido en `procesar`: todavia no debe ocupar etiqueta fisica.
- Pedido listo con 1 bolsa: usa etiqueta numerica.
- Pedido listo con 2 o mas bolsas: usa etiqueta alfabetica.
- Si una clienta ya tiene una etiqueta alfabetica activa, sus nuevos pedidos pueden heredar esa misma letra.
- El operador no elige la etiqueta manualmente; el sistema la asigna.
- Al marcar entregado, la etiqueta se libera.

La liberacion ocurre cuando el pedido se marca como entregado desde Entrega o desde el perfil. El sistema llama la logica de liberacion y limpia la etiqueta activa del cliente si ya no quedan pedidos activos.

## Flujo de entrega

1. El pedido confirmado entra en `procesar`.
2. El operador prepara y cuenta las prendas.
3. Al marcar listo, el sistema asigna etiqueta.
4. El pedido aparece en Entrega.
5. Al entregar, el operador confirma entrega.
6. El pedido pasa a entregado.
7. La etiqueta queda disponible para otro pedido.

## Pagos normales, Live y Web

En la pestaña Pagos hay dos vistas importantes:

- `Live`: pagos y pedidos de venta por WhatsApp/Live.
- `Web`: pagos y pedidos de la tienda online.

La tienda online no debe mezclarse con los pagos normales del sistema principal. Los pagos web viven como pagos de tienda y se muestran separados.

## Boton Live / OFF

El boton Live controla la ventana de procesamiento de ventas Live.

Cuando Live esta encendido:

- MacroDroid puede alimentar el flujo Live.
- Los mensajes de WhatsApp dentro de la ventana se procesan como venta Live.
- Los comprobantes de Live pueden cruzarse con pagos del banco.
- Si alguien compra por tienda al mismo tiempo, la tienda tambien intenta capturar ese pago como tienda.

Cuando Live esta apagado:

- El servidor responde para Live con `live_off`.
- Eso significa que el pago no entra al flujo Live.
- Pero antes de ignorarlo para Live, el servidor intenta capturarlo para tienda si corresponde.
- Por eso una compra web puede funcionar aunque Live este apagado.

## Perfil del cliente

El perfil sirve para revisar:

- pagos;
- pedidos;
- estado del pedido;
- datos de WhatsApp;
- comprobantes y pagos pendientes;
- boton para notificar Live listo;
- confirmacion de prendas de Live cuando aplica.

Los pedidos web no deben contaminar el historial Live. En el perfil se filtran como compra web cuando corresponde.

## Acciones que debe usar el operador

Para tienda:

- Si el pago esta claro y confirmado automaticamente, no tocar.
- Si aparece en Pagos Web para revision, usar `Confirmar` o `Rechazar`.
- Si se confirma, el pedido queda pagado, se ocultan productos vendidos y se envia WhatsApp de confirmacion.
- Si se rechaza, el producto vuelve a tienda y el pedido deja de contarse como pagado.

Para Live:

- Si el pago esta verificado por MacroDroid, no tocar salvo que haya inconsistencia.
- Si aparece pendiente/revision, revisar comprobante y banco.
- Usar verificar manual solo cuando el operador confirma que el pago existe.

## Riesgo operativo conocido

En el panel Tienda existe tambien una accion de gestion de pedido como `Vendido + Ocultar`. Para pagos dudosos, el flujo recomendado es usar la revision en Pagos Web (`Confirmar` / `Rechazar`), porque ese flujo ejecuta la confirmacion completa de pago.
