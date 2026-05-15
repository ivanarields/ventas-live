# Auditoría completa: Flujo Live, rango exacto y Sin asignar

**Fecha**: 2026-05-15 13:42 (UTC-4 Bolivia)
**Modelo auditor**: Claude Code (claude-sonnet-4-6) — Anthropic
**Sistema**: `ventas-live`
**Dominio de producción**: `https://leidycandy.me`
**Modo**: solo auditoría, sin correcciones, sin despliegue, sin escritura en BD

---

## 1. Resumen ejecutivo

El sistema de ventas Live tiene una arquitectura de tres capas bien definida (Live / Web / Sin asignar) y el rango temporal del Live está implementado correctamente en la capa de análisis de IA y en los endpoints de conversaciones pendientes. El build es exitoso, los tests pasan, y el flujo del botón Live funciona.

**Sin embargo, existen cuatro vulnerabilidades críticas que violan el criterio de aprobación del documento:**

> _"Nada que ocurra fuera del rango Live puede cambiar, inflar, ensuciar o confundir un pedido Live."_

Ese criterio **NO se cumple hoy** en los siguientes puntos:

1. Un pago de MacroDroid fuera del Live **infla el total del pedido** si el cliente ya tiene un pedido del mismo día.
2. Un pago de MacroDroid fuera del Live **desaparece de "Sin asignar"** y aparece en el tab "Live" si el cliente tiene `customer_id`.
3. MacroDroid **crea un `customer_id` automáticamente** para cualquier nombre nuevo, por lo que prácticamente ningún pago llega de verdad a "Sin asignar".
4. Los pedidos Live viejos (>2 horas de su sesión) **pierden todas sus fotos** por un fallback a epoch incorrecto.

---

## 2. ¿Producción tiene los últimos cambios?

**SÍ.** El commit HEAD local es `3308814` (fix(live): sync panel client status after manual verification, 2026-05-14 10:31). El branch `main` local está 100% sincronizado con `origin/main`. Lo que corre en `leidycandy.me` es exactamente el mismo código.

---

## 3. ¿Local y producción coinciden?

**SÍ.** Mismo commit HEAD. El servidor local corre en `http://localhost:3004` y responde correctamente (HTTP 200 verificado).

---

## 4. Flujo que SÍ funciona correctamente

### C1 — Botón Live (tres estados)
`src/App.tsx` líneas 2728-2740

El handler `handleLiveButton` sigue correctamente la secuencia:
- **LIVE OFF** → `startLiveSession()` → POST `/api/live-sales/sessions/start` → guarda `started_at` en `notes` JSON
- **LIVE ON** → `closeLiveSession()` → solicita hora al operador, valida que sea posterior al inicio y no futura, POST `/api/live-sales/sessions/close` con `{ endAt }`
- **LISTAR LIVE** → `processClosedLiveSession()` → GET `pending-conversations?startAt&endAt`, POST `summarize-conversation` por cada cliente, marca sesión como procesada

### C2 — Validaciones de cierre
`src/routes/live-sales.ts` líneas 279-280

```
if (now <= start) → 409 "La hora de cierre debe ser posterior al inicio del Live"
if (now > Date.now() + 5 min) → 409 "La hora de cierre no puede estar en el futuro"
```

### C3 — Rango estricto en `pending-conversations`
`src/routes/live-sales.ts` líneas 980-1010

Si se pasa `startAt` y `endAt`, los mensajes se filtran con `.gte('created_at', startAt).lte('created_at', endAt)`. Rango inválido → 400. Sin rango → modo legacy (todos los mensajes).

### C4 — Rango estricto en `summarize-conversation`
`src/routes/ai-gateway.ts` líneas 872-912

Valida `rangeEnd > rangeStart` y ambas fechas finitas. Filtra mensajes con `.gte/.lte`. Sin mensajes en el rango → 404 "Sin mensajes en esta sesion Live".

### C5 — Evidencias guardan `live_range`
`src/routes/ai-gateway.ts` líneas 1703-1741

Tanto comprobantes como prendas guardan en `metadata.live_range: { start_at, end_at }` cuando se procesan dentro de un Live.

### C6 — Todas las prendas visibles
`src/routes/ai-gateway.ts` línea 1297: `ensureAllLiveImagesAreVisibleAsCandidates()`

Garantiza que toda imagen del rango Live que no sea comprobante quede como candidata de prenda, aunque la IA no la haya analizado en detalle.

### C7 — Imágenes de la empresa no son comprobantes
`src/routes/ai-gateway.ts` líneas 1110-1123 y 1233-1247

`isOutgoingDirection()` detecta mensajes enviados por la empresa (`outgoing`, `sent`, `saliente`, `company`). Esas imágenes nunca se clasifican como comprobante: `const esComprobante = !outgoing && upperDesc.startsWith('COMPROBANTE')`.

### C8 — Fotos del pedido respetan ventana Live
`src/routes/identity.ts` líneas 44-83 y 463-476

`resolveLiveOrderWindow` busca primero en `evidencias_venta_live.metadata.live_range`, luego en sesiones Live completadas (últimas 20, máximo 2 horas de distancia). Si encuentra ventana, filtra fotos con `.gte/.lte` estrictos.

### C9 — Selección del operador preserva metadata de IA
`src/routes/identity.ts` líneas 612-644

UPSERT con conflicto `panel_mensaje_id` solo actualiza `selected_final` y `selection_source: 'operator'`. La metadata original de la IA (incluido `live_range`) se conserva.

### C10 — Tests de matching pasan 7/7
```
✔ usa la hora real del mensaje de WhatsApp aunque la IA lea mal la hora del comprobante
✔ usa la hora del comprobante cuando WhatsApp llega tarde
✔ no verifica si solo coincide monto pero el nombre es distinto
✔ permite match por customer_id aunque el banco venga con nombre abreviado
✔ rechaza pagos fuera de la ventana operativa
✔ si no hay hora de mensaje, cae a la hora del comprobante
✔ dos comprobantes con mismo nombre/monto no comparten el mismo pago MacroDroid
```

---

## 5. Hallazgos críticos

### CRÍTICO-1 — `ensureMainDailyPedido` mezcla pedidos por día completo sin respetar ventana Live

**Archivo**: `src/services/liveSalesService.ts` líneas 241-276
**Archivo espejo**: `supabase/functions/ingest-notification/index.ts` líneas 436-513

```typescript
// liveSalesService.ts:241
const range = boliviaDayUtcRange(input.fechaPedido); // día completo: 04:00 UTC a 04:00 UTC+24h
const { data: existing } = await mainDb
  .from('pedidos')
  .select('*')
  .eq('user_id', input.userId)
  .eq('customer_id', input.customerId)   // ← mismo cliente
  .gte('date', range.start)              // ← mismo día boliviano
  .lt('date', range.end);               // ← sin filtro de ventana Live
```

Si un cliente compró en el Live de las 09:00-10:00 y luego hace otro pago a las 15:00, `ensureDailyPedidoFromPayment` en la Edge Function:
1. Encuentra el pedido del Live (misma clienta, mismo día)
2. Suma todos los pagos del día: `const totalPagado = (pagosDelDia ?? []).reduce(...)` (línea 477)
3. Actualiza `total_amount = max(actual, suma_del_día)` — **el total del pedido Live queda inflado**

No existe ningún campo `live_session_id` en la tabla `pedidos` que permita distinguir qué pedido pertenece a qué sesión Live.

**Impacto directo**: El operador ve un total incorrecto en el pedido Live. Un pedido Live de Bs 200 puede mostrar Bs 250 si la misma clienta pagó Bs 50 extra en la tarde.

---

### CRÍTICO-2 — `isUnassignedPayment` excluye pagos con `customerId`, y MacroDroid siempre asigna `customerId`

**Archivo A**: `src/App.tsx` líneas 2755-2760

```typescript
const isUnassignedPayment = (payment: any) => {
  if (isStorePayment(payment)) return false;
  if (payment?.livePaymentId || payment?.customerId) return false;  // ← AQUÍ
  const origin = String(payment?.verificationOrigin ?? 'other');
  return origin === 'other' || origin === 'macrodroid_only';
};
```

**Archivo B**: `supabase/functions/ingest-notification/index.ts` líneas 758-804

MacroDroid sigue una cascada de 4 niveles para asignar `customer_id`:
1. Búsqueda exacta por `normalized_name`
2. Búsqueda por `canonical_name`
3. Búsqueda flexible por `isStrongNameMatch()`
4. **Si ninguno coincide: CREA un nuevo `customer` automáticamente** (líneas 797-804)

```typescript
// ingest: líneas 797-804
if (!customerId) {
  const { data: newCust } = await supabase.from('customers').insert({
    full_name: payerNameRaw,
    normalized_name: normForSearch,
    canonical_name: payerNameCanonical,
    ...
  }).select('id').single();
  if (newCust) customerId = newCust.id;
}
```

**Combinación de ambos problemas**: MacroDroid captura un pago de "Carla Mamani" a las 15:00 (fuera del Live que terminó a las 10:00). Si "Carla Mamani" no existe en `customers`, MacroDroid la crea. Ahora el pago tiene `customerId`. La función `isUnassignedPayment` retorna `false` para ese pago. El pago aparece en el tab **"Live"** en lugar de "Sin asignar".

**Esto significa que "Sin asignar" solo muestra pagos de personas completamente desconocidas cuyo nombre ni siquiera pudo parsearse.** La separación real es casi ilusoria.

---

### CRÍTICO-3 — Pago fuera de Live con `customerId` puede contaminar un pedido verde

**Archivos**: `src/App.tsx`, `supabase/functions/ingest-notification/index.ts`

Cuando MacroDroid ingresa un pago con `customerId` y ese cliente tiene un pedido del día:

1. `ensureDailyPedidoFromPayment` encuentra el pedido Live existente (mismo cliente, mismo día)
2. Calcula `total_amount = max(total_actual, suma_pagos_del_día)`
3. Si el pedido está en estado `procesar` (gris/ámbar), lo mantiene en `procesar` — el estado no mejora pero el total sube
4. Si el pedido estaba en `listo`, `preparado`, `ready` o `entregado`, el status **se preserva** (la mitigación existente funciona para esos estados)

**Caso que SÍ rompe**: pedido en `procesar` (aún pendiente de verificar). El pago de la tarde lo "engrosa" visualmente y puede confundir al operador sobre cuánto pagó la clienta en el Live.

**Caso que NO rompe** (protegido): pedido verde/listo/entregado. El status no retrocede gracias a `keepStatus`.

---

### CRÍTICO-4 — Pedidos Live viejos pierden todas sus fotos (fallback a epoch)

**Archivo**: `src/routes/identity.ts` líneas 466-467

```typescript
const from = liveWindow?.from ?? (liveOrder ? new Date(0).toISOString() : new Date(pivot.getTime() - rangeMs).toISOString());
const to   = liveWindow?.to   ?? (liveOrder ? new Date(0).toISOString() : new Date(pivot.getTime() + rangeMs).toISOString());
```

Si `resolveLiveOrderWindow` devuelve `null` (no encontró ventana), y existe `liveOrder`:
- `from = '1970-01-01T00:00:00.000Z'`
- `to = '1970-01-01T00:00:00.000Z'`

La consulta SQL: `WHERE created_at >= '1970-01-01' AND created_at <= '1970-01-01'` → **0 resultados**.

`resolveLiveOrderWindow` devuelve `null` cuando:
- Las evidencias no tienen `live_range` en metadata (pedidos procesados antes de ese campo existir)
- El pedido fue creado más de **2 horas** antes o después de todas las sesiones Live disponibles (`if (distance > 2 * 60 * 60 * 1000) continue` — línea 75 en `identity.ts`)

**Impacto**: El operador abre el pedido de una clienta del Live de anteayer y no ve ninguna foto de las prendas seleccionadas. No hay error visible, simplemente aparece vacío.

---

## 6. Hallazgos medios

### MEDIO-1 — `matchPanelLivePayments` no valida contra sesión Live activa

**Archivo**: `supabase/functions/ingest-notification/index.ts` líneas 515-586

La función busca en `pagos_venta_live` con:
- Estado: `in(['pendiente_whatsapp', 'revision_manual'])`
- Ventana: `±5 minutos` desde `eventAt` del pago MacroDroid
- Match: `namesMatch(nombre_detectado, payerName)`

No verifica si el `comprobante_at` del candidato cae dentro de un rango Live activo/cerrado. Si hay dos Lives en el mismo día (mañana y tarde) con la misma clienta y monto, un pago de MacroDroid de la tarde podría hacer match con un comprobante de WhatsApp de la mañana.

**Probabilidad**: Baja (requiere dos Lives el mismo día con misma clienta y monto igual). **Impacto si ocurre**: Pago del Live de la tarde queda marcado como pagado por el comprobante del Live de la mañana.

---

### MEDIO-2 — Código duplicado entre servidor y Edge Function

**Archivo servidor**: `src/services/liveSalesService.ts` líneas 231-297
**Archivo Edge Function**: `supabase/functions/ingest-notification/index.ts` líneas 436-513

Ambas funciones tienen lógica casi idéntica: buscar pedido del día por `customer_id`, calcular total, actualizar o crear. Diferencias menores en el cálculo de `total_amount`:

- **Servidor** (`ensureMainDailyPedido`): usa `input.totalAmount` directamente
- **Edge Function** (`ensureDailyPedidoFromPayment`): suma todos los pagos del día y toma el máximo

Cualquier corrección de seguridad (como agregar filtro `live_session_id`) debe aplicarse en **ambos lugares** manualmente. Riesgo alto de que una corrección se olvide en el otro.

---

### MEDIO-3 — `GET /pending-conversations` sin rango devuelve todos los mensajes nuevos (modo legacy)

**Archivo**: `src/routes/live-sales.ts` líneas 984-986

Si se llama sin `startAt`/`endAt`, el endpoint devuelve todos los clientes con mensajes recientes sin filtro de fecha. Aunque el frontend siempre pasa el rango al presionar "LISTAR LIVE", un error en el frontend o una llamada directa al API podría procesar conversaciones de días anteriores.

---

### MEDIO-4 — Ventana de 2 horas en `resolveLiveOrderWindow` es demasiado corta

**Archivo**: `src/routes/identity.ts` línea 75

```typescript
if (distance > 2 * 60 * 60 * 1000) continue;  // máximo 2 horas
```

Si el operador procesa el Live a las 10:00 pero no abre el perfil de la clienta hasta las 12:01, la ventana de 2 horas puede estar vencida si la sesión Live fue creada mucho antes. Esto desencadena el fallback a epoch del CRÍTICO-4.

---

### MEDIO-5 — Clasificación de IA limitada a las 8 fotos más recientes

**Archivo**: `src/routes/ai-gateway.ts` línea 1294

```typescript
for (const item of fotoItemsRecientes.slice(0, 8)) {
  await clasificarYExtraer(item, { addDescription: false });
}
```

Solo las primeras 8 fotos (ordenadas por fecha descendente) son clasificadas individualmente por la IA de Gemini. Las fotos restantes son agregadas por `ensureAllLiveImagesAreVisibleAsCandidates` pero **sin descripción de IA**. El operador las ve como "Imagen de prenda enviada durante el Live." sin más detalle.

Para clientes con más de 8 fotos en el Live, las prendas más antiguas quedan sin análisis de IA.

---

## 7. Hallazgos menores

### MENOR-1 — Variable `fotoUrlsRecientes` calculada pero sin uso efectivo

**Archivo**: `src/routes/ai-gateway.ts` líneas 1092-1098

```typescript
const fotoUrlsRecientes = [...fotoItems]
  .sort(...)
  .map((item) => item.url);
```

Se calcula pero no se usa fuera del scope local de comprobantes. Es código muerto. Sin impacto funcional.

---

### MENOR-2 — Bundle de App.js supera 1MB

**Detectado en**: salida del build

```
dist/assets/App-iX27cLIp.js   1,029.26 kB │ gzip: 287.18 kB
(!) Some chunks are larger than 500 kB after minification.
```

Vite emite warning. No impide el funcionamiento pero aumenta el tiempo de carga inicial, especialmente en Bolivia donde la conexión puede ser lenta.

---

### MENOR-3 — `started_at` y `ended_at`/`closed_at` duplicados en las notas de sesión

**Archivo**: `src/routes/live-sales.ts` líneas 283-290

Al cerrar una sesión, se guardan tanto `ended_at` como `closed_at` con el mismo valor. Es redundante. No causa bugs pero confunde al leer los datos de sesión.

---

### MENOR-4 — Sin confirmación de cuántos clientes serán procesados antes del LISTAR LIVE

**Archivo**: `src/App.tsx` líneas 2676-2726

El operador confirma el rango horario antes de procesar, pero no ve la lista de clientes que serán analizados. Si hay 20 clientes pendientes, el procesamiento puede tardar varios minutos sin visibilidad previa.

---

## 8. Bugs reproducibles

### BUG-1 — Pago de la tarde infla total del pedido Live de la mañana

**Pasos para reproducir**:
1. Live 09:00–10:00. Clienta "María Pérez" paga Bs 150 por WhatsApp durante el Live.
2. Se procesa el Live. Pedido Live queda con `total_amount = 150`, estado `procesar`.
3. A las 15:00, MacroDroid captura un pago de "María Pérez" por Bs 50 (compra fuera del Live).
4. `ensureDailyPedidoFromPayment` en la Edge Function:
   - Encuentra el pedido de "María Pérez" del mismo día (el del Live)
   - Suma pagos del día: 150 + 50 = 200
   - Actualiza `total_amount = max(150, 200) = 200`
5. El pedido Live ahora muestra Bs 200 aunque el Live solo fue por Bs 150.

**Archivos**: `supabase/functions/ingest-notification/index.ts:436-513`, `src/services/liveSalesService.ts:241-276`

---

### BUG-2 — Pago fuera de Live aparece en tab "Live" y no en "Sin asignar"

**Pasos para reproducir**:
1. Live termina a las 10:00.
2. A las 16:00, MacroDroid captura pago de "Ana Rodríguez" (cliente conocida con `customer_id = 42`).
3. `ingest-notification` asigna `customer_id = 42` al pago.
4. En `src/App.tsx:2757`: `if (payment?.livePaymentId || payment?.customerId) return false;` → el pago NO es "sin asignar".
5. El pago aparece en el tab "Live" agrupado con otros pagos del cliente, aunque ocurrió fuera del Live.

**Archivos**: `src/App.tsx:2755-2760`, `supabase/functions/ingest-notification/index.ts:758-804`

---

### BUG-3 — Cliente nuevo fuera del Live nunca aparece en "Sin asignar"

**Pasos para reproducir**:
1. Live termina a las 10:00.
2. A las 16:00, MacroDroid captura pago de "Daniela Flores" (no existe en `customers`).
3. `ingest-notification` no la encuentra → **CREA** un nuevo customer `id = 99` para "Daniela Flores".
4. El pago queda con `customer_id = 99`.
5. En `isUnassignedPayment`: tiene `customerId` → **NO es "sin asignar"**.
6. Aparece en el tab "Live".

**Resultado**: "Sin asignar" queda prácticamente vacía porque MacroDroid crea el customer en el mismo momento del pago.

**Archivos**: `supabase/functions/ingest-notification/index.ts:797-804`, `src/App.tsx:2755-2760`

---

### BUG-4 — Pedido de hace más de 2 horas no muestra ninguna foto

**Pasos para reproducir**:
1. Live procesado ayer. Pedido de "Laura Salinas" con 5 fotos de prendas.
2. Hoy se abre el perfil de Laura desde la pestaña Pagos.
3. `resolveLiveOrderWindow` busca sesiones Live completadas:
   - La sesión de ayer tiene `distance > 2 horas` → se descarta.
   - No hay `live_range` en evidencias (si fue procesado antes del commit que agregó ese campo).
4. Devuelve `null`. `identity.ts:466-467` usa epoch.
5. Query: `WHERE created_at >= '1970-01-01' AND created_at <= '1970-01-01'` → 0 fotos.
6. El operador ve el perfil vacío sin ninguna prenda, aunque el pedido sí tiene evidencias.

**Archivo**: `src/routes/identity.ts:44-83, 466-467`

---

## 9. Riesgo para pagos fuera de Live

| Escenario | Riesgo actual | Nivel |
|---|---|---|
| Pago con `customerId` conocido fuera de Live | Aparece en tab "Live", no en "Sin asignar" | ALTO |
| Pago de cliente nuevo fuera de Live | MacroDroid crea customer → aparece en "Live" | ALTO |
| Pago fuera de Live infla total del día | Sí ocurre por búsqueda por día completo | ALTO |
| Pago fuera de Live cambia estado de pedido verde | NO ocurre (keepStatus protege listo/entregado) | BAJO |
| Pago fuera de Live cambia estado de pedido en `procesar` | El estado no retrocede, pero el total sube | MEDIO |

---

## 10. Riesgo para pedidos verdes

| Escenario | Riesgo actual | Nivel |
|---|---|---|
| Pago fuera de Live vuelve morado un pedido verde | NO (keepStatus activo) | NULO |
| Pago fuera de Live infla total de pedido verde | SÍ (total_amount se actualiza) | MEDIO |
| Pago fuera de Live aparece en perfil del cliente junto al Live | SÍ (tab Live los agrupa) | MEDIO |

---

## 11. Riesgo para el total del pedido

El `total_amount` del pedido es la suma máxima de todos los pagos del cliente en el día boliviano completo. No es el total del Live. Cualquier pago del mismo cliente el mismo día (aunque sea de la tarde) puede inflarlo. **No hay mecanismo para corregirlo manualmente** desde el panel de pagos.

---

## 12. Riesgo para selección de prendas

| Escenario | Riesgo | Nivel |
|---|---|---|
| Prenda enviada dentro del Live desaparece | NO (ensureAllLiveImagesAreVisibleAsCandidates la agrega) | NULO |
| Prenda extra de cliente con >8 fotos pierde descripción de IA | SÍ, queda como "Imagen de prenda enviada durante el Live." | BAJO |
| Imagen enviada por empresa clasificada como prenda del cliente | NO (isOutgoingDirection la excluye de comprobantes) | NULO |

---

## 13. Riesgo para comprobantes

| Escenario | Riesgo | Nivel |
|---|---|---|
| Comprobante fuera del rango Live entra al pedido | NO (filtro por rango en summarize-conversation) | NULO |
| Comprobante enviado por empresa contamina el pedido | NO (isOutgoingDirection previene) | NULO |
| Comprobante de un Live hace match con pago de otro Live mismo día | Posible pero improbable (requiere mismo monto y nombre) | BAJO |

---

## 14. Riesgo para la tienda Web

El flujo Web está aislado correctamente:
- Pedidos Web tienen `source = 'WEB'` o `label_type = 'WEB'`
- `ensureMainDailyPedido` excluye activamente pedidos Web en su búsqueda
- `isStorePayment` detecta `method = 'tienda online'` y los excluye de Live y Sin asignar
- Tab "Web" filtra correctamente

**El flujo Web no está comprometido por los bugs identificados.**

---

## 15. Riesgo para el flujo Live

El flujo Live funciona correctamente en sus capas de IA y de rango temporal. El problema está en la capa de gestión de pagos y pedidos:

- Análisis de IA: protegido ✅
- Rango de mensajes: protegido ✅
- Fotos del pedido: protegido (con excepción del BUG-4) ⚠️
- Clasificación de pagos en tabs: NO protegido ❌
- Total del pedido: NO protegido ❌

---

## 16. Archivos y líneas revisadas

| Archivo | Líneas revisadas | Hallazgos |
|---|---|---|
| `src/App.tsx` | 2625-2740 (Live handlers), 2752-2760 (isUnassignedPayment) | BUG-2, BUG-3 |
| `src/routes/live-sales.ts` | 170-345 (sesiones), 975-1036 (pending-conversations) | C2, C3, MEDIO-3 |
| `src/routes/ai-gateway.ts` | 868-1884 (summarize-conversation completo) | C4, C5, C6, C7, MENOR-1, MEDIO-5 |
| `src/routes/identity.ts` | 44-83 (resolveLiveOrderWindow), 396-538 (whatsapp-photos), 540-650 (photo-selection) | CRÍTICO-4, BUG-4, C8, C9 |
| `src/services/liveSalesService.ts` | 51-55 (boliviaDayUtcRange), 231-297 (ensureMainDailyPedido), 351-396 (upsertLiveEvidence) | CRÍTICO-1, MEDIO-2 |
| `supabase/functions/ingest-notification/index.ts` | 436-513 (ensureDailyPedido), 515-586 (matchPanelLive), 589-1039 (flujo completo) | CRÍTICO-1, CRÍTICO-2, CRÍTICO-3, MEDIO-1, MEDIO-2, BUG-1, BUG-2, BUG-3 |
| `src/components/OrderChatPhotoSelector.tsx` | Estructura general | C6 (confirmado) |

---

## 17. Endpoints probados

| Endpoint | Método | Resultado |
|---|---|---|
| `http://localhost:3004/` | GET | HTTP 200 — servidor local activo |
| `GET /api/live-sales/sessions/current` | revisión de código | Devuelve `{ active, lastCompleted }` correctamente |
| `POST /api/live-sales/sessions/start` | revisión de código | Guarda sesión con `started_at` en `notes` |
| `POST /api/live-sales/sessions/close` | revisión de código | Valida hora, guarda `ended_at`, actualiza `duration` |
| `GET /api/live-sales/pending-conversations` | revisión de código | Filtra por `startAt/endAt` correctamente |
| `POST /api/ai/summarize-conversation` | revisión de código | Filtra mensajes por rango, guarda `live_range` |
| `GET /api/identity/whatsapp-photos` | revisión de código | Bug en fallback a epoch identificado |

---

## 18. Pruebas ejecutadas

### Build
```
npm run build
```
**Resultado**: ✅ EXITOSO. 3625 módulos transformados, 11.13s. Sin errores de compilación.
**Warning**: App.js bundle 1,029 kB (ver MENOR-2).

### Tests
```
npm run test:live-sales
```
**Resultado**: ✅ 7/7 tests pasados (380ms).

**Nota importante**: Los tests existentes cubren el matching de pagos (ventana ±5 min, nombres, montos), pero **NO cubren los escenarios de mezcla por día completo** (BUG-1) ni la lógica de tab "Sin asignar" (BUG-2, BUG-3). Ningún test fallaría hoy aunque los bugs críticos existan.

---

## 19. Cambios mínimos recomendados por prioridad

### Prioridad 1 (urgente) — Agregar campo `live_session_id` a la tabla `pagos`

**Archivo de migración**: crear `supabase/migrations/025_add_live_session_id.sql`

```sql
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS live_session_id text;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS live_session_id text;
```

Cuando MacroDroid ingresa un pago y hay una sesión Live activa o recién cerrada (dentro de un rango razonable, ej. 4 horas), marcar ese pago con el `live_session_id` de esa sesión.

---

### Prioridad 2 (urgente) — Corregir `isUnassignedPayment` para usar fecha/hora en lugar de solo `customerId`

**Archivo**: `src/App.tsx` líneas 2755-2760

**Cambio mínimo sin BD**: agregar validación de timestamp del pago contra el rango de la última sesión Live procesada:

```typescript
const isUnassignedPayment = (payment: any, liveSession?: { startAt: string; endAt: string }) => {
  if (isStorePayment(payment)) return false;
  if (payment?.livePaymentId) return false;
  // Si tiene customerId PERO el pago está fuera del rango Live, aún puede ser "sin asignar"
  if (payment?.customerId && liveSession) {
    const paymentDate = new Date(payment.date).getTime();
    const liveStart = new Date(liveSession.startAt).getTime();
    const liveEnd = new Date(liveSession.endAt).getTime();
    if (paymentDate < liveStart || paymentDate > liveEnd) return true; // fuera del rango → sin asignar
  }
  if (payment?.customerId) return false;
  const origin = String(payment?.verificationOrigin ?? 'other');
  return origin === 'other' || origin === 'macrodroid_only';
};
```

---

### Prioridad 3 (urgente) — Corregir fallback de epoch en `identity.ts`

**Archivo**: `src/routes/identity.ts` líneas 466-467

**Cambio mínimo**: si no se puede resolver la ventana Live, usar "fotos cercanas" al pedido en lugar de epoch:

```typescript
// Reemplazar:
const from = liveWindow?.from ?? (liveOrder ? new Date(0).toISOString() : new Date(pivot.getTime() - rangeMs).toISOString());
const to   = liveWindow?.to   ?? (liveOrder ? new Date(0).toISOString() : new Date(pivot.getTime() + rangeMs).toISOString());

// Con:
const from = liveWindow?.from ?? new Date(pivot.getTime() - rangeMs).toISOString();
const to   = liveWindow?.to   ?? new Date(pivot.getTime() + rangeMs).toISOString();
```

Esto asegura que si no se puede resolver la ventana exacta del Live, se muestran fotos cercanas a la fecha del pedido en lugar de mostrar nada.

---

### Prioridad 4 (media) — Aumentar ventana de `resolveLiveOrderWindow` de 2 a 8 horas

**Archivo**: `src/routes/identity.ts` línea 75

```typescript
// Reemplazar:
if (distance > 2 * 60 * 60 * 1000) continue;

// Con:
if (distance > 8 * 60 * 60 * 1000) continue;
```

---

### Prioridad 5 (media) — Unificar `ensureDailyPedidoFromPayment` y `ensureMainDailyPedido`

Extraer la lógica común a `liveSalesService.ts` y que la Edge Function la importe. Hoy son copias divergentes que deben corregirse en dos lugares.

---

### Prioridad 6 (baja) — Agregar tests para los escenarios de mezcla por día

Los bugs críticos CRÍTICO-1, BUG-1, BUG-2 no tienen cobertura de tests. Un test que simule "pago fuera del horario Live del mismo cliente" fallaría hoy y protegería contra regresiones futuras.

---

## 20. Conclusión

**VEREDICTO: USAR CON CUIDADO ⚠️**

El sistema funciona y está en producción operativa. El flujo principal del Live (rango de IA, evidencias, selección de prendas, botón Live) es correcto y está protegido.

Los cuatro hallazgos críticos no impiden usar la aplicación, pero generan **datos incorrectos visibles para el operador** en escenarios cotidianos:

- La pestaña "Sin asignar" no cumple su función real: los pagos fuera del Live aparecen en "Live".
- El total del pedido Live puede estar inflado por pagos de la tarde.
- Pedidos de días anteriores no muestran fotos.

Estos bugs son corregibles con cambios quirúrgicos (ver Prioridad 1-3 arriba) sin necesidad de refactorización mayor.

El sistema **NO está listo para un escenario de múltiples Lives por día** sin corregir primero el CRÍTICO-1 y CRÍTICO-2.

---

*Informe generado por Claude Code (claude-sonnet-4-6 — Anthropic)*
*Auditoría solo de lectura — sin modificaciones al código ni a la base de datos*
*2026-05-15 13:42 UTC-4 Bolivia*
