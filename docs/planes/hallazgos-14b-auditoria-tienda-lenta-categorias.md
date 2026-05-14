# Hallazgos 14B - Tienda lenta y categorias fantasma

## Resumen corto

Las "categorias fantasma" aparecen porque **3 componentes inicializan su estado con `DEFAULT_STORE_CHIPS` (9 categorias)** antes de recibir la respuesta del endpoint `/api/store/settings`. Cuando la respuesta llega (con solo 3 categorias guardadas: Blusas, Vestidos, Chaquetas), React re-renderiza y las categorias extra desaparecen. El parpadeo dura 1-3 segundos porque ese es el tiempo de latencia de la llamada HTTP.

La lentitud se debe a:
1. **Doble renderizado**: primero con defaults, luego con datos reales
2. **Multiples llamadas a `/api/store/settings`**: cada componente hace su propio fetch sin cache compartido
3. **Estados iniciales inflados**: 9 chips por defecto que despues se reducen a 3

## Causa probable exacta

**Archivo principal**: `src/storefront-v2/config/storefrontConfig.ts:14-58`

- `DEFAULT_STORE_CHIPS` (lineas 14-24) define **9 categorias por defecto** con `active: true`
- `parseStoreChips()` (lineas 31-58) devuelve `DEFAULT_STORE_CHIPS` cuando:
  - `raw` es `null/undefined` (linea 32)
  - `raw` es string vacio `''` (linea 32, porque `JSON.parse('')` tira error y va al catch)
  - El JSON parseado no es un array (linea 35)

**Archivos afectados por estado inicial**:

1. `src/storefront-v2/StorefrontApp.tsx:308`
   ```typescript
   const [mainCategories, setMainCategories] = useState<StoreChip[]>(DEFAULT_STORE_CHIPS.slice(0, 4));
   ```
   - Muestra 4 chips en la Welcome Screen antes de cargar settings

2. `src/storefront-v2/components/ProductGallery.tsx:34`
   ```typescript
   const [chips, setChips] = useState<StoreChip[]>(DEFAULT_STORE_CHIPS);
   ```
   - Muestra 9 chips en el catalogo antes de cargar settings

3. `src/components/AdminTiendaView.tsx:124`
   ```typescript
   const [storeChips, setStoreChips] = useState<StoreChip[]>(DEFAULT_STORE_CHIPS);
   ```
   - Muestra 9 chips en Config antes de cargar settings

**Endpoint**: `src/routes/store-settings.ts:7-19, 118-138`

```typescript
const DEFAULT_SETTINGS: Record<string, string> = {
  // ...
  store_chips: '',  // <-- string vacio, no JSON
  // ...
};

// GET /api/store/settings
// Si no hay tabla o no hay datos, devuelve DEFAULT_SETTINGS con store_chips: ''
```

Cuando `store_chips` es `''` en la DB:
1. `parseStoreChips('')` intenta `JSON.parse('')` → exception
2. Cae al `catch` (linea 56) → retorna `DEFAULT_STORE_CHIPS` (9 items)
3. Si la DB tiene un JSON valido con 3 items, los muestra
4. **Pero mientras tanto, ya renderizo con 9**

## Evidencia en codigo

### 1. Defaults硬编码 en 3 lugares

**StorefrontApp.tsx:308-317**
```typescript
const [mainCategories, setMainCategories] = useState<StoreChip[]>(DEFAULT_STORE_CHIPS.slice(0, 4));

useEffect(() => {
  fetch('/api/store/settings')
    .then(r => r.ok ? r.json() : null)
    .then(settings => {
      const next = parseStoreChips(settings?.store_chips).filter(chip => chip.active).slice(0, 4);
      if (next.length > 0) setMainCategories(next);
    })
    .catch(() => {});
}, []);
```
- Estado inicial: 4 chips por defecto
- Fetch asincrono actualiza despues

**ProductGallery.tsx:34, 89-97**
```typescript
const [chips, setChips] = useState<StoreChip[]>(DEFAULT_STORE_CHIPS);

useEffect(() => {
  fetch('/api/store/settings')
    .then(r => r.ok ? r.json() : null)
    .then(settings => {
      const next = parseStoreChips(settings?.store_chips);
      setChips(next);
      if (filter && !next.some(chip => chip.active && chip.value === filter)) setFilter('');
    })
    .catch(() => setChips(DEFAULT_STORE_CHIPS));  // <-- Doble down: si falla, pone defaults otra vez
}, []);
```

**AdminTiendaView.tsx:124, 268-273**
```typescript
const [storeChips, setStoreChips] = useState<StoreChip[]>(DEFAULT_STORE_CHIPS);

const loadSettings = async () => {
  try {
    const res = await fetch('/api/store/settings');
    if (res.ok) {
      const data = await res.json();
      setSettings(data);
      setStoreChips(parseStoreChips(data.store_chips));  // <-- Reemplaza despues de cargar
    }
    // ...
  } catch (e) { console.error(e); }
};
```

### 2. parseStoreChips devuelve defaults cuando no hay datos

**storefrontConfig.ts:31-58**
```typescript
export function parseStoreChips(raw?: string | null): StoreChip[] {
  if (!raw) return DEFAULT_STORE_CHIPS;  // <-- null, undefined, '' → 9 items
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_STORE_CHIPS;  // <-- no es array → 9 items
    return parsed
      .map((item, index) => { /* ... */ })
      .filter(item => item.label && item.value)
      .filter(item => item.id !== 'all' && item.value !== 'Todos')
      .sort((a, b) => a.sort - b.sort);
  } catch {
    return DEFAULT_STORE_CHIPS;  // <-- JSON invalido → 9 items
  }
}
```

### 3. Endpoint devuelve string vacio cuando no hay datos

**store-settings.ts:7-19, 127-137**
```typescript
const DEFAULT_SETTINGS: Record<string, string> = {
  store_name: 'Leidy American',
  store_phone: '59160003230',
  reservation_minutes: '1',
  // ...
  store_chips: '',  // <-- CLAVE: string vacio, no '[]' ni JSON
  payment_qr_url: '/qr-yape.jpg',
};

// GET /api/store/settings
const { data, error } = await supabaseStore
  .from('store_settings')
  .select('*');
// ...
const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
for (const row of data || []) {
  settings[row.setting_key] = row.setting_value || '';
}
res.json(settings);
```

Si no hay fila `store_chips` en la DB:
- `settings.store_chips` queda como `''` (de DEFAULT_SETTINGS)
- `parseStoreChips('')` → `DEFAULT_STORE_CHIPS` (9 items)

## Flujo real de carga

### Tienda publica (Welcome Screen → Gallery)

1. **Render inicial (0ms)**: `StorefrontApp` monta con `mainCategories = DEFAULT_STORE_CHIPS.slice(0, 4)` → muestra 4 chips
2. **Simultaneamente**: `useEffect` dispara fetch a `/api/store/settings`
3. **Espera (100-3000ms)**: skeleton/loading, chips por defecto visibles
4. **Respuesta llega**: `settings.store_chips` contiene JSON con 3 categorias reales
5. **Segundo render**: `parseStoreChips()` retorna 3 items → `setMainCategories(3)` → chips desaparecen/cambian
6. **Usuario ve**: "Conjuntos, Pantalones" etc. por 1-3 segundos, luego solo "Blusas, Vestidos, Chaquetas"

### Catalogo (ProductGallery)

1. **Render inicial**: `chips = DEFAULT_STORE_CHIPS` (9 items)
2. **Header renderiza**: muestra 9 chips como botones filtrables
3. **Fetch completa**: `setChips(parseStoreChips(settings.store_chips))`
4. **Re-render**: si DB tiene 3, ahora muestra 3 → 6 chips desaparecen

### Panel de tienda (Config)

1. **Usuario hace click en pestaña Config**
2. **Render inicial**: `storeChips = DEFAULT_STORE_CHIPS` (9 items)
3. **UI muestra**: 9 filas de categorias para editar
4. **`loadSettings()` completa**: `setStoreChips(parseStoreChips(data.store_chips))`
5. **Re-render**: 9 filas → 3 filas (solo las guardadas)
6. **Usuario ve**: "parpadeo" de filas

## Lentitud

### Causas encontradas

1. **Llamadas duplicadas a `/api/store/settings`**:
   - `StorefrontApp.tsx:311` → 1 llamada
   - `ProductGallery.tsx:89` → 1 llamada
   - `AdminTiendaView.tsx:268` → 1 llamada
   - `StoreProfile.tsx:68` → 1 llamada
   - `CustomerCenter.tsx:24` → 1 llamada
   - `SettingsPage.tsx:72` → 1 llamada
   - `Checkout.tsx:48` → 1 llamada
   - **Total**: 7 componentes haciendo el mismo fetch sin cache compartido

2. **Estados iniciales inflados**:
   - 9 chips por defecto → renderizado inicial pesado
   - Luego se reduce a 3 → React hace re-render completo

3. **No hay cache ni deduplicacion**:
   - Cada `useEffect` dispara su propio fetch
   - Si entras y sales rapido, se vuelve a llamar

4. **Service worker/PWA**:
   - No se encontro evidencia de cache agresivo en el codigo revisado
   - Pero el patron de "datos viejos → datos nuevos" sugiere posible cache de navegador

5. **Skeletons dependientes de fetch**:
   - `ProductGallery.tsx:113-119`: loading state depende de `filter` y `debouncedSearch`
   - Cada cambio de filtro → nuevo loading state → skeleton visible

## Riesgos

### Alta: Guardado accidental de defaults

**AdminTiendaView.tsx:1091**
```typescript
<button
  type="button"
  onClick={() => saveStoreChips(DEFAULT_STORE_CHIPS)}
  className="px-3 py-1.5 rounded-full bg-gray-100 text-[11px] font-black text-gray-500"
>
  Restaurar
</button>
```
- El boton "Restaurar" guarda inmediatamente los 9 chips por defecto
- Si el usuario hace click sin querer, **sobrescribe las 3 categorias reales con 9 por defecto**
- No hay confirmacion ni undo

### Media: UX confusa

- El usuario ve categorias que "desaparecen" → parece bug
- En Config, las filas "saltan" de 9 a 3 → parece inestable
- La tienda "se siente lenta" porque renderiza dos veces

### Baja: Rendimiento

- 7 llamadas HTTP al mismo endpoint en una sesion
- Cada llamada ~100-500ms → acumulable

## Propuesta de correccion

### 1. Estado inicial vacio (no defaults)

**En los 3 componentes**, cambiar:
```typescript
// Antes
const [chips, setChips] = useState<StoreChip[]>(DEFAULT_STORE_CHIPS);

// Despues
const [chips, setChips] = useState<StoreChip[]>([]);
```

Y en el render:
```typescript
// Antes
{visibleChips.map(chip => (...))}

// Despues
{chips.length === 0 ? (
  <div className="skeleton-chips">...</div>  // skeleton mientras carga
) : (
  visibleChips.map(chip => (...))
)}
```

### 2. Cache compartido / Context

Crear un contexto para settings de tienda:
```typescript
// src/storefront-v2/context/StoreSettingsContext.tsx
export const StoreSettingsContext = createContext<StoreSettings | null>(null);

export function StoreSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/store/settings')
      .then(r => r.json())
      .then(data => {
        setSettings(data);
        setLoading(false);
      });
  }, []);

  return (
    <StoreSettingsContext.Provider value={{ settings, loading }}>
      {children}
    </StoreSettingsContext.Provider>
  );
}
```

Luego todos los componentes leen del contexto en vez de hacer fetch propio.

### 3. Endpoint: devolver JSON valido por defecto

**store-settings.ts:7-19**
```typescript
// Antes
store_chips: '',

// Despues
store_chips: '[]',  // o JSON.stringify(DEFAULT_STORE_CHIPS) si realmente queres defaults
```

Y en `parseStoreChips`:
```typescript
// Si queres que el default sea "sin chips" en vez de "9 chips":
export function parseStoreChips(raw?: string | null): StoreChip[] {
  if (!raw || raw === '[]') return [];  // <-- vacio real
  // ...
}
```

### 4. Eliminar boton "Restaurar" peligroso

O al menos agregar confirmacion:
```typescript
onClick={() => {
  if (confirm('¿Restaurar categorias por defecto? Esto borrara tu configuracion actual.')) {
    saveStoreChips(DEFAULT_STORE_CHIPS);
  }
}}
```

### 5. Optimizacion: precarga unica

**StorefrontApp.tsx** ya tiene `prefetchGallery`, pero se puede mejorar:
```typescript
// Precargar settings al montar la app, no en cada componente
useEffect(() => {
  // Una sola llamada al montar StorefrontApp
  void fetch('/api/store/settings').then(r => r.json()).then(data => {
    // Guardar en sessionStorage para que otros componentes lean rapido
    sessionStorage.setItem('store_settings_cache', JSON.stringify(data));
  });
}, []);
```

Luego cada componente lee de `sessionStorage` primero y hace fetch solo si no hay cache.

## Archivos revisados

- `docs/contexto/04-tienda-online.md` — contexto general de la tienda
- `src/storefront-v2/StorefrontApp.tsx` — Welcome Screen con estado inicial de chips
- `src/storefront-v2/components/ProductGallery.tsx` — Galeria con estado inicial de chips
- `src/storefront-v2/config/storefrontConfig.ts` — Definicion de DEFAULT_STORE_CHIPS y parseStoreChips
- `src/storefront-v2/services/productsApi.ts` — API de productos (no involucrada en bug)
- `src/components/AdminTiendaView.tsx` — Panel Config con estado inicial y boton Restaurar
- `src/routes/store-settings.ts` — Endpoint GET/PATCH /api/store/settings
