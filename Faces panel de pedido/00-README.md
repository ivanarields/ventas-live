# Plan maestro por fases para Anti Gravity

## Objetivo
Construir el MVP **WhatsApp -> n8n -> Supabase -> The Life** con la menor intervención manual posible.

## Recomendación de modelo por fase
- **Gemini 3.1 Pro (High):** contexto, arquitectura, documentación, refactor de especificaciones, integración general.
- **Claude Sonnet 4.6 (Thinking):** generación del workflow de **n8n**, nodos, expresiones, ramas IF, payloads, corrección de lógica.
- **Claude Opus 4.6 (Thinking):** solo si quieres la versión más cuidadosa para la fase de n8n o una revisión final más profunda.
- **Gemini 3 Flash:** solo para iteraciones rápidas o reformatear texto, no como motor principal del flujo.
- **GPT-OSS 120B:** opcional como tercera opinión, no como modelo principal del proyecto.

## Mi recomendación práctica
Si quieres gastar menos tiempo:
1. **Gemini 3.1 Pro (High)** para fases 1, 2, 3, 5 y 6.
2. **Claude Sonnet 4.6 (Thinking)** para la fase 4 de n8n.
3. **Claude Opus 4.6 (Thinking)** solo si Sonnet no deja el flujo suficientemente fino.

## Regla importante
Ninguna IA te va a garantizar cero revisión humana en n8n.  
Lo realista es apuntar a esto:
- 90% a 95% del trabajo hecho por IA
- revisión humana mínima
- pruebas finales obligatorias con payload real

## Archivos
- `01-fase-estrategia-y-contexto-gemini.md`
- `02-fase-supabase-y-modelado-gemini.md`
- `03-fase-conector-whatsapp-gemini.md`
- `04-fase-n8n-claude.md`
- `05-fase-integracion-y-despliegue-gemini.md`
- `06-fase-validacion-cruzada.md`

## Cómo usar este paquete
1. Empieza por la fase 1.
2. Copia el prompt completo de cada archivo en la IA indicada.
3. Pega siempre el resultado de una fase dentro del contexto de la siguiente.
4. No avances a la siguiente fase hasta que la anterior deje entregables concretos.
