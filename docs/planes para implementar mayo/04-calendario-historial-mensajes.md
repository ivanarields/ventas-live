# Calendario, Historial Y Mensajes

## Calendario Del Cliente

Objetivo: que el cliente elija cuando quiere su pedido.

Opciones a definir:

- Solo retiro.
- Solo delivery.
- Retiro y delivery.

Horarios recomendados para empezar:

- Manana.
- Tarde.
- Noche.

Mas adelante se pueden usar horas exactas.

## Flujo Del Calendario

1. Cliente confirma carrito.
2. Cliente se identifica con WhatsApp y PIN.
3. Cliente elige tipo de entrega.
4. Cliente elige dia.
5. Cliente elige horario.
6. Cliente paga.
7. Pedido queda guardado con fecha y horario.

## Panel Calendario

Objetivo: que la duena vea que pedidos tiene cada dia.

Vistas recomendadas:

- Hoy.
- Manana.
- Semana.
- Calendario mensual.
- Pedidos sin fecha.

Acciones recomendadas:

- Ver detalle.
- Marcar en preparacion.
- Marcar listo.
- Marcar entregado.
- Cancelar.
- Copiar mensaje.

## Historial Del Cliente

Objetivo: que el cliente vea todo sin preguntar.

Debe incluir:

- Pedidos de tienda.
- Compras de Live.
- Fecha.
- Monto.
- Estado.
- Productos.
- Dia elegido.
- Tipo de entrega.

Forma recomendada para Live:

- Crear una tabla resumen en la base de tienda.
- Copiar solo datos necesarios.
- No cambiar datos principales.
- Mostrar ese resumen dentro de Mis Compras.

## Mensajes De Tienda

Objetivo: que el cliente reciba informacion clara y profesional.

Primera version recomendada:

- Mensajes copiables desde el panel.
- Boton para abrir WhatsApp con texto listo.
- Plantillas editables en tienda.

Version futura:

- Envio automatico si el bridge esta estable.
- Historial de mensajes enviados.
- Reintentos si falla.

## Plantillas Iniciales

Pedido creado:

`Hola {customer_name}, recibimos tu pedido #{order_id}. Esta reservado por unos minutos. Total: {total} Bs.`

Pago confirmado:

`Hola {customer_name}, tu pago del pedido #{order_id} fue verificado. Ya estamos preparando tu pedido.`

Pedido listo:

`Hola {customer_name}, tu pedido #{order_id} esta listo para {delivery_type} el {delivery_date} en el horario {delivery_slot}.`

Pedido entregado:

`Gracias por tu compra, {customer_name}. Tu pedido #{order_id} fue marcado como entregado.`

Pedido cancelado:

`Hola {customer_name}, tu pedido #{order_id} fue cancelado porque la reserva vencio o no se confirmo el pago.`

Recordatorio:

`Hola {customer_name}, te recordamos tu pedido #{order_id} para {delivery_date} en el horario {delivery_slot}.`

## Recomendacion

Primero implementar mensajes copiables.

Despues activar envio automatico solo si se prueba bien.
