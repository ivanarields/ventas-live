# Pruebas Finales Pendientes — 2026-05-06

## Pruebas ya realizadas y aprobadas ✅

| # | Prueba | Resultado |
|---|--------|-----------|
| 1 | MacroDroid + comprobante WhatsApp → pago verde | ✅ Aprobada |
| 2 | 1 bolsa → casillero numérico asignado | ✅ Aprobada |
| 3 | 2 bolsas → migración automática a casillero letra | ✅ Aprobada |
| 4 | Marcar entregado → casillero liberado | ✅ Aprobada |
| 5 | Pago manual en efectivo → aparece en lista | ✅ Aprobada |
| 6 | Dos pagos del mismo monto → 2 registros separados | ✅ Aprobada |

---

## Pruebas pendientes

---

### A — Verificación manual de pago morado

**Qué se prueba:** Un pago quedó morado (nombre no coincidió). El operador lo verifica a mano.

**Cómo hacerlo:**
1. Buscar un pago morado en la Lista de Pagos
2. Tocarlo → aparece el botón "Verificar"
3. Confirmar la verificación manual

**Qué debe pasar:** El pago cambia de morado a verde.

**Qué verifico en DB:** `estado = verificado_manual` en `pagos_venta_live`.

---

### B — Cliente con dos pedidos activos al mismo tiempo

**Qué se prueba:** Cuando una clienta tiene 2 pedidos activos, ambos deben compartir el mismo casillero letra.

**Cómo hacerlo:**
1. Registrar un segundo pago para IVAN ARIEL (u otra clienta que ya tenga un pedido activo)
2. Abrir ese nuevo pedido → Mesa de Preparación → 1 bolsa → PEDIDO LISTO
3. Ver qué casillero le asignó

**Qué debe pasar:** Ambos pedidos tienen el mismo casillero letra (ej: H).

**Qué verifico en DB:** Las dos `container_allocations` activas del cliente apuntan al mismo `container_id`.

---

### C — MacroDroid captura notificación basura

**Qué se prueba:** Que las notificaciones de publicidad/promo de Yape no crean pagos falsos.

**Cómo hacerlo:**
1. Revisar si llegó alguna notificación rara en los últimos días (promo, recarga, sorteo)
2. O simplemente revisar la tabla `pagos` por nombres como "Yape", "Recarga", "Promo"

**Qué debe pasar:** No hay pagos con esos nombres. El sistema los filtra o los manda a revisión manual.

**Qué verifico en DB:** No existen registros con `nombre` igual a palabras genéricas en la tabla `pagos`.

---

### D — Comprobante de solo texto (sin foto)

**Qué se prueba:** Que el sistema no crashea cuando llega un mensaje de texto sin imagen.

**Cómo hacerlo:**
1. Mandar un mensaje de texto al WhatsApp del negocio: "ya te pagué, son Bs 50"
2. Apretar el botón Live

**Qué debe pasar:** No hay error. El sistema lo procesa sin crashear. Puede quedar como pendiente sin comprobante.

**Qué verifico en DB:** El mensaje existe en `panel_mensajes` con `has_media = false` y no hay error en el procesamiento.

---

### E — Mismo comprobante enviado dos veces

**Qué se prueba:** Que reenviar la misma foto no crea dos registros de pago.

**Cómo hacerlo:**
1. Tomar una foto de comprobante ya enviada antes
2. Reenviarla al WhatsApp del negocio
3. Apretar el botón Live

**Qué debe pasar:** No se crea un segundo registro. El sistema reconoce que es el mismo mensaje.

**Qué verifico en DB:** Solo existe 1 registro en `pagos_venta_live` para ese comprobante, no 2.

---

### F — Editar un pago con nombre o monto incorrecto

**Qué se prueba:** Que se puede corregir un pago registrado con error.

**Cómo hacerlo:**
1. Buscar cualquier pago en la lista
2. Editarlo → cambiar el nombre o el monto
3. Guardar

**Qué debe pasar:** El pago actualizado aparece con los datos correctos.

---

### G — Eliminar un pago equivocado

**Qué se prueba:** Que borrar un pago libera el pedido y el casillero asociado.

**Cómo hacerlo:**
1. Tomar un pago que tenga pedido activo
2. Eliminarlo
3. Verificar que el pedido desapareció y el casillero quedó libre

**Qué debe pasar:** El casillero vuelve a estado AVAILABLE.

---

### H — Pago fraccionado (cliente paga en dos partes)

**Qué se prueba:** Una clienta debe Bs 50. Paga Bs 30 hoy y Bs 20 después. Deben sumar correctamente en su perfil.

**Cómo hacerlo:**
1. Registrar pago de Bs 30 para una clienta
2. Registrar otro pago de Bs 20 para la misma clienta
3. Abrir el perfil de la clienta

**Qué debe pasar:** El perfil muestra los dos pagos y el total correcto.

---

## Orden recomendado

Empezar por: **A → B → D → E** (las más críticas para producción).

Dejar para después: **F → G → H** (importantes pero menos urgentes).
