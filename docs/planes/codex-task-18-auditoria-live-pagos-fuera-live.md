# Auditoria completa: Live, pagos fuera de Live y limpieza del panel

Fecha: 2026-05-15  
Sistema: `ventas-live`  
Objetivo: auditar el flujo principal de ventas Live para encontrar bugs antes de seguir usando produccion.

## Contexto

Se agrego un sistema para que el operador marque el tramo exacto del Live:

- `LIVE OFF`: el Live esta apagado.
- `LIVE ON`: el Live esta encendido y debe tomar mensajes desde ese momento.
- `LISTAR LIVE`: el Live ya se cerro y toca analizar solo ese tramo.

El sistema debe analizar solamente mensajes, fotos, prendas y comprobantes dentro del rango exacto:

- inicio del Live
- cierre del Live

No debe analizar mensajes antes.
No debe analizar mensajes despues.
No debe usar "fotos cercanas".
No debe mezclar compras de la tarde o de otro horario.

## Cambios principales implementados

### 1. Boton Live por estados

Archivo principal:

- `src/App.tsx`

Estados esperados:

- `LIVE OFF`: inicia una sesion Live.
- `LIVE ON`: cierra la sesion Live y pide hora real de cierre.
- `LISTAR LIVE`: procesa conversaciones dentro del rango cerrado.

El boton debe conservar la logica:

1. iniciar Live
2. cerrar Live
3. listar/procesar Live

### 2. Sesiones Live en backend

Archivo:

- `src/routes/live-sales.ts`

Endpoints agregados/usados:

- `GET /api/live-sales/sessions/current`
- `POST /api/live-sales/sessions/start`
- `POST /api/live-sales/sessions/close`
- `POST /api/live-sales/sessions/:id/processed`
- `GET /api/live-sales/pending-conversations?startAt=...&endAt=...`

Regla critica:

`pending-conversations` solo debe devolver clientes con mensajes dentro del rango `startAt/endAt`.

### 3. Resumen IA con rango exacto

Archivo:

- `src/routes/ai-gateway.ts`

Endpoint:

- `POST /api/ai/summarize-conversation`

Ahora acepta:

- `clienteId`
- `startAt`
- `endAt`

Reglas esperadas:

- Si viene `startAt/endAt`, solo lee mensajes dentro de ese rango.
- Si el rango es invalido, debe rechazar.
- No debe usar mensajes fuera del Live.
- Debe guardar evidencias con metadata `live_range`.

### 4. Fotos del pedido con ventana exacta

Archivo:

- `src/routes/identity.ts`

Endpoint:

- `GET /api/identity/whatsapp-photos`

Cambio esperado:

- Si existe pedido Live, debe resolver la ventana exacta del Live.
- Debe mostrar solo imagenes dentro de esa ventana.
- No debe mostrar fotos de despues del cierre.
- No debe volver al modo de "fotos cercanas" si hay pedido Live.

Riesgo conocido:

- Si no logra resolver la ventana Live de un pedido viejo, puede no mostrar fotos. Eso es mejor que mostrar fotos incorrectas, pero debe auditarse.

### 5. Todas las prendas deben aparecer

Archivo:

- `src/routes/ai-gateway.ts`

Regla esperada:

- Todas las imagenes dentro del Live deben entrar como candidatas visibles.
- La IA solo debe marcar cuales prendas cree que fueron seleccionadas.
- El operador debe poder ver todas las prendas y corregir.
- No se debe perder una prenda porque la IA no la selecciono.

### 6. Comprobantes y prendas no deben confundirse

Archivo:

- `src/components/OrderChatPhotoSelector.tsx`

Reglas esperadas:

- En "Fotos del pedido" deben aparecer prendas.
- Los comprobantes no deben contaminar la preparacion si el pago ya esta verificado.
- Si hay revision manual, los comprobantes pueden aparecer en una seccion separada.

### 7. Pestañas compactas de pagos

Archivo:

- `src/App.tsx`

Pestañas actuales:

- `Live`
- `Web`
- `Sin asignar`

Reglas esperadas:

- `Live`: solo debe mostrar pagos/pedidos del flujo Live.
- `Web`: pagos/pedidos de tienda web.
- `Sin asignar`: pagos sueltos con nombre, monto y hora.

`Sin asignar` debe ser compacto y no debe ensuciar el perfil del cliente ni el pedido Live.

## Problema critico pendiente a auditar

El cambio `Sin asignar` actualmente es principalmente visual.

Riesgo:

- Si MacroDroid crea o encuentra `customer_id` por nombre, el pago podria seguir asociado al cliente.
- En ese caso puede ensuciar el perfil o el pedido de Live aunque haya sido fuera de horario.

La regla correcta deberia ser:

> Un pago solo puede afectar un pedido Live si cae dentro del rango exacto de ese Live.

Si el pago entra fuera del rango:

- debe registrarse porque es dinero real
- no debe cambiar pedidos Live ya verdes
- no debe volver morado un pedido ya cerrado
- no debe sumarse al total del pedido Live
- no debe meter fotos ni comprobantes al pedido Live
- debe quedar separado como pago fuera de Live / sin asignar

## Escenarios que deben probarse

### Escenario A: Live normal

1. Iniciar Live.
2. Cliente envia fotos de prendas.
3. Cliente envia comprobante dentro del Live.
4. Cerrar Live.
5. Listar Live.

Resultado esperado:

- Solo aparecen prendas y comprobantes dentro del Live.
- El pedido hace match verde si corresponde.
- Las prendas seleccionadas por IA aparecen con check.
- Las prendas no seleccionadas tambien deben aparecer visibles.

### Escenario B: mensajes despues del cierre

1. Live termina a las 10:00.
2. Cliente envia una prenda a las 10:02.
3. Cliente envia comprobante a las 10:03.

Resultado esperado:

- Esas imagenes no deben aparecer en el pedido Live.
- No deben entrar al resumen del chat.
- No deben cambiar el estado del pedido Live.

### Escenario C: pago fuera del Live

1. Pedido Live queda verde.
2. Horas despues el mismo cliente paga otra compra.

Resultado esperado:

- El pedido verde no cambia.
- No se vuelve morado.
- No se agrega ese pago al pedido Live.
- Debe verse separado, no contaminando el pedido.

### Escenario D: cliente con mismo nombre

1. MacroDroid recibe pago de una persona con nombre igual o parecido.
2. El pago esta fuera del rango Live.

Resultado esperado:

- No debe asignarse automaticamente al pedido Live.
- No debe contaminar el perfil del pedido Live.

### Escenario E: muchas fotos dentro del Live

1. Cliente envia 3 o mas fotos de prendas.
2. Solo confirma 2.

Resultado esperado:

- Deben aparecer todas las prendas enviadas dentro del Live.
- La IA marca solo las confirmadas.
- El operador puede corregir manualmente.

### Escenario F: comprobante enviado por la empresa

1. La empresa envia QR, imagen o captura al cliente.

Resultado esperado:

- No debe tomarse como comprobante del cliente.
- Puede ser prenda u otro, pero no pago entrante.

## Archivos que deben auditarse

Revisar especialmente:

- `src/App.tsx`
- `src/routes/live-sales.ts`
- `src/routes/ai-gateway.ts`
- `src/routes/identity.ts`
- `src/components/OrderChatPhotoSelector.tsx`
- `server.ts`
- `supabase/functions/ingest-notification/index.ts`

## Preguntas que la auditoria debe responder

1. El rango de Live se respeta en todos los puntos?
2. Hay algun camino que todavia use "fotos cercanas" cuando hay pedido Live?
3. Un pago fuera del Live puede ensuciar un pedido ya verde?
4. MacroDroid puede asignar `customer_id` y romper la separacion de `Sin asignar`?
5. La pestaña `Sin asignar` separa realmente datos o solo visualmente?
6. Las prendas no seleccionadas por IA siguen apareciendo?
7. Puede un comprobante aparecer como prenda?
8. Puede una prenda aparecer como comprobante?
9. El operador puede corregir la seleccion de prendas sin romper evidencias?
10. Hay riesgo de que un pedido viejo no muestre fotos por no tener `live_range`?

## Validaciones obligatorias

Ejecutar:

```bash
npm run build
npm run test:live-sales
```

Si alguna prueba no aplica, explicar por que.

## Formato del informe que debe crear la IA auditora

Crear un archivo nuevo en:

`docs/planes/`

Nombre del informe:

`hallazgos-18-auditoria-live-pagos-fuera-live-[NOMBRE-IA]-20260515-[HORA].md`

Ejemplo:

`hallazgos-18-auditoria-live-pagos-fuera-live-claude-20260515-1530.md`

El informe debe incluir:

1. Resumen ejecutivo.
2. Hallazgos criticos.
3. Hallazgos medios.
4. Hallazgos menores.
5. Confirmaciones de lo que si esta correcto.
6. Lista de bugs reproducibles.
7. Riesgo para el operador.
8. Riesgo para el perfil del cliente.
9. Riesgo para pagos verdes/morados/grises.
10. Cambios recomendados, ordenados por prioridad.
11. Archivos y lineas revisadas.
12. Pruebas ejecutadas y resultado.

## Importante

No hacer cambios de codigo durante esta auditoria.

Primero crear el informe.

El objetivo es encontrar fallos antes de seguir usando el sistema principal en produccion.
