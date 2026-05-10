# Estado Actual y Pendientes

Última revisión: 2026-05-10.

---

## Funcionando en producción ✅

### Sistema principal
- Login con email/password (Supabase Auth).
- 4 pantallas operativas: Lista de Pagos → Perfil → Mesa de Preparación → Regreso.
- Casilleros: numéricos (1 bolsa) y alfabéticos (2+ bolsas), con migración automática.
- Pago efectivo manual desde botón "Registrar".
- Botón "Live" procesa todos los chats WhatsApp pendientes.
- Pago con MacroDroid → ingest-notification → cruce con comprobantes WA.
- Verificación manual de pagos morados desde panel.
- Fechas locales de Bolivia (no UTC) en formularios.

### WhatsApp Bridge
- Migrado de Railway a DigitalOcean (`http://134.122.123.253:3001`).
- Espeja mensajes entrantes a panel_mensajes.
- Acepta envío saliente vía POST `/api/send` con webhook secret.

### Tienda Online
- Tienda nueva en `/tienda` (rápida, código en `src/storefront-v2/`).
- Tienda antigua en `/tienda-original` (respaldo, código en `src/storefront/`).
- Login obligatorio antes de pagar (teléfono + PIN, auto-registro).
- Reserva de 1 minuto + cleanup automático.
- Pago automático MacroDroid → Edge Function `ingest-bank-store` → `/api/store/match-payment`.
- Inyección de pedido + pago en ChehiAppAbril con `label=WEB-{id}`, `method=Tienda Online`.
- UN solo mensaje WhatsApp al confirmar pago (sin "venir a retirar").
- Procesador automático de cola WA cada 60 seg (filtro `storeOnly`).
- Pre-rellenado de teléfono desde URL `?phone=...`.

### Edge Functions desplegadas
- `ingest-notification` en ChehiAppAbril (versión 35).
- `ingest-bank-store` en TiendaOnline (versión 2).

---

## Cambios recientes (2026-05-09 → 10)

| Fecha | Cambio | Commit |
|---|---|---|
| 2026-05-10 | Limpieza de docs + CLAUDE.md cortito + hook pre-commit | `70d657d` |
| 2026-05-09 | Tienda nueva queda en `/tienda`, antigua en `/tienda-original` | `287a37a` |
| 2026-05-09 | Mensaje único WhatsApp + flujo correcto + Edge Function corregidas | `b13cb15` |
| 2026-05-08 | Ajustes detalle y checkout tienda v2 | `6ab0442` |
| 2026-05-08 | Ajuste layout galería tienda v2 | `473ee8f` |
| 2026-05-07 | Migración bridge WA a DigitalOcean | `da72962` |

---

## Variables de entorno necesarias

### Vercel (Production)
```
PORT=3004
SUPABASE_URL / VITE_SUPABASE_URL = https://vhczofpmxzbqzboysoca.supabase.co
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_ANON_KEY
PANEL_SUPABASE_URL = https://vwaocoaeenavxkcshyuf.supabase.co
PANEL_SUPABASE_SERVICE_KEY
VITE_STORE_SUPABASE_URL = https://thgbfurscfjcmgokyyif.supabase.co
VITE_STORE_SUPABASE_ANON_KEY
STORE_SUPABASE_SERVICE_ROLE_KEY
STORE_OWNER_USER_ID = 13dcb065-6099-4776-982c-18e98ff2b27a
STORE_PUBLIC_URL = https://leidydiaz.live
WHATSAPP_BRIDGE_URL = http://134.122.123.253:3001
WEBHOOK_SECRET = ventas-live-bridge-2026
OPENROUTER_API_KEY
OPENROUTER_MODEL = google/gemini-2.5-flash-lite
INGEST_DEVICE_SECRET
LIVE_SALES_TEST_PHONE = 59172698959
```

### Secrets de Supabase
- ChehiAppAbril: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `INGEST_DEVICE_SECRET`, `INGEST_USER_ID`, `SERVER_URL`.
- TiendaOnline: `SERVER_URL=https://leidydiaz.live`.

---

## Migraciones aplicadas

ChehiAppAbril tiene 43+ migraciones (`001` a `043` confirmadas).
TiendaOnline tiene su propia migración aplicada manualmente.

Última migración relevante:
- `043_fix_downgrade_last_order.sql` — degradar de letra a número cuando es el último pedido activo.
- `044_store_favorites.sql` — favoritos en TiendaOnline (commiteada, aplicación pendiente de verificar).

---

## Pendiente prioritario

### 1. Comprobante WhatsApp en MORADO en página de Pagos
Cuando MacroDroid no llega a tiempo y la clienta manda comprobante por WhatsApp con código `#pedido`, el pedido debería aparecer en MORADO en la página de Pagos del operador, con la foto del comprobante visible. El operador confirma con un clic sin ir al panel admin de tienda.

**Estado:** no implementado. Hoy el operador tiene que ir al panel admin de tienda y verificar manualmente.

### 2. Achicar el QR de Yape
La imagen `/qr-yape.jpg` pesa 523 KB. Debería pesar ~50 KB. Hace que la pantalla de pago tarde más de un segundo en aparecer. Aplica para las dos tiendas.

### 3. Foto de prendas en el perfil de la clienta
Hoy el perfil muestra solo el nombre del producto y el precio. Agregar la foto para que la clienta confirme visualmente lo que compró.

### 4. RLS (Row Level Security)
ChehiAppAbril: filtrado solo por `user_id` en server. Falta RLS de Supabase.
TiendaOnline: sin RLS.

### 5. Supabase Realtime
Reemplazar el polling manual de `loadData()` por Realtime para actualizaciones automáticas en pantalla.

### 6. Sesión vieja de WhatsApp lockeada
Carpeta `Faces panel de pedido/` quedó pendiente de borrar (archivos `.wwebjs_auth/` lockeados por proceso). Borrar en próxima sesión cerrando antes el bridge local.

---

## Pruebas pendientes recomendadas

| # | Prueba | Prioridad |
|---|---|---|
| A | Pago de tienda con MacroDroid funcionando: confirmar que llega a Mesa de Preparación + WhatsApp | Alta |
| B | Pago de tienda donde MacroDroid falla: comprobante por WhatsApp aparece en panel | Alta |
| C | Cliente con pedido Live + pedido tienda el mismo día: agrupación correcta | Alta |
| D | Comprobante de solo texto sin foto | Media |
| E | Mismo comprobante enviado dos veces (idempotencia) | Media |
| F | Editar pago con datos incorrectos | Media |
| G | Eliminar pago y verificar liberación de casillero | Media |
| H | Pago fraccionado (cliente paga en 2 partes) | Media |

---

## Reglas inviolables

1. **No tocar el sistema principal** salvo necesidad explícita. Las 4 pantallas y el flujo de casilleros funcionan; cambios en `App.tsx`, `server.ts` core deben justificarse y verificarse.
2. **Las fotos de WhatsApp viven solo en PanelPedido**, no en TiendaOnline ni en ChehiAppAbril.
3. **Los pedidos web tienen `source='WEB'`** y NO disparan el segundo mensaje "PEDIDO LISTO".
4. **Antes de cada commit**, actualizar el archivo de `docs/contexto/` correspondiente. El hook pre-commit avisa si se olvida.
5. **Variables como `STORE_OWNER_USER_ID` son críticas** — si faltan en Vercel, pedidos quedan invisibles.
