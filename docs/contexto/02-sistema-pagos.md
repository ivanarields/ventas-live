# Sistema de Pagos y Casilleros

## Tres tipos de pago en la app

1. **Pago en efectivo manual** — el operador toca "Registrar" en la Lista de Pagos.
2. **Pago de Live (WhatsApp)** — la clienta manda comprobante por WhatsApp + MacroDroid detecta la transferencia bancaria.
3. **Pago de Tienda Online** — la clienta paga el QR en la tienda web + MacroDroid detecta la transferencia.

---

## Flujo del pago Live (WhatsApp + MacroDroid)

```
1. Clienta paga por Yape/transferencia.
2. Banco notifica al celular del operador.
3. MacroDroid captura la notificación y la manda a:
   POST https://vhczofpmxzbqzboysoca.supabase.co/functions/v1/ingest-notification
4. Edge Function ingest-notification parsea nombre + monto.
5. Inserta en tabla pagos.
6. La clienta también manda comprobante por WhatsApp.
7. Bridge guarda el mensaje en panel_mensajes (DB PanelPedido).
8. Operador toca "Live" en la app o entra al chat manualmente.
9. POST /api/ai/summarize-conversation analiza con OpenRouter.
10. Crea pagos_venta_live con estado pendiente_whatsapp.
11. matchLivePaymentWithMacrodroid cruza por nombre + monto (±5 min).
12. Si match → estado verificado_macrodroid (verde).
13. Si no match → queda pendiente_whatsapp (morado) para revisión manual.
```

### Estados de un pago Live

| Estado | Color | Significado |
|---|---|---|
| `verificado_macrodroid` | Verde | Comprobante WA cruzado automáticamente con MacroDroid |
| `verificado_manual` | Verde | Operador confirmó manualmente desde panel |
| `pendiente_whatsapp` | Morado | Comprobante llegó pero no hay MacroDroid que coincida |
| `posible_duplicado` | Morado | Mismo nombre/monto/hora que otro pago ya registrado |
| `rechazado` | Gris | Descartado manualmente |

---

## Flujo del pago de Tienda Online

```
1. Clienta entra a leidydiaz.live/tienda.
2. Login obligatorio con teléfono + PIN (si es nueva, se crea cuenta automática).
3. Elige prendas, va al checkout.
4. Sistema crea store_orders con status=pending y reserva los productos por 1 minuto.
5. Muestra QR de Yape. Polling cada 3 seg al estado del pedido.
6. Clienta paga.
7. Banco notifica al celular del operador.
8. MacroDroid captura y manda a:
   POST https://thgbfurscfjcmgokyyif.supabase.co/functions/v1/ingest-bank-store
9. Edge Function ingest-bank-store busca pedido pending con monto coincidente (ventana 35 min).
10. Si encuentra → llama POST /api/store/match-payment en el servidor Express.
11. /api/store/match-payment ejecuta confirmStoreOrder.
12. confirmStoreOrder hace TODO esto:
    - store_orders.status = paid
    - products.stock = 0 para los productos vendidos
    - Crea/actualiza customer en ChehiAppAbril
    - Inserta pedido con label=WEB-{id}, label_type=WEB, source=WEB
    - Inserta pago con method=Tienda Online
    - Encola UN solo mensaje WhatsApp (ver más abajo)
```

### Mensaje WhatsApp único para tienda

Cuando se confirma un pago de tienda, se encola UN solo mensaje en `whatsapp_message_queue`:

> ¡Hola Nombre! 🎉
> Tu pago fue confirmado. Tu pedido #N está listo. ¡Muchas gracias por tu compra!
> Mirá los detalles en tu perfil:
> https://leidydiaz.live/tienda#profile

**No hay segundo mensaje** cuando el operador toca "PEDIDO LISTO" en Mesa de Preparación, porque los pedidos web (`source='WEB'`) están filtrados en `PATCH /api/pedidos/:id`.

Para pedidos **no web** (Live u otros), sí se manda el mensaje "tu pedido está listo" cuando se marca LISTO.

---

## Procesador automático de cola WhatsApp

Cada 60 segundos, el servidor toma el siguiente mensaje pendiente de la cola y lo envía al bridge.

- **Filtro:** solo procesa mensajes con `reference_type='store_order'` (option `storeOnly: true`).
- **Función:** `processNextWhatsappQueueMessage` en `src/routes/whatsapp.ts`.
- **Arranque:** `startWhatsappQueueProcessor()` en `server.ts`, se invoca al levantar la app.
- **Mensajes Live u otros tipos** se envían a mano desde el panel con el botón "Envío Seguro".

---

## Parseo de notificaciones bancarias (cascada)

Edge Function `ingest-notification` y `ingest-bank-store` usan esta cascada para extraer nombre + monto:

1. **Regex hardcodeados** — Yape directo, Yape QR, Yastaa, bancos bolivianos.
2. **Patrones aprendidos** (`learned_text_patterns`) — aprende contexto antes/después del nombre por `app_package`.
3. **OpenRouter** (`google/gemini-2.5-flash-lite`) — casos nuevos no cubiertos por regex.
4. Sin nombre válido → `manual_review_queue` (NUNCA placeholder tipo "PAGO Yape").

**Idempotencia:** hash SHA-256 de cada notificación (`raw_hash`) evita duplicados.

---

## MacroDroid — configuración

- **Dispositivo:** `android-caja-01`
- **Apps capturadas:** Yape (`com.bcp.bo.wallet`), Yastaa (`com.busa.wallet`), bancos bolivianos.
- **Endpoints destino:**
  - Live: `https://vhczofpmxzbqzboysoca.supabase.co/functions/v1/ingest-notification`
  - Tienda: `https://thgbfurscfjcmgokyyif.supabase.co/functions/v1/ingest-bank-store`
- **Headers:** `x-device-id: android-caja-01`, `x-device-secret: $INGEST_DEVICE_SECRET`
- **Payload:** `{ source, device_id, event_uuid, captured_at_ms, app_name, app_package, title, text, big_text }`

---

## Sistema de casilleros

### Tipos

| Tipo | Códigos | Capacidad | Para qué |
|---|---|---|---|
| `NUMERIC_SHARED` | 1–100 | 5 pedidos simples, 1 bolsa c/u | 1 bolsa por pedido |
| `ALPHA_COMPLEX` | A–Z (26) | 12 bolsas máx | 2+ bolsas por pedido |

### Reglas

- Pedido en `procesar` → sin casillero.
- Pedido marcado LISTO con 1 bolsa → casillero numérico.
- Pedido marcado LISTO con 2+ bolsas → casillero alfabético.
- Cliente con casillero letra activo → nuevo pedido hereda la misma letra.
- Al sumar bolsa: si el cliente totaliza 2+ bolsas → migra de número a letra automáticamente.
- Al marcar entregado → casillero liberado (RELEASED).

### Funciones PL/pgSQL clave

```
fn_assign_container(order_id, user_id)      asigna con FOR UPDATE SKIP LOCKED
fn_migrate_to_complex(order_id)             migra de número a letra
fn_release_container(order_id, reason)      libera al entregar
fn_recalc_container_state(container_id)     recalcula estado
```

### Migraciones recientes

- `041_group_orders_by_client_alpha.sql` — casilleros alfabéticos agrupados por clienta.
- `042_v2_total_bags_per_customer.sql` — lógica basada en bolsas totales del cliente.
- `043_fix_downgrade_last_order.sql` — permite degradar de letra a número cuando es el último pedido activo.
- `044_store_favorites.sql` — tabla de favoritos en TiendaOnline (no afecta sistema principal).

---

## Tablas relacionadas a pagos

### En ChehiAppAbril (`vhczofpmxzbqzboysoca`)

```
pagos                  pagos confirmados
payment_events         eventos de MacroDroid (raw + matched_order_id)
manual_review_queue    notificaciones que IA no pudo parsear
raw_notification_events  todas las notificaciones recibidas (auditoría)
whatsapp_message_queue mensajes pendientes/enviados/fallidos
learned_text_patterns  patrones de extracción aprendidos por IA
```

### En PanelPedido (`vwaocoaeenavxkcshyuf`)

```
panel_clientes         un registro por número de teléfono
panel_mensajes         mensajes y fotos recibidos
pedidos_venta_live     pedidos del live
pagos_venta_live       comprobantes procesados (estado, main_pago_id, panel_mensaje_id)
```
