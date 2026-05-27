# 07 - Entrega Para Operador Y Auditoria De IA

Actualizado: 2026-05-20.

Este es el documento maestro para entender el funcionamiento actual de la aplicacion antes de publicar en Play Store.

Debe servir para:

- que el operador sepa que hacer en cada flujo;
- que otra IA audite la aplicacion sin depender del chat;
- que no se usen documentos viejos como verdad actual.

## Estado actual

- Produccion: `https://leidycandy.me`.
- Tienda: `https://leidycandy.me/tienda`.
- Alias: `https://leidydiaz.live`.
- Login panel: `leidycandy / 7020`.
- Ultimos cambios subidos a produccion el 2026-05-20.
- No falta una funcion grande nueva para publicar; faltan pruebas finales reales.

## Sistemas principales

| Sistema | Funcion |
|---|---|
| Panel principal | Operacion diaria, pagos, Live, entrega, etiquetas y configuracion |
| Tienda online | Catalogo, carrito, QR, perfil, favoritos y pedidos web |
| MacroDroid | Recibe notificaciones del banco desde el celular |
| WhatsApp bridge | Envia mensajes automaticos y recibe comprobantes |
| Live | Procesa conversaciones y pagos dentro de una ventana de venta Live |

## Flujo completo de tienda

1. Operador carga productos en Tienda.
2. Producto activo aparece en catalogo.
3. Clienta abre `/tienda`.
4. Agrega prenda al carrito.
5. Ingresa WhatsApp y PIN.
6. Si es nueva, se crea cuenta con ese PIN.
7. Si ya existe, debe ingresar PIN correcto.
8. Se crea pedido `pending`.
9. La prenda queda reservada por 2 minutos.
10. Clienta ve QR y monto.
11. Clienta paga.
12. Clienta toca `Ya pague` y manda comprobante por WhatsApp.
13. MacroDroid puede detectar el banco.
14. El sistema cruza pedido, monto, WhatsApp, comprobante y cliente.
15. Si todo coincide, confirma.
16. Si falta algo, manda a revision manual.
17. Al confirmar, el producto queda vendido/oculto.
18. El pedido aparece pagado.
19. Se envia WhatsApp de confirmacion.
20. La clienta puede verlo en su perfil.

## Casos de pago tienda

| Caso | Cliente ve | Operador ve | Resultado |
|---|---|---|---|
| Pago exacto confiable | Pago verificado | Pedido pagado | Confirmacion automatica o segura |
| Cliente nuevo exacto | Pago verificado si coincide todo | Pedido pagado | Pasa a cliente verificado |
| Pago menor | Pendiente/revision | Nota `Menos Bs X` | Revision manual |
| Pago mayor | Pendiente/revision | Nota `Mas Bs X` | Revision manual |
| Banco sin comprobante | Debe enviar comprobante | Sin comprobante | No confirmar cliente nuevo solo por banco |
| Comprobante sin banco | Esperando confirmacion | Comprobante recibido | Revision manual |
| Rechazado | No queda pagado | Pedido rechazado | Producto vuelve a tienda |

## Cliente verificado

Cliente verificado significa:

```text
nombre real + WhatsApp + pago confirmado
```

Uso:

- En tienda permite mas confianza para futuros pagos exactos.
- En Live ayuda a cruzar pagos y comprobantes.
- Se muestra con check verde.
- No se debe marcar si el pago esta dudoso.

## Revision manual de tienda

La revision de pagos dudosos debe hacerse desde `Pagos > Web`.

El operador debe:

1. Abrir Pagos.
2. Cambiar a Web.
3. Revisar la tarjeta morada/pendiente.
4. Comparar banco, comprobante, monto, cliente y pedido.
5. Tocar `Confirmar` solo si el pago existe.
6. Tocar `Rechazar` si no corresponde.

Resultado de `Confirmar`:

- pedido pagado;
- pago tienda registrado;
- producto vendido/oculto;
- WhatsApp de confirmacion;
- cliente puede quedar verificado.

Resultado de `Rechazar`:

- pedido cancelado/rechazado;
- producto vuelve a estar disponible;
- no cuenta como pago.

## Flujo Live

1. Operador inicia Live.
2. Se guarda hora de inicio.
3. Entran mensajes de WhatsApp de clientas.
4. Operador cierra Live indicando hora real de cierre.
5. El sistema procesa solo mensajes dentro de esa ventana.
6. La IA resume pedidos y comprobantes.
7. MacroDroid aporta pagos bancarios.
8. El sistema cruza monto, nombre y hora.
9. Si coincide, queda verificado.
10. Si falta algo, queda pendiente o revision manual.
11. Operador puede verificar manualmente.
12. Si se confirma, se crea/sincroniza pedido principal en `procesar`.

## Live ON y Live OFF

### Live ON

- Los pagos pueden entrar al flujo Live.
- Las conversaciones dentro de la ventana pueden procesarse.
- Una compra web hecha al mismo tiempo debe seguir siendo tienda.
- Si aparece un pedido fantasma por compra web, se limpia solo si cumple condiciones estrictas.

### Live OFF

- El servidor responde `live_off` para Live.
- Eso no significa que la tienda falle.
- Antes de ignorar para Live, el sistema intenta capturar pago de tienda.
- Compra web con Live apagado debe funcionar.

## Etiquetas y entrega

Reglas:

- Pedido confirmado entra en `procesar`.
- En `procesar` no ocupa etiqueta fisica.
- Al marcar listo/preparado, se asigna etiqueta.
- 1 bolsa usa etiqueta numerica.
- 2 o mas bolsas usan etiqueta alfabetica.
- Si la clienta ya tiene letra activa, puede heredar esa letra.
- Al marcar entregado, se libera la etiqueta.
- Si la clienta ya no tiene pedidos activos, se limpia su etiqueta activa.

## WhatsApp

Mensajes principales:

- Confirmacion de pago tienda.
- Pedido de comprobante cuando banco detecto pago pero falta comprobante.
- Link para confirmar prendas de Live: `/tienda#profile/confirmar`.
- Avisos manuales del operador cuando haga falta.

El numero oficial se maneja desde configuracion de tienda.

## Buffer

`buffer_publish_enabled` controla publicacion en redes:

- ON: producto puede enviarse a Buffer si la integracion esta activa.
- OFF: producto se guarda en tienda pero no se publica.

Falta prueba final ON/OFF antes de Play Store.

## Lo ya hecho

- Login simple corregido en produccion.
- Tienda desplegada y funcional.
- Cliente verificado agregado.
- Pago menor/mayor a revision manual.
- Banco sin comprobante pide comprobante.
- Comprobante sin banco queda esperando confirmacion.
- Reserva de producto durante revision.
- Separacion tienda vs Live reforzada.
- Produccion respondio despues del deploy.

## Lo que falta probar

1. Cliente nuevo pago exacto.
2. Cliente verificado pago exacto.
3. Pago menor.
4. Pago mayor.
5. Banco sin comprobante.
6. Comprobante sin banco.
7. Confirmar revision manual.
8. Rechazar revision manual.
9. Retomar pedido desde perfil.
10. Live encendido con compra web al mismo tiempo.
11. Live apagado con compra web.
12. Marcar listo y asignar etiqueta.
13. Marcar entregado y liberar etiqueta.
14. Buffer ON.
15. Buffer OFF.
16. App Android en celular real.

## Riesgos que otra IA debe revisar

- Que la accion correcta para pagos dudosos sea `Pagos > Web`, no una accion rapida de gestion de producto.
- Que los documentos antiguos no contradigan el flujo actual.
- Que tienda y Live sigan separados.
- Que cliente nuevo no se confirme solo con evidencia incompleta.
- Que las etiquetas se liberen al entregar.
- Que la app Android no rompa el flujo de QR, WhatsApp y perfil.

## Regla final para auditoria

Si el codigo contradice este documento, gana el codigo. Pero si otro documento viejo contradice este documento, gana este documento.
