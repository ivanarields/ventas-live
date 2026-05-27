# Dilema: una notificacion MacroDroid para Tienda y Live

Fecha: 2026-05-16
Modo: analisis, no implementar sin autorizacion

## Objetivo

Encontrar una solucion para que la tienda online reciba y use pagos de MacroDroid sin romper el sistema principal ni el flujo Live.

El sistema principal ya funciona. No debe romperse.

## Problema real

MacroDroid manda una notificacion bancaria simple:

```txt
NOMBRE pago MONTO
```

Esa notificacion no dice si el pago es de tienda o de Live.

Hoy entra por el camino Live:

```txt
/api/ingest-notification
```

Ese camino tiene un portero:

- Live encendido: acepta pago.
- Live apagado: rechaza pago.

En el pedido tienda #269, el pago llego antes de vencer, pero Live estaba apagado. El pago fue descartado antes de que TiendaOnline pudiera guardarlo.

## Restricciones

1. No romper el sistema principal.
2. No cambiar el comportamiento correcto de LiveON/LiveOFF.
3. No confirmar pedidos de tienda solo por monto.
4. No adivinar entre varios pedidos del mismo monto.
5. Para primera compra, exigir una prueba fuerte: pedido + comprobante/mensaje con codigo.
6. Si no hay certeza, dejar pendiente en tienda para revision manual.

## Bases separadas

- Sistema principal: `ChehiAppAbril`
- Panel WhatsApp/Live: `PanelPedido`
- Tienda: `TiendaOnline`

La solucion debe guardar pagos de tienda en `TiendaOnline`, no en pagos normales del sistema principal.

## Funcionamiento correcto esperado

Para primera compra:

1. Cliente crea pedido en tienda.
2. MacroDroid recibe pago bancario.
3. Tienda guarda ese pago como pendiente, sin confirmar.
4. Cliente envia comprobante/mensaje con `#pedido`.
5. Tienda une pedido + pago + comprobante.
6. Pedido pasa a pagado.
7. Aparece en Pagos Web.
8. No aparece en pagos normales.
9. No aparece en Live.

Para compras futuras:

Puede haber automatizacion mayor si ya existe historial confiable del cliente, pero eso no debe ser la base de la primera compra.

## Soluciones descartadas

### Confirmar por monto unico

No es suficiente. Si hay tres pedidos de Bs 25, puede confirmar el pedido incorrecto.

### Confirmar por nombre

No es suficiente. El banco puede traer nombres abreviados, distintos o ambiguos.

### Confirmar por telefono solamente

No sirve para primera compra si el banco no entrega telefono o si el numero no esta confiablemente unido al pago.

### Mandar pagos de tienda al sistema principal

No. Eso contamina pagos normales y rompe la separacion.

## Soluciones posibles

### Opcion A: Inbox bancario de tienda antes del portero Live

Cuando llega MacroDroid a `/api/ingest-notification`, antes de aplicar LiveON/LiveOFF, se guarda una copia cruda en TiendaOnline como pago pendiente.

No se confirma nada todavia.

Luego, cuando llega WhatsApp con `#pedido`, TiendaOnline busca ese pago pendiente por monto/hora/nombre y confirma si coincide.

Ventaja:
- No cambia MacroDroid.
- No cambia el receiver.
- Live puede seguir rechazando pagos fuera de Live.
- Tienda no pierde pagos.

Riesgo:
- Hay que tocar el punto de entrada comun `/api/ingest-notification`.
- Debe hacerse como copia aislada, sin cambiar la logica Live existente.

### Opcion B: Receiver reenvia a dos destinos

El receiver manda la misma notificacion a:

- Live actual.
- TiendaOnline.

Ventaja:
- Separacion clara de sistemas.
- Live y tienda procesan independiente.

Riesgo:
- Toca el receiver remoto.
- Hay que cuidar reintentos, duplicados y monitoreo en dos salidas.

### Opcion C: MacroDroid tiene dos acciones

MacroDroid manda a Live y tambien a tienda.

Ventaja:
- Backend queda mas simple.

Riesgo:
- Mas fragil operativamente.
- Si el celular cambia o MacroDroid falla, se rompe mas facil.

## Recomendacion para analizar

La mejor candidata es Opcion A:

Crear una bandeja de pagos bancarios pendientes en TiendaOnline.

Nombre conceptual:

```txt
store_bank_inbox
```

O reutilizar `payment_events` si soporta bien pagos sin asignar.

Regla:

- Guardar pago bancario en tienda como pendiente.
- Nunca confirmar solo por monto.
- Confirmar solo cuando WhatsApp/comprobante traiga `#pedido` y el monto coincida.
- Si hay duda, mostrar en Pagos Web como pendiente/manual.

## Pregunta clave para otros agentes

Disenen la solucion mas segura para que una notificacion MacroDroid alimente TiendaOnline sin alterar el flujo Live existente.

La solucion debe probar:

1. Pedido tienda primera compra con Live apagado.
2. MacroDroid llega antes de comprobante.
3. Comprobante con `#pedido` llega despues.
4. Pedido queda pagado en TiendaOnline.
5. Pago aparece en Pagos Web.
6. No aparece en pagos normales.
7. No aparece en Comprobantes Live.
8. Si hay dos pedidos del mismo monto, no confirma sin `#pedido`.

## Regla final

El sistema principal decide Live.

La tienda decide tienda.

MacroDroid no sabe la diferencia. Por eso la tienda necesita una bandeja propia de pagos pendientes y el `#pedido` para confirmar con seguridad.
