# Rediseño definitivo del Sistema Pulpo
**Fecha:** 2026-04-27  
**Estado:** Documento de diseño — pendiente aprobación antes de implementar

---

## El único trabajo del Sistema Pulpo

> Cuando llega un comprobante de WhatsApp con un nombre, encontrar al cliente con ese nombre en `customers` y escribir su número de WhatsApp en `customers.wa_number`.

Nada más. Todo lo demás es secundario.

---

## Cómo funciona `customers` como centro

`customers` es la tabla de clientes de la app principal — la pantalla que usás todos los días. Cada cliente que registrás manualmente o que llega por MacroDroid tiene su fila ahí.

Campos que ya tiene:
- `full_name` — nombre completo
- `canonical_name` — nombre normalizado (mayúsculas, sin tildes) para búsquedas
- `phone` — teléfono (llenado manualmente si existe)
- `wa_number` — número WhatsApp — **el campo que Pulpo tiene que llenar**
- `total_payments` — conteo de pagos
- `total_spent` — total gastado

Una vez que `wa_number` está lleno, el perfil está completo. El operador puede ver las fotos de WhatsApp del cliente sin salir de la app.

---

## Todos los escenarios posibles

---

### ESCENARIO 1 — Cliente ya existe en `customers` y manda comprobante por WhatsApp
**Caso más común.**

```
Cliente escribe por WhatsApp
        ↓
panel_clientes creado con: phone=59172698959, nombre=null
        ↓
Cliente manda comprobante
        ↓
IA extrae: nombre="PEDRO GARCIA", monto=50, hora=14:30
        ↓
Sistema busca en customers: ¿existe canonical_name="PEDRO GARCIA"?
        ↓
SÍ → escribe customers.wa_number = "59172698959"
        ↓
Perfil completo. Operador ve fotos al abrir el perfil de Pedro.
```

**Resultado:** ✅ Automático. Sin intervención del operador.

---

### ESCENARIO 2 — Llega comprobante pero el cliente NO existe todavía en `customers`
**Cliente nuevo que nunca fue registrado en la app.**

```
Cliente nuevo escribe por WhatsApp
        ↓
panel_clientes creado con: phone=59172698959, nombre=null
        ↓
Cliente manda comprobante
        ↓
IA extrae: nombre="ANA FLORES", monto=80
        ↓
Sistema busca en customers: ¿existe canonical_name="ANA FLORES"?
        ↓
NO existe
        ↓
¿Qué hace el sistema?
```

**Dos opciones:**

**Opción A — Crear el cliente automáticamente:**
El sistema crea un registro nuevo en `customers` con el nombre y el teléfono. El operador lo ve en la lista de pagos como cliente nuevo, sin historial previo.

**Opción B — Alerta al operador:**
El sistema guarda el nombre y teléfono en `panel_clientes` y marca al cliente como "requiere registro". El operador crea el cliente manualmente cuando lo procese.

**Recomendación: Opción A.**
En este negocio, cualquier persona que manda un comprobante es un cliente válido. Crearlo automáticamente reduce trabajo manual. El operador puede completar los datos después.

---

### ESCENARIO 3 — MacroDroid detecta un pago pero el cliente nunca escribió por WhatsApp
**Pago por transferencia bancaria sin contacto directo.**

```
MacroDroid detecta pago de "MARIA QUISPE"
        ↓
Se crea pago en pagos: nombre="MARIA QUISPE", monto=120
        ↓
Se crea pedido en pedidos: customer_name="MARIA QUISPE"
        ↓
¿Existe en customers? 
  SÍ → se vincula el pago al cliente
  NO → se crea el cliente automáticamente (ya lo hace ingest-notification)
        ↓
customers.wa_number = null (nunca escribió por WhatsApp)
```

**Resultado:** El cliente existe en la app, tiene su pago registrado, pero sin número de WhatsApp. Aparece en la lista de pagos sin el ícono de WhatsApp. Normal — es un cliente que no usa WhatsApp para contactar.

---

### ESCENARIO 4 — Cliente escribe por WhatsApp pero NUNCA manda comprobante
**Solo manda fotos de ropa, pregunta precios, pero no paga por ahí.**

```
Cliente escribe por WhatsApp
        ↓
panel_clientes: phone=59172698959, nombre=null
        ↓
Nunca llega comprobante
        ↓
customers.wa_number = null (Pulpo nunca tiene nombre para buscar)
```

**Resultado:** El cliente existe en el panel de WhatsApp con su número pero sin nombre. No se vincula a `customers` porque no hay nombre para hacer el match. Aparece en el panel de pedidos de WhatsApp sin nombre.

**Solución futura (no urgente):** El operador puede asignar manualmente el nombre en el panel de WhatsApp, lo que dispara el vínculo.

---

### ESCENARIO 5 — Cliente de la tienda online
**Compra desde la tienda web.**

```
Cliente compra en tienda: nombre="LUCIA MAMANI", wa=59171234567
        ↓
Se crea store_orders: customer_name="LUCIA MAMANI", customer_wa="59171234567"
        ↓
Pulpo (opcionalmente): busca en customers "LUCIA MAMANI"
  SÍ existe → actualiza customers.wa_number = "59171234567"
  NO existe → crea cliente en customers
        ↓
Perfil completo con historial de compras de tienda
```

**Resultado:** La tienda ya tiene el número desde el registro. Es el escenario más limpio — nombre + teléfono llegan juntos.

---

### ESCENARIO 6 — Mismo cliente por dos canales distintos (sin comprobante)
**MacroDroid conoce el nombre. WhatsApp conoce el número. Nunca se cruzan.**

```
MacroDroid: "ROBERTO CONDORI" paga Bs 200
  → customers: full_name="ROBERTO CONDORI", wa_number=null

WhatsApp: 59176543210 escribe
  → panel_clientes: phone=59176543210, nombre=null

Nunca llega comprobante de Roberto
  → Pulpo no tiene nombre del WhatsApp para buscar
  → wa_number sigue null
```

**Resultado:** Dos registros separados que representan la misma persona. Sin comprobante, Pulpo no puede conectarlos.

**Esto es el límite real del sistema.** Sin el comprobante como puente (nombre + teléfono juntos), no hay vínculo posible sin intervención manual.

---

## Diagrama completo del flujo

```
CANALES DE ENTRADA:
────────────────────────────────────────────────
MacroDroid          WhatsApp Panel       Tienda
(nombre+monto)      (teléfono+fotos)     (nombre+teléfono)
      │                   │                   │
      ▼                   ▼                   ▼
   pagos            panel_clientes       store_orders
   pedidos          panel_mensajes
      │                   │                   │
      └─────────┬──────────┘─────────┬────────┘
                │                    │
                │  (comprobante)      │  (sync-store)
                ▼                    ▼
         ┌─────────────────────────────┐
         │         customers           │  ← CENTRO
         │  full_name                  │
         │  wa_number  ← Pulpo llena   │
         │  pagos vinculados           │
         │  pedidos vinculados         │
         └─────────────────────────────┘
                        │
                        ▼
         Perfil completo en la app:
         nombre + pagos + pedidos +
         casillero + fotos WhatsApp
```

---

## Tablas que ya NO se van a usar después del rediseño

| Tabla | Motivo |
|---|---|
| `orders` | Reemplazada por `pedidos` desde hace meses |
| `order_bags` | Reemplazada por `pedidos` |
| `giveaways` | Sin flujo activo, sin referencia en código |
| `customers.whatsapp_number` | Campo duplicado de `wa_number`, nunca se usa |
| `app_users` | Supabase Auth ya maneja la autenticación |

**Total a eliminar: 3 tablas completas + 1 columna**

---

## Tablas que SIGUEN pero con rol reducido

| Tabla | Rol que queda |
|---|---|
| `identity_profiles` | Solo para el Panel de Identidad (auditoría). No es el motor del sistema. |
| `identity_evidence` | Solo auditoría. |
| `parsed_payment_candidates` | Pipeline interno de MacroDroid. Invisible para el operador. |
| `raw_notification_events` | Auditoría. Invisible para el operador. |
| `manual_review_queue` | Cola de pagos sin nombre. Auditoría. |

---

## Cómo queda el Sistema Pulpo redefinido

**Antes (lo que se construyó):**
Sistema de perfiles paralelos independiente que intenta unificar identidades en una tabla propia (`identity_profiles`), separada de `customers`.

**Después (lo correcto):**
Una función de completado. Cuando llega un comprobante con nombre + teléfono:
1. Busca el cliente en `customers` por nombre (exacto o fuzzy)
2. Si existe → escribe `customers.wa_number`
3. Si no existe → crea el cliente en `customers` con nombre + teléfono
4. `identity_profiles` se actualiza como registro secundario de auditoría

El Panel de Identidad sigue existiendo para ver quién tiene número vinculado y quién no. Pero no es el motor. Es el tablero de control.

---

## Qué falta implementar (los dos pasos concretos)

### Paso 1 — Reconectar `fn_link_customer_wa` en `summarize-conversation`
**Archivo:** `src/routes/ai-gateway.ts`  
**Qué hace:** cuando se extrae el nombre del comprobante, llamar a `fn_link_customer_wa` que ya existe en la base de datos y hace exactamente lo que se necesita: busca el cliente por nombre y escribe el teléfono.

### Paso 2 — Mostrar fotos en el perfil del cliente
**Archivo:** `src/App.tsx` (sección perfil del cliente)  
**Componente listo:** `src/components/WhatsappPhotos.tsx`  
**Qué hace:** toma `customers.wa_number` y muestra las fotos de WhatsApp del cliente.

---

## Recomendación sobre cuándo implementar

**Hacer la prueba definitiva con Ivan Ariel primero.** La prueba va a confirmar que:
- El nombre se extrae correctamente del comprobante
- El vínculo nombre → teléfono funciona

Una vez confirmado eso, implementar los dos pasos de arriba. Son cambios pequeños sobre un sistema que ya funciona. No hay riesgo de romper nada.
