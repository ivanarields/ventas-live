# Propuesta: Refactorización de App.tsx (7,443 líneas)

> **Estado actual:** `src/App.tsx` pesa **320 KB** y tiene **7,443 líneas**. Es el archivo más grande y todo vive adentro.
> **Objetivo:** Separarlo en archivos independientes por página, sin romper nada y ganando velocidad.

---

## ¿Es viable? SÍ, absolutamente.

Este es uno de los refactores más comunes en React. Ya tienes precedente en tu propio proyecto: `PanelPedidos.tsx`, `AdminTiendaView.tsx` y `DetailedAnalysis.tsx` ya fueron extraídos exitosamente. El patrón funciona.

**Lo que frena a la gente:** hacer todo de golpe. La solución es hacerlo **página por página**, en orden de prioridad, sin tocar las demás mientras tanto.

---

## ¿Por qué tu catálogo y tienda son lentos?

Hay tres causas directas relacionadas con `App.tsx` monolítico:

### 1. Re-renders en cascada
Cuando cambia **cualquier** estado en `App.tsx` (por ejemplo, abrir un modal de pagos), React re-evalúa **todas** las 7,443 líneas. Si estás en la tienda, igual re-renderiza HomeView, PaymentsView, FinanceView... todo.

### 2. Bundle enorme sin code splitting
Al cargar la app, el navegador descarga **todo** el código de todas las páginas aunque estés solo en el catálogo. Con `React.lazy()`, solo cargaría el código que necesita en ese momento.

### 3. Estado global mezclado
Todos los `useState` viven juntos. Un cambio en pagos fuerza re-render de la tienda aunque no tengan relación.

**Impacto estimado de mejora:** La tienda podría cargar 40-70% más rápido con lazy loading + estado local por página.

---

## Mapa actual de componentes en App.tsx

| Línea | Componente | Tipo | Tamaño estimado |
|-------|------------|------|-----------------|
| 2212 | `HomeView` | Página principal (lista pagos) | ~130 líneas |
| 2958 | `PaymentsView` | Lista de pagos + filtros | ~340 líneas |
| 2348 | `EntregaView` | Mesa de preparación | ~220 líneas |
| 3902 | `FinanceView` | Finanzas/transacciones | ~270 líneas |
| 4176 | `SettingsView` | Configuración | ~850 líneas |
| 2567 | `CalendarView` | Agenda de Lives | ~50 líneas |
| 3297 | `ReconciliationModal` | Modal conciliación | ~300 líneas |
| 3602 | `AddPaymentModal` | Modal pago | ~300 líneas |
| 6423 | `PersonDetailModal` | Perfil del cliente | ~850 líneas |
| 7629 | `AddPedidoModal` | Mesa de preparación | ~160 líneas |
| 1887 | `QuickRegisterModal` | Modal registro rápido | ~180 líneas |
| 5104 | `AddTransactionModal` | Modal transacción | ~630 líneas |
| 5740 | `AddCategoryModal` | Modal categoría | ~340 líneas |
| **+** | Lógica global, tipos, hooks | El "pegamento" | ~2,000 líneas |

> Ya extraídos fuera de App.tsx: `PanelPedidos.tsx`, `AdminTiendaView.tsx`, `DetailedAnalysis.tsx`

---

## Estructura propuesta

```
src/
├── App.tsx                    ← Solo ~300 líneas (routing + estado global mínimo)
├── types.ts                   ← Tipos compartidos (Payment, Pedido, Customer, etc.)
├── hooks/
│   └── useAppData.ts          ← loadData() + estado global compartido
├── pages/
│   ├── HomePage.tsx           ← HomeView
│   ├── PaymentsPage.tsx       ← PaymentsView + modales relacionados
│   ├── OrdersPage.tsx         ← EntregaView + AddPedidoModal
│   ├── FinancePage.tsx        ← FinanceView + AddTransactionModal + AddCategoryModal
│   ├── SettingsPage.tsx       ← SettingsView completo
│   └── CalendarPage.tsx       ← CalendarView + AddLiveModal
├── components/
│   ├── PanelPedidos.tsx       ← Ya existe ✓
│   ├── AdminTiendaView.tsx    ← Ya existe ✓
│   ├── DetailedAnalysis.tsx   ← Ya existe ✓
│   ├── PersonDetailModal.tsx  ← Extraer (muy grande, 850 líneas)
│   └── ReconciliationModal.tsx← Extraer
└── storefront/                ← Ya existe ✓
```

---

## Cómo se previenen los conflictos entre conversaciones/agentes

Una vez hecha la separación:

| Conversación | Toca | No toca |
|---|---|---|
| Panel de casilleros | `PanelPedidos.tsx`, `server.ts` | Todo lo demás |
| Catálogo | `AdminTiendaView.tsx`, `storefront/` | Todo lo demás |
| Pagos | `PaymentsPage.tsx` | Todo lo demás |
| App.tsx | Solo routing, máx 300 líneas | Rara vez |

**Resultado:** Cero conflictos entre sesiones de trabajo paralelo.

---

## Orden recomendado de migración

> **Regla de oro:** Extraer **una página a la vez**. Probar. Commit. Seguir.

### Fase A — Preparación (1 sesión)
1. Crear `src/types.ts` con todos los tipos/interfaces de App.tsx
2. Crear `src/hooks/useAppData.ts` con `loadData()` y estado global

### Fase B — Páginas grandes primero (impacto máximo en velocidad)
1. `SettingsView` → `pages/SettingsPage.tsx` (850 líneas, muy autocontenida)
2. `PersonDetailModal` → `components/PersonDetailModal.tsx` (850 líneas)
3. `AddTransactionModal` → `components/AddTransactionModal.tsx` (630 líneas)

### Fase C — Páginas medianas
4. `FinanceView` → `pages/FinancePage.tsx`
5. `PaymentsView` → `pages/PaymentsPage.tsx`
6. `ReconciliationModal` → `components/ReconciliationModal.tsx`

### Fase D — Páginas pequeñas y limpieza
7. `EntregaView` → `pages/OrdersPage.tsx`
8. `CalendarView` → `pages/CalendarPage.tsx`
9. `HomeView` → `pages/HomePage.tsx`
10. Activar `React.lazy()` en todas las páginas

---

## Code splitting con React.lazy (el "turbo" de velocidad)

Una vez extraídas, activar lazy loading es trivial:

```tsx
// En App.tsx — solo cargan cuando el usuario navega a esa página
const FinancePage = React.lazy(() => import('./pages/FinancePage'));
const AdminTiendaView = React.lazy(() => import('./components/AdminTiendaView'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));

// Envolver con Suspense
<Suspense fallback={<div className="loading-screen">Cargando...</div>}>
  {activeView === 'finance' && <FinancePage ... />}
  {activeView === 'tienda' && <AdminTiendaView ... />}
</Suspense>
```

**Efecto:** El catálogo/tienda solo descarga su código cuando el usuario lo abre. No antes.

---

## Riesgos y cómo mitigarlos

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| Props rotos al extraer | Media | TypeScript lo detecta inmediatamente al compilar |
| Estado compartido que se pierde | Media | Crear `useAppData.ts` antes de extraer páginas |
| Funciones que dependen de otras en App.tsx | Alta | Identificarlas antes de mover (grep previo) |
| Romper el flujo de autenticación | Baja | El auth vive en la raíz de App.tsx, no en las páginas |

---

## Resumen ejecutivo para otra IA

Si quieres compartir esta propuesta con otra IA para que la ejecute:

> **Tarea:** Refactorizar `src/App.tsx` (7,443 líneas, 320KB) del proyecto React 19 + TypeScript + Vite "Ventas Live". El archivo contiene todas las vistas y modales de la aplicación mezclados. La extracción debe hacerse **página por página**, empezando por `SettingsView` (línea 4176, ~850 líneas) como prueba piloto. Cada extracción debe: (1) crear el nuevo archivo en `src/pages/`, (2) mover el componente completo, (3) exportarlo como `default`, (4) importarlo en `App.tsx` con `React.lazy()`, (5) verificar que TypeScript compile sin errores con `npm run lint`. No tocar el resto de App.tsx hasta que la prueba piloto funcione.

---

## Conclusión

- ✅ **Es completamente viable** — ya lo estás haciendo (PanelPedidos, AdminTiendaView)
- ✅ **Mejora la velocidad** — especialmente el catálogo/tienda con lazy loading
- ✅ **Elimina conflictos** entre sesiones de trabajo paralelo
- ✅ **Se puede hacer gradualmente** — sin romper nada, una página a la vez
- ⏱️ **Tiempo estimado:** 3-5 sesiones de trabajo para migración completa
