# Fase 1 — Estrategia, contexto y plan maestro
**Modelo recomendado:** Gemini 3.1 Pro (High)

## Objetivo de esta fase
Convertir el documento fuente en una especificación clara, jerárquica y ejecutable.

## Entradas que debes darle
Pásale estas partes del documento original:
- objetivo del MVP
- arquitectura propuesta
- flujo operativo
- herramientas elegidas
- requisitos funcionales exactos
- fases recomendadas
- límites y advertencias

## Lo que debe entregar
1. Un resumen ejecutivo del sistema.
2. Un mapa de arquitectura de extremo a extremo.
3. Un listado de componentes por responsabilidad.
4. Un backlog por fases.
5. Riesgos técnicos y mitigaciones.
6. Dependencias externas y qué requiere intervención humana.

## Prompt sugerido
Quiero que conviertas esta documentación en una especificación ejecutable por fases para un MVP con arquitectura WhatsApp -> n8n -> Supabase -> The Life.

Tu trabajo es:
1. resumir el objetivo sin perder precisión,
2. separar responsabilidades por componente,
3. definir dependencias,
4. proponer orden de implementación,
5. detectar ambigüedades o contradicciones,
6. devolver un plan técnico por fases con entregables verificables.

Reglas:
- no cambies la arquitectura base salvo justificación fuerte,
- prioriza menor fricción posible,
- evita sobreingeniería,
- piensa como arquitecto técnico y líder de implementación,
- devuelve todo en formato markdown.

## Salida esperada
- `resumen-ejecutivo.md`
- `mapa-arquitectura.md`
- `backlog-fases.md`
- `riesgos-y-supuestos.md`
