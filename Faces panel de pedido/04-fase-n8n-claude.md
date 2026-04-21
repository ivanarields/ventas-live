# Fase 4 — Workflow de n8n, nodos y lógica de automatización
**Modelo recomendado:** Claude Sonnet 4.6 (Thinking)  
**Alternativa premium:** Claude Opus 4.6 (Thinking)

## Esta es la fase ideal para Claude
Aquí sí conviene Claude, porque esta parte exige:
- precisión en ramas lógicas,
- expresiones de n8n,
- nodos encadenados,
- normalización de payloads,
- cuidado con formatos JSON,
- manejo correcto de media y llamadas HTTP.

## Objetivo de esta fase
Generar el workflow completo de n8n con todos los nodos bien definidos y, si es posible, dejarlo exportable/importable.

## Entradas que debes darle
Pásale:
- payload que llega desde WhatsApp
- SQL / modelo de Supabase
- workflow esperado
- nombre del flujo: `whatsapp_ingesta_mvp`
- lógica del nodo `normalizar_payload`
- condiciones de `IF tiene_media`
- inserción en Supabase
- bucket de media
- respuesta final del webhook

## Lo que debe entregar
1. Lista completa de nodos.
2. Configuración por nodo.
3. Expresiones exactas de n8n.
4. Código de los nodos Code/Function.
5. Flujo final paso a paso.
6. Si puede, JSON exportable del workflow de n8n.
7. Notas de compatibilidad y pruebas.

## Prompt sugerido
Quiero que generes el workflow completo de n8n para este MVP.

Arquitectura:
WhatsApp -> webhook n8n -> normalización -> upsert cliente -> validación de media -> subida a Supabase Storage -> inserción de mensaje -> respuesta 200.

Necesito que devuelvas:
1. el flujo completo por nodos,
2. el propósito de cada nodo,
3. la configuración de cada nodo,
4. expresiones exactas de n8n,
5. código de nodos Code/Function,
6. manejo de la rama con media y sin media,
7. JSON exportable del workflow si es posible.

Reglas:
- no inventes nodos innecesarios,
- mantén el flujo simple,
- usa nombres de nodos claros,
- evita dependencias no esenciales,
- prioriza que el flujo importe y funcione con pocos ajustes,
- asume que el objetivo es minimizar revisión manual.

## Checklist que Claude debe cumplir
- Webhook POST operativo
- normalización correcta de teléfono
- diferencia entre mensajes `in` y `out`
- manejo de texto y multimedia
- upsert de cliente en Supabase
- inserción final de mensaje
- respuesta 200 al webhook
- soporte para guardar `recibido_raw`

## Salida esperada
- `n8n-workflow-explicado.md`
- `n8n-workflow.json`
- `pruebas-del-workflow.md`
