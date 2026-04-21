# Riesgos y Supuestos Técnicos

## Riesgos y Mitigaciones
1. **Riesgo: Baneos de WhatsApp por automatización (alto)**
   * *Mitigación:* Se usará el sistema únicamente puramente pasivo (escuchar). Los envíos de respuesta deben dosificarse e incluir pausas `delay`. No spamear.
2. **Riesgo: Payload masivo (Videos HD / Audios gigantes) tirando el server (medio)**
   * *Mitigación:* En Fase 3 se limitará la encriptación base64 en memoria a archivos < 10MB descartando el resto explícitamente en el Node.js.
3. **Riesgo: Fallo silencioso del Webhook n8n (alto)**
   * *Mitigación:* El Bridge de Node.js implementará un `try-catch` envolvente de axios. Si n8n devuelve error > 400 (o Timeout), un archivo crudo logueará temporalmente el fallo para reintento.

## Supuestos 
1. **Infraestructura Cloud:** Supabase se usará en formato API REST directo desde n8n (no SDK).
2. **Carga y Hardware:** WhatsApp consume alta memoria RAM. El despliegue asumido en Render o local necesitará min 512MB RAM exclusivos para el headless chromium puppeteer.
3. **Identidades Cruzadas:** Asumimos que los clientes en el MVP web actual no siempre tienen un `phone` guardado. La unificación puede generar duplicados si el match algorítmico no es exacto en las primeras corridas de The Brain.
