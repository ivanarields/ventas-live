# Sistema de Pagos y Etiquetas

Última revisión: 2026-05-10. Verificado contra el código real.

---

## Tipos de pago

Hay tres canales de pago completamente distintos. Cada uno tiene su propio flujo.

| Canal | Origen | Destino en Supabase | Función clave |
|---|---|---|---|
| **Efectivo manual** | Operador toca "Registrar" en la app | `pagos` (ChehiAppAbril) | `POST /api/pagos` |
| **Live (WhatsApp + MacroDroid)** | Cliente manda foto por WA; MacroDroid captura notificación bancaria | `pagos_venta_live` + `pagos` (ChehiAppAbril) | `upsertWhatsappLivePayment()` + `matchLivePaymentWithMacrodroid()` |
| **Tienda Online** | Cliente paga desde `/tienda`; MacroDroid captura transferencia | `store_orders` (TiendaOnline) + `pagos` (ChehiAppAbril) | Edge Function `ingest-bank-store` → `confirmStoreOrder()` |

---

## Canal 1 — Efectivo manual

El operador toca el botón "Registrar" en la pestaña **Pagos**. Abre un formulario que crea un registro en `pagos` con `method = 'Efectivo'` y crea automáticamente un pedido en estado `procesar`. No hay automatización.

---

## Canal 2 — Live (WhatsApp + MacroDroid)

### Flujo completo

```
1. Cliente manda foto de comprobante por WhatsApp
       ↓
2. WhatsApp Bridge (DigitalOcean 134.122.123.253:3001)
   espeja el mensaje a: panel_mensajes (DB PanelPedido)
       ↓
3. Operador toca botón "Live" en la app (o revisa chat manualmente)
   → POST /api/ai/summarize-conversation
   → IA (Gemini 2.5 Flash Lite) extrae: nombre, monto, hora, foto
       ↓
4. upsertWhatsappLivePayment() — crea registro en pagos_venta_live
   - Si tiene nombre Y monto → estado inicial: 'pendiente_whatsapp'
   - Si le falta nombre O monto → estado inicial: 'revision_manual'
       ↓
5. matchLivePaymentWithMacrodroid()
   - Busca en tabla `pagos` por nombre ≈ nombre_canonico, monto exacto, ±5 min
   - Si hay match → estado: 'verificado_macrodroid' (VERDE)
   - Si no hay match → estado: 'revision_manual' (ÁMBAR)
       ↓
6. (Mientras tanto, o antes/después)
   MacroDroid captura notificación Yape/banco en el celular
   → POST /api/ingest-notification (proxy en server.ts)
   → Edge Function ingest-notification (ChehiAppAbril)
   → Parsea nombre + monto en cascada (ver sección Parseo)
   → Inserta en `pagos` (ChehiAppAbril)
```

### Colores en la pestaña Pagos

La pestaña **Pagos** muestra un ícono de check con color según el origen del pago (`App.tsx:2566–2570`):

| Color del ícono | Cuándo aparece |
|---|---|
| **Verde** | MacroDroid verificó el pago automáticamente |
| **Morado/Violeta** | Verificado manualmente por la operadora, O hay un comprobante WA pendiente de confirmar |
| **Gris** | Efectivo u otro tipo sin clasificar |

Cuando hay un comprobante WA pendiente, aparece además un botón **"Verificar"** en violeta al lado del monto. Al tocarlo, confirma el pago sin ir a ninguna otra pantalla.

### Estados internos del pago Live (base de datos)

Internamente hay 6 estados en la tabla `pagos_venta_live`. Estos estados determinan el color del ícono en la pestaña **Pagos** y también se muestran en **Comprobantes Live** (sub-pestaña dentro de Etiquetas):

| Estado interno | Color en Comprobantes Live | Color en pestaña Pagos | Cuándo ocurre |
|---|---|---|---|
| `pendiente_whatsapp` | **Ámbar** | **Morado** | Comprobante WA llegó con nombre+monto pero MacroDroid no coincidió todavía |
| `revision_manual` | **Ámbar** | **Morado** | Comprobante sin nombre/monto, o match MacroDroid falló |
| `verificado_macrodroid` | **Verde** | **Verde** | Match automático con notificación MacroDroid exitoso |
| `verificado_manual` | **Verde** | **Verde** | Operadora confirmó manualmente |
| `posible_duplicado` | **Azul** | (oculto) | Mismo nombre+monto+hora que otro pago ya registrado (±5 min) |
| `rechazado` | **Rojo** | (oculto) | Descartado manualmente |

> **Importante:** `pendiente_whatsapp` y `revision_manual` son dos estados distintos aunque ambos se vean igual. El primero: llegaron los datos pero el banco no coincidió. El segundo: faltan datos desde el inicio, o el cruce falló después.

### Verificación manual (`verify-manual`)

Cuando el operador confirma un pago morado/ámbar manualmente (`src/routes/live-sales.ts:342–479`):

1. Crea pago en ChehiAppAbril con `method = 'Verificacion manual WhatsApp'`
2. Busca si el cliente también tiene pedidos en TiendaOnline por mismo teléfono+monto del día
3. Si encuentra pedido de tienda pendiente → lo marca como pagado y pone stock en 0
4. Actualiza estado en `pagos_venta_live` a `verificado_manual`

---

## Canal 3 — Tienda Online

La tienda en `/tienda` tiene su propio flujo de pago automático separado del canal Live.

### Flujo completo

```
1. Cliente selecciona producto y toca "Pagar"
   → Se crea store_order en TiendaOnline con estado 'pendiente'
   → Reserva de stock por 60 segundos
   → Pantalla de pago muestra QR Yape y número de WhatsApp
       ↓
2. Cliente paga por Yape/transferencia
       ↓
3A. MacroDroid captura notificación bancaria en el celular
    → POST https://leidydiaz.live/api/ingest-bank-store (proxy en server.ts)
    → Reenvía a Edge Function: ingest-bank-store (TiendaOnline)
    → Ventana de búsqueda: 35 minutos (fija, siempre)
    → Llama a tryMatchOrder({ windowMinutes: 35 })
    → Si hay match → confirmStoreOrder()

3B. Cliente manda comprobante por WhatsApp al número de la tienda
    → WhatsApp Bridge recibe el mensaje
    → POST /api/store/ingest-wa (server.ts)
    → Ventana de búsqueda: 10 minutos
    → Llama a tryMatchOrder({ windowMinutes: 10 })
    → Si banco ya procesó → confirmStoreOrder()
    → Si banco no llegó todavía → marca `wa_proof_received = true` en store_order
       (el pedido queda en estado 'pending' esperando verificación manual)
```

### Flujo de verificación manual de tienda

Cuando el banco no llega (MacroDroid sin internet, etc.) pero la clienta envió el comprobante por WA, el operador puede verificar manualmente desde la **pestaña Pagos**:

1. `/api/store/pending-manual` devuelve store_orders con `status='pending'` y `wa_proof_received=true` del día actual
2. Aparecen como tarjetas **moradas** con badge **WEB** en la parte superior de la pestaña Pagos
3. El operador toca **"Verificar"** → `POST /api/store/verify-manual/:id` → llama a `confirmStoreOrder()`
4. `confirmStoreOrder()` ejecuta los mismos 7 pasos que el flujo automático (pedido, pago, WhatsApp)
5. El pago queda en **verde** con badge WEB y se envía el mensaje de confirmación automáticamente

### `tryMatchOrder()` — Niveles de confianza

La función busca la store_order que corresponde al pago recibido (`server.ts:2168–2224`). Hay tres niveles:

| Nivel | Condición | Resultado |
|---|---|---|
| **MÁXIMA** | El texto del comprobante contiene el código del pedido (ej: `#WEB-123`) | Match definitivo |
| **ALTA** | Solo un candidato con ese monto en la ventana de tiempo, o un candidato único después de filtrar por teléfono | Match confirmado |
| **MEDIA** | Múltiples candidatos con ese monto, sin desempate posible | Retorna `null` — no hace nada |

El `windowMinutes` por defecto (si nadie lo especifica) es **2 minutos**. Los tres puntos de entrada usan:
- Edge Function `ingest-bank-store`: **35 minutos** (siempre, no condicional)
- `/api/store/ingest-bank` (server): **2 minutos**
- `/api/store/ingest-wa` (server): **10 minutos**

### `confirmStoreOrder()` — 7 pasos (`server.ts:2230–2394`)

Cuando el match es exitoso, esta función ejecuta los 7 pasos en orden:

1. Marca la store_order como pagada en TiendaOnline
2. Pone el stock del producto en 0 (oculta de la tienda)
3. Obtiene el nombre del pagador desde `payment_events`
4. Busca o crea al cliente en ChehiAppAbril por teléfono
5. Inserta pedido en ChehiAppAbril con `label = 'WEB-{id}'`, `source = 'WEB'`
6. Inserta pago en ChehiAppAbril con `method = 'Tienda Online'` (con chequeo de duplicados)
7. Encola mensaje de confirmación por WhatsApp (`enqueueStoreConfirmation()`)

`enqueueStoreConfirmation()` es **idempotente por `order_id`** — si se llama dos veces para el mismo pedido, solo encola una vez.

Los pedidos web tienen `source = 'WEB'` y **NO** disparan el segundo mensaje "PEDIDO LISTO" que reciben los pedidos del Live.

---

## Parseo de notificaciones bancarias (en cascada)

Aplica al canal Live (Edge Function `ingest-notification`, ChehiAppAbril):

1. **Regex hardcodeados** — Yape directo (`NOMBRE, te envió...`), Yape QR (`QR DE NOMBRE te envió...`), bancos bolivianos clásicos
2. **Patrones aprendidos** (`learned_text_patterns`) — aprende automáticamente el contexto antes/después del nombre según `app_package`
3. **OpenRouter** (Gemini 2.5 Flash Lite, `thinkingBudget: 0`) — casos nuevos no cubiertos por regex
4. Sin nombre válido → va a `manual_review_queue` — **NUNCA** se inventa un placeholder tipo "PAGO Yape"

**Idempotencia:** cada notificación tiene un hash SHA-256 (`raw_hash`). Si llega duplicada, se ignora.

---

## Cola de mensajes WhatsApp

Hay dos modos de envío:

| Modo | Endpoint | Filtro | Delay |
|---|---|---|---|
| **Automático** (procesador cada 60 seg) | interno, sin endpoint HTTP | `storeOnly: true` — solo mensajes de tienda | Sin delay artificial |
| **Manual "Envío Seguro"** | `POST /api/whatsapp/send-next` | Sin filtro — envía cualquier tipo | Delay aleatorio 2–4 min para no parecer bot |

El procesador automático corre en el servidor cada 60 segundos con filtro `storeOnly`. Esto significa que los mensajes del Live solo salen cuando el operador los envía manualmente.

---

## Sistema de etiquetas

### Capacidades reales (verificadas en producción)

| Tipo | Códigos | Máx pedidos por etiqueta | Máx bolsas por etiqueta |
|---|---|---|---|
| `NUMERIC_SHARED` | 1 al 100 (100 etiquetas) | 5 pedidos simples | — |
| `ALPHA_COMPLEX` | A a Z (26 etiquetas) | — | 20 bolsas |

> Estos números vienen de las migraciones 041 y 042. La migración 001 tenía solo 1–4 y A–D con 12 bolsas; los valores actuales fueron expandidos después.

### Reglas de asignación

- Pedido en estado `procesar` → **sin etiqueta todavía**
- Pedido marcado `LISTO` con **1 bolsa** → etiqueta numérica (la de menor número disponible)
- Pedido marcado `LISTO` con **2+ bolsas** → etiqueta alfabética
- Si la clienta ya tiene etiqueta letra activa → nuevo pedido **hereda la misma letra**
- Si se agrega una bolsa y la suma total supera 1 bolsa → **migra automáticamente** de numérica a alfabética en una transacción atómica
- Al marcar `entregado` → etiqueta liberada (`RELEASED`)

El operador **nunca elige** la etiqueta — el backend la asigna solo.

### Funciones PL/pgSQL

```sql
fn_assign_container(order_id, user_id)      — asigna con FOR UPDATE SKIP LOCKED (evita race conditions)
fn_migrate_to_complex(order_id)             — migra de numérico a alfabético
fn_release_container(order_id, reason)      — libera al entregar
fn_recalc_container_state(container_id)     — recalcula estado de la etiqueta
```

### Migraciones relevantes

| Migración | Qué hace |
|---|---|
| `001_labeling_system.sql` | Seed inicial: etiquetas 1–4 y A–D, max_simple_orders=4, max_bags=12 |
| `041_group_orders_by_client_alpha.sql` | Agrega etiquetas 5–100 (numéricas) y E–Z (alfabéticas); agrupa por cliente |
| `042_v2_total_bags_per_customer.sql` | Sube max_bags_capacity a 20 para todas las etiquetas alfabéticas |
| `043_fix_downgrade_last_order.sql` | Permite degradar de letra a número cuando es el único pedido activo del cliente |

---

## Tablas por base de datos

### ChehiAppAbril (`vhczofpmxzbqzboysoca`)

| Tabla | Propósito |
|---|---|
| `pagos` | Todo pago recibido (efectivo, MacroDroid, tienda, manual WA) |
| `pedidos` | Pedidos de ropa en proceso o listos |
| `customers` | Clientes con teléfono, etiqueta activa, firebase_id |
| `storage_containers` | Etiquetas físicas (tabla interna del sistema) |
| `container_allocations` | Asignaciones activas e históricas |
| `orders` | Sistema de etiquetas (vinculado a pedidos) |
| `order_bags` | Bolsas individuales por pedido |
| `raw_notification_events` | Notificaciones crudas de MacroDroid |
| `parsed_payment_candidates` | Notificaciones ya parseadas antes de cruzar |
| `learned_text_patterns` | Patrones aprendidos por app_package |
| `manual_review_queue` | Notificaciones sin nombre válido para revisión |

### PanelPedido (`vwaocoaeenavxkcshyuf`)

| Tabla | Propósito |
|---|---|
| `panel_clientes` | Un registro por número de teléfono WA |
| `panel_mensajes` | Mensajes y fotos recibidos (has_media, media_url) |
| `pedidos_venta_live` | Pedidos del Live (cliente, monto total, estado) |
| `pagos_venta_live` | Comprobantes procesados con estado, foto, match_reason |

Campos clave de `pagos_venta_live`: `estado`, `main_pago_id`, `panel_mensaje_id`, `duplicate_of`, `nombre_canonico`, `monto`, `comprobante_media_url`, `match_reason`.

### TiendaOnline (`thgbfurscfjcmgokyyif`)

| Tabla | Propósito |
|---|---|
| `products` | Productos con foto, precio, stock |
| `store_orders` | Pedidos de clientes (estado: pendiente/pagado/cancelado) |
| `store_customers` | Clientes de la tienda (teléfono + PIN) |
| `payment_events` | Notificaciones bancarias recibidas para la tienda |
| `store_favorites` | Favoritos guardados por cliente |
| `whatsapp_queue` | Cola de mensajes WA pendientes de envío |

---

## Variables de entorno del sistema de pagos

| Variable | Dónde se usa |
|---|---|
| `INGEST_DEVICE_SECRET` | Header que valida que MacroDroid es legítimo |
| `WEBHOOK_SECRET` | Valida peticiones del bridge WA (`ventas-live-bridge-2026`) |
| `WHATSAPP_BRIDGE_URL` | URL del bridge en DigitalOcean (`http://134.122.123.253:3001`) |
| `STORE_OWNER_USER_ID` | Si falta, los pedidos de tienda quedan invisibles (`13dcb065-6099-4776-982c-18e98ff2b27a`) |
| `VITE_STORE_WA_NUMBER` | Número WA de la tienda para confirmaciones (default `59160003230`) |

---

## Puntos de atención

1. **`STORE_OWNER_USER_ID` es crítica**: si falta en Vercel, los pedidos de tienda se crean en ChehiAppAbril pero el operador no los ve.
2. **La ventana de 35 min del Edge Function es fija**: no cambia según si hay código de pedido o no — aplica siempre.
3. **Los pedidos web (`source='WEB'`) no disparan el mensaje "PEDIDO LISTO"** que sí reciben los clientes del Live.
4. **Las fotos de comprobante WhatsApp viven solo en PanelPedido** — nunca se copian a TiendaOnline ni a ChehiAppAbril.
5. **`revision_manual` ≠ `pendiente_whatsapp`**: aunque ambos son ámbar, tienen causas distintas y se tratan diferente.
