# CODEX TASK 06B — Favoritos, número oficial y colores

Lee TODOS los archivos mencionados antes de tocar cualquier cosa.
No hagas nada que no esté escrito aquí. No toques archivos fuera de los mencionados.

---

## Archivos a leer

- `src/storefront-v2/services/storeFavoritesApi.ts` — completo
- `src/storefront-v2/components/StoreProfile.tsx` — función `loadProfile`, estado de favoritos
- `src/storefront-v2/components/ProductGallery.tsx` — cómo se llama `storeFavoritesApi.set`
- `server.ts` — endpoint `POST /api/store-favorites` y `DELETE /api/store-favorites`
- `src/pages/SettingsPage.tsx` — tab 'sistema', donde está `WhatsappConnectionPanel`
- `src/storefront-v2/components/Checkout.tsx` — constante `WA_NUMBER`, botón "Ya pagué"
- Todos los archivos `.tsx` y `.ts` dentro de `src/storefront-v2/` — para revisar colores

---

## CAMBIO 1 — Corregir favoritos que no persisten

### 1a. Investigar
Trazar el flujo completo:
1. En `ProductGallery.tsx`: ¿se llama `storeFavoritesApi.set(product, true)` cuando la clienta toca el corazón? ¿Se pasa el token?
2. En `storeFavoritesApi.ts`: la función `set` — cuando hay sesión, ¿llama al `POST /api/store-favorites` con el `productId` correcto y el token?
3. En `server.ts`, endpoint `POST /api/store-favorites`: ¿recibe `productId` como número? (si llega como string, `Number(req.body?.productId)` puede fallar silenciosamente si no se convierte)
4. En `StoreProfile.tsx`: cuando se abre el perfil, `loadProfile` llama `/api/store-auth/me` — ¿retorna los favoritos correctamente?

### 1b. Corregir lo que esté roto
Según lo que encuentres en la investigación:

- Si `productId` puede llegar como string al POST: asegurarse de que se convierta a número con `Number(...)` antes del insert
- Si `storeFavoritesApi.set` no envía el token: agregarlo
- Si `syncLocal` borra favoritos del servidor con lista vacía: agregar guard para no llamar el endpoint si la lista local está vacía (ya debería estar, verificar)
- Si hay otro problema, corregirlo

---

## CAMBIO 2 — Número oficial de WhatsApp en `SettingsPage.tsx`

El número de WhatsApp conectado al Bridge tiene que poder configurarse en la página de configuraciones de la app principal. Ese número se usa en toda la app.

### 2a. Agregar estados en `SettingsView`

Dentro del componente `SettingsView`, agregar dos estados nuevos:
```typescript
const [officialPhone, setOfficialPhone] = useState('');
const [phoneSaving, setPhoneSaving] = useState(false);
```

### 2b. Cargar el número al montar

En el `useEffect` de carga inicial (o en uno nuevo si no hay uno adecuado), agregar:
```typescript
fetch('/api/store/settings')
  .then(r => r.ok ? r.json() : null)
  .then(data => {
    if (!data) return;
    const num = String(data.official_wa_number || data.store_phone || '').replace(/\D/g, '');
    if (num) setOfficialPhone(num);
  })
  .catch(() => {});
```

### 2c. Agregar función para guardar

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

### 2d. Agregar UI en el tab 'sistema'

En el JSX del tab 'sistema', debajo del componente `WhatsappConnectionPanel`, agregar esta sección:

```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
  <div>
    <p className="text-sm font-black text-gray-800">Número oficial de WhatsApp</p>
    <p className="text-[11px] text-gray-400 font-medium">
      Número conectado al Bridge. Se usa en todos los botones de la aplicación.
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

---

## CAMBIO 3 — Usar número oficial en `Checkout.tsx`

### 3a. Agregar estado

En `Checkout.tsx`, la constante `WA_NUMBER` es un fallback. Agregar un estado dinámico:
```typescript
const [waNumber, setWaNumber] = useState(WA_NUMBER);
```

### 3b. Cargar desde settings

En el `useEffect` que ya carga settings al montar (el que busca `payment_qr_url`), dentro del `.then`, agregar:
```typescript
const num = String(settings?.official_wa_number || settings?.store_phone || '').replace(/\D/g, '');
if (num) setWaNumber(num);
```

### 3c. Reemplazar uso de `WA_NUMBER`

Buscar todos los lugares donde se usa `WA_NUMBER` para construir un link `wa.me` y reemplazar con `waNumber`.

---

## CAMBIO 4 — Usar número oficial en `StoreProfile.tsx`

### 4a. Agregar estado (si no existe)

Si no existe el estado `storePhone`, agregarlo:
```typescript
const [storePhone, setStorePhone] = useState('59160003230');
```

### 4b. Cargar desde settings en `loadProfile`

Dentro de la función `loadProfile`, en el bloque `try`, agregar la carga del número:
```typescript
try {
  const phoneRes = await fetch('/api/store/settings');
  if (phoneRes.ok) {
    const phoneData = await phoneRes.json();
    const num = String(phoneData?.official_wa_number || phoneData?.store_phone || '').replace(/\D/g, '');
    if (num) setStorePhone(num);
  }
} catch { /* no crítico */ }
```

### 4c. Reemplazar número hardcodeado

Buscar en `StoreProfile.tsx` cualquier `wa.me/59160003230` o `wa.me/591...` hardcodeado y reemplazarlo con `wa.me/${storePhone}`.

---

## CAMBIO 5 — Sin negro puro en toda la tienda

Solo en archivos dentro de `src/storefront-v2/` (cualquier subdirectorio).

Hacer los siguientes reemplazos en todos esos archivos:

| Buscar | Reemplazar con |
|--------|---------------|
| `text-black` | `text-gray-800` |
| `text-gray-900` | `text-gray-800` |
| `color: 'black'` | `color: '#1f2937'` |
| `color: "#000000"` | `color: '#1f2937'` |
| `color: "#000"` | `color: '#1f2937'` |
| `fill="black"` | `fill="#1f2937"` |
| `stroke="black"` | `stroke="#1f2937"` |

NO tocar archivos fuera de `src/storefront-v2/`.
NO cambiar colores de fondo (`bg-black`, `background: black`), solo texto, fill y stroke.

---

## Verificación final

Después de hacer todos los cambios, volver a leer cada archivo modificado y verificar lo siguiente:

### Verificar código (leer los archivos y confirmar)

**Favoritos:**
1. En `storeFavoritesApi.ts`: la función `set` — cuando hay sesión, llama al endpoint con `Authorization: Bearer ${token}` y `productId` como número. Confirmar leyendo el código.
2. En `server.ts` endpoint `POST /api/store-favorites`: la línea que hace el insert usa `product_id: productId` donde `productId` fue convertido con `Number(...)`. Confirmar que no usa directamente `req.body.productId` sin conversión.
3. En `StoreProfile.tsx`: la función `loadProfile` retorna favoritos correctamente desde `/api/store-auth/me`. El estado `favorites` se actualiza con `data.favorites`.

**Número oficial:**
4. En `SettingsPage.tsx`: buscar el texto "Número oficial de WhatsApp". Debe aparecer en el JSX. Buscar `officialPhone`. Debe aparecer como estado y como valor del input.
5. En `SettingsPage.tsx`: la función `saveOfficialPhone` llama a `PATCH /api/store/settings` con `{ official_wa_number: officialPhone }`.
6. En `Checkout.tsx`: buscar `waNumber`. Debe aparecer como estado. Buscar el link `wa.me/` — debe usar `waNumber`, no `WA_NUMBER` directamente.
7. En `StoreProfile.tsx`: buscar `storePhone`. Debe aparecer como estado. Buscar `wa.me/` — debe usar `storePhone`, no un número hardcodeado.

**Colores:**
8. Buscar `text-black` en todos los archivos de `src/storefront-v2/`. No debe aparecer.
9. Buscar `text-gray-900` en todos los archivos de `src/storefront-v2/`. No debe aparecer.
10. Buscar `#000000` y `"#000"` en todos los archivos de `src/storefront-v2/`. No debe aparecer como color de texto o trazo.

### Verificar lógica funcional

11. Flujo de favoritos: clienta toca corazón (sin estar logueada) → se guarda en localStorage. Clienta se loguea y abre perfil → `syncLocal` sube los favoritos locales al servidor → `loadProfile` carga desde `/api/store-auth/me` → se muestran en la pestaña Favoritos. Recorrer este flujo en el código y confirmar que cada paso conecta con el siguiente.

12. Flujo del número oficial: admin entra a Configuraciones → escribe el número → aprieta "Guardar número" → se guarda en `store_settings` con key `official_wa_number` → la clienta abre checkout → al cargar settings se lee `official_wa_number` → el botón "Ya pagué" abre WhatsApp con ese número. Confirmar que los dos extremos (guardar y leer) usan la misma key `official_wa_number`.

### Si algo falló
Si algún cambio no se pudo aplicar correctamente, o si la investigación de favoritos no encontró la causa, escribirlo en `docs/planes/codex-task-06-hallazgos.md` indicando:
- Qué cambio fue
- Qué se intentó
- Qué se encontró en el código
- Por qué no se pudo corregir
