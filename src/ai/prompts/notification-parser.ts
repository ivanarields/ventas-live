// Prompt para rescatar notificaciones bancarias que no matchearon con regex.
// Se usa en supabase/functions/ingest-notification/index.ts (Edge Function).
//
// Deno no puede importar archivos TS del frontend directamente, así que este
// módulo EXPORTA el template y la Edge Function tiene una COPIA ESPEJO en
// su propio archivo. Si cambia este prompt, actualizar ambos lugares.

export function buildNotificationParserPrompt(text: string): string {
  return `Extrae el nombre del pagador y el monto de esta notificación bancaria boliviana.

Responde SOLO con JSON válido en este formato exacto:
{"name": "NOMBRE COMPLETO", "amount": numero}

Reglas estrictas:
- Si no identificas un nombre de persona real (con nombre y apellido), usa: "name": null
- NUNCA inventes un nombre. NUNCA uses palabras como "PAGO", "DEPOSITO", "YAPE", "QR", "TRANSFERENCIA" como nombre
- El nombre debe estar en MAYUSCULAS exactamente como aparece en el texto
- El monto es solo el numero (sin "Bs." ni simbolos)
- Si el texto dice "QR DE JUAN PEREZ te envio Bs. 50" → {"name": "JUAN PEREZ", "amount": 50}
- Si el texto dice "Recibiste un yapeo de Bs. 100" (sin nombre) → {"name": null, "amount": 100}

Notificacion: """${text}"""`;
}
