# Resumen Ejecutivo

**Proyecto:** MVP de Integración WhatsApp para "Ventas Live"  
**Objetivo Base:** Dotar al sistema actual (que ya cuenta con UI web en React/Express y persistencia en Supabase) de la capacidad automatizada e ininterrumpida de recibir, formatear y persistir mensajes de WhatsApp (tanto texto puro como contenido multimedia/imágenes) de clientes, centralizándolo como un *Panel de Pedidos*.

## Principios del MVP
1. **Intervención nula:** El vendedor/recepcionista solo escanea un código QR en el backend; de ahí en más, todo flujo entrante y saliente se mapea sin intervención manual.
2. **Pipelines sin servidor local indispensable:** Desacoplar la recepción de WhatsApp del frontend. Una solución "Bridge" en Node.js captura el evento y usa la fiabilidad asíncrona de n8n para el enrutamiento complejo.
3. **Escalabilidad y Auditoría:** Guardar los *payloads crudos* para prevención de pérdida de datos e hidratación/replay futuro.
4. **Respuesta Simple:** Devolver estatus HTTP 200 de confirmación sólida al webhhok, aislando el puente de WhatsApp de la carga procesal de Base de datos.
