# Índice del Sistema — Ventas Live

**Aplicación:** PWA de gestión de ropa en consignación + tienda online + WhatsApp + MacroDroid.
**Dueña:** Leidy Candy Diaz Sanchez.
**Producción:** https://leidydiaz.live (alias: leidycandy.me, www.leidydiaz.live).
**Repositorio:** https://github.com/ivanarields/ventas-live.

Última revisión completa de docs: **2026-05-10**.

---

## Documentos en esta carpeta

| Archivo | Qué cubre |
|---|---|
| `00-indice.md` | Este archivo — mapa general |
| `01-app-principal.md` | Sistema principal: 6 pestañas, flujo del operador, etiquetas |
| `02-sistema-pagos.md` | Pagos automáticos (MacroDroid), comprobantes WhatsApp, etiquetas |
| `03-whatsapp-bridge.md` | Bridge de WhatsApp (en DigitalOcean), cola de mensajes |
| `04-tienda-online.md` | Tienda web (`/tienda`), checkout, pedidos web, integración con sistema principal |
| `05-estado-pendientes.md` | Qué está hecho hoy, qué falta, últimos cambios |

---

## Tres bases de datos en Supabase

| Nombre | ID interno | Para qué |
|---|---|---|
| **ChehiAppAbril** | `vhczofpmxzbqzboysoca` | Sistema principal: pagos, clientes, pedidos, etiquetas, cola WhatsApp |
| **TiendaOnline** | `thgbfurscfjcmgokyyif` | Productos web, pedidos web (`store_orders`), perfiles de clienta web |
| **PanelPedido** | `vwaocoaeenavxkcshyuf` | Chats WhatsApp (`panel_mensajes`), fotos reales en bucket `whatsapp-media` |

**Regla crítica:** las fotos reales viven en PanelPedido. TiendaOnline solo guarda links. ChehiAppAbril nunca guarda fotos de tienda ni WhatsApp.

---

## URLs de producción

- App operador: `https://leidydiaz.live`
- Tienda nueva (oficial, rápida): `https://leidydiaz.live/tienda`
- Tienda antigua (respaldo): `https://leidydiaz.live/tienda-original`
- Tienda v2 directo: `https://leidydiaz.live/tienda-v2`

---

## Identificadores clave

| Cosa | Valor |
|---|---|
| User ID del operador (Iván) | `13dcb065-6099-4776-982c-18e98ff2b27a` |
| Auth del operador | `ivanariel.fb@gmail.com` / `Chehi2024!` |
| Bridge WhatsApp | `http://134.122.123.253:3001` (DigitalOcean) |
| Webhook secret del bridge | `ventas-live-bridge-2026` |

---

## Comandos esenciales

```bash
npm run dev          # Servidor local en puerto 3004
npm run build        # Compilar para producción
npm run lint         # Verificar tipos TypeScript

# Edge Functions
C:/Users/IVAN/bin/supabase.exe functions deploy ingest-notification --no-verify-jwt --project-ref vhczofpmxzbqzboysoca
C:/Users/IVAN/bin/supabase.exe functions deploy ingest-bank-store --no-verify-jwt --project-ref thgbfurscfjcmgokyyif
```
