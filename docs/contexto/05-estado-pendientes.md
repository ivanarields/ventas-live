# Estado Actual y Pendientes — actualizado 2026-05-15

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
| 2026-05-15 | feat: botón Re-analizar (naranja) reprocesa todos los chats del último Live incluyendo los ya alistados; eliminar botón "Borrar pagos de hoy"; texto del botón Live más corto | pendiente |
| 2026-05-15 | fix: dos comprobantes del mismo monto enviados por WhatsApp ahora crean 2 pagos separados (bug en dedup por URL de imagen y marcado incorrecto como posible_duplicado) | pendiente |
| 2026-05-15 | **Auditoría Claude Code task-20**: 4 bugs críticos encontrados en flujo Live/Sin asignar (ver `docs/planes/hallazgos-20-*.md`) | solo auditoría |
| 2026-05-14 | Fix sincronizar estado cliente en panel después de verificación manual | `3308814` |
| 2026-05-14 | Nuevos iconos de app versionados, logo reemplazado, preview de pedidos web compacto | `0f2ba24` |
| 2026-05-13 | Barra flotante compacta y panel favoritos optimizado en tienda | `aca0d71` |
| 2026-05-13 | Separar fotos y mensajes de tienda del análisis Live; fix comprobantes revisión manual | `2350aa8` |
| 2026-05-13 | Reforzar MacroDroid receiver antifallos + autenticación puente Supabase | `0f32bfd` |
| 2026-05-12 | Fix fusión logística QR tienda: maybeSingle, retry customer, cascade nombre → crea pedido WEB + pago Tienda Online | `4e05b13` |
| 2026-05-10 | Tienda unificada: eliminar storefront antiguo, renombrar tienda-v2 a tienda | pendiente |
| 2026-05-10 | Flujo CONFIRMAR: clienta confirma prendas desde perfil/confirmar | pendiente |
| 2026-05-15 | **fix**: backend expone `lastAny` y `isUnassignedPayment` usa origin `'automatic'`. Tras prueba real 14:09 se detectó que `lastCompleted` se anulaba al procesarse y que mi comparación con `'verificado_macrodroid'` nunca matcheaba (server.ts:1027 devuelve `'automatic'`). | resuelto |
| 2026-05-15 | fix: `isUnassignedPayment` clasifica pagos fuera del Live a "Sin asignar" usando rango de sesión | `846df33` |
| 2026-05-15 | fix: `ensureMainDailyPedido` no infla `total_amount` de pedidos `live_sales` con pagos MacroDroid fuera del Live | `846df33` |
| 2026-05-15 | fix: `identity.ts` ya no usa epoch como fallback, ahora usa pivot±days; ventana ampliada de 2h a 8h | `846df33` |
| 2026-05-15 | fix: análisis IA del Live procesa hasta 40 fotos (antes solo 8) + reintento sobre clasificaciones "otro" para encontrar comprobantes que Gemini dudó | `95882d8` |
| 2026-05-16 | fix: match MacroDroid → comprobante ya no requiere nombre extraído si se conoce el ID del cliente; soluciona que 2 de 3 comprobantes quedaban sin match verde | pendiente push |
| 2026-05-16 | feat: pagos MacroDroid se descartan cuando el Live está apagado (portero en /api/ingest-notification); pestaña "Sin asignar" eliminada | pendiente push |
| 2026-05-15 | fix: useMemo de groupedPayments/stats/unassignedPayments ahora dependen de liveSessionState → pagos MacroDroid fuera del Live se clasifican correctamente a Sin Asignar cuando carga el estado de sesión | pendiente push |
| 2026-05-15 | fix: polling cada 30s de live session state para que `lastAny` se mantenga al día sin depender de cache del navegador | pendiente push |
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

