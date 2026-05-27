# 04 - Tienda Online

Actualizado: 2026-05-20.

Este documento es la referencia actual del funcionamiento de la tienda. Si una seccion vieja de otro documento contradice esto, manda este documento.

## Direccion

```text
https://leidycandy.me/tienda
```

La tienda tambien responde por el alias `https://leidydiaz.live/tienda`.

## Objetivo de la tienda

La tienda permite que una clienta:

1. vea prendas disponibles;
2. agregue una o varias prendas al carrito;
3. entre con WhatsApp y PIN;
4. pague por QR;
5. envie comprobante por WhatsApp;
6. vea el estado desde su perfil;
7. confirme prendas o fecha de retiro cuando aplique.

## Catalogo

La tienda muestra productos activos y disponibles.

Reglas:

- Producto con `available=true` y stock mayor a 0 se puede vender.
- Producto vendido queda oculto o con stock 0.
- Producto reservado por otra clienta no debe poder comprarse hasta que se libere o se confirme.
- La categoria `Descuento` muestra precio anterior tachado si `compare_at_price` es mayor al precio actual.
- Las categorias visibles salen de Config mediante `store_chips`; no se deben inventar categorias desde codigo viejo.

## Panel Tienda

En el panel del operador, pestaña Tienda:

| Subpestaña | Uso |
|---|---|
| Productos | Crear, editar, ordenar, ocultar y volver a vender prendas |
| Pedidos | Ver pedidos web, estado, prendas, cliente, monto y acciones rapidas |
| Clientes | Ver perfiles de tienda |
| Confirmaciones | Gestionar solicitudes de confirmacion de prendas |
| Config | Categorias, datos de tienda, QR, retiros y Buffer |

## Crear pedido

Cuando la clienta paga desde tienda:

1. Ingresa WhatsApp y PIN.
2. Si no existe cuenta, se registra con ese numero y PIN.
3. Si ya existe, debe usar el PIN correcto.
4. Se crea un pedido `pending`.
5. Los productos quedan reservados por 2 minutos.
6. La pantalla muestra QR, monto, pedido y boton `Ya pague`.
7. El pedido se guarda en `localStorage` para poder retomarlo si la clienta sale y vuelve.

## Reserva de productos

La reserva evita que dos personas compren la misma prenda.

Reglas:

- Pedido `pending` dentro de los 2 minutos reserva productos.
- Pedido `pending` con comprobante recibido tambien reserva productos aunque pase el tiempo.
- Pedido `pending` con pago menor/mayor tambien reserva productos mientras se revisa.
- Pedido sin pago ni comprobante expira y se cancela automaticamente.
- Pedido rechazado libera la prenda.
- Pedido pagado oculta la prenda como vendida.

## Pago exacto

Si el banco y el pedido coinciden:

### Cliente verificado

- Puede confirmarse automaticamente si el sistema tiene confianza suficiente.
- Se marca pedido como pagado.
- Se registra pago de tienda.
- Se oculta la prenda.
- Se envia WhatsApp de confirmacion.

### Cliente nuevo

- Solo debe confirmarse si existe coincidencia completa y confiable.
- Si se confirma correctamente, pasa a cliente verificado.
- Si falta comprobante o hay duda, queda en revision.

## Pago menor

Ejemplo: pedido de 100 Bs, pago de 90 Bs.

Debe pasar esto:

- No se confirma automaticamente.
- El pedido queda pendiente/revision.
- El producto sigue reservado.
- El operador ve nota roja `Menos Bs 10.00`.
- El cliente ve pendiente/revision.
- No se manda ningun mensaje automatico pidiendo completar una diferencia de monto.
- El operador decide confirmar o rechazar.

## Pago mayor

Ejemplo: pedido de 100 Bs, pago de 110 Bs.

Debe pasar esto:

- No se confirma automaticamente.
- El pedido queda pendiente/revision.
- El producto sigue reservado.
- El operador ve nota roja `Mas Bs 10.00`.
- El cliente ve pendiente/revision.
- El operador decide si acepta el excedente o rechaza.

## Banco sin comprobante

Caso: MacroDroid detecta pago, pero la clienta no mando comprobante.

Debe pasar esto:

- El pedido queda marcado como banco detectado / falta comprobante.
- Si hay numero confiable, se manda WhatsApp pidiendo comprobante.
- El checkout/perfil pide enviar comprobante.
- Cliente nuevo no debe quedar confirmado automaticamente solo por banco.
- Cliente verificado puede confirmarse automatico solo si la regla de seguridad lo permite.

## Comprobante sin banco

Caso: la clienta manda comprobante, pero no llega la notificacion del banco.

Debe pasar esto:

- El pedido queda en revision manual.
- El producto sigue reservado.
- En el perfil se muestra que el comprobante fue recibido y se espera confirmacion del pago.
- El operador revisa el banco y decide.

## Revision manual

La revision de pago de tienda debe hacerse desde `Pagos > Web`.

Acciones correctas:

- `Confirmar`: usar cuando el operador vio el pago real en banco o tiene evidencia suficiente.
- `Rechazar`: usar cuando el pago no corresponde.

Resultado de confirmar:

- Pedido pagado.
- Pago registrado como tienda.
- Productos ocultos/vendidos.
- WhatsApp de confirmacion.
- Cliente puede quedar verificado si se une nombre, WhatsApp y pago confirmado.

Resultado de rechazar:

- Pedido marcado rechazado/cancelado.
- Prendas disponibles otra vez.
- No cuenta como pago confirmado.

## Perfil de clienta

En `/tienda#profile` la clienta puede ver:

- nombre y WhatsApp;
- check verde si es cliente verificado;
- favoritos;
- pedidos;
- total gastado;
- estado de cada pedido;
- retiro/entrega;
- confirmacion de prendas.

Mensajes visuales:

- Banco sin comprobante: "Envia tu comprobante para confirmar el pedido."
- Comprobante sin banco: "Recibimos tu comprobante. Estamos esperando confirmacion del pago."
- Pagado: pedido confirmado.

## Retomar pedido

Si la clienta cierra la pagina:

1. La tienda revisa `tienda.pendingOrder` en el navegador.
2. Si el pedido sigue vivo y pendiente, vuelve a la pantalla de pago.
3. Si ya expiro o fue procesado, limpia el pendiente y vuelve al flujo normal.

## Live encendido y compra web

La tienda debe seguir funcionando aunque Live este encendido.

Cuando entra un pago:

1. La tienda intenta capturar el pago como tienda si coincide con un pedido web.
2. El flujo Live tambien puede recibir la notificacion si cae dentro de la ventana Live.
3. Si se crea un pedido fantasma de Live por una compra web, la confirmacion de tienda intenta limpiarlo solo si es claramente fantasma.

## Live apagado y compra web

La compra web debe funcionar igual.

El servidor puede responder `live_off` para la parte Live, pero antes ya intento capturar el pago para tienda.

## Buffer y redes

En `Tienda > Config` existe el switch `buffer_publish_enabled`.

- ON: al crear/publicar producto, puede enviarse a Buffer/redes si la integracion esta activa.
- OFF: el producto se guarda en tienda, pero no debe publicarse en redes.

Antes de Play Store falta probar ambos casos con producto real o de prueba controlada.

## Fechas de retiro

El operador configura fechas y horarios disponibles.

La clienta puede:

- elegir una fecha disponible;
- pedir otro dia;
- enviar WhatsApp si quiere coordinar otra fecha.

## Confirmar prendas

El link `/tienda#profile/confirmar` se usa para que una clienta confirme prendas, especialmente cuando viene de Live.

Flujo:

1. Operador manda link o la app lo muestra.
2. Clienta entra con WhatsApp y PIN.
3. Revisa prendas.
4. Confirma si son correctas.
5. El operador ve la confirmacion.

## Pruebas obligatorias de tienda

Antes de Play Store hay que probar:

- compra exacta cliente nuevo;
- compra exacta cliente verificado;
- pago menor;
- pago mayor;
- banco sin comprobante;
- comprobante sin banco;
- retomar pedido;
- dos clientas con mismo monto;
- Live encendido mientras hay compra web;
- Live apagado con compra web;
- Buffer ON;
- Buffer OFF;
- perfil, favoritos y confirmacion de prendas.
