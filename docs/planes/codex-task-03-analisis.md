# CODEX TASK 03 — Análisis completo de la tienda

No hagas ningún cambio en el código. Tu único trabajo en esta tarea es LEER y ESCRIBIR un documento de análisis.

---

## Qué debes hacer

1. Leer todos los archivos listados abajo
2. Analizar qué funciona, qué falta, qué está roto o incompleto
3. Escribir el resultado en `docs/planes/analisis-tienda-mayo-2026.md`

No toques ningún archivo de código. Solo crea ese documento de análisis.

---

## Archivos que debes leer

### Documentación existente
- `docs/contexto/04-tienda-online.md`
- `docs/contexto/05-estado-pendientes.md`

### Componentes de la tienda
- `src/storefront-v2/StorefrontApp.tsx`
- `src/storefront-v2/components/ProductGallery.tsx`
- `src/storefront-v2/components/ProductDetail.tsx`
- `src/storefront-v2/components/Checkout.tsx`
- `src/storefront-v2/components/CartView.tsx`
- `src/storefront-v2/components/StoreProfile.tsx`
- `src/storefront-v2/components/CustomerCenter.tsx`
- `src/storefront-v2/components/LiveConfirmation.tsx`
- `src/storefront-v2/components/SelectionConfirmation.tsx`
- `src/storefront-v2/config/storefrontConfig.ts`

### Servicios de la tienda
- `src/storefront-v2/services/productsApi.ts`
- `src/storefront-v2/services/storeAuth.ts`
- `src/storefront-v2/services/storeOrdersApi.ts`
- `src/storefront-v2/services/storeFavoritesApi.ts`

### Backend (solo las secciones de tienda — busca los comentarios que dicen "store" o "tienda")
- `server.ts` — leer completo, enfocándote en los endpoints `/api/store/`, `/api/store-auth/`, `/api/products`, `/api/store-orders`

---

## Estructura del documento que debes escribir

Escribe `docs/planes/analisis-tienda-mayo-2026.md` con esta estructura exacta:

```
# Análisis Tienda — Mayo 2026

## 1. Flujos que funcionan completamente
Lista cada flujo que está 100% implementado de punta a punta (frontend + backend + mensajes automáticos).
Para cada flujo, indicar: qué componente lo maneja, qué endpoint usa, si envía mensaje WA.

## 2. Flujos parcialmente implementados
Lista flujos que tienen parte en frontend y parte en backend pero hay algo que falta o no conecta.
Para cada uno, indicar: qué tiene, qué falta.

## 3. Cosas que están en el código pero no funcionan
Lista funcionalidades que tienen código pero están rotas, incompletas o nunca se llaman.

## 4. Mensajes automáticos de WhatsApp
Lista todos los mensajes WA que se envían automáticamente (busca en server.ts las llamadas a bridge, wa_messages, o envío de mensajes).
Para cada mensaje: cuándo se dispara, a quién va, qué dice aproximadamente.
Si un flujo debería enviar mensaje pero no lo hace, indicarlo.

## 5. Pantallas de la tienda
Lista todas las pantallas/vistas con su ruta hash, su componente, y si están completas o tienen problemas visuales o funcionales.

## 6. Lo que claramente falta
Lista las cosas que el negocio necesitaría pero que no están implementadas todavía.
No inventes cosas — solo lo que claramente debería estar y no está.

## 7. Prioridades recomendadas
Ordena de mayor a menor prioridad lo que falta o está roto, con una justificación breve de por qué esa prioridad.
```

---

## Reglas

- No cambies ningún archivo de código
- Solo crea `docs/planes/analisis-tienda-mayo-2026.md`
- Si algo no está claro en el código, escríbelo como "INCIERTO: ..." en el documento
- Sé específico: menciona nombres de componentes, endpoints y líneas de código cuando sea relevante
- No inventes funcionalidades que no están en el código
