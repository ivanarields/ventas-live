# Flujo correcto esperado para auditoria Claude Code: Live, rango exacto y Sin asignar

Fecha: 2026-05-15  
Sistema: `ventas-live`  
Dominio de produccion: `https://leidycandy.me`  
Modo solicitado: auditoria completa, solo lectura, sin correcciones  
Auditor: Claude Code / Anthropic

## Objetivo del documento

Este documento define como debe funcionar correctamente la aplicacion despues de los ultimos cambios importantes.

Claude Code debe usar este documento como contrato de funcionamiento y crear un informe con bugs, riesgos y hallazgos reales.

No debe modificar codigo.
No debe borrar datos.
No debe desplegar.
No debe tocar base de datos en modo escritura.

## Cambios recientes que se deben auditar

1. Boton de Live con tres estados:
   - `LIVE OFF`
   - `LIVE ON`
   - `LISTAR LIVE`

2. Rango exacto del Live:
   - inicio real del Live
   - cierre real del Live
   - analisis solo dentro de ese rango

3. Separacion de pagos:
   - `Live`
   - `Web`
   - `Sin asignar`

4. IA de conversaciones:
   - resumen del chat
   - deteccion de prendas
   - deteccion de comprobantes
   - no mezclar imagenes fuera del rango

5. Fotos del pedido:
   - mostrar prendas dentro del Live
   - no mostrar imagenes posteriores al cierre
   - no perder prendas enviadas dentro del Live

## Flujo correcto general

La aplicacion debe separar tres mundos:

### 1. Pago Live

Es un pago que pertenece a una venta hecha durante el Live.

Debe cumplir:

- el mensaje o comprobante esta dentro del rango Live
- el pago de MacroDroid esta dentro del rango Live
- el pedido Live se crea o actualiza solo con datos de ese rango
- puede quedar verde, morado o gris segun el nivel de match

### 2. Pago Web

Es un pago de la tienda online.

Debe cumplir:

- viene desde el flujo web de la tienda
- no debe mezclarse con pedidos Live
- debe aparecer en la pestana `Web`
- debe mantener su propio flujo de pedido, perfil y confirmacion

### 3. Pago Sin asignar

Es un pago real que entro por MacroDroid, pero no pertenece al rango Live ni al flujo Web.

Debe cumplir:

- debe registrarse porque es dinero real
- debe mostrar nombre, monto y hora
- no debe ensuciar un pedido Live
- no debe cambiar un pedido verde a morado
- no debe inflar el total del pedido Live
- no debe meterse al perfil del pedido Live como si fuera parte del Live
- debe quedar en `Sin asignar` o en una separacion equivalente

## Flujo correcto del boton Live

### Estado 1: LIVE OFF

Significa:

- no hay Live activo
- no se esta capturando un rango Live abierto

Accion esperada al tocar:

- crear una sesion Live
- guardar hora exacta de inicio
- cambiar visualmente a `LIVE ON`

No debe:

- procesar conversaciones
- crear pedidos
- analizar imagenes
- tocar pagos viejos

### Estado 2: LIVE ON

Significa:

- hay un Live activo
- todo lo que ocurra desde el inicio puede pertenecer al Live
- todavia no se procesa el resumen final

Accion esperada al tocar:

- cerrar el Live
- guardar hora exacta de cierre
- validar que el cierre sea posterior al inicio
- permitir cruce de medianoche
- cambiar visualmente a `LISTAR LIVE`

No debe:

- procesar conversaciones todavia, salvo que el sistema explicitamente lo haga despues del cierre
- usar mensajes despues de la hora de cierre
- permitir cierre en el futuro

### Estado 3: LISTAR LIVE

Significa:

- ya existe un Live cerrado
- falta procesar/resumir ese rango

Accion esperada al tocar:

- buscar conversaciones con mensajes dentro del rango exacto
- llamar a la IA solo con `startAt` y `endAt`
- crear o actualizar pedidos Live solo con datos dentro del rango
- guardar evidencias con `live_range`
- marcar la sesion como procesada solo si no hubo errores importantes

No debe:

- analizar mensajes fuera del rango
- usar imagenes cercanas fuera del rango
- mezclar pagos fuera del rango
- procesar la tarde, la manana o el Live anterior

## Flujo correcto cuando entra un pago por MacroDroid

Cuando MacroDroid envia un pago, el sistema debe decidir su contexto.

### Pregunta 1: Es pago Web?

Si viene del flujo tienda online:

- debe ir a `Web`
- debe confirmar pedido web si corresponde
- no debe afectar Live

### Pregunta 2: Esta dentro de un rango Live valido?

Si el pago esta dentro del rango de un Live activo/cerrado que todavia corresponde:

- puede participar en match Live
- puede quedar verde si coincide con comprobante/chat
- puede quedar morado si necesita revision
- puede quedar gris si falta informacion

### Pregunta 3: Esta fuera del rango Live?

Si esta fuera:

- debe quedar separado como `Sin asignar`
- no debe cambiar pedidos Live
- no debe sumarse al total del pedido Live
- no debe volver morado un pedido verde
- no debe asociarse al pedido Live solo porque tenga el mismo nombre o `customer_id`

## Regla critica sobre customer_id

El `customer_id` ayuda a reconocer a la persona, pero no debe ser suficiente para meter un pago en Live.

Regla correcta:

> Aunque un pago tenga `customer_id`, si esta fuera del rango Live, no debe afectar el pedido Live.

Claude debe auditar si hoy el sistema cumple esto.

Riesgo conocido a revisar:

- `src/App.tsx` tiene una separacion visual para `Sin asignar`.
- Si un pago llega con `customerId`, puede no entrar a `Sin asignar`.
- Eso puede ser incorrecto si el pago esta fuera del rango Live.

## Flujo correcto de la IA

La IA debe trabajar con conversaciones dentro del rango exacto.

Entrada correcta:

- `clienteId`
- `startAt`
- `endAt`

Debe analizar:

- mensajes dentro del rango
- fotos dentro del rango
- comprobantes dentro del rango
- prendas dentro del rango

Debe ignorar:

- mensajes antes del inicio
- mensajes despues del cierre
- imagenes antes del inicio
- imagenes despues del cierre
- comprobantes enviados fuera del rango
- imagenes enviadas por la empresa que no son comprobantes entrantes

## Flujo correcto de prendas

Si una clienta envia prendas dentro del Live:

- todas deben quedar visibles para el operador
- la IA puede marcar las que cree seleccionadas
- las no seleccionadas deben seguir visibles
- el operador debe poder corregir manualmente

Ejemplo correcto:

- La clienta envia 3 prendas.
- Dice "quiero estas 2".
- La IA marca 2.
- El sistema muestra las 3.
- El operador confirma o corrige.

Error grave:

- que una prenda enviada dentro del Live desaparezca
- que el operador no pueda verla
- que una imagen de prenda sea tratada solo como ruido

## Flujo correcto de comprobantes

Un comprobante debe entrar al pedido Live solo si:

- fue enviado por la clienta
- esta dentro del rango Live
- corresponde al pago/monto/persona

No debe entrar si:

- fue enviado por la empresa
- esta fuera del rango Live
- es un QR para pagar enviado por la empresa
- es una captura no relacionada

Si el pago ya esta verde:

- el comprobante no deberia contaminar visualmente las fotos de prendas
- solo debe quedar como evidencia si hace falta

Si requiere revision manual:

- puede mostrarse en una seccion separada de comprobantes
- no debe confundirse con prenda

## Flujo correcto de fotos del pedido

La seccion de fotos del pedido debe mostrar solo imagenes dentro del rango Live.

Regla exacta:

- si Live inicia a las 09:00 y cierra a las 10:00, solo entran fotos entre 09:00 y 10:00
- una foto a las 10:02 no entra
- un comprobante a las 10:03 no entra

No debe usarse "fotos cercanas" cuando existe pedido Live con rango.

Si no se puede resolver el rango:

- es mejor mostrar cero fotos que mostrar fotos incorrectas
- Claude debe confirmar si el sistema actual hace eso

## Flujo correcto del pedido Live

Un pedido Live debe representar solo lo vendido dentro del rango Live.

Debe contener:

- cliente del Live
- prendas del Live
- comprobantes del Live
- pagos del Live
- total del Live
- resumen del chat dentro del Live

No debe contener:

- compras de la tarde
- pagos posteriores al cierre
- prendas enviadas despues del cierre
- comprobantes posteriores al cierre
- pedidos Web

## Riesgo conocido que Claude debe revisar: pedido principal por dia

Claude detecto un posible bug:

> `ensureMainDailyPedido` busca por cliente y dia completo, sin respetar el horario del Live.

Archivo:

- `src/services/liveSalesService.ts`

Funcion:

- `ensureMainDailyPedido`

Riesgo:

- si un cliente compra en Live y tambien fuera de Live el mismo dia, el pedido principal puede inflarse
- puede mezclar montos del mismo dia aunque no sean del mismo rango Live
- puede cambiar el total visible del pedido
- puede ensuciar el estado del cliente

Claude debe confirmar con codigo si esto ocurre y explicar el impacto.

## Riesgo conocido que Claude debe revisar: Sin asignar solo visual

Claude detecto un posible bug:

> `Sin asignar` puede ser solo visual si MacroDroid asigna `customer_id`.

Archivo:

- `src/App.tsx`

Funcion:

- `isUnassignedPayment`

Riesgo:

- un pago fuera de Live con `customer_id` podria aparecer en `Live`
- podria no aparecer en `Sin asignar`
- podria contaminar el pedido del cliente
- podria cambiar colores verde/morado/gris

Claude debe confirmar si existe blindaje backend o si falta.

## Casos de prueba obligatorios

### Caso 1: Live normal

1. `LIVE OFF`
2. Iniciar Live
3. Cliente envia prendas dentro del Live
4. Cliente envia comprobante dentro del Live
5. Cerrar Live
6. `LISTAR LIVE`

Resultado esperado:

- pedido Live correcto
- fotos correctas
- resumen correcto
- pago verde si coincide

### Caso 2: Imagen despues del cierre

1. Live termina a las 10:00
2. Cliente envia prenda a las 10:02
3. Cliente envia comprobante a las 10:03

Resultado esperado:

- no aparecen en pedido Live
- no aparecen en resumen
- no afectan pagos

### Caso 3: Pago fuera de Live del mismo cliente

1. Pedido Live queda verde
2. Mismo cliente paga despues del cierre

Resultado esperado:

- pedido Live sigue verde
- pago nuevo va a `Sin asignar` o separacion fuera de Live
- no cambia total del Live

### Caso 4: Pago fuera de Live con customer_id

1. MacroDroid reconoce el nombre y asigna `customer_id`
2. El pago esta fuera del rango Live

Resultado esperado:

- no debe entrar al pedido Live
- no debe cambiar estado del pedido
- no debe ocultarse de `Sin asignar` solo por tener `customer_id`

### Caso 5: Live cruza medianoche

1. Live inicia 21:00
2. Live cierra 02:00 del dia siguiente

Resultado esperado:

- el rango funciona aunque cambie el dia
- no depende solo del calendario
- no mezcla pagos de la tarde siguiente

### Caso 6: Empresa envia QR o captura

1. La empresa envia QR de pago
2. La empresa envia imagen de prenda

Resultado esperado:

- no se toma como comprobante entrante
- no crea pago falso
- no crea pedido falso

### Caso 7: Muchas prendas

1. Cliente envia 3 o mas imagenes de prendas dentro del Live
2. IA selecciona algunas

Resultado esperado:

- todas las prendas visibles
- seleccion IA editable
- ninguna prenda perdida

## Archivos que Claude debe revisar

Revisar obligatoriamente:

- `src/App.tsx`
- `src/routes/live-sales.ts`
- `src/routes/ai-gateway.ts`
- `src/routes/identity.ts`
- `src/services/liveSalesService.ts`
- `server.ts`
- `supabase/functions/ingest-notification/index.ts`
- `src/components/OrderChatPhotoSelector.tsx`

## Endpoints que Claude debe revisar

- `GET /api/live-sales/sessions/current`
- `POST /api/live-sales/sessions/start`
- `POST /api/live-sales/sessions/close`
- `POST /api/live-sales/sessions/:id/processed`
- `GET /api/live-sales/pending-conversations`
- `POST /api/ai/summarize-conversation`
- `GET /api/identity/whatsapp-photos`
- `GET /api/pagos-lista`
- `POST /api/pagos`

## Preguntas que Claude debe responder

1. Produccion tiene los ultimos cambios?
2. Local y produccion coinciden en los cambios criticos?
3. `LIVE OFF / LIVE ON / LISTAR LIVE` funciona correctamente?
4. El rango Live se guarda correctamente?
5. El listado usa solo `startAt/endAt`?
6. La IA analiza solo el rango?
7. Las fotos del pedido usan solo el rango?
8. Hay algun fallback que pueda meter fotos cercanas?
9. Todas las prendas dentro del Live quedan visibles?
10. Los comprobantes fuera de Live se ignoran?
11. Los pagos fuera de Live se separan de verdad?
12. `Sin asignar` es separacion backend o solo frontend?
13. Un pago con `customer_id` fuera de Live puede contaminar el pedido?
14. `ensureMainDailyPedido` mezcla por dia completo?
15. Puede un pedido verde pasar a morado por un pago fuera de Live?
16. Puede inflarse el total del pedido del dia?
17. El flujo Web sigue intacto?
18. El flujo Live sigue intacto?

## Comandos minimos sugeridos

```bash
npm run build
npm run test:live-sales
```

Tambien revisar produccion con:

```bash
https://leidycandy.me
```

Si Claude puede usar `.env` en modo lectura, puede consultar Supabase solo para confirmar estructura y datos.

## Informe que Claude debe crear

Crear un archivo nuevo en:

`docs/planes/`

Nombre obligatorio:

`hallazgos-20-flujo-correcto-live-sin-asignar-CLAUDE-CODE-20260515-[HORA].md`

El informe debe incluir:

1. Resumen ejecutivo.
2. Si produccion tiene los cambios.
3. Si local y produccion coinciden.
4. Flujo que si funciona.
5. Hallazgos criticos.
6. Hallazgos medios.
7. Hallazgos menores.
8. Bugs reproducibles.
9. Riesgo para pagos fuera de Live.
10. Riesgo para pedidos verdes.
11. Riesgo para el total del pedido.
12. Riesgo para seleccion de prendas.
13. Riesgo para comprobantes.
14. Riesgo para tienda Web.
15. Riesgo para Live.
16. Archivos y lineas exactas.
17. Endpoints probados.
18. Pruebas ejecutadas.
19. Cambios minimos recomendados.
20. Conclusion: listo para usar, usar con cuidado o no usar.

## Criterio final de aprobacion

El sistema solo esta correcto si se cumple esto:

> Nada que ocurra fuera del rango Live puede cambiar, inflar, ensuciar o confundir un pedido Live.

Si eso no se cumple, Claude debe marcarlo como hallazgo critico.
