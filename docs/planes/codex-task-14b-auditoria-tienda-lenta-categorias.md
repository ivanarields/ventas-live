# Auditoria 14B - Tienda lenta y categorias fantasma

Esta tarea es SOLO ANALISIS. No hagas cambios de codigo.
No edites archivos de la app. No ejecutes deploy. No hagas commit.

Objetivo: encontrar la causa exacta de estos bugs:

1. En la tienda publica aparecen categorias/chips de mas durante 1-3 segundos y luego desaparecen.
2. En el catalogo aparecen muchas categorias arriba, luego quedan solo las 3 reales.
3. En el panel de tienda, Config muestra muchas categorias al entrar y luego baja a las 3 guardadas.
4. La tienda se siente lenta y recarga estados visuales varias veces.

Dato observado por el usuario:
- En configuracion real solo quedaron 3 categorias: Blusas, Vestidos, Chaquetas.
- Al cargar, aparecen tambien Conjuntos, Pantalones, General, Rebajas, Promos, Nuevo, etc.
- Eso parece venir de valores por defecto antes de que llegue `/api/store/settings`, pero debes confirmarlo por codigo.

---

## Regla de alcance

Puedes leer y analizar SOLO tienda y panel tienda:

- `docs/contexto/04-tienda-online.md`
- `src/storefront-v2/StorefrontApp.tsx`
- `src/storefront-v2/components/ProductGallery.tsx`
- `src/storefront-v2/config/storefrontConfig.ts`
- `src/storefront-v2/services/productsApi.ts`
- `src/storefront-v2/store.css`
- `src/components/AdminTiendaView.tsx`
- `src/routes/store-settings.ts`
- partes de `server.ts` que montan `/api/store/settings` y `/api/store/products`

No analices pagos Live, MacroDroid, IA Live, casilleros ni sistema principal salvo que sea necesario para confirmar que no participa.

---

## Investigacion 1 - Categorias fantasma

Busca exactamente de donde salen los chips/categorias por defecto.

Revisar:
- `DEFAULT_STORE_CHIPS`
- `parseStoreChips`
- `store_chips`
- `CATEGORIAS`
- estados iniciales de `storeChips`
- llamadas a `/api/store/settings`

Preguntas a responder:
1. Que componente muestra las categorias antes de cargar settings?
2. Que valor inicial usa la tienda publica?
3. Que valor inicial usa el panel de tienda?
4. Por que primero se ven muchas categorias y despues solo 3?
5. Es un bug de cache, de estado inicial, de service worker o de respuesta lenta del endpoint?

---

## Investigacion 2 - Lento / recargas visuales

Audita por que la tienda se siente lenta al entrar.

Revisar:
- cuantas llamadas hace al cargar `/tienda`
- cuantas veces pide `/api/store/settings`
- cuantas veces pide `/api/store/products`
- si hay doble carga por `useEffect`
- si hay carga inicial con defaults y luego segunda carga con settings reales
- si el service worker/cache puede estar mostrando datos viejos
- si las imagenes de productos son muy pesadas o no tienen lazy/loading correcto
- si los skeletons se quedan demasiado tiempo por dependencias innecesarias

Preguntas a responder:
1. Que se carga primero?
2. Que se vuelve a cargar despues?
3. Hay llamadas duplicadas?
4. Hay algun estado que haga renderizar datos falsos antes de datos reales?
5. Hay algun problema de cache de navegador/PWA/service worker?

---

## Investigacion 3 - Panel de tienda

Audita solo la pestaña Config del panel de tienda.

Revisar en `src/components/AdminTiendaView.tsx`:
- estado inicial de `storeChips`
- `loadStoreSettings`
- `saveStoreSettings`
- boton `Restaurar`
- render de "Categorias y botones"

Preguntas:
1. Por que al entrar aparecen todas las categorias por defecto?
2. Por que luego se reemplazan por 3?
3. El panel muestra datos falsos mientras carga?
4. Hay riesgo de que el usuario guarde accidentalmente los defaults completos?

---

## Investigacion 4 - Endpoint y base de datos

Audita `src/routes/store-settings.ts`.

Confirmar:
1. `/api/store/settings` devuelve `store_chips`.
2. Si no existe `store_chips`, devuelve defaults.
3. Si existe `store_chips`, no mezcla defaults antiguos con los guardados.
4. El endpoint no tarda demasiado por lecturas innecesarias.

Si puedes consultar la base usando las variables `.env`, revisa solo:
- `store_settings` key `store_chips`

No modifiques la base.

---

## Entregable

Crea SOLO este archivo de informe:

`docs/planes/hallazgos-14b-auditoria-tienda-lenta-categorias.md`

Estructura obligatoria:

```markdown
# Hallazgos 14B - Tienda lenta y categorias fantasma

## Resumen corto
- [explicacion en palabras simples]

## Causa probable exacta
- [archivo, funcion/estado y por que causa el bug]

## Evidencia en codigo
- [rutas y fragmentos clave, sin pegar archivos completos]

## Flujo real de carga
1. [que pasa primero]
2. [que pasa despues]
3. [donde aparece el parpadeo/categorias extra]

## Lentitud
- [causas encontradas: llamadas duplicadas, cache, imagenes, defaults, skeletons, etc.]

## Riesgos
- Alta/Media/Baja: [riesgo]

## Propuesta de correccion
- [solo propuesta, no aplicar]

## Archivos revisados
- [lista]
```

---

## Reglas finales

- No cambies codigo.
- No cambies datos.
- No ejecutes deploy.
- No hagas commit.
- Si encuentras la causa exacta, explica como corregirla, pero no la corrijas.
- Si no encuentras la causa, dilo claramente y explica que evidencia faltaria.
