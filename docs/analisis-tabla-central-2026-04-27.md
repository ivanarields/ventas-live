# Análisis: Tabla central y arquitectura correcta
**Fecha:** 2026-04-27

---

## La respuesta directa

**La tabla central es `customers`.**

No `identity_profiles`. No `panel_clientes`. `customers`.

---

## Por qué `customers` es el centro

El panel de pagos (la pantalla principal de la app) ya funciona completo sobre `customers`:

| Funcionalidad | Estado |
|---|---|
| Perfiles de clientes | ✅ `customers` |
| Historial de pagos | ✅ `pagos` (vinculado a customers) |
| Pedidos en proceso | ✅ `pedidos` (vinculado a customers) |
| Sistema de casilleros | ✅ `storage_containers` + `container_allocations` |
| Etiquetas 1-4 / A-D | ✅ Asignación automática |

Todo esto ya existe y funciona. No falta nada operativo.

---

## Qué le falta a `customers` para estar completo

Solo dos cosas:

| Dato faltante | Dónde está | Campo que hay que llenar |
|---|---|---|
| Número de WhatsApp | `panel_clientes.phone` | `customers.wa_number` |
| Fotos de las prendas | `panel_mensajes.media_url` | (se accede con el número ya vinculado) |

---

## Qué tiene el panel de WhatsApp que le falta a `customers`

El panel de WhatsApp (`panel_clientes` + `panel_mensajes`) tiene:
- El número de teléfono del cliente — **siempre, desde el primer mensaje**
- Las fotos de las prendas que mandó
- El comprobante de pago
- El historial de conversación

El panel de WhatsApp NO tiene:
- El sistema de casilleros
- Los pagos registrados
- El estado del pedido (procesar / listo / entregado)

---

## La arquitectura correcta — simple

```
panel_clientes.phone
panel_mensajes.media_url
        │
        │  (cuando llega comprobante)
        ▼
customers.wa_number  ← UN SOLO CAMPO que faltaba
        │
        ▼
Perfil completo del cliente en la app:
  - Nombre
  - Pagos
  - Pedidos
  - Casillero asignado
  - Número WhatsApp     ← ahora completo
  - Fotos de prendas    ← se muestran usando el número
```

---

## Cuál es el trabajo real del Sistema Pulpo en esta arquitectura

**Un solo trabajo:** cuando llega un comprobante de WhatsApp con un nombre, encontrar al cliente con ese nombre en `customers` y escribir el teléfono en `customers.wa_number`.

Eso es todo. La función `fn_link_customer_wa` ya hace exactamente eso. Ya existe.

```sql
-- Lo que hace fn_link_customer_wa:
UPDATE customers
SET wa_number = '59172698959', wa_linked_at = now()
WHERE canonical_name = 'IVAN ARIEL DIAZ SANCHEZ'
  AND user_id = '...'
  AND (wa_number IS NULL OR wa_number = '');
```

No necesita Pulpo complejo. No necesita `identity_profiles`. Solo este vínculo directo.

---

## Qué pasa después de llenar `customers.wa_number`

El perfil del cliente en la app ya tiene el teléfono. Con ese teléfono:

1. El componente `WhatsappPhotos` (ya existe y está completo) busca las fotos del cliente en `panel_mensajes` por teléfono
2. Las muestra en el perfil como carrusel
3. El operador ve las prendas que mandó el cliente sin salir del perfil

**Este componente ya existe en `src/components/WhatsappPhotos.tsx` — solo falta colocarlo en el perfil del cliente.**

---

## Prioridad de tablas — de más a menos importante

### CRÍTICAS (sin estas la app no funciona)
1. `customers` — el perfil central
2. `pedidos` — el flujo operativo diario
3. `pagos` — el registro de cobros
4. `storage_containers` + `container_allocations` — los casilleros físicos
5. `panel_clientes` + `panel_mensajes` — la fuente de fotos y teléfonos

### IMPORTANTES (mejoran la app pero no la bloquean)
6. `raw_notification_events` + `parsed_payment_candidates` — pipeline MacroDroid
7. `ai_config` + `ai_prompts` — configuración del OCR de comprobantes
8. `transactions` + `categories` — finanzas
9. `learned_text_patterns` — mejora el reconocimiento de bancos

### SECUNDARIAS (solo para administración / auditoría)
10. `identity_profiles` + `identity_evidence` — Panel de Identidad (Pulpo)
11. `manual_review_queue` — revisión de pagos sin nombre
12. `live_sessions` + `ideas` — herramientas de marketing

### ELIMINAR (no aportan valor)
13. `orders` + `order_bags` — reemplazadas por `pedidos`
14. `giveaways` — sin uso activo
15. `customers.whatsapp_number` — campo duplicado de `wa_number`

---

## Los dos pasos concretos que faltan

### Paso 1 — Llenar `customers.wa_number` automáticamente
Cuando llega un comprobante y se extrae el nombre, llamar a `fn_link_customer_wa` con ese nombre y el teléfono de `panel_clientes.phone`. Esto ya existe en el código pero fue desconectado cuando se implementó Pulpo.

**Archivo a modificar:** `src/routes/ai-gateway.ts` → función `summarize-conversation`  
**Tiempo estimado:** 10 minutos

### Paso 2 — Mostrar fotos en el perfil del cliente
Agregar el componente `WhatsappPhotos` en el perfil del cliente, pasándole `customers.wa_number`.

**Archivo a modificar:** `src/App.tsx` → sección del perfil del cliente  
**Componente listo:** `src/components/WhatsappPhotos.tsx`  
**Tiempo estimado:** 15 minutos

---

## Conclusión

El panel de pagos es el sistema correcto y ya está completo operativamente. WhatsApp es un canal de entrada que alimenta dos datos que le faltan: el teléfono y las fotos. El Sistema Pulpo en su versión simplificada hace una sola cosa: conectar el nombre del comprobante con el cliente en `customers` y escribir el teléfono. Todo lo demás ya existe.
