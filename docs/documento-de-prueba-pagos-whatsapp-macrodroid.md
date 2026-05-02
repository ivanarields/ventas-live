# Documento de prueba pagos WhatsApp MacroDroid

Fecha: 2026-05-01

Estado del documento: version final para retomar pruebas criticas mas adelante.

## Objetivo

Validar que los pagos del Panel WhatsApp, los comprobantes enviados por chat y las notificaciones bancarias de MacroDroid se unan correctamente sin duplicar pagos, pedidos ni casilleros.

Numero de prueba: `72698959` / `59172698959`

## Estado actual importante

- MacroDroid puede estar apagado si el celular no tiene internet.
- Si MacroDroid esta caido, se puede usar el boton **Verificar manual** como respaldo.
- Ya se desplego proteccion para evitar duplicados en ambos sentidos:
  - si primero se verifica manualmente y MacroDroid llega tarde, no debe crear otro pago;
  - si primero llega MacroDroid y despues se presiona Verificar manual, debe reutilizar el pago existente.

## Cambios desplegados

- Edge Function Supabase `ingest-notification` desplegada con proteccion contra duplicado manual.
- App Vercel produccion desplegada con proteccion en el boton **Verificar manual**.
- Produccion: `https://ventas-live.vercel.app`

## Pruebas hechas

### 1. Comprobante detectado sin verificacion MacroDroid correcta

Resultado observado:

- Se creo pedido live del dia.
- Se guardaron pagos live pendientes para el numero.
- No se creo casillero.
- Problema detectado: el match automatico fallo cuando la IA leyo una hora incorrecta del comprobante.

Conclusion:

- La ventana de 5 minutos es razonable, pero debe medirse con la hora real del mensaje de WhatsApp cuando sea posible, no solo con la hora leida dentro del comprobante.

### 2. Verificacion manual con MacroDroid caido

Accion realizada:

- Se presiono **Verificar manual** sobre comprobante de Bs 2.

Resultado en base:

- `pagos_venta_live.estado = verificado_manual`
- `main_pago_id = 242`
- Pago principal creado:
  - monto: Bs 2
  - metodo: `Verificacion manual WhatsApp`
  - `verified = true`
- Pedido principal del dia:
  - `main_pedido_id = 240`
  - total: Bs 2
  - estado: `procesar`
- No se crearon casilleros:
  - `orders`: sin registros nuevos
  - `container_allocations`: sin registros nuevos

Conclusion:

- El fallback manual funciona y el pago aparece como pago real.

## Recomendacion final de pruebas

No es necesario ejecutar todas las pruebas pendientes antes de avanzar con otros modulos. Para confirmar que el flujo realmente funciona en produccion, se recomiendan **2 pruebas obligatorias** y luego pruebas secundarias cuando haya tiempo.

### Pruebas obligatorias

Estas dos pruebas cubren los dos caminos principales del sistema:

1. MacroDroid caido o tardio, usando **Verificar manual** como respaldo.
2. MacroDroid funcionando, pago automatico primero y comprobante despues.

Si estas dos pasan, el flujo puede considerarse suficientemente validado para uso operativo inicial, siempre vigilando duplicados durante los primeros dias.

### Pruebas secundarias recomendadas

Las pruebas de duplicado, nombre distinto y pago fuera de tiempo siguen siendo importantes, pero no bloquean avanzar con otras tareas si las dos obligatorias pasan.

Se recomienda hacerlas despues para endurecer el sistema contra casos raros:

- comprobante duplicado;
- mismo monto con nombre distinto;
- pago fuera de tiempo.

## Pruebas obligatorias para confirmar el flujo

### Obligatoria 1. MacroDroid llega tarde despues de verificacion manual

Motivo:

- Valida el caso real donde el celular de MacroDroid estuvo apagado o sin internet.
- Confirma que el usuario puede continuar con **Verificar manual** sin miedo a que MacroDroid duplique despues.

Cuando hacerla:

- Cuando el celular de MacroDroid vuelva a tener internet.

Pasos:

1. No modificar el comprobante ya verificado manualmente de Bs 2.
2. Dejar que MacroDroid envie la notificacion bancaria pendiente, si todavia existe.
3. Avisar: **Macro tardio listo**.

Resultado esperado:

- No debe crear otro pago de Bs 2.
- Debe reconocer que ya existe el pago manual `id=242`.
- El pedido debe seguir en Bs 2, no Bs 4.
- No debe crear casillero.

Verificar en base:

- `pagos`: debe seguir existiendo un solo pago de Bs 2 para ese evento.
- `pedidos`: el pedido del dia debe mantener total correcto.
- `pagos_venta_live`: el comprobante debe seguir verificado y enlazado.
- `raw_notification_events`: puede quedar como duplicado/cubierto por manual.

### Obligatoria 2. MacroDroid primero, comprobante despues

Motivo:

- Valida el flujo normal cuando MacroDroid esta funcionando.
- Confirma que el pago automatico se puede enlazar despues con el comprobante del chat.

Pasos:

1. Enviar pago real nuevo con monto distinto, por ejemplo Bs 3.
2. Confirmar que MacroDroid este activo y que entre la notificacion.
3. Despues enviar el comprobante por WhatsApp.
4. Abrir Panel WhatsApp y presionar **Actualizar**.
5. Avisar: **Macro primero lista**.

Resultado esperado:

- MacroDroid crea el pago real.
- Al actualizar el chat, el comprobante debe quedar `verificado_macrodroid`.
- Debe enlazarse al pago real con `main_pago_id`.
- No debe crear pago manual duplicado.
- El pedido del dia debe sumar Bs 3.
- No debe crear casillero.

Verificar en base:

- `raw_notification_events`: evento `auto_processed`.
- `pagos`: pago real creado una sola vez.
- `pagos_venta_live`: comprobante `verificado_macrodroid`.
- `pedidos_venta_live`: total verificado actualizado.
- `pedidos`: un solo pedido principal del dia para el cliente.
- `orders` y `container_allocations`: sin casilleros nuevos.

## Pruebas secundarias pendientes

### Secundaria 1. Comprobante duplicado

Pasos:

1. Reenviar el mismo comprobante de una prueba ya verificada.
2. Presionar **Actualizar** en Panel WhatsApp.
3. Avisar: **Duplicado listo**.

Resultado esperado:

- No debe sumar el monto dos veces.
- No debe crear otro pago real.
- Debe quedar como `posible_duplicado` o ser ignorado como ya existente.
- Debe mantenerse un solo pedido principal del dia.
- No debe crear casillero.

### Secundaria 2. Mismo monto, nombre distinto

Pasos:

1. Usar comprobante o pago con mismo monto pero otro nombre.
2. Actualizar el chat.
3. Avisar: **Nombre distinto listo**.

Resultado esperado:

- No debe verificarse automaticamente.
- Debe quedar `pendiente_whatsapp` o `revision_manual`.
- No debe sumarse como verificado.
- No debe crear pago confirmado para el cliente equivocado.

### Secundaria 3. Pago fuera de tiempo

Pasos:

1. Enviar comprobante.
2. Hacer que MacroDroid llegue mucho despues, por ejemplo 20 a 30 minutos despues.
3. Avisar: **Pago tarde listo**.

Resultado esperado:

- No debe verificarse automaticamente solo por nombre y monto.
- Debe quedar pendiente o revision manual.
- No debe duplicar pago ni pedido.

## Reglas que deben cumplirse siempre

- No inventar nombres.
- No crear pagos duplicados.
- No crear mas de un pedido principal por cliente/dia.
- No crear casillero hasta que el pedido pase por preparacion y se marque listo.
- Si MacroDroid falla, **Verificar manual** debe permitir continuar.
- Si MacroDroid revive despues de una verificacion manual, no debe duplicar el pago.
