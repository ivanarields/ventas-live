# Backlog de Fases de Implementación Técnica

Este backlog define las dependencias obligatorias previas. Ningún ticket puede desarrollarse sin el cierre íntegro de su predecesor.

### EPIC 1: Preparación de Base de Datos y Storage (Fase 2)
- [ ] Tarea 1.1: Revisar y actualizar SQL de tabla `raw_whatsapp_events` y `whatsapp_messages`.
- [ ] Tarea 1.2: Definir y aprovisionar Bucket `whatsapp-media` (políticas públicas de read, privadas de write para n8n).
- [ ] Tarea 1.3: Definir campos obligatorios e índices para búsquedas telefónicas (e.g. `normalized_phone`).

### EPIC 2: Bridge de Recepción WhatsApp-Node.js (Fase 3)
- [ ] Tarea 2.1: Bootstrap proyecto Node.js v18 con Puppeteer / whatsapp-web.js.
- [ ] Tarea 2.2: Lógica de `LocalAuth` para reinicios programados sin matar sesión.
- [ ] Tarea 2.3: Interceptor de mensajes (Text + Media con base64 stream).
- [ ] Tarea 2.4: Wrapper HTTP POST al webhook dinámico provisto en entorno local/Render.

### EPIC 3: El Cerebro Semántico n8n (Fase 4)
- [ ] Tarea 3.1: Configurar Webhook receptor.
- [ ] Tarea 3.2: Implementar nodo Code JS para uniformidad de teléfonos bolivianos y alias.
- [ ] Tarea 3.3: Implementar IF Node (HasMedia -> Subir a Supabase API vs TextOnly).
- [ ] Tarea 3.4: Nodo HTTP Request para Supabase Upsert (Customers).
- [ ] Tarea 3.5: Nodo HTTP Request para Supabase Insert (Messages).

### EPIC 4: Unificación E2E y QA (Fases 5 y 6)
- [ ] Tarea 4.1: Deploy del Node Bridge en Railway.
- [ ] Tarea 4.2: Prueba de Humo en Sandbox.
- [ ] Tarea 4.3: Auditoría y gestión ante errores y cuellos de botella (Payload pesado).
