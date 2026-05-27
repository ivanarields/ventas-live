# 05 - Estado Actual, Pendientes Y Riesgos

Actualizado: 2026-05-20.

## Hecho y subido a produccion

- Tienda funcional en `https://leidycandy.me/tienda`.
- Login simple del panel: `leidycandy / 7020`.
- Cliente verificado documentado y visible con check verde.
- Pago exacto puede confirmar pedido segun reglas de seguridad.
- Pago menor queda en revision manual con nota `Menos Bs X`.
- Pago mayor queda en revision manual con nota `Mas Bs X`.
- Banco sin comprobante pide comprobante cuando hay numero.
- Comprobante sin banco queda esperando confirmacion.
- Mensaje automatico viejo de diferencia de monto fue eliminado del flujo esperado.
- Productos se reservan mientras hay pedido pendiente, comprobante o monto dudoso.
- Live apagado responde `live_off` para Live pero no debe romper tienda.
- Login simple faltante fue corregido en produccion.

## Pruebas ya reportadas como hechas

- Login del panel.
- Compra web con Live apagado.
- Compra web con Live encendido.
- Compra Live real.
- MacroDroid detectando pagos.
- WhatsApp automatico.
- Bridge WhatsApp conectado.
- Produccion responde.

Estas pruebas vienen del cierre del 2026-05-20. Si se necesita evidencia nueva, repetirlas en produccion antes de publicar.

## Pruebas pendientes antes de Play Store

| Area | Prueba | Resultado esperado |
|---|---|---|
| Tienda | Pago exacto cliente nuevo | Se confirma solo si coincide todo; luego queda verificado |
| Tienda | Pago exacto cliente verificado | Puede confirmar automatico si el match es seguro |
| Tienda | Pago menor | Revision manual, nota `Menos Bs X`, producto reservado |
| Tienda | Pago mayor | Revision manual, nota `Mas Bs X`, producto reservado |
| Tienda | Banco sin comprobante | Pide comprobante y no confirma cliente nuevo solo por banco |
| Tienda | Comprobante sin banco | Perfil muestra espera de confirmacion; operador decide |
| Tienda | Retomar pedido | La clienta vuelve al QR si el pedido sigue vivo |
| Tienda | Dos pedidos mismo monto | No debe cruzar con clienta equivocada |
| Live | Live encendido | Mensajes y pagos entran al rango correcto |
| Live | Live apagado | Pagos no entran a Live; tienda sigue funcionando |
| Etiquetas | Marcar listo | Asigna etiqueta correcta |
| Etiquetas | Entregar | Libera etiqueta |
| Buffer | ON | Publica cuando corresponde |
| Buffer | OFF | Guarda producto sin publicar |
| Android | WebView/celular real | Tienda, login, pago y perfil se ven bien |

## Riesgos conocidos para revisar

- En Tienda > Pedidos hay acciones rapidas de gestion. Para pagos dudosos usar `Pagos > Web`, porque ahi esta la confirmacion/rechazo de pago.
- Algunos documentos anteriores al 2026-05-20 estaban desactualizados; usar `07-entrega-auditoria-ia.md` como guia principal.
- No usar `npm run lint` como unica validacion porque el repo tiene ruido no relacionado.
- Para produccion, validar con evidencia externa, no solo con build local.

## Criterio de cierre

La app esta lista para Play Store cuando:

- las pruebas de tienda dudosa pasan;
- Live ON/OFF pasa;
- etiquetas se asignan y liberan;
- Buffer ON/OFF pasa;
- la app Android carga la tienda y panel sin pantallas rotas;
- otra IA puede leer `07-entrega-auditoria-ia.md` y entender el flujo sin depender del chat.
