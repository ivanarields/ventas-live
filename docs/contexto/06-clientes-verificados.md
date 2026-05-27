# 06 - Clientes Verificados

Actualizado: 2026-05-20.

## Definicion oficial

Cliente verificado significa:

```text
nombre real + numero de WhatsApp + pago confirmado
```

No es solo un check verde. El check verde es la señal visual de una regla de confianza.

## Cuando se marca

Un cliente puede quedar verificado cuando el sistema confirma un pago confiable por:

- Tienda Online con pago confirmado.
- Tienda Online confirmado manualmente por el operador con evidencia confiable.
- Live confirmado por MacroDroid.
- Live confirmado manualmente por el operador.

La regla es simple: si la aplicacion pudo unir nombre real, WhatsApp y pago confirmado, esa persona queda reconocida para futuros cruces.

## Donde se usa

### Tienda

Sirve para tratar con mas confianza pagos futuros del mismo numero/nombre.

Ejemplo:

- Cliente verificado con banco exacto y pedido unico puede confirmarse automaticamente.
- Cliente nuevo con banco pero sin comprobante debe ser mas estricto.

### Live

Sirve para que el panel reconozca mejor a la clienta entre comprobante, nombre, WhatsApp y pago del banco.

## Donde se ve

- Perfil de tienda, junto al nombre.
- Panel Tienda, pedidos/clientes.
- Panel de pagos o cliente cuando el pago ya esta confirmado.

## Donde se guarda

Se guarda tanto en clientes del sistema principal como en clientes de tienda cuando aplica.

Campos usados:

```text
is_verified_customer
verified_at
verified_source
```

## Reglas importantes

- No convertir a verificado si solo hay banco y no hay suficiente identidad.
- No convertir a verificado si el pago esta dudoso.
- Pago menor/mayor no vuelve verificado por si solo.
- La verificacion manual debe basarse en evidencia real del operador.
- Si el operador rechaza un pago, no debe quedar como verificado.

## Resumen corto

Cuando Ivan diga "cliente verificado", significa:

```text
Ya sabemos que esa clienta, ese WhatsApp y ese nombre pertenecen a una persona que ya pago correctamente.
```
