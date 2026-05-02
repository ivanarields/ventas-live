# Informe tecnico - Flujo WhatsApp y Ventas Live

## 1. Objetivo del informe

Este documento describe el flujo de ventas que nace en WhatsApp: mensajes, fotos de prendas, comprobantes, resumen con IA, creacion de perfil, confirmacion de la clienta, verificacion de pago y paso al sistema interno de preparacion.

La idea principal es convertir los chats de WhatsApp en un flujo semi-automatico:

1. La clienta escribe o envia fotos por WhatsApp.
2. El bridge recibe mensajes, fotos, audios o documentos.
3. El sistema crea o actualiza un contacto en el panel de WhatsApp.
4. El sistema crea o vincula una identidad global.
5. La IA resume la conversacion y detecta prendas, cantidades, tallas, comprobantes y dudas.
6. El operador revisa la propuesta.
7. La clienta recibe un link para confirmar sus prendas en la tienda/perfil.
8. La clienta confirma.
9. El pago se valida con MacroDroid si existe notificacion bancaria.
10. Si no hay match confiable, pasa a revision manual.
11. Al verificarse, se encola confirmacion WhatsApp.
12. Se crea pedido interno.
13. El operador confirma prendas y bolsas.
14. Luego el pedido pasa al sistema de casilleros.

Principio critico: la IA no debe inventar prendas, nombres, pagos ni confirmaciones. Debe proponer con evidencia y dejar dudas para revision.

## 2. Estado actual del flujo

El proyecto ya tiene muchas piezas del flujo WhatsApp, pero todavia no forman un circuito completo de venta automatizada.

| Etapa | Estado actual | Comentario tecnico |
|---|---|---|
| Bridge WhatsApp | Existe | `bridge/index.js` usa `whatsapp-web.js`, recibe mensajes y sube media. |
| Ingesta WhatsApp | Existe | `supabase/functions/ingest-whatsapp/index.ts` guarda clientes y mensajes en el panel. |
| Panel de pedidos WhatsApp | Existe | `src/components/PanelPedidos.tsx` muestra chats, resumen, fotos y alertas. |
| IA de resumen | Existe | `POST /api/ai/summarize-conversation` lee mensajes y genera resumen. |
| Extraccion de comprobantes | Existe parcialmente | IA intenta detectar comprobantes en imagenes y cruzar con pagos. |
| Identidad global | Existe | `identity_profiles` e `identity_evidence` unifican WhatsApp, tienda, pagos y clientes. |
| Vinculo WhatsApp -> cliente interno | Existe parcialmente | `fn_link_customer_wa` vincula por nombre canonico/fuzzy. |
| Fotos de WhatsApp en perfil | Existe | `GET /api/identity/whatsapp-photos` y `/api/store/whatsapp-photos`. |
| Cola de mensajes salientes | Existe | `whatsapp_message_queue` y `/api/whatsapp/send-next`. |
| Link para confirmar prendas | Existe parcialmente | Hay endpoint `POST /api/store/notify-live-ready`, pero falta flujo completo de confirmacion. |
| Pago con MacroDroid | Existe | Edge Function `ingest-notification` crea pagos/pedidos; tambien hay cruce con tienda. |
| Revision manual | Existe parcialmente | `manual_review_queue` existe para notificaciones, pero falta flujo claro para pedidos WhatsApp. |
| Pedido interno | Existe | `pedidos` alimenta Mesa de Preparacion. |
| Casilleros | Existe | Se asignan despues de marcar pedido listo. |

Conclusion: el sistema ya tiene el 60-70% de las piezas tecnicas. Falta ordenar el contrato de datos y cerrar el flujo de confirmacion de prendas por clienta.

## 3. Flujo actual detallado

### 3.1 Bridge de WhatsApp

El bridge esta en `bridge/`.

Archivos principales:

- `bridge/index.js`
- `bridge/send.js`
- `bridge/package.json`

Funciones actuales:

- Conectarse a WhatsApp Web con QR.
- Mantener sesion con `LocalAuth`.
- Exponer estado/QR en `/status`.
- Recibir mensajes entrantes y salientes.
- Obtener numero real del contacto con `msg.getContact()`.
- Descargar media si el mensaje tiene foto/audio/video/PDF.
- Subir media a Supabase Storage en bucket `whatsapp-media`.
- Enviar payload a una Edge Function configurada como `WEBHOOK_URL`.
- Exponer `POST /api/send` para enviar mensajes desde la cola.
- Exponer `GET /api/health`.

Payload enviado por bridge:

| Campo | Uso |
|---|---|
| `id` | ID del mensaje en WhatsApp. |
| `from` | ID raw de WhatsApp. |
| `fromPhone` | Numero real normalizado si esta disponible. |
| `fromMe` | Indica si el mensaje salio del operador. |
| `to` | Destinatario. |
| `body` | Texto. |
| `hasMedia` | Si trae archivo. |
| `mediaMimetype` | Tipo de archivo. |
| `mediaUrl` | URL publica luego de subir a Storage. |
| `timestamp` | Tiempo del mensaje. |

### 3.2 Ingesta de mensajes

La Edge Function `supabase/functions/ingest-whatsapp/index.ts` recibe el payload del bridge.

Hace:

- normaliza telefono;
- determina direccion `in` o `out`;
- crea/actualiza `panel_clientes`;
- inserta mensaje en `panel_mensajes`;
- guarda media si existe;
- deposita evidencia en la base principal cuando tiene `MAIN_URL`, `MAIN_KEY` e `INGEST_USER_ID`;
- registra auditoria en `panel_raw_webhooks`.

Tablas del panel usadas por el flujo:

- `panel_clientes`
- `panel_mensajes`
- `panel_raw_webhooks`

Estas tablas pertenecen al proyecto de panel de WhatsApp, no a la base principal. El backend principal las lee mediante `supabasePanel`.

### 3.3 Panel de pedidos

El componente `src/components/PanelPedidos.tsx` lista clientes del panel y permite abrir el detalle de la conversacion.

Usos actuales:

- lista `panel_clientes`;
- carga `panel_mensajes`;
- muestra fotos;
- llama a `POST /api/ai/summarize-conversation`;
- muestra resumen del pedido;
- muestra alerta si detecta comprobante sin pago MacroDroid;
- permite filtrar clientes con pago detectado.

Este panel es el candidato natural para que el operador revise la propuesta de la IA antes de enviarla a confirmacion de la clienta.

### 3.4 IA de resumen y comprobantes

El router `src/routes/ai-gateway.ts` expone:

- `POST /api/ai/summarize-conversation`
- `POST /api/ai/analyze-image`
- `POST /api/ai/analyze-qr`
- `POST /api/ai/analyze-qr-base64`
- `GET /api/ai/prompts`
- `PATCH /api/ai/prompts/:key`
- `GET /api/ai/config`
- `POST /api/ai/config`
- `GET /api/ai/usage`

Para WhatsApp, el endpoint clave es `POST /api/ai/summarize-conversation`.

Hace:

- lee datos de `panel_clientes`;
- lee mensajes de `panel_mensajes`;
- separa textos, fotos y audios;
- transcribe audios con Gemini;
- clasifica imagenes como prenda/comprobante/otro;
- extrae comprobantes con prompt configurable;
- resume conversacion;
- actualiza `panel_clientes.resumen`;
- actualiza `panel_clientes.estado`;
- si detecta comprobante con pagador, intenta vincular WhatsApp a `customers` con `fn_link_customer_wa`;
- deposita evidencia en `identity_evidence`.

Esto es una base fuerte, pero el uso ideal no debe ser que la IA cree automaticamente el pedido final sin revision. Debe crear una propuesta.

### 3.5 Identidad global

El sistema de identidad esta en:

- `src/services/identityService.ts`
- `src/routes/identity.ts`
- migraciones `030_identity_system.sql`, `031_identity_origin.sql`, `034_fix_identity_integrity.sql`

Tablas:

- `identity_profiles`
- `identity_evidence`

Fuentes de evidencia:

- `manual_payment`
- `macrodroid`
- `whatsapp`
- `store_order`

Reglas actuales de matching:

1. Telefono exacto.
2. `cliente_id`.
3. Nombre normalizado exacto.
4. Nombre parcial con coincidencia alta.
5. Crear perfil nuevo.

Para WhatsApp, el telefono debe ser el ancla principal. El nombre solo debe usarse cuando venga de una fuente confiable: comprobante, pago bancario, perfil existente o confirmacion manual.

### 3.6 Pagos por MacroDroid

La Edge Function `supabase/functions/ingest-notification/index.ts` procesa notificaciones bancarias.

Pipeline actual:

1. Recibe notificacion de Android.
2. Calcula hash SHA-256 para idempotencia.
3. Inserta `raw_notification_events`.
4. Intenta extraer monto y nombre con regex.
5. Intenta patrones aprendidos (`learned_text_patterns`).
6. Si falla, usa Gemini como ultimo recurso.
7. Si hay nombre y monto, inserta candidato parseado.
8. Crea/actualiza `customers`.
9. Inserta pago en `pagos`.
10. Inserta evidencia de identidad.
11. Crea pedido automatico en `pedidos`.
12. Si falta dato critico, manda a `manual_review_queue`.

Regla critica:

- si no hay nombre real, no se crea pago con nombre inventado.

Para el flujo WhatsApp, MacroDroid debe ser la fuente fuerte de pago. El comprobante WhatsApp debe ser evidencia auxiliar o disparador de revision, no verificacion automatica si no hay datos suficientes.

### 3.7 Cola de mensajes salientes

La cola esta en:

- `src/routes/whatsapp.ts`
- `supabase/migrations/035_whatsapp_queue.sql`
- `bridge/send.js`

Tabla:

- `whatsapp_message_queue`

Estados:

- `pending`
- `sending`
- `sent`
- `failed`
- `cancelled`

Funcion atomica:

- `fn_dequeue_whatsapp_message(p_user_id)`

La cola permite enviar mensajes con control, reintentos y menor riesgo operativo. Este es el camino recomendado para:

- confirmacion de pago;
- envio del link de verificacion de prendas;
- aviso de pedido listo;
- recuperacion de PIN;
- mensajes generales.

## 4. Flujo ideal recomendado

El flujo ideal de WhatsApp / Ventas Live debe ser:

```text
Mensaje WhatsApp entrante
  -> bridge recibe texto/media
  -> Edge Function guarda panel_cliente + panel_mensajes
  -> identidad global por telefono
  -> IA resume conversacion y clasifica fotos
  -> IA propone prendas/pedido/comprobante
  -> operador revisa y corrige
  -> se crea borrador de pedido de WhatsApp
  -> se envia link a perfil de tienda para confirmacion
  -> clienta confirma prendas
  -> sistema espera pago MacroDroid o comprobante
  -> pago verificado o revision manual
  -> mensaje de confirmacion
  -> pedido interno en `pedidos`
  -> Mesa de Preparacion
  -> operador confirma prendas y bolsas
  -> casillero automatico
  -> entrega
```

### 4.1 Entrada del chat

Cada mensaje de WhatsApp debe crear o actualizar:

- contacto del panel;
- evidencia de identidad;
- perfil de tienda si no existe;
- vinculo por telefono con `identity_profiles`.

Recomendacion:

- Telefono es el identificador principal.
- Nombre es opcional hasta tener fuente confiable.
- Si el mensaje trae media, conservar URL y tipo de media.

### 4.2 Resumen con IA

La IA debe generar una propuesta estructurada, no una decision final.

Salida recomendada:

```json
{
  "cliente": {
    "telefono": "591...",
    "nombre_detectado": null,
    "confianza_nombre": "baja"
  },
  "pedido_propuesto": {
    "prendas": [
      {
        "descripcion": "blusa roja",
        "talla": "M",
        "cantidad": 1,
        "fuente": "foto/mensaje",
        "confianza": "media"
      }
    ],
    "notas": "la clienta pregunto por envio"
  },
  "pago": {
    "comprobante_detectado": true,
    "pagador": "NOMBRE REAL o null",
    "monto": 100,
    "estado": "pendiente_macro_android"
  },
  "requiere_revision": true
}
```

La IA debe marcar dudas:

- talla no confirmada;
- prenda ambigua;
- foto borrosa;
- comprobante incompleto;
- nombre no visible;
- monto no visible;
- clienta no confirmo compra.

### 4.3 Revision del operador

El operador debe ver:

- resumen del chat;
- fotos clasificadas como prendas;
- comprobantes detectados;
- audio transcrito si existe;
- propuesta de prendas;
- nivel de confianza;
- botones para aprobar/corregir/rechazar.

El operador no deberia tener que leer todo el chat si la IA ya lo resumio bien, pero siempre debe poder abrir evidencia.

### 4.4 Confirmacion por la clienta

La mejor opcion elegida es confirmar por link en la tienda/perfil.

Flujo:

1. Operador aprueba propuesta.
2. Sistema crea un borrador de pedido.
3. Sistema encola WhatsApp con link.
4. Clienta abre link.
5. Ve prendas, fotos, tallas, cantidades y total.
6. Confirma o pide correccion.
7. Si confirma, el pedido queda listo para pago/verificacion.

Ventajas:

- evita interpretar respuestas ambiguas;
- deja evidencia clara de confirmacion;
- permite historial de pedidos para la clienta;
- reutiliza la tienda como portal de seguimiento.

### 4.5 Pago y comprobante

El pago puede llegar por:

- notificacion MacroDroid;
- comprobante en WhatsApp;
- verificacion manual.

Regla recomendada:

- MacroDroid con nombre/monto confiable verifica automaticamente.
- Comprobante sin notificacion bancaria queda como `solo_comprobante` o `payment_review`.
- Si monto coincide pero hay multiples pedidos, no verificar automaticamente.
- Si no hay nombre real, no crear pago final con nombre inventado.

### 4.6 Pedido interno

Despues de:

- clienta confirma prendas;
- pago esta verificado;
- operador aprueba si hubo dudas;

el sistema crea un registro en `pedidos`.

Campos recomendados:

- `customer_id`
- `customer_name`
- `item_count`
- `bag_count` inicial o pendiente
- `status: 'procesar'`
- `source: 'WHATSAPP'` o `LIVE`
- `web_items_list` o un campo equivalente con detalle estructurado
- referencia al borrador/confirmacion WhatsApp

La asignacion de casillero no debe ocurrir hasta que el operador confirme cantidad real de bolsas y prendas.

## 5. Tablas y datos relacionados

### 5.1 `panel_clientes`

Tabla del panel de WhatsApp.

Uso:

- contacto por telefono;
- ultima interaccion;
- nombre si se detecta;
- resumen IA;
- estado de pago/resumen.

Campos usados por codigo:

- `id`
- `phone`
- `nombre`
- `last_interaction`
- `created_at`
- `resumen`
- `resumen_at`
- `estado`

Recomendacion:

- Mantenerla como inbox operativo, no como identidad final.
- Sincronizar con `identity_profiles`.

### 5.2 `panel_mensajes`

Tabla del panel de WhatsApp.

Uso:

- historial de conversacion;
- textos;
- fotos;
- audios;
- comprobantes;
- direccion del mensaje.

Campos usados por codigo:

- `cliente_id`
- `direction`
- `content`
- `has_media`
- `media_url`
- `media_type`
- `created_at`

Recomendacion:

- Usarla como fuente de evidencia para IA.
- No borrar mensajes que puedan justificar una decision.

### 5.3 `identity_profiles`

Perfil global del cliente.

Uso:

- unir WhatsApp, tienda, pago manual, MacroDroid y cliente interno.

Campos importantes:

- `display_name`
- `phone`
- `cliente_id`
- `store_phone`
- `panel_phone`
- `confidence`
- `origin`
- `merged_from`

Recomendacion:

- WhatsApp debe crear perfil aunque no haya nombre.
- El nombre debe actualizarse solo con evidencia confiable.

### 5.4 `identity_evidence`

Historial de evidencias.

Uso:

- registrar que un telefono escribio;
- registrar comprobantes;
- registrar ordenes;
- registrar pagos.

Para WhatsApp se debe usar:

- `source: 'whatsapp'`
- `event_type: 'message'`, `contact`, `comprobante_pago`, `order_confirmation` o similar.

Recomendacion:

- Cada confirmacion de prendas debe quedar como evidencia.
- Cada comprobante detectado debe quedar como evidencia.

### 5.5 `customers`

Cliente interno de la app principal.

Uso:

- pagos;
- pedidos internos;
- telefono/WhatsApp;
- preparacion;
- etiquetas activas.

Riesgo:

- No debe llenarse con nombres inventados desde WhatsApp.
- Si no hay nombre real, usar telefono como identificador operativo o crear perfil parcial.

### 5.6 `pagos`

Pagos de la app interna.

Uso:

- lista de pagos;
- creacion automatica de pedido en `procesar`;
- identidad manual/MacroDroid.

Para WhatsApp:

- si MacroDroid confirma pago, puede enlazarse a la propuesta WhatsApp.
- si solo hay comprobante, no debe crearse pago definitivo sin revision.

### 5.7 `pedidos`

Pedido interno operativo.

Uso:

- Mesa de Preparacion;
- prendas y bolsas;
- estado;
- etiqueta;
- entrega.

Para WhatsApp:

- debe crearse despues de confirmacion de clienta y pago verificado/manual.
- debe indicar origen (`WHATSAPP`, `LIVE` o similar).
- debe conservar detalle de prendas elegidas.

### 5.8 `whatsapp_message_queue`

Cola de salida.

Uso:

- link de confirmacion;
- confirmacion de pago;
- aviso de pedido listo;
- mensajes manuales.

Recomendacion:

- Todo envio automatico debe pasar por la cola.
- Evitar `window.open(wa.me)` como unica ruta para operaciones importantes.

### 5.9 Tablas de notificaciones bancarias

Tablas relevantes:

- `raw_notification_events`
- `parsed_payment_candidates`
- `manual_review_queue`
- `learned_text_patterns`
- `notification_bank_observations`

Uso:

- recibir y auditar notificaciones;
- extraer nombres/montos;
- aprender patrones;
- mandar a revision manual cuando falten datos.

Estas tablas deben servir como fuente confiable para decir si un pago llego o no.

## 6. Endpoints involucrados

### 6.1 Ingreso y panel WhatsApp

| Endpoint / Funcion | Uso |
|---|---|
| Edge `ingest-whatsapp` | Recibe mensajes del bridge. |
| `POST /api/ai/summarize-conversation` | Resume chat, fotos y audios. |
| `GET /api/identity/whatsapp-photos` | Trae fotos por telefono cerca de una fecha. |
| `GET /api/store/whatsapp-photos` | Espejo de fotos para tienda/Live. |

### 6.2 Identidad

| Endpoint / Funcion | Uso |
|---|---|
| `GET /api/identity/profiles` | Lista perfiles globales. |
| `POST /api/identity/profiles` | Crea/encuentra perfil. |
| `POST /api/identity/sync-whatsapp` | Backfill desde panel WhatsApp. |
| `POST /api/identity/sync-pagos` | Backfill desde pagos. |
| `POST /api/identity/recalculate-confidence` | Recalcula confianza. |
| `POST /api/identity/profiles/:id/merge` | Fusiona perfiles duplicados. |
| `PATCH /api/identity/evidence/:id/reassign` | Corrige evidencia mal vinculada. |
| `fn_link_customer_wa` | Vincula nombre/WhatsApp con `customers`. |

### 6.3 Cola WhatsApp

| Endpoint / Funcion | Uso |
|---|---|
| `GET /api/whatsapp/status` | Estado/QR del bridge. |
| `GET /api/whatsapp/health` | Salud del bridge. |
| `GET /api/whatsapp/queue` | Lista mensajes. |
| `POST /api/whatsapp/queue` | Encola mensaje. |
| `PATCH /api/whatsapp/queue/:id` | Edita/cancela pendiente. |
| `POST /api/whatsapp/send-next` | Envia siguiente mensaje. |
| `POST /api/whatsapp/retry/:id` | Reintenta mensaje fallido. |
| `fn_dequeue_whatsapp_message` | Toma un mensaje con lock atomico. |

### 6.4 Pagos y tienda

| Endpoint / Funcion | Uso |
|---|---|
| Edge `ingest-notification` | Procesa notificacion bancaria. |
| `POST /api/store/ingest-wa` | Cruce de WhatsApp con orden de tienda. |
| `POST /api/store/notify-live-ready` | Encola link de confirmacion Live. |
| `POST /api/store/match-payment` | Match manual/automatico de pago. |
| `POST /api/store/verify-order/:id` | Verificacion manual. |
| `POST /api/pagos` | Registro manual de pago. |
| `POST /api/pedidos` | Creacion manual/interna de pedido. |

## 7. Que ya existe, que falta conectar y que falta implementar

### 7.1 Ya existe

- Bridge WhatsApp con recepcion de texto/media.
- Subida de media a Supabase Storage.
- Edge Function de ingesta WhatsApp.
- Panel de clientes/mensajes.
- Resumen de conversacion con IA.
- Clasificacion basica de imagenes.
- Extraccion de comprobantes con IA.
- Vinculo parcial WhatsApp -> `customers`.
- Sistema de identidad unificada.
- Backfill de WhatsApp a identidad.
- Backfill de pagos a identidad.
- Cola de mensajes salientes.
- Envio controlado via bridge.
- MacroDroid para pagos bancarios.
- Revision manual para notificaciones sin datos suficientes.
- Pedidos internos y Mesa de Preparacion.
- Sistema de casilleros.

### 7.2 Esta parcialmente conectado

- IA -> propuesta estructurada de prendas.
- Propuesta de WhatsApp -> perfil de tienda.
- Perfil WhatsApp -> perfil visible de clienta.
- Comprobante WhatsApp -> revision manual formal.
- Pago MacroDroid -> pedido de WhatsApp especifico.
- Confirmacion de clienta por link.
- Borrador de pedido antes de crear `pedidos`.
- Pedido WhatsApp -> pedido interno con detalle estructurado.
- Estado de seguimiento para la clienta.
- Mensajes automaticos de cada fase por cola.

### 7.3 Falta implementar o formalizar

- Tabla o contrato para "pedido WhatsApp propuesto" antes de crear `pedidos`.
- Estado claro de propuesta: `draft`, `operator_review`, `sent_to_customer`, `customer_confirmed`, `payment_review`, `verified`, `sent_to_preparation`, `cancelled`.
- Link de confirmacion con UI real para la clienta.
- Perfil de clienta que muestre pedidos WhatsApp y tienda en un solo lugar.
- Vista del operador para aceptar/corregir propuesta IA.
- Match entre pago MacroDroid y propuesta WhatsApp.
- Revision manual especifica para ventas WhatsApp.
- Registro de confirmacion de prendas como evidencia.
- Politica clara para nombres faltantes.

## 8. Estados recomendados para ventas WhatsApp

Se recomienda no crear `pedidos` inmediatamente al primer mensaje. Antes debe existir un borrador/propuesta.

Estados recomendados:

| Estado | Significado | Quien avanza |
|---|---|---|
| `inbox` | Chat recibido, sin analisis. | Sistema. |
| `ai_summarized` | IA genero resumen/propuesta. | Sistema. |
| `operator_review` | Operador debe revisar. | Operador. |
| `sent_to_customer` | Link enviado a clienta. | Sistema/cola WA. |
| `customer_confirmed` | Clienta confirmo prendas. | Clienta. |
| `payment_pending` | Falta pago o match. | Sistema. |
| `payment_review` | Hay comprobante o pago ambiguo. | Operador. |
| `payment_verified` | Pago confirmado. | Sistema/operador. |
| `sent_to_preparation` | Pedido interno creado. | Sistema. |
| `preparing` | En Mesa de Preparacion. | Operador. |
| `ready` | Pedido listo y con casillero. | Operador/sistema. |
| `delivered` | Entregado. | Operador. |
| `cancelled` | Cancelado. | Operador/sistema. |

Estos estados pueden implementarse en una tabla nueva o como contrato en una tabla existente, pero deben existir conceptualmente para evitar que el chat salte directo a casillero.

## 9. Perfil de clienta en tienda

La recomendacion es que cada WhatsApp tenga perfil en la tienda para seguimiento.

El perfil debe mostrar:

- datos basicos: telefono, nombre si existe;
- pedidos de tienda;
- pedidos WhatsApp/Live;
- estado de pago;
- prendas pendientes de confirmar;
- prendas confirmadas;
- estado de preparacion;
- estado de entrega;
- historial de mensajes importantes.

Para que eso funcione:

- `store_customers.whatsapp` debe vincularse a `identity_profiles.store_phone` o `phone`;
- `panel_clientes.phone` debe vincularse a `identity_profiles.panel_phone`;
- `customers.id` debe vincularse a `identity_profiles.cliente_id`;
- todos los eventos deben guardar evidencia.

La tienda se convierte en portal de seguimiento, no solo en catalogo.

## 10. Propuesta de datos para el pedido WhatsApp

Aunque este informe no implementa schema, se recomienda que el sistema tenga un objeto de pedido propuesto con:

```json
{
  "source": "WHATSAPP",
  "profile_id": "uuid",
  "panel_cliente_id": "id del panel",
  "customer_phone": "591...",
  "status": "operator_review",
  "items": [
    {
      "descripcion": "blusa roja",
      "talla": "M",
      "cantidad": 1,
      "media_url": "https://...",
      "confidence": "media",
      "confirmed_by_customer": false
    }
  ],
  "payment": {
    "expected_amount": 100,
    "macro_payment_id": null,
    "comprobante_media_url": null,
    "status": "pending"
  },
  "ai_summary": {},
  "operator_notes": "",
  "customer_confirmed_at": null,
  "verified_at": null
}
```

Este objeto puede vivir en una tabla nueva o en una estructura existente, pero separar "propuesta" de "pedido interno" es importante.

## 11. Flujo manual de respaldo

Cada fase debe tener alternativa manual:

| Fase | Manual |
|---|---|
| Crear perfil | Operador crea/vincula perfil por telefono. |
| Analizar chat | Operador lee chat si la IA falla. |
| Detectar prendas | Operador selecciona fotos/prendas manualmente. |
| Confirmar propuesta | Operador corrige y envia link. |
| Confirmar clienta | Operador marca confirmado si la clienta confirma por chat. |
| Verificar pago | Operador revisa MacroDroid/comprobante y aprueba. |
| Crear pedido interno | Boton para mandar a preparacion. |
| Enviar WhatsApp | Cola permite editar/reintentar/cancelar. |
| Preparar | Mesa actual. |
| Casillero | Asignacion actual al marcar listo. |

La automatizacion debe poder apagarse o probarse por fases.

## 12. Riesgos tecnicos actuales

### 12.1 IA creando decisiones finales

Riesgo:

- La IA puede malinterpretar una prenda, talla, cantidad o intencion.

Mitigacion:

- La IA solo propone.
- Operador revisa.
- Clienta confirma por link.

### 12.2 Nombres falsos o incompletos

Riesgo:

- WhatsApp puede no traer nombre real.
- El comprobante puede ocultar pagador.

Mitigacion:

- Telefono como identidad inicial.
- Nombre solo desde evidencia confiable.
- Revision manual si falta nombre para pago.

### 12.3 Comprobante sin notificacion MacroDroid

Riesgo:

- La clienta envia una captura, pero el pago no llego o no coincide.

Mitigacion:

- Estado `payment_review`.
- No verificar automaticamente solo por imagen si no hay datos suficientes.
- Permitir aprobacion manual con auditoria.

### 12.4 Duplicacion de perfiles

Riesgo:

- Mismo cliente puede existir en `panel_clientes`, `store_customers`, `customers` e `identity_profiles`.

Mitigacion:

- Unificar por telefono.
- Depositar evidencia.
- Usar merge manual para duplicados.

### 12.5 Duplicacion de rutas de resumen

Riesgo:

- Hay logica de resumen en Express (`/api/ai/summarize-conversation`) y tambien Edge Function `summarize-conversation`.

Mitigacion:

- Elegir una ruta principal.
- Mantener la otra como legacy o respaldo.

### 12.6 Envio WhatsApp sin control

Riesgo:

- Enviar demasiado rapido o mensajes duplicados.

Mitigacion:

- Usar siempre `whatsapp_message_queue`.
- Idempotencia por `reference_id` y `reference_type`.
- Reintentos controlados.

### 12.7 Pasar a casillero demasiado pronto

Riesgo:

- El pedido se asigna a casillero antes de contar prendas/bolsas.

Mitigacion:

- Crear pedido interno en `procesar`.
- Casillero solo despues de Mesa de Preparacion.

## 13. Checklist de pruebas manuales

### 13.1 Mensaje simple

- Enviar WhatsApp de una clienta nueva.
- Verificar que aparece en `panel_clientes`.
- Verificar que aparece en `panel_mensajes`.
- Verificar que se crea/vincula `identity_profiles`.
- Verificar que se deposita `identity_evidence`.

### 13.2 Fotos de prendas

- Enviar varias fotos de prendas.
- Ejecutar resumen IA.
- Verificar que las fotos aparecen.
- Verificar que la IA propone prendas sin inventar tallas.
- Verificar que el operador puede corregir.

### 13.3 Comprobante

- Enviar foto de comprobante.
- Ejecutar resumen IA.
- Verificar nombre/monto/hora si aparecen.
- Si falta dato, confirmar que queda como revision.
- Si hay pago MacroDroid coincidente, verificar match.

### 13.4 Link de confirmacion

- Crear propuesta aprobada por operador.
- Encolar mensaje con link.
- Enviar por cola.
- Abrir link como clienta.
- Confirmar prendas.
- Verificar que queda evidencia de confirmacion.

### 13.5 Pago verificado

- Confirmar propuesta.
- Simular pago MacroDroid.
- Verificar que se cruza con la venta WhatsApp.
- Encolar confirmacion de pago.
- Crear pedido interno.

### 13.6 Pago ambiguo

- Crear dos propuestas con mismo monto.
- Enviar notificacion bancaria sin referencia.
- Verificar que no se confirma automaticamente.
- Revisar manualmente.
- Aprobar una sola.

### 13.7 Preparacion y casillero

- Pedido verificado entra en `pedidos`.
- Operador abre Mesa de Preparacion.
- Confirma prendas y bolsas.
- Marca listo.
- Backend asigna casillero.
- Entrega libera casillero.

## 14. Recomendacion de implementacion por prioridad

### Prioridad 1 - Modelo de propuesta WhatsApp

- Crear o definir contrato para pedido propuesto.
- Guardar items, fotos, resumen IA, estado y referencia a `panel_cliente`.
- No crear `pedidos` hasta confirmar.

### Prioridad 2 - Perfil de clienta

- Asegurar que cada telefono WhatsApp tenga perfil de tienda.
- Mostrar pedidos WhatsApp y tienda juntos.
- Agregar estados de seguimiento.

### Prioridad 3 - Revision del operador

- Convertir `PanelPedidos` en bandeja de revision.
- Botones: aprobar propuesta, corregir, pedir confirmacion, mandar a pago/revision.
- Mostrar evidencias claras.

### Prioridad 4 - Link de confirmacion

- Crear vista en tienda para confirmar prendas.
- Mostrar fotos, tallas, cantidades, total y estado de pago.
- Guardar confirmacion como evidencia.

### Prioridad 5 - Pago y revision manual

- Cruzar propuesta con MacroDroid.
- Si falla, mandar a revision manual.
- Registrar aprobacion manual con auditoria.

### Prioridad 6 - Preparacion

- Crear pedido interno despues de pago/confirmacion.
- Mantener `source` claro.
- Incluir detalle de prendas.
- No asignar casillero hasta confirmar bolsas/prendas.

### Prioridad 7 - Mensajeria

- Todos los mensajes salientes por cola.
- Mensajes por evento: link enviado, pago verificado, pedido en preparacion, pedido listo.
- Reintentos y fallos visibles.

## 15. Conclusion

El flujo WhatsApp/Ventas Live es implementable sin rehacer toda la aplicacion, porque ya existen las bases:

- bridge WhatsApp;
- ingesta de mensajes;
- panel de conversaciones;
- IA de resumen;
- deteccion de comprobantes;
- identidad global;
- MacroDroid;
- cola WhatsApp;
- pedidos internos;
- casilleros.

La pieza que falta no es una tecnologia nueva, sino un contrato central: una propuesta de pedido WhatsApp que viva entre el chat y el pedido interno.

El camino recomendado es:

1. WhatsApp crea identidad y evidencia.
2. IA crea propuesta.
3. Operador revisa.
4. Clienta confirma por link.
5. Pago se verifica por MacroDroid o manual.
6. Se crea pedido interno.
7. Operador confirma prendas/bolsas.
8. Casillero se asigna automaticamente.

Este enfoque mantiene control humano en los puntos donde hay riesgo, pero automatiza el trabajo repetitivo que hoy consume mas tiempo.
