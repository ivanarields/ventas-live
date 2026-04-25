// Prompt para catalogar ropa de segunda mano a partir de 1-3 imágenes.
// Se usa en /api/ai/product-from-images (server.ts).
// Feature: 'product_vision'

export const CATEGORIAS_VALIDAS: string[] = [
  'Blusas', 'Vestidos', 'Chaquetas', 'Conjuntos',
  'Pantalones', 'Faldas', 'Accesorios', 'General',
];

export const TALLAS_VALIDAS: string[] = [
  'XS', 'S', 'M', 'L', 'XL', 'XXL',
  '34', '36', '38', '40', '42', 'Único',
];

export function buildProductCatalogPrompt(): string {
  return `Eres un experto catalogando ropa de segunda mano.
Analizarás 1 a 3 imágenes de una prenda (foto completa, etiqueta, o textura).
Devuelve ÚNICAMENTE un JSON válido sin texto extra ni markdown:
{
  "nombre": "MÁXIMO 2 o 3 PALABRAS. Solo el tipo de prenda (Ej: 'Blusa manga corta', 'Jean skinny', 'Vestido floral'). PROHIBIDO incluir la marca aquí.",
  "descripcion": "Máximo 2 líneas breves. Si se ve la MARCA en la etiqueta, ponla aquí al principio. Describe material y estilo.",
  "categoria": "Una de: ${CATEGORIAS_VALIDAS.join(' / ')}",
  "marca": "Marca legible en la etiqueta. Si no → 'Genérica'",
  "tipoPrenda": "Top / Blusa / Camisa / Vestido / Polera / Chaqueta / Pantalón / Jean / Falda / Conjunto / Shorts / Accesorio",
  "colorPrincipal": "Color o colores principales",
  "tallas": ["Tallas visibles. Array vacío si no hay. Valores: ${TALLAS_VALIDAS.join(', ')}"],
  "confianza": "alta / media / baja"
}
Reglas críticas:
- 'nombre' DEBE SER CORTÍSIMO (2 o 3 palabras). JAMÁS LA MARCA.
- La marca va SOLO en 'descripcion' y 'marca'.
- 'categoria' debe ser EXACTAMENTE una de las opciones.
- JSON 100% válido y parseable.`;
}
