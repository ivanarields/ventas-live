# Cambios realizados — 5 de abril de 2026

## Resumen

**V1 (041):** Se expandió de 8 a 126 casilleros. Se agregó agrupación automática de pedidos por cliente en el mismo casillero alfabético.

**V2 (042):** Se cambió la lógica para decidir por total de bolsas de la clienta (no por pedido). Capacidad de letras subió de 12 a 20. Nunca se degrada de letra a numérico.

---

## Archivos modificados

| Archivo | Acción |
|---|---|
| `supabase/migrations/041_group_orders_by_client_alpha.sql` | Nuevo — V1 |
| `supabase/migrations/042_v2_total_bags_per_customer.sql` | Nuevo — V2 (aplica sobre V1) |
| `src/services/labelingService.ts` | Sin cambios (compatible) |
| `src/App.tsx` | Sin cambios (compatible) |

---

## V1 — Migración 041

### Cambio 1: Expansión de casilleros

**Antes:** 4 numéricos (1-4) + 4 alfabéticos (A-D) = 8 casilleros.

**Ahora:** 100 numéricos (1-100) + 26 alfabéticos (A-Z) = 126 casilleros.

### Cambio 2: `fn_assign_container` — Agrupar en letra existente

Si el cliente ya tiene letra, el nuevo pedido se agrupa ahí.

### Cambio 3: `fn_migrate_to_complex` — Migrar a letra existente

Si el cliente ya tiene letra, suma bolsas ahí en vez de buscar una nueva letra.

### Cambio 4: `fn_downgrade_to_simple` — No degradar si hay otros pedidos

Solo se mueve a numérico si es el último pedido en la letra.

### Cambio 5: `fn_upsert_order_and_assign` — Reagrupar pedidos sueltos

Pedidos en numérico se mueven a letra si el cliente ya tiene una.

---

## V2 — Migración 042

### Cambio 6: `fn_assign_container` — Decidir por total de bolsas de la clienta

**Antes (V1):** Si no tenía letra, miraba el tipo del pedido: SIMPLE → numérico, COMPLEX → letra.

**Ahora (V2):** Mira el total de bolsas activas de la clienta:
- 1 bolsa total → numérico
- 2 o más bolsas total → letra

Esto significa que **dos pedidos de 1 bolsa** de la misma clienta disparan la migración a letra automáticamente.

### Cambio 7: `fn_upsert_order_and_assign` — Reagrupar automáticamente al obtener letra

Cuando una clienta obtiene letra, **todos** sus pedidos numéricos activos se mueven automáticamente a esa misma letra. El pedido nuevo y los viejos quedan agrupados.

### Cambio 8: `fn_downgrade_to_simple` — Nunca degradar

**Antes (V1):** Si era el último pedido en letra y bajaba a 1 bolsa, se movía a numérico.

**Ahora (V2):** Una vez que la clienta está en letra, **se queda ahí hasta entregar todo**. Solo se libera la letra cuando ya no tiene ningún pedido activo.

### Cambio 9: Capacidad de letras

**Antes:** 12 bolsas máximo por letra.

**Ahora:** 20 bolsas máximo por letra.

---

## Escenario: María René

| Día | Pedido | Qué pasa |
|---|---|---|
| 5 mayo | 1 bolsa | Total = 1 → **numérico 1** |
| 6 mayo | 1 bolsa | Total = 2 → **letra E** (y el pedido del 5 mayo se mueve a E también) |
| 7 mayo | 2 bolsas | Ya tiene letra E → **agrupa en E**. Total E = 4 bolsas |
| Entrega | 1 pedido | Se liberan las bolsas de ese pedido. Si aún quedan activos, E se mantiene |

---

## Cómo revertir

### Revertir V2 (mantener V1):
Ejecutar migraciones 011 y 013 en el SQL Editor para restaurar `fn_assign_container` y `fn_upsert_order_and_assign` a la versión V1.

```sql
DELETE FROM supabase_migrations.schema_migrations WHERE version = '042_v2_total_bags_per_customer';
UPDATE storage_containers SET max_bags_capacity = 12 WHERE container_type = 'ALPHA_COMPLEX';
```

### Revertir todo (V1 + V2):
```sql
DELETE FROM storage_containers WHERE container_code::int BETWEEN 5 AND 100;
DELETE FROM storage_containers WHERE container_code IN ('E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z');
UPDATE storage_containers SET max_bags_capacity = 12 WHERE container_type = 'ALPHA_COMPLEX';
DELETE FROM supabase_migrations.schema_migrations WHERE version IN ('041_group_orders_by_client_alpha', '042_v2_total_bags_per_customer');
```
Luego ejecutar migraciones 011 y 013 manualmente.

---

## Verificación post-cambios

- 126 casilleros creados ✓
- Capacidad de letras = 20 ✓
- Prueba: 1 bolsa + 1 bolsa = total 2 → letra E ✓
- Prueba: pedido numérico viejo reagrupado automáticamente a E ✓
- Prueba: limpieza → casillero E vuelve a AVAILABLE ✓
