# Análisis de Riesgos: Unión Tienda → ChehiAppAbril

> **Regla de oro:** No se toca ninguna función de Ventas Live, WhatsApp, identidad ni casilleros. Solo se modifica lo estrictamente necesario en el módulo de Tienda Online.

---

## Cómo está corriendo la app ahora mismo

| Entorno | Cómo corre | Puerto | Archivo usado |
|---------|-----------|--------|---------------|
| **Local (dev)** | `npm run dev` → `tsx server.ts` | 3004 | `server.ts` directamente |
| **Producción** | Vercel → `api/index.ts` | Serverless | `server.ts` importado por `api/index.ts` |

**Ambos entornos usan el mismo `server.ts`.** O sea, cualquier cambio en `server.ts` afecta tanto local como producción.

- No hay CI/CD automático. El deploy a Vercel es manual.
- La Edge Function `ingest-notification` se despliega por separado (`supabase functions deploy`).

---

## Lo que NO debemos tocar

| Sistema | Archivos protegidos | Motivo |
|---------|---------------------|--------|
| **Ventas Live** (ChehiAppAbril) | `POST /api/pagos`, `POST /api/pedidos`, rutas de clientes, casilleros, etiquetas | Es el core de la aplicación trabajando en producción |
| **WhatsApp Bridge** | `src/routes/whatsapp.ts`, `bridge/`, lógica de ingesta WA | Jevinay lo maneja |
| **Panel WhatsApp** | `src/routes/live-sales.ts`, `supabasePanel` queries | Base separada, flujo independiente |
| **Identidad** | `src/routes/identity.ts`, `src/services/identityService.ts` | Sistema Pulpo ya funciona |

---

## Lo que SÍ podemos tocar

| Archivo | Sección | Tipo de cambio |
|---------|---------|---------------|
| `server.ts` | `confirmStoreOrder` (líneas 1292-1395) | Solo agregar código nuevo al final |
| `server.ts` | `tryMatchOrder` (líneas 1230-1286) | Solo si es necesario ajustar ventana de búsqueda |
| `supabase/functions/ingest-notification/index.ts` | Sección de tienda | Ya fue modificado (protección anti-duplicados) |

---

## Riesgos detallados

### 🔴 Riesgo 1: Romper flujos existentes de Ventas Live

**Probabilidad:** Baja  
**Impacto:** Crítico

**Descripción:** `confirmStoreOrder` se llama desde 4 endpoints diferentes. Si nuestro código nuevo lanza una excepción no controlada, podría interrumpir la confirmación de pedidos de tienda (WhatsApp, notificación bancaria, etc.).

**Mitigación:**
- TODO el código nuevo va dentro de `try/catch` separado
- Si falla, solo se loguea el error, no se interrumpe el flujo principal
- No se modifica ninguna línea existente, solo se agrega al final

```typescript
// ✅ SEGURO — el código nuevo al final, envuelto en try/catch
try {
  await supabaseServer.from('pagos').insert({...});
} catch (e) {
  console.error('[store-pago] Error al crear pago en Chehi:', e);
  // NO relanzar — el pedido ya se creó correctamente
}
```

---

### 🔴 Riesgo 2: Pago duplicado

**Probabilidad:** Media  
**Impacto:** Medio

**Descripción:** Tanto la Edge Function (`ingest-notification`) como `confirmStoreOrder` pueden intentar crear un pago para el mismo pedido de tienda. Si ambos crean un pago en `pagos`, aparecerá duplicado en la página de pagos.

**Mitigación:**
- Antes de insertar, verificar si ya existe un pago con el mismo `customer_id` + `pago` + fecha
- Usar el mismo patrón que la Edge Function: buscar por monto, cliente y ventana de tiempo
- Marcar el pago con `method: 'Tienda Online'` para distinguirlo de otros métodos

```typescript
// ✅ Verificar duplicado antes de insertar
const { data: existing } = await supabaseServer
  .from('pagos')
  .select('id')
  .eq('customer_id', globalCustomerId)
  .eq('pago', data.total)
  .eq('method', 'Tienda Online')
  .gte('created_at', todayStart)
  .limit(1);

if (!existing?.length) {
  await supabaseServer.from('pagos').insert({...});
}
```

---

### 🟡 Riesgo 3: `user_id` NOT NULL

**Probabilidad:** Baja  
**Impacto:** Medio

**Descripción:** La tabla `pagos` en ChehiAppAbril tiene `user_id TEXT NOT NULL`. Si el `store_order` no tiene `user_id`, la inserción fallará.

**Mitigación:**
- Usar `data.user_id` del store_order como principal
- Fallback: usar `'store-auto'` como valor por defecto
- Verificar en diagnóstico que los store_orders siempre tienen user_id

---

### 🟡 Riesgo 4: `customer_id` foreign key

**Probabilidad:** Muy baja  
**Impacto:** Bajo

**Descripción:** Si `globalCustomerId` es null al momento de insertar, violará la FK.

**Mitigación:**
- El INSERT va DENTRO del bloque `if (globalCustomerId)`, igual que el INSERT a `pedidos`
- Si no hay globalCustomerId, simplemente no se crea el pago (el pedido tampoco se habría creado)

---

### 🟡 Riesgo 5: Despliegue accidental a producción

**Probabilidad:** Baja  
**Impacto:** Alto

**Descripción:** Si hacemos `git push` y Vercel auto-deploya, los cambios llegan a producción sin probar.

**Mitigación:**
- **No hacer push a producción sin probar localmente primero**
- Probar con `npm run dev` local
- Verificar que `.env` local apunte a las bases correctas
- Hacer deploy manual solo después de verificar

---

### 🟢 Riesgo 6: Inconsistencia de datos entre store_order y pago

**Probabilidad:** Baja  
**Impacto:** Bajo

**Descripción:** Si el store_order se marca como `paid` pero falla la creación del pago en Chehi, queda inconsistencia.

**Mitigación:**
- El pago se crea DESPUÉS de que el store_order ya fue marcado como `paid`
- Si falla el pago, el pedido en Chehi ya fue creado (porque se crea antes)
- Se puede reparar después con un script de auditoría
- El `try/catch` asegura que el error no revierta nada

---

## Plan de prueba seguro

### Paso 1: Probar localmente (sin riesgo)

```
npm run dev          # Inicia en localhost:3004
```

1. Crear un store_order de prueba manualmente en supabaseStore
2. Llamar `POST /api/store/match-payment` con los datos del pedido
3. Verificar en ChehiAppAbril que:
   - Se creó el pago en `pagos` ✓
   - El pago aparece en la UI de Lista de Pagos ✓
   - No hay duplicados ✓
   - El pedido existente sigue funcionando ✓

### Paso 2: Verificar que nada se rompió

1. La página de pagos carga normalmente
2. El Panel WhatsApp sigue funcionando
3. Las notificaciones de MacroDroid se siguen procesando
4. Los flujos existentes de Ventas Live no se alteran

### Paso 3: Deploy a producción (solo si todo OK)

```
git push
# Vercel deploy manual
supabase functions deploy ingest-notification --no-verify-jwt
```

---

## Resumen de mitigaciones

| Riesgo | Mitigación principal |
|--------|---------------------|
| Romper flujos existentes | Código nuevo envuelto en try/catch, nunca relanzar error |
| Pago duplicado | Verificar antes de insertar (customer_id + monto + método + fecha) |
| user_id NOT NULL | Fallback a 'store-auto' |
| customer_id FK | Insertar solo dentro de if(globalCustomerId) |
| Deploy accidental | No pushear sin probar localmente |
| Inconsistencia | El orden de operaciones es: store_order paid → pedido → pago |

---

## Conclusión

El cambio es **mínimo y seguro**: una sola inserción en `pagos` dentro de `confirmStoreOrder`, con verificación de duplicados y envuelta en try/catch. No modifica ninguna ruta de Ventas Live, WhatsApp ni identidad. Solo completa lo que ya debería estar pasando: que un pago de tienda aparezca en la Lista de Pagos de ChehiAppAbril.

**Archivo modificado:** solo `server.ts`, función `confirmStoreOrder`.  
**Líneas nuevas:** ~30 líneas al final de la función.  
**Líneas modificadas:** 0 (cero cambios a código existente).
