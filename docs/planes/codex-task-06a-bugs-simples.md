# CODEX TASK 06A — Correcciones simples y específicas

Lee cada archivo mencionado antes de tocar ese archivo. Aplica los cambios en orden.
No hagas nada que no esté escrito aquí. No toques archivos que no se mencionan.

---

## Archivos a leer

- `server.ts` — secciones: `/api/store/pickup-dates` y `/api/store-auth/me`
- `src/routes/store-settings.ts` — para entender la estructura real de `store_settings` (key-value)
- `src/components/AdminTiendaView.tsx` — función `verifyOrderManual`, sección Config, sección categorías
- `src/storefront-v2/components/Checkout.tsx` — pantalla de pago con el QR

---

## CAMBIO 1 — Corregir `GET /api/store/pickup-dates` en `server.ts`

La tabla `store_settings` es key-value: columnas `setting_key` y `setting_value`.
El endpoint actual busca una columna `pickup_dates` que no existe.

Buscar este bloque exacto:
```typescript
app.get('/api/store/pickup-dates', async (_req, res) => {
  try {
    const { data } = await supabaseStore
      .from('store_settings')
      .select('pickup_dates')
      .limit(1)
      .single();
    const raw = (data as any)?.pickup_dates;
    const dates = raw ? JSON.parse(raw) : [];
    return res.json({ dates });
  } catch {
    return res.json({ dates: [] });
  }
});
```

Reemplazar con:
```typescript
app.get('/api/store/pickup-dates', async (_req, res) => {
  try {
    const { data } = await supabaseStore
      .from('store_settings')
      .select('setting_value')
      .eq('setting_key', 'pickup_dates')
      .maybeSingle();
    const raw = data?.setting_value;
    const dates = raw ? JSON.parse(raw) : [];
    return res.json({ dates });
  } catch {
    return res.json({ dates: [] });
  }
});
```

---

## CAMBIO 2 — Corregir `PATCH /api/store/pickup-dates` en `server.ts`

Buscar este bloque exacto:
```typescript
app.patch('/api/store/pickup-dates', async (req, res) => {
  const { dates } = req.body as { dates: Array<{ date: string; label: string; slots: string[] }> };
  if (!Array.isArray(dates)) return res.status(400).json({ error: 'dates debe ser array' });
  try {
    await supabaseStore
      .from('store_settings')
      .update({ pickup_dates: JSON.stringify(dates) } as any)
      .neq('id', 0);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
```

Reemplazar con:
```typescript
app.patch('/api/store/pickup-dates', async (req, res) => {
  const { dates } = req.body as { dates: Array<{ date: string; label: string; slots: string[] }> };
  if (!Array.isArray(dates)) return res.status(400).json({ error: 'dates debe ser array' });
  try {
    const { error } = await supabaseStore
      .from('store_settings')
      .upsert({ setting_key: 'pickup_dates', setting_value: JSON.stringify(dates) }, { onConflict: 'setting_key' });
    if (error) throw error;
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
```

---

## CAMBIO 3 — Agregar campos faltantes al query de pedidos en `server.ts`

En el endpoint `GET /api/store-auth/me`, el SELECT de pedidos no incluye `customer_selection`, `delivery_date` ni `delivery_slot`.

Buscar:
```typescript
.select('id, status, total, created_at, items, payment_verified_at, expires_at, customer_wa')
```

Reemplazar con:
```typescript
.select('id, status, total, created_at, items, payment_verified_at, expires_at, customer_wa, customer_selection, delivery_date, delivery_slot')
```

---

## CAMBIO 4 — Eliminar botón "Verificar Pago Manualmente" de `AdminTiendaView.tsx`

Los pagos de la tienda se verifican en la página de pagos de la app principal, no en el panel de tienda.

### 4a. Eliminar la función `verifyOrderManual`
Buscar la función completa (empieza con `const verifyOrderManual = async`) y eliminarla entera.

### 4b. Eliminar el estado `verifyingId`
Buscar la línea que declara `verifyingId` (algo como `const [verifyingId, setVerifyingId] = useState`) y eliminarla.

### 4c. Eliminar el botón en el JSX
Buscar el botón que contiene el texto "Verificar Pago Manualmente" y eliminar ese botón completo del JSX.

---

## CAMBIO 5 — Corregir bug de categorías que desaparecen en `AdminTiendaView.tsx`

El input de label de cada categoría tiene `onBlur={() => saveStoreChips(storeChips)}` que guarda con datos desactualizados y borra categorías.

Buscar el input dentro del `.map((chip, idx) =>` que tiene tanto `onChange` como `onBlur`. Eliminar SOLO el `onBlur`, dejando el `onChange` intacto.

El input debe quedar sin `onBlur`. El guardado solo ocurre cuando el usuario aprieta el botón "Guardar categorias".

---

## CAMBIO 6 — Eliminar tres campos del Config de la tienda en `AdminTiendaView.tsx`

Buscar y eliminar estos tres bloques del tab Config. Eliminar cada `<div>` completo (incluyendo el label y el input):

**Campo WhatsApp** — contiene `saveSetting('store_phone', ...)`:
```tsx
<div>
  <label ...>WhatsApp</label>
  <input ... onChange={e => saveSetting('store_phone', e.target.value)} ... />
</div>
```

**Campo Próximo Live (fecha)** — contiene `saveSetting('next_live_date', ...)`:
```tsx
<div>
  <label ...>Proximo Live (fecha)</label>
  <input type="date" ... onChange={e => saveSetting('next_live_date', e.target.value)} ... />
</div>
```

**Campo Próximo Live (hora)** — contiene `saveSetting('next_live_time', ...)`:
```tsx
<div>
  <label ...>Proximo Live (hora)</label>
  <input type="time" ... onChange={e => saveSetting('next_live_time', e.target.value)} ... />
</div>
```

---

## CAMBIO 7 — Mejorar página de pago QR en `Checkout.tsx`

### 7a. QR más grande
Buscar:
```
style={{ width: 'clamp(154px, 29dvh, 196px)', height: 'clamp(154px, 29dvh, 196px)' }}
```
Reemplazar con:
```
style={{ width: 'clamp(200px, 40dvh, 260px)', height: 'clamp(200px, 40dvh, 260px)' }}
```

### 7b. Eliminar "(Yape)" del texto
Buscar:
```tsx
Beneficiario (Yape)
```
Reemplazar con:
```tsx
Beneficiario
```

### 7c. Centrar la pantalla de pago
En la pantalla de pago (la sección que contiene el QR, el nombre del beneficiario y los botones), verificar que el contenedor principal tenga `flex flex-col items-center`. Si no lo tiene, agregarlo. Si ya lo tiene, no cambiar nada.

---

## Verificación final

Después de hacer todos los cambios, volver a leer cada archivo modificado y verificar lo siguiente:

### Verificar código (leer los archivos y confirmar)
1. `server.ts` — `GET /api/store/pickup-dates`: el query usa `.eq('setting_key', 'pickup_dates').select('setting_value').maybeSingle()`. Confirmar que NO usa `.select('pickup_dates')` ni `.single()` sin filtro.
2. `server.ts` — `PATCH /api/store/pickup-dates`: usa `.upsert({ setting_key: 'pickup_dates', setting_value: JSON.stringify(dates) }, { onConflict: 'setting_key' })`. Confirmar que NO usa `.update(...)` ni `.neq('id', 0)`.
3. `server.ts` — `GET /api/store-auth/me`: el `.select(...)` incluye `customer_selection`, `delivery_date`, `delivery_slot`. Confirmar leyendo la línea.
4. `AdminTiendaView.tsx` — buscar la palabra "verifyOrderManual" en el archivo. Si aparece en algún lugar que no sea un comentario, el cambio está incompleto.
5. `AdminTiendaView.tsx` — buscar "Verificar Pago". Si aparece en el JSX renderizado, el cambio está incompleto.
6. `AdminTiendaView.tsx` — buscar "onBlur" en la sección del mapa de chips. No debe aparecer.
7. `AdminTiendaView.tsx` — buscar "next_live_date", "next_live_time", "store_phone" dentro del JSX del Config tab. No deben aparecer como inputs editables.
8. `Checkout.tsx` — buscar `clamp(154px`. No debe aparecer. Buscar `clamp(200px`. Debe aparecer.
9. `Checkout.tsx` — buscar "Yape". No debe aparecer en el texto visible al usuario.

### Verificar lógica funcional
10. El flujo de fechas de retiro: el admin guarda fechas → `PATCH` hace upsert en `store_settings` con `setting_key='pickup_dates'` → el GET las lee por ese mismo key. Confirmar que ambos extremos usan la misma key.
11. El flujo de categorías: el usuario edita un nombre → `onChange` actualiza el estado → solo se guarda cuando aprieta "Guardar categorias". Confirmar que no hay guardado automático al perder foco.

### Si algo falló
Si algún cambio no se pudo aplicar correctamente, escribir el problema en `docs/planes/codex-task-06-hallazgos.md` indicando qué cambio fue, qué se intentó y por qué no funcionó.
