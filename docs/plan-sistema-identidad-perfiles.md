# Plan Completo — Sistema de Identidad y Perfiles
## Ventas Live · Abril 2026
### Versión 1.0 — Aprobado para implementación

---

## Visión General

Construir un servicio de identidad separado cuyo único trabajo es recolectar datos de todos los canales de la aplicación y construir perfiles verificados de cada clienta. El servicio es manual ahora y automático después. No rompe nada de lo que ya funciona.

---

## Los tres principios que guían todo el plan

**Principio 1 — Aditivo siempre**
Nada de lo que ya funciona se toca. Toda nueva funcionalidad se agrega encima. Si algo falla en el sistema nuevo, la app principal sigue funcionando igual que hoy.

**Principio 2 — El buzón central**
Cada sistema deposita sus datos relevantes en una tabla de evidencias unificada en la base principal. El pulpo solo lee de ese buzón. No necesita entender la estructura interna de cada sistema.

**Principio 3 — Manual ahora, automático después**
Cada función tiene su switch. Apagado significa que el operador hace el trabajo. Encendido significa que la IA lo hace sola. Los switches se construyen desde el inicio pero empiezan apagados.

---

## Las tres bases de datos del sistema

| Nombre | ID | Para qué se usa |
|--------|-----|----------------|
| ChehiAppAbril | `vhczofpmxzbqzboysoca` | App principal: clientes, pagos, pedidos, casilleros |
| TiendaOnline | `thgbfurscfjcmgokyyif` | Tienda online: productos, compras, perfiles de tienda |
| Panel WhatsApp | `vwaocoaeenavxkcshyuf` | Conversaciones: mensajes, fotos, audios, resúmenes |

---

## Arquitectura del sistema nuevo

### Los cuatro archivos nuevos

**`src/services/identityService.ts`**
El cerebro del sistema. Contiene toda la lógica del pulpo. Ninguna pantalla lo toca directamente, solo los endpoints.

**`src/routes/identity.ts`**
Los endpoints REST propios del sistema. Se montan en el servidor con una línea. Completamente separados de `server.ts`.

**`src/components/AiLearningPanel.tsx`**
El panel de aprendizaje en Configuraciones.

**`src/components/WaLinkModal.tsx`**
El modal para vincular un número de WhatsApp a un cliente.

### Las tres tablas nuevas en ChehiAppAbril

#### `identity_evidence` — El buzón central

| Campo | Tipo | Qué guarda |
|-------|------|-----------|
| `id` | BIGSERIAL PK | Identificador único |
| `user_id` | TEXT | El operador dueño del dato |
| `customer_id` | BIGINT FK NULL | El cliente (puede ser nulo si aún no está vinculado) |
| `wa_number` | TEXT NULL | Número de WhatsApp si se identificó |
| `source` | TEXT | Origen: `macrodroid`, `whatsapp_panel`, `whatsapp_summary`, `store`, `manual` |
| `evidence_type` | TEXT | Tipo: `payment`, `message`, `comprobante`, `order`, `profile` |
| `raw_name` | TEXT NULL | El nombre tal como llegó, sin modificar |
| `amount` | NUMERIC NULL | El monto si había uno |
| `bank` | TEXT NULL | El banco o app de pago |
| `operation_ref` | TEXT NULL | Número de operación para evitar duplicados |
| `event_date` | TIMESTAMPTZ | Cuándo ocurrió el evento original |
| `metadata` | JSONB NULL | Datos extra según el tipo |
| `processed` | BOOLEAN | Si el pulpo ya lo procesó |
| `created_at` | TIMESTAMPTZ | Cuándo entró al buzón |

#### `customer_wa_links` — Vínculos confirmados

| Campo | Tipo | Qué guarda |
|-------|------|-----------|
| `id` | BIGSERIAL PK | Identificador único |
| `customer_id` | BIGINT FK | El cliente en ChehiAppAbril |
| `wa_number` | TEXT | El número de WhatsApp vinculado |
| `user_id` | TEXT | El operador que confirmó |
| `confirmed_by` | TEXT | Cómo se confirmó: `manual`, `auto_name`, `auto_comprobante`, `auto_store` |
| `confirmed_at` | TIMESTAMPTZ | Cuándo se confirmó |
| `is_active` | BOOLEAN | Si el vínculo está activo |

#### `ai_decisions_log` — Registro de aprendizaje

| Campo | Tipo | Qué guarda |
|-------|------|-----------|
| `id` | BIGSERIAL PK | Identificador único |
| `user_id` | TEXT | El operador |
| `feature` | TEXT | Qué función de IA tomó la decisión |
| `decision` | TEXT | Qué decidió en texto legible |
| `input_data` | JSONB | Qué datos recibió |
| `output_data` | JSONB | Qué devolvió |
| `was_correct` | BOOLEAN NULL | Nulo = no revisado |
| `correction` | TEXT NULL | Qué debería haber hecho si estuvo mal |
| `reviewed_at` | TIMESTAMPTZ NULL | Cuándo fue revisado |
| `created_at` | TIMESTAMPTZ | Cuándo ocurrió |

### Los endpoints nuevos

```
GET    /api/identity/customer/:id              → perfil completo con evidencias y vínculos
POST   /api/identity/customer/:id/link-wa      → vincular número de WhatsApp manualmente
DELETE /api/identity/customer/:id/link-wa      → desvincular número
GET    /api/identity/customer/:id/photos       → fotos del panel WA por fecha
GET    /api/identity/customer/:id/store-orders → pedidos de la tienda vinculados
POST   /api/identity/evidence                  → depositar evidencia manualmente
GET    /api/identity/evidence/pending          → evidencias sin procesar
POST   /api/identity/evidence/:id/assign       → asignar evidencia a un cliente
GET    /api/identity/ai-switches               → estado actual de todos los switches
POST   /api/identity/ai-switches               → actualizar switches
GET    /api/identity/learning-log              → registro de decisiones de IA
POST   /api/identity/learning-log/:id/review   → marcar decisión como correcta o incorrecta
```

---

## Los switches de IA

| Switch | Qué hace cuando está encendido |
|--------|-------------------------------|
| `auto_link_by_name` | Vincula automáticamente si el nombre bancario coincide con un cliente |
| `auto_extract_comprobante` | Analiza fotos del panel con IA sin que el operador lo pida |
| `auto_link_by_comprobante` | Vincula si el comprobante detectado coincide con un cliente |
| `auto_profile_from_store` | Crea perfil en la app cuando llega un pedido de tienda sin perfil existente |
| `auto_suggestions` | Muestra sugerencias de posibles vínculos para revisión manual |

---

## Resumen del orden de implementación

| Fase | Qué se construye | Impacto visible |
|------|-----------------|----------------|
| 0 | Fixes técnicos | Panel de pedidos y resúmenes funcionan |
| 1 | Base del servicio | Nada visible todavía |
| 2 | Todos los sistemas depositan | Nada visible todavía |
| 3 | Vinculación manual | Botón de vincular WhatsApp en el perfil |
| 4 | Fotos en pedidos | Carrusel de fotos en detalle del pedido |
| 5 | Historial de tienda | Compras online visibles en el perfil |
| 6 | Switches de IA | Panel de automatizaciones en Configuraciones |
| 7 | Panel de aprendizaje | Registro de decisiones en Configuraciones |
| 8 | Funciones automáticas | Cada switch funciona de verdad |

---

## Lo que no se toca en ninguna fase

- El flujo Lista de Pagos → Perfil → Mesa de Preparación → Regreso
- El sistema de casilleros y etiquetas
- El pipeline de MacroDroid (solo se le agrega el paso de depositar en el buzón)
- La estructura de autenticación actual
- La tienda online (solo se lee, nunca se modifica)
- El panel de WhatsApp (solo se lee, nunca se modifica)

---

---

# PLAN DETALLADO POR FASES

---

## FASE 0 — Limpieza técnica previa

**Objetivo:** Dejar funcionando todo lo que está roto antes de construir encima.

### Tareas

**Tarea 0.1 — Conectar el router de IA al servidor**
El archivo `src/routes/ai-gateway.ts` existe pero nunca fue conectado a `server.ts`. Se monta con una línea. Los endpoints duplicados en `server.ts` se eliminan.

**Tarea 0.2 — Reconectar el botón de resumen del panel**
`PanelPedidos.tsx` llama a `/api/ai/summarize-conversation` pero ese endpoint no existe en el servidor activo. Se conecta correctamente al router de IA.

**Tarea 0.3 — Corregir el error interno de la Edge Function**
La función `summarize-conversation` en Supabase tiene una variable `GEMINI_KEY` no definida. Se corrige y se redespliega.

### Protocolo de prueba — Fase 0

**Prueba 0.A — El endpoint de IA responde**
- Abrir el panel de pedidos
- Entrar a cualquier conversación
- Tocar "Generar resumen"
- Resultado esperado: el resumen aparece en menos de 15 segundos
- Si falla: revisar los logs del servidor buscando "ai-gateway"

**Prueba 0.B — Los endpoints de comprobantes responden**
- Ir a Configuraciones → Inteligencia Artificial
- Tocar "Probar key"
- Resultado esperado: respuesta en menos de 5 segundos con mensaje de key válida

**Prueba 0.C — No hay endpoints duplicados**
- Verificar en `server.ts` que no existen rutas `/api/ai/` directas
- Todas deben estar en `src/routes/ai-gateway.ts`

### Señales de alerta en producción — Fase 0
- Más de 3 errores consecutivos en `ai_usage_log` con `success = false`
- Tiempo de respuesta de resúmenes mayor a 30 segundos
- El campo `error_message` en `ai_usage_log` aparece frecuentemente con "404"

---

## FASE 1 — La base del sistema

**Objetivo:** Crear la infraestructura del servicio de identidad sin que el operador note nada todavía.

### Tareas

**Tarea 1.1 — Crear las migraciones**
Archivos SQL para `identity_evidence`, `customer_wa_links`, `ai_decisions_log` en ChehiAppAbril. Aplicar con Supabase CLI.

**Tarea 1.2 — Crear el servicio de identidad**
`src/services/identityService.ts` con funciones base: `depositEvidence`, `linkCustomerWA`, `unlinkCustomerWA`, `getLinkedWA`, `getEvidenceForCustomer`.

**Tarea 1.3 — Crear el router de identidad**
`src/routes/identity.ts` montado en `server.ts` con los endpoints básicos.

**Tarea 1.4 — MacroDroid deposita en el buzón**
Modificar el pipeline de MacroDroid para que además de crear el pago, deposite evidencia en `identity_evidence`.

### Protocolo de prueba — Fase 1

**Prueba 1.A — Las tablas existen y aceptan datos**
- Ejecutar desde Supabase SQL Editor:
  ```sql
  INSERT INTO identity_evidence (user_id, source, evidence_type, event_date)
  VALUES ('test-user', 'manual', 'payment', now());
  SELECT * FROM identity_evidence LIMIT 1;
  ```
- Resultado esperado: la fila aparece sin error

**Prueba 1.B — MacroDroid deposita correctamente**
- Simular un pago entrante de MacroDroid (usar el script de prueba existente)
- Verificar en Supabase que aparece una fila en `identity_evidence` con `source = 'macrodroid'`
- Verificar que el pago también se creó normalmente en `pagos`
- Resultado esperado: ambas filas existen, nada se rompió en el flujo normal

**Prueba 1.C — No hay duplicados**
- Enviar el mismo pago de prueba dos veces
- Verificar que `pagos` tiene una sola fila (idempotencia)
- Verificar que `identity_evidence` también tiene una sola fila (usar `operation_ref`)

**Prueba 1.D — El endpoint base responde**
- `GET /api/identity/customer/1`
- Resultado esperado: respuesta JSON con los datos del cliente

### Señales de alerta en producción — Fase 1
- Filas en `identity_evidence` con `source = 'macrodroid'` pero sin `amount` (dato incompleto)
- Pagos creados en `pagos` pero sin fila correspondiente en `identity_evidence`
- Errores en el log del servidor con el tag `[identity-service]`

---

## FASE 2 — Todos los sistemas depositan en el buzón

**Objetivo:** Que el buzón se alimente solo desde todos los canales sin intervención del operador.

### Tareas

**Tarea 2.1 — La tienda deposita sus pedidos**
Al crear un pedido en la tienda: depositar evidencia con WhatsApp, nombre y monto. Si no existe perfil en la app principal, crearlo automáticamente.

**Tarea 2.2 — Resúmenes de WhatsApp depositan comprobantes**
Al generar un resumen con comprobante detectado: depositar evidencia y crear el pago automáticamente en el panel de pagos con el número de WhatsApp como identificador.

**Tarea 2.3 — El panel de WhatsApp deposita números nuevos**
Al llegar un mensaje de un número sin vincular: depositar evidencia de tipo `message`.

### Protocolo de prueba — Fase 2

**Prueba 2.A — Pedido de tienda genera evidencia y perfil**
- Crear un pedido de prueba en la tienda con un número nuevo
- Verificar en ChehiAppAbril que existe una fila en `identity_evidence` con `source = 'store'`
- Verificar que existe un nuevo cliente en `customers` con el nombre de la tienda
- Resultado esperado: ambas cosas ocurren en menos de 5 segundos

**Prueba 2.B — Comprobante detectado genera pago**
- Abrir una conversación en el panel de pedidos que tenga una foto de comprobante
- Generar el resumen
- Verificar que el campo `comprobante` del resumen no es nulo
- Verificar que apareció un nuevo pago en `pagos` con el número de WhatsApp como nombre
- Resultado esperado: el pago aparece automáticamente en la lista de pagos

**Prueba 2.C — Número nuevo genera evidencia**
- Enviar un mensaje desde un número que nunca haya escrito antes
- Verificar en `identity_evidence` que aparece una fila con `source = 'whatsapp_panel'` y `evidence_type = 'message'`

**Prueba 2.D — No se crean pagos duplicados**
- Generar el resumen de la misma conversación dos veces
- Verificar que solo existe un pago en `pagos` para ese comprobante (usar `operation_ref`)

### Señales de alerta en producción — Fase 2
- Pedidos de tienda sin fila correspondiente en `identity_evidence`
- Comprobantes detectados en resúmenes que no generaron pago en `pagos`
- Crecimiento anormal en `identity_evidence` (más de 100 filas por hora podría indicar loop)

---

## FASE 3 — Vinculación manual de WhatsApp

**Objetivo:** El operador puede vincular manualmente un número a cualquier cliente.

### Tareas

**Tarea 3.1 — Botón de vinculación en el perfil del cliente**
Sección nueva debajo del nombre: número vinculado con botón de desvincular, o botón "Vincular WhatsApp" si no hay número.

**Tarea 3.2 — Modal de vinculación**
Al tocar el botón: modal con campo de texto para el número. El sistema busca evidencias existentes para ese número y las muestra antes de confirmar.

**Tarea 3.3 — Panel de evidencias en el perfil**
Sección colapsable que muestra todas las evidencias del cliente: origen, tipo, monto, fecha.

### Protocolo de prueba — Fase 3

**Prueba 3.A — Vinculación manual completa**
- Abrir el perfil de un cliente existente
- Tocar "Vincular WhatsApp"
- Escribir un número que tenga evidencias en el buzón
- Verificar que el modal muestra las evidencias de ese número
- Confirmar la vinculación
- Resultado esperado: el número aparece en el perfil, la fila en `customer_wa_links` existe con `confirmed_by = 'manual'`

**Prueba 3.B — No se puede vincular el mismo número a dos clientes**
- Intentar vincular un número ya vinculado a otro cliente
- Resultado esperado: el sistema muestra un aviso de que ese número ya está en uso

**Prueba 3.C — Desvincular funciona**
- Desvincular un número
- Verificar que en `customer_wa_links` la fila tiene `is_active = false`
- Verificar que el perfil ya no muestra el número

**Prueba 3.D — Las evidencias se muestran correctamente**
- Vincular un cliente con un número que tiene múltiples evidencias
- Verificar que el panel de evidencias en el perfil muestra todas las filas de `identity_evidence` para ese número

### Señales de alerta en producción — Fase 3
- Mismo número vinculado a más de un cliente activo (error de integridad)
- Vinculaciones creadas sin `confirmed_at` (falla en el registro)

---

## FASE 4 — Fotos en el detalle del pedido

**Objetivo:** El operador ve las fotos de las prendas directamente en la mesa de preparación.

### Tareas

**Tarea 4.1 — Sección de fotos en el detalle del pedido**
Entre los pagos y los contadores de bolsas: sección "Fotos del pedido".

**Tarea 4.2 — Lógica de búsqueda de fotos por fecha**
El sistema busca en el panel de WhatsApp todas las fotos enviadas por esa clienta en el mismo día del pedido.

**Tarea 4.3 — Carrusel con vista en grande**
Fotos en carrusel horizontal. Al tocar una foto se abre en pantalla completa. Al tocar la pantalla completa se cierra.

**Tarea 4.4 — Estados sin fotos o sin vinculación**
Sin WhatsApp vinculado: botón "Vincular WhatsApp para ver fotos". Con WhatsApp vinculado pero sin fotos ese día: mensaje discreto "Sin fotos para este pedido".

### Protocolo de prueba — Fase 4

**Prueba 4.A — Fotos del día correcto aparecen**
- Crear un pedido con fecha de hoy para un cliente con WhatsApp vinculado
- Asegurarse de que ese número tiene fotos enviadas hoy en el panel
- Abrir el detalle del pedido
- Resultado esperado: las fotos aparecen en el carrusel

**Prueba 4.B — Fotos de otro día no aparecen**
- Abrir un pedido de hace una semana del mismo cliente
- Resultado esperado: el carrusel está vacío o muestra "Sin fotos para este pedido"

**Prueba 4.C — El carrusel funciona táctilmente**
- Deslizar el carrusel horizontalmente
- Tocar una foto para verla en grande
- Tocar la pantalla completa para cerrarla
- Resultado esperado: todo funciona sin bloquear el resto de la pantalla

**Prueba 4.D — Sin vinculación muestra el botón correcto**
- Abrir el detalle de un pedido de un cliente sin WhatsApp vinculado
- Resultado esperado: aparece el botón "Vincular WhatsApp para ver fotos"
- Tocar ese botón abre el modal de vinculación directamente

**Prueba 4.E — El flujo de mesa de preparación no se rompe**
- Completar el flujo completo: abrir pedido → contar prendas → tocar "PEDIDO LISTO"
- Verificar que la sección de fotos no interfiere con los botones de conteo ni con el botón de confirmar
- Resultado esperado: el flujo existente funciona exactamente igual que antes

### Señales de alerta en producción — Fase 4
- El endpoint `/api/identity/customer/:id/photos` tarda más de 3 segundos (indica problema de conexión con el panel WA)
- Fotos que no cargan (URLs del bucket expiradas o bucket privado)
- El detalle del pedido no carga porque falla la petición de fotos (el componente debe fallar silenciosamente)

---

## FASE 5 — Historial de la tienda visible desde el perfil principal

**Objetivo:** El operador ve en un solo lugar toda la actividad de una clienta.

### Tareas

**Tarea 5.1 — Sección de pedidos de tienda en el perfil**
Si el cliente tiene WhatsApp vinculado con pedidos en la tienda: sección "Compras en tienda" con listado de productos, montos, estado y fecha.

**Tarea 5.2 — Indicador en la lista de pagos**
Clientes con pedidos de tienda activos muestran un indicador visual en la lista principal.

### Protocolo de prueba — Fase 5

**Prueba 5.A — Pedidos de tienda aparecen en el perfil**
- Vincular a un cliente con un número que tiene pedidos en la tienda
- Abrir el perfil del cliente
- Resultado esperado: la sección "Compras en tienda" muestra los pedidos con su estado

**Prueba 5.B — Sin pedidos de tienda no aparece la sección**
- Abrir el perfil de un cliente sin pedidos de tienda
- Resultado esperado: la sección "Compras en tienda" no aparece

**Prueba 5.C — El indicador en la lista es preciso**
- Verificar que solo los clientes con pedidos de tienda `pending` o `paid` muestran el indicador
- Los que solo tienen pedidos `delivered` no deberían mostrarlo

### Señales de alerta en producción — Fase 5
- El perfil tarda en cargar porque la consulta a TiendaOnline es lenta
- Pedidos de tienda que aparecen en el perfil equivocado (error de vinculación)

---

## FASE 6 — Switches de IA con modo de prueba

**Objetivo:** El operador tiene control total sobre qué funciones automáticas están activas.

### Tareas

**Tarea 6.1 — Panel de IA en Configuraciones**
Sección "Inteligencia Artificial — Automatizaciones" con switch maestro y switches individuales.

**Tarea 6.2 — Modo de prueba por switch**
Cada switch tiene un botón "Probar" que simula qué habría hecho la IA con el último evento relevante.

### Los switches y su modo de prueba

| Switch | Cómo probar |
|--------|------------|
| Vinculación por nombre | Tomar el último pago de MacroDroid y mostrar qué cliente habría vinculado |
| Extracción de comprobantes | Tomar la última foto del panel y mostrar qué extrae la IA |
| Vinculación por comprobante | Mostrar si el comprobante extraído habría vinculado algún cliente |
| Perfiles desde tienda | Mostrar el último pedido de tienda sin perfil y qué perfil habría creado |
| Sugerencias | Mostrar las sugerencias pendientes sin actuar sobre ellas |

### Protocolo de prueba — Fase 6

**Prueba 6.A — El switch maestro controla todos**
- Activar el switch maestro
- Verificar que todos los switches individuales quedan habilitados
- Desactivar el switch maestro
- Verificar que ninguna función automática actúa aunque los switches individuales estén encendidos

**Prueba 6.B — Modo de prueba no modifica datos**
- Tocar "Probar" en cualquier switch
- Resultado esperado: el sistema muestra lo que haría sin hacerlo realmente
- Verificar que no se crearon nuevos registros en `customer_wa_links` ni en `ai_decisions_log`

**Prueba 6.C — Activar un switch individual funciona**
- Activar solo el switch de "Extracción de comprobantes"
- Esperar a que llegue una foto al panel de WhatsApp
- Verificar que se registra una decisión en `ai_decisions_log`
- Verificar que no se activaron otras funciones automáticas

### Señales de alerta en producción — Fase 6
- Un switch activo no registra decisiones en `ai_decisions_log` (la función no está corriendo)
- Más de 10 decisiones en 1 minuto de un mismo switch (posible loop)

---

## FASE 7 — Panel de aprendizaje

**Objetivo:** El sistema acumula memoria de sus errores para mejorar con el tiempo.

### Tareas

**Tarea 7.1 — Panel de aprendizaje en Configuraciones**
Sección "Registro de aprendizaje" con lista de decisiones de IA.

**Tarea 7.2 — Tarjetas de decisión con marcado**
Cada decisión muestra qué función, qué datos, qué decidió. El operador puede marcar correcta o incorrecta. Si incorrecta, puede escribir qué debería haber hecho.

**Tarea 7.3 — Estadísticas de precisión**
Resumen arriba del panel: total de decisiones, revisadas, porcentaje de acierto por función.

### Protocolo de prueba — Fase 7

**Prueba 7.A — Las decisiones se registran correctamente**
- Activar un switch y dejar que tome algunas decisiones
- Abrir el panel de aprendizaje
- Resultado esperado: las decisiones aparecen con todos sus campos completos

**Prueba 7.B — Marcar como incorrecto funciona**
- Marcar una decisión como incorrecta y escribir la corrección
- Verificar en `ai_decisions_log` que `was_correct = false` y `correction` tiene el texto

**Prueba 7.C — Las estadísticas son precisas**
- Con 10 decisiones donde 7 fueron marcadas como correctas:
- Resultado esperado: el panel muestra 70% de acierto para esa función

### Señales de alerta en producción — Fase 7
- Porcentaje de acierto de cualquier función por debajo del 70% durante 3 días seguidos
- Más de 20 decisiones sin revisar acumuladas (el operador no está usando el panel)

---

## FASE 8 — Funciones automáticas construidas y dormidas

**Objetivo:** Toda la automatización lista para activar cuando el operador lo decida.

### Tareas

**Tarea 8.1 — Vinculación automática por nombre**
Compara el nombre bancario de MacroDroid con `customers` usando normalización. Si similitud > umbral configurable, vincula y registra decisión.

**Tarea 8.2 — Extracción automática de comprobantes**
Al llegar una foto al panel, si el switch está encendido, analiza con Gemini automáticamente.

**Tarea 8.3 — Vinculación automática por comprobante**
Si la extracción devuelve nombre con alta confianza y coincide con un cliente, vincula. Si hay ambigüedad, crea sugerencia.

**Tarea 8.4 — Creación automática de perfiles desde tienda**
Al llegar pedido de tienda sin perfil en la app, crea el perfil automáticamente.

### Protocolo de prueba — Fase 8

**Prueba 8.A — Vinculación por nombre: precisión**
- Activar el switch de vinculación por nombre
- Enviar 10 pagos de prueba con nombres conocidos (5 que coinciden exactamente, 3 con pequeñas variaciones, 2 que no coinciden con nadie)
- Resultado esperado:
  - Los 5 exactos: vinculados correctamente
  - Los 3 con variaciones: vinculados correctamente si la similitud > 80%
  - Los 2 sin match: sin vinculación, evidencia guardada como no procesada

**Prueba 8.B — Extracción de comprobantes: precisión**
- Enviar 5 fotos de comprobantes reales al panel de WhatsApp
- Verificar que `ai_decisions_log` tiene 5 filas con `feature = 'auto_extract_comprobante'`
- Verificar que los campos `raw_name`, `amount`, `bank` están completos en `identity_evidence`
- Resultado esperado: mínimo 4 de 5 extraídos correctamente

**Prueba 8.C — No se generan falsos positivos con fotos de ropa**
- Enviar 3 fotos de prendas (no comprobantes) al panel
- Resultado esperado: no se crean filas en `identity_evidence` de tipo `comprobante`
- El clasificador las detecta como `prenda` y no las procesa como pago

**Prueba 8.D — Creación de perfil desde tienda es idempotente**
- Simular el mismo pedido de tienda llegando dos veces
- Resultado esperado: solo se crea un perfil en `customers`, no dos

### Señales de alerta en producción — Fase 8

**Umbrales críticos:**

| Métrica | Alerta amarilla | Alerta roja |
|---------|----------------|------------|
| Precisión vinculación por nombre | < 75% | < 60% |
| Precisión extracción comprobantes | < 70% | < 55% |
| Falsos positivos en fotos de ropa | > 5% | > 10% |
| Perfiles duplicados creados desde tienda | > 2 por semana | > 5 por semana |
| Decisiones sin revisar acumuladas | > 30 | > 50 |

---

## Monitoreo continuo en producción

### Métricas que revisar semanalmente

1. **Tasa de vinculación:** porcentaje de clientes con WhatsApp vinculado vs total de clientes activos. Objetivo a 3 meses: 60%. Objetivo a 6 meses: 80%.

2. **Precisión de la IA por función:** porcentaje de decisiones marcadas como correctas en el panel de aprendizaje. Si una función baja del 70%, desactivar el switch hasta investigar.

3. **Evidencias sin procesar:** cantidad de filas en `identity_evidence` con `processed = false` y más de 48 horas de antigüedad. Si hay muchas, el pulpo no está corriendo o está fallando silenciosamente.

4. **Errores de IA:** filas en `ai_usage_log` con `success = false` del día anterior. Si supera el 10% del total de llamadas, hay un problema con las API keys o con Gemini.

5. **Fotos del panel sin cargar:** si el operador reporta que el carrusel no muestra fotos, verificar que el bucket `whatsapp-media` sigue siendo público y que las URLs no expiraron.

### Cómo detectar que algo se rompió antes de que el operador lo note

- Si `identity_evidence` no recibe filas nuevas en más de 6 horas durante horario operativo: el pipeline de MacroDroid o el panel de WhatsApp dejó de enviar datos.
- Si `customer_wa_links` no crece en semanas: nadie está vinculando manualmente o el botón está roto.
- Si `ai_decisions_log` crece muy rápido (más de 100 filas por hora): hay un loop en alguna función automática.
- Si los resúmenes del panel de WhatsApp dejan de generarse: la Edge Function `summarize-conversation` falló o la API key de Gemini se agotó.

### Comandos útiles para diagnóstico rápido

```sql
-- Ver evidencias de las últimas 24 horas por fuente
SELECT source, count(*) FROM identity_evidence
WHERE created_at > now() - interval '24 hours'
GROUP BY source;

-- Ver decisiones de IA sin revisar
SELECT feature, count(*) FROM ai_decisions_log
WHERE was_correct IS NULL
GROUP BY feature;

-- Ver precisión por función
SELECT feature,
  count(*) as total,
  sum(case when was_correct = true then 1 else 0 end) as correctas,
  round(100.0 * sum(case when was_correct = true then 1 else 0 end) / count(*), 1) as precision_pct
FROM ai_decisions_log
WHERE was_correct IS NOT NULL
GROUP BY feature;

-- Ver clientes sin WhatsApp vinculado
SELECT count(*) FROM customers c
LEFT JOIN customer_wa_links l ON c.id = l.customer_id AND l.is_active = true
WHERE l.id IS NULL AND c.is_active = true;
```

---

## Criterios de éxito por fase

| Fase | Criterio de éxito |
|------|------------------|
| 0 | El botón de resumen en el panel de pedidos funciona al 100% |
| 1 | MacroDroid deposita evidencia en cada pago sin excepciones |
| 2 | Los 5 canales depositan evidencia sin intervención manual |
| 3 | El operador puede vincular y desvincular números sin errores |
| 4 | Las fotos correctas aparecen en el detalle del pedido correspondiente |
| 5 | Los pedidos de tienda se ven en el perfil principal sin demoras |
| 6 | Cada switch funciona de forma independiente con su modo de prueba |
| 7 | El panel de aprendizaje muestra estadísticas precisas y actualizadas |
| 8 | Precisión mínima del 75% en todas las funciones automáticas antes de activarlas en producción |

---

*Documento generado: Abril 2026*
*Estado: Aprobado para implementación*
*Próxima revisión: Al completar Fase 4*
