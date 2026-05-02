# Informe tecnico - Flujo de tienda online

## 1. Objetivo del informe

Este documento describe el flujo de ventas de la tienda online de Ventas Live: como funciona hoy, cual seria el flujo ideal para automatizarlo y que falta conectar para hacerlo sin reescribir toda la aplicacion.

La meta no es reemplazar el flujo manual, sino convertirlo en un sistema semi-automatico:

1. La clienta entra a la tienda.
2. Selecciona prendas.
3. Se identifica con WhatsApp y PIN.
4. Se crea o reutiliza su perfil.
5. Se crea una orden reservada.
6. La clienta paga y envia comprobante si hace falta.
7. El sistema cruza pago con MacroDroid.
8. Si el pago coincide, se verifica.
9. Si no coincide, pasa a revision manual.
10. Al verificarse, se envia confirmacion por WhatsApp.
11. Se crea un pedido interno para preparacion.
12. El operador confirma prendas/bolsas.
13. Luego recien entra al sistema de casilleros.

Principio critico: el sistema nunca debe inventar nombres, pagos, prendas ni comprobantes. Cuando no haya evidencia suficiente, debe dejar el caso en revision manual.

## 2. Estado actual del flujo

La tienda online ya existe como una experiencia separada dentro del frontend. El archivo principal es `src/storefront/StorefrontApp.tsx`, con componentes para galeria, detalle de producto, carrito, checkout, perfil y confirmacion de Live.

El backend principal esta en `server.ts` y expone endpoints para productos, pedidos de tienda, autenticacion de tienda, carga de imagenes, verificacion de pagos y confirmacion manual.

Actualmente el flujo de tienda tiene estas piezas:

| Etapa | Estado actual | Comentario tecnico |
|---|---|---|
| Catalogo | Existe | `GET /api/products` lista productos disponibles y permite filtros por categoria/busqueda. |
| Administracion de productos | Existe | `AdminTiendaView.tsx` usa endpoints de productos y puede generar metadata con IA. |
| Carrito | Existe | `CartView` y `Checkout` manejan seleccion de prendas/tallas/cantidades. |
| Identificacion de clienta | Existe parcialmente | Usa WhatsApp + PIN. Se crea usuario en Supabase Auth de tienda y registro en `store_customers`. |
| Reserva de pedido | Existe parcialmente | `POST /api/store-orders` crea una orden pendiente con expiracion corta. |
| Pago | Existe como flujo visual | El checkout espera verificacion haciendo polling a `/api/store-orders/:id/status`. |
| Cruce con MacroDroid | Existe parcialmente | Hay endpoints `/api/store/ingest-bank`, `/api/store/match-payment` y Edge Function `ingest-bank-store`. |
| Comprobante por WhatsApp | Existe parcialmente | `/api/store/ingest-wa` puede recibir mensaje con referencia de pedido. |
| Confirmacion WhatsApp | Existe parcialmente | `enqueueStoreConfirmation` inserta mensajes en `whatsapp_message_queue`. |
| Pedido interno para preparacion | Existe parcialmente | `confirmStoreOrder` inserta en `pedidos` con `source: 'WEB'`. |
| Casilleros | No debe ser automatico todavia | El flujo recomendado es que el operador confirme prendas/bolsas antes de asignar etiqueta. |

## 3. Flujo actual detallado

### 3.1 Catalogo y productos

El catalogo se alimenta desde `products` en la base de la tienda. El frontend llama a `src/storefront/services/productsApi.ts`, que a su vez consulta:

- `GET /api/products`
- `GET /api/products?admin=true`
- `POST /api/products`
- `PATCH /api/products/:id`
- `DELETE /api/products/:id`

El backend usa `supabaseStore` para leer/escribir productos. La tabla `products` no aparece completamente definida en las migraciones principales del repo; solo se observa una alteracion para agregar `images TEXT[]` en `018_store_orders_and_multi_images.sql`. Eso indica que la estructura base de `products` probablemente vive en el proyecto de tienda o fue creada fuera de estas migraciones.

Campos usados por el codigo:

- `id`
- `name`
- `price`
- `description`
- `category`
- `sizes`
- `image_url`
- `images`
- `available`
- `created_at`
- `priority_order`

### 3.2 Identificacion de la clienta

El checkout usa `src/storefront/components/Checkout.tsx`. La clienta se identifica con:

- numero de WhatsApp;
- PIN de 4 digitos.

El backend expone:

- `POST /api/store-auth/register`
- `POST /api/store-auth/login`
- `GET /api/store-auth/me`

La implementacion actual convierte el telefono en un email tecnico:

- `telefono@tiendaleydi.com`

y usa una contrasena tecnica:

- `pin-XXXX`

Luego crea o consulta una fila en `store_customers`.

Esto ya permite que la clienta tenga una identidad de tienda, pero todavia falta consolidarlo como perfil unico conectado al sistema interno de preparacion, historial y casilleros.

### 3.3 Creacion y reserva de orden

Al confirmar el carrito, `Checkout.tsx` llama a `storeOrdersApi.create`, que hace:

- `POST /api/store-orders`

El backend:

- valida que haya items;
- verifica conflictos contra otros pedidos `pending`;
- verifica que los productos sigan disponibles;
- crea una orden en `store_orders`;
- asigna `status: 'pending'`;
- asigna `expires_at` con una ventana de reserva de 2 minutos;
- tiene un `setInterval` que cancela pedidos vencidos.

El frontend consulta:

- `GET /api/store-orders/reserved-products`
- `GET /api/store-orders/:id/status`

para saber si un producto esta temporalmente reservado y si el pago ya fue verificado.

### 3.4 Verificacion de pago

Hay tres vias previstas:

1. MacroDroid envia una notificacion bancaria.
2. WhatsApp envia un comprobante o mensaje con referencia.
3. El operador verifica manualmente desde admin.

Endpoints importantes:

- `POST /api/store/ingest-bank`
- `POST /api/store/ingest-wa`
- `POST /api/store/match-payment`
- `POST /api/store/verify-order/:id`

La funcion interna mas importante es `confirmStoreOrder(orderId, source)`.

Cuando se confirma:

- cambia la orden a pagada;
- registra `payment_verified_at`;
- marca `payment_method: 'qr'`;
- guarda `payment_ref`;
- encola mensaje WhatsApp de confirmacion;
- oculta productos vendidos;
- intenta crear/encontrar cliente global;
- inserta un pedido interno en `pedidos`.

### 3.5 Confirmacion por WhatsApp

La confirmacion automatica usa:

- `src/routes/whatsapp.ts`
- `whatsapp_message_queue`
- `fn_dequeue_whatsapp_message`
- bridge de WhatsApp en `bridge/`

El sistema no envia directo desde `confirmStoreOrder`; encola el mensaje. Luego el panel puede procesar la cola de forma controlada con delays, usando:

- `GET /api/whatsapp/queue`
- `POST /api/whatsapp/send-next`
- `POST /api/whatsapp/retry/:id`

Esto es correcto para reducir riesgo operativo y mantener un flujo anti-baneo.

### 3.6 Pedido interno y preparacion

Cuando una orden de tienda se verifica, `confirmStoreOrder` intenta crear un pedido en `pedidos` con:

- `customer_id`
- `customer_name`
- `status: 'procesar'`
- `total_amount`
- `item_count`
- `bag_count: 1`
- `label: WEB-{orderId}`
- `label_type: 'WEB'`
- `source: 'WEB'`
- `web_items_list`

Este paso conecta la tienda con el flujo operativo principal. Sin embargo, no deberia asignar casillero final automaticamente sin confirmacion del operador. La cantidad real de prendas/bolsas debe ser confirmada en la Mesa de Preparacion.

## 4. Flujo ideal recomendado

El flujo ideal para tienda online debe ser:

```text
Catalogo
  -> carrito
  -> identificacion WhatsApp + PIN
  -> perfil tienda
  -> orden pending/reserved
  -> pago QR/transferencia
  -> MacroDroid detecta notificacion
  -> cruce por monto + telefono + referencia/ventana
  -> si coincide: pago verificado
  -> si no coincide: revision manual
  -> confirmacion WhatsApp
  -> pedido interno pendiente de preparacion
  -> operador confirma prendas y bolsas
  -> pedido listo
  -> casillero asignado por backend
  -> entrega
```

### 4.1 Compra

La clienta selecciona productos y tallas. El sistema debe bloquear temporalmente los productos mientras la clienta paga.

Recomendacion:

- Mantener reserva corta, pero revisar si 2 minutos es suficiente para Bolivia.
- Usar una ventana practica de 5 a 10 minutos si el pago requiere salir a app bancaria.
- Mostrar estado claro: reservado, esperando pago, pago verificado, vencido.

### 4.2 Perfil automatico

Al identificar telefono/PIN, el sistema debe crear o encontrar:

- perfil de tienda (`store_customers`);
- perfil unificado (`identity_profiles`);
- evidencia (`identity_evidence` con source `store_order`);
- cliente interno (`customers`) solo cuando haya datos suficientes para operar internamente.

Regla:

- Si solo hay telefono y no hay nombre real, el perfil puede existir como telefono.
- No crear nombre falso tipo "Cliente Tienda Web" como identidad definitiva.
- Se puede mostrar "Sin nombre" o telefono en UI, pero marcarlo como dato incompleto.

### 4.3 Pago y comprobante

El pago debe poder verificarse por:

- notificacion MacroDroid;
- comprobante de WhatsApp;
- verificacion manual.

Orden recomendado:

1. Intentar match automatico con MacroDroid.
2. Si la clienta envio comprobante, usarlo como evidencia adicional.
3. Si no hay notificacion o hay ambiguedad, mandar a revision manual.

El sistema debe registrar siempre la evidencia:

- evento bancario en `payment_events`;
- evento WhatsApp/comprobante en `wa_events` o tabla equivalente;
- evidencia de identidad en `identity_evidence`.

### 4.4 Verificacion

Una orden se considera verificada cuando:

- hay pago automatico con match confiable; o
- el operador la verifica manualmente.

No debe verificarse automaticamente si:

- hay multiples pedidos con el mismo monto;
- no coincide telefono;
- no hay referencia;
- el pago no tiene monto claro;
- el comprobante no tiene datos suficientes.

### 4.5 Confirmacion a la clienta

Al verificarse el pago:

- se encola mensaje en `whatsapp_message_queue`;
- el mensaje debe incluir numero de pedido y estado;
- no debe depender de abrir `wa.me` manualmente como unico camino;
- el operador debe poder reenviar/reintentar desde la cola.

### 4.6 Paso a preparacion

Despues de pago verificado:

- crear pedido interno en `pedidos`;
- guardar `source: 'WEB'`;
- guardar `web_items_list`;
- dejarlo en estado de preparacion/revision;
- el operador revisa prendas reales;
- confirma cantidad de prendas y bolsas;
- recien ahi se asigna casillero.

Esto mantiene el flujo semi-automatico y evita errores fisicos en casilleros.

## 5. Tablas y campos relacionados

### 5.1 `products`

Uso:

- catalogo de tienda;
- disponibilidad;
- imagenes multiples;
- tallas;
- categorias.

Campos usados por el codigo:

| Campo | Uso |
|---|---|
| `id` | Identificador de producto. |
| `name` | Nombre visible. |
| `price` | Precio usado en carrito y orden. |
| `description` | Descripcion de producto. |
| `category` | Filtro de catalogo. |
| `sizes` | Tallas disponibles. |
| `image_url` | Imagen legacy o principal. |
| `images` | Galeria multiple. |
| `available` | Controla si aparece en tienda. |

Riesgo:

- La tabla base no esta completamente definida en las migraciones de este repo.

### 5.2 `store_orders`

Uso:

- orden de tienda;
- reserva temporal;
- estado de pago;
- items comprados;
- datos de contacto.

Campos usados por codigo:

| Campo | Uso |
|---|---|
| `id` | Numero de orden. |
| `items` | JSON con productos, tallas y cantidades. |
| `total` | Total pagado/esperado. |
| `customer_name` | Nombre si existe. |
| `customer_wa` | WhatsApp usado por checkout y matching. |
| `status` | Estado de orden. |
| `expires_at` | Vencimiento de reserva. |
| `payment_verified_at` | Fecha de verificacion. |
| `payment_method` | Metodo detectado. |
| `payment_ref` | Fuente/hash/referencia. |
| `wa_sent` | Marcador de mensaje enviado. |
| `wa_proof_received` | Comprobante recibido por WhatsApp. |
| `wa_message_id` | Referencia del mensaje WA. |

Riesgo importante:

- En migraciones del repo, `store_orders` se crea inicialmente con `customer_phone`, no `customer_wa`.
- En `server.ts`, el flujo usa `customer_wa`.
- En migraciones, el constraint final permite `pending`, `reserved`, `confirmed`, `sold`, `cancelled`.
- En `server.ts` y UI se usan tambien `paid`, `ready`, `delivered`.
- Esto debe normalizarse antes de confiar en automatizacion completa.

### 5.3 `store_customers`

Uso:

- perfil de clienta en tienda;
- WhatsApp + PIN;
- historial de compras.

Campos usados por codigo:

| Campo | Uso |
|---|---|
| `whatsapp` | Identificador principal de clienta. |
| `pin_hash` | Referencia de PIN. |
| `display_name` | Nombre visible si existe. |
| `total_orders` | Historial/resumen. |
| `total_spent` | Total gastado. |

Riesgo:

- La tabla se usa en `server.ts`, pero su definicion no aparece en las migraciones principales revisadas.
- El PIN se guarda como referencia simple; para produccion debe tener hash seguro.

### 5.4 `payment_events`

Uso:

- eventos bancarios para tienda;
- idempotencia por `hash`;
- match con `store_orders`.

Campos:

| Campo | Uso |
|---|---|
| `source` | Origen: MacroDroid/manual/etc. |
| `raw_text` | Texto original del banco. |
| `amount` | Monto detectado. |
| `sender_name` | Nombre si existe. |
| `sender_wa` | Telefono si existe. |
| `processed` | Si fue usado para verificar una orden. |
| `match_confidence` | Nivel de confianza. |
| `matched_order_id` | Orden relacionada. |
| `hash` | Idempotencia. |

### 5.5 `whatsapp_message_queue`

Uso:

- confirmaciones automaticas;
- reintentos;
- envio controlado por bridge.

Estados:

- `pending`
- `sending`
- `sent`
- `failed`
- `cancelled`

Funcion clave:

- `fn_dequeue_whatsapp_message(p_user_id)` toma un mensaje con `FOR UPDATE SKIP LOCKED`.

### 5.6 `customers`

Uso:

- cliente interno de la app principal;
- pagos;
- pedidos fisicos;
- etiquetas activas;
- telefono/WhatsApp.

Campos importantes:

- `full_name`
- `canonical_name`
- `phone`
- `wa_number`
- `active_label`
- `active_label_type`
- `user_id`
- `source`
- `notes`

Riesgo:

- No debe crearse con nombres placeholder como identidad final.
- Si no hay nombre, se debe mantener telefono y origen como dato parcial.

### 5.7 `pedidos`

Uso:

- pedidos internos para preparacion;
- Mesa de Preparacion;
- entrega;
- puente hacia casilleros.

Campos importantes:

- `customer_id`
- `customer_name`
- `item_count`
- `bag_count`
- `label`
- `label_type`
- `status`
- `total_amount`
- `source`
- `web_items_list`

Recomendacion:

- Para tienda, usar `source: 'WEB'`.
- No usar `label: WEB-{orderId}` como etiqueta fisica definitiva.
- La etiqueta fisica debe venir del sistema de casilleros despues de preparar.

### 5.8 `identity_profiles` e `identity_evidence`

Uso:

- perfil unificado entre pagos, tienda, WhatsApp y sistema interno;
- evidencia por canal.

Campos clave de `identity_profiles`:

- `display_name`
- `phone`
- `cliente_id`
- `store_phone`
- `panel_phone`
- `confidence`
- `origin`

Campos clave de `identity_evidence`:

- `source`
- `source_id`
- `source_ref`
- `event_type`
- `amount`
- `phone`
- `name_raw`
- `name_normalized`
- `payload`

Recomendacion:

- Toda orden de tienda debe depositar evidencia `source: 'store_order'`.
- Todo pago confirmado debe depositar evidencia de pago.
- Todo comprobante WhatsApp debe depositar evidencia de WhatsApp/comprobante.

## 6. Endpoints involucrados

### 6.1 Auth de tienda

| Endpoint | Funcion |
|---|---|
| `POST /api/store-auth/register` | Crea cuenta de clienta por WhatsApp + PIN. |
| `POST /api/store-auth/login` | Inicia sesion por WhatsApp + PIN. |
| `GET /api/store-auth/me` | Devuelve perfil y ultimos pedidos. |

### 6.2 Productos

| Endpoint | Funcion |
|---|---|
| `GET /api/products` | Catalogo publico. |
| `POST /api/products` | Crear producto desde admin. |
| `PATCH /api/products/:id` | Editar producto. |
| `DELETE /api/products/:id` | Eliminar producto. |
| `POST /api/upload-image` | Subir imagen de producto. |

### 6.3 Ordenes de tienda

| Endpoint | Funcion |
|---|---|
| `GET /api/store-orders/reserved-products` | Productos temporalmente reservados. |
| `GET /api/store-orders/:id/status` | Polling de pago desde checkout. |
| `POST /api/store-orders` | Crea orden pendiente/reservada. |
| `GET /api/store-orders/me` | Ordenes de la clienta. |
| `GET /api/store-orders/admin` | Ordenes para el operador. |
| `PATCH /api/store-orders/:id` | Cambia estado desde admin. |

### 6.4 Verificacion y cuadrangulacion

| Endpoint | Funcion |
|---|---|
| `POST /api/store/ingest-bank` | Recibe notificacion bancaria para tienda. |
| `POST /api/store/ingest-wa` | Recibe mensaje/comprobante WhatsApp con referencia. |
| `POST /api/store/match-payment` | Cruce manual/automatico de pago. |
| `POST /api/store/verify-order/:id` | Verificacion manual desde admin. |

### 6.5 WhatsApp

| Endpoint | Funcion |
|---|---|
| `GET /api/whatsapp/status` | Estado/QR del bridge. |
| `GET /api/whatsapp/health` | Salud del bridge. |
| `GET /api/whatsapp/queue` | Lista cola de mensajes. |
| `POST /api/whatsapp/queue` | Encola mensaje. |
| `POST /api/whatsapp/send-next` | Envia siguiente mensaje. |
| `POST /api/whatsapp/retry/:id` | Reintenta fallidos. |

## 7. Que ya existe, que falta conectar y que falta implementar

### 7.1 Ya existe

- Catalogo y carrito.
- Checkout con identificacion por WhatsApp + PIN.
- Creacion de orden de tienda.
- Reserva temporal por pedido pendiente.
- Polling del estado de pago.
- Panel admin de productos y pedidos.
- Endpoint de verificacion manual.
- Motor inicial de cruce de pagos.
- Tabla `payment_events`.
- Cola WhatsApp con envio controlado.
- Bridge WhatsApp para envio/estado.
- Insercion de pedido interno despues de verificar.
- Campos `source` y `web_items_list` en `pedidos`.
- Sistema de identidad unificada en `identity_profiles`/`identity_evidence`.

### 7.2 Esta parcialmente conectado

- Perfil de tienda con perfil interno.
- Pedido de tienda con `customers`.
- Pedido de tienda con `identity_profiles`.
- Comprobante WhatsApp con orden de tienda.
- MacroDroid con orden de tienda.
- Confirmacion WhatsApp automatica.
- Pedido verificado con preparacion interna.
- UI de seguimiento de clienta con estados internos reales.

### 7.3 Falta implementar o normalizar

- Estados canonicos de `store_orders`.
- Schema versionado de tienda en migraciones.
- Definicion versionada de `store_customers`.
- Un solo nombre para telefono de tienda: elegir `customer_wa` o `customer_phone`.
- Un solo modelo para eventos WhatsApp: elegir `wa_events`, `wa_messages` o tabla de panel.
- Deposito consistente de evidencia en `identity_evidence`.
- Revision manual formal para tienda cuando el pago no coincide.
- Vista de clienta con seguimiento completo.
- Paso semi-automatico a preparacion sin asignar casillero hasta confirmar bolsas/prendas.
- Pruebas end-to-end de compra, pago, revision y entrega.

## 8. Estados recomendados

Para evitar errores, conviene definir estados canonicos.

### 8.1 Estados recomendados para `store_orders`

| Estado | Significado | Avanza por |
|---|---|---|
| `pending` | Orden creada, esperando pago. | Checkout. |
| `payment_review` | Hay comprobante o evento ambiguo. | Sistema o operador. |
| `paid` | Pago verificado. | MacroDroid o admin. |
| `preparing` | Pedido interno creado y en preparacion. | Sistema. |
| `ready` | Preparado, pendiente entrega/envio. | Operador. |
| `delivered` | Entregado. | Operador. |
| `cancelled` | Vencido/cancelado. | Sistema u operador. |

Si se prefiere mantener estados existentes, debe mapearse:

| Actual usado | Equivalente recomendado |
|---|---|
| `confirmed` | `preparing` o `ready`, segun contexto. |
| `sold` | `paid` o `delivered`, segun contexto. |
| `reserved` | `pending`. |

La prioridad es que backend, migraciones y UI usen el mismo vocabulario.

### 8.2 Estados recomendados para `pedidos`

| Estado | Significado |
|---|---|
| `procesar` | Pendiente de Mesa de Preparacion. |
| `listo` | Preparado y con casillero asignado. |
| `entregado` | Retirado/liberado. |

Para tienda, el pedido interno deberia entrar como `procesar` despues de pago verificado, pero la etiqueta fisica debe esperar la confirmacion de bolsas/prendas.

## 9. Automatizacion posible sin grandes cambios

Se puede avanzar con cambios moderados si el primer alcance es tienda:

1. Normalizar estados y columnas usados por tienda.
2. Hacer que `confirmStoreOrder` sea el punto unico de confirmacion.
3. Crear evidencia de identidad siempre que se cree/verifique una orden.
4. Crear pedido interno solo despues de pago verificado.
5. Encolar WhatsApp de confirmacion.
6. Mostrar casos ambiguos en revision manual.
7. Dejar el casillero para despues de la confirmacion del operador.

No hace falta reescribir:

- el catalogo;
- el carrito;
- la Mesa de Preparacion;
- las funciones de casilleros;
- el bridge WhatsApp;
- el sistema de pagos MacroDroid.

Lo que si hace falta es ordenar contratos entre estas piezas.

## 10. Flujo manual de respaldo

Cada fase debe poder probarse manualmente:

| Fase | Modo manual |
|---|---|
| Crear perfil | Admin busca/crea cliente por telefono. |
| Crear orden | Admin crea pedido o usa checkout. |
| Ver pago | Boton `Verificar Pago Manualmente`. |
| Revisar comprobante | Admin ve evento y confirma/rechaza. |
| Enviar WhatsApp | Cola permite enviar/reintentar. |
| Crear pedido interno | Boton o accion de confirmacion. |
| Preparar | Mesa de Preparacion actual. |
| Casillero | Asignacion existente al marcar listo. |
| Entrega | Flujo actual de entrega. |

Este modo manual es clave para probar automatizacion por etapas sin romper operacion diaria.

## 11. Riesgos tecnicos actuales

### 11.1 Estados inconsistentes

Las migraciones y el codigo no muestran un contrato unico para `store_orders.status`.

Riesgo:

- el checkout puede esperar `paid`;
- el constraint podria no permitir `paid`;
- la UI admin puede filtrar `ready`/`delivered`;
- el backend puede escribir estados que la base rechaza.

Prioridad:

- Alta.

### 11.2 Columnas no alineadas

Se observa uso de:

- `customer_phone` en migracion inicial;
- `customer_wa` en backend/UI;
- `wa_events` en migracion;
- `wa_messages` en backend.

Riesgo:

- errores en runtime;
- datos repartidos;
- match de pago incompleto;
- seguimiento de clienta incompleto.

Prioridad:

- Alta.

### 11.3 Definiciones faltantes de tienda

`products` y `store_customers` se usan, pero no estan completamente definidas en las migraciones principales revisadas.

Riesgo:

- despliegues nuevos incompletos;
- dificil reproducir entorno;
- automatizacion dependiente de estructura no versionada.

Prioridad:

- Alta.

### 11.4 Verificacion de token mezclada

Algunos endpoints de tienda validan token con `supabaseServer`, mientras la tienda autentica con `supabaseStore`.

Riesgo:

- sesiones validas de tienda pueden fallar;
- permisos admin/cliente se pueden confundir.

Prioridad:

- Media/Alta.

### 11.5 Creacion de nombres placeholder

`confirmStoreOrder` puede crear cliente con nombre tipo cliente de tienda si no hay nombre bancario.

Riesgo:

- rompe la regla de no inventar nombres;
- genera identidades sucias;
- complica matching futuro.

Prioridad:

- Alta.

### 11.6 Casillero antes de validacion fisica

Si el sistema asigna casillero antes de que el operador confirme prendas/bolsas, puede ocupar casilleros incorrectamente.

Riesgo:

- etiquetas incorrectas;
- migraciones SIMPLE/COMPLEX innecesarias;
- confusion operativa.

Prioridad:

- Media/Alta.

## 12. Checklist de pruebas manuales

### 12.1 Compra feliz con pago automatico

- Crear producto disponible.
- Entrar a tienda.
- Agregar al carrito.
- Identificarse con WhatsApp + PIN.
- Crear orden.
- Simular notificacion MacroDroid con monto exacto.
- Confirmar que `store_orders.status` cambia a pagado.
- Confirmar que se crea `payment_events`.
- Confirmar que se encola WhatsApp.
- Confirmar que se crea pedido interno `source: 'WEB'`.
- Confirmar que el producto deja de estar disponible.

### 12.2 Compra con pago ambiguo

- Crear dos ordenes con el mismo monto.
- Enviar evento bancario sin referencia.
- Verificar que no se confirme automaticamente.
- Confirmar que queda para revision manual.
- Verificar manualmente una orden.
- Confirmar que solo esa orden avanza.

### 12.3 Compra con comprobante WhatsApp

- Crear orden.
- Enviar mensaje WhatsApp con `#id`.
- Confirmar que se registra evento WhatsApp.
- Si ya existe pago bancario, confirmar orden.
- Si no existe, dejar esperando banco/revision manual.

### 12.4 Reserva vencida

- Crear orden y no pagar.
- Esperar vencimiento.
- Confirmar que pasa a `cancelled`.
- Confirmar que productos quedan disponibles.
- Confirmar que checkout no marca pago como verificado.

### 12.5 Perfil de clienta

- Registrar clienta nueva.
- Confirmar que puede iniciar sesion con WhatsApp + PIN.
- Confirmar que ve sus pedidos.
- Confirmar que el perfil se vincula a identidad interna sin nombre falso.

### 12.6 Preparacion y casilleros

- Verificar pago de tienda.
- Confirmar que aparece pedido interno en perfil/mesa.
- Operador confirma prendas y bolsas.
- Marcar pedido listo.
- Confirmar que se asigna casillero por backend.
- Entregar.
- Confirmar liberacion de casillero.

## 13. Recomendacion de implementacion por prioridad

### Prioridad 1 - Contratos de datos

- Definir estados canonicos de `store_orders`.
- Alinear migraciones, backend y UI.
- Elegir campo unico para telefono de tienda.
- Versionar tablas faltantes: `products`, `store_customers` y eventos WA de tienda.

### Prioridad 2 - Confirmacion unica de orden

- Centralizar todo en `confirmStoreOrder`.
- Hacer idempotente la confirmacion.
- Registrar evidencia de identidad y pago en el mismo flujo.
- Evitar nombres placeholder como identidad final.

### Prioridad 3 - Revision manual

- Crear estado `payment_review` o equivalente.
- Mostrar eventos ambiguos en admin.
- Permitir aprobar/rechazar con motivo.
- Registrar quien aprobo y cuando.

### Prioridad 4 - Perfil de clienta

- Mostrar historial de ordenes.
- Mostrar estado de pago.
- Mostrar estado de preparacion.
- Mostrar entrega/listo.
- Preparar este perfil para que despues sirva tambien al flujo WhatsApp.

### Prioridad 5 - Integracion con preparacion

- Crear pedido interno solo tras pago verificado.
- Mantener `source: 'WEB'`.
- Mostrar items web en la Mesa de Preparacion.
- Confirmar prendas/bolsas antes de casillero.

### Prioridad 6 - Observabilidad

- Registrar logs de match.
- Registrar eventos de WhatsApp.
- Registrar errores de cola.
- Tener vista de auditoria por orden.

## 14. Conclusion

La tienda online es el mejor primer flujo para automatizar porque ya tiene una base funcional: catalogo, carrito, auth por WhatsApp, ordenes, verificacion, admin, cola WhatsApp y puente hacia pedidos internos.

No hace falta rehacer toda la aplicacion. El paso importante es normalizar contratos y conectar las piezas con un flujo unico de confirmacion.

La automatizacion recomendada debe ser semi-automatica:

- automatico para crear orden, cruzar pago, encolar confirmacion y preparar el pedido interno;
- manual para revisar ambiguedades y confirmar la preparacion fisica antes de casilleros.

Este enfoque permite avanzar rapido sin perder control operativo.
