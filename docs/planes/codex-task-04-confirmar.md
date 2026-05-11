# CODEX TASK 04 — Flujo de confirmación de pedido por la clienta

Ejecuta exactamente los cambios descritos. No toques nada que no esté listado.

---

## Contexto (leer antes de tocar código)

El flujo que se implementa es:
1. Operador abre un pedido en el panel admin → presiona "Pedir confirmación" → la clienta recibe WhatsApp con link
2. La clienta entra al link → ve sus prendas → presiona "Confirmar mis prendas"
3. En el panel admin aparece el pedido como "Confirmado por la clienta"

El link que se envía por WhatsApp es: `https://leidydiaz.live/tienda#profile/confirmar`

La confirmación se guarda en la columna `customer_selection` (ya existe en `store_orders`, es JSONB).

---

## CAMBIO 1 — server.ts: agregar endpoint de confirmación por clienta

**Archivo:** `server.ts`

**Busca esta línea** (endpoint de pedidos pendientes manuales):
```typescript
  app.get('/api/store/pending-manual',
```

**Agrega ANTES de esa línea:**
```typescript
  // Clienta confirma sus prendas desde su perfil
  app.post('/api/store-orders/:id/customer-confirm', async (req, res) => {
    const orderId = Number(req.params.id);
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'No autenticado' });

    const { data: authData, error: authError } = await supabaseStore.auth.getUser(token);
    if (authError || !authData?.user) return res.status(401).json({ error: 'Sesión inválida' });

    const phone = authData.user.email?.replace('@tiendaleydi.com', '') ?? '';

    const { data: order, error: orderErr } = await supabaseStore
      .from('store_orders')
      .select('id, customer_wa, status, customer_selection')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (order.customer_wa !== phone) return res.status(403).json({ error: 'No autorizado' });

    const { error: updateErr } = await supabaseStore
      .from('store_orders')
      .update({
        customer_selection: {
          ...(typeof order.customer_selection === 'object' && order.customer_selection ? order.customer_selection : {}),
          confirmed: true,
          confirmed_at: new Date().toISOString(),
          confirmed_by: 'customer',
        },
      })
      .eq('id', orderId);

    if (updateErr) return res.status(500).json({ error: 'No se pudo guardar' });
    return res.json({ ok: true });
  });

```

---

## CAMBIO 2 — server.ts: corregir el link del WhatsApp en notify-live-ready

**Archivo:** `server.ts`

**Busca esta línea** (dentro del endpoint notify-live-ready):
```typescript
      const storeLink = `${process.env.STORE_URL || 'https://tienda.ventas-live.com'}/live-confirmation?phone=${cleanPhone}`;
```

**Reemplázala por:**
```typescript
      const storeBase = process.env.STORE_URL || 'https://leidydiaz.live';
      const storeLink = `${storeBase}/tienda#profile/confirmar`;
```

---

## CAMBIO 3 — AdminTiendaView.tsx: agregar botón "Pedir confirmación"

**Archivo:** `src/components/AdminTiendaView.tsx`

**Busca este bloque** (las acciones para pedidos con status `pending`):
```typescript
                      {order.status === 'pending' && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => verifyOrderManual(order.id)}
                            disabled={verifyingId === order.id}
                            className="col-span-2 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-black text-[12px] text-white shadow-md disabled:opacity-60"
                            style={{ background: '#10b981' }}>
                            {verifyingId === order.id ? '...' : '✅ Verificar Pago Manualmente'}
                          </button>
                          <button onClick={() => updateOrder(order.id, { status: 'confirmed', hideProducts: true })}
                            className="flex items-center justify-center gap-1 py-2 rounded-xl font-black text-[11px] text-white" style={{ background: BRAND }}>
                            <Check size={12} /> Vendido + Ocultar
                          </button>
                          <button onClick={() => updateOrder(order.id, { status: 'cancelled' })}
                            className="flex items-center justify-center gap-1 py-2 rounded-xl font-black text-[11px] bg-red-50 text-red-600">
                            <X size={12} /> Cancelar
                          </button>
                        </div>
                      )}
```

**Reemplázalo por:**
```typescript
                      {order.status === 'pending' && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => verifyOrderManual(order.id)}
                            disabled={verifyingId === order.id}
                            className="col-span-2 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-black text-[12px] text-white shadow-md disabled:opacity-60"
                            style={{ background: '#10b981' }}>
                            {verifyingId === order.id ? '...' : '✅ Verificar Pago Manualmente'}
                          </button>
                          <button onClick={() => updateOrder(order.id, { status: 'confirmed', hideProducts: true })}
                            className="flex items-center justify-center gap-1 py-2 rounded-xl font-black text-[11px] text-white" style={{ background: BRAND }}>
                            <Check size={12} /> Vendido + Ocultar
                          </button>
                          <button onClick={() => updateOrder(order.id, { status: 'cancelled' })}
                            className="flex items-center justify-center gap-1 py-2 rounded-xl font-black text-[11px] bg-red-50 text-red-600">
                            <X size={12} /> Cancelar
                          </button>
                          <button
                            onClick={() => {
                              const storeLink = `https://leidydiaz.live/tienda#profile/confirmar`;
                              const msg = encodeURIComponent(`Hola! Por favor revisa las prendas de tu pedido #${order.id} y confirma si todo está correcto: ${storeLink}\n\n(Necesitarás tu PIN de la tienda)`);
                              window.open(`https://wa.me/591${order.customer_wa}?text=${msg}`, '_blank');
                            }}
                            className="col-span-2 flex items-center justify-center gap-1 py-2 rounded-xl font-black text-[11px] text-white"
                            style={{ background: '#f59e0b' }}>
                            📋 Pedir confirmación a la clienta
                          </button>
                        </div>
                      )}
```

---

## CAMBIO 4 — StoreProfile.tsx: hacer funcional la pestaña CONFIRMAR

**Archivo:** `src/storefront-v2/components/StoreProfile.tsx`

### Paso 4A — Actualizar la interfaz StoreOrder para incluir customer_selection

**Busca:**
```typescript
interface StoreOrder {
  id: number;
  items: Array<{ productName: string; price: number; size: string; quantity: number }>;
  total: number;
  status: 'pending' | 'paid' | 'ready' | 'delivered' | 'cancelled';
  payment_verified_at: string | null;
  created_at: string;
  customer_wa: string;
}
```

**Reemplázalo por:**
```typescript
interface StoreOrder {
  id: number;
  items: Array<{ productName: string; price: number; size: string; quantity: number }>;
  total: number;
  status: 'pending' | 'paid' | 'ready' | 'delivered' | 'cancelled';
  payment_verified_at: string | null;
  created_at: string;
  customer_wa: string;
  customer_selection: { confirmed?: boolean; confirmed_at?: string; confirmed_by?: string } | null;
}
```

### Paso 4B — Agregar prop initialTab y estado de confirmación

**Busca:**
```typescript
interface Props {
  onBack: () => void;
  onLogout: () => void;
  onProductSelect?: (product: Product) => void;
  onOpenCart?: () => void;
}
```

**Reemplázalo por:**
```typescript
interface Props {
  onBack: () => void;
  onLogout: () => void;
  onProductSelect?: (product: Product) => void;
  onOpenCart?: () => void;
  initialTab?: Tab;
}
```

**Busca:**
```typescript
export function StoreProfile({ onBack, onLogout, onProductSelect, onOpenCart }: Props) {
```

**Reemplázalo por:**
```typescript
export function StoreProfile({ onBack, onLogout, onProductSelect, onOpenCart, initialTab }: Props) {
```

**Busca:**
```typescript
  const [tab, setTab] = useState<Tab>('saved');
```

**Reemplázalo por:**
```typescript
  const [tab, setTab] = useState<Tab>(initialTab ?? 'saved');
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
```

### Paso 4C — Agregar función de confirmación

**Busca:**
```typescript
  const activeOrders = orders.filter(order => order.status !== 'cancelled');
```

**Agrega ANTES de esa línea:**
```typescript
  const handleCustomerConfirm = async (orderId: number) => {
    const session = storeAuth.getCurrentUserSync();
    if (!session) return;
    setConfirmLoading(true);
    try {
      await fetch(`/api/store-orders/${orderId}/customer-confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      setConfirmDone(true);
      await loadProfile(session.token);
    } finally {
      setConfirmLoading(false);
    }
  };

```

### Paso 4D — Reemplazar el contenido de la pestaña 'confirm'

**Busca este bloque completo** (es el contenido actual de la pestaña confirm):
```typescript
        ) : tab === 'confirm' ? (
          <section className="rounded-3xl bg-white border border-gray-100 shadow-sm p-4 space-y-4">
            <div>
              <p className="text-[15px] font-black text-gray-900">Confirmar pedido y fecha</p>
              <p className="text-[12px] text-gray-400 font-bold">Este espacio queda listo para el link que enviaremos a la clienta.</p>
            </div>
            <div className="rounded-2xl bg-[#fff0f5] p-4">
              <p className="text-[11px] font-black text-gray-400 uppercase">Ultimo pedido</p>
              <p className="mt-1 text-[18px] font-black text-gray-900">{nextOrder ? `#${nextOrder.id}` : 'Sin pedido activo'}</p>
              <p className="text-[13px] font-black text-[#ff2d78]">{nextOrder ? `${Number(nextOrder.total).toFixed(2)} Bs` : '0.00 Bs'}</p>
            </div>
            <button onClick={onOpenCart} className="w-full h-[52px] rounded-2xl text-white font-black text-[14px] shadow-lg" style={{ background: `linear-gradient(135deg, ${BRAND}, #ff6fa3)` }}>
              Confirmar pedido
            </button>
            <button onClick={() => setTab('delivery')} className="w-full h-12 rounded-2xl border border-[#ff2d78]/25 text-[#ff2d78] font-black text-[13px]">
              Elegir fecha de entrega
            </button>
          </section>
```

**Reemplázalo por:**
```typescript
        ) : tab === 'confirm' ? (
          <section className="space-y-3">
            {!nextOrder ? (
              <EmptyState title="Sin pedidos activos" text="Cuando tengas un pedido pendiente aparecerá aquí para que puedas confirmarlo." />
            ) : nextOrder.customer_selection?.confirmed ? (
              <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-5 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-green-50 text-green-500 flex items-center justify-center mx-auto">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p className="text-[16px] font-black text-gray-900">¡Prendas confirmadas!</p>
                <p className="text-[12px] text-gray-400 font-bold">
                  Confirmaste tu pedido #{nextOrder.id}. Ya estamos preparando todo para vos.
                </p>
                <span className="inline-block rounded-full bg-green-50 px-4 py-1.5 text-[11px] font-black text-green-600">
                  ✓ Confirmado por ti
                </span>
              </div>
            ) : (
              <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-4 space-y-4">
                <div>
                  <p className="text-[15px] font-black text-gray-900">Confirmá tus prendas</p>
                  <p className="text-[12px] text-gray-400 font-bold">Pedido #{nextOrder.id} · {Number(nextOrder.total).toFixed(2)} Bs</p>
                </div>
                <div className="space-y-2">
                  {(nextOrder.items ?? []).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 rounded-2xl bg-[#fff0f5] p-3">
                      <div className="w-8 h-8 rounded-xl bg-[#ff2d78]/10 flex items-center justify-center flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff2d78" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-black text-gray-900 truncate">{item.productName}</p>
                        {item.size && <p className="text-[11px] font-bold text-gray-400">Talla: {item.size}</p>}
                      </div>
                      <p className="text-[13px] font-black text-[#ff2d78] flex-shrink-0">{item.price.toFixed(2)} Bs</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 font-bold text-center">¿Estas prendas son correctas?</p>
                <button
                  onClick={() => handleCustomerConfirm(nextOrder.id)}
                  disabled={confirmLoading || confirmDone}
                  className="w-full h-[52px] rounded-2xl text-white font-black text-[14px] shadow-lg disabled:opacity-50 transition-all active:scale-95"
                  style={{ background: `linear-gradient(135deg, ${BRAND}, #ff6fa3)` }}
                >
                  {confirmLoading ? 'Guardando...' : confirmDone ? '✓ Confirmado' : '✓ Confirmar mis prendas'}
                </button>
              </div>
            )}
          </section>
```

---

## CAMBIO 5 — StorefrontApp.tsx: leer hash #profile/confirmar y pasar initialTab

**Archivo:** `src/storefront-v2/StorefrontApp.tsx`

### Paso 5A — Agregar estado de initialTab

**Busca:**
```typescript
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
```

**Agrega DESPUÉS de esa línea:**
```typescript
  const [profileInitialTab, setProfileInitialTab] = useState<string | undefined>(undefined);
```

### Paso 5B — Detectar hash #profile/confirmar

**Busca** (dentro del handler de hash, el bloque que maneja los hashes conocidos):
```typescript
      if (['gallery', 'checkout', 'profile', 'live-confirmation', 'selection', 'customer-center'].includes(hash)) {
        setViewInternal(hash as View);
        return;
      }
```

**Reemplázalo por:**
```typescript
      if (hash.startsWith('profile/')) {
        const subTab = hash.split('/')[1];
        setProfileInitialTab(subTab);
        setViewInternal('profile');
        return;
      }

      if (['gallery', 'checkout', 'profile', 'live-confirmation', 'selection', 'customer-center'].includes(hash)) {
        setProfileInitialTab(undefined);
        setViewInternal(hash as View);
        return;
      }
```

### Paso 5C — Pasar initialTab a StoreProfile

**Busca:**
```typescript
            {view === 'profile' && (
              <StoreProfile
                onBack={() => setView('gallery')}
                onLogout={() => setView('welcome')}
                onProductSelect={handleProductSelect}
                onOpenCart={() => setView('cart')}
              />
            )}
```

**Reemplázalo por:**
```typescript
            {view === 'profile' && (
              <StoreProfile
                onBack={() => setView('gallery')}
                onLogout={() => setView('welcome')}
                onProductSelect={handleProductSelect}
                onOpenCart={() => setView('cart')}
                initialTab={profileInitialTab as any}
              />
            )}
```

---

## NO TOCAR

- No toques ningún otro archivo
- No toques los endpoints existentes de pagos ni de auth
- No toques el carrito ni el checkout
- No elimines ni renombres ninguna función existente

---

## Verificación esperada

```
git diff --stat
```
Debe mostrar exactamente 4 archivos modificados:
- `server.ts`
- `src/components/AdminTiendaView.tsx`
- `src/storefront-v2/components/StoreProfile.tsx`
- `src/storefront-v2/StorefrontApp.tsx`
