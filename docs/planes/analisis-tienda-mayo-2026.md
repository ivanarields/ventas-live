# Analisis Tienda - Mayo 2026

## 1. Flujos que funcionan completamente

- Catalogo publico de productos. Componente: `ProductGallery`. Ruta: `/tienda#gallery`. Endpoints: `GET /api/products` y `GET /api/store-orders/reserved-products`. Funciona con paginacion, filtro por categoria, busqueda y sello/reserva visual (`ProductGallery.tsx:60-64`, `ProductGallery.tsx:111-139`, `ProductGallery.tsx:261-314`; `server.ts:1738-1780`, `server.ts:1869-1890`). Mensaje WA: no envia.

- Detalle de producto por link. Componente: `ProductDetail`. Ruta: `/tienda#producto/{id}`. Endpoint: `GET /api/products/:id`. `StorefrontApp` carga el producto desde el hash y cae al catalogo si no lo encuentra (`StorefrontApp.tsx:82-93`; `productsApi.ts:114-121`; `server.ts:1786-1797`). Permite ver imagenes, talla, favorito, compartir, carrito y comprar si `stock > 0` (`ProductDetail.tsx:65-76`, `ProductDetail.tsx:124-131`, `ProductDetail.tsx:243-278`). Mensaje WA: no envia.

- Registro/login de clienta con WhatsApp + PIN. Componentes: `Checkout` y `StoreProfile`. Endpoints: `POST /api/store-auth/register`, `POST /api/store-auth/login`, `GET /api/store-auth/me`. Crea usuario en Supabase de TiendaOnline con email ficticio y upsert en `store_customers` (`Checkout.tsx:156-205`; `StoreProfile.tsx:81-118`; `server.ts:1471-1504`, `server.ts:1511-1539`, `server.ts:1546-1573`). Mensaje WA: no envia.

- Favoritos autenticados con respaldo local. Componentes: `ProductGallery`, `ProductDetail`, `StoreProfile`. Endpoints principales: `GET/POST/DELETE /api/store-favorites` y `POST /api/store-favorites/sync`. Si no hay sesion usa `localStorage`; si hay sesion sincroniza con `store_favorites` (`storeFavoritesApi.ts:25-79`; `server.ts:1633-1688`; `ProductGallery.tsx:50-58`; `StoreProfile.tsx:54-73`). Mensaje WA: no envia.

- Confirmacion de pago de tienda cuando el backend logra hacer match o el operador verifica manualmente. Componentes relacionados: `Checkout` hace polling a `GET /api/store-orders/:id/status`; backend confirma por `POST /api/store/ingest-bank`, `POST /api/store/ingest-wa`, `POST /api/store/match-payment`, `POST /api/store/verify-manual/:storeOrderId` o `POST /api/store/verify-order/:id` (`Checkout.tsx:134-153`; `server.ts:1896-1905`, `server.ts:2230-2393`, `server.ts:2398-2450`, `server.ts:2460-2510`, `server.ts:2545-2551`, `server.ts:2668-2696`, `server.ts:2705-2713`). Al confirmar marca `store_orders.status = paid`, pone `payment_verified_at`, cambia `products.stock = 0`, crea/actualiza cliente y pedido operativo en ChehiAppAbril, registra pago y encola WA (`server.ts:2233-2244`, `server.ts:2250-2255`, `server.ts:2280-2357`, `server.ts:2364-2388`). Mensaje WA: si, confirmacion de pago/pedido listo a la clienta.

- Mensaje automatico al marcar listo un pedido no WEB del sistema principal. No es un flujo de compra online puro, pero esta integrado con la tienda porque pre-crea perfil en TiendaOnline y manda link al perfil. Endpoint: `PATCH /api/pedidos/:id`. Si `status === "listo"` y no es pedido WEB, encola WhatsApp (`server.ts:1165-1211`). Mensaje WA: si, a la clienta.

## 2. Flujos parcialmente implementados

- Checkout de compra online. Tiene carrito, login/registro, creacion de `store_orders`, QR, descarga de QR, boton "Ya pague" y polling de estado (`Checkout.tsx:81-115`, `Checkout.tsx:258-407`; `storeOrdersApi.ts:31-47`; `server.ts:1912-2009`). Falta: no hay seleccion real de entrega/retiro, fecha ni horario; el payload manda siempre `delivery_type: "retiro"` y campos de entrega en `null` (`Checkout.tsx:93-99`). Tambien el frontend usa `PAYMENT_SECONDS = 60` y el backend reserva 1 minuto (`Checkout.tsx:10`; `server.ts:1987-2003`), mientras la documentacion dice 10 minutos (`docs/contexto/04-tienda-online.md:357-358`).

- Reserva de productos. Tiene bloqueo contra otros pedidos `pending`, endpoint publico de reservados y cancelacion automatica de expirados (`server.ts:1869-1890`, `server.ts:1929-1959`, `server.ts:2015-2048`). Falta o problema: la reserva solo revisa otros pedidos, pero no valida `stock === 0`; solo valida `available` (`server.ts:1962-1975`). Un producto vendido con `stock = 0` podria entrar si el frontend no lo bloquea o si se llama directo al API.

- Centro de clientas. Tiene pantalla, lee `GET /api/store/settings`, muestra proximo live, direccion, nota de entrega, FAQ y link manual a WhatsApp (`CustomerCenter.tsx:22-30`, `CustomerCenter.tsx:51-124`). Falta: no crea ni actualiza datos de clienta, no lista pedidos, no conecta acciones transaccionales. Mensaje WA: no automatico; solo link `wa.me`.

- Perfil de clienta. Tiene login, pedidos, favoritos, metricas y logout (`StoreProfile.tsx:47-68`, `StoreProfile.tsx:168-305`). Falta: pestaña "Entrega" solo guarda estado local y el boton "Guardar fecha" no llama endpoint (`StoreProfile.tsx:266-275`); pestaña "Confirmar" abre carrito, no confirma realmente el pedido (`StoreProfile.tsx:276-293`).

- Confirmacion por token de prendas. Componente: `SelectionConfirmation`. Ruta: `/tienda/selection?token={token}`. Frontend usa `GET /api/store/selection/:token`, `POST /api/store/selection/:token/confirm` y `POST /api/store/selection/:token/reject` (`SelectionConfirmation.tsx:21-53`, `SelectionConfirmation.tsx:61-106`). En `server.ts` solo se ve que monta `createStoreSelectionRouter(supabaseStore)` en `/api/store` (`server.ts:1733`). INCIERTO: la implementacion exacta de esos endpoints esta fuera de los archivos listados en la tarea, por lo que aqui solo se puede confirmar la conexion desde frontend y el montaje del router.

- Confirmacion Live. Componente: `LiveConfirmation`. Ruta: `/tienda#live-confirmation`. Lee fotos con `GET /api/store/whatsapp-photos?phone=...` y permite seleccionar (`LiveConfirmation.tsx:31-50`, `LiveConfirmation.tsx:180-238`; `server.ts:2606-2634`). Falta: al confirmar no escribe en backend; simula exito con `setTimeout` (`LiveConfirmation.tsx:84-97`). El endpoint `POST /api/store/notify-live-ready` encola un link, pero el link generado usa `/live-confirmation?phone=...`, no el hash que `StorefrontApp` reconoce (`server.ts:2642-2659`; `StorefrontApp.tsx:101-103`).

- Configuracion de tienda. Frontend lee `GET /api/store/settings` para chips, QR, centro de clientas y portada (`StorefrontApp.tsx:309-318`; `ProductGallery.tsx:88-97`; `Checkout.tsx:45-52`; `CustomerCenter.tsx:22-30`). En `server.ts` solo se ve el montaje de `createStoreSettingsRouter(supabaseStore)` (`server.ts:1734`). INCIERTO: la implementacion exacta de `GET/PATCH /api/store/settings` y `GET /api/store/delivery-slots` esta fuera de los archivos listados.

## 3. Cosas que estan en el codigo pero no funcionan

- `ProductGallery` recibe `onQuickBuy` desde `StorefrontApp`, pero el componente no lo desestructura ni lo usa (`StorefrontApp.tsx:211-222`; `ProductGallery.tsx:25`). El flujo "compra rapida" existe en `StorefrontApp` (`StorefrontApp.tsx:127-138`) pero no hay boton que lo dispare.

- `CartView` recibe `onUpdateQuantity`, pero no lo usa. La UI muestra `1x` fijo y solo permite eliminar (`CartView.tsx:14`, `CartView.tsx:52-63`). Aunque `StorefrontApp` implementa `updateQuantity`, no se conecta a controles visibles (`StorefrontApp.tsx:171-180`).

- `Checkout` define `waNudge`, lo activa despues de 60 segundos, pero no renderiza ninguna diferencia por ese estado (`Checkout.tsx:40`, `Checkout.tsx:125-129`).

- En la pantalla de pago, al verificarse el pedido el boton dice "Ver mis pedidos", pero `onOrderComplete` limpia carrito y vuelve al catalogo, no abre perfil/pedidos (`Checkout.tsx:237-255`; `StorefrontApp.tsx:248-256`).

- `StoreProfile` tiene pestañas "Entrega" y "Confirmar" con UI, pero no persisten entrega ni confirman pedidos (`StoreProfile.tsx:266-293`).

- `LiveConfirmation.handleSubmit` no guarda seleccion ni crea pedido; solo simula exito (`LiveConfirmation.tsx:84-97`).

- Hay endpoints antiguos/paralelos de favoritos bajo `/api/store/favorites/:phone`, `/api/store/favorites/toggle` y `/api/store/favorites/:phone/products`, pero el frontend actual usa `/api/store-favorites` (`server.ts:2558-2601`; `storeFavoritesApi.ts:28-72`). Parecen codigo legado o no llamado por la tienda v2.

- `storeOrdersApi.getAll`, `updateStatus` y `markWaSent` usan `Authorization: Bearer token`, pero los endpoints de pedidos generales validan con `supabaseServer.auth.getUser` y no con `supabaseStore.auth.getUser` (`storeOrdersApi.ts:49-83`; `server.ts:2091-2114`). Como las sesiones de tienda se crean en Supabase Store (`server.ts:1481-1487`, `server.ts:1520-1521`), INCIERTO: esos metodos podrian fallar si se usan desde admin/cliente con token de tienda.

- `POST /api/upload-image` intenta primero `supabaseStore.storage.from("store_images")`, pero si falla por RLS reintenta con `supabaseServer.storage.from("store_images")` (`server.ts:1702-1715`). Esto contradice la regla documentada de no usar fallback a ChehiAppAbril si falla `store_images` (`docs/contexto/04-tienda-online.md:68-75`). INCIERTO: depende de a que proyecto apunte `supabaseServer` en produccion, pero por nombres del repo no parece ser TiendaOnline.

## 4. Mensajes automaticos de WhatsApp

- Confirmacion de pago de tienda. Se dispara dentro de `confirmStoreOrder` cuando un pedido `pending` pasa a `paid` por MacroDroid, WA+banco, match manual o verificacion admin (`server.ts:2230-2393`). Va a `data.customer_wa`. Texto aproximado: "Hola [nombre]! Tu pago fue confirmado. Tu pedido #[id] esta listo. Muchas gracias por tu compra. Mira los detalles en tu perfil: [link]" (`server.ts:2370-2385`). Usa `enqueueStoreConfirmation`; luego el procesador automatico manda mensajes de la cola (`server.ts:77-91`, `server.ts:2380-2386`).

- Pedido listo no WEB desde el sistema principal. Se dispara en `PATCH /api/pedidos/:id` cuando `req.body.status === "listo"`, hay `customer_id` y el pedido no es WEB (`server.ts:1165-1169`). Va al telefono del cliente en `customers.phone` (`server.ts:1172-1179`). Texto aproximado: "Hola [nombre]! Tu pedido #[label] esta listo. Muchas gracias por tu compra. Mira los detalles en tu perfil: [link]" (`server.ts:1190-1211`). Si es pedido WEB no se envia para evitar duplicar el mensaje de confirmacion de tienda (`server.ts:1165-1168`).

- Link de confirmacion Live. Se dispara por `POST /api/store/notify-live-ready` con `x-user-id` y `phone` (`server.ts:2642-2649`). Va al `phone` recibido. Texto aproximado: "Ya tenemos tus prendas del Live listas para confirmacion. Ingresa aqui para seleccionar las tuyas: [storeLink]. Necesitaras tu PIN de la tienda" (`server.ts:2651-2659`). Problema: el link usa `/live-confirmation?phone=...`, pero la app espera `/tienda#live-confirmation` para esa vista (`server.ts:2649`; `StorefrontApp.tsx:101-103`).

- Boton "Ya pague" del checkout. No es automatico: abre `wa.me` manualmente con texto "Hola! Pague el pedido #[id] por [total] Bs. Adjunto comprobante." (`Checkout.tsx:264-270`). Va al numero `VITE_STORE_WA_NUMBER` o `59160003230` (`Checkout.tsx:9`).

- Flujos que deberian enviar WA pero no lo hacen: crear pedido/reserva no envia confirmacion de reserva (`server.ts:1912-2009`); confirmacion/rechazo de `SelectionConfirmation` no muestra envio WA desde el componente y en `server.ts` solo se ve el router montado, no su implementacion (`SelectionConfirmation.tsx:74-100`; `server.ts:1733`); `StoreProfile` entrega/confirmar no envia nada (`StoreProfile.tsx:266-293`).

## 5. Pantallas de la tienda

- `/tienda`: portada `WelcomeScreen` dentro de `StorefrontApp`. Completa como entrada a catalogo, perfil y centro de clientas; lee chips desde settings (`StorefrontApp.tsx:197-207`, `StorefrontApp.tsx:309-318`). Problema menor: la documentacion visual/fecha muestra copyright 2025.

- `/tienda#gallery`: `ProductGallery`. Completa para navegar, buscar, filtrar, favoritos, reservas y vendidos (`ProductGallery.tsx:111-139`, `ProductGallery.tsx:191-380`). Problema: no usa `onQuickBuy`.

- `/tienda#producto/{id}`: `ProductDetail`. Completa para ver producto, fotos, talla, favoritos, compartir, agregar al carrito y comprar (`StorefrontApp.tsx:82-93`; `ProductDetail.tsx:45-280`). Problema: las metricas de likes/views son aleatorias en cada carga (`ProductDetail.tsx:21-22`).

- `/tienda#cart`: `CartView`. Parcial: lista items, total y paso a checkout (`CartView.tsx:18-89`). Problema: no permite cambiar cantidad aunque existe handler; muestra `1x` fijo.

- `/tienda#checkout`: `Checkout`. Parcial: identifica clienta, crea pedido, muestra QR, descarga QR, abre WA y espera verificacion (`Checkout.tsx:81-115`, `Checkout.tsx:134-153`, `Checkout.tsx:258-407`). Problemas: no hay entrega/horario real, reserva 60 segundos, boton final no abre pedidos.

- `/tienda#profile`: `StoreProfile`. Parcial: login, favoritos, pedidos y logout funcionan a nivel de UI/API (`StoreProfile.tsx:47-68`, `StoreProfile.tsx:220-265`). Problemas: entrega/confirmacion son pantallas sin persistencia real (`StoreProfile.tsx:266-293`).

- `/tienda#customer-center`: `CustomerCenter`. Parcial: informativa, lee settings y tiene enlace manual a WhatsApp (`CustomerCenter.tsx:22-124`). No es un centro transaccional.

- `/tienda#live-confirmation`: `LiveConfirmation`. Parcial/incompleta: carga fotos recientes desde PanelPedido y permite seleccion visual (`LiveConfirmation.tsx:37-50`, `server.ts:2606-2634`), pero confirmar solo simula exito (`LiveConfirmation.tsx:84-97`).

- `/tienda/selection?token={token}`: `SelectionConfirmation`. Parcial segun los archivos leidos: frontend carga, confirma y rechaza por endpoints de selection (`SelectionConfirmation.tsx:21-106`). INCIERTO: el backend real esta en router montado y no en `server.ts` visible (`server.ts:1733`).

## 6. Lo que claramente falta

- Seleccion real de entrega/retiro, fecha, horario, direccion y notas en el checkout. La documentacion lo exige, pero el codigo manda retiro fijo y campos `null` (`docs/contexto/04-tienda-online.md:356-358`; `Checkout.tsx:93-99`).

- Unificar la duracion de reserva. Documentacion: 10 minutos; frontend/backend: 1 minuto (`docs/contexto/04-tienda-online.md:357-358`; `Checkout.tsx:10`; `server.ts:1987-2003`).

- Persistir la confirmacion Live. Ahora `LiveConfirmation` no crea pedido, no actualiza `store_customer_media`, no marca fotos seleccionadas y no llama endpoint de confirmacion (`LiveConfirmation.tsx:84-97`).

- Corregir el link automatico de `notify-live-ready` para abrir la ruta que la app reconoce (`server.ts:2649`; `StorefrontApp.tsx:101-103`).

- Validar `stock > 0` en backend al crear pedido, no solo en frontend (`ProductDetail.tsx:243-278`; `server.ts:1962-1975`).

- Persistir acciones de perfil: guardar fecha/nota de entrega y confirmar pedido desde la pestaña de perfil (`StoreProfile.tsx:266-293`).

- Pantalla o flujo admin para `store_customer_media` por clienta. La documentacion lo lista como pendiente recomendado (`docs/contexto/04-tienda-online.md:510-514`).

- Automatizar el paso de fotos relevantes desde PanelPedido hacia `store_customer_media`. La documentacion lo marca pendiente; el codigo leido solo expone fotos recientes desde PanelPedido por API, no las persiste como historial visual de tienda (`docs/contexto/04-tienda-online.md:506-508`; `server.ts:2606-2634`).

- RLS en TiendaOnline. La documentacion de pendientes indica RLS pendiente (`docs/contexto/05-estado-pendientes.md:60-65`).

## 7. Prioridades recomendadas

1. Corregir checkout/reserva: duracion coherente, entrega/horario reales y validacion backend de `stock > 0`. Es el flujo que toca dinero y evita sobreventas o expectativas incorrectas.

2. Probar y cerrar verificacion de pagos end-to-end de tienda. El backend esta implementado, pero la propia documentacion de pendientes marca el flujo completo de verificacion como pendiente (`docs/contexto/05-estado-pendientes.md:60-65`).

3. Hacer persistente `LiveConfirmation` o quitarla del flujo operativo hasta que escriba datos reales. Hoy puede mostrar exito a la clienta sin registrar nada (`LiveConfirmation.tsx:84-97`).

4. Corregir `notify-live-ready` para que mande un link valido de la tienda. Si se usa como esta, la clienta puede caer en una URL que `StorefrontApp` no interpreta como la vista Live (`server.ts:2649`; `StorefrontApp.tsx:101-103`).

5. Resolver el fallback de `/api/upload-image` contra la regla de storage de TiendaOnline. Si `supabaseServer` no apunta a TiendaOnline, contradice la regla critica documentada (`server.ts:1702-1715`; `docs/contexto/04-tienda-online.md:68-75`).

6. Completar perfil/centro de clientas como flujos reales o simplificarlos. Ahora hay botones y pestañas que parecen accionables pero no persisten (`StoreProfile.tsx:266-293`; `CustomerCenter.tsx:43-124`).

7. Limpiar o documentar endpoints duplicados/legados de favoritos. No parecen romper el flujo actual, pero aumentan confusion entre `/api/store-favorites` y `/api/store/favorites/*` (`server.ts:1633-1688`, `server.ts:2558-2601`).
