# Informe tecnico - Datos y eventos para automatizacion

## 1. Objetivo del documento

Este informe define el mapa de datos y eventos que necesita la aplicacion para avanzar hacia una automatizacion robusta sin perder control operativo. Los informes anteriores explican los flujos principales por area:

- Tienda online.
- WhatsApp y ventas live.
- Perfiles internos, preparacion y casilleros.
- Reporte tecnico completo.

Este documento funciona como una capa transversal: describe que informacion entra, de donde viene, donde debe guardarse, que validaciones son obligatorias, que accion debe disparar y cuando el flujo debe pasar a revision manual.

La meta no es cambiar la aplicacion ahora. La meta es dejar claro el contrato tecnico para que cada futura automatizacion sea predecible, auditable y reversible.

## 2. Principios para automatizar sin romper el negocio

### 2.1 No inventar datos criticos

El sistema no debe inventar:

- Nombre de pagador.
- Nombre de clienta.
- Telefono.
- Monto pagado.
- Prendas elegidas.
- Confirmacion de pedido.
- Estado fisico de bolsas o casillero.

Si el dato no existe con evidencia suficiente, el sistema debe crear una tarea de revision manual. Esto es especialmente critico en pagos bancarios y conversaciones de WhatsApp.

### 2.2 Toda automatizacion debe tener evidencia

Cada accion automatica debe poder responder:

- Que evento la disparo.
- Cual fue la fuente.
- Cual fue el payload original.
- Que datos fueron extraidos.
- Que regla o modelo tomo la decision.
- Que nivel de confianza tuvo.
- Que registro final se creo o modifico.

Sin esta evidencia, el operador no podra corregir errores ni reconstruir un caso.

### 2.3 Manual no significa fuera del sistema

La revision manual debe ser parte formal del flujo. No debe ser un parche externo. Si un pago, pedido, mensaje o identidad no puede resolverse de forma segura, debe entrar a una cola con motivo, evidencia y accion esperada.

### 2.4 Separar el mundo digital del mundo fisico

La tienda, WhatsApp y pagos son eventos digitales. Los casilleros son operaciones fisicas. Por eso:

- El sistema puede crear pedidos internos automaticamente.
- El sistema puede preparar una propuesta de pedido.
- El operador debe confirmar el procesamiento fisico antes de asignar o cerrar casillero.
- El backend debe seguir siendo el unico responsable de asignar etiquetas y casilleros.

### 2.5 Una sola verdad por dominio

La automatizacion se complica cuando varias tablas intentan representar lo mismo. El sistema debe tener una fuente principal por dominio:

| Dominio | Fuente principal recomendada | Observacion |
|---|---|---|
| Cliente operativo | `customers` / `clientes` segun modulo actual | Debe unificarse mediante identidad |
| Perfil digital de tienda | `store_customers` / perfil de tienda | Debe vincularse a identidad global |
| Pedido de tienda | `store_orders` | Flujo comercial online |
| Pago detectado | `payment_events` o pipeline actual de notificaciones | Debe conservar evento original |
| Pago operativo | `pagos` | Impacta flujo principal existente |
| Pedido interno | `pedidos` y/o `orders` | Depende del modulo operativo/casillero |
| Casillero | `storage_containers`, `container_allocations` | Solo backend |
| WhatsApp entrante | tablas del panel/bridge | Debe conservar mensaje y media |
| WhatsApp saliente | `whatsapp_message_queue` | Debe evitar duplicados |
| Revision manual | `manual_review_queue` | Cola formal de excepciones |

## 3. Mapa de fuentes de datos

### 3.1 Tienda online

Fuente:

- Catalogo de productos.
- Carrito.
- Checkout.
- Formulario de datos de clienta.
- Comprobante enviado por la clienta.
- Estado de pago.

Tablas relacionadas:

- `products`.
- `store_orders`.
- `store_customers`.
- `payment_events`.
- `whatsapp_message_queue`.
- `customers`.
- `pedidos`.
- `identity_profiles`.
- `identity_evidence`.

Eventos que deberia producir:

- `store_order_created`.
- `store_payment_submitted`.
- `store_payment_verified`.
- `store_order_confirmed`.
- `internal_order_created`.
- `whatsapp_confirmation_queued`.

### 3.2 WhatsApp y ventas live

Fuente:

- Mensajes entrantes.
- Fotos de prendas.
- Comprobantes.
- Audios o texto de confirmacion.
- Resumen generado por IA.
- Revision del operador.
- Confirmacion final de la clienta.

Tablas o modulos relacionados:

- Bridge de WhatsApp.
- Panel de WhatsApp/ventas live.
- Registros de mensajes.
- Registros de media.
- `whatsapp_message_queue`.
- `identity_profiles`.
- `identity_evidence`.
- `store_customers` o perfil digital equivalente.
- `pedidos`.
- `payment_events`.
- `manual_review_queue`.

Eventos que deberia producir:

- `whatsapp_message_received`.
- `whatsapp_media_received`.
- `ai_conversation_summary_created`.
- `whatsapp_order_proposal_created`.
- `whatsapp_order_proposal_sent`.
- `customer_items_confirmed`.
- `whatsapp_payment_submitted`.
- `whatsapp_payment_verified`.
- `internal_order_created`.

### 3.3 MacroDroid y notificaciones bancarias

Fuente:

- Notificaciones Android capturadas por MacroDroid.
- Texto completo de la notificacion.
- App origen.
- Fecha del dispositivo.
- Paquete Android.
- Hash/idempotencia.

Tablas relacionadas:

- `raw_notification_events`.
- `parsed_payment_candidates`.
- `manual_review_queue`.
- `learned_text_patterns`.
- `notification_bank_observations`.
- `pagos`.
- `pedidos`.
- `payment_events` si se usa como capa canonica.

Eventos que deberia producir:

- `bank_notification_received`.
- `payment_candidate_parsed`.
- `payment_created`.
- `payment_review_required`.
- `payment_pattern_learned`.

### 3.4 Operador

Fuente:

- Pago manual.
- Edicion de cliente.
- Confirmacion manual de pago.
- Correccion de identidad.
- Confirmacion de prendas.
- Procesamiento en Mesa de Preparacion.
- Entrega.

Tablas relacionadas:

- `clientes`.
- `customers`.
- `pagos`.
- `pedidos`.
- `orders`.
- `order_bags`.
- `container_allocations`.
- `manual_review_queue`.
- `identity_evidence`.

Eventos que deberia producir:

- `manual_payment_created`.
- `manual_review_approved`.
- `manual_review_rejected`.
- `identity_merged`.
- `preparation_completed`.
- `container_assigned`.
- `order_delivered`.

### 3.5 Clienta

Fuente:

- Registro automatico o login/perfil.
- Confirmacion de prendas.
- Consulta de estado.
- Comprobante enviado.
- Seleccion de metodo de entrega o retiro.

Tablas relacionadas:

- `store_customers`.
- `identity_profiles`.
- `identity_evidence`.
- `store_orders`.
- `pedidos`.
- `orders`.
- `whatsapp_message_queue`.

Eventos que deberia producir:

- `customer_profile_created`.
- `customer_profile_linked`.
- `customer_order_viewed`.
- `customer_items_confirmed`.
- `payment_receipt_uploaded`.

## 4. Eventos principales del sistema

Esta tabla propone nombres canonicos para los eventos. No obliga a crear una tabla nueva de inmediato, pero ayuda a ordenar futuras implementaciones.

| Evento | Origen | Accion esperada | Fallback |
|---|---|---|---|
| `store_order_created` | Checkout tienda | Crear pedido de tienda y perfil si falta | Error visible o revision |
| `store_payment_submitted` | Tienda/clienta | Guardar comprobante y esperar MacroDroid | Revision manual |
| `bank_notification_received` | MacroDroid | Guardar evento crudo e intentar parseo | Rechazar duplicado o revisar |
| `payment_candidate_parsed` | Parser regex/aprendizaje/IA | Crear candidato de pago | Revision manual |
| `store_payment_verified` | Cruce pago-pedido | Marcar pago validado | Revision manual |
| `whatsapp_message_received` | Bridge WhatsApp | Guardar mensaje y asociar identidad | Crear identidad pendiente |
| `whatsapp_media_received` | Bridge WhatsApp | Guardar media como evidencia | Revision si falla descarga |
| `ai_conversation_summary_created` | IA WhatsApp | Resumir conversacion y prendas | Operador revisa |
| `whatsapp_order_proposal_created` | IA/sistema | Proponer prendas detectadas | Operador corrige |
| `whatsapp_order_proposal_sent` | WhatsApp queue | Enviar confirmacion a clienta | Reintento o manual |
| `customer_items_confirmed` | Clienta | Confirmar prendas del pedido | Mantener pendiente |
| `internal_order_created` | Tienda/WhatsApp/manual | Crear pedido operativo | Revision si falta cliente |
| `preparation_completed` | Mesa de Preparacion | Guardar bolsas/prendas | Error bloqueante |
| `container_assigned` | Backend etiquetas | Asignar casillero | Mostrar error al operador |
| `order_delivered` | Operador | Liberar o cerrar flujo | Registrar historial |
| `whatsapp_message_queued` | Sistema | Programar mensaje saliente | Evitar duplicado |
| `whatsapp_message_sent` | Bridge | Marcar envio exitoso | Reintento si falla |

## 5. Contrato minimo por tipo de evento

### 5.1 Evento de tienda

Payload minimo:

```json
{
  "event_type": "store_order_created",
  "source": "storefront",
  "user_id": "owner-id",
  "store_order_id": "order-id",
  "customer": {
    "name": "Nombre real",
    "phone": "Telefono",
    "email": "opcional"
  },
  "items": [
    {
      "product_id": "product-id",
      "name": "Nombre producto",
      "quantity": 1,
      "unit_price": 0
    }
  ],
  "total_amount": 0,
  "created_at": "timestamp"
}
```

Validaciones obligatorias:

- `user_id` presente.
- Telefono normalizado cuando exista.
- Total calculado desde items, no solo desde cliente.
- Productos existentes y disponibles.
- Estado inicial claro.

Acciones:

- Crear `store_orders`.
- Crear o vincular `store_customers`.
- Crear evidencia de identidad.
- Preparar estado de pago pendiente.

Fallback:

- Si falta telefono o nombre, permitir pedido solo como pendiente de completar.
- Si el producto ya no esta disponible, bloquear checkout o pedir revision.

### 5.2 Evento de pago bancario

Payload minimo:

```json
{
  "event_type": "bank_notification_received",
  "source": "macrodroid",
  "user_id": "owner-id",
  "app_package": "android.package",
  "raw_title": "titulo",
  "raw_text": "texto completo",
  "device_timestamp": "timestamp",
  "event_hash": "sha256"
}
```

Validaciones obligatorias:

- Hash unico.
- Texto original preservado.
- App origen registrada.
- Monto extraido con formato numerico seguro.
- Nombre real solo si aparece o se extrae con confianza suficiente.

Acciones:

- Insertar evento crudo.
- Ejecutar parser en cascada.
- Crear candidato.
- Crear pago si los datos son confiables.
- Aprender patron si corresponde.

Fallback:

- Enviar a `manual_review_queue` si falta nombre real, monto claro o asociacion segura.

### 5.3 Evento de WhatsApp entrante

Payload minimo:

```json
{
  "event_type": "whatsapp_message_received",
  "source": "whatsapp_bridge",
  "user_id": "owner-id",
  "chat_id": "chat-id",
  "message_id": "message-id",
  "phone": "telefono",
  "direction": "inbound",
  "message_type": "text|image|audio|document",
  "text": "contenido",
  "media_url": "opcional",
  "received_at": "timestamp"
}
```

Validaciones obligatorias:

- `message_id` unico por bridge.
- Telefono normalizado.
- Direccion del mensaje.
- Media descargada o referencia guardada.
- Conversacion asociada a identidad o identidad pendiente.

Acciones:

- Guardar mensaje.
- Guardar evidencia.
- Actualizar perfil de identidad.
- Pasar por IA cuando haya suficiente contexto.

Fallback:

- Si no hay telefono valido, guardar en bandeja tecnica.
- Si media falla, marcar evidencia incompleta.

### 5.4 Evento de propuesta de pedido por WhatsApp

Payload minimo:

```json
{
  "event_type": "whatsapp_order_proposal_created",
  "source": "ai_assistant",
  "user_id": "owner-id",
  "identity_profile_id": "profile-id",
  "chat_id": "chat-id",
  "summary": "resumen",
  "items": [
    {
      "description": "prenda detectada",
      "quantity": 1,
      "evidence_message_ids": ["message-id"],
      "confidence": 0.8
    }
  ],
  "needs_operator_review": true
}
```

Validaciones obligatorias:

- Cada prenda debe tener evidencia de chat o media.
- La IA no debe confirmar sola el pedido.
- El operador debe poder editar antes de enviar a clienta.
- La clienta debe confirmar antes de pasar a pedido interno.

Acciones:

- Crear propuesta.
- Mostrar al operador.
- Enviar mensaje de confirmacion a la clienta.

Fallback:

- Si la IA tiene baja confianza, pedir revision manual.
- Si la clienta no responde, mantener propuesta pendiente.

### 5.5 Evento de pedido interno

Payload minimo:

```json
{
  "event_type": "internal_order_created",
  "source": "store|whatsapp|manual",
  "user_id": "owner-id",
  "customer_id": "customer-id",
  "origin_ref_type": "store_order|whatsapp_proposal|manual",
  "origin_ref_id": "source-id",
  "status": "procesar",
  "payment_status": "verified|manual_review|pending",
  "created_at": "timestamp"
}
```

Validaciones obligatorias:

- Cliente existente o identidad vinculada.
- Origen rastreable.
- No duplicar pedido si ya existe para el mismo origen.
- No asignar casillero hasta completar Mesa de Preparacion.

Acciones:

- Crear `pedidos` o equivalente operativo.
- Mostrar en perfil de cliente.
- Permitir procesamiento.

Fallback:

- Si falta cliente o pago validado, dejar en estado pendiente/revision.

## 6. Entidades canonicas recomendadas

Estas entidades no necesariamente exigen tablas nuevas en este momento. Sirven como modelo para alinear campos existentes y futuras migraciones.

### 6.1 `IdentityProfile`

Representa a una persona o clienta unificada en la aplicacion.

Campos recomendados:

- `id`.
- `user_id`.
- `display_name`.
- `normalized_name`.
- `primary_phone`.
- `primary_email`.
- `store_customer_id`.
- `customer_id`.
- `created_from`.
- `confidence`.
- `status`.
- `created_at`.
- `updated_at`.

Regla:

- Un perfil puede tener muchas evidencias.
- El perfil no debe fusionar dos personas sin evidencia fuerte.

### 6.2 `IdentityEvidence`

Representa pruebas que vinculan datos a una identidad.

Campos recomendados:

- `id`.
- `identity_profile_id`.
- `user_id`.
- `source`.
- `source_id`.
- `evidence_type`.
- `value`.
- `normalized_value`.
- `confidence`.
- `created_at`.

Ejemplos:

- Telefono desde WhatsApp.
- Nombre desde checkout.
- Nombre desde pago bancario.
- Email desde tienda.
- Comprobante subido.
- Confirmacion de clienta.

### 6.3 `PaymentEvent`

Representa un pago o intento de pago con trazabilidad.

Campos recomendados:

- `id`.
- `user_id`.
- `source`.
- `event_hash`.
- `amount`.
- `currency`.
- `payer_name`.
- `payer_phone`.
- `raw_event_id`.
- `store_order_id`.
- `pedido_id`.
- `identity_profile_id`.
- `status`.
- `confidence`.
- `review_id`.
- `created_at`.

Regla:

- El pago detectado y el pago operativo pueden ser registros separados, pero deben estar vinculados.

### 6.4 `StoreOrder`

Representa la compra en tienda online.

Campos clave:

- `id`.
- `user_id`.
- `store_customer_id`.
- `identity_profile_id`.
- `items`.
- `total_amount`.
- `payment_status`.
- `fulfillment_status`.
- `internal_pedido_id`.
- `created_at`.

Regla:

- La orden de tienda no debe perder su relacion con pedido interno.

### 6.5 `WhatsappConversation`

Representa una conversacion de WhatsApp.

Campos clave:

- `id`.
- `user_id`.
- `chat_id`.
- `phone`.
- `identity_profile_id`.
- `last_message_at`.
- `last_summary_at`.
- `status`.

Regla:

- Una conversacion puede crear varias propuestas, pero cada propuesta debe tener origen y version.

### 6.6 `WhatsappOrderProposal`

Representa una seleccion de prendas detectada en una conversacion.

Campos clave:

- `id`.
- `user_id`.
- `conversation_id`.
- `identity_profile_id`.
- `summary`.
- `items`.
- `status`.
- `operator_confirmed_at`.
- `customer_confirmed_at`.
- `internal_pedido_id`.
- `created_at`.

Regla:

- No debe convertirse en pedido interno final sin confirmacion de clienta o decision manual explicita.

### 6.7 `ManualReviewItem`

Representa un caso que requiere decision humana.

Campos clave:

- `id`.
- `user_id`.
- `review_type`.
- `reason_code`.
- `reason_detail`.
- `source`.
- `source_id`.
- `payload`.
- `suggested_action`.
- `status`.
- `reviewer_id`.
- `decision`.
- `reviewed_at`.
- `created_at`.

Regla:

- Toda revision debe terminar en aprobar, rechazar, corregir o descartar.

### 6.8 `WhatsappOutboundMessage`

Representa un mensaje saliente preparado por el sistema.

Campos clave:

- `id`.
- `user_id`.
- `identity_profile_id`.
- `phone`.
- `message_type`.
- `template_key`.
- `body`.
- `reference_type`.
- `reference_id`.
- `status`.
- `attempt_count`.
- `last_error`.
- `sent_at`.
- `created_at`.

Regla:

- Mensajes de confirmacion deben ser idempotentes por `reference_type` + `reference_id` + `template_key`.

## 7. Estados canonicos recomendados

### 7.1 Estados de pago

| Estado | Significado |
|---|---|
| `received` | Evento recibido pero no procesado |
| `parsed_ok` | Datos extraidos con exito |
| `pending_review` | Requiere revision manual |
| `verified` | Pago validado y usable |
| `rejected` | No corresponde o fue descartado |
| `duplicate` | Evento duplicado por hash o referencia |

### 7.2 Estados de pedido de tienda

| Estado | Significado |
|---|---|
| `pending_payment` | Orden creada, pago pendiente |
| `payment_submitted` | Clienta envio comprobante |
| `payment_review` | Pago requiere revision |
| `paid` | Pago verificado |
| `preparing` | Pedido enviado a flujo interno |
| `ready` | Pedido listo fisicamente |
| `delivered` | Entregado |
| `cancelled` | Cancelado |

### 7.3 Estados de propuesta WhatsApp

| Estado | Significado |
|---|---|
| `inbox` | Conversacion recibida |
| `ai_summarized` | IA genero resumen |
| `operator_review` | Operador debe revisar |
| `sent_to_customer` | Propuesta enviada a clienta |
| `customer_confirmed` | Clienta confirmo prendas |
| `payment_pending` | Falta pago |
| `payment_review` | Pago en revision |
| `payment_verified` | Pago validado |
| `sent_to_preparation` | Pedido interno creado |
| `cancelled` | Flujo cancelado |

### 7.4 Estados de pedido interno

| Estado | Significado |
|---|---|
| `procesar` | Pendiente de Mesa de Preparacion |
| `listo` | Preparado, con conteo y etiqueta |
| `entregado` | Retirado o entregado |

### 7.5 Estados de cola WhatsApp

| Estado | Significado |
|---|---|
| `pending` | Listo para enviar |
| `sending` | Bridge lo esta enviando |
| `sent` | Enviado exitosamente |
| `failed` | Fallo envio |
| `cancelled` | Cancelado por sistema u operador |

### 7.6 Estados de casillero

| Estado | Significado |
|---|---|
| `ACTIVE` | Asignacion vigente |
| `RELEASED` | Liberada por entrega |
| `MIGRATED` | Migrada de numerico a alfanumerico |
| `CANCELLED` | Cancelada por correccion |

## 8. Validaciones obligatorias por dato

### 8.1 Nombre

Reglas:

- No usar placeholders como nombre real.
- Normalizar espacios y mayusculas/minusculas.
- Guardar version original y normalizada cuando sea posible.
- Si viene desde IA, guardar confianza y evidencia.

Pasa automaticamente si:

- Viene de formulario de checkout completado por clienta.
- Viene de perfil ya existente.
- Viene de notificacion bancaria con patron confiable.
- Viene de WhatsApp y coincide con identidad existente.

Va a revision si:

- El parser no encuentra nombre.
- Hay dos nombres posibles.
- La IA infiere nombre sin evidencia directa.
- El nombre no coincide con telefono o historial.

### 8.2 Telefono

Reglas:

- Normalizar formato.
- Guardar pais si se conoce.
- No fusionar identidades solo por nombre si el telefono difiere.

Pasa automaticamente si:

- Viene de WhatsApp.
- Viene de checkout y cumple longitud/formato.
- Ya existe como telefono principal.

Va a revision si:

- El telefono esta vacio.
- Tiene formato invalido.
- El mismo telefono esta asociado a dos identidades activas.

### 8.3 Monto

Reglas:

- Guardar monto numerico.
- Guardar moneda si existe.
- Comparar contra total esperado con tolerancia definida.

Pasa automaticamente si:

- Monto del banco coincide con total esperado.
- No hay otro pedido abierto con el mismo monto y cliente en ventana cercana.

Va a revision si:

- Monto no coincide.
- Hay varios pedidos posibles.
- El banco no informa nombre y hay varias clientas con mismo monto.

### 8.4 Prendas

Reglas:

- Cada prenda detectada por IA debe tener evidencia.
- La clienta debe confirmar la lista antes de pedido final.
- El operador debe confirmar antes de casillero.

Pasa automaticamente si:

- La clienta confirma explicitamente la propuesta.
- El operador aprueba la propuesta.

Va a revision si:

- IA detecta prendas ambiguas.
- Hay fotos sin descripcion clara.
- La clienta corrige el pedido.

### 8.5 Comprobante

Reglas:

- Guardar archivo o referencia.
- Relacionarlo con pedido, identidad y pago.
- No marcar pago como verificado solo por imagen si no hay politica definida.

Pasa automaticamente si:

- Existe comprobante y llega notificacion MacroDroid coincidente.

Va a revision si:

- Hay comprobante, pero no llega notificacion.
- Llega notificacion, pero el comprobante pertenece a otro pedido.
- La imagen es ilegible.

## 9. Idempotencia y deduplicacion

La automatizacion debe evitar crear duplicados. Los puntos mas sensibles son pagos, pedidos y mensajes salientes.

### 9.1 Pagos

Claves recomendadas:

- `event_hash` para notificaciones crudas.
- `source` + `source_id`.
- `amount` + `payer_name` + ventana de tiempo, solo como apoyo.

Regla:

- Si llega la misma notificacion dos veces, se debe marcar como duplicada, no crear otro pago.

### 9.2 Pedidos de tienda

Claves recomendadas:

- `store_order_id`.
- `checkout_session_id` si existe en futuro.
- `payment_event_id` vinculado.

Regla:

- Una orden de tienda no debe crear mas de un pedido interno activo.

### 9.3 Propuestas WhatsApp

Claves recomendadas:

- `conversation_id`.
- Version de resumen.
- Set de `message_id` incluidos.

Regla:

- Si llegan mensajes nuevos, crear nueva version o actualizar propuesta pendiente, pero no duplicar pedido confirmado.

### 9.4 Mensajes salientes

Claves recomendadas:

- `reference_type`.
- `reference_id`.
- `template_key`.
- `phone`.

Regla:

- El sistema no debe enviar dos confirmaciones iguales para el mismo pedido salvo reintento controlado.

### 9.5 Casilleros

Claves recomendadas:

- Pedido interno.
- Asignacion activa unica.

Regla:

- Un pedido no debe tener dos casilleros activos.
- La migracion de numerico a alfanumerico debe conservar historial.

## 10. Revision manual como modulo central

La revision manual debe recibir casos desde todos los flujos, no solo desde notificaciones bancarias.

### 10.1 Tipos de revision

| Tipo | Cuando se crea |
|---|---|
| `payment_missing_name` | Pago sin nombre real |
| `payment_amount_mismatch` | Monto no coincide con pedido |
| `payment_multiple_matches` | Pago puede pertenecer a varios pedidos |
| `receipt_without_notification` | Hay comprobante, pero no llego MacroDroid |
| `identity_conflict` | Datos apuntan a mas de una clienta |
| `whatsapp_ai_low_confidence` | IA no esta segura de prendas o intencion |
| `whatsapp_media_failed` | No se pudo guardar o leer media |
| `store_order_incomplete` | Checkout incompleto o producto inconsistente |
| `internal_order_duplicate_risk` | Riesgo de crear pedido duplicado |
| `container_assignment_error` | Backend no pudo asignar casillero |

### 10.2 Acciones de revision

El operador deberia poder:

- Aprobar.
- Rechazar.
- Corregir datos.
- Vincular a cliente existente.
- Crear cliente nuevo.
- Vincular a pedido existente.
- Crear pedido nuevo.
- Reintentar envio WhatsApp.
- Descartar como duplicado.

### 10.3 Datos que debe guardar una revision

Cada item de revision debe guardar:

- Motivo tecnico.
- Motivo visible para operador.
- Payload original.
- Evidencias relacionadas.
- Sugerencia del sistema.
- Decision tomada.
- Usuario que decidio.
- Fecha de decision.
- Registro creado o modificado.

## 11. Auditoria minima

Para automatizar de forma segura, cada cambio importante debe dejar rastro.

Eventos que requieren auditoria:

- Creacion de perfil.
- Fusion de identidad.
- Creacion de pago.
- Verificacion de pago.
- Creacion de pedido interno.
- Confirmacion de prendas.
- Asignacion/migracion/liberacion de casillero.
- Envio de mensaje WhatsApp.
- Decision de revision manual.

Campos minimos:

- `actor_type`: `system`, `operator`, `customer`, `ai`.
- `actor_id`.
- `event_type`.
- `source`.
- `source_id`.
- `before`.
- `after`.
- `confidence`.
- `created_at`.

## 12. Automatizacion por fases recomendada

### Fase 1 - Alinear tienda con pagos e identidad

Objetivo:

- Que cada compra cree o vincule perfil.
- Que cada orden tenga estado de pago claro.
- Que el pago validado cree el pedido interno correcto.

Eventos prioritarios:

- `store_order_created`.
- `store_payment_submitted`.
- `bank_notification_received`.
- `store_payment_verified`.
- `internal_order_created`.

Resultado esperado:

- La tienda puede funcionar semiautomatica.
- Si MacroDroid confirma, el sistema avanza.
- Si no confirma, revision manual clara.

### Fase 2 - Unificar identidad y evidencia

Objetivo:

- Evitar perfiles duplicados entre tienda, WhatsApp y sistema interno.
- Guardar evidencia de cada dato.

Eventos prioritarios:

- `customer_profile_created`.
- `customer_profile_linked`.
- `identity_evidence_created`.
- `identity_conflict_review_created`.

Resultado esperado:

- Cada clienta tiene un perfil interno y un perfil visible.
- Las futuras automatizaciones saben a quien pertenece cada pedido.

### Fase 3 - Formalizar perfil visible para clienta

Objetivo:

- Que la clienta pueda ver pedidos, prendas y estados.
- Que WhatsApp y tienda apunten al mismo perfil.

Eventos prioritarios:

- `customer_order_viewed`.
- `customer_items_confirmed`.
- `payment_receipt_uploaded`.

Resultado esperado:

- Menos consultas manuales por WhatsApp.
- Mejor trazabilidad de pedidos.

### Fase 4 - Automatizar propuesta de pedidos por WhatsApp

Objetivo:

- Que la IA resuma conversacion y detecte prendas.
- Que el operador revise.
- Que la clienta confirme.

Eventos prioritarios:

- `whatsapp_message_received`.
- `ai_conversation_summary_created`.
- `whatsapp_order_proposal_created`.
- `whatsapp_order_proposal_sent`.
- `customer_items_confirmed`.

Resultado esperado:

- WhatsApp deja de ser solo chat y se convierte en flujo estructurado.
- La IA prepara, pero no decide sola.

### Fase 5 - Reforzar revision manual

Objetivo:

- Centralizar excepciones.
- Medir donde falla la automatizacion.
- Permitir reintentos y correcciones.

Eventos prioritarios:

- `manual_review_created`.
- `manual_review_approved`.
- `manual_review_rejected`.
- `manual_review_corrected`.

Resultado esperado:

- La automatizacion no se detiene por datos incompletos.
- El operador resuelve desde una bandeja clara.

### Fase 6 - Conectar con casilleros sin saltar confirmaciones

Objetivo:

- Solo mandar a casillero despues de pedido interno y Mesa de Preparacion.
- Mantener asignacion automatica en backend.

Eventos prioritarios:

- `preparation_completed`.
- `container_assigned`.
- `container_migrated`.
- `order_delivered`.

Resultado esperado:

- El flujo digital llega al mundo fisico con control.
- No se asignan casilleros antes de contar prendas y bolsas.

## 13. Checklist de datos por flujo

### 13.1 Tienda online

- Existe cliente o se crea perfil.
- Telefono normalizado.
- Items congelados al momento de compra.
- Total calculado y guardado.
- Estado de pago inicial.
- Comprobante vinculado si existe.
- Pago MacroDroid vinculado si llega.
- Revision manual si no llega.
- Mensaje de confirmacion en cola.
- Pedido interno creado una sola vez.

### 13.2 WhatsApp ventas live

- Cada mensaje tiene `message_id`.
- Cada chat tiene telefono.
- Cada media se guarda como evidencia.
- IA resume con referencias.
- Operador revisa propuesta.
- Clienta confirma prendas.
- Pago se verifica por MacroDroid o revision.
- Pedido interno se crea con origen WhatsApp.
- Mensaje de confirmacion no se duplica.

### 13.3 Pagos MacroDroid

- Evento crudo guardado.
- Hash calculado.
- Duplicados bloqueados.
- Parser regex ejecutado.
- Patrones aprendidos usados.
- Gemini solo como ultimo recurso.
- Sin nombre real va a revision.
- Pago creado solo con datos confiables.
- Pedido vinculado con evidencia.

### 13.4 Perfil interno

- Cliente tiene nombre visible.
- Cliente tiene telefono cuando aplica.
- Pagos y pedidos aparecen en historial.
- Pedidos muestran estado correcto.
- Pedido listo muestra etiqueta.
- Entrega conserva historial.

### 13.5 Casilleros

- Pedido llega a Mesa en estado `procesar`.
- Operador cuenta prendas.
- Operador cuenta bolsas.
- Backend asigna casillero.
- Si aumenta bolsas, backend migra.
- Entrega libera correctamente.
- Historial no se borra.

## 14. Riesgos si no se define este contrato

### 14.1 Estados inconsistentes

Sin estados canonicos, la tienda puede creer que un pedido esta pagado mientras el sistema interno lo ve pendiente, o WhatsApp puede confirmar algo que todavia no esta validado.

### 14.2 Perfiles duplicados

Una misma clienta puede existir como:

- Cliente de tienda.
- Contacto WhatsApp.
- Cliente operativo.
- Pagador bancario.

Sin identidad unificada, la automatizacion no sabra a que persona pertenece cada evento.

### 14.3 Pagos duplicados

MacroDroid puede reenviar notificaciones. Sin hash y referencias, un mismo pago puede crear varios pagos o pedidos.

### 14.4 Mensajes duplicados

La cola de WhatsApp necesita idempotencia. Sin referencia unica, el sistema podria enviar varias confirmaciones iguales.

### 14.5 Casilleros asignados antes de tiempo

Si el flujo digital asigna casillero antes de la Mesa de Preparacion, se mezcla informacion comercial con informacion fisica. Eso puede producir etiquetas incorrectas.

### 14.6 IA tomando decisiones sin evidencia

La IA debe preparar, resumir y proponer. Las decisiones criticas necesitan evidencia, confirmacion de clienta u operador.

## 15. Preguntas pendientes para implementar bien

Estas preguntas no bloquean este informe, pero si deben resolverse antes de implementar automatizacion completa.

1. En tienda online, cuanto tiempo se debe reservar una prenda si la clienta no paga?
2. Un comprobante sin notificacion MacroDroid puede aprobarse manualmente como pago valido?
3. Que tolerancia de monto se permite entre pedido y pago? Exacta, +/- 1 Bs, o configurable?
4. La clienta necesita login con clave, link magico o acceso por telefono/codigo?
5. WhatsApp debe enviar mensajes automaticamente despues de verificacion o siempre con previsualizacion del operador?
6. La IA puede crear propuesta automaticamente despues de cada mensaje o solo cuando el operador pulse una accion?
7. Si una clienta compra por tienda y tambien escribe por WhatsApp, cual dato manda para fusionar identidad?
8. Los pedidos de tienda y WhatsApp deben usar exactamente el mismo estado interno o mantener estados de origen separados?
9. Cuando un pedido esta listo, la clienta debe recibir mensaje automatico?
10. La entrega libera casillero y tambien cierra el pedido visible para clienta?

## 16. Recomendacion final

La aplicacion ya tiene piezas importantes para automatizar: tienda, pagos, pipeline MacroDroid, WhatsApp, pedidos internos, perfiles y casilleros. Lo que falta para que sea automatico de forma confiable no es reescribir todo, sino definir y respetar un contrato de datos/eventos.

El orden recomendado es:

1. Alinear tienda, pagos e identidad.
2. Crear o consolidar evidencia de identidad.
3. Formalizar revision manual central.
4. Conectar WhatsApp con propuestas confirmables.
5. Crear perfil visible para clienta.
6. Enviar a preparacion y casillero solo despues de confirmaciones.

Con este enfoque, la automatizacion puede crecer por fases. El sistema prepara todo lo posible, el operador confirma lo sensible y la aplicacion conserva evidencia suficiente para corregir cualquier caso.
