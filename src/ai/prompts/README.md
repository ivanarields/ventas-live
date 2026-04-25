# Prompts de IA

Todos los prompts que se envían a Gemini viven acá. Si querés cambiar cómo
se extrae un nombre, un monto o una categoría, es en este directorio — no en
`server.ts`.

## Archivos

| Archivo | Qué hace | Dónde se usa |
|---|---|---|
| `product-catalog.ts` | Cataloga ropa para la tienda (nombre, talla, marca, color) | `server.ts` → `/api/ai/product-from-images` |
| `image-classifier.ts` | Clasifica imagen en 3 tipos: comprobante / prenda / otro | `server.ts` → `/api/ai/analyze-image` |
| `receipt-qr.ts` | Extrae pagador, monto, banco de un comprobante | `server.ts` → `/api/ai/analyze-qr` |
| `notification-parser.ts` | Rescata nombre/monto de notificaciones bancarias raras | Edge Function `ingest-notification` |

## Reglas universales

Estas reglas se mantienen en TODOS los prompts y no deben romperse:

1. **Nunca inventar nombres.** Si no hay nombre legible → devolver `null`.
2. **Nombres en MAYÚSCULAS** sin tildes (para matchear con `customers.canonical_name`).
3. **JSON 100% válido** sin texto extra ni markdown.
4. **Temperatura 0** en todas las llamadas (determinismo).

## Al cambiar un prompt

1. Editar el archivo correspondiente
2. Correr las pruebas de `scripts/test-ai-receipts.mjs` (cuando exista)
3. Verificar que el umbral de acierto (≥90% o ≥95% según prueba) se mantiene
4. Si el cambio afecta al parser de notificaciones (`notification-parser.ts`),
   actualizar también la copia espejo en `supabase/functions/ingest-notification/index.ts`
   y re-deployar con `supabase functions deploy ingest-notification --no-verify-jwt`.
