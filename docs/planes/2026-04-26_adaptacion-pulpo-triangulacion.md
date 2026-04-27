# Plan de Adaptación: Pulpo + Triangulación de Datos

**Fecha:** 26 abr 2026  
**Base:** `docs/fase-final-automatizacion.md` (plan original de 21 abr 2026)  
**Estado del Pulpo:** Fundación completa y funcionando — ahora hay que conectarlo a la UI y completar los flujos

---

## Lo que el Plan Original Pedía vs. Lo que el Pulpo Ya Entrega

El plan original pedía 5 tareas para unir DB A (app) y DB B (WhatsApp panel). El sistema Pulpo ya construyó la capa de datos que resuelve la mayoría. Aquí el mapa exacto:

| Tarea original | Estado |
|---|---|
| T1 — Puente Telefónico | ✅ Backend listo, ❌ UI pendiente |
| T2 — Extraer nombre del comprobante (IA) | ❌ No implementado |
| T3 — Match Automático Pago ↔ WA | ✅ Datos disponibles, ❌ Badge en UI pendiente |
| T4 — Pre-llenar Mesa de Preparación | ❌ No implementado |
| T5 — Respuesta automática WA al asignar casillero | ❌ No implementado |

---

## Lo que el Pulpo Ya Tiene (No repetir)

### Capa de datos — 100% completa
- `identity_profiles`: perfil único por cliente con `phone`, `panel_phone`, `store_phone`, `cliente_id`, `confidence`
- `identity_evidence`: 4 canales — `whatsapp`, `macrodroid`, `manual_payment`, `store_order`
- Matching engine: teléfono exacto → nombre exacto → nombre parcial (≥75%) → perfil nuevo
- `recalculateAllConfidences()`: fórmula por canales reales (WA+2ch=97%, WA+1ch=85%, WA solo=60%, etc.)

### Backend — 100% completo
- `POST /api/identity/sync-whatsapp` — backfill contactos WA → perfiles (llena `panel_phone`)
- `POST /api/identity/sync-pagos` — backfill pagos → evidencia (separa macrodroid / manual)
- `GET /api/identity/whatsapp-photos?phone=&date=&days=` — fotos de WA por teléfono y fecha
- `POST /api/identity/profiles/:id/merge` — fusión manual de perfiles duplicados
- `PATCH /api/identity/evidence/:id/reassign` — corrección de match incorrecto
- `POST /api/identity/recalculate-confidence` — recálculo manual desde UI

### Edge Functions — Desplegadas
- `ingest-whatsapp`: cada mensaje WA entrante ya busca/crea perfil y deposita evidencia con `profile_id`
- `ingest-notification`: cada pago de banco ya busca/crea perfil y deposita evidencia con `profile_id`

### UI — Panel de Identidad (SettingsPage → Identidad)
- Lista de perfiles con confianza, canales, filtro por canal
- Botones de sync (WA, Pagos), fusión manual, recalcular confianza

---

## Las 5 Tareas Concretas que Quedan

---

### TAREA 1 — Fotos WA en el Perfil del Cliente
**Qué falta:** El endpoint `/api/identity/whatsapp-photos` ya existe y funciona. Solo falta mostrarlo en la UI.

**Cómo:**
1. En `CustomerProfile` (dentro de `App.tsx`), cuando el cliente tiene teléfono (`cliente.phone`), llamar al endpoint al abrir el perfil
2. Mostrar las fotos en un carrusel horizontal debajo del historial de pagos
3. Si no hay fotos o no hay teléfono, no mostrar nada (sin mensaje de error visible)

**Datos disponibles:**
- `cliente.phone` → se pasa como `?phone=...`
- La fecha del pedido más reciente → `?date=...&days=4`
- El endpoint devuelve `{ photos: [{media_url, media_type, created_at}], cliente_found: bool }`

**Resultado visible:** El operador abre el perfil y ve las fotos que el cliente mandó por WA en los días cercanos al pedido. Sin tocar nada.

**Prioridad:** Alta (es la más visible y más pedida)

---

### TAREA 2 — Extraer Nombre del Comprobante en `summarize-conversation`
**Qué falta:** La Edge Function `summarize-conversation` ya procesa fotos con Gemini pero NO extrae nombres de comprobantes.

**Cómo:**
1. Modificar el prompt de Gemini en `summarize-conversation/index.ts` para agregar:
   ```
   "Si ves una imagen de comprobante de pago (Yape, QR, transferencia), extrae:
   nombre_pagador, monto_pago, banco. Si no hay comprobante, estos campos van en null."
   ```
2. En la respuesta JSON de Gemini, tomar `nombre_pagador` y hacer `PATCH panel_clientes` → campo `nombre`
3. Disparar también un `POST /api/identity/resolve` a la DB A para ver si ya hay perfil con ese nombre

**Archivo a modificar:** `supabase/functions/summarize-conversation/index.ts`

**Resultado visible:** El panel de WhatsApp muestra "MARIA FUENTES" en vez de "+591 72 698 959" como nombre del cliente.

**Prioridad:** Media (alimenta la Tarea 3)

---

### TAREA 3 — Badge "Match WA" en la Lista de Pagos
**Qué falta:** Los datos ya existen. Si un perfil tiene evidencia tanto de `macrodroid/manual_payment` como de `whatsapp`, ese cliente tiene match. Solo falta mostrar el indicador en la UI.

**Cómo:**
1. En el endpoint `GET /api/pagos-lista` (o al cargar la app), para cada pago buscar si su `identity_profile` tiene evidencia de WhatsApp.
   - Opción más simple: agregar un campo `has_whatsapp_match: boolean` al objeto pago usando los datos ya en memoria de `identity_profiles`.
   - En `App.tsx`, después de `loadData()`, cruzar los pagos con los perfiles por `nombre` normalizado y marcar los que tienen `panel_phone`.
2. En la tarjeta de pago de la Lista de Pagos, mostrar un ícono verde de WhatsApp si `has_whatsapp_match = true`.

**No requiere nueva API.** El cruce se puede hacer 100% client-side con los datos ya cargados.

**Resultado visible:** El operador ve en cada fila de pago un ícono WA verde si ese cliente ya mandó fotos. Sabe de inmediato con quién hablar.

**Prioridad:** Media

---

### TAREA 4 — Pre-llenar Mesa de Preparación con Datos del Chat WA
**Qué falta:** La Mesa de Preparación (`SmartPrepView` o equivalente en `App.tsx`) siempre arranca en 0 prendas.

**Cómo:**
1. Cuando se abre la Mesa de Preparación para un pedido, buscar el perfil de identidad del cliente
2. Si el perfil tiene `panel_phone`, consultar `panel_clientes` en DB B para leer `ultimo_resumen` (JSON de Gemini)
3. Si el JSON tiene `cantidad_prendas`, pre-cargar ese número en el contador de prendas
4. Mostrar un badge "📲 Pre-llenado del chat WA" para que el operador sepa que el número no lo escribió él
5. El operador puede corregirlo manualmente antes de confirmar

**Requiere:**
- Que Tarea 2 esté parcialmente funcionando (para que `ultimo_resumen` tenga cantidad)
- O leer el `resumen` de `summarize-conversation` que ya guarda en `panel_clientes`

**Nuevo endpoint necesario:** `GET /api/identity/wa-summary?profile_id=` que lea `panel_clientes.ultimo_resumen` vía `panel_phone`

**Resultado visible:** La Mesa se abre con "3 prendas" ya puestas. El operador solo confirma.

**Prioridad:** Baja (depende de T2)

---

### TAREA 5 — WhatsApp de Confirmación al Asignar Casillero
**Qué falta:** El conector WA (`index.js`) solo recibe mensajes. No tiene endpoint de envío.

**Cómo:**
1. Agregar endpoint `POST /send` en `Faces panel de pedido/whatsapp-conector/index.js`:
   ```javascript
   // req.body: { phone: "59178456789", message: "Tu casillero es A. ¡Gracias!" }
   app.post('/send', async (req, res) => {
     const chatId = req.body.phone + '@c.us';
     await client.sendMessage(chatId, req.body.message);
     res.json({ ok: true });
   });
   ```
2. Agregar proxy en `server.ts`: `POST /api/whatsapp/send` → conector WA
3. En el flujo de "PEDIDO LISTO" (`handleSmartAction` en `App.tsx`), después de que Supabase asigna el casillero, llamar a `/api/whatsapp/send` con el número del cliente y un mensaje con la etiqueta asignada

**Mensaje de ejemplo:**
```
✨ Tu pedido fue registrado en Faces.
Casillero: A
Listo para cuando vengas a retirarlo.
```

**Condición:** Solo enviar si el perfil tiene `panel_phone` (el cliente está en WA). Si no, silencioso.

**Resultado visible:** El cliente recibe el WhatsApp automáticamente. El operador no toca el celular.

**Prioridad:** Baja (requiere que T1 esté estable para tener el teléfono correcto)

---

## Orden de Implementación Recomendado

```
Semana 1:
  T1 → Fotos WA en el Perfil del Cliente   (alto impacto, backend ya listo)
  T3 → Badge "Match WA" en Lista de Pagos  (solo UI, sin backend nuevo)

Semana 2:
  T2 → Extraer nombre del comprobante      (modifica Edge Function summarize-conversation)

Semana 3:
  T5 → Confirmación automática WA          (agrega endpoint /send al conector)
  T4 → Pre-llenar Mesa de Preparación      (depende de T2)
```

---

## Flujo Final Esperado (igual que en el plan original)

```
ANTES (ahora):
1. Leer chat WA en panel separado
2. Abrir app, buscar cliente
3. Recordar cantidad de prendas, tipearlas
4. Asignar casillero (automático ✅ — ya funciona)
5. Abrir WhatsApp en celular, escribir confirmación

DESPUÉS (cuando las 5 tareas estén):
1. Abrir Lista de Pagos → ver ícono WA verde en el pago
2. Click en cliente → fotos de las prendas YA aparecen abajo del historial
3. Click "PEDIDO LISTO" → Mesa pre-llenada con "3 prendas"
4. Click "PEDIDO LISTO" → Casillero asignado + WA enviado automáticamente
```

**El operador pasa de 5 pasos mentales a 3 clics.**

---

## Archivos Clave a Tocar por Tarea

| Tarea | Archivos |
|---|---|
| T1 | `src/App.tsx` (sección CustomerProfile) |
| T2 | `supabase/functions/summarize-conversation/index.ts` |
| T3 | `src/App.tsx` (lista de pagos + loadData) |
| T4 | `src/App.tsx` (SmartPrepView) + `src/routes/identity.ts` |
| T5 | `Faces panel de pedido/whatsapp-conector/index.js` + `server.ts` + `src/App.tsx` |

---

*Creado: 26 abr 2026 | Basado en fase-final-automatizacion.md + estado actual del sistema Pulpo*
