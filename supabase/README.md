# Supabase — Sistema de etiquetas

## Bases de datos

| Nombre | ID | Para qué |
|---|---|---|
| **ChehiAppAbril** | `vhczofpmxzbqzboysoca` | Sistema principal: pagos, clientes, pedidos, etiquetas, cola WhatsApp |
| **TiendaOnline** | `thgbfurscfjcmgokyyif` | Productos web, pedidos web, perfiles de tienda |
| **PanelPedido** | `vwaocoaeenavxkcshyuf` | Chats WhatsApp, fotos reales en bucket `whatsapp-media` |

## Aplicar migraciones

Las migraciones están en `supabase/migrations/`. Se aplican en el SQL Editor del dashboard de Supabase (proyecto ChehiAppAbril), en orden numérico (`001` al `043+`).

```bash
C:/Users/IVAN/bin/supabase.exe db push
```

## Etiquetas (sistema de asignación)

El sistema asigna etiquetas físicas a los pedidos según cantidad de bolsas:

| Tipo | Códigos | Capacidad |
|---|---|---|
| `NUMERIC_SHARED` | 1–100 | Hasta 5 pedidos simples (1 bolsa) |
| `ALPHA_COMPLEX` | A–Z | Hasta 20 bolsas por clienta |

Funciones PL/pgSQL con `FOR UPDATE SKIP LOCKED`:
```sql
fn_assign_container(order_id, user_id)
fn_migrate_to_complex(order_id)
fn_release_container(order_id, reason)
fn_recalc_container_state(container_id)
```

La lógica transaccional vive en PostgreSQL. El servidor solo orquesta; el frontend solo muestra el resultado.

## Deploy de Edge Functions

```bash
# ChehiAppAbril
C:/Users/IVAN/bin/supabase.exe functions deploy ingest-notification --no-verify-jwt --project-ref vhczofpmxzbqzboysoca

# TiendaOnline
C:/Users/IVAN/bin/supabase.exe functions deploy ingest-bank-store --no-verify-jwt --project-ref thgbfurscfjcmgokyyif
```

## Variables de entorno necesarias

Ver `docs/contexto/05-estado-pendientes.md` para la lista completa.
