# Auditoría: Error de Pago Tienda — Pedido #269
**Fecha del incidente:** 2026-05-16  
**Hora local (UTC-4):** 17:16 a 17:19  
**Hora servidor (UTC):** 21:16 a 21:19  
**Auditado por:** Claude Sonnet 4.6 + Codex + DeepSeek  

---

## Resumen ejecutivo

El cliente hizo un pedido en la tienda online, pagó dentro del tiempo límite, envió el comprobante por WhatsApp, y el pedido **fue cancelado igual**. El pago no apareció en ninguna parte del sistema.

**Causa raíz:** El pago bancario entró por el portero del sistema Live (`/api/ingest-notification`), el cual descartó el pago porque el Live estaba apagado. El portero no sabe distinguir pagos de tienda de pagos del Live. Descarta todo cuando Live = OFF.

---

## Datos exactos del pedido

| Campo | Valor |
|-------|-------|
| ID pedido | #269 |
| Producto | Falda Lila Demo, talla S |
| Monto | Bs 4.00 |
| Método de pago | QR |
| Cliente WhatsApp | 59177050026 |
| Creado | 2026-05-16 21:16:53 UTC (17:16:53 local) |
| Vencía | 2026-05-16 21:18:53 UTC (17:18:53 local) |
| Cancelado | 2026-05-16 21:19:15 UTC (17:19:15 local) |
| Estado final | `cancelled` |
| `payment_verified_at` | NULL (nunca confirmado) |
| `wa_proof_received` | TRUE (comprobante sí llegó) |

---

## Cronología exacta del incidente

### 17:16:53 local — Cliente crea el pedido
- El pedido #269 se registra en `TiendaOnline.store_orders`
- Se activa un temporizador de **2 minutos exactos**
- El pedido vence a las **17:18:53 local**

---

### 17:18:31 local — El pago bancario sale por MacroDroid
- El cliente paga Bs 4.00 via QR Nequi/banco
- MacroDroid detecta la notificación de pago en el celular
- MacroDroid envía el pago al servidor en: `/api/ingest-notification`
- **El pago llega 22 segundos ANTES de que venza el pedido**

---

### 17:18:31 local — El portero de Live descarta el pago

El código en `server.ts` (línea 3819–3834):

```typescript
const allowed = (sessions ?? []).some((s: any) => {
  if (s.status === 'live') return true;  // Live activo
  // Live cerrado: solo acepta si el pago fue DURANTE el Live
  ...
  return paymentTime >= startAt && paymentTime <= end;
});

if (!allowed) {
  console.log('[ingest-notification] Pago fuera de ventana Live, descartado', ...);
  return res.json({ ok: true, ignored: true, reason: 'live_off' });
}
```

**Resultado:** `allowed = false` → pago descartado silenciosamente.

El portero no tiene ninguna excepción para pagos de tienda. Trata todos los pagos igual: si Live está apagado, los descarta. No importa que el pago sea para un pedido de tienda activo.

---

### 17:18:53 local — El pedido vence

El servidor corre un job cada 30 segundos que cancela pedidos expirados:

```typescript
setInterval(async () => {
  // cancela pedidos con status='pending' y expires_at < ahora
}, 30 * 1000);
```

El pedido pasa de `pending` a `cancelled`.

---

### 17:18:54 local — Llega el mensaje de texto de WhatsApp (1 segundo tarde)

```
wa_messages id=120
from_wa: 59177050026
summary: "Hola! Ya pague mi pedido de tienda #269 por 4.00 Bs. Mi numero es 77050026. Adjunto comprobante."
has_proof: false
received_at: 2026-05-16 21:18:54 UTC
```

- El mensaje llega **1 segundo después** de que el pedido venció
- El sistema lo reconoce y lo vincula al pedido #269
- Pero no tiene foto → dice `proof_required=true` y espera la foto

---

### 17:19:15 local — Llega la foto del comprobante

```
wa_messages id=121
from_wa: 59177050026
has_proof: true
order_ref: "269"
matched_order_id: 269
received_at: 2026-05-16 21:19:15 UTC

receipt (leído por IA):
  cliente: "Ivan Ariel Diaz Sanchez"
  monto: 4
  hora: "17:18"
```

- La foto sí llega al sistema
- La IA la analiza correctamente (nombre, monto, hora)
- El sistema vincula la foto al pedido #269 → `wa_proof_received = true`
- Se crea un `payment_event` (id=67, source=`wa_proof`, processed=`false`)

---

### 17:19:15 local — El sistema busca la confirmación bancaria y no encuentra nada

El código busca dos cosas en `TiendaOnline.payment_events`:
1. Un evento bancario (`processed = true`) vinculado al pedido #269 → **no existe**
2. Un pago de Bs 4 en `ChehiAppAbril.pagos` → **no existe** (el pago fue descartado por el portero)

Resultado (línea 3326 de server.ts):
```
[store-wa] Pedido #269 — WA recibido, esperando banco
```

El pedido queda sin confirmar. Ya está cancelado. No hay mecanismo de rescate.

---

## Estado final en las bases de datos

### TiendaOnline.store_orders
| Campo | Valor |
|-------|-------|
| status | `cancelled` |
| payment_verified_at | NULL |
| wa_proof_received | TRUE |

### TiendaOnline.payment_events
| id | source | amount | processed | matched_order_id |
|----|--------|--------|-----------|-----------------|
| 67 | wa_proof | 4.00 | FALSE | 269 |

El pago bancario real NUNCA llegó aquí. Solo llegó la evidencia del comprobante de WhatsApp.

### TiendaOnline.pagos_tienda
**Vacía.** No hay ningún registro. El pedido nunca fue confirmado.

### ChehiAppAbril.pagos
El pago bancario de Bs 4 tampoco está aquí. El portero lo descartó antes de que llegara a cualquier base de datos.

---

## Diagrama del flujo que ocurrió (incorrecto)

```
Pedido #269 creado (17:16:53)
        ↓
Cliente paga Bs 4 via QR (17:18:31)
        ↓
MacroDroid detecta el pago
        ↓
MacroDroid envía a /api/ingest-notification
        ↓
PORTERO: ¿Hay Live activo? → NO
        ↓
DESCARTADO — reason: live_off
        ↓
[El pago no llega a ninguna base de datos]
        ↓
Pedido vence (17:18:53)
        ↓
Mensaje WhatsApp llega (17:18:54) — 1 seg tarde
        ↓
Foto comprobante llega (17:19:15)
        ↓
Sistema reconoce foto, busca banco → no encuentra nada
        ↓
"Esperando banco..." → nunca llega
        ↓
Pedido queda cancelado para siempre
        ↓
Pagos Web: vacío
```

---

## Diagrama del flujo correcto (cómo debería funcionar)

```
Pedido #269 creado
        ↓
Cliente paga via QR
        ↓
MacroDroid detecta pago
        ↓
MacroDroid envía a /api/ingest-bank-store  ← endpoint correcto para tienda
        ↓
Sin portero Live (tienda funciona siempre)
        ↓
Se guarda en TiendaOnline.payment_events (processed=true)
        ↓
Foto comprobante llega por WhatsApp
        ↓
Sistema cruza: banco + comprobante + pedido → CONFIRMADO
        ↓
Se guarda en TiendaOnline.pagos_tienda
        ↓
Aparece en "Pagos Web"
        ↓
NO aparece en sistema Live ni en pagos normales
```

---

## Causa raíz técnica

**El problema está en MacroDroid, no en la tienda.**

MacroDroid tiene configurado un solo destino para todos los pagos bancarios: `/api/ingest-notification`. Este endpoint tiene el portero del Live. Cuando Live está apagado, descarta todo.

El backend ya tiene el endpoint correcto para pagos de tienda: `/api/ingest-bank-store`. Este endpoint no tiene portero del Live — acepta pagos siempre. Pero MacroDroid no está configurado para usarlo.

| Endpoint | Portero Live | Para qué sirve |
|----------|-------------|----------------|
| `/api/ingest-notification` | SÍ — descarta si Live OFF | Pagos del sistema Live |
| `/api/ingest-bank-store` | NO — siempre acepta | Pagos de la tienda online |

---

## Lo que habría faltado para que funcionara

**Opción A (configuración MacroDroid):**  
MacroDroid envía los pagos QR de la tienda a `/api/ingest-bank-store` en lugar de `/api/ingest-bank-store`.  
→ Requiere configurar MacroDroid con una regla adicional para pagos de tienda.

**Opción B (código backend):**  
Dentro del portero de `/api/ingest-notification`, antes de descartar, verificar si hay un pedido de tienda activo con ese monto. Si existe, redirigir a la tienda en lugar de descartar.  
→ No requiere cambiar MacroDroid.

**Opción C (confirmación solo con comprobante WhatsApp):**  
Cuando llega el comprobante por WhatsApp con foto válida y monto correcto, confirmar el pedido directamente sin esperar el banco.  
→ La más simple. El riesgo es mínimo en una tienda pequeña.

---

## Datos de auditoría completos

### Fuente 1: TiendaOnline (thgbfurscfjcmgokyyif)
Consultada en tiempo real el 2026-05-16 vía Supabase Management API.

**store_orders:**
```json
{
  "id": 269,
  "customer_wa": "77050026",
  "status": "cancelled",
  "total": "4.00",
  "payment_method": "qr",
  "payment_verified_at": null,
  "wa_proof_received": true,
  "expires_at": "2026-05-16 21:18:53.652+00",
  "created_at": "2026-05-16 21:16:53.70169+00",
  "updated_at": "2026-05-16 21:19:15.490739+00"
}
```

**wa_messages (pedido #269):**
```json
[
  {
    "id": 120,
    "from_wa": "59177050026",
    "has_proof": false,
    "order_ref": "269",
    "matched_order_id": 269,
    "received_at": "2026-05-16 21:18:54.490703+00"
  },
  {
    "id": 121,
    "from_wa": "59177050026",
    "has_proof": true,
    "order_ref": "269",
    "matched_order_id": 269,
    "received_at": "2026-05-16 21:19:15.364885+00"
  }
]
```

**payment_events (pedido #269):**
```json
{
  "id": 67,
  "source": "wa_proof",
  "amount": "4.00",
  "sender_name": "Ivan Ariel Diaz Sanchez",
  "sender_wa": "59177050026",
  "processed": false,
  "match_confidence": "maxima",
  "matched_order_id": 269,
  "received_at": "2026-05-16 21:19:15.016084+00"
}
```

**pagos_tienda:**
```
[] — vacía
```

### Fuente 2: Código del servidor (server.ts)
- Línea 3800: inicio del endpoint `/api/ingest-notification`
- Línea 3819: lógica del portero Live
- Línea 3832–3834: descarte cuando Live está apagado
- Línea 3861: endpoint `/api/ingest-bank-store` (para tienda, sin portero)
- Línea 3324–3327: mensaje "WA recibido, esperando banco" cuando no hay notificación bancaria

### Fuente 3: Auditoría de Codex y DeepSeek
Confirmaron que el pago bancario de MacroDroid llegó a las 17:18:31 (antes del vencimiento), entró por `/api/ingest-notification`, y fue descartado con `reason: live_off` porque Live estaba apagado.

---

## Conclusión

El pago de Bs 4 existió. MacroDroid lo detectó y lo envió. Llegó al servidor a las 17:18:31, antes de que venciera el pedido. Pero el portero del Live lo descartó porque Live estaba apagado. El pago nunca llegó a la base de datos de la tienda. El comprobante de WhatsApp sí llegó, pero sin el banco no se pudo confirmar.

**El pedido fue cancelado por una falla de arquitectura, no por falta de pago del cliente.**
