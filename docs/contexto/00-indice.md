# Índice del Sistema — Ventas Live

**Aplicación:** PWA de gestión de ropa en consignación para "Chehi App Abril"
**Dueña:** Leidy Candy Diaz Sanchez
**Producción:** https://ventas-live.vercel.app
**Repositorio:** https://github.com/ivanarields/ventas-live

---

## Módulos del sistema

### 1. App Principal (`01-app-principal.md`)
PWA React + Express en Vercel. Gestiona clientes, pagos, pedidos, casilleros y finanzas.
DB principal: Supabase `vhczofpmxzbqzboysoca` (ChehiAppAbril).

### 2. Sistema de Pagos y Casilleros (`02-sistema-pagos.md`)
MacroDroid captura notificaciones bancarias → Edge Function las procesa → crea pagos.
Casilleros numéricos (1 bolsa) y alfabéticos (2+ bolsas) se asignan automáticamente.

### 3. WhatsApp Bridge (`03-whatsapp-bridge.md`)
Servicio Node.js en Railway que espeja el WhatsApp del negocio.
Recibe mensajes/fotos, los guarda en la DB del panel (`vwaocoaeenavxkcshyuf`).
Se quiere migrar a otro alojamiento.

### 4. Tienda Online (`04-tienda-online.md`)
Tienda pública de productos. DB separada: Supabase `thgbfurscfjcmgokyyif`.
Los pagos de la tienda se cruzan con el sistema principal vía `ingest-bank`.

### 5. Estado Actual y Pendientes (`05-estado-pendientes.md`)
Qué está funcionando, últimos cambios, pruebas realizadas, tareas pendientes.

---

## Credenciales clave

| Sistema | URL / ID |
|---------|----------|
| App principal | https://ventas-live.vercel.app |
| Supabase principal | https://vhczofpmxzbqzboysoca.supabase.co |
| Supabase panel WA | https://vwaocoaeenavxkcshyuf.supabase.co |
| Supabase tienda | https://thgbfurscfjcmgokyyif.supabase.co |
| WhatsApp Bridge | https://bridge-production-13f7.up.railway.app |
| User ID operador | `13dcb065-6099-4776-982c-18e98ff2b27a` |
| Puerto local dev | 3004 |

## Comandos esenciales

```bash
npm run dev          # Servidor local (Express + Vite HMR) en puerto 3004
npm run build        # Build producción → dist/
C:/Users/IVAN/bin/supabase.exe db push  # Aplicar migraciones pendientes
# Deploy Edge Function:
C:/Users/IVAN/bin/supabase.exe functions deploy ingest-notification --no-verify-jwt --project-ref vhczofpmxzbqzboysoca
```
