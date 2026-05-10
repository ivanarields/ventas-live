# Estado Actual y Pendientes — actualizado 2026-05-06

## Qué está funcionando y probado ✅

### Sistema de pagos
- MacroDroid captura notificaciones bancarias (Yape, Yastaa) y crea pagos automáticamente
- Comprobantes WhatsApp se procesan con IA y se cruzan con pagos MacroDroid
- Dos comprobantes del mismo nombre/monto → 2 registros separados (no se fusionan)
- Cada comprobante se vincula a su propio pago MacroDroid (no "roba" el de otro)
- Pago manual en efectivo via botón "Registrar"
- Botón "Live" procesa todos los chats WA pendientes en paralelo

### Sistema de etiquetas
- 1 bolsa → etiqueta numérica asignada automáticamente
- 2+ bolsas → etiqueta alfabética asignada automáticamente
- Al agregar segunda bolsa → migración automática de numérica a letra
- Entrega → etiqueta liberada correctamente
- Historial completo de asignaciones preservado

### IA
- Panel de configuración muestra modelo activo (google/gemini-2.5-flash-lite) como badge
- Resumen de conversaciones WA extrae nombre, monto, hora del comprobante
- Dos modos de prompt para comprobantes: simple y completo

### General
- Fecha del formulario "Registrar Pago" usa hora local de Bolivia (no UTC)

---

## Últimos cambios importantes

| Fecha | Cambio | Commit |
|-------|--------|--------|
| 2026-05-10 | Verificación manual de pedidos web desde pestaña Pagos (tarjetas moradas WEB) | pendiente commit |
| 2026-05-06 | Fix fecha local Bolivia en formulario de pagos | `3ae02b3` |
| 2026-05-06 | Panel IA muestra modelo activo como badge, sin form de configuración | `3ae02b3` |
| 2026-05-05 | Botón "Live" procesa todas las conversaciones WA del día | `f604f01` |
| 2026-05-05 | Etiquetas: asignación solo al marcar LISTO (no al crear pedido) | `114a295` |
| 2026-05-05 | Dos comprobantes mismo monto → 2 registros separados (bug fix) | `114a295` |
| 2026-05-05 | Excluir pagos MacroDroid ya asignados del matching | `114a295` |
| 2026-05-05 | Tienda: productos VENDIDO muestran sello en vez de ocultarse | `abf7724` |

---

## Pruebas pendientes (docs/pruebas-pendientes-2026-05-06.md)

| # | Prueba | Prioridad |
|---|--------|-----------|
| A | Verificación manual de pago morado | Alta |
| B | Cliente con 2 pedidos activos al mismo tiempo | Alta |
| C | MacroDroid captura notificación basura/promo | Alta |
| D | Comprobante de solo texto (sin foto) | Alta |
| E | Mismo comprobante enviado dos veces | Alta |
| F | Editar pago con datos incorrectos | Media |
| G | Eliminar pago y verificar liberación de etiqueta | Media |
| H | Pago fraccionado (cliente paga en 2 partes) | Media |

---

## Tareas técnicas pendientes

- **Migrar WhatsApp Bridge** de Railway a otro alojamiento (ver `03-whatsapp-bridge.md`)
- **RLS (Row Level Security)** en Supabase — actualmente filtrado solo por `user_id` en servidor
- **Supabase Realtime** — reemplazar el polling manual de `loadData()` para actualizaciones en tiempo real
- **Tienda:** flujo completo de verificación de pagos end-to-end (ver `04-tienda-online.md`)

---

## Migraciones de DB aplicadas

La DB principal tiene 43 migraciones aplicadas (001 a 043).
La última relevante: `043_fix_downgrade_last_order.sql` — permite degradar etiqueta letra a número cuando es el último pedido activo del cliente.

---

## Variables de entorno necesarias (.env local)

```
PORT=3004
VITE_SUPABASE_URL / SUPABASE_URL=https://vhczofpmxzbqzboysoca.supabase.co
SUPABASE_SERVICE_ROLE_KEY=[key]
OPENROUTER_API_KEY=[key]
OPENROUTER_MODEL=google/gemini-2.5-flash-lite
PANEL_SUPABASE_URL=https://vwaocoaeenavxkcshyuf.supabase.co
PANEL_SUPABASE_SERVICE_KEY=[key]
VITE_STORE_SUPABASE_URL=https://thgbfurscfjcmgokyyif.supabase.co
STORE_SUPABASE_SERVICE_ROLE_KEY=[key]
WHATSAPP_BRIDGE_URL=https://bridge-production-13f7.up.railway.app
WEBHOOK_SECRET=ventas-live-bridge-2026
```
