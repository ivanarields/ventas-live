# Automatizacion Segura De Tienda

## Objetivo

Automatizar compras, pagos, estados y mensajes sin romper la app principal.

## Regla Principal

Primero automatizar dentro de la base de tienda.

No escribir datos nuevos en la app principal sin aprobacion.

## Automatizaciones Recomendadas

### Pedido Creado

Cuando la clienta confirma carrito:

- Crear pedido en `store_orders`.
- Reservar productos.
- Guardar WhatsApp.
- Guardar fecha y horario elegido.
- Crear mensaje listo para enviar.

### Pago Detectado

Cuando llega pago:

- Buscar pedido pendiente por monto, telefono o codigo.
- Si coincide, marcar como pagado.
- Guardar fecha de verificacion.
- Marcar productos como vendidos.
- Crear mensaje de pago confirmado.

### Pedido Listo

Cuando la duena marca listo:

- Cambiar estado a `ready`.
- Crear mensaje para la clienta.
- Mostrarlo en Mis Compras.

### Pedido Entregado

Cuando se entrega:

- Cambiar estado a `delivered`.
- Guardar fecha.
- Agregar al historial.

### Live Y Novedades

Cuando hay proximo Live:

- Mostrar aviso en portada.
- Mostrarlo en seccion de novedades.
- Opcionalmente generar mensaje para clientas.

## Modo Seguro Inicial

Primera version recomendada:

- Verificacion y estados dentro de tienda.
- Mensajes copiables.
- Historial dentro de tienda.
- Sin envio automatico obligatorio.
- Sin escribir en app principal.

## Modo Automatico Futuro

Cuando todo este probado:

- Envio automatico de mensajes.
- Recordatorios automaticos.
- Avisos de Live.
- Sincronizacion controlada con otros sistemas si se aprueba.

## Puntos Delicados

La tienda actual ya tiene partes que pueden crear pedidos y pagos en la app principal al confirmar una compra.

Para evitar riesgos:

- Revisar esa conexion antes de implementar automatizacion nueva.
- Decidir si la nueva Tienda Profesional usara modo tienda-only.
- No mezclar funciones nuevas con Mesa de Preparacion sin aprobacion.

## Pruebas Obligatorias

Antes de activar automatizacion:

- Pedido creado correctamente.
- Pedido expira correctamente.
- Producto reservado no se puede comprar dos veces.
- Pago correcto marca pedido como pagado.
- Pago dudoso queda en revision.
- Pedido listo aparece al cliente.
- Pedido entregado pasa al historial.
- Mensaje generado tiene datos correctos.
- Nada nuevo aparece en app principal si el modo es tienda-only.
