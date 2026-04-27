# Auditoría completa de tablas — Ventas Live
**Fecha:** 2026-04-27  
**Total tablas activas:** 27 | **Abandonadas:** 3 | **Migraciones:** 32

---

## PROBLEMA CENTRAL: Los campos de teléfono

La misma información (el número de teléfono de una persona) está guardada en **10 campos distintos** con nombres distintos en tablas distintas:

| Campo | Tabla | Base de datos | Tiene datos | Quién lo escribe |
|---|---|---|---|---|
| `phone` | `customers` | Principal | Parcial | Manual / App |
| `wa_number` | `customers` | Principal | Casi vacío | fn_link_customer_wa (cuando hay match de nombre) |
| `whatsapp_number` | `customers` | Principal | Vacío | Nadie (migración vieja, obsoleto) |
| `phone` | `panel_clientes` | Panel WA | ✅ Completo | Webhook WhatsApp (siempre) |
| `phone` | `identity_profiles` | Principal | Parcial | Pulpo (normalizado con +591) |
| `panel_phone` | `identity_profiles` | Principal | Parcial | ai-gateway / sync-whatsapp |
| `store_phone` | `identity_profiles` | Principal | Parcial | sync-store |
| `phone` | `identity_evidence` | Principal | Parcial | Cada evento que tiene teléfono |
| `customer_wa` | `store_orders` | Principal | Parcial | Tienda online |
| `customer_phone` | `store_orders` | Principal | Vacío | Nadie (creado pero no usado) |
| `whatsapp` | `store_customers` | Panel | Parcial | Registro en tienda |

**Diagnóstico:** No hay un campo único y autoritativo para el teléfono de un cliente. Cada sistema creó el suyo.

---

## BASE DE DATOS PRINCIPAL (vhczofpmxzbqzboysoca)

---

### 1. SISTEMA DE CASILLEROS

#### `storage_containers` — Casilleros físicos
**Estado:** ACTIVA | **Pulpo:** No lee aquí

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `container_code` | TEXT | Etiqueta visible (1, 2, 3, 4, A, B, C, D) |
| `container_type` | TEXT | NUMERIC_SHARED o ALPHA_COMPLEX |
| `max_simple_orders` | INT | Cuántos pedidos caben |
| `state` | TEXT | available / occupied / full |

**Quién escribe:** Migración inicial (seed). La app solo lee.  
**Quién lee:** `fn_assign_container`, `fn_release_container`, endpoint `/api/storage/containers`

---

#### `container_allocations` — Asignaciones casillero ↔ pedido
**Estado:** ACTIVA | **Pulpo:** No lee aquí

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `container_id` | UUID | FK → storage_containers |
| `order_id` | UUID | FK → orders (sistema viejo) |
| `status` | TEXT | ACTIVE / RELEASED / MIGRATED |
| `assigned_at` | TIMESTAMPTZ | Cuándo se asignó |
| `released_at` | TIMESTAMPTZ | Cuándo se liberó |

**Quién escribe:** `fn_assign_container`, `fn_release_container`  
**Quién lee:** `/api/orders/:id/allocation-history`

---

### 2. SISTEMA DE PEDIDOS

#### `pedidos` — Pedidos activos de la app
**Estado:** ACTIVA ⭐ (tabla central del flujo operativo) | **Pulpo:** Lee estado

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `customer_id` | TEXT | ID del cliente en `customers` |
| `customer_name` | TEXT | Nombre del cliente |
| `item_count` | INT | Cantidad de prendas |
| `bag_count` | INT | Cantidad de bolsas |
| `label` | TEXT | Etiqueta del casillero (1-4 o A-D) |
| `label_type` | TEXT | NUMERIC_SHARED o ALPHA_COMPLEX |
| `status` | TEXT | procesar / listo / entregado |
| `total_amount` | NUMERIC | Monto del pedido |
| `date` | TIMESTAMPTZ | Fecha del pedido |
| `source` | TEXT | WEB / MANUAL |
| `user_id` | TEXT | FK → usuario de la app |

**Quién escribe:** `/api/pedidos`, `ingest-notification` (crea pedido automático al detectar pago)  
**Quién lee:** App principal (pantalla Mesa de Preparación)

---

#### `orders` + `order_bags` — Sistema de pedidos VIEJO
**Estado:** ⚠️ ABANDONADA

Estas tablas fueron reemplazadas por `pedidos`. Siguen en la base de datos pero ningún flujo activo las escribe ni las lee.

---

### 3. SISTEMA DE PAGOS

#### `pagos` — Pagos registrados
**Estado:** ACTIVA ⭐ | **Pulpo:** ✅ Lee nombre, monto, método, fecha

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `nombre` | TEXT | Nombre del pagador |
| `pago` | NUMERIC | Monto |
| `date` | TIMESTAMPTZ | Fecha del pago |
| `method` | TEXT | "Notificación bancaria" (MacroDroid) / "Efectivo" / etc |
| `status` | TEXT | pending / confirmed |
| `customer_id` | TEXT | FK opcional → customers |
| `user_id` | TEXT | FK → usuario de la app |

**Quién escribe:** `/api/pagos` (manual), `ingest-notification` (automático MacroDroid)  
**Quién lee:** App principal (lista de pagos), Pulpo (`sync-pagos`)

---

#### `raw_notification_events` — Notificaciones crudas de MacroDroid
**Estado:** ACTIVA (auditoría) | **Pulpo:** No lee

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `app_package` | TEXT | com.yape.app / com.bcp.bank / etc |
| `title` | TEXT | Título de la notificación |
| `text` | TEXT | Texto corto |
| `big_text` | TEXT | Texto completo |
| `raw_hash` | TEXT | SHA-256 (evita duplicados) |
| `ingest_status` | TEXT | received / auto_processed / pending_review / duplicate_skipped |

**Quién escribe:** `ingest-notification` (edge function)  
**Quién lee:** Nadie en la app (solo auditoría / debug)

---

#### `parsed_payment_candidates` — Resultado del parseo
**Estado:** ACTIVA (pipeline interno) | **Pulpo:** No lee

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `raw_event_id` | UUID | FK → raw_notification_events |
| `amount` | NUMERIC | Monto extraído |
| `payer_name_raw` | TEXT | Nombre sin normalizar |
| `payer_name_canonical` | TEXT | Nombre normalizado en MAYÚSCULAS |
| `confidence_score` | NUMERIC | Confianza del parseo (0-1) |
| `needs_review` | BOOLEAN | Si necesita revisión manual |
| `parse_status` | TEXT | parsed_ok / pending_review |

**Quién escribe:** `ingest-notification`  
**Quién lee:** `ingest-notification` para crear `pagos`

---

#### `manual_review_queue` — Cola de pagos sin nombre
**Estado:** ACTIVA | **Pulpo:** No lee

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `parsed_candidate_id` | UUID | FK → parsed_payment_candidates |
| `reason_code` | TEXT | missing_amount / missing_payer |
| `review_status` | TEXT | pending / resolved |

**Quién escribe:** `ingest-notification` cuando no puede extraer nombre/monto  
**Quién lee:** Scripts de rescate (`scripts/rescue-with-gemini.mjs`)

---

#### `learned_text_patterns` — Patrones aprendidos por banco
**Estado:** ACTIVA | **Pulpo:** No lee

| Campo | Tipo | Descripción |
|---|---|---|
| `app_package` | TEXT | Identificador del banco/app |
| `before_marker` | TEXT | Texto que aparece ANTES del nombre |
| `after_marker` | TEXT | Texto que aparece DESPUÉS del nombre |
| `success_count` | INT | Cuántas veces funcionó este patrón |

**Quién escribe:** `ingest-notification` (auto-aprendizaje)  
**Quién lee:** `ingest-notification` (mejora extracciones futuras)

---

### 4. SISTEMA DE IDENTIDAD — PULPO

#### `identity_profiles` — Perfiles unificados
**Estado:** ACTIVA ⭐ (sistema Pulpo) | **Pulpo:** ES el centro

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | TEXT | FK → usuario de la app |
| `display_name` | TEXT | Nombre del cliente (autoritativo) |
| `phone` | TEXT | Teléfono normalizado (+591...) |
| `cliente_id` | BIGINT | FK → customers (app principal) |
| `store_phone` | TEXT | Teléfono registrado en tienda |
| `panel_phone` | TEXT | Teléfono en panel WhatsApp |
| `confidence` | NUMERIC | 0.3 a 0.97 (qué tan seguro es el match) |
| `merged_from` | UUID[] | IDs de perfiles absorbidos |
| `origin` | TEXT | auto / manual |

**Quién escribe:** `ingest-notification`, `ingest-whatsapp`, `ai-gateway`, `identity.ts`  
**Quién lee:** Panel de Identidad (IdentityPanel.tsx), WhatsappPhotos endpoint

---

#### `identity_evidence` — Historial de eventos por perfil
**Estado:** ACTIVA ⭐ | **Pulpo:** ES la fuente de confianza

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `profile_id` | UUID | FK → identity_profiles |
| `source` | TEXT | manual_payment / macrodroid / whatsapp / store_order |
| `event_type` | TEXT | payment / contact / order / comprobante_pago |
| `amount` | NUMERIC | Monto si aplica |
| `phone` | TEXT | Teléfono del evento |
| `name_raw` | TEXT | Nombre como apareció en el evento |
| `name_normalized` | TEXT | Nombre normalizado |
| `event_at` | TIMESTAMPTZ | Cuándo ocurrió |

**Quién escribe:** Todos los ingestos + ai-gateway  
**Quién lee:** Panel de Identidad, cálculo de confidence

---

### 5. SISTEMA DE CLIENTES (app principal)

#### `customers` — Clientes de la app
**Estado:** ACTIVA ⭐ | **Pulpo:** ✅ Lee id, phone, wa_number para vincular

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | BIGINT | PK |
| `full_name` | TEXT | Nombre completo |
| `canonical_name` | TEXT | Nombre normalizado (mayúsculas, sin tildes) |
| `phone` | TEXT | Teléfono (cualquier formato) |
| `wa_number` | TEXT | Número WhatsApp (se llena con fn_link_customer_wa) |
| `whatsapp_number` | TEXT | ⚠️ OBSOLETO — no se usa |
| `is_active` | BOOLEAN | Si el cliente está activo |
| `total_payments` | INT | Conteo de pagos |
| `total_spent` | NUMERIC | Total gastado |

**Quién escribe:** `/api/clientes`, `fn_link_customer_wa` (wa_number)  
**Quién lee:** App principal (todos los perfiles), Pulpo (`fn_link_customer_wa`)

---

### 6. CONFIGURACIÓN IA

#### `ai_config` — Claves y configuración por usuario
**Estado:** ACTIVA | **Pulpo:** Lee `owner_name` para prompts

| Campo | Tipo | Descripción |
|---|---|---|
| `user_id` | TEXT | PK |
| `primary_key_encrypted` | TEXT | Clave Gemini principal |
| `fallback_key_encrypted` | TEXT | Clave fallback 1 |
| `key3/4/5_encrypted` | TEXT | Claves adicionales |
| `owner_name` | TEXT | Nombre de la dueña del negocio (para prompts) |

---

#### `ai_prompts` — Prompts editables
**Estado:** ACTIVA | **Pulpo:** Lee `comprobante_mode`

| Campo | Tipo | Descripción |
|---|---|---|
| `user_id` | TEXT | PK compuesto |
| `prompt_key` | TEXT | Identificador (comprobante_mode, etc) |
| `prompt_text` | TEXT | Contenido del prompt |

---

### 7. FINANZAS / TRANSACCIONES

#### `transactions` — Ingresos y gastos
**Estado:** ACTIVA | **Pulpo:** No lee

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `type` | TEXT | income / expense |
| `amount` | NUMERIC | Monto |
| `category` | TEXT | Categoría |
| `description` | TEXT | Descripción |
| `fecha` | TIMESTAMPTZ | Fecha |
| `user_id` | TEXT | FK → usuario |

---

#### `categories` — Categorías de transacciones
**Estado:** ACTIVA | **Pulpo:** No lee

---

### 8. MARKETING

#### `live_sessions` — Sesiones en vivo (TikTok/Instagram)
**Estado:** ACTIVA | **Pulpo:** No lee

#### `giveaways` — Sorteos
**Estado:** ⚠️ ABANDONADA — sin flujo activo

#### `ideas` — Notas
**Estado:** ACTIVA | **Pulpo:** No lee

---

## BASE DE DATOS PANEL (vwaocoaeenavxkcshyuf)

---

### 9. PANEL DE WHATSAPP

#### `panel_clientes` — Contactos de WhatsApp
**Estado:** ACTIVA ⭐ | **Pulpo:** ✅ Lee phone, nombre (sync-whatsapp)

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `phone` | TEXT | Número WhatsApp (ej: 59172698959) ← **FUENTE AUTORITATIVA del teléfono WA** |
| `nombre` | TEXT | Nombre (se llena cuando llega comprobante) |
| `last_interaction` | TIMESTAMPTZ | Última actividad |
| `resumen` | JSONB | Resumen IA (pedido, pago, comprobante) |
| `resumen_at` | TIMESTAMPTZ | Cuándo se generó el resumen |
| `estado` | TEXT | pagado_verificado / solo_comprobante / nuevo |

**Quién escribe:** `ingest-whatsapp` (webhook), `ai-gateway` (resumen + estado + nombre)  
**Quién lee:** `PanelPedidos.tsx`, `ai-gateway`

---

#### `panel_mensajes` — Mensajes individuales de WhatsApp
**Estado:** ACTIVA ⭐ | **Pulpo:** No lee directamente

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | PK |
| `cliente_id` | UUID | FK → panel_clientes |
| `direction` | TEXT | in (del cliente) / out (de la tienda) |
| `content` | TEXT | Texto del mensaje |
| `has_media` | BOOLEAN | Si tiene imagen/archivo |
| `media_url` | TEXT | URL de la imagen guardada en Storage |
| `media_type` | TEXT | image/jpeg / etc |
| `created_at` | TIMESTAMPTZ | Cuándo llegó |

**Quién escribe:** `ingest-whatsapp`  
**Quién lee:** `PanelPedidos.tsx` (muestra conversación), `ai-gateway` (analiza imágenes)

---

#### `panel_raw_webhooks` — Log crudo de webhooks
**Estado:** ACTIVA (auditoría) | **Pulpo:** No lee

---

## LO QUE HACE EL SISTEMA PULPO CON CADA TABLA

| Tabla | Lo que Pulpo toma | Cómo llega a Pulpo |
|---|---|---|
| `pagos` | nombre, monto, método, fecha, customer_id | Botón "Sincronizar Pagos" (manual) o automático si `ingest-notification` lo dispara |
| `panel_clientes` | phone, nombre | Botón "Sincronizar WhatsApp" (manual) o automático al procesar comprobante |
| `store_orders` | customer_name, customer_wa, total | Botón "Sincronizar Tienda" (manual) |
| `customers` | id, phone, wa_number | `fn_link_customer_wa` (cuando hay match de nombre) |
| `identity_profiles` | TODO — ES la tabla central de Pulpo | Pulpo escribe y lee aquí |
| `identity_evidence` | TODO — historial de eventos | Pulpo escribe y lee aquí |

---

## RESUMEN EJECUTIVO

### El problema real

No hay un campo único para el teléfono. Hay **10 campos distintos** en **8 tablas distintas**. Ninguno es autoritativo para todos los sistemas.

### La fuente más confiable de teléfono es

`panel_clientes.phone` — llega del webhook de WhatsApp, siempre existe para clientes de WA, nunca está vacío.

### Tablas que se pueden eliminar

| Tabla | Motivo |
|---|---|
| `orders` | Reemplazada por `pedidos` |
| `order_bags` | Reemplazada por `pedidos` |
| `giveaways` | Sin flujo activo |
| `customers.whatsapp_number` | Campo duplicado de `wa_number`, nunca se usa |

### Propuesta de simplificación (sin rediseño total)

1. Declarar `panel_clientes.phone` como la fuente oficial del número WhatsApp
2. Cuando llega un comprobante: copiar ese teléfono a `customers.wa_number` (un solo campo, directo)
3. El perfil del cliente lee `customers.wa_number` y muestra las fotos
4. Pulpo continúa como sistema de auditoría/identidad en segundo plano
