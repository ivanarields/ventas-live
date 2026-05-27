# 02 - Sistema De Pagos, MacroDroid, WhatsApp Y Live

Actualizado: 2026-05-20.

Este documento describe el flujo operativo de pagos. No intenta documentar cada tabla; explica que debe pasar en la aplicacion.

## Entradas de pago

El sistema recibe evidencia de pago por tres caminos:

| Camino | Que trae | Uso |
|---|---|---|
| MacroDroid | Notificacion bancaria del celular | Detecta monto, nombre y hora del pago |
| WhatsApp | Comprobante o mensaje de la clienta | Une comprobante con pedido y telefono |
| Operador | Confirmacion manual | Resuelve casos dudosos |

## Separacion tienda vs Live

La tienda online y el Live son flujos distintos.

- Tienda: pedidos creados en `/tienda`, pagos en TiendaOnline y vista `Pagos > Web`.
- Live: mensajes de WhatsApp dentro de una ventana Live, pedidos Live y vista `Pagos > Live`.
- Un pago web no debe convertirse en pedido Live.
- Un pago Live real no debe borrarse como pedido fantasma de tienda.

## MacroDroid con Live apagado

Cuando MacroDroid manda una notificacion bancaria:

1. El servidor intenta capturar/cruzar el pago para tienda.
2. Luego revisa si hay Live activo o recientemente cerrado.
3. Si no hay Live valido, responde `ignored: true` con razon `live_off`.
4. Ese `live_off` solo significa que se ignoro para Live.
5. La tienda puede haber capturado el pago antes de esa respuesta.

Esta regla es importante: Live apagado no debe romper compras web.

## MacroDroid con Live encendido

Cuando Live esta encendido:

1. El pago entra al flujo de tienda si coincide con un pedido web.
2. Tambien puede entrar al flujo Live si cae dentro de la ventana Live.
3. El sistema evita que una compra web genere un pedido fantasma en Live.
4. Si se crea un pedido fantasma `source='macrodroid'` sin items ni etiqueta, la confirmacion de tienda intenta limpiarlo solo si cumple condiciones estrictas.

## Flujo tienda - pago exacto

### Cliente verificado

Si el cliente ya es verificado y el banco detecta un pago exacto de un pedido unico:

1. El pedido se confirma automaticamente.
2. El producto queda vendido y oculto.
3. Se registra pago de tienda.
4. Se envia un unico WhatsApp de confirmacion.
5. El pedido aparece como pagado.

### Cliente nuevo

Si el cliente es nuevo:

1. El sistema es mas estricto.
2. Si hay banco + WhatsApp/comprobante + pedido y todo coincide, se confirma.
3. Al confirmarse correctamente, el cliente pasa a cliente verificado.
4. Si falta comprobante o hay duda, no se confirma solo.

## Flujo tienda - pago menor o mayor

Si el monto pagado no coincide:

- No se confirma automaticamente.
- El pedido queda en revision manual.
- El producto sigue reservado mientras se revisa.
- El operador ve nota roja:
  - `Menos Bs X` si pago menos.
  - `Mas Bs X` si pago mas.
- El cliente ve pendiente/revision en su perfil.
- No se manda ningun mensaje automatico pidiendo completar una diferencia de monto.

El operador debe decidir:

- Confirmar si reviso el banco y acepta el caso.
- Rechazar si el pago no corresponde.

## Flujo tienda - banco sin comprobante

Si MacroDroid detecta banco pero no hay comprobante:

1. El pedido queda pendiente.
2. Se marca como banco detectado / falta comprobante.
3. Si hay numero confiable, se encola WhatsApp pidiendo comprobante.
4. El cliente ve que debe enviar comprobante.
5. Cliente nuevo no se confirma automaticamente solo por banco.
6. Cliente verificado puede auto-confirmarse solo si la regla de seguridad lo permite.

## Flujo tienda - comprobante sin banco

Si llega comprobante por WhatsApp pero MacroDroid no detecto banco:

1. El pedido queda en revision manual.
2. El producto sigue reservado.
3. El cliente ve: "Recibimos tu comprobante. Estamos esperando confirmacion del pago."
4. El operador revisa banco y confirma o rechaza.

## Revision manual de tienda

La revision manual correcta debe hacerse desde `Pagos > Web` cuando el pedido aparezca pendiente/dudoso.

Botones:

- `Confirmar`: confirma el pago, registra pago de tienda, oculta productos y deja el pedido pagado.
- `Rechazar`: cancela/rechaza el pedido y libera los productos para volver a vender.

No usar una accion rapida de gestion de producto como sustituto de la verificacion de pago si el caso es dudoso.

## Flujo Live

1. El operador inicia Live.
2. El sistema guarda hora de inicio.
3. Entra conversacion de WhatsApp.
4. Al cerrar Live, el operador indica hora real de cierre.
5. El sistema procesa mensajes dentro de esa ventana.
6. La IA resume pedidos/comprobantes.
7. Los comprobantes se cruzan con MacroDroid por monto, nombre y hora.
8. Si coincide, el pago queda verificado.
9. Si falta algo, queda pendiente o revision manual.
10. Si el operador verifica manualmente, el cliente y el pedido se sincronizan.

## Estados de pago Live

| Estado | Significado |
|---|---|
| `pendiente_whatsapp` | Hay comprobante o informacion de WhatsApp, falta cruce completo |
| `verificado_macrodroid` | Banco y comprobante coincidieron automaticamente |
| `verificado_manual` | Operador confirmo manualmente |
| `revision_manual` | Hay duda y requiere decision |
| `rechazado` | Operador rechazo |
| `posible_duplicado` | Posible repeticion o evento repetido |

## Cliente verificado

Un cliente se vuelve verificado cuando el sistema logra unir:

```text
nombre real + WhatsApp + pago confirmado
```

Esto aplica tanto en tienda como en Live.

## Mensajes WhatsApp importantes

| Caso | Mensaje esperado |
|---|---|
| Tienda pagada | Confirmacion de pago y link al perfil |
| Banco sin comprobante | Pedido de comprobante |
| Comprobante sin banco | El perfil muestra espera de confirmacion |
| Live listo para confirmar prendas | Link a `/tienda#profile/confirmar` |

## Duplicados

El sistema distingue:

- pago repetido real;
- repeticion de la misma notificacion;
- comprobante reenviado;
- pago de tienda que ocurre mientras Live esta encendido.

Antes de llamar algo duplicado, hay que revisar si es pago real o solo replay de notificacion.
