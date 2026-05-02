# Plan: Unión Tienda Online → ChehiAppAbril

> **Objetivo:** Que todo lo que se compra en la Tienda Online aparezca como pago y pedido en el panel principal de ChehiAppAbril (página de pagos), usando el flujo existente de notificación, pago, perfil, pedido y casillero.

---

## Arquitectura actual (3 bases independientes)

```
┌─────────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   TIENDA ONLINE     │    │  PANEL WHATSAPP   │    │   CHEHIAPPABRIL     │
│  (supabaseStore)    │    │  (supabasePanel)  │    │  (supabaseServer)   │
├─────────────────────┤    ├──────────────────┤    ├─────────────────────┤
│ products            │    │ panel_clientes    │    │ customers           │
│ store_orders        │    │ panel_mensajes    │    │ pagos               │
│ store_customers     │    │ tarjetas_venta    │    │ pedidos             │
│ payment_events      │    │ pedidos_venta     │    │ orders (casilleros) │
└────────┬────────────┘    └────────┬─────────┘    │ identity_profiles   │
         │                          │               └──────────┬──────────┘
         │          ┌───────────────┴───────────────────────────┘
         │          │
         ▼          ▼
   ┌─────────────────────────────────┐
   │      MOTOR DE CUADRANGULACIÓN    │
   │  (server.ts líneas 1210-1661)    │
   │  + ingest-notification (Edge)    │
   └─────────────────────────────────┘
```

---

## Lo que YA funciona

### Flujo actual de la tienda:

1. **Checkout** (`Checkout.tsx`): cliente ingresa WhatsApp + PIN → se crea `store_order` en supabaseStore → pantalla de pago con link de WhatsApp para enviar comprobante.

2. **Polling** (cada 3s): el checkout consulta `GET /api/store-orders/:id/status` esperando que el pedido pase de `pending` → `paid`/`confirmed`.

3. **Notificación bancaria (MacroDroid)**:
   - `ingest-notification` (Edge Function) recibe la notificación → crea pago en `pagos` de ChehiAppAbril → también busca pedidos pendientes en Tienda Online y los confirma (llama a `confirmStoreOrder`).
   - `POST /api/store/ingest-bank` (server.ts) — endpoint alternativo directo.

4. **Motor de cuadrangulación** (`tryMatchOrder`): cruza monto, número WhatsApp y código de pedido para encontrar el `store_order` correcto.

5. **`confirmStoreOrder`**: cuando se confirma un pago de tienda:
   - Marca `store_order.status = 'paid'`
   - Encola WhatsApp de confirmación
   - Crea/vincula cliente en ChehiAppAbril (`customers`)
   - Crea pedido en ChehiAppAbril (`pedidos`, status `procesar`)
   - Etiqueta el pedido como `WEB-{orderId}`

### Lo que NO se hace aún (gap):

| Gap | Detalle |
|-----|---------|
| **No crea pago en página de pagos** | `confirmStoreOrder` inserta en `pedidos` pero NO en `pagos`. El pago en la Edge Function sí lo crea, pero es un flujo separado que no siempre se comunica con el motor de cuadrangulación del server. |
| **Cliente sin nombre real** | Si el banco no devuelve nombre, queda como "Cliente Tienda Web" |
| **No hay `daily_order`** | El pedido de tienda no se asocia a un "Pedido del día" como los pagos normales |
| **Doble vía de ingesta** | La Edge Function y `server.ts` tienen lógica parcialmente duplicada para matching de tienda |
| **Sin fallback claro** | Si MacroDroid falla, el flujo de verificación manual del Panel WhatsApp no está unido al pedido de tienda |

---

## Plan paso a paso

### Fase 1 — Diagnóstico y verificación (1 sesión)

**1.1 Verificar estado actual end-to-end**
- Crear un pedido de prueba en la tienda
- Simular llegada de pago por MacroDroid
- Verificar si el pago aparece en ChehiAppAbril (página de pagos)
- Verificar si el pedido aparece en ChehiAppAbril (mesa de preparación)

**1.2 Mapear exactamente qué falta**
- ¿El pago en `pagos` de ChehiAppAbril tiene `customer_id` correcto?
- ¿El `pedido` creado por `confirmStoreOrder` es visible en la interfaz?
- ¿Falta el "Pedido del día" (daily order) que agrupa pagos?

### Fase 2 — Unificar creación de pagos en ChehiAppAbril (2 sesiones)

**2.1 Modificar `confirmStoreOrder` para crear pago**
- Agregar inserción en `pagos` con:
  - `nombre`: nombre del cliente (del banco o "Cliente Tienda")
  - `pago`: monto del pedido
  - `method`: "Tienda Online"
  - `status`: "pending" o "completed"
  - `customer_id`: el globalCustomerId
  - `date`: fecha del pago

**2.2 Vincular pago de tienda con Pedido del día**
- Usar `ensureDailyPedidoFromPayment` (ya existe en ingest-notification/index.ts) también en `confirmStoreOrder`
- Asegurar que el pago de tienda se suma al daily order del día

### Fase 3 — Unificar identidad del cliente (1 sesión)

**3.1 Sistema Pulpo: vincular store_customer con customer de Chehi**
- Cuando se crea un store_order, buscar/crear el customer en ChehiAppAbril
- Usar WhatsApp como llave de unión
- Si el customer ya existe en Chehi (vía pagos anteriores), heredar su nombre

**3.2 Evitar nombres placeholder**
- No usar "Cliente Tienda Web" si hay un nombre real disponible
- Priorizar: nombre del banco > nombre del perfil Chehi > nombre del store_customer > placeholder

### Fase 4 — Flujo de verificación manual unificado (1 sesión)

**4.1 Conectar tarjetas de venta live con pedidos de tienda**
- Cuando se presiona "Verificar manual" en Panel WhatsApp para un comprobante de tienda, debe:
  - Marcar el store_order como paid
  - Crear el pago en ChehiAppAbril
  - Crear el pedido en ChehiAppAbril

**4.2 Protección anti-duplicados (ya implementada)**
- La Edge Function ya tiene `findExistingManualWhatsappPayment`
- Verificar que también funcione para pagos de tienda

### Fase 5 — Pruebas y despliegue (1 sesión)

**5.1 Prueba end-to-end**
- Comprar en la tienda → enviar comprobante → verificar en ChehiAppAbril
- Probar con y sin MacroDroid
- Probar verificación manual
- Verificar que el pedido avanza: procesar → listo → entregado → casillero

**5.2 Desplegar Edge Functions**
- `ingest-notification`
- `ingest-whatsapp`

---

## Archivos clave a modificar

| Archivo | Qué cambiar |
|---------|-------------|
| `server.ts` (líneas 1292-1395) | `confirmStoreOrder`: agregar inserción en `pagos` + daily order |
| `server.ts` (líneas 1210-1286) | `tryMatchOrder`: posible extensión de ventana de búsqueda |
| `supabase/functions/ingest-notification/index.ts` | Ya tiene store matching y protección anti-duplicados (hecho) |
| `supabase/functions/ingest-whatsapp/index.ts` | Posible extensión para matching de tienda desde WA |
| `src/routes/live-sales.ts` | Conectar `verify-manual` con confirmación de store_order |

---

## Estados y transiciones deseadas

```
TIENDA                          CHEHIAPPABRIL
──────                          ──────────────
store_order.pending             —
store_order.paid ──────────────► pagos (nuevo pago)
                                pedidos (status: procesar)
                                └─► listo → entregado → casillero
```

---

## Sesión actual: dónde quedamos

- **Última acción:** Se agregó y desplegó protección anti-duplicados en `ingest-notification` (Prueba 3 de Ventas Live).
- **Siguiente paso:** Ejecutar **Fase 1 — Diagnóstico**. Verificar estado real de un pedido de tienda en producción.
- **Referencia:** Este documento se guardó en `docs/planes/union-tienda-chehi.md`.
