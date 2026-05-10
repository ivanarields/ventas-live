# CLAUDE.md

Cartel de entrada para cualquier IA (Claude, Codex, Gemini, Cursor, etc.) que trabaje en este proyecto.

---

## Qué es esto

App de Leidy: PWA para gestionar consignación de ropa + tienda online + pagos automáticos por MacroDroid + WhatsApp.

---

## Reglas obligatorias antes de tocar código

1. **Leé primero `docs/contexto/`** entero. Ahí está la verdad sobre cómo funciona la app. Los archivos son:
   - `00-indice.md` — mapa general
   - `01-app-principal.md` — sistema principal (pagos, casilleros, Mesa de Preparación)
   - `02-sistema-pagos.md` — flujo de pagos y MacroDroid
   - `03-whatsapp-bridge.md` — bridge de WhatsApp
   - `04-tienda-online.md` — tienda web
   - `05-estado-pendientes.md` — qué está hecho y qué falta

2. **Si algo en el código no coincide con la documentación, el código manda.** Actualizá la documentación.

3. **Verificá colores y nombres en el código antes de escribirlos en un documento.** No asumas. Por ejemplo: las tarjetas de PROCESAR son amarillas, no azules.

---

## Reglas obligatorias después de tocar código

**Antes de cada `git commit`, actualizá automáticamente y SIN PREGUNTAR el archivo de `docs/contexto/` que corresponda al área tocada.**

- ¿Tocaste la tienda? Actualizá `04-tienda-online.md`.
- ¿Tocaste pagos / casilleros / Mesa de Preparación? Actualizá `01-app-principal.md` o `02-sistema-pagos.md`.
- ¿Tocaste el bridge? Actualizá `03-whatsapp-bridge.md`.
- ¿Pasó algo nuevo importante? Actualizá `05-estado-pendientes.md` con la fecha.

El usuario NO va a recordarte hacerlo. Es tu obligación.

---

## Bases de datos

- **ChehiAppAbril** (`vhczofpmxzbqzboysoca`): sistema principal — pagos, clientes, pedidos, casilleros, cola WhatsApp.
- **TiendaOnline** (`thgbfurscfjcmgokyyif`): productos web, pedidos web, perfiles tienda.
- **PanelPedido** (`vwaocoaeenavxkcshyuf`): chats WhatsApp, fotos reales en bucket `whatsapp-media`.

---

## URLs de producción

- App: `https://leidydiaz.live`
- Tienda nueva (oficial): `https://leidydiaz.live/tienda`
- Tienda antigua (respaldo): `https://leidydiaz.live/tienda-original`

---

## Comandos

```
npm run dev       # servidor local
npm run build     # compilar
npm run lint      # tipos
C:/Users/IVAN/bin/supabase.exe functions deploy <nombre> --no-verify-jwt --project-ref <id>
```
