# Errores encontrados en el Sistema Pulpo
**Fecha:** 2026-04-27  
**Análisis hecho sobre:** ai-gateway.ts, identityService.ts, ingest-notification, ingest-whatsapp, migrations, tabla customers

---

## CRÍTICOS — rompen el sistema en producción

---

### ERROR 1 — Auto-create falla silenciosamente cuando llega un cliente nuevo por WhatsApp

**Archivo:** `src/routes/ai-gateway.ts` línea 866  
**Qué pasa:** Cuando llega un comprobante de alguien que no existe en `customers`, el sistema intenta crearlo automáticamente. Pero el insert falla porque falta el campo `normalized_name` que tiene restricción NOT NULL en la base de datos. El error se captura en el `catch` y solo se muestra como advertencia en el log — el cliente nunca se crea, el número nunca se vincula, las fotos nunca van a aparecer en su perfil.

**Prueba:** intentar el insert sin `normalized_name` da error `23502: null value in column "normalized_name" violates not-null constraint`.

**Código actual (roto):**
```javascript
await supabase.from('customers').insert({
  full_name: nombreCliente,
  canonical_name: nameNorm,
  wa_number: waPhone,
  phone: waPhone,
  user_id: userId,
  is_active: true,
  source: 'whatsapp',
  // FALTA: normalized_name → falla con NOT NULL constraint
});
```

**Corrección necesaria:**
```javascript
await supabase.from('customers').insert({
  full_name: nombreCliente,
  canonical_name: nameNorm,
  normalized_name: nameNorm.toLowerCase(),
  wa_number: waPhone,
  phone: waPhone,
  active_label: '',
  active_label_type: '',
  user_id: userId,
  is_active: true,
  source: 'whatsapp',
});
```

---

### ERROR 2 — No hay protección contra duplicados en `customers`

**Dónde:** tabla `customers` en base de datos  
**Qué pasa:** No existe ningún constraint UNIQUE sobre `(user_id, canonical_name)`. Si MacroDroid recibe dos notificaciones del mismo cliente en intervalos cortos, o si el operador crea un cliente manualmente que ya fue creado por MacroDroid, se generan dos filas con el mismo nombre. `fn_link_customer_wa` toma la primera con `LIMIT 1` de forma arbitraria — puede vincular el `wa_number` al cliente equivocado.

**Prueba:** se insertaron dos filas con `canonical_name = 'TEST DUP'` y el mismo `user_id` sin ningún error.

**Estado actual:** ya hay dos clientes "IVAN ARIEL DIAZ SANCHEZ" en la tabla (ids 143 y 159) — uno activo, uno no. La migración 033 desactivó el huérfano, pero sin el constraint van a volver a aparecer.

**Corrección necesaria (migración nueva):**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unique_canonical
ON customers(user_id, canonical_name)
WHERE is_active = true AND canonical_name IS NOT NULL;
```

---

### ERROR 3 — `fn_link_customer_wa` no puede corregir un número de WhatsApp incorrecto

**Archivo:** `supabase/migrations/026_customer_profile.sql`  
**Qué pasa:** La función solo escribe `wa_number` si el campo está vacío:
```sql
WHERE id = v_customer_id
  AND (wa_number IS NULL OR wa_number = '');
```
Si un cliente ya tiene un número equivocado guardado (por un registro manual erróneo o por un comprobante de otra persona), el sistema nunca lo va a corregir. El operador no tiene forma de forzar la actualización sin entrar directamente a la base de datos.

**Escenario real:** el operador carga manualmente `wa_number = "70000000"` para un cliente. Luego ese cliente manda un comprobante desde su número real `59172000000`. El sistema detecta el nombre, llama a `fn_link_customer_wa`, pero la función devuelve el id del cliente (lo encontró) sin actualizar el número porque ya tiene uno. Las fotos del número real nunca van a aparecer.

---

### ERROR 4 — Formato de teléfono inconsistente entre sistemas

**Archivos afectados:** `supabase/functions/ingest-whatsapp/index.ts` vs `src/services/identityService.ts`

`ingest-whatsapp` normaliza los teléfonos sin el `+`:
```javascript
function normalizePhone(raw: string): string | null {
  if (/^[678]\d{7}$/.test(phone)) phone = '591' + phone; // → "59172698959"
  return phone; // sin +
}
```

`identityService.ts` normaliza con `+`:
```javascript
function normalizePhone(phone: string): string {
  if (digits.length >= 10) return `+${digits}`; // → "+59172698959"
}
```

**Resultado:** `ingest-whatsapp` guarda en `identity_profiles.panel_phone = "59172698959"` (sin `+`). Luego `findOrCreateProfile` en el gateway busca por `phone = "+59172698959"` (con `+`). Los dos registros nunca van a ser el mismo. El sistema va a crear un perfil duplicado en identity_profiles cada vez que alguien escribe por WhatsApp y luego manda un comprobante.

**Verificado en base de datos:** el perfil de Ivan Ariel tiene `phone = "+59172698959"` (correcto), pero si ingest-whatsapp hubiera creado un perfil para él, lo habría guardado como `panel_phone = "59172698959"` (inconsistente).

---

## MEDIOS — comportamiento incorrecto pero no catastrófico

---

### ERROR 5 — Auto-merge actualiza evidencia pero deja el nombre del perfil incorrecto

**Archivo:** `src/routes/ai-gateway.ts` línea 918-924  
**Qué pasa:** El código actualiza el `display_name` del perfil solo si está vacío:
```javascript
if (!match.profile.display_name?.trim()) updates.display_name = nombreCliente;
```

Si el perfil encontrado por teléfono ya tiene algún nombre (por ejemplo "IVAN" que guardó el sistema antes), y llega el comprobante con "IVAN ARIEL DIAZ SANCHEZ", el merge transfiere toda la evidencia del perfil duplicado al perfil correcto, pero el nombre sigue siendo "IVAN" en vez de "IVAN ARIEL DIAZ SANCHEZ".

**Corrección necesaria:** en el auto-merge, siempre actualizar el `display_name` con el nombre más largo/completo:
```javascript
// Si el nombre del comprobante es más largo que el actual, actualizarlo
if (nombreCliente.length > (match.profile.display_name?.length ?? 0)) {
  updates.display_name = nombreCliente;
}
```

---

### ERROR 6 — `fn_link_customer_wa` falla si el cliente existe pero `is_active = false`

**Archivo:** `supabase/migrations/033_fix_canonical_name_matching.sql`  
**Qué pasa:** La función filtra por `AND is_active = true`. Si un cliente existe pero está marcado como inactivo (por ejemplo, fue desactivado por el operador o la migración 033 lo desactivó por no tener user_id), la función no lo encuentra y devuelve null.

Entonces el código en `summarize-conversation` intenta crear el cliente de nuevo. Ese insert va a fallar (ERROR 2 cuando el constraint no existe, o crear un duplicado sin constraint). En ambos casos, el resultado es incorrecto.

**Escenario:** el operador desactiva un cliente porque "ya no viene". El cliente vuelve y manda un comprobante. El sistema no puede vincularle el número.

---

### ERROR 7 — Detección de duplicados en `ingest-notification` usa una vista que puede no existir

**Archivo:** `supabase/functions/ingest-notification/index.ts` línea 453-456  
**Qué pasa:**
```javascript
const { data: maybeDup } = await supabase
  .from('payments_ui').select('id')
  .eq('canonical_display_name', payerNameCanonical)
  .eq('amount', amount).gte('created_at', oneMinAgo).limit(1);
```

Si la vista `payments_ui` no existe, la query falla silenciosamente (Supabase devuelve `data: null`). `isDuplicate` queda como `false`, y el sistema procesa el pago dos veces. La misma notificación de MacroDroid puede crear dos pagos en `pagos` para el mismo cliente.

**El hash SHA-256 en `raw_notification_events`** previene la inserción del mismo raw event dos veces (línea 364), pero si el sistema recibe el mismo pago por dos notificaciones diferentes (por ejemplo, el banco manda la notificación dos veces con texto diferente), el hash no los detecta como duplicados.

---

### ERROR 8 — Fotos sin límite máximo — puede hacer 50+ llamadas Gemini en una sola conversación

**Archivo:** `src/routes/ai-gateway.ts` línea 782-787  
**Qué pasa:** Las primeras 3 fotos siempre se procesan. Si no se encontró comprobante, el sistema revisa TODAS las fotos restantes sin límite:
```javascript
if (!comprobanteExtraido && fotoUrls.length > 3) {
  for (const url of [...fotoUrls.slice(3)].reverse()) {
    await clasificarYExtraer(url);
    if (comprobanteExtraido) break;
  }
}
```
Un cliente que mandó 30 fotos de ropa sin comprobante va a hacer 33 llamadas a Gemini en serie, tomando hasta 5 minutos y consumiendo el presupuesto de la API.

**Corrección:** limitar a máximo 6-8 fotos totales.

---

## BAJOS — código confuso o mejoras menores

---

### ERROR 9 — `nameNorm` declarado dos veces en la misma función

**Archivo:** `src/routes/ai-gateway.ts` líneas 846 y 928  
**Qué pasa:** La misma variable con la misma lógica se declara dos veces en bloques anidados. El segundo `const nameNorm` dentro del `try` en la sección Pulpo sombrea al primero. Si alguien modifica uno sin actualizar el otro, el sistema puede usar normalizaciones diferentes para customers vs identity_profiles.

**Corrección:** eliminar la segunda declaración y reusar la primera.

---

### ERROR 10 — Mensajes salientes del operador se guardan como dirección `'in'`

**Archivo:** `supabase/functions/ingest-whatsapp/index.ts` línea 39  
**Qué pasa:**
```javascript
const direction = item.from === item.to ? 'out' : 'in';
```
En la práctica, `item.from` nunca va a ser igual a `item.to` en un mensaje normal. Todos los mensajes — incluyendo los que el operador envía al cliente — se guardan con `direction = 'in'`. El historial de conversación en el panel no distingue quién habló qué.

---

### ERROR 11 — `ingest-notification` crea clientes con campos de etiqueta como string vacío en vez de null

**Archivo:** `supabase/functions/ingest-notification/index.ts` línea 484-486  
**Qué pasa:**
```javascript
active_label: '', active_label_type: '',
```
La app principal puede interpretar `''` diferente de `null` al mostrar etiquetas. Si alguna lógica hace `if (active_label)`, un string vacío es falsy y está bien. Pero si alguna lógica hace `if (active_label !== null)`, el string vacío aparecería como "tiene etiqueta".

---

## Resumen por prioridad

| # | Error | Impacto | Dónde arreglarlo |
|---|---|---|---|
| 1 | Auto-create falla por normalized_name NOT NULL | **Crítico** | ai-gateway.ts línea 866 |
| 2 | Sin UNIQUE constraint en customers | **Crítico** | Nueva migración SQL |
| 3 | fn_link_customer_wa no corrige número incorrecto | **Crítico** | Migración 026/033 |
| 4 | Formato de teléfono inconsistente (+591 vs 591) | **Crítico** | ingest-whatsapp + identityService |
| 5 | Auto-merge no actualiza nombre del perfil | Medio | ai-gateway.ts línea 921 |
| 6 | fn_link_customer_wa ignora clientes is_active=false | Medio | Migración o lógica |
| 7 | Detección de duplicados usa vista inexistente | Medio | ingest-notification línea 453 |
| 8 | Fotos sin límite → 50+ llamadas Gemini | Medio | ai-gateway.ts línea 782 |
| 9 | nameNorm declarado dos veces | Bajo | ai-gateway.ts línea 928 |
| 10 | Mensajes salientes guardados como 'in' | Bajo | ingest-whatsapp línea 39 |
| 11 | active_label como '' en vez de null | Bajo | ingest-notification línea 484 |
