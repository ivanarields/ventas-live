# CODEX TASK 06 — Correcciones y mejoras

Lee TODOS los archivos mencionados antes de tocar nada. Después aplica los cambios sección por sección.
No hagas nada que no esté escrito aquí.

---

## Archivos que debes leer antes de empezar

- `server.ts` — secciones: `/api/store/pickup-dates`, `/api/store-auth/me`, `/api/store-favorites`
- `src/routes/store-settings.ts` — estructura real de `store_settings` (key-value: `setting_key` / `setting_value`)
- `src/components/AdminTiendaView.tsx` — función `verifyOrderManual`, sección Config tab, sección de categorías/chips
- `src/storefront-v2/config/storefrontConfig.ts` — `parseStoreChips`, `serializeStoreChips`, `DEFAULT_STORE_CHIPS`
- `src/storefront-v2/components/Checkout.tsx` — pantalla de pago, botón "Ya pagué", constante `WA_NUMBER`
- `src/storefront-v2/components/StoreProfile.tsx` — función `loadProfile`, botón WA de fecha personalizada
- `src/storefront-v2/services/storeFavoritesApi.ts` — función `set`, `syncLocal`
- `src/pages/SettingsPage.tsx` — tab 'sistema', donde está `WhatsappConnectionPanel`

---

## SECCIÓN 1 — Corregir endpoints de fechas de retiro en `server.ts`

La tabla `store_settings` es key-value: columnas `setting_key` (texto único) y `setting_value` (texto).
Los endpoints actuales usan la tabla de forma incorrecta.

### 1a. Corregir `GET /api/store/pickup-dates`

Buscar y reemplazar el bloque completo:
```typescript
// ANTES (incorrecto):
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

// DESPUÉS (correcto):
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

### 1b. Corregir `PATCH /api/store/pickup-dates`

Buscar y reemplazar el bloque completo:
```typescript
// ANTES (incorrecto):
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

// DESPUÉS (correcto):
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

## SECCIÓN 2 — Agregar campos faltantes al query de pedidos en `server.ts`

En `GET /api/store-auth/me` (cerca de línea 1561), el select de pedidos no incluye campos necesarios.

Buscar:
```typescript
const { data: orders } = await supabaseStore
  .from('store_orders')
  .select('id, status, total, created_at, items, payment_verified_at, expires_at, customer_wa')
```

Reemplazar con:
```typescript
const { data: orders } = await supabaseStore
  .from('store_orders')
  .select('id, status, total, created_at, items, payment_verified_at, expires_at, customer_wa, customer_selection, delivery_date, delivery_slot')
```

---

## SECCIÓN 3 — Eliminar botón "Verificar Pago Manualmente" del panel de tienda

En `src/components/AdminTiendaView.tsx`, eliminar TODO el botón verde de verificación manual de pedidos de tienda.

Buscar la función `verifyOrderManual` (cerca de línea 348) y eliminarla completa.

Buscar el estado `verifyingId` y eliminarlo.

Buscar el botón que dice "✅ Verificar Pago Manualmente" (cerca de línea 906) y eliminar ese botón del JSX.

Los pagos se verifican en la página de pagos de la app principal, no en el panel de tienda.

---

## SECCIÓN 4 — Corregir bug de categorías (chips) que desaparecen

### Causa del bug
En `src/components/AdminTiendaView.tsx`, el input de cada categoría tiene `onBlur={() => saveStoreChips(storeChips)}`.
Esto guarda automáticamente con datos posiblemente desactualizados cuando el input pierde foco, lo que puede borrar categorías que el usuario acaba de agregar.

### Fix
En el input de label de cada chip (cerca de línea 1122-1134), eliminar el `onBlur`:

```tsx
// ANTES:
<input
  value={chip.label}
  onChange={e => {
    const nextLabel = e.target.value;
    const next = storeChips.map((c, i) => {
      if (i !== idx) return c;
      const shouldMoveValue = c.id.startsWith('chip-') || c.value === c.label;
      return { ...c, label: nextLabel, value: shouldMoveValue ? nextLabel : c.value };
    });
    setStoreChips(next);
  }}
  onBlur={() => saveStoreChips(storeChips)}
  className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[12px] font-bold outline-none"
/>

// DESPUÉS (sin onBlur):
<input
  value={chip.label}
  onChange={e => {
    const nextLabel = e.target.value;
    const next = storeChips.map((c, i) => {
      if (i !== idx) return c;
      const shouldMoveValue = c.id.startsWith('chip-') || c.value === c.label;
      return { ...c, label: nextLabel, value: shouldMoveValue ? nextLabel : c.value };
    });
    setStoreChips(next);
  }}
  className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[12px] font-bold outline-none"
/>
```

Así el guardado solo ocurre cuando el usuario aprieta explícitamente "Guardar categorias".

---

## SECCIÓN 5 — Investigar y corregir favoritos que no persisten

Lee `src/storefront-v2/services/storeFavoritesApi.ts` completo.

El flujo esperado es:
1. Clienta toca corazón en galería → `storeFavoritesApi.set(product, true)` → llama `POST /api/store-favorites` con token
2. Clienta abre perfil → `loadProfile` → llama `GET /api/store-auth/me` → retorna favoritos del servidor

Verificar que:
- El `POST /api/store-favorites` en `server.ts` recibe `productId` como número (no string)
- `storeFavoritesApi.set` envía el token correctamente
- `syncLocal` no sobreescribe favoritos del servidor con una lista vacía

Si hay un problema con `productId` llegando como string, agregar conversión: `const productId = Number(req.body?.productId);`
Si el problema es otro, corregirlo según lo que encuentres.

---

## SECCIÓN 6 — Número oficial de WhatsApp en configuraciones de la app principal

El número oficial de la empresa (el conectado al Bridge de WhatsApp) tiene que ser configurable desde la página de configuraciones de la app principal (`src/pages/SettingsPage.tsx`) y usarse en todos los botones de toda la aplicación.

### 6a. Agregar campo en `SettingsPage.tsx`

En `src/pages/SettingsPage.tsx`, en el tab 'sistema' (donde está el `WhatsappConnectionPanel`), agregar una nueva sección debajo del panel de conexión de WhatsApp:

```tsx
{/* Número oficial de WhatsApp */}
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
  <div>
    <p className="text-sm font-black text-gray-800">Número oficial de WhatsApp</p>
    <p className="text-[11px] text-gray-400 font-medium">
      Número que está conectado al Bridge. Se usa en todos los botones de la aplicación.
    </p>
  </div>
  <input
    type="text"
    value={officialPhone}
    onChange={e => setOfficialPhone(e.target.value.replace(/\D/g, ''))}
    placeholder="59160000000"
    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] font-bold outline-none focus:border-pink-400"
  />
  <button
    onClick={saveOfficialPhone}
    disabled={phoneSaving}
    className="w-full h-10 rounded-xl bg-[#ff2d78] text-[12px] font-black text-white shadow-sm disabled:opacity-50"
  >
    {phoneSaving ? 'Guardando...' : 'Guardar número'}
  </button>
</div>
```

Agregar los estados necesarios en `SettingsView`:
```typescript
const [officialPhone, setOfficialPhone] = useState('');
const [phoneSaving, setPhoneSaving] = useState(false);
```

Cargar el número al montar (en el mismo `useEffect` donde se carga la config, o en uno nuevo):
```typescript
fetch('/api/store/settings')
  .then(r => r.ok ? r.json() : null)
  .then(data => {
    if (data?.official_wa_number) setOfficialPhone(data.official_wa_number);
    else if (data?.store_phone) setOfficialPhone(data.store_phone);
  })
  .catch(() => {});
```

Agregar la función `saveOfficialPhone`:
```typescript
const saveOfficialPhone = async () => {
  if (!officialPhone) return;
  setPhoneSaving(true);
  try {
    await fetch('/api/store/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ official_wa_number: officialPhone }),
    });
  } finally {
    setPhoneSaving(false);
  }
};
```

### 6b. Usar el número oficial en `Checkout.tsx`

En `src/storefront-v2/components/Checkout.tsx`, la constante `WA_NUMBER` está hardcodeada.

Agregar estado para el número:
```typescript
const [waNumber, setWaNumber] = useState(WA_NUMBER);
```

En el `useEffect` que carga settings al montar (ya existe uno que carga `payment_qr_url`), agregar dentro:
```typescript
const num = String(settings?.official_wa_number || settings?.store_phone || '').replace(/\D/g, '');
if (num) setWaNumber(num);
```

Reemplazar el uso de `WA_NUMBER` en el botón "Ya pagué" y en cualquier otro `wa.me` link con `waNumber`.

### 6c. Usar el número oficial en `StoreProfile.tsx`

En `src/storefront-v2/components/StoreProfile.tsx`, el botón "Avisarle a Leidy American" usa `59160003230` hardcodeado.

Ya existe el estado `storePhone` y se carga en `loadProfile` con el endpoint `connected-phone` (agregado en tarea anterior, si existe) o con settings. Si ese estado no existe todavía, agregarlo:

```typescript
const [storePhone, setStorePhone] = useState('59160003230');
```

En `loadProfile`, dentro del try, agregar:
```typescript
const phoneRes = await fetch('/api/store/settings');
if (phoneRes.ok) {
  const phoneData = await phoneRes.json();
  const num = String(phoneData?.official_wa_number || phoneData?.store_phone || '').replace(/\D/g, '');
  if (num) setStorePhone(num);
}
```

Reemplazar la URL hardcodeada en el botón "Avisarle a Leidy American":
```typescript
// ANTES:
window.open(`https://wa.me/59160003230?text=${msg}`, '_blank');

// DESPUÉS:
window.open(`https://wa.me/${storePhone}?text=${msg}`, '_blank');
```

---

## SECCIÓN 7 — Eliminar campos del Config de la tienda en `AdminTiendaView.tsx`

Eliminar TRES bloques del tab Config del panel de tienda:

### 7a. Eliminar campo "WhatsApp" (número editable)
Buscar y eliminar:
```tsx
<div>
  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">WhatsApp</label>
  <input type="text" value={settings.store_phone || ''}
    onChange={e => saveSetting('store_phone', e.target.value)}
    className="w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium outline-none focus:border-pink-400" />
</div>
```

### 7b. Eliminar campo "Proximo Live (fecha)"
Buscar y eliminar:
```tsx
<div>
  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Proximo Live (fecha)</label>
  <input type="date" value={settings.next_live_date || ''}
    onChange={e => saveSetting('next_live_date', e.target.value)}
    className="w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium outline-none focus:border-pink-400" />
</div>
```

### 7c. Eliminar campo "Proximo Live (hora)"
Buscar y eliminar:
```tsx
<div>
  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Proximo Live (hora)</label>
  <input type="time" value={settings.next_live_time || ''}
    onChange={e => saveSetting('next_live_time', e.target.value)}
    className="w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium outline-none focus:border-pink-400" />
</div>
```

---

## SECCIÓN 8 — Mejorar página de pago QR en `Checkout.tsx`

### 8a. QR más grande
Buscar:
```
style={{ width: 'clamp(154px, 29dvh, 196px)', height: 'clamp(154px, 29dvh, 196px)' }}
```
Reemplazar con:
```
style={{ width: 'clamp(200px, 40dvh, 260px)', height: 'clamp(200px, 40dvh, 260px)' }}
```

### 8b. Eliminar "(Yape)" del texto
Buscar:
```tsx
<p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Beneficiario (Yape)</p>
```
Reemplazar con:
```tsx
<p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Beneficiario</p>
```

### 8c. Centrar layout de la pantalla de pago
En la sección de la pantalla `payment` en `Checkout.tsx`, asegurarse de que el contenedor donde están el QR, el nombre del beneficiario y los botones use `flex flex-col items-center text-center`. Si ya tiene esas clases, no cambiar nada.

---

## SECCIÓN 9 — Sin negro puro en toda la tienda

En TODOS los archivos dentro de `src/storefront-v2/` (solo ese directorio):

- `text-black` → `text-gray-800`
- `text-gray-900` → `text-gray-800`
- `color: 'black'` → `color: '#1f2937'`
- `color: '#000'` → `color: '#1f2937'`
- `color: '#000000'` → `color: '#1f2937'`
- `fill="black"` → `fill="#1f2937"`
- `stroke="black"` → `stroke="#1f2937"`

NO tocar archivos fuera de `src/storefront-v2/`.

---

## SECCIÓN 10 — Verificación final

Después de todos los cambios, confirmar:

1. `server.ts`:
   - `GET /api/store/pickup-dates` usa `.eq('setting_key', 'pickup_dates').select('setting_value')`
   - `PATCH /api/store/pickup-dates` usa `.upsert({ setting_key: 'pickup_dates', setting_value: ... })`
   - `GET /api/store-auth/me` incluye `customer_selection, delivery_date, delivery_slot`

2. `AdminTiendaView.tsx`:
   - No existe función `verifyOrderManual`
   - No existe botón "Verificar Pago Manualmente"
   - No existe campo editable "WhatsApp" en Config
   - No existen campos "Proximo Live (fecha)" y "Proximo Live (hora)"
   - El input de categorías NO tiene `onBlur`

3. `SettingsPage.tsx`:
   - Existe campo "Número oficial de WhatsApp" con botón guardar
   - Carga desde `/api/store/settings` → `official_wa_number`

4. `Checkout.tsx`:
   - QR usa `clamp(200px, 40dvh, 260px)`
   - Texto dice "Beneficiario" sin "(Yape)"
   - Botón "Ya pagué" usa número cargado de settings

5. `StoreProfile.tsx`:
   - Botón WA usa `storePhone` cargado de settings, no número hardcodeado

6. `src/storefront-v2/` completo:
   - Sin `text-black`, sin `text-gray-900`

Si algo no fue posible hacer con certeza, escribirlo en `docs/planes/codex-task-06-hallazgos.md`.
