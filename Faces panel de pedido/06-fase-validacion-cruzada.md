# Fase 6 — Validación cruzada y endurecimiento mínimo
**Modelo recomendado:** Gemini 3.1 Pro (High) + Claude Sonnet 4.6 (Thinking)

## Objetivo de esta fase
Usar una IA para revisar el trabajo de la otra y reducir errores antes de la prueba real.

## Método recomendado
### Paso 1
Pasa la salida de Claude de n8n a Gemini y dile:
- revisa consistencia lógica,
- busca nodos redundantes,
- detecta huecos operativos,
- valida coherencia con Supabase y el conector.

### Paso 2
Pasa la salida de integración de Gemini a Claude y dile:
- busca puntos frágiles,
- revisa expresiones n8n,
- detecta errores de payload o referencias a nodos.

## Prompt sugerido para Gemini
Revisa este workflow de n8n desde una perspectiva de arquitectura e integración.  
Quiero que detectes inconsistencias, pasos faltantes, riesgos de despliegue y puntos donde probablemente falle en producción o en pruebas reales.

## Prompt sugerido para Claude
Revisa técnicamente esta guía y este workflow.  
Quiero que detectes errores concretos en nodos, expresiones, dependencias, ramas IF, requests HTTP, referencias de variables y puntos de ruptura.

## Criterio de cierre
Solo se considera terminado cuando:
- un mensaje de texto entra y queda guardado,
- un mensaje con imagen entra y queda guardado,
- el número queda limpio y usable,
- la app puede consultar la data persistida,
- el flujo responde sin errores al webhook.

## Salida esperada
- `auditoria-final.md`
- `errores-corregidos.md`
- `go-live-checklist.md`
