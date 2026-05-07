# Fases De Implementacion — Tienda Profesional

## Fase 0 — Blindaje Para No Romper La App Principal

Objetivo: trabajar la tienda sin tocar datos principales.

Trabajo:

- Revisar que funciones de tienda escriben en la app principal.
- Separar claramente lo nuevo como tienda-only.
- Crear o usar endpoints de tienda que guarden solo en la base de tienda.
- Evitar cambios en Lista de Pagos, Mesa de Preparacion, casilleros y perfil principal.
- Documentar cualquier punto donde la tienda actual ya esta conectada con la app principal.

Regla:

- Las mejoras nuevas no escriben en la base principal.
- Si se necesita conectar con Live o app principal, primero se copia un resumen a la base de tienda.

Datos: base de tienda.

Riesgo: bajo si se respeta la regla.

## Fase 1 — Ordenar La Tienda Actual

Objetivo: dejar la tienda estable antes de agregar funciones grandes.

Trabajo:

- Revisar estados actuales de pedidos.
- Unificar nombres de estados.
- Separar bien `stock` y `available`.
- Corregir diferencias entre documento y codigo.
- Revisar reservas de productos.
- Revisar checkout actual.
- Revisar perfil actual del cliente.

Estados recomendados:

| Estado | Significado |
|--------|-------------|
| `pending` | Pedido creado, esperando pago |
| `paid` | Pago verificado |
| `preparing` | Pedido en preparacion |
| `ready` | Pedido listo para retirar o entregar |
| `delivered` | Pedido entregado |
| `cancelled` | Pedido cancelado |
| `manual_review` | Necesita revision manual |

Regla recomendada de productos:

- `stock = 0`: producto vendido, se muestra con sello VENDIDO.
- `available = false`: producto oculto de la tienda.

Datos: solo base de tienda.

Riesgo: bajo.

## Fase 2 — Checkout Cero Friccion

Objetivo: que comprar sea muy facil.

Trabajo:

- Redisenar el checkout en pasos simples.
- Guardar carrito aunque el cliente recargue la pagina.
- Mostrar pedido, total y QR de forma clara.
- Mantener login con WhatsApp + PIN.
- Evitar pedir datos innecesarios.
- Agregar instrucciones simples para pagar.
- Mejorar pantalla de pago verificado.
- Mantener opcion de comprar o consultar por WhatsApp.
- No obligar a todas las clientas a cambiar su costumbre de compra.

Flujo ideal:

1. Cliente confirma productos.
2. Cliente pone WhatsApp y PIN.
3. Cliente elige dia y horario.
4. Cliente paga.
5. Cliente ve estado del pedido.

Datos: solo base de tienda.

Riesgo: bajo.

## Fase 3 — Calendario Para El Cliente

Objetivo: que el cliente elija cuando quiere su pedido.

Trabajo:

- Agregar selector de dia.
- Agregar selector de horario.
- Agregar tipo de entrega: retiro, delivery o ambos.
- Agregar direccion si es delivery.
- Agregar nota opcional del cliente.
- Guardar todo en el pedido de tienda.

Campos recomendados:

| Campo | Para que sirve |
|-------|----------------|
| `delivery_type` | retiro o delivery |
| `delivery_date` | dia elegido |
| `delivery_slot` | horario elegido |
| `delivery_address` | direccion si hay delivery |
| `delivery_notes` | nota del cliente |
| `delivery_status` | estado de entrega |

Datos: solo base de tienda.

Riesgo: bajo.

## Fase 4 — Panel Calendario Para La Duena

Objetivo: que la duena vea los pedidos ordenados por dia.

Trabajo:

- Crear vista calendario en el panel de tienda.
- Mostrar pedidos por fecha.
- Filtrar por estado.
- Ver pedidos de hoy, manana y semana.
- Marcar pedido como listo.
- Marcar pedido como entregado.
- Cancelar pedido.
- Ver detalle de productos.
- Copiar mensaje para cliente.

Datos: solo base de tienda.

Codigo: panel de tienda.

Riesgo: bajo.

## Fase 5 — Perfil Profesional Del Cliente

Objetivo: que el cliente no tenga que preguntar por su pedido.

Trabajo:

- Mejorar seccion Mi Perfil.
- Crear pantalla Mis Compras.
- Mostrar pedidos con estado claro.
- Mostrar fecha elegida.
- Mostrar productos comprados.
- Mostrar total gastado.
- Mostrar detalle de cada compra.

Estados visibles para cliente:

- Esperando pago.
- Pago confirmado.
- En preparacion.
- Listo.
- Entregado.
- Cancelado.
- En revision.

Datos: base de tienda.

Riesgo: bajo.

## Fase 5.5 — Centro De Clientas

Objetivo: que la tienda responda dudas que hoy llegan por WhatsApp.

Trabajo:

- Crear seccion Proximo Live.
- Crear seccion Fechas de entrega.
- Crear seccion Direccion y horarios.
- Crear seccion Novedades.
- Crear seccion Preguntas frecuentes.
- Mostrar avisos importantes en portada.
- Permitir que la duena actualice estas respuestas desde el panel de tienda.

Preguntas que debe responder:

- Cuando es el proximo Live.
- Cuando entregan pedidos.
- Donde esta la direccion.
- Como pagar.
- Como ver mi pedido.
- Que novedades hay.

Datos: solo base de tienda.

Riesgo: bajo.

## Fase 6 — Historial Unido Tienda + Live

Objetivo: que el cliente vea todas sus compras en una sola pantalla.

Trabajo:

- Crear una tabla resumen en la base de tienda para compras externas.
- Guardar resumen de compras de Live por telefono.
- Mostrar compras de tienda y Live juntas.
- No modificar datos principales.
- No cambiar flujo principal de Live.

Forma recomendada:

- La app principal o un endpoint copia un resumen hacia tienda.
- La tienda muestra ese resumen.
- La tienda no escribe en tablas principales.

Datos nuevos: base de tienda.

Riesgo: medio, porque Live vive fuera de tienda.

## Fase 7 — Mensajes De Tienda

Objetivo: que el cliente reciba informacion clara sin confusiones.

Trabajo:

- Crear plantillas editables de mensajes.
- Crear mensajes por estado.
- Permitir copiar mensaje desde el panel.
- Luego decidir si se envian automaticos.
- Guardar historial de mensajes de tienda.
- Crear mensajes de aviso de Live.
- Crear mensajes de recordatorio de entrega.
- Crear mensajes de novedades.

Mensajes recomendados:

| Momento | Mensaje |
|---------|---------|
| Pedido creado | Recibimos tu pedido y esta reservado por unos minutos |
| Pago confirmado | Tu pago fue verificado |
| En preparacion | Estamos preparando tu pedido |
| Listo | Tu pedido esta listo |
| Entregado | Gracias por tu compra |
| Cancelado | Tu pedido fue cancelado |
| Recordatorio | Recuerda tu entrega o retiro |

Datos: base de tienda.

Riesgo: bajo si primero son mensajes copiables.

Riesgo: medio si se activa envio automatico.

## Fase 8 — Tienda Adictiva

Objetivo: que el cliente vuelva a entrar aunque no compre de inmediato.

Trabajo:

- Seccion Nuevas prendas.
- Seccion Ultimas unidades.
- Seccion Mas vistas.
- Seccion Proximo Live.
- Seccion Novedades como red social.
- Avisos cortos tipo historias.
- Favoritos.
- Boton Quiero uno parecido.
- Productos compartibles.
- Sello vendido bonito.
- Recomendaciones de productos.
- Aviso cuando hay prendas nuevas.
- Mejor diseno visual mobile.

Datos: base de tienda.

Riesgo: bajo.

## Fase 9 — Pruebas Y Pulido

Objetivo: que la tienda sea confiable antes de usarla fuerte.

Pruebas necesarias:

- Cliente compra un producto.
- Cliente intenta comprar producto reservado.
- Pedido expira sin pago.
- Pago se verifica correctamente.
- Pedido queda en revision manual.
- Cliente ve su historial.
- Cliente elige fecha.
- Duena ve pedido en calendario.
- Producto vendido muestra sello.
- Producto oculto no aparece.
- Carrito se conserva al recargar.

Datos: base de tienda.

Riesgo: bajo.
