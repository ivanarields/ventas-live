# Base De Datos De Tienda — Plan De Mejoras

## Regla

Las mejoras nuevas deben ir en la base de tienda.

Base:

`thgbfurscfjcmgokyyif`

No se deben agregar campos nuevos a la base principal para estas funciones.

## Mejoras En `store_orders`

Agregar datos para calendario, entrega y control del pedido.

Campos recomendados:

| Campo | Tipo esperado | Uso |
|-------|---------------|-----|
| `delivery_type` | text | retiro o delivery |
| `delivery_date` | date | dia elegido por el cliente |
| `delivery_slot` | text | horario elegido |
| `delivery_address` | text | direccion del cliente |
| `delivery_notes` | text | nota opcional |
| `delivery_status` | text | pendiente, listo, entregado |
| `customer_note` | text | nota visible del cliente |
| `admin_note` | text | nota interna de la duena |
| `status_updated_at` | timestamp | ultima vez que cambio el estado |

## Nueva Tabla `store_delivery_slots`

Sirve para manejar horarios disponibles.

Ejemplo:

| Campo | Uso |
|-------|-----|
| `id` | identificador |
| `name` | manana, tarde, noche |
| `start_time` | hora inicio |
| `end_time` | hora fin |
| `active` | si esta disponible |
| `sort_order` | orden visual |

## Nueva Tabla `store_message_templates`

Sirve para editar mensajes desde el panel.

Ejemplo:

| Campo | Uso |
|-------|-----|
| `id` | identificador |
| `key` | pedido_creado, pago_confirmado, listo |
| `title` | nombre visible |
| `body` | texto del mensaje |
| `active` | si se usa o no |
| `updated_at` | fecha de ultima edicion |

Variables utiles dentro del mensaje:

- `{order_id}`
- `{customer_name}`
- `{total}`
- `{delivery_date}`
- `{delivery_slot}`
- `{store_name}`

## Nueva Tabla `store_message_log`

Sirve para saber que mensaje se genero o envio.

Ejemplo:

| Campo | Uso |
|-------|-----|
| `id` | identificador |
| `order_id` | pedido relacionado |
| `customer_wa` | numero del cliente |
| `template_key` | tipo de mensaje |
| `message_body` | texto final |
| `status` | draft, copied, queued, sent, failed |
| `created_at` | fecha |

## Nueva Tabla `store_external_purchases`

Sirve para mostrar historial de compras que no nacieron en la tienda, como Live.

La tienda solo muestra esta informacion.

No cambia la app principal.

Ejemplo:

| Campo | Uso |
|-------|-----|
| `id` | identificador |
| `source` | live, manual, otro |
| `source_id` | id original si existe |
| `customer_wa` | telefono del cliente |
| `customer_name` | nombre si se conoce |
| `items` | resumen de prendas |
| `total` | monto |
| `status` | estado visible |
| `purchase_date` | fecha de compra |
| `payload` | datos extra |

## Nueva Tabla `store_favorites`

Sirve para que el cliente guarde productos favoritos.

Ejemplo:

| Campo | Uso |
|-------|-----|
| `id` | identificador |
| `customer_wa` | telefono del cliente |
| `product_id` | producto guardado |
| `created_at` | fecha |

## Nueva Tabla `store_settings`

Sirve para configuracion simple de tienda.

Ejemplo:

| Campo | Uso |
|-------|-----|
| `key` | nombre de configuracion |
| `value` | valor |

Configuraciones utiles:

- Nombre de tienda.
- Numero de WhatsApp.
- Tiempo de reserva.
- Delivery activo o no.
- Retiro activo o no.
- Dias disponibles.
- Mensaje de portada.

## Recomendacion De Seguridad

Mantener las operaciones delicadas en el servidor.

El cliente no debe poder modificar pedidos directamente desde el navegador sin validacion.

## Recomendacion De Orden

Primero agregar campos de calendario.

Despues agregar mensajes.

Despues agregar historial externo.

Despues favoritos y funciones adictivas.
