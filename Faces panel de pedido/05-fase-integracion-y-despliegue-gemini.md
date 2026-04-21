# Fase 5 — Integración completa, despliegue y pruebas E2E
**Modelo recomendado:** Gemini 3.1 Pro (High)

## Objetivo de esta fase
Unir todas las piezas y convertirlas en una guía de ejecución real.

## Entradas que debes darle
Pásale:
- salida de la fase Supabase
- salida del conector Node.js
- salida del workflow de n8n
- plan de prueba original
- criterios de éxito

## Lo que debe entregar
1. Secuencia exacta de despliegue.
2. Orden correcto de configuración.
3. Variables que debes completar manualmente.
4. Qué probar primero y qué después.
5. Troubleshooting por fallos típicos.
6. Guía E2E desde QR hasta mensaje persistido.

## Prompt sugerido
Quiero que unifiques todas las salidas previas en una sola guía operativa de despliegue e integración.

Necesito:
- orden de implementación,
- prerequisitos,
- pasos manuales obligatorios,
- puntos de validación,
- errores comunes y solución,
- checklist final de aceptación.

Reglas:
- no repitas teoría innecesaria,
- enfócate en ejecución real,
- asume que quiero intervenir lo mínimo posible,
- la guía debe servir para seguirla casi paso a paso.

## Salida esperada
- `guia-ejecucion-e2e.md`
- `checklist-despliegue.md`
- `troubleshooting.md`
