# Auditoria completa: Live, pagos fuera de Live y limpieza del panel

**Fecha**: 2026-05-15 12:55 (UTC-4 Bolivia)  
**Modelo auditor**: opencode (deepseek-v4-pro)  
**Sistema**: `ventas-live`  
**Build**: OK (vite build exitoso, 3625 modulos)  
**Tests**: 7/7 passed (`test:live-sales`)

---

## 1. Resumen ejecutivo

El sistema de ventas Live implementa correctamente el flujo principal de rango de tiempo (inicio/cierre de Live) para la mayoria de los endpoints criticos: `pending-conversations`, `summarize-conversation`, y guardado de evidencias con metadata `live_range`. Las fotos del pedido respetan la ventana exacta del Live cuando esta disponible. Las prendas no seleccionadas por IA siguen apareciendo visibles para el operador.

**Hallazgo critico**: El principal riesgo identificado esta en la funcion `ensureMainDailyPedido` (usada tanto por el flujo Live como por MacroDroid), que agrupa pagos por `customer_id` + **dia completo** sin respetar la ventana del Live. Esto significa que un pago fuera del rango Live de un mismo cliente puede modificar el mismo pedido diario, aunque con mitigaciones parciales.

**Hallazgo critico**: La separacion `Sin asignar` en la pestaña Pagos es puramente visual (filtro en frontend), sin respaldo en base de datos. Si MacroDroid asigna `customer_id` a un pago fuera de horario, ese pago desaparece de "Sin asignar" y se mezcla con los pagos del Live.

---

## 2. Hallazgos criticos

### H2.1 — `ensureMainDailyPedido` no respeta la ventana del Live

**Archivo**: `src/services/liveSalesService.ts:231-297`  
**Archivo Edge Function**: `supabase/functions/ingest-notification/index.ts:436-513`  
**Severidad**: ALTA  
**Impacto**: Un pago fuera del rango Live de un mismo cliente puede modificar el pedido diario que se creo durante el Live.

**Detalle tecnico**:

Ambas funciones (`ensureMainDailyPedido` en el servidor y `ensureDailyPedidoFromPayment` en la Edge Function) comparten la misma logica:

```typescript
// liveSalesService.ts:231-297
const range = boliviaDayUtcRange(input.fechaPedido); // busca por DIA completo
const { data: existing } = await mainDb
  .from('pedidos')
  .select('*')
  .eq('user_id', input.userId)
  .eq('customer_id', input.customerId)
  .gte('date', range.start)  // 04:00 UTC del dia
  .lt('date', range.end);    // 04:00 UTC del dia siguiente
```

La busqueda del pedido existente es por `customer_id` + **dia de Bolivia completo**, sin filtrar por la ventana horaria del Live. Si ya existe un pedido de ese cliente en el mismo dia (creado durante el Live), cualquier pago posterior (fuera del Live) actualiza el mismo pedido.

**Mitigacion parcial existente**: El codigo preserva el status si es `listo`, `preparado`, `ready` o `entregado`:
```typescript
const keepStatus = ['listo', 'preparado', 'ready', 'entregado'].includes(status);
```
Esto evita que un pedido ya LISTO se vuelva a `procesar`, pero **no evita** que:
- El `total_amount` del pedido se actualice sumando pagos fuera del Live
- Un pedido en estado `procesar` (gris/ambar) se mantenga en ese estado aunque el Live ya cerro

### H2.2 — `Sin asignar` es solo un filtro visual, no una separacion real

**Archivo**: `src/App.tsx:2755-2760` (funcion `isUnassignedPayment`)  
**Archivo Edge Function**: `supabase/functions/ingest-notification/index.ts:757-804`  
**Severidad**: ALTA  
**Impacto**: Pagos fuera del Live pueden migrar automaticamente del tab "Sin asignar" al tab "Live" sin intervencion del operador.

**Detalle tecnico**:

La funcion `isUnassignedPayment` en el frontend determina que un pago es "sin asignar" si:
```typescript
const isUnassignedPayment = (payment: any) => {
  if (isStorePayment(payment)) return false;
  if (payment?.livePaymentId || payment?.customerId) return false;
  const origin = String(payment?.verificationOrigin ?? 'other');
  return origin === 'other' || origin === 'macrodroid_only';
};
```

Si MacroDroid llega y encuentra un `customer_id` por nombre (lo cual hace en `ingest-notification/index.ts:757-804`), el pago automaticamente:
1. Obtiene `customerId` 
2. Deja de cumplir `isUnassignedPayment` (porque ahora tiene `customerId`)
3. Desaparece de "Sin asignar" y aparece en "Live"

No hay un flag en la tabla `pagos` que marque permanentemente un pago como "sin asignar" o "fuera de Live". La separacion depende exclusivamente de que el pago NO tenga `customerId` ni `livePaymentId`.

**Consecuencia**: Un pago legitimo de la tarde (fuera del Live de la manana) de un cliente con mismo nombre:
1. MacroDroid lo captura y le asigna `customer_id`
2. Aparece en el tab "Live" mezclado con pagos del Live real
3. `ensureDailyPedidoFromPayment` lo suma al `total_amount` del pedido del dia
4. Si el pedido estaba en `procesar`, no cambia de estado pero su monto se infla

---

## 3. Hallazgos medios

### H3.1 — `resolveLiveOrderWindow` tiene fallback a rango vacio para pedidos huerfanos

**Archivo**: `src/routes/identity.ts:44-83`  
**Severidad**: MEDIA  
**Impacto**: Pedidos viejos sin `live_range` en evidencias y sin sesion Live cercana pueden no mostrar fotos.

**Detalle tecnico**:

```typescript
// identity.ts:466-467
const from = liveWindow?.from ?? (liveOrder ? new Date(0).toISOString() : new Date(pivot.getTime() - rangeMs).toISOString());
const to = liveWindow?.to ?? (liveOrder ? new Date(0).toISOString() : new Date(pivot.getTime() + rangeMs).toISOString());
```

Cuando existe `liveOrder` pero `liveWindow` es null (no se pudo resolver):
- `from` = `new Date(0).toISOString()` = 1970-01-01
- `to` = `new Date(0).toISOString()` = 1970-01-01

Esto resulta en una consulta SQL con `.gte('created_at', '1970-01-01T00:00:00.000Z')` y `.lte('created_at', '1970-01-01T00:00:00.000Z')`, que devuelve **cero resultados**. Es decir, el pedido no muestra ninguna foto.

**Comparacion con el riesgo documentado**: El documento de auditoria menciona este riesgo como conocido ("Si no logra resolver la ventana Live de un pedido viejo, puede no mostrar fotos"). El codigo confirma que efectivamente es asi.

**Posible mejora**: Si no se puede resolver la ventana Live, caer al modo de "fotos cercanas" con la fecha del pedido como pivote (en lugar de epoch), igual que cuando no hay `liveOrder`.

### H3.2 — `matchPanelLivePayments` en MacroDroid usa ventana de ±5 minutos pero no valida contra sesion Live

**Archivo**: `supabase/functions/ingest-notification/index.ts:515-586`  
**Severidad**: MEDIA  
**Impacto**: Un pago de MacroDroid puede hacer match con un comprobante WhatsApp aunque este fuera del rango del Live activo.

**Detalle tecnico**:

```typescript
const from = new Date(center - 5 * 60 * 1000).toISOString();  // ±5 min
const to = new Date(center + 5 * 60 * 1000).toISOString();
```

La ventana de ±5 minutos es razonable para match monto+nombre+hora, pero no verifica si el `comprobante_at` del pago del panel cae dentro del rango de una sesion Live. Si hay dos lives en el mismo dia (ej. manana y tarde), un pago de la tarde podria hacer match con un comprobante WhatsApp de la manana si coinciden monto y nombre.

### H3.3 — `ensureDailyPedidoFromPayment` (Edge Function) y `ensureMainDailyPedido` (servidor) son codigo duplicado

**Archivo**: `supabase/functions/ingest-notification/index.ts:436-513`  
**Archivo**: `src/services/liveSalesService.ts:231-297`  
**Severidad**: MEDIA  
**Impacto**: Riesgo de divergencia — cambios en uno podrian no reflejarse en el otro.

Las dos funciones tienen logica casi identica (buscar pedido del dia por customer_id, actualizar o crear) pero estan en archivos separados sin compartir codigo. Cualquier correccion de seguridad (ej. validar ventana Live) requeriria cambios en ambos lugares.

---

## 4. Hallazgos menores

### H4.1 — El boton "Live" no muestra confirmacion de rango antes de procesar

**Archivo**: `src/App.tsx:2676-2726`  
**Severidad**: BAJA  
**Impacto**: El operador podria procesar accidentalmente un Live con rango incorrecto.

Cuando el boton muestra "LISTAR LIVE", el operador ve una confirmacion con las horas de inicio y fin. Si confirma, se procesan TODAS las conversaciones con mensajes en ese rango. No hay un paso intermedio para revisar la lista de clientes antes de disparar el procesamiento masivo con IA.

### H4.2 — `fotoUrlsRecientes` definido pero no usado fuera del scope de comprobantes

**Archivo**: `src/routes/ai-gateway.ts:1092-1098`  
**Severidad**: BAJA  
**Impacto**: Codigo muerto — sin impacto funcional.

La variable `fotoUrlsRecientes` se calcula pero solo se usa dentro del bloque de procesamiento de comprobantes. No afecta el comportamiento.

### H4.3 — Comprobantes de la empresa (outgoing) correctamente excluidos como comprobantes

**Archivo**: `src/routes/ai-gateway.ts:1233-1236`  
**Severidad**: INFO  
**Impacto**: Positivo — el Escenario F del documento esta correctamente implementado.

```typescript
const outgoing = isOutgoingDirection(item.direction);
// ...
const esComprobante = !outgoing && upperDesc.startsWith('COMPROBANTE');
```

Las imagenes enviadas por la empresa (outgoing) nunca se clasifican como comprobantes, cumpliendo el Escenario F.

---

## 5. Confirmaciones de lo que si esta correcto

### C5.1 — Rango de Live en `pending-conversations`

**Archivo**: `src/routes/live-sales.ts:975-1036`  
**Estado**: CORRECTO

Cuando se pasan `startAt` y `endAt`, los mensajes se filtran estrictamente con `.gte('created_at', startAt)` y `.lte('created_at', endAt)`. Si el rango es invalido, el endpoint devuelve 400. Sin rango, se devuelven todos los clientes con mensajes nuevos (modo legacy).

### C5.2 — Rango de Live en `summarize-conversation`

**Archivo**: `src/routes/ai-gateway.ts:868-909`  
**Estado**: CORRECTO

El endpoint acepta `startAt`/`endAt`, valida el rango, y filtra mensajes con `.gte`/`.lte`. Si el rango es invalido, rechaza con 400. Si no hay mensajes en el rango, devuelve 404 con mensaje "Sin mensajes en esta sesion Live".

### C5.3 — Evidencias guardadas con metadata `live_range`

**Archivo**: `src/routes/ai-gateway.ts:1703-1709, 1737-1740`  
**Estado**: CORRECTO

Tanto las evidencias de tipo `comprobante` como las de tipo `prenda` guardan el campo `metadata.live_range` con `start_at` y `end_at` cuando estan dentro de un rango Live.

### C5.4 — Todas las prendas visibles, IA solo marca seleccion

**Archivo**: `src/routes/ai-gateway.ts:1272-1285, 1721-1743`  
**Estado**: CORRECTO

`ensureAllLiveImagesAreVisibleAsCandidates()` garantiza que toda imagen dentro del Live que no sea comprobante se agregue como `prendasDetectadas`. Luego, `upsertLiveEvidence` guarda todas con metadata `selected_by_ai` y `selected_final`. La IA solo marca cuales cree seleccionadas, pero todas quedan visibles.

### C5.5 — Fotos del pedido respetan ventana Live

**Archivo**: `src/routes/identity.ts:396-538`  
**Estado**: CORRECTO (con reserva del H3.1)

`resolveLiveOrderWindow` busca primero en metadata de evidencias (`live_range`), luego en sesiones Live completadas. Si encuentra ventana, filtra fotos estrictamente con `.gte('created_at', from)` y `.lte('created_at', to)`. No usa "fotos cercanas" cuando hay ventana Live.

### C5.6 — Separacion de comprobantes en el selector de fotos

**Archivo**: `src/components/OrderChatPhotoSelector.tsx:123-127, 193`  
**Estado**: CORRECTO

La funcion `isComprobantePhoto` separa correctamente los comprobantes de las prendas mediante el campo `tipo` y heuristics de descripcion. En la UI, las prendas y comprobantes aparecen en secciones separadas.

### C5.7 — Correccion de seleccion por el operador preserva evidencias

**Archivo**: `src/routes/identity.ts:542-650`  
**Estado**: CORRECTO

El endpoint `POST /api/identity/whatsapp-photo-selection` usa `upsert` con `onConflict: 'panel_mensaje_id'`, preservando el `tipo` original y actualizando solo `selected_final` y `selection_source: 'operator'`. La metadata original de la IA se mantiene.

### C5.8 — Comprobantes de la empresa no se toman como pago

**Archivo**: `src/routes/ai-gateway.ts:1233-1246`  
**Estado**: CORRECTO

Ver H4.3. El Escenario F funciona.

### C5.9 — Pestañas de pagos (Live/Web/Sin asignar)

**Archivo**: `src/App.tsx:3182-3210`  
**Estado**: CORRECTO (UI)

La interfaz de 3 pestañas funciona. La pestaña "Live" muestra pagos con customerId o livePaymentId, "Web" muestra pagos de tienda, y "Sin asignar" muestra el resto.

### C5.10 — Boton Live por estados

**Archivo**: `src/App.tsx:2728-2740, 3088-3100`  
**Estado**: CORRECTO

El boton sigue la secuencia correcta: LIVE OFF → iniciar, LIVE ON → cerrar, LISTAR LIVE → procesar. Los colores y tooltips son coherentes.

---

## 6. Lista de bugs reproducibles

### B6.1 — Pago fuera de Live infla `total_amount` del pedido del dia

**Como reproducir**:
1. Iniciar Live a las 09:00, cerrar a las 10:00
2. Cliente "Maria Perez" compra durante el Live por Bs 200
3. Se crea pedido `#123` para "Maria Perez" con `total_amount = 200`
4. A las 15:00, MacroDroid captura un pago de "Maria Perez" por Bs 50 (compra fuera de Live)
5. `ensureDailyPedidoFromPayment` encuentra el pedido `#123` (misma cliente, mismo dia)
6. Actualiza `total_amount` a `max(200, 250) = 250` o recalcula con todos los pagos del dia

**Archivos involucrados**:
- `supabase/functions/ingest-notification/index.ts:436-513`
- `src/services/liveSalesService.ts:231-297`

### B6.2 — Pago sin asignar migra a Live cuando MacroDroid encuentra customer_id

**Como reproducir**:
1. Cliente nuevo "Juan Lopez" paga Bs 100 pero su nombre no existe en `customers`
2. MacroDroid captura la notificacion, no encuentra customer, inserta pago sin `customer_id`
3. El pago aparece en "Sin asignar" (correcto)
4. Horas despues, otro pago del mismo "Juan Lopez" hace que el sistema cree un customer
5. O BIEN: un operador crea manualmente el customer "Juan Lopez"
6. Pagos futuros de "Juan Lopez" ya NO aparecen en "Sin asignar" aunque sean fuera de horario Live

**Archivos involucrados**:
- `src/App.tsx:2755-2760`
- `supabase/functions/ingest-notification/index.ts:757-804`

### B6.3 — Pedido huerfano (sin live_range y sin sesion cercana) no muestra fotos

**Como reproducir**:
1. Crear un pedido Live hace 3 dias (cuando las sesiones Live ya no estan en los ultimos 20 registros o la evidencia no tiene `live_range`)
2. Intentar ver las fotos del pedido desde el perfil del cliente
3. La consulta usa rango epoch→epoch y devuelve 0 fotos

**Archivos involucrados**:
- `src/routes/identity.ts:44-83, 466-467`

---

## 7. Riesgo para el operador

| Riesgo | Probabilidad | Impacto | Mitigacion existente |
|---|---|---|---|
| Ver montos inflados en pedidos del dia | MEDIA | MEDIO | Status listo/entregado preservado |
| Pagos de la tarde mezclados con Live | ALTA | MEDIO | Ninguna (es visual solamente) |
| Confusion al verificar pagos fuera de horario | MEDIA | BAJO | Operador puede revisar hora del pago |
| Live procesado con rango incorrecto | BAJA | ALTO | Confirmacion antes de procesar |

---

## 8. Riesgo para el perfil del cliente

| Riesgo | Probabilidad | Impacto |
|---|---|---|
| `total_amount` del pedido diario no refleja solo el Live | ALTA | MEDIO |
| Pagos fuera de Live asociados al mismo perfil | MEDIA | BAJO |
| Perfil muestra montos mezclados de Live + fuera de Live | MEDIA | BAJO |

---

## 9. Riesgo para pagos verdes/morados/grises

| Riesgo | Probabilidad | Impacto |
|---|---|---|
| Pago verde (verificado_macrodroid) no cambia por pagos fuera de Live | NULA | — |
| Pago morado (whatsapp_pending) puede resolverse con match fuera de ventana Live | BAJA | BAJO |
| Pago gris (sin asignar) puede volverse Live por asignacion de customer_id | ALTA | MEDIO |

**Nota**: Los pagos verificados (verdes) son estables. El match `verificado_macrodroid` tiene ventana de ±5 minutos, que es razonable. El riesgo principal esta en la migracion gris→Live.

---

## 10. Cambios recomendados, ordenados por prioridad

### Prioridad 1 (critico) — Separar pagos fuera de Live en base de datos

Agregar un campo `live_session_id` (nullable) a la tabla `pagos` y a `pedidos`. Solo los pagos/pedidos con `live_session_id` poblado se consideran parte de un Live. Modificar `isUnassignedPayment` para usar este campo en lugar de heuristics basadas en `customerId`.

**Archivos a modificar**:
- `src/App.tsx` — `isUnassignedPayment()`
- `supabase/functions/ingest-notification/index.ts` — `ensureDailyPedidoFromPayment()`
- `src/services/liveSalesService.ts` — `ensureMainDailyPedido()`
- Migracion SQL para agregar `live_session_id` a `pagos` y `pedidos`

### Prioridad 1 (critico) — `ensureMainDailyPedido` debe respetar ventana del Live

Modificar `ensureMainDailyPedido` y `ensureDailyPedidoFromPayment` para que, cuando el pago viene del flujo Live, busquen el pedido por `customer_id` + `live_session_id` en lugar de solo `customer_id` + dia. Si el pago NO es del flujo Live, crear un pedido separado con `source = 'macrodroid_fuera_live'` u otro marcador.

### Prioridad 2 (alto) — Mejorar fallback de `resolveLiveOrderWindow`

Cuando no se encuentra `live_range` en evidencias ni sesion Live cercana, caer al modo de "fotos cercanas" usando la fecha del pedido como pivote con un rango de ±N horas, en lugar de usar epoch que devuelve 0 resultados.

**Archivo**: `src/routes/identity.ts:466-467`

### Prioridad 3 (medio) — Unificar `ensureDailyPedidoFromPayment` y `ensureMainDailyPedido`

Extraer la logica duplicada a una funcion compartida en `liveSalesService.ts` que pueda ser importada tanto por el servidor como por la Edge Function. Esto reduce el riesgo de divergencia.

### Prioridad 4 (bajo) — Agregar preview de clientes antes de procesar Live

En el flujo `processClosedLiveSession`, mostrar la lista de clientes que seran procesados y permitir al operador deseleccionar algunos antes de disparar el procesamiento con IA.

---

## 11. Archivos y lineas revisadas

| Archivo | Lineas revisadas | Hallazgos |
|---|---|---|
| `src/App.tsx` | 2538-3337 (PaymentsView), 2728-2740 (handleLiveButton) | H2.2, C5.9, C5.10 |
| `src/routes/live-sales.ts` | 1-1039 (completo) | C5.1 |
| `src/routes/ai-gateway.ts` | 1-1887 (completo) | C5.2, C5.3, C5.4, H4.2, H4.3 |
| `src/routes/identity.ts` | 1-762 (completo) | H3.1, C5.5, C5.7, B6.3 |
| `src/components/OrderChatPhotoSelector.tsx` | 1-346 (completo) | C5.6 |
| `server.ts` | 1-1171, 2459-2658 | H3.3 (parcial) |
| `supabase/functions/ingest-notification/index.ts` | 1-1039 (completo) | H2.1, H3.2, H3.3, B6.1, B6.2 |
| `src/services/liveSalesService.ts` | 1-693 (completo) | H2.1, H3.3 |
| `docs/contexto/01-app-principal.md` | 1-163 | Contexto |
| `docs/contexto/02-sistema-pagos.md` | 1-309 | Contexto |

---

## 12. Pruebas ejecutadas y resultado

### Build

```bash
npm run build
```

**Resultado**: EXITOSO. 3625 modulos transformados, build en 8.61s. Sin errores de compilacion.

### Tests

```bash
npm run test:live-sales
```

**Resultado**: 7/7 pruebas pasadas (303ms).

| Prueba | Estado |
|---|---|
| usa la hora real del mensaje de WhatsApp aunque la IA lea mal la hora del comprobante | PASS |
| usa la hora del comprobante cuando WhatsApp llega tarde | PASS |
| no verifica si solo coincide monto pero el nombre es distinto | PASS |
| permite match por customer_id aunque el banco venga con nombre abreviado | PASS |
| rechaza pagos fuera de la ventana operativa | PASS |
| si no hay hora de mensaje, cae a la hora del comprobante | PASS |
| dos comprobantes con mismo nombre/monto no comparten el mismo pago MacroDroid | PASS |

**Nota**: Las pruebas existentes cubren el matching de pagos (ventana de ±5 minutos, nombres, montos) pero no cubren los escenarios de pedidos fuera de rango Live identificados en esta auditoria (H2.1, B6.1).
