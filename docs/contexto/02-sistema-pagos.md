# Sistema de Pagos y Casilleros

## Flujo completo de un pago

```
MacroDroid (Android)
    ↓ notificación bancaria capturada
POST /api/ingest-notification (proxy en server.ts)
    ↓ reenvía a
Edge Function: ingest-notification (Supabase vhczofpmxzbqzboysoca)
    ↓ parsea nombre + monto (regex → patrones aprendidos → OpenRouter)
tabla: pagos  ←  registro creado automáticamente
    ↓
(mientras tanto, cliente manda foto comprobante por WhatsApp)
    ↓
WhatsApp Bridge → panel_mensajes (DB vwaocoaeenavxkcshyuf)
    ↓
POST /api/ai/summarize-conversation  (botón "Live" en app, o manual por chat)
    ↓ analiza imagen con IA, extrae nombre + monto + hora
pagos_venta_live  ←  registro creado con estado pendiente_whatsapp
    ↓
matchLivePaymentWithMacrodroid()  ←  cruza con tabla pagos (nombre + monto ±5min)
    ↓
estado: verificado_macrodroid (verde) o pendiente_whatsapp (morado)
```

---

## Estados de un pago

| Estado | Color | Significado |
|--------|-------|-------------|
| `verificado_macrodroid` | Verde | Comprobante WA cruzado automáticamente con pago MacroDroid |
| `verificado_manual` | Verde | Operador confirmó manualmente |
| `pendiente_whatsapp` | Morado | Comprobante llegó pero no hay pago MacroDroid que coincida |
| `posible_duplicado` | Morado | Mismo nombre/monto/hora que otro pago ya registrado |
| `rechazado` | Gris | Descartado manualmente |

---

## Parseo de notificaciones (en cascada)

1. **Regex hardcodeados** — Yape directo, Yape QR, Yastaa, bancos bolivianos
2. **Patrones aprendidos** (`learned_text_patterns`) — aprende contexto antes/después del nombre por app_package
3. **OpenRouter** (`google/gemini-2.5-flash-lite`) — casos nuevos no cubiertos por regex
4. Sin nombre válido → `manual_review_queue` (NUNCA placeholder tipo "PAGO Yape")

**Idempotencia:** hash SHA-256 de cada notificación (`raw_hash`) evita duplicados.

---

## MacroDroid — configuración

- **Dispositivo:** `android-caja-01`
- **Apps capturadas:** Yape (`com.bcp.bo.wallet`), Yastaa (`com.busa.wallet`), otros bancos bolivianos
- **Endpoint destino:** `https://vhczofpmxzbqzboysoca.supabase.co/functions/v1/ingest-notification`
- **Headers requeridos:** `x-device-id: android-caja-01`, `x-device-secret: [INGEST_DEVICE_SECRET]`
- **Payload:** `{ source, device_id, event_uuid, captured_at_ms, app_name, app_package, title, text, big_text }`

---

## Sistema de casilleros

### Tipos
| Tipo | Códigos | Capacidad por casillero | Para qué |
|------|---------|------------------------|----------|
| `NUMERIC_SHARED` | 1–100 | 5 pedidos simples, 1 bolsa c/u | 1 bolsa por pedido |
| `ALPHA_COMPLEX` | A–Z (26) | 12 bolsas máx | 2+ bolsas por pedido |

### Reglas de asignación
- Pedido en estado `procesar` → **sin casillero**
- Pedido marcado `LISTO` con 1 bolsa → asigna casillero **numérico** (el de menor prioridad disponible)
- Pedido marcado `LISTO` con 2+ bolsas → asigna casillero **alfabético**
- Si cliente ya tiene casillero letra activo → nuevo pedido **hereda la misma letra**
- Al agregar bolsa a pedido ya listo: si suma 2+ bolsas totales del cliente → **migra a letra automáticamente**
- Al marcar `entregado` → casillero **liberado** (RELEASED)

### Funciones PL/pgSQL clave
```sql
fn_assign_container(order_id, user_id)      — asigna casillero con FOR UPDATE SKIP LOCKED
fn_migrate_to_complex(order_id)              — migra de numérico a alfabético
fn_release_container(order_id, reason)       — libera casillero al entregar
fn_recalc_container_state(container_id)      — recalcula estado del casillero
```

### Migraciones relevantes
- `041_group_orders_by_client_alpha.sql` — casilleros alfabéticos agrupados por cliente
- `042_v2_total_bags_per_customer.sql` — lógica basada en bolsas totales del cliente
- `043_fix_downgrade_last_order.sql` — permite degradar de letra a número cuando es el último pedido activo

---

## Tablas del panel WA (DB `vwaocoaeenavxkcshyuf`)

```
panel_clientes      — un registro por número de teléfono
panel_mensajes      — mensajes y fotos recibidos (has_media, media_url)
pedidos_venta_live  — pedidos del live (cliente, monto total, estado)
pagos_venta_live    — comprobantes procesados
  campos clave: estado, main_pago_id, panel_mensaje_id, duplicate_of,
                nombre_canonico, monto, comprobante_media_url, match_reason
```
