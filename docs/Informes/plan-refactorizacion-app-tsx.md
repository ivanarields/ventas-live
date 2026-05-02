# 🏗️ Plan de Refactorización Incremental — App.tsx

**Fecha:** 2026-05-01
**Estado:** Planificación — No ejecutar sin revisión previa
**Archivo objetivo:** `src/App.tsx` (6,371 líneas → meta: ~1,500 líneas)

---

## Resumen Ejecutivo

`src/App.tsx` concentra el **45% de todo el código fuente** del proyecto. Un solo componente React maneja: autenticación, 6 vistas (tabs), finanzas, pedidos, entregas, clientes, etiquetas, pagos, vidas, sorteos, PWA, modales, y formularios. Esto hace que cualquier cambio sea frágil y lento de implementar.

**Estrategia:** Refactorizar en **6 fases independientes**, cada una commiteable y reversible por separado. Riesgo mínimo, beneficio progresivo.

---

## Diagnóstico Actual

```
src/App.tsx — 6,371 líneas
├── Líneas 1-956:   Helpers, interfaces, tipos, utilidades (pre-componente)
├── Líneas 957-1000: Estados (51 useState + autenticación)
├── Líneas 1000-1170: loadData(), normalización de datos
├── Líneas 1170-2800: Lógica de clientes, labels, people, entrega
├── Líneas 2800-4500: Vistas Home, Finance, pagos, transacciones
├── Líneas 4500-5500: Vistas Delivery, Tienda
├── Líneas 5500-6280: Vistas Settings, modales, formularios
└── Líneas 6281-6371: JSX final (modal de nuevo pedido)
```

| Métrica | Valor |
|---------|-------|
| `useState` | 51 variables |
| `useMemo` | 18 |
| Returns condicionales | 45 |
| Funciones helper pre-App | ~100 |
| Vistas (tabs) | 6 (home, entrega, payments, finance, tienda, settings) |

---

## Plan de Fases

### ✅ Fase 1: Extraer utilidades puras (Riesgo: CERO)

Extraer funciones puras y tipos que **no dependen de ningún estado o hook de React**.

**Archivos a crear:**

| Nuevo archivo | Contenido | Líneas a mover |
|---------------|-----------|----------------|
| `src/lib/cn.ts` | `cn()` función de composición de clases | 2 líneas |
| `src/lib/nameUtils.ts` | `normalizeName()`, `cleanName()`, `getVisualName()` | ~80 líneas |
| `src/lib/dateUtils.ts` | `parseAppDate()`, `formatAppDate()`, `formatTransactionDate()`, `getTS()` | ~50 líneas |
| `src/lib/amountUtils.ts` | `cleanAmount()` | ~20 líneas |
| `src/types/app.ts` | `SupabaseUser`, `LiveSession`, `Giveaway`, `Order`, `Item`, `Transaction`, `Payment`, `Customer`, `Idea`, `Category`, `Pedido` | ~200 líneas |

**Total estimado:** ~350 líneas movidas, App.tsx baja a ~6,000 líneas

**Validación:** `npm run build` sin errores. Las funciones no tocan estado ni hooks.

---

### ✅ Fase 2: Extraer HistoricalRepairEngine (Riesgo: CERO)

Objeto estático de lógica de reparación histórica. No usa estado de React.

| Nuevo archivo | Contenido | Líneas |
|---------------|-----------|--------|
| `src/lib/historicalRepairEngine.ts` | `HistoricalRepairEngine` | ~50 líneas |

**Total estimado:** ~50 líneas movidas

---

### ✅ Fase 3: Ampliar tipos existentes (Riesgo: CERO)

Mover definiciones de interfaces a `src/types.ts` (ya existe). Consolidar todos los tipos del proyecto en un solo lugar.

| Archivo | Acción |
|---------|--------|
| `src/types.ts` | Agregar interfaces: `SupabaseUser`, `LiveSession`, `Giveaway`, `Order`, `Item`, `Transaction`, `Payment`, `Customer`, `Idea`, `Category`, `Pedido` (si no están ya) |

**Validación:** `npm run build` sin errores de tipos.

---

### ⚠️ Fase 4: Extraer vistas grandes a componentes (Riesgo: BAJO-MEDIO)

Cada "tab" es un bloque de JSX condicional gigante. Se puede extraer cada vista a un componente que recibe props.

**Componentes a crear:**

| Nuevo componente | Vista actual | Props necesarias |
|------------------|-------------|------------------|
| `src/components/HomeView.tsx` | Tab "home" | lives, giveaways, orders, transactions, etc. |
| `src/components/DeliveryView.tsx` | Tab "entrega" | customers, pedidos, labels, etc. |
| `src/components/FinanceView.tsx` | Tab "finance" | transactions, payments, stats, etc. |
| `src/components/PaymentsView.tsx` | Tab "payments" | payments, customers, selectedPaymentDates, etc. |
| `src/components/TiendaView.tsx` | Tab "tienda" | (lazy-loaded AdminTiendaView) |

**Ejemplo de firma:**

```tsx
// src/components/HomeView.tsx
interface HomeViewProps {
  lives: LiveSession[];
  giveaways: Giveaway[];
  orders: Order[];
  transactions: Transaction[];
  // ... props necesarias
}

export function HomeView(props: HomeViewProps) {
  return (/* JSX actual del tab home */);
}
```

**En App.tsx quedaría:**

```tsx
{currentTab === 'home' && <HomeView lives={lives} giveaways={giveaways} /*...*/ />}
```

**Riesgo:** Medio. Hay que identificar correctamente qué props necesita cada vista. Si falla, se revierte solo este componente.

**Validación:** Test manual de cada vista después de extraerla. `npm run build` sin errores.

---

### ⚠️ Fase 5: Custom hook `useDataLoader` (Riesgo: MEDIO)

Extraer la lógica de carga de datos y normalización a un hook personalizado.

| Nuevo archivo | Contenido |
|---------------|-----------|
| `src/hooks/useDataLoader.ts` | `loadData()`, `normalizeClientes()`, `normalizePagos()`, `normalizePedidos()`, `normalizeTx()`, `normalizeLives()`, `normalizeIdeas()`, `normalizeCats()` |

**Firma:**

```tsx
function useDataLoader(user: SupabaseUser | null) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AllAppData | null>(null);

  const loadData = async () => { /* ... */ };

  useEffect(() => { if (user) loadData(); }, [user?.id]);

  return { data, loading, reload: loadData };
}
```

**Riesgo:** Medio. La normalización de datos es sensible a cambios de schema de BD.

**Validación:** Test manual completo de la app. Verificar que todas las vistas cargan datos correctamente.

---

### ⚠️ Fase 6: Extraer lógica de labels (Riesgo: MEDIO)

| Nuevo archivo | Contenido |
|---------------|-----------|
| `src/hooks/useLabels.ts` | Lógica de sincronización de labels, `HistoricalRepairEngine`, asignación, liberación |

**Validación:** Test manual de creación y asignación de pedidos con labels.

---

## Métricas de Progreso

| Fase | Líneas App.tsx (aprox.) | Reducción | Riesgo |
|------|------------------------|-----------|--------|
| **Actual** | 6,371 | — | — |
| Fase 1 | ~6,000 | -371 | Cero |
| Fase 2 | ~5,950 | -50 | Cero |
| Fase 3 | ~5,750 | -200 | Cero |
| Fase 4 | ~2,500 | -3,250 | Bajo-Medio |
| Fase 5 | ~1,800 | -700 | Medio |
| Fase 6 | ~1,400 | -400 | Medio |

**Meta final:** `App.tsx` ≈ **1,400 líneas** (solo layout, routing, estado global mínimo)

---

## Reglas de Seguridad

1. **Nunca hacer dos fases a la vez.** Una fase → commit → verificar → siguiente fase.
2. **Cada fase es reversible.** Si algo falla, `git revert` y se analiza.
3. **Las fases 1-3 se pueden hacer en secuencia rápida** (riesgo cero).
4. **Las fases 4-6 requieren test manual** después de cada una.
5. **No se toca `server.ts` ni `ai-gateway.ts` en este plan.** Son archivos separados con su propio plan futuro.

---

## Orden Recomendado de Ejecución

```
Fase 1 ──▶ Fase 2 ──▶ Fase 3 ──▶ [PAUSA: validar build + test manual rápido]
                                      │
                                      ▼
                                 Fase 4 ──▶ Fase 5 ──▶ Fase 6
                                  (una vista a la vez, con commit por vista)
```

---

## Checkpoint por Fase

### Fase 1
- [ ] Crear `src/lib/cn.ts`
- [ ] Crear `src/lib/nameUtils.ts`
- [ ] Crear `src/lib/dateUtils.ts`
- [ ] Crear `src/lib/amountUtils.ts`
- [ ] Actualizar imports en App.tsx
- [ ] `npm run build` exitoso

### Fase 2
- [ ] Crear `src/lib/historicalRepairEngine.ts`
- [ ] Actualizar import en App.tsx
- [ ] `npm run build` exitoso

### Fase 3
- [ ] Mover interfaces a `src/types.ts`
- [ ] Actualizar imports
- [ ] `npm run build` exitoso

### Fase 4 (una vista a la vez)
- [ ] HomeView → componente → commit
- [ ] DeliveryView → componente → commit
- [ ] FinanceView → componente → commit
- [ ] PaymentsView → componente → commit
- [ ] TiendaView → componente → commit
- [ ] Test manual de cada vista

### Fase 5
- [ ] Crear `src/hooks/useDataLoader.ts`
- [ ] Integrar en App.tsx
- [ ] Test manual completo

### Fase 6
- [ ] Crear `src/hooks/useLabels.ts`
- [ ] Integrar en App.tsx
- [ ] Test manual de labels

---

## NO hacer

- ❌ No usar React Router (cambia la estructura radicalmente)
- ❌ No refactorizar `server.ts` al mismo tiempo
- ❌ No refactorizar `ai-gateway.ts` al mismo tiempo
- ❌ No cambiar la estructura de datos ni el schema de BD
- ❌ No hacer todas las fases en un solo commit
- ❌ No empezar sin tener un backup (branch separado)
