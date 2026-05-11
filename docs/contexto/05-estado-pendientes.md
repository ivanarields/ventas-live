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
| 2026-05-10 | Tienda unificada: eliminar storefront antiguo, renombrar tienda-v2 a tienda | pendiente |
| 2026-05-10 | Flujo CONFIRMAR: clienta confirma prendas desde perfil/confirmar | pendiente |
| 2026-05-10 | Flujo ENTREGA: admin configura fechas de retiro, clienta elige desde perfil/entrega | pendiente |
| 2026-05-10 | Número oficial de WA configurable en Configuraciones (official_wa_number) | pendiente |
| 2026-05-10 | Bug fix: endpoints pickup-dates corregidos para tabla key-value | pendiente |
| 2026-05-10 | Bug fix: categorías de tienda no pierden chips al editar (quitar onBlur) | pendiente |
| 2026-05-10 | QR de pago más grande, sin texto Yape, colores sin negro puro | pendiente |
| 2026-05-10 | Workflow Codex como orquestador (docs/workflow/) | pendiente |
| 2026-05-10 | Verificación manual de pedidos web desde pestaña Pagos (tarjetas moradas WEB) | pendiente |
| 2026-05-06 | Fix fecha local Bolivia en formulario de pagos | `3ae02b3` |
| 2026-05-06 | Panel IA muestra modelo activo como badge, sin form de configuración | `3ae02b3` |
| 2026-05-05 | Botón "Live" procesa todas las conversaciones WA del día | `f604f01` |
| 2026-05-05 | Etiquetas: asignación solo al marcar LISTO (no al crear pedido) | `114a295` |
| 2026-05-05 | Dos comprobantes mismo monto → 2 registros separados (bug fix) | `114a295` |
| 2026-05-05 | Excluir pagos MacroDroid ya asignados del matching | `114a295` |
| 2026-05-05 | Tienda: productos VENDIDO muestran sello en vez de ocultarse | `abf7724` |

---

