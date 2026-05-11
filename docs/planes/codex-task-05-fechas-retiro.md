# CODEX TASK 05 — Fechas de retiro: admin configura, clienta elige

Ejecuta exactamente los cambios descritos. No toques nada que no esté listado.

---

## Contexto

El flujo es:
1. El operador entra al panel admin → Config → agrega fechas disponibles (ej: "Sábado 17 mayo" con horarios Tarde y Noche)
2. La clienta entra a su perfil → pestaña ENTREGA → ve las fechas disponibles → elige una
3. Si ninguna le sirve → elige otra fecha en un calendario → presiona botón que abre WhatsApp con el mensaje ya escrito
4. La fecha elegida queda guardada en el pedido (columnas `delivery_date` y `delivery_slot` ya existen en `store_orders`)

Las fechas disponibles se guardan en `store_settings` como un campo `pickup_dates` (array JSON serializado como string).

---

## CAMBIO 1 — server.ts: agregar endpoints de fechas de retiro y set-delivery

**Archivo:** `server.ts`

**Busca esta línea:**
```typescript
  app.get('/api/store/pending-manual',
```

**Agrega ANTES de esa línea:**
```typescript
  // Leer fechas de retiro disponibles (público)
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

  // Guardar fechas de retiro (solo admin)
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

  // Clienta guarda la fecha elegida en su pedido
  app.post('/api/store-orders/:id/set-delivery', async (req, res) => {
    const orderId = Number(req.params.id);
    const { delivery_date, delivery_slot } = req.body as { delivery_date: string; delivery_slot: string };
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'No autenticado' });

    const { data: authData, error: authError } = await supabaseStore.auth.getUser(token);
    if (authError || !authData?.user) return res.status(401).json({ error: 'Sesión inválida' });

    const phone = authData.user.email?.replace('@tiendaleydi.com', '') ?? '';

    const { data: order, error: orderErr } = await supabaseStore
      .from('store_orders')
      .select('id, customer_wa')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (order.customer_wa !== phone) return res.status(403).json({ error: 'No autorizado' });

    const { error: updateErr } = await supabaseStore
      .from('store_orders')
      .update({ delivery_date, delivery_slot, delivery_type: 'retiro' })
      .eq('id', orderId);

    if (updateErr) return res.status(500).json({ error: 'No se pudo guardar' });
    return res.json({ ok: true });
  });

```

---

## CAMBIO 2 — AdminTiendaView.tsx: sección de fechas de retiro en Config

**Archivo:** `src/components/AdminTiendaView.tsx`

### Paso 2A — Agregar estado de pickupDates

**Busca:**
```typescript
  const [subTab, setSubTab] = useState<'productos' | 'pedidos' | 'clientes' | 'confirmaciones' | 'config'>('productos');
```

**Agrega DESPUÉS de esa línea:**
```typescript
  const [pickupDates, setPickupDates] = useState<Array<{ date: string; label: string; slots: string[] }>>([]);
  const [pickupSaving, setPickupSaving] = useState(false);
```

### Paso 2B — Cargar pickupDates al cargar settings

**Busca la función loadSettings** (busca `async function loadSettings` o `const loadSettings`). Dentro de esa función, después de que se carguen los settings, agrega la carga de pickup dates.

**Busca dentro de loadSettings el bloque que guarda settings en estado** (algo similar a):
```typescript
      const res = await fetch('/api/store/settings');
```

**Después de ese bloque (al final de loadSettings), agrega:**
```typescript
      try {
        const pdRes = await fetch('/api/store/pickup-dates');
        if (pdRes.ok) {
          const pdData = await pdRes.json();
          setPickupDates(pdData.dates ?? []);
        }
      } catch {}
```

### Paso 2C — Función para guardar pickup dates

**Busca:**
```typescript
  const [pickupSaving, setPickupSaving] = useState(false);
```

**Agrega DESPUÉS de esa línea:**
```typescript
  const savePickupDates = async (dates: typeof pickupDates) => {
    setPickupSaving(true);
    try {
      await fetch('/api/store/pickup-dates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates }),
      });
      setPickupDates(dates);
    } finally {
      setPickupSaving(false);
    }
  };
```

### Paso 2D — Agregar la sección de fechas al final de la pestaña Config

**Busca esta línea** (es el cierre de la sección config, justo antes del cierre del subTab config):
```typescript
          </div>
        </div>
      )}
```

Esa línea aparece varias veces. Busca específicamente el bloque que contiene `Nota de entregas` — el `</div>` que cierra ese bloque de settings, que es el último campo antes del cierre del config. 

Más específicamente busca:
```typescript
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Nota de entregas</label>
              <textarea value={settings.delivery_note || ''}
                onChange={e => saveSetting('delivery_note', e.target.value)}
                rows={2}
                className="w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium outline-none focus:border-pink-400 resize-none" />
            </div>
          </div>
        </div>
      )}
```

**Reemplázalo por:**
```typescript
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Nota de entregas</label>
              <textarea value={settings.delivery_note || ''}
                onChange={e => saveSetting('delivery_note', e.target.value)}
                rows={2}
                className="w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium outline-none focus:border-pink-400 resize-none" />
            </div>
          </div>

          {/* ─── Fechas de retiro disponibles ─── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div>
              <p className="text-sm font-black text-gray-800">Fechas de retiro disponibles</p>
              <p className="text-[11px] text-gray-400 font-medium">Las clientas verán estas fechas en su perfil para elegir cuándo retirar.</p>
            </div>

            {pickupDates.length === 0 && (
              <p className="text-[12px] text-gray-400 font-bold py-2 text-center">Sin fechas configuradas</p>
            )}

            {pickupDates.map((pd, idx) => (
              <div key={idx} className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={pd.date}
                    onChange={e => {
                      const d = new Date(e.target.value + 'T12:00:00');
                      const label = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                      const next = pickupDates.map((x, i) => i === idx ? { ...x, date: e.target.value, label } : x);
                      setPickupDates(next);
                    }}
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[12px] font-bold outline-none"
                  />
                  <button
                    onClick={() => savePickupDates(pickupDates.filter((_, i) => i !== idx))}
                    className="w-8 h-8 rounded-lg bg-red-50 text-red-500 text-[15px] font-black flex items-center justify-center"
                  >×</button>
                </div>
                <div className="flex gap-2">
                  {['Mañana', 'Tarde', 'Noche'].map(slot => (
                    <button
                      key={slot}
                      onClick={() => {
                        const slots = pd.slots.includes(slot) ? pd.slots.filter(s => s !== slot) : [...pd.slots, slot];
                        const next = pickupDates.map((x, i) => i === idx ? { ...x, slots } : x);
                        setPickupDates(next);
                      }}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-black transition-colors"
                      style={{
                        background: pd.slots.includes(slot) ? '#ff2d78' : '#f3f4f6',
                        color: pd.slots.includes(slot) ? 'white' : '#6b7280',
                      }}
                    >{slot}</button>
                  ))}
                </div>
              </div>
            ))}

            <button
              onClick={() => setPickupDates(prev => [...prev, { date: '', label: 'Nueva fecha', slots: ['Tarde'] }])}
              className="w-full h-10 rounded-xl border border-dashed border-pink-200 bg-pink-50 text-[12px] font-black text-[#ff2d78]"
            >+ Agregar fecha</button>

            <button
              onClick={() => savePickupDates(pickupDates)}
              disabled={pickupSaving}
              className="w-full h-10 rounded-xl bg-[#ff2d78] text-[12px] font-black text-white shadow-sm disabled:opacity-50"
            >{pickupSaving ? 'Guardando...' : 'Guardar fechas'}</button>
          </div>
        </div>
      )}
```

---

## CAMBIO 3 — StoreProfile.tsx: reemplazar pestaña ENTREGA con el selector real

**Archivo:** `src/storefront-v2/components/StoreProfile.tsx`

### Paso 3A — Agregar estado para fechas y selección

**Busca:**
```typescript
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
```

**Reemplázalo por:**
```typescript
  const [pickupDates, setPickupDates] = useState<Array<{ date: string; label: string; slots: string[] }>>([]);
  const [selectedPickup, setSelectedPickup] = useState<{ date: string; slot: string } | null>(null);
  const [wantsOtherDate, setWantsOtherDate] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [deliverySaved, setDeliverySaved] = useState(false);
```

### Paso 3B — Cargar fechas disponibles al cargar el perfil

**Busca** (dentro de la función loadProfile, al final antes del bloque `finally`):
```typescript
    } finally {
      setLoading(false);
    }
  };
```

**Reemplaza ese cierre de loadProfile por:**
```typescript
      const pdRes = await fetch('/api/store/pickup-dates');
      if (pdRes.ok) {
        const pdData = await pdRes.json();
        setPickupDates(pdData.dates ?? []);
      }
    } finally {
      setLoading(false);
    }
  };
```

### Paso 3C — Agregar función para guardar fecha elegida

**Busca:**
```typescript
  const handleCustomerConfirm = async (orderId: number) => {
```

**Agrega ANTES de esa línea:**
```typescript
  const handleSaveDelivery = async () => {
    const session = storeAuth.getCurrentUserSync();
    if (!session || !nextOrder) return;
    if (!selectedPickup && !(customDate && customTime)) return;
    setDeliverySaving(true);
    try {
      await fetch(`/api/store-orders/${nextOrder.id}/set-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          delivery_date: selectedPickup?.date ?? customDate,
          delivery_slot: selectedPickup?.slot ?? customTime,
        }),
      });
      setDeliverySaved(true);
    } finally {
      setDeliverySaving(false);
    }
  };

```

### Paso 3D — Reemplazar el contenido de la pestaña 'delivery'

**Busca este bloque completo:**
```typescript
        ) : tab === 'delivery' ? (
          <section className="rounded-3xl bg-white border border-gray-100 shadow-sm p-4 space-y-4">
            <div>
              <p className="text-[15px] font-black text-gray-900">Fecha de entrega</p>
              <p className="text-[12px] text-gray-400 font-bold">Calendario simple para preparar la coordinacion.</p>
            </div>
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="w-full h-12 rounded-2xl border border-gray-200 px-4 text-[13px] font-black outline-none" />
            <textarea value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)} placeholder="Nota de entrega..." className="w-full min-h-24 rounded-2xl border border-gray-200 p-4 text-[13px] font-bold outline-none resize-none" />
            <button className="w-full h-12 rounded-2xl bg-[#ff2d78] text-white text-[13px] font-black">Guardar fecha</button>
          </section>
```

**Reemplázalo por:**
```typescript
        ) : tab === 'delivery' ? (
          <section className="space-y-3">
            {deliverySaved ? (
              <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-5 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-green-50 text-green-500 flex items-center justify-center mx-auto">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p className="text-[15px] font-black text-gray-900">¡Fecha guardada!</p>
                <p className="text-[12px] text-gray-400 font-bold">
                  {selectedPickup
                    ? `${pickupDates.find(d => d.date === selectedPickup.date)?.label ?? selectedPickup.date} — ${selectedPickup.slot}`
                    : `${customDate} a las ${customTime}`}
                </p>
              </div>
            ) : (
              <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-4 space-y-4">
                <div>
                  <p className="text-[15px] font-black text-gray-900">¿Cuándo retirás tu pedido?</p>
                  <p className="text-[12px] text-gray-400 font-bold">Elegí una de las fechas disponibles o pedí otro día.</p>
                </div>

                {pickupDates.length === 0 ? (
                  <p className="text-[12px] text-gray-400 font-bold py-2 text-center">Pronto habrá fechas disponibles.</p>
                ) : (
                  <div className="space-y-2">
                    {pickupDates.flatMap(pd =>
                      pd.slots.map(slot => ({
                        key: `${pd.date}-${slot}`,
                        date: pd.date,
                        label: pd.label,
                        slot,
                      }))
                    ).map(option => {
                      const isSelected = !wantsOtherDate && selectedPickup?.date === option.date && selectedPickup?.slot === option.slot;
                      return (
                        <button
                          key={option.key}
                          onClick={() => { setSelectedPickup({ date: option.date, slot: option.slot }); setWantsOtherDate(false); }}
                          className="w-full flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors"
                          style={{
                            borderColor: isSelected ? '#ff2d78' : '#e5e7eb',
                            background: isSelected ? '#fff0f5' : 'white',
                          }}
                        >
                          <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                            style={{ borderColor: isSelected ? '#ff2d78' : '#d1d5db' }}>
                            {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-[#ff2d78]" />}
                          </div>
                          <div>
                            <p className="text-[13px] font-black text-gray-900 capitalize">{option.label}</p>
                            <p className="text-[11px] font-bold text-gray-400">{option.slot}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <button
                  onClick={() => { setWantsOtherDate(true); setSelectedPickup(null); }}
                  className="w-full py-3 rounded-2xl border-2 text-[13px] font-black transition-colors"
                  style={{
                    borderColor: wantsOtherDate ? '#ff2d78' : '#e5e7eb',
                    color: wantsOtherDate ? '#ff2d78' : '#6b7280',
                    background: wantsOtherDate ? '#fff0f5' : 'white',
                  }}
                >
                  📅 Quiero otro día
                </button>

                {wantsOtherDate && (
                  <div className="space-y-3 rounded-2xl bg-gray-50 p-3">
                    <div>
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Fecha</label>
                      <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
                        className="w-full mt-1 h-11 rounded-xl border border-gray-200 bg-white px-3 text-[13px] font-bold outline-none" />
                    </div>
                    <div>
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Hora aproximada</label>
                      <input type="time" value={customTime} onChange={e => setCustomTime(e.target.value)}
                        className="w-full mt-1 h-11 rounded-xl border border-gray-200 bg-white px-3 text-[13px] font-bold outline-none" />
                    </div>
                    {customDate && customTime && (
                      <button
                        onClick={() => {
                          const dateLabel = new Date(customDate + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                          const msg = encodeURIComponent(`Hola! Soy clienta de la tienda y quiero retirar mi pedido${nextOrder ? ` #${nextOrder.id}` : ''} el ${dateLabel} a las ${customTime}. ¿Está disponible esa fecha?`);
                          window.open(`https://wa.me/59160003230?text=${msg}`, '_blank');
                        }}
                        className="w-full h-12 rounded-2xl font-black text-[13px] text-white flex items-center justify-center gap-2"
                        style={{ background: '#25D366' }}
                      >
                        <span>💬</span> Avisarle a Leidy American
                      </button>
                    )}
                  </div>
                )}

                {(selectedPickup || (wantsOtherDate && customDate && customTime)) && !wantsOtherDate && (
                  <button
                    onClick={handleSaveDelivery}
                    disabled={deliverySaving}
                    className="w-full h-12 rounded-2xl text-white font-black text-[14px] disabled:opacity-50 active:scale-95 transition-all"
                    style={{ background: 'linear-gradient(135deg, #ff2d78, #ff6fa3)' }}
                  >
                    {deliverySaving ? 'Guardando...' : 'Confirmar fecha de retiro'}
                  </button>
                )}
              </div>
            )}
          </section>
```

---

## NO TOCAR

- No toques ningún otro archivo
- No toques los endpoints existentes de pagos ni de pedidos
- No toques el carrito, el checkout, ni el catálogo

---

## Verificación esperada

```
git diff --stat
```
Debe mostrar exactamente 3 archivos modificados:
- `server.ts`
- `src/components/AdminTiendaView.tsx`
- `src/storefront-v2/components/StoreProfile.tsx`
