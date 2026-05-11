# App Principal — Ventas Live

Última revisión: 2026-05-10. Verificado contra el código real (`src/App.tsx`).

---

## Nombres de pantallas (nomenclatura oficial)

Estas son las 6 pestañas del menú inferior con sus nombres correctos:

| Nombre visible | Código interno | Ícono | Lo que muestra |
|---|---|---|---|
| **Cobros** | `home` | Casa | Resumen del día: ingresos, pedidos, accesos rápidos |
| **Etiquetas** | `entrega` | Caja | Etiquetas asignadas a pedidos + Comprobantes Live |
| **Pagos** | `payments` | Billetera | Lista de pagos del día por cliente |
| **Finanzas** | `finance` | Gráfico | Transacciones de ingresos y gastos |
| **Tienda** | `tienda` | Tienda | Panel admin de la tienda online |
| **Config** | `settings` | Engranaje | Configuración: WhatsApp, etiquetas, versión |

> **"Mesa de Preparación"**: este nombre NO existe en la UI. Es un concepto interno que usaba Claude para explicar la pantalla. La pantalla real muestra ícono de camiseta y bolsa, con el botón **"MARCAR COMO LISTO"**. En los documentos se llama "pantalla de conteo".

---

## Pestaña Cobros (home)

Pantalla de inicio. Muestra un resumen de todo el día.

**Contenido en orden:**
1. **Banner PWA** — aparece solo si la app no está instalada
2. **Tarjeta de ingresos** — "Ingresos hoy" en grande (Bs), más Pagos hoy / Total acumulado / Mes
3. **Grilla de pedidos** — tres cifras: Procesar / Listos / Total (pedidos del día)
4. **Acceso rápido** — tres botones que llevan directo a: Etiquetas (muestra cuántos listos) / Pagos / Panel Tienda
5. **Próximo Live** — solo aparece si hay un live programado
6. **Pagos recientes** — lista de los últimos pagos del día

---

## Pestaña Etiquetas (entrega)

Tiene dos sub-pestañas dentro:

### Sub-pestaña "Etiquetas" (primera)
Muestra todas las etiquetas activas con pedidos asignados.

- **"Etiquetas de 1 bolsa"** — etiquetas numéricas (1–100), fondo azul, 1 bolsa por pedido
- **"Etiquetas de 2+ bolsas"** — etiquetas alfabéticas (A–Z), fondo fucsia, múltiples bolsas
- Cada etiqueta muestra el nombre de la clienta y los pedidos dentro
- Tocar un pedido abre un modal con: etiqueta grande, "Etiqueta exclusiva" (letra) o "Etiqueta compartida" (número), cantidad de bolsas y prendas, botón entregar
- Estado vacío: "Sin etiquetas asignadas"

### Sub-pestaña "Comprobantes Live" (segunda)
Muestra el panel de pedidos y comprobantes de WhatsApp Live (`PanelPedidos`). Ver `02-sistema-pagos.md` para detalle completo.

---

## Pestaña Pagos (payments)

Lista de pagos del día seleccionado, agrupados por cliente.

**Cada grupo muestra:**
- Ícono de check con color según origen:
  - **Verde** — verificado automáticamente por MacroDroid
  - **Morado/Violeta** — verificado manualmente O hay comprobante WA pendiente
  - **Gris** — efectivo u otro tipo sin clasificar
- Nombre del cliente y monto total (Bs, en fucsia)
- Botón **"Verificar"** en violeta — aparece solo cuando hay comprobante WA pendiente; al tocarlo confirma el pago sin ir a otra pantalla

**Filtros en la barra superior:**
- Ojo — oculta clientes que ya retiraron
- `#` — muestra solo clientes con número de WhatsApp
- Botón "Live" (color morado) — procesa todas las conversaciones WA del día con IA

---

## Pestaña Finanzas (finance)

Transacciones de ingresos y gastos del negocio. Separado del flujo de cobros de clientas.

---

## Pestaña Tienda (tienda)

Panel admin para gestionar la tienda online en `leidydiaz.live`. Muestra productos, stock y pedidos web. Ver `04-tienda-online.md` para detalle completo.

---

## Pestaña Config (settings)

- Conexión WhatsApp
- **Número oficial de WhatsApp** — número conectado al Bridge, se usa en todos los botones de la app. Se guarda en `store_settings` con key `official_wa_number`
- **Capacidad de etiquetas** — ajusta bolsas máximas por etiqueta numérica
- Versión de la app y base de datos

---

## Flujo del perfil de una clienta

Desde la pestaña **Pagos**, tocar el nombre de una clienta abre su perfil.

### Tarjetas de pedido — colores reales (OrderItemCard)

| Color de borde | Estado | Lo que significa |
|---|---|---|
| **Gris** (`#f1f5f9`) | Solo pago, sin pedido | Se registró un pago pero no hay pedido asociado |
| **Ámbar** (`#FEF3C7`) | PROCESAR | Pedido creado, falta contar prendas y bolsas |
| **Azul** (`#E0F2FE`) | LISTO | Pedido contado y con etiqueta asignada |
| **Verde** (`#DCFCE7`) | ENTREGADO | La clienta retiró su ropa |

### Acciones desde el perfil

- Tocar tarjeta **PROCESAR** → abre la pantalla de conteo
- Tocar tarjeta **LISTO** → abre la pantalla de conteo en modo edición
- Botón **"+ Pedido"** → crea un pedido nuevo para la clienta

### Pantalla de conteo (antes llamada "Mesa de Preparación")

No tiene título en pantalla. Muestra:
- **Ícono camiseta** — toca para sumar prendas
- **Ícono bolsa** — toca para sumar bolsas
- **Ícono etiqueta** — bloqueado, muestra la etiqueta que asignará el sistema
- Botón de reset: "Resumen del Pedido"
- Botón principal: **"MARCAR COMO LISTO"** (si está en PROCESAR) o **"GUARDAR CAMBIOS"** (si ya está LISTO)

Al tocar "MARCAR COMO LISTO": Supabase asigna la etiqueta automáticamente según el total de bolsas de la clienta. El operador nunca elige la etiqueta.

---

## Sistema de etiquetas — reglas de asignación

| Bolsas totales de la clienta | Tipo de etiqueta |
|---|---|
| 1 bolsa | Numérica (1–100), compartida con otras clientas |
| 2+ bolsas | Alfabética (A–Z), exclusiva para esa clienta |

- Si la clienta ya tiene etiqueta alfabética activa → nuevo pedido hereda la misma letra
- Si suma 2+ bolsas en total → migra automáticamente de número a letra (transacción atómica en PostgreSQL)
- Al marcar ENTREGADO → etiqueta liberada

**Capacidades reales (producción):**
- Etiquetas numéricas: 1–100 (hasta 5 pedidos por etiqueta)
- Etiquetas alfabéticas: A–Z (hasta 20 bolsas por etiqueta)

---

## Estructura de datos principal

Todas las tablas están en **ChehiAppAbril** (`vhczofpmxzbqzboysoca`):

| Tabla | Propósito |
|---|---|
| `customers` | Clientas con nombre, teléfono, etiqueta activa |
| `pagos` | Pagos recibidos (efectivo, MacroDroid, tienda, WA manual) |
| `pedidos` | Pedidos en proceso o listos |
| `storage_containers` | Etiquetas físicas (1–100 y A–Z) |
| `container_allocations` | Asignaciones activas e históricas |
| `orders` | Sistema de etiquetas vinculado a pedidos |
| `order_bags` | Bolsas individuales por pedido |
| `transactions` | Ingresos y gastos de finanzas |
| `live_sessions` | Lives programados |
| `app_users` | Usuarios de la app |
