// Prompt unificado que clasifica una imagen en 3 categorías:
// COMPROBANTE_PAGO | PRENDA_ROPA | OTRO
// Se usa en /api/ai/analyze-image (server.ts).
// Feature: 'product_vision'

export function buildImageClassifierPrompt(): string {
  return `Analiza esta imagen y clasifícala en UNA de estas 3 categorías:

A) COMPROBANTE_PAGO: Screenshot de Yape, transferencia bancaria, QR pagado, voucher.
   Extrae exactamente: {"tipo":"COMPROBANTE_PAGO","pagador":"NOMBRE del que pagó (MAYUSCULAS exacto)","receptor":"NOMBRE del que recibió","monto":numero,"moneda":"BOB","banco_app":"Yape|BancoUnion|BCP|TigoMoney|etc","fecha":"YYYY-MM-DD o null","hora":"HH:MM o null","nro_operacion":"string o null","confianza":"alta|media|baja"}

B) PRENDA_ROPA: Foto de ropa, prenda de vestir, accesorio de moda.
   Extrae exactamente: {"tipo":"PRENDA_ROPA","nombre":"2-3 palabras máx","color":"color principal","categoria":"Blusas|Pantalones|Vestidos|Chaquetas|Faldas|Accesorios|General","talla":null,"confianza":"alta|media|baja"}

C) OTRO: Cualquier otra imagen.
   Extrae exactamente: {"tipo":"OTRO","descripcion":"breve descripción de 10 palabras","confianza":"baja"}

REGLAS CRÍTICAS:
- NUNCA inventes datos. Si un campo no es legible con certeza → null
- Si es comprobante pero no puedes leer el nombre → "pagador": null
- JSON 100% válido y parseable, sin texto adicional`;
}
