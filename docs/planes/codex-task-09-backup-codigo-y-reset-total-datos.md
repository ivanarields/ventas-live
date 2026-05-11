# Backup de codigo y reset total de datos

Lee todo antes de tocar cualquier cosa.
Esta tarea es peligrosa porque borra datos reales. No borres codigo, tablas, columnas, buckets, funciones ni migraciones.

Objetivo:
1. Crear una copia de seguridad del codigo actual.
2. Hacer reset total de datos de negocio/clientes/pagos/tienda/WhatsApp/storage.
3. Dejar la app como recien instalada para pruebas de la clienta.
4. Verificar que no queden datos ni fotos.
5. Verificar que la app sigue funcionando.

No hacer backup de base de datos. El usuario solo quiere backup del codigo.

---

## PARTE 1 - Backup del codigo actual

Crear backup local antes de cualquier cambio o borrado.

Destino:

```txt
C:\Proyectos Ivan\nuevo\backups\codigo-antes-reset-total-2026-05-11\
```

Debe incluir:

- `src/`
- `server.ts`
- `supabase/`
- `docs/`
- `public/`
- `package.json`
- `package-lock.json` si existe
- `vite.config.*`
- `tsconfig*`
- `.env*`
- cualquier archivo de configuracion del proyecto

No hace falta copiar:

- `node_modules/`
- `dist/`
- `.git/`
- `backups/`

Tambien crear rama Git de seguridad:

```bash
git branch backup/antes-reset-total-datos
```

Si la rama ya existe, no fallar: reportarlo y continuar.

---

## PARTE 2 - Confirmar destino antes de borrar

Antes de borrar, mostrar sin secretos:

- ChehiAppAbril: project ref esperado `vhczofpmxzbqzboysoca`
- TiendaOnline: project ref esperado `thgbfurscfjcmgokyyif`
- PanelPedido: project ref esperado `vwaocoaeenavxkcshyuf`

Revisar variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_STORE_SUPABASE_URL`
- `STORE_SUPABASE_SERVICE_ROLE_KEY`
- `VITE_PANEL_SUPABASE_URL`
- `PANEL_SUPABASE_SERVICE_ROLE_KEY`

No mostrar keys.
Si alguna URL no apunta al project ref esperado, detenerse y reportar.

---

## PARTE 3 - Crear script de reset controlado

Crear archivo:

```txt
scripts/reset-total-datos.mjs
```

El script debe:

- usar `dotenv/config`
- usar `@supabase/supabase-js`
- conectarse a las 3 bases
- tener modo `--dry-run`
- no borrar nada si no recibe:

```txt
RESET_TOTAL_CONFIRM=SI_BORRAR_TODO
```

Comandos esperados:

```bash
node scripts/reset-total-datos.mjs --dry-run
RESET_TOTAL_CONFIRM=SI_BORRAR_TODO node scripts/reset-total-datos.mjs
```

En Windows PowerShell:

```powershell
$env:RESET_TOTAL_CONFIRM="SI_BORRAR_TODO"; node scripts/reset-total-datos.mjs
```

---

## PARTE 4 - Que borrar en ChehiAppAbril

Borrar datos de negocio:

- `container_allocations`
- `order_bags`
- `orders`
- `pedidos`
- `pagos`
- `transactions`
- `raw_notification_events`
- `parsed_payment_candidates`
- `manual_review_queue`
- `identity_evidence`
- `identity_profiles`
- `whatsapp_message_queue`
- `customers`
- `live_sessions` si son datos de prueba

No borrar:

- `app_users`
- `storage_containers`
- funciones SQL
- migraciones
- configuracion necesaria del sistema

Despues de borrar, resetear `storage_containers`:

- `current_simple_orders = 0`
- `current_bags_used = 0`
- `state = 'AVAILABLE'`

---

## PARTE 5 - Que borrar en TiendaOnline

Borrar todo lo de tienda:

- `store_favorites`
- `store_message_log`
- `store_selection_requests`
- `store_customer_media`
- `store_external_purchases`
- `payment_events`
- `wa_messages`
- `store_orders`
- `store_customers`
- `products`

Borrar usuarios Auth de tienda:

- usuarios cuyo email termine en `@tiendaleydi.com`

Borrar storage:

- todos los archivos dentro del bucket `store_images`

No borrar:

- bucket `store_images`
- `store_settings`
- `store_delivery_slots`
- estructura de tablas
- funciones
- migraciones

Nota: se borran productos, pero no la configuracion de tienda.

---

## PARTE 6 - Que borrar en PanelPedido

Borrar datos WhatsApp/Live:

- `evidencias_venta_live`
- `pagos_venta_live`
- `pedidos_venta_live`
- `tarjetas_venta_live`
- `panel_mensajes`
- `panel_clientes`

Borrar storage:

- todos los archivos dentro del bucket `whatsapp-media`

No borrar:

- bucket `whatsapp-media`
- estructura de tablas
- funciones
- migraciones

---

## PARTE 7 - Orden obligatorio de borrado

Seguir este orden para evitar datos colgados:

1. Borrar archivos de storage.
2. Borrar tablas hijas.
3. Borrar pedidos/pagos.
4. Borrar clientes.
5. Borrar usuarios Auth de tienda.
6. Resetear etiquetas fisicas (`storage_containers`).
7. Verificar conteos.

Si una tabla no existe, no romper el script: reportar `tabla ausente` y seguir.

---

## PARTE 8 - Verificacion final

El script debe imprimir tabla final de conteos.

Debe quedar en 0:

ChehiAppAbril:

- `customers`
- `pagos`
- `pedidos`
- `orders`
- `order_bags`
- `container_allocations`
- `transactions`
- `identity_profiles`
- `identity_evidence`
- `whatsapp_message_queue`

TiendaOnline:

- `products`
- `store_customers`
- `store_orders`
- `store_favorites`
- `store_customer_media`
- `store_selection_requests`
- `store_external_purchases`
- `payment_events`
- `wa_messages`

PanelPedido:

- `panel_clientes`
- `panel_mensajes`
- `pagos_venta_live`
- `pedidos_venta_live`
- `tarjetas_venta_live`
- `evidencias_venta_live`

Storage:

- `store_images`: 0 archivos
- `whatsapp-media`: 0 archivos

Etiquetas:

- `storage_containers` debe seguir existiendo
- todas disponibles
- contadores en 0

---

## PARTE 9 - Verificar que la app no se rompio

Despues del reset:

1. Ejecutar:

```bash
npm run build
```

2. Ejecutar local:

```bash
npm run dev
```

3. Verificar:

- app principal abre
- pestana Pagos muestra vacio
- pestana Etiquetas muestra vacio
- Tienda abre sin productos
- Panel Tienda muestra 0 productos, 0 pedidos, 0 clientes
- Config sigue cargando
- no hay errores 500 en `/api/store/settings`

---

## Reporte final

Responder corto:

| Punto | Estado | Evidencia |
|---|---|---|
| Backup codigo | OK/Fallo | ruta |
| Dry run | OK/Fallo | resumen |
| Reset ejecutado | OK/Fallo | resumen |
| Tablas en 0 | OK/Fallo | resumen |
| Storage vacio | OK/Fallo | resumen |
| Auth tienda limpio | OK/Fallo | resumen |
| App funciona | OK/Fallo | resumen |

Si algo falla, detenerse y explicar exactamente donde fallo.
