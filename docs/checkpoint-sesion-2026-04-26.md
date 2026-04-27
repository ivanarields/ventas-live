# Checkpoint de Sesión — 26 abr 2026

## Dónde quedamos

Esta sesión fue de limpieza, análisis y planificación. No se implementó funcionalidad nueva de negocio. Lo que sigue es ejecutar el plan de adaptación Pulpo + Triangulación.

---

## Lo que se hizo en esta sesión

### 1. Panel de QR de WhatsApp en la app ✅
- Se creó `src/components/WhatsappConnectionPanel.tsx` — muestra el QR, estado de conexión, instrucciones
- Se agregó al tab "Sistema" de `src/pages/SettingsPage.tsx`
- Se agregó endpoint proxy `GET /api/whatsapp/status` en `server.ts`
- Se agregó endpoint `GET /status` (JSON) en el conector `whatsapp-conector/index.js`
- **Resultado:** El QR aparece en Configuración → Sistema. Se auto-refresca cada 20 segundos.

### 2. Plan de Adaptación Pulpo + Triangulación ✅
- Archivo: `docs/planes/2026-04-26_adaptacion-pulpo-triangulacion.md`
- Archivo simple (para Ivan): `docs/planes/2026-04-26_explicacion-simple-para-ivan.md`
- **Las 5 tareas pendientes (en orden de prioridad):**
  1. **T1 — Fotos WA en el Perfil del Cliente** (backend ya existe, solo falta UI en App.tsx)
  2. **T3 — Badge WA verde en Lista de Pagos** (cruce client-side, sin backend nuevo)
  3. **T2 — IA lee el comprobante de pago** (modificar Edge Function summarize-conversation)
  4. **T5 — WhatsApp automático al asignar casillero** (agregar endpoint /send al conector)
  5. **T4 — Pre-llenar Mesa de Preparación** (depende de T2)

### 3. Limpieza de N8N ✅
- N8N nunca estuvo en el sistema actual — era el plan original que se abandonó
- **Archivos de código actualizados:**
  - `index.js`: `process.env.N8N_WEBHOOK_URL` → `process.env.WEBHOOK_URL`
  - `.env`: `N8N_WEBHOOK_URL=...` → `WEBHOOK_URL=...` (mismo valor, solo renombrado)
  - `.env.example`: actualizado
  - `package.json`: `whatsapp-n8n-bridge` → `whatsapp-bridge`
  - `README.md`: reescrito sin N8N
- **Archivos de documentación eliminados:**
  - `04-fase-n8n-claude.md`
  - `fase4-n8n-workflow-explicado.md`
  - `fase4-pruebas-del-workflow.md`
- **Quedan archivos .md en `Faces panel de pedido/` que mencionan N8N** (son arquitectura general, se pueden borrar o dejar — Ivan no decidió aún)

---

## Estado actual del sistema

### Servidores corriendo
- App principal: `http://localhost:3004` (`npm run dev`)
- Conector WhatsApp: `http://localhost:3000` (`node index.js`)

### Lo que funciona hoy
- Login, pagos, pedidos, casilleros, Mesa de Preparación
- Panel de Identidad (Pulpo): perfiles, evidencia, confianza, sync, merge
- ingest-whatsapp: cada mensaje WA ya crea/vincula perfil Pulpo con profile_id
- ingest-notification: cada pago banco ya crea/vincula perfil Pulpo
- QR de WhatsApp visible en la app (Configuración → Sistema)
- WhatsApp conectado con el número de la empresa (escaneado esta sesión)

### Lo que NO funciona aún (pendiente del plan)
- Fotos de WA no se ven en el Perfil del Cliente (backend existe, falta UI)
- No hay badge WA en la Lista de Pagos
- La IA no extrae nombres de comprobantes de pago de WA
- Mesa de Preparación no se pre-llena con datos del chat
- No hay WhatsApp automático al asignar casillero

---

## Decisiones técnicas tomadas

### Sobre el hosting del conector WhatsApp
- **Decisión pendiente**: Railway vence en ~30 días. Opciones discutidas:
  - Correr en la computadora del local con **PM2** (gratis, simple, recomendado para horario laboral)
  - Continuar en Railway ($5/mes, cubre 24/7)
  - Oracle Cloud Free (gratis para siempre, setup complejo)
- **PM2 no instalado aún** — Ivan no confirmó si quería proceder

### Sobre la confiabilidad del espejo de WhatsApp
- Es razonablemente confiable pero tiene riesgos:
  - Si el conector se cae → mensajes perdidos durante la caída (no hay recuperación)
  - Si el celular está apagado más de 14 días → sesión expirada, hay que re-escanear QR
  - WhatsApp puede romper la librería con actualizaciones (1-2 veces al año)
- Mejora inmediata disponible: instalar PM2 para auto-reinicio

### El sistema Pulpo NO toca los datos originales
- `identity_profiles` e `identity_evidence` son tablas aparte
- Los pagos, pedidos, clientes originales nunca se modifican
- El Pulpo solo "observa" y construye una capa encima

---

## Próxima sesión — por dónde empezar

**Opción A (más impacto visual rápido):**
Implementar T1: mostrar fotos de WhatsApp en el Perfil del Cliente.
- El endpoint `/api/identity/whatsapp-photos` ya existe y funciona
- Solo hay que agregar la galería en la sección de CustomerProfile en App.tsx

**Opción B (estabilidad del sistema):**
Instalar PM2 para que el conector de WhatsApp se reinicie solo si se cae.
- Comando: `npm install -g pm2 && pm2 start index.js --name whatsapp-bridge`

**Opción C (lo que Ivan quería arreglar — pendiente):**
Ivan mencionó que había "algo importante" que quería arreglar en la app pero no llegó a decir qué era. Preguntar al inicio de la próxima sesión.

---

## Archivos clave del sistema

| Qué | Dónde |
|---|---|
| Conector WhatsApp | `Faces panel de pedido/whatsapp-conector/index.js` |
| Panel QR en la app | `src/components/WhatsappConnectionPanel.tsx` |
| Sistema Pulpo — rutas | `src/routes/identity.ts` |
| Sistema Pulpo — lógica | `src/services/identityService.ts` |
| Panel de Identidad UI | `src/components/IdentityPanel.tsx` |
| Edge Function WhatsApp | `supabase/functions/ingest-whatsapp/index.ts` |
| Edge Function Banco | `supabase/functions/ingest-notification/index.ts` |
| Plan de adaptación | `docs/planes/2026-04-26_adaptacion-pulpo-triangulacion.md` |
| Explicación simple | `docs/planes/2026-04-26_explicacion-simple-para-ivan.md` |

---

*Generado al cierre de sesión: 26 abr 2026*
