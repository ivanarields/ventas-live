# Recomendaciones Y Decisiones Pendientes

## Recomendaciones Principales

1. Trabajar primero sobre la base de datos de tienda.
2. No modificar datos de la app principal.
3. Hacer primero calendario, checkout e historial.
4. Dejar mensajes automaticos para despues de tener pedidos estables.
5. Mostrar compras de Live en tienda usando una copia resumen.
6. Mantener la tienda muy simple para el cliente.
7. Evitar pantallas con demasiados textos.
8. Hacer que el cliente siempre sepa el siguiente paso.
9. Respetar que hoy muchas clientas compran por WhatsApp.
10. Convertir la tienda en centro de informacion: Lives, entregas, direccion y novedades.
11. Separar automatizacion tienda-only antes de conectar con la app principal.

## Recomendacion Sobre App Principal

No tocar datos principales.

Si hace falta tocar codigo de la app principal, que sea solo para mostrar o abrir el panel de tienda.

Ejemplo permitido:

- Mejorar la pestana Tienda donde ya vive `AdminTiendaView`.

Ejemplo no permitido:

- Cambiar logica de casilleros.
- Cambiar Lista de Pagos principal.
- Cambiar Mesa de Preparacion.
- Cambiar datos de clientes principales para funciones nuevas de tienda.

## Recomendacion Anti-Riesgo

Para no romper la aplicacion:

- Primero hacer cambios solo en documentos y base de tienda.
- Crear tablas nuevas en tienda antes de cambiar pantallas.
- No borrar columnas existentes.
- No cambiar flujo principal.
- No cambiar estados principales de pedidos/casilleros.
- Probar cada fase por separado.
- Mantener las funciones nuevas detras de secciones nuevas de tienda.

## Recomendacion Sobre Historial De Live

La tienda debe mostrar historial de Live, pero sin depender directamente del flujo principal.

Forma recomendada:

- Crear tabla `store_external_purchases` en la base de tienda.
- Guardar compras Live resumidas por telefono.
- Mostrar esa tabla en Mis Compras.

Esto evita romper la app principal.

## Recomendacion Sobre Mensajes

Primero usar mensajes copiables.

Despues, si todo funciona, activar envio automatico.

Esto evita depender demasiado del WhatsApp Bridge desde el inicio.

## Decisiones Que Faltan

Estas preguntas deben responderse antes de implementar algunas fases:

1. Calendario: sera para retiro, delivery o ambos.
2. Horarios: seran manana/tarde/noche o horas exactas.
3. Delivery: se pedira direccion obligatoria o solo nota.
4. Mensajes: primero copiables o automaticos desde el inicio.
5. Live: mostrar solo historial o tambien permitir confirmar prendas de Live dentro de tienda.
6. Productos: todas las prendas son unicas o algunas pueden tener varias unidades.
7. Reserva: mantener 2 minutos o subir a 5, 10 o 15 minutos.
8. Pedido vencido: se cancela automatico o queda visible para recuperarlo.
9. La tienda tendra una seccion tipo novedades/red social.
10. Se mostrara proximo Live en portada.
11. Las clientas podran consultar producto por WhatsApp aunque exista compra directa.
12. La automatizacion de compra sera solo tienda-only o tambien conectara con app principal mas adelante.

## Orden Recomendado De Decisiones

Primero decidir:

- Retiro, delivery o ambos.
- Horarios simples o exactos.
- Tiempo de reserva.

Despues decidir:

- Mensajes copiables o automaticos.
- Como se vera historial de Live.
- Si habra favoritos desde la primera version.

## Meta Final

La tienda debe sentirse como una app profesional.

El cliente debe poder entrar, mirar, comprar, seguir su pedido y volver sin pedir ayuda.
