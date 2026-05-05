# Panel de Pago — Cómo funciona todo

Este documento describe el sistema completo de pagos en la app Ventas Live, incluyendo los colores, los estados internos, y cómo cada pago llega a mostrarse de la manera en que aparece en pantalla.

---

## De dónde vienen los pagos

Hay dos fuentes de pagos que el sistema maneja al mismo tiempo:

**1. Pagos MacroDroid (automáticos)**
El teléfono Android recibe una notificación de la app bancaria (Yape, Yasta, etc.). MacroDroid captura esa notificación y la envía al servidor Express en Vercel, que la reenvía a la Edge Function de Supabase llamada `ingest-notification`. Esa función extrae el nombre del pagador y el monto, y crea un registro en la tabla `pagos` de la base de datos principal.

**2. Comprobantes WhatsApp (manuales / semiautomáticos)**
El cliente envía una foto del comprobante por WhatsApp. El sistema lee esa foto, extrae el nombre y monto del comprobante, y crea un registro en la tabla `pagos_venta_live` de la base de datos del panel WhatsApp (`vwaocoaeenavxkcshyuf`). Estos dos registros son independientes en bases de datos separadas y el sistema los intenta cruzar automáticamente.

---

## El cruce automático (matching)

Cuando llega un comprobante WhatsApp, el sistema busca en `pagos` un registro que tenga:
- El mismo monto (exacto)
- Un nombre parecido (no necesita ser idéntico, usa comparación inteligente)
- Una fecha/hora cercana (ventana de ±5 minutos)

Si encuentra ese registro en `pagos`, los vincula: el campo `main_pago_id` en `pagos_venta_live` apunta al `id` del pago en `pagos`. A partir de ese momento, ese comprobante queda "verificado automáticamente".

Si no encuentra ningún pago MacroDroid que coincida, el comprobante queda en espera (`pendiente_whatsapp`) hasta que llegue el pago o el operador lo verifique a mano.

Una regla importante: el sistema nunca usa el mismo pago MacroDroid para dos comprobantes distintos. Si pago #275 ya fue asignado al comprobante de María, el comprobante de Juan (que también pagó Bs 3 en el mismo minuto) va a buscar otro pago disponible, no va a robarle el de María.

---

## Los estados internos de un comprobante

Cada comprobante WhatsApp tiene un campo `estado` en la tabla `pagos_venta_live`. Estos son todos los estados posibles:

| Estado | Qué significa |
|--------|--------------|
| `pendiente_whatsapp` | El comprobante llegó pero no se encontró un pago MacroDroid que coincida todavía. Está en espera. |
| `verificado_macrodroid` | El sistema cruzó automáticamente el comprobante con un pago MacroDroid. No intervino nadie a mano. |
| `verificado_manual` | El operador verificó el pago desde el panel, o el sistema lo vinculó a un pago pero no fue por match automático puro. |
| `revision_manual` | El sistema detectó algo sospechoso (nombre no muy parecido, monto diferente, etc.) y marcó el comprobante para que el operador lo revise. |
| `posible_duplicado` | El sistema detectó que llegó más de un comprobante del mismo cliente con mismo monto en pocos minutos. El primero se procesa normal, los siguientes quedan como posible duplicado. |
| `rechazado` | El operador rechazó el comprobante desde el panel. |

---

## Los colores en el Panel WhatsApp (PanelPedidos)

El Panel WhatsApp es la vista donde se muestran los pedidos del live con sus comprobantes. Cada comprobante tiene un badge de color pequeño que indica su estado:

🟢 **Verde** → `verificado_macrodroid` o `verificado_manual`
Significa que el pago está confirmado, sea automáticamente o a mano. Todo en orden.

🟡 **Amarillo/Ámbar** → `pendiente_whatsapp` o `revision_manual`
Significa que hay algo que resolver. El comprobante llegó pero no está verificado todavía, o el sistema lo marcó para revisión.

🔵 **Azul** → `posible_duplicado`
Significa que el sistema detectó más de un comprobante muy parecido del mismo cliente y lo marcó como posible duplicado. Hay que revisarlo.

🔴 **Rojo** → `rechazado`
El comprobante fue rechazado por el operador.

---

## Los colores en la Lista de Pagos (página principal)

La página principal tiene una lista de todos los pagos del día. Cada fila tiene un color de fondo que viene de un campo llamado `verification_origin`. Este campo no se guarda en la base de datos — lo calcula el servidor Express cada vez que carga la lista de pagos, mirando el estado del comprobante vinculado.

Así se calcula `verification_origin`:

| Situación | verification_origin | Color |
|-----------|---------------------|-------|
| El comprobante está `verificado_macrodroid` | `automatic` | 🟢 Verde (#ecfdf5 / #10b981) |
| El comprobante está `verificado_manual`, o el método del pago dice "manual" | `manual` | 🟣 Violeta/Lila (#faf5ff / #a855f7) |
| El comprobante está `pendiente_whatsapp` o `revision_manual` | `whatsapp_pending` | 🟣 Violeta/Lila (#faf5ff / #a855f7) |
| El pago llegó por notificación bancaria pero sin comprobante WhatsApp vinculado | `macrodroid_only` | ⚪ Gris (#f8fafc / #94a3b8) |
| Cualquier otra situación | `other` | ⚪ Gris |

En palabras simples:
- **Verde** = el sistema lo cruzó solo, todo automático, nada que hacer
- **Lila/Violeta** = hay algo pendiente o fue verificado a mano por el operador
- **Gris** = llegó el pago bancario pero no hay comprobante WhatsApp todavía

---

## Los comprobantes que aparecen sin pago vinculado

Aparte de los pagos normales, la lista también muestra al principio (en la parte de arriba) los comprobantes WhatsApp que llegaron pero no tienen ningún pago MacroDroid vinculado (`main_pago_id` es null) y están en estado `pendiente_whatsapp` o `revision_manual`. Estos aparecen con un nombre genérico si no se detectó el nombre del pagador, y su color es lila.

Desde esa fila, el operador puede tocar un botón para verificarlos manualmente.

---

## Qué pasa cuando el operador verifica a mano

Si el operador toca "Verificar" en un comprobante que está en `pendiente_whatsapp` o `revision_manual`, el sistema cambia el estado a `verificado_manual` y registra que la verificación fue hecha por una persona, no automáticamente. El color del pago en la lista pasa de lila a seguir en lila, porque `verificado_manual` también es lila — ambos significan "intervención humana".

---

## Cómo llega un pago MacroDroid al sistema (el camino completo)

1. Cliente transfiere dinero → Yape/Yasta notifica al teléfono Android
2. MacroDroid captura la notificación
3. MacroDroid hace un POST a `https://ventas-live.vercel.app/api/ingest-notification`
4. El servidor Express en Vercel reenvía ese POST a la Edge Function de Supabase `ingest-notification`
5. La Edge Function extrae nombre y monto con regex o con IA (OpenRouter)
6. Se crea un registro en la tabla `pagos` de la base de datos principal
7. Si en ese momento ya existe un comprobante WhatsApp del mismo cliente y monto esperando, el sistema los cruza automáticamente → `verificado_macrodroid`

El paso por Vercel (paso 3→4) existe porque Supabase Edge Functions se "apagan" cuando no tienen tráfico (cold start), y eso causaba timeouts en MacroDroid. Vercel siempre está activo y responde rápido; él se encarga de despertar a Supabase aunque tarde unos segundos.

Además, un cron job de PostgreSQL hace un ping a la Edge Function cada 2 minutos para mantenerla caliente y evitar cold starts durante un live activo.

---

## Las dos bases de datos

El sistema usa dos proyectos de Supabase separados:

- **Base de datos principal** (`vhczofpmxzbqzboysoca`) — tiene `pagos`, `clientes`, `pedidos`, etc. Es la base de la app general.
- **Base de datos del panel WhatsApp** (`vwaocoaeenavxkcshyuf`) — tiene `pagos_venta_live`, `pedidos_venta_live`, `clientes_whatsapp`, mensajes, etc. Es la base del sistema de lives y comprobantes.

El servidor Express tiene acceso a las dos y hace el cruce entre ellas al momento de cargar la lista de pagos.

---

## Resumen visual

```
Cliente paga → Yape notifica → MacroDroid → Vercel → Supabase Edge → tabla pagos
                                                                           ↓
Cliente envía foto → WhatsApp → panel lee foto → tabla pagos_venta_live
                                                           ↓
                                              Sistema cruza ambos registros
                                                           ↓
                              ┌─────────────┬─────────────────┬──────────────┐
                              │   VERDE     │  LILA/VIOLETA   │    GRIS      │
                              │  automático │ manual/pendiente │ solo MacroDroid│
                              └─────────────┴─────────────────┴──────────────┘
```
