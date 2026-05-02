# Informe tecnico - Perfiles, preparacion y casilleros

## 1. Objetivo del informe

Este documento describe el sistema interno que une perfiles, pagos, pedidos, preparacion fisica, bolsas, prendas, etiquetas, casilleros y entrega.

Es el nucleo operativo de Ventas Live. Todo lo que venga desde tienda online, WhatsApp, MacroDroid o registro manual debe terminar aqui de forma controlada.

El flujo ideal es:

```text
Pago o pedido verificado
  -> perfil unificado
  -> cliente interno
  -> pedido interno en `procesar`
  -> Mesa de Preparacion
  -> operador confirma prendas y bolsas
  -> pedido listo
  -> backend asigna casillero automaticamente
  -> cliente retira
  -> entrega libera casillero
  -> historial queda guardado
```

Principio critico: el casillero no debe decidirse por la tienda ni por WhatsApp. El casillero debe asignarse solamente cuando el operador confirma fisicamente cuantas bolsas y prendas tiene el pedido.

## 2. Estado actual del sistema

La app ya contiene un sistema interno completo para operar pagos, perfiles, pedidos y casilleros. Tambien existe un sistema de identidad global para unir diferentes canales.

| Area | Estado actual | Comentario tecnico |
|---|---|---|
| Clientes internos | Existe | Tabla `customers`, endpoints `/api/clientes`, UI en `App.tsx`. |
| Pagos | Existe | Tabla `pagos`, endpoints `/api/pagos`, flujo manual y MacroDroid. |
| Pedidos internos | Existe | Tabla `pedidos`, estados `procesar`, `listo`, `entregado`. |
| Perfil de cliente | Existe | App agrupa pagos/pedidos por cliente y muestra historial. |
| Mesa de Preparacion | Existe | UI tactil en `App.tsx`, suma prendas y bolsas. |
| Sistema de etiquetas | Existe | Tablas `orders`, `order_bags`, `storage_containers`, `container_allocations`. |
| Asignacion automatica | Existe | PL/pgSQL con `fn_assign_container`, `fn_migrate_to_complex`, `fn_release_container`. |
| Migracion simple/compleja | Existe | 1 bolsa usa numericos; 2+ bolsas migra a letras. |
| Entrega | Existe | Cambia pedido a `entregado` y libera etiqueta. |
| Identidad global | Existe | `identity_profiles` e `identity_evidence`. |
| Tienda/WhatsApp hacia preparacion | Existe parcialmente | Ambos pueden crear pedidos internos, pero falta contrato unico. |

La arquitectura actual ya permite operar manualmente. Lo que falta es hacer que todos los canales externos entren al mismo flujo sin saltarse validaciones fisicas.

## 3. Conceptos principales

### 3.1 Perfil interno

El perfil interno es la vista que usa el operador para administrar una clienta:

- nombre;
- WhatsApp;
- pagos;
- pedidos;
- estado de preparacion;
- etiqueta activa;
- historial;
- entrega.

La tabla principal es `customers`.

### 3.2 Perfil global de identidad

El perfil global es el puente entre canales:

- pago manual;
- MacroDroid;
- WhatsApp;
- tienda online;
- cliente interno.

Tablas:

- `identity_profiles`
- `identity_evidence`

Este perfil no reemplaza a `customers`. Lo complementa para saber que varias fuentes pertenecen a la misma persona.

### 3.3 Pedido interno

El pedido interno vive en `pedidos`. Es lo que ve el operador y lo que alimenta la Mesa de Preparacion.

Estados reales usados:

- `procesar`: pendiente de preparar;
- `listo`: preparado y con etiqueta/casillero;
- `entregado`: retirado y casillero liberado.

### 3.4 Sistema de etiquetas

El sistema de etiquetas vive en tablas separadas:

- `orders`
- `order_bags`
- `storage_containers`
- `container_allocations`

Estas tablas son el motor logistico de casilleros. La app interna usa `pedidos.label` y `pedidos.label_type` como copia visible de la etiqueta asignada.

### 3.5 Casilleros

Tipos:

| Tipo | Codigos | Uso |
|---|---|---|
| `NUMERIC_SHARED` | 1, 2, 3, 4 | Pedidos simples de 1 bolsa. |
| `ALPHA_COMPLEX` | A, B, C, D | Pedidos complejos de 2+ bolsas. |

Reglas:

- 1 bolsa -> casillero numerico compartido.
- 2+ bolsas -> casillero alfabetico exclusivo.
- Si un pedido sube de 1 a 2 bolsas, migra de numerico a letra.
- Si baja de complejo a simple, existe funcion de downgrade.
- El operador no elige casillero.
- El historial de asignaciones no se borra.

## 4. Flujo actual detallado

### 4.1 Carga inicial de datos

En `src/App.tsx`, `loadData()` carga en paralelo:

- clientes (`clientesApi.list`);
- pagos (`pagosApi.list`);
- pedidos (`pedidosApi.list`);
- transacciones;
- categorias;
- lives;
- ideas.

Luego normaliza:

- `customers` desde `customers`;
- `payments` desde `pagos`;
- `pedidos` desde `pedidos`.

El frontend agrupa personas por cliente, nombre normalizado, pagos y pedidos.

### 4.2 Registro manual de pago

El modal de pago crea o encuentra cliente y luego:

1. Inserta pago en `pagos`.
2. Crea pedido automatico en `pedidos` con estado `procesar`.
3. Llama `onRefresh()` para recargar.

Backend:

- `POST /api/pagos`
- `POST /api/pedidos`

Ademas, `POST /api/pagos` llama en background a `ingestManualPayment`, que deposita evidencia en el sistema de identidad.

Este flujo ya es una buena plantilla para tienda y WhatsApp: pago verificado -> pedido en `procesar`.

### 4.3 Perfil del cliente

El perfil muestra:

- cabecera con nombre y WhatsApp;
- totales;
- historial;
- pagos;
- pedidos;
- tarjetas por estado.

Estados visuales importantes:

- gris: solo pago;
- azul: `procesar`;
- verde: `listo`;
- entregado: retirado/liberado.

Desde el perfil, un pedido `procesar` abre la Mesa de Preparacion.

### 4.4 Mesa de Preparacion

La Mesa de Preparacion esta en `App.tsx` dentro de la vista de detalle del cliente.

Flujo:

1. El operador abre un pedido `procesar`.
2. Cuenta prendas con boton/accion de camiseta.
3. Cuenta bolsas con boton/accion de bolsa.
4. Debe haber al menos 1 bolsa.
5. Pulsa accion principal para marcar listo.
6. Se actualiza `pedidos` con:
   - `status: 'listo'`;
   - `bag_count`;
   - `item_count`.
7. Se llama `syncLabelsForCustomer`.
8. El backend/PLpgSQL asigna o migra casillero.
9. La etiqueta se escribe de vuelta en `pedidos`.
10. La etiqueta activa se escribe en `customers`.

Este es el punto correcto para asignar casillero.

### 4.5 Sincronizacion de etiquetas

La funcion clave del frontend es `syncLabelsForCustomer` en `App.tsx`.

Hace:

1. Busca pedidos del cliente.
2. Separa pedidos entregados y activos.
3. Para entregados, llama `releasePedidoLabel`.
4. Para activos, llama `syncPedidoLabel`.
5. Recibe el `containerCode`.
6. Actualiza `pedidos.label` y `pedidos.label_type`.
7. Actualiza `customers.active_label` y `customers.active_label_type`.
8. Si no quedan activos, limpia etiqueta activa del cliente.

La funcion `syncPedidoLabel` esta en `src/services/labelingService.ts`.

Llama RPC:

- `fn_upsert_customer`
- `fn_upsert_order_and_assign`

Luego devuelve:

- `containerCode`;
- `orderId`;
- `wasMigrated`.

### 4.6 Entrega

La entrega se puede hacer desde vista de entrega/casilleros o desde perfil.

Flujo:

1. Operador confirma entrega.
2. `pedidos.status` pasa a `entregado`.
3. Se llama `syncLabelsForCustomer`.
4. `releasePedidoLabel` libera casillero por `firebase_id`/id legacy del pedido.
5. La tabla `container_allocations` conserva historial.
6. La UI recarga.

## 5. Tablas principales

### 5.1 `customers`

Cliente interno de la app.

Campos base:

- `id`
- `full_name`
- `normalized_name`
- `whatsapp_number`
- `is_active`
- `created_at`
- `updated_at`

Campos agregados por migraciones:

- `firebase_id`
- `canonical_name`
- `phone`
- `active_label`
- `active_label_type`
- `label_updated_at`
- `total_spent`
- `total_items`
- `pending_items`
- `delivered_items`
- `active_bag_count`
- `label_version`
- `user_id`
- `wa_number`
- `wa_linked_at`
- `store_customer_id`
- `source`
- `last_payment_at`
- `total_payments`
- `notes`
- `tags`

Uso:

- perfil operativo;
- filtro por usuario;
- telefono/WhatsApp;
- etiqueta activa;
- conexion con identidad.

Riesgo:

- Debe evitar nombres placeholder como identidad definitiva.
- `phone`, `wa_number` y `whatsapp_number` deben normalizarse en una politica clara.

### 5.2 `pagos`

Pagos registrados por operador, MacroDroid o integraciones.

Campos:

- `id`
- `nombre`
- `pago`
- `date`
- `status`
- `method`
- `verified`
- `customer_id`
- `user_id`
- campos de reparacion historica.

Uso:

- lista principal de pagos;
- origen del pedido automatico en `procesar`;
- evidencia para identidad.

Regla:

- Si el pago viene de notificacion bancaria sin nombre real, debe ir a revision, no a `pagos` con nombre inventado.

### 5.3 `pedidos`

Pedido operativo visible en la app.

Campos:

- `id`
- `customer_id`
- `customer_name`
- `item_count`
- `bag_count`
- `label`
- `label_type`
- `status`
- `total_amount`
- `date`
- `label_version`
- `converted_from_order_id`
- `user_id`
- `source`
- `web_items_list`
- `created_at`
- `updated_at`

Uso:

- Mesa de Preparacion;
- lista azul/verde;
- entrega;
- copia visible de etiqueta.

Estados recomendados:

| Estado | Significado |
|---|---|
| `procesar` | Pendiente de contar/preparar. |
| `listo` | Preparado, etiqueta asignada. |
| `entregado` | Retirado/liberado. |

Para automatizacion:

- tienda y WhatsApp deben crear `pedidos` solo cuando el pedido este suficientemente confirmado.
- `source` debe indicar origen (`WEB`, `WHATSAPP`, `LIVE`, `MANUAL`, `MACRODROID`).

### 5.4 `orders`

Tabla logistica del sistema de etiquetas.

Campos:

- `id`
- `customer_id`
- `order_code`
- `logistics_type`
- `total_bags`
- `total_items`
- `order_status`
- `total_amount`
- `notes`
- `firebase_id`

Uso:

- representacion logistica de un pedido;
- calculo de simple/complejo;
- vinculacion legacy por `firebase_id`.

No es lo mismo que `pedidos`. `pedidos` es operativo/UI; `orders` es logistico/casilleros.

### 5.5 `order_bags`

Detalle de bolsas de un pedido logistico.

Campos:

- `id`
- `order_id`
- `bag_number`
- `bag_status`

Uso:

- registrar bolsas fisicas por pedido.

### 5.6 `storage_containers`

Casilleros fisicos.

Campos:

- `id`
- `container_code`
- `container_type`
- `max_simple_orders`
- `max_bags_capacity`
- `current_simple_orders`
- `current_bags_used`
- `state`
- `priority_order`
- `notes`

Estados:

- `AVAILABLE`
- `PARTIAL`
- `FULL`
- `BLOCKED`
- `MAINTENANCE`

### 5.7 `container_allocations`

Asignaciones de pedidos a casilleros.

Campos:

- `id`
- `container_id`
- `order_id`
- `allocation_type`
- `bags_reserved`
- `status`
- `assigned_by`
- `assigned_at`
- `released_by`
- `released_at`
- `release_reason`
- `migration_target_id`
- `notes`

Estados:

- `ACTIVE`
- `RELEASED`
- `MIGRATED`
- `CANCELLED`

Regla:

- Solo debe haber una asignacion activa por pedido.
- El historial no se borra.

### 5.8 `identity_profiles`

Perfil global unificado.

Campos:

- `id`
- `user_id`
- `display_name`
- `phone`
- `cliente_id`
- `store_phone`
- `panel_phone`
- `confidence`
- `merged_from`
- `origin`

Uso:

- unir customer interno, WhatsApp, tienda y pagos.

### 5.9 `identity_evidence`

Evidencia por canal.

Campos:

- `id`
- `user_id`
- `profile_id`
- `source`
- `source_id`
- `source_ref`
- `event_type`
- `amount`
- `phone`
- `name_raw`
- `name_normalized`
- `event_at`
- `payload`

Uso:

- auditar porque el sistema cree que una persona de WhatsApp, tienda y pagos es la misma.

## 6. Funciones PL/pgSQL relevantes

### 6.1 `fn_recalc_container_state`

Recalcula contadores y estado de un casillero.

Uso:

- despues de asignar;
- despues de liberar;
- despues de migrar.

### 6.2 `fn_assign_container`

Asigna casillero a un pedido.

Reglas:

- Si `logistics_type` es simple, usa `NUMERIC_SHARED`.
- Si es complejo, usa `ALPHA_COMPLEX`.
- Usa locks para evitar carreras.
- Usa prioridad de casillero.

### 6.3 `fn_migrate_to_complex`

Migra pedido simple a complejo cuando sube a 2+ bolsas.

Hace:

- libera/asienta asignacion vieja;
- asigna letra;
- actualiza contadores;
- conserva historial.

### 6.4 `fn_downgrade_to_simple`

Permite bajar de complejo a simple cuando un pedido se corrige a 1 bolsa.

Uso:

- correcciones de operador.

### 6.5 `fn_release_container`

Libera casillero cuando el pedido se entrega, cancela o elimina.

Hace:

- marca asignacion como liberada;
- registra `released_by`, `released_at`, `release_reason`;
- recalcula estado.

### 6.6 `fn_upsert_customer`

Puente legacy para crear/encontrar cliente logistico por `firebase_id`.

Uso actual:

- `syncPedidoLabel` lo llama antes de sincronizar pedido logistico.

### 6.7 `fn_upsert_order_and_assign`

Funcion clave para el puente `pedidos` -> sistema logistico.

Hace:

- crea o actualiza orden logistica;
- decide si es simple/compleja;
- asigna, migra o downgradea;
- devuelve etiqueta.

### 6.8 `fn_release_order_by_firebase_id`

Libera una orden logistica usando el id del pedido operativo/legacy.

Uso:

- `releasePedidoLabel`.

## 7. Endpoints involucrados

### 7.1 Clientes

| Endpoint | Funcion |
|---|---|
| `GET /api/clientes` | Lista clientes activos del usuario. |
| `POST /api/clientes` | Crea cliente. |
| `PATCH /api/clientes/:id` | Actualiza cliente. |
| `DELETE /api/clientes/:id` | Desactiva cliente. |

### 7.2 Pagos

| Endpoint | Funcion |
|---|---|
| `GET /api/pagos-lista` | Lista pagos. |
| `POST /api/pagos` | Registra pago. |
| `PATCH /api/pagos/:id` | Edita pago. |
| `DELETE /api/pagos/:id` | Elimina pago. |

### 7.3 Pedidos internos

| Endpoint | Funcion |
|---|---|
| `GET /api/pedidos` | Lista pedidos. |
| `POST /api/pedidos` | Crea pedido interno. |
| `PATCH /api/pedidos/:id` | Actualiza estado/prendas/bolsas/label. |
| `DELETE /api/pedidos/:id` | Elimina pedido. |

### 7.4 Casilleros y etiquetas

| Endpoint | Funcion |
|---|---|
| `POST /api/orders` | Crea orden logistica y asigna casillero. |
| `POST /api/orders/:id/update-bags` | Actualiza bolsas y puede migrar a letra. |
| `POST /api/orders/:id/deliver` | Entrega/libera casillero. |
| `GET /api/storage/containers` | Panel de casilleros. |
| `GET /api/orders/:id/allocation-history` | Historial de asignacion. |
| `GET /api/storage/config` | Configuracion de capacidad numerica. |
| `PATCH /api/storage/config/numeric-capacity` | Cambia capacidad numerica. |

### 7.5 Identidad

| Endpoint | Funcion |
|---|---|
| `GET /api/identity/profiles` | Lista perfiles globales. |
| `GET /api/identity/profiles/:id` | Perfil con evidencia. |
| `POST /api/identity/profiles` | Crear/encontrar perfil. |
| `PATCH /api/identity/profiles/:id` | Editar perfil. |
| `POST /api/identity/sync-store` | Backfill tienda. |
| `POST /api/identity/sync-whatsapp` | Backfill WhatsApp. |
| `POST /api/identity/sync-pagos` | Backfill pagos. |
| `POST /api/identity/recalculate-confidence` | Recalcula confianza. |
| `POST /api/identity/profiles/:id/merge` | Fusiona perfiles. |

## 8. Flujo ideal recomendado

### 8.1 Entrada desde pago manual

```text
Operador registra pago
  -> crear/encontrar customer
  -> insertar pago
  -> depositar evidencia identidad
  -> crear pedido `procesar`
  -> Mesa de Preparacion
  -> casillero al marcar listo
```

Este flujo ya existe y debe mantenerse como base manual.

### 8.2 Entrada desde tienda

```text
Orden tienda pagada/verificada
  -> perfil tienda
  -> identidad global
  -> customer interno si corresponde
  -> pedido `procesar` con source WEB
  -> operador confirma bolsas/prendas
  -> casillero
```

Recomendacion:

- No asignar etiqueta `WEB-{id}` como etiqueta fisica final.
- Usar ese valor solo como referencia visual temporal si hace falta.
- La etiqueta fisica debe venir de `syncPedidoLabel`.

### 8.3 Entrada desde WhatsApp

```text
Chat WhatsApp
  -> identidad por telefono
  -> propuesta IA
  -> operador revisa
  -> clienta confirma
  -> pago verificado/manual
  -> pedido `procesar` con source WHATSAPP/LIVE
  -> Mesa de Preparacion
  -> casillero
```

### 8.4 Preparacion

Regla:

- La Mesa de Preparacion es la frontera entre lo digital y lo fisico.

Antes de Mesa:

- se puede saber que la clienta compro o eligio prendas.

Despues de Mesa:

- se sabe cuantas prendas y bolsas hay realmente.

Por eso el casillero debe asignarse despues de Mesa.

### 8.5 Entrega

Al entregar:

- `pedidos.status = 'entregado'`;
- se libera casillero;
- se conserva historial;
- se actualiza UI;
- el cliente ya no debe aparecer como pendiente si no tiene otros pedidos activos.

## 9. Perfil interno vs perfil de clienta

### 9.1 Perfil interno del operador

Debe mostrar:

- pagos;
- pedidos;
- WhatsApp;
- notas;
- estado operativo;
- etiqueta activa;
- historial de entregas;
- fotos/evidencia cuando venga de WhatsApp o tienda.

### 9.2 Perfil visible de clienta

Debe mostrar:

- pedidos de tienda;
- pedidos por WhatsApp/Live;
- estado de pago;
- estado de preparacion;
- pedido listo;
- entrega;
- prendas confirmadas;
- historial.

### 9.3 Vinculo entre ambos

El vinculo recomendado:

```text
identity_profiles
  -> cliente_id -> customers.id
  -> store_phone -> store_customers.whatsapp
  -> panel_phone -> panel_clientes.phone
```

Esto permite que una clienta tenga una sola identidad aunque entre por varios canales.

## 10. Que ya existe, que falta conectar y que falta implementar

### 10.1 Ya existe

- Clientes internos.
- Registro manual de pagos.
- Creacion automatica de pedido `procesar` desde pago manual.
- Perfil de cliente.
- Mesa de Preparacion.
- Conteo de prendas y bolsas.
- Estados `procesar`, `listo`, `entregado`.
- Sistema de casilleros con PostgreSQL.
- Asignacion automatica por backend.
- Migracion simple -> complejo.
- Liberacion al entregar.
- Historial de asignaciones.
- Identidad global.
- Evidencia de identidad.
- Backfills de tienda/WhatsApp/pagos.

### 10.2 Esta parcialmente conectado

- Tienda -> customer interno.
- Tienda -> identity_profiles.
- Tienda -> pedido interno.
- WhatsApp -> customer interno.
- WhatsApp -> pedido interno.
- Pagos MacroDroid -> pedido correcto de tienda/WhatsApp.
- Perfil visible de clienta -> estado interno.
- Evidencia -> perfil operativo.
- Pedido interno -> detalle estructurado de prendas de tienda/WhatsApp.

### 10.3 Falta implementar o normalizar

- Politica unica de telefono: `phone`, `wa_number`, `whatsapp_number`, `panel_phone`, `store_phone`.
- Politica de nombres faltantes.
- `source` canonico para pedidos.
- Estados canonicos por canal antes de entrar a `pedidos`.
- Detalle estructurado de prendas para pedidos que vienen de tienda/WhatsApp.
- Vista unica de perfil visible de clienta.
- Reglas claras para crear `customers` cuando solo hay telefono.
- Pruebas de concurrencia de casilleros.
- Auditoria completa de quien verifico manualmente.

## 11. Riesgos tecnicos actuales

### 11.1 Dos tablas de pedido con responsabilidades distintas

Riesgo:

- `pedidos` y `orders` pueden confundirse.

Mitigacion:

- `pedidos` = operacion/UI.
- `orders` = logistica/casilleros.
- Nunca escribir directamente en `orders` desde tienda/WhatsApp; usar servicios/RPC.

### 11.2 Etiquetas temporales mezcladas con etiquetas fisicas

Riesgo:

- `WEB-{id}` puede confundirse con casillero real.

Mitigacion:

- Usar campo de referencia separado o dejar claro que `label_type: WEB` no es casillero.
- La etiqueta real debe ser numero/letra asignado por backend.

### 11.3 Casillero asignado antes de contar bolsas

Riesgo:

- Ocupa casillero incorrecto.
- Puede migrar innecesariamente.

Mitigacion:

- Solo asignar al marcar listo en Mesa.

### 11.4 Identidades duplicadas

Riesgo:

- Una misma clienta puede tener varios registros.

Mitigacion:

- Telefono normalizado.
- `identity_profiles`.
- `identity_evidence`.
- Herramienta de merge.

### 11.5 Nombres inventados

Riesgo:

- Rompe pagos, matching y confianza.

Mitigacion:

- No crear nombres de pagador inventados.
- Permitir perfiles parciales por telefono.
- Revision manual.

### 11.6 Funciones legacy Firebase

Riesgo:

- Aun hay referencias de compatibilidad y nombres como `firebase_id`.

Mitigacion:

- Mantener por compatibilidad, pero nuevos flujos deben pasar por APIs directas y contratos claros.

### 11.7 RLS pendiente

Riesgo:

- El servidor filtra por `x-user-id`, pero RLS no esta completo.

Mitigacion:

- Endurecer RLS antes de produccion multiusuario.

## 12. Checklist de pruebas manuales

### 12.1 Pago manual

- Crear cliente nuevo.
- Registrar pago.
- Confirmar que se crea `pagos`.
- Confirmar que se crea `pedidos` en `procesar`.
- Confirmar que aparece en perfil.
- Confirmar que no tiene casillero aun.

### 12.2 Preparacion simple

- Abrir pedido `procesar`.
- Contar prendas.
- Registrar 1 bolsa.
- Marcar listo.
- Confirmar `pedidos.status = listo`.
- Confirmar etiqueta numerica.
- Confirmar `customers.active_label`.

### 12.3 Preparacion compleja

- Abrir pedido `procesar`.
- Registrar 2+ bolsas.
- Marcar listo.
- Confirmar etiqueta alfabetica.
- Confirmar asignacion exclusiva.

### 12.4 Migracion simple a compleja

- Preparar pedido con 1 bolsa.
- Editar a 2 bolsas.
- Confirmar migracion numerico -> letra.
- Confirmar historial de asignacion.

### 12.5 Downgrade complejo a simple

- Preparar pedido con 2 bolsas.
- Corregir a 1 bolsa.
- Confirmar liberacion de letra.
- Confirmar asignacion numerica.

### 12.6 Entrega

- Marcar pedido listo como entregado.
- Confirmar `pedidos.status = entregado`.
- Confirmar `container_allocations.status = RELEASED`.
- Confirmar casillero disponible/parcial correcto.
- Confirmar que cliente ya no aparece pendiente si no tiene otros pedidos.

### 12.7 Tienda a preparacion

- Verificar pago de tienda.
- Confirmar creacion de `pedidos` con `source: WEB`.
- Confirmar que el operador puede revisar items web.
- Confirmar que casillero se asigna solo al marcar listo.

### 12.8 WhatsApp a preparacion

- Confirmar propuesta de WhatsApp.
- Verificar pago.
- Crear pedido interno con `source: WHATSAPP` o `LIVE`.
- Confirmar prendas/bolsas.
- Confirmar casillero.

### 12.9 Identidad

- Crear cliente por pago manual.
- Recibir WhatsApp del mismo telefono.
- Crear orden de tienda con el mismo telefono.
- Confirmar que `identity_profiles` une los canales.
- Confirmar que `identity_evidence` conserva fuentes.

## 13. Recomendacion de implementacion por prioridad

### Prioridad 1 - Contrato de estados internos

- Mantener `pedidos`: `procesar`, `listo`, `entregado`.
- Documentar equivalencias desde tienda/WhatsApp.
- Evitar estados mezclados en `pedidos`.

### Prioridad 2 - Contrato de origen

- Usar `source` en `pedidos`.
- Valores recomendados: `MANUAL`, `MACRODROID`, `WEB`, `WHATSAPP`, `LIVE`.
- Guardar detalle del origen en JSON separado cuando corresponda.

### Prioridad 3 - Perfil global

- Usar `identity_profiles` como puente central.
- Depositar evidencia por cada evento importante.
- Resolver duplicados con merge.

### Prioridad 4 - Preparacion como frontera fisica

- No asignar casillero antes de Mesa.
- Toda automatizacion externa debe terminar en `procesar`.
- El operador confirma bolsas/prendas.

### Prioridad 5 - Etiquetas limpias

- Separar referencia de pedido externo de etiqueta fisica.
- `label` debe representar casillero real cuando `label_type` sea numero/letra.
- Evitar usar etiquetas tipo `WEB-123` como si fueran casilleros.

### Prioridad 6 - Perfil de clienta

- Mostrar estados internos de forma simple.
- No exponer detalles tecnicos de casilleros si no hace falta.
- Mostrar: recibido, pago verificado, preparando, listo, entregado.

### Prioridad 7 - Pruebas de casilleros

- Probar concurrencia.
- Probar migracion.
- Probar entrega.
- Probar historial.
- Probar capacidad numerica configurable.

## 14. Conclusion

El sistema interno de Ventas Live ya tiene una base solida. La parte mas valiosa es que la logica de casilleros esta en PostgreSQL y no depende del frontend. Eso protege la operacion fisica.

La recomendacion principal es mantener una frontera clara:

- tienda y WhatsApp pueden automatizar perfil, pago, confirmacion y creacion de pedido;
- la Mesa de Preparacion confirma la realidad fisica;
- el backend asigna casillero solo despues de esa confirmacion;
- la entrega libera casillero y conserva historial.

Con esta separacion, la app puede volverse autonoma sin perder control operativo.
