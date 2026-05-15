# Auditoria de produccion para Claude Code: Live, pagos fuera de Live y sistema principal

Fecha: 2026-05-15  
Sistema: `ventas-live`  
Dominio de produccion: `https://leidycandy.me`  
Modo: solo auditoria, sin cambios de codigo  
Auditor solicitado: Claude Code / Anthropic

## Objetivo

Auditar en profundidad los ultimos cambios hechos en el sistema principal de ventas Live.

La auditoria debe verificar que produccion funciona correctamente y que no se mezclan:

- mensajes fuera del horario Live
- fotos fuera del horario Live
- comprobantes fuera del horario Live
- pagos fuera del horario Live
- prendas que no correspondan al pedido Live

El resultado debe ser un informe nuevo con nombre de la IA auditora.

## Regla principal del sistema

Un pedido Live solo puede usar datos que esten dentro del rango exacto:

- hora de inicio del Live
- hora de cierre del Live

Todo lo que ocurra antes o despues de ese rango no debe contaminar el pedido Live.

Eso incluye:

- mensajes
- imagenes
- prendas
- comprobantes
- pagos
- resumen de IA
- seleccion de fotos del pedido
- estado verde, morado o gris del pago

## Cambios recientes que se deben auditar

### 1. Boton Live por estados

Archivo principal:

- `src/App.tsx`

Estados esperados:

- `LIVE OFF`: el Live esta apagado. Al tocarlo debe iniciar una sesion Live.
- `LIVE ON`: el Live esta encendido. Al tocarlo debe cerrar la sesion Live.
- `LISTAR LIVE`: el Live ya fue cerrado. Al tocarlo debe procesar/resumir solo ese rango cerrado.

Verificar:

- que el boton conserve la funcionalidad original
- que no se pueda listar sin rango valido
- que el cierre guarde una hora valida
- que el listado use `startAt` y `endAt`
- que el estado visual no rompa la logica

### 2. Sesiones Live en backend

Archivo:

- `src/routes/live-sales.ts`

Endpoints a revisar:

- `GET /api/live-sales/sessions/current`
- `POST /api/live-sales/sessions/start`
- `POST /api/live-sales/sessions/close`
- `POST /api/live-sales/sessions/:id/processed`
- `GET /api/live-sales/pending-conversations?startAt=...&endAt=...`

Reglas esperadas:

- `pending-conversations` debe leer solo `panel_mensajes.created_at` dentro del rango exacto.
- Si el rango es invalido, debe rechazar.
- No debe usar conversaciones viejas.
- No debe usar conversaciones posteriores al cierre.
- No debe mezclar un Live con otro.

### 3. Resumen IA dentro del rango exacto

Archivo:

- `src/routes/ai-gateway.ts`

Endpoint:

- `POST /api/ai/summarize-conversation`

Reglas esperadas:

- Si recibe `startAt` y `endAt`, debe leer solo mensajes dentro de ese rango.
- Si una imagen esta fuera del rango, no debe analizarla.
- Si un comprobante esta fuera del rango, no debe crear evidencia para el pedido Live.
- Si una prenda esta fuera del rango, no debe aparecer en el pedido Live.
- Debe guardar evidencias con metadata `live_range` cuando aplique.

Auditar especialmente:

- separacion entre prenda y comprobante
- imagenes enviadas por la empresa
- comprobantes enviados por la clienta
- comprobantes fuera del Live
- imagenes dentro del Live que la IA no selecciona

### 4. Todas las prendas dentro del Live deben mostrarse

Archivo:

- `src/routes/ai-gateway.ts`
- `src/components/OrderChatPhotoSelector.tsx`

Regla esperada:

La IA puede decidir cuales prendas fueron confirmadas, pero el sistema no debe perder imagenes de prendas que fueron enviadas dentro del Live.

Ejemplo:

- La clienta envia 3 imagenes de prendas dentro del Live.
- La IA cree que solo 2 son las elegidas.
- El operador debe poder ver las 3.
- Las seleccionadas pueden venir marcadas.
- Las no seleccionadas deben quedar visibles para correccion manual.

Auditar si existe un limite, filtro o error que haga desaparecer prendas.

### 5. Fotos del pedido y ventana Live

Archivo:

- `src/routes/identity.ts`

Endpoint:

- `GET /api/identity/whatsapp-photos`

Reglas esperadas:

- Si existe pedido Live, debe resolver la ventana exacta del Live.
- Debe mostrar solo fotos dentro de esa ventana.
- No debe mostrar fotos de despues del cierre.
- No debe mostrar fotos de antes del inicio.
- No debe volver a usar "fotos cercanas" si hay pedido Live.

Caso critico a revisar:

- Live termina a las 10:00.
- La clienta envia prenda a las 10:02.
- La clienta envia comprobante a las 10:03.
- Esas imagenes no deben aparecer en el pedido Live.

### 6. Pagos fuera de Live

Archivos:

- `src/App.tsx`
- `server.ts`
- `supabase/functions/ingest-notification/index.ts`
- `src/routes/live-sales.ts`

Problema a auditar:

Un pago real fuera del Live debe registrarse porque es dinero real, pero no debe ensuciar un pedido Live ya cerrado o ya verde.

Reglas esperadas:

- Un pago fuera del rango Live no debe volver morado un pedido verde.
- No debe sumarse al total del pedido Live.
- No debe agregarse al perfil/pedido Live como si perteneciera a ese Live.
- No debe crear comprobante del pedido Live.
- Debe quedar separado como pago fuera de Live o `Sin asignar`.

Auditar especialmente si la separacion actual es solo visual o si tambien esta blindada en backend.

Riesgo critico:

Si MacroDroid asigna `customer_id` a un pago fuera de Live, ese pago podria aparecer unido al cliente y contaminar el estado del pedido.

La auditoria debe responder si ese riesgo existe hoy en produccion.

### 7. Pestanas del panel de pagos

Archivo:

- `src/App.tsx`

Pestanas actuales:

- `Live`
- `Web`
- `Sin asignar`

Reglas esperadas:

- `Live`: solo flujo Live.
- `Web`: solo tienda web.
- `Sin asignar`: pagos sueltos, fuera de Live, con nombre, monto y hora.

La pestana `Sin asignar` debe ser compacta y no debe contaminar el pedido Live.

Auditar si:

- un pago fuera de Live entra correctamente a `Sin asignar`
- un pago fuera de Live aparece por error en `Live`
- un pago fuera de Live cambia el color del match de un pedido Live
- un pago fuera de Live aparece dentro del perfil/pedido del cliente

### 8. Sistema principal

Auditar que los cambios anteriores no rompan:

- ingreso de pagos por MacroDroid
- match automatico verde
- revision manual morada
- pagos grises o pendientes
- pedidos Live
- pedidos Web
- detalle del cliente
- fotos del pedido
- resumen del chat
- seleccion manual de prendas
- marcado como listo

## Auditoria obligatoria en produccion

Esta auditoria no debe quedarse solo en local.

Debe revisar:

1. Codigo local actual.
2. Build local.
3. Endpoints reales de produccion en `https://leidycandy.me`.
4. Si hay credenciales disponibles en `.env`, consultar datos reales necesarios de Supabase en modo lectura.

No hacer cambios en produccion.
No borrar datos.
No modificar base de datos.
No desplegar.

## Comandos locales sugeridos

Ejecutar:

```bash
npm run build
npm run test:live-sales
```

Si alguna prueba falla, registrar:

- comando
- error
- archivo relacionado
- impacto real en produccion

## Pruebas de produccion sugeridas

Usar `https://leidycandy.me`.

Validar al menos:

```bash
GET /api/live-sales/sessions/current
GET /api/live-sales/pending-conversations?startAt=...&endAt=...
POST /api/ai/summarize-conversation
GET /api/identity/whatsapp-photos
GET /api/pagos-lista
```

Si un endpoint necesita `x-user-id`, usar el usuario real configurado en el entorno local si existe.

No inventar resultados.
Si no se puede probar algo, decir claramente que no se pudo probar y por que.

## Escenarios que Claude Code debe validar

### Escenario A: Live correcto

1. Inicia Live.
2. Entran fotos de prendas dentro del Live.
3. Entra comprobante dentro del Live.
4. Cierra Live.
5. Lista Live.

Esperado:

- Solo datos dentro del rango.
- Match verde si corresponde.
- Todas las prendas visibles.
- Comprobantes correctos.

### Escenario B: imagenes despues del cierre

1. Live cierra a las 10:00.
2. Llega prenda a las 10:02.
3. Llega comprobante a las 10:03.

Esperado:

- No aparecen en pedido Live.
- No aparecen en resumen.
- No afectan estado.

### Escenario C: pago fuera de Live del mismo cliente

1. Pedido Live queda verde.
2. El mismo cliente paga horas despues, fuera del Live.

Esperado:

- Pedido Live sigue verde.
- Pago fuera de Live queda separado.
- No se mezcla con el pedido Live.

### Escenario D: empresa envia QR o imagen

1. El numero de empresa envia QR, prenda o captura.

Esperado:

- No debe tomarse como comprobante entrante de cliente.
- No debe crear pago falso.
- No debe crear pedido falso.

### Escenario E: muchas prendas

1. Cliente envia 3 o mas prendas dentro del Live.
2. La IA confirma solo algunas.

Esperado:

- Todas aparecen visibles.
- Las confirmadas aparecen marcadas.
- El operador puede corregir.

### Escenario F: Live cruzando medianoche

1. Live inicia el 15 a las 21:00.
2. Live termina el 16 a las 02:00.
3. Se lista el 16 por la manana.

Esperado:

- El rango debe cruzar medianoche correctamente.
- No debe depender solo del dia seleccionado en calendario.
- No debe mezclar pagos del dia siguiente fuera del rango.

## Preguntas que el informe debe responder

1. Produccion tiene realmente los ultimos cambios?
2. El boton `LIVE OFF / LIVE ON / LISTAR LIVE` funciona logicamente?
3. El backend respeta el rango exacto?
4. La IA resume solo dentro del rango?
5. Las fotos del pedido respetan el rango exacto?
6. Hay algun fallback de "fotos cercanas" que pueda contaminar pedidos?
7. Todas las prendas dentro del Live quedan visibles?
8. Puede una prenda quedar perdida por limite, filtro o error de IA?
9. Puede un comprobante fuera de Live aparecer en pedido Live?
10. Puede un pago fuera de Live ensuciar un pedido verde?
11. `Sin asignar` es separacion real o solo visual?
12. MacroDroid puede asignar un pago fuera de Live a un cliente y romper la limpieza?
13. El cruce de medianoche funciona?
14. El sistema principal de pagos Web sigue funcionando?
15. El sistema principal de pagos Live sigue funcionando?

## Formato obligatorio del informe

Crear un archivo nuevo en:

`docs/planes/`

Nombre obligatorio:

`hallazgos-19-auditoria-produccion-claude-live-pagos-CLAUDE-CODE-20260515-[HORA].md`

Ejemplo:

`hallazgos-19-auditoria-produccion-claude-live-pagos-CLAUDE-CODE-20260515-1430.md`

El informe debe contener:

1. Resumen ejecutivo.
2. Confirmacion de si produccion tiene los cambios.
3. Hallazgos criticos.
4. Hallazgos medios.
5. Hallazgos menores.
6. Bugs reproducibles.
7. Riesgo para pedidos verdes.
8. Riesgo para pagos fuera de Live.
9. Riesgo para seleccion de prendas.
10. Riesgo para comprobantes.
11. Riesgo para flujo Web.
12. Riesgo para flujo Live.
13. Archivos y lineas revisadas.
14. Endpoints de produccion probados.
15. Consultas de base revisadas en modo lectura.
16. Pruebas ejecutadas y resultado.
17. Recomendaciones ordenadas por prioridad.
18. Conclusion clara: listo para usar, usar con cuidado o no usar.

## Restricciones

- No corregir codigo.
- No desplegar.
- No borrar datos.
- No modificar base.
- No marcar pedidos como listos.
- No verificar pagos reales.
- Solo lectura, auditoria y reporte.

## Criterio final

La auditoria debe decir claramente si el sistema esta protegido contra el problema principal:

> Que pagos, fotos o comprobantes fuera del horario Live contaminen un pedido Live correcto.

Si no esta protegido, explicar exactamente:

- por donde entra el error
- que archivo lo permite
- que endpoint lo permite
- que dato se mezcla
- como afectaria al operador
- como afectaria al cliente
- que cambio minimo lo arreglaria
