-- ============================================================================
-- Limpieza de asignaciones huérfanas
-- ============================================================================
-- Libera todas las asignaciones ACTIVE cuyo pedido ya no existe en la tabla
-- pedidos (borrados sin que se liberara la etiqueta en sesiones anteriores).
-- ============================================================================

-- Liberar asignaciones huérfanas
UPDATE container_allocations ca
SET status        = 'RELEASED',
    released_at   = NOW(),
    released_by   = 'cleanup',
    release_reason = 'ORPHANED_PEDIDO_DELETED'
WHERE ca.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM orders o
    JOIN pedidos p ON p.id::text = o.firebase_id
    WHERE o.id = ca.order_id
  );

-- Recalcular contadores desde asignaciones reales restantes
SELECT fn_rebuild_container_counters();
