# Sistema de ingesta de notificaciones bancarias

Documento técnico completo del pipeline que transforma notificaciones push de Android (vía MacroDroid) en pagos registrados automáticamente en la app.

---

## Arquitectura

```
Android (MacroDroid)
  │  HTTP POST con headers x-device-id + x-device-secret
  ▼
Supabase Edge Function: ingest-notification
  │  1. Autenticar dispositivo
  │  2. Hash SHA-256 para idempotencia
  │  3. Insertar en raw_notification_events
  │  4. Parsear → parsed_payment_candidates
  ▼
Cascada de parseo (nombre + monto)
  │  regex → learned_patterns → Gemini → manual_review
  ▼
Si éxito: insertar en pagos + pedidos (status='procesar')
Si falla: manual_review_queue
```

---

## Tablas

| Tabla | Propósito |
|---|---|
| `raw_notification_events` | Notificación cruda + `raw_hash` único (SHA-256) |
| `parsed_payment_candidates` | Nombre/monto extraído + `parse_status` |
| `manual_review_queue` | Items sin nombre válido que requieren revisión humana |
| `learned_text_patterns` | Patrones aprendidos por `app_package` para mejorar futuras extracciones |
| `notification_bank_observations` | Bancos/apps nuevos detectados para seguimiento |

Creadas en migraciones `018_store_orders_and_multi_images.sql`, `019_*`, `020_learned_text_patterns.sql`.

---

## Parseo en cascada

El orden importa — cada paso solo se ejecuta si el anterior falla:

### 1. Regex hardcodeados (archivo: `supabase/functions/ingest-notification/index.ts:71`)

```javascript
// Yape QR: "QR DE NOMBRE  te envió Bs. X"
/QR\s+DE\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60}?)\s{1,4}te\s+(?:envi\S*|yape\S*|pag\S*)/i

// Yape directo: "NOMBRE, te envió Bs. X"
/(?:^|\|\s*)([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,80}?)\s*,\s*te\s+(?:envi\S*|yape\S*|pag\S*|transf\S*)/im

// Bancos clásicos: "RECIBISTE Bs. X DE NOMBRE"
/RECIBISTE\s+(?:Bs\.?\s*[\d.,]+\s+)?DE\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{2,60}?)(?:\s+(?:por|con|Bs|en|el|a\s+las)|$)/i
```

### 2. Patrones aprendidos

Al procesar un pago exitoso, se guarda en `learned_text_patterns`:
- `app_package` (ej: `com.bcp.yape`)
- `before_marker` — 20 chars antes del nombre
- `after_marker` — 20 chars después del nombre
- `success_count` — cuántas veces funcionó

RPC: `upsert_learned_pattern(p_app, p_before, p_after)`.

En la siguiente notificación del mismo banco, busca esos markers y extrae lo que esté entre ellos.

### 3. Gemini 2.5 Flash Lite

**Modelo:** `gemini-2.5-flash-lite`
**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`
**Config clave:**
```javascript
generationConfig: {
  temperature: 0,
  maxOutputTokens: 150,
  responseMimeType: 'application/json',
  thinkingConfig: { thinkingBudget: 0 }  // crítico: sin esto gasta tokens en "thinking"
}
```

**Por qué este modelo y no otro:**
- `gemini-1.5-flash-latest` → **deprecado** (404)
- `gemini-2.0-flash` → requiere tier pagado (429 quota exceeded)
- `gemini-flash-latest` → usa thinking por defecto, gasta tokens de más
- `gemini-2.5-flash-lite` → **free tier, rápido, sin thinking, JSON estructurado**

**Cuota free:** 15 RPM, 1500 requests/día.

### 4. Manual review queue

Si ninguno de los 3 pasos anteriores extrae un nombre válido (mínimo 2 palabras, sin keywords bancarias, sin dígitos), el item va a `manual_review_queue`. **Nunca se crea un pago con nombre falso.**

Validador estricto en `looksLikeRealName()`:
- 2+ palabras
- 6-70 caracteres
- No contiene: PAGO, DEPOSITO, YAPE, TRANSFERENCIA, BS, QR, etc.
- No contiene dígitos

---

## Endpoints / Headers

**Edge Function URL:**
```
https://vhczofpmxzbqzboysoca.supabase.co/functions/v1/ingest-notification
```

**Headers requeridos:**
```
Content-Type: application/json
x-device-id: android-caja-01
x-device-secret: b51dd700ece0a2754a70105c8f3b986f9149adfd96da5472620d504df1122d45
```

**Payload esperado:**
```json
{
  "app_package": "com.bcp.yape",
  "app_name": "Yape",
  "title": "Yape",
  "text": "QR DE JUAN PEREZ te envió Bs. 50.00",
  "big_text": "QR DE JUAN PEREZ te envió Bs. 50.00",
  "sbn_key": "unique-notification-key",
  "posted_at": "2026-04-20T12:00:00Z"
}
```

**Respuesta exitosa:**
```json
{
  "ok": true,
  "raw_hash": "a7dd7917...",
  "parsed": {
    "amount": 50,
    "payer": "JUAN PEREZ",
    "name_source": "regex" | "learned" | "gemini" | "fallback",
    "confidence": 0.83
  },
  "needs_review": false,
  "auto_processed": true
}
```

---

## Comandos de operación

### Deploy del Edge Function
```bash
C:/Users/IVAN/bin/supabase.exe functions deploy ingest-notification \
  --no-verify-jwt \
  --project-ref vhczofpmxzbqzboysoca
```
**No requiere Docker** (el CLI sube el archivo directo).

### Setear secret de Gemini
```bash
C:/Users/IVAN/bin/supabase.exe secrets set GEMINI_API_KEY="AIza..." \
  --project-ref vhczofpmxzbqzboysoca
```

### Ver logs del Edge Function
Dashboard: https://supabase.com/dashboard/project/vhczofpmxzbqzboysoca/functions/ingest-notification/logs

### Test manual con curl
```bash
curl -X POST "https://vhczofpmxzbqzboysoca.supabase.co/functions/v1/ingest-notification" \
  -H "Content-Type: application/json" \
  -H "x-device-id: android-caja-01" \
  -H "x-device-secret: b51dd700ece0a2754a70105c8f3b986f9149adfd96da5472620d504df1122d45" \
  -d '{"app_package":"com.test","text":"QR DE JUAN PEREZ te envió Bs. 10","big_text":"QR DE JUAN PEREZ te envió Bs. 10","title":"Test","sbn_key":"test-1","posted_at":"2026-04-20T12:00:00Z"}'
```

---

## Scripts de rescate y mantenimiento

| Script | Qué hace |
|---|---|
| `scripts/rescue-with-regex.mjs` | Recorre `manual_review_queue` y aplica el regex actual. Útil después de mejorar los patrones. |
| `scripts/rescue-with-gemini.mjs` | Igual pero usa Gemini (para casos donde regex no alcanza). Requiere `GEMINI_API_KEY` en `.env`. |
| `scripts/reset-and-seed.mjs` | Borra todos los datos y crea 5 clientes de prueba. **Destructivo.** |

---

## Formatos de notificación conocidos

### Yape (com.bcp.yape)
- **Directo:** `"NOMBRE APELLIDO, te envió Bs. 50.00"`
- **QR:** `"QR DE NOMBRE APELLIDO  te envió Bs. 50.00"` (dos espacios antes de "te")
- **Sin nombre:** `"Recibiste un yapeo de Bs. 50.00"` → siempre va a revisión manual

### Bancos bolivianos (BCP, BNB, Union, etc.)
- `"RECIBISTE Bs. 50 DE NOMBRE APELLIDO"`
- `"Transferencia recibida de NOMBRE APELLIDO por Bs. 50"`
- `"Depósito recibido Bs. 75.50 ref #TRXXXX"` → va a revisión (sin nombre)

---

## Troubleshooting

**Los pagos llegan al dashboard pero no a la app:**
→ Revisar `pagos` table. Si los hay ahí pero no en la UI, problema de frontend (React no re-fetched). Llamar `loadData()`.

**MacroDroid muestra 401:**
→ El Edge Function se desplegó SIN `--no-verify-jwt`. Re-desplegar con esa flag.

**MacroDroid muestra 403:**
→ Device secret mal. Verificar `x-device-secret` header contra `INGEST_DEVICE_SECRET` en Supabase secrets.

**Pagos atascados en `manual_review_queue`:**
→ Correr `node scripts/rescue-with-regex.mjs`. Si el regex no los rescata, probar `rescue-with-gemini.mjs`. Si siguen atascados, son notificaciones sin nombre (legítimamente irrecuperables).

**Gemini responde `FINISH_REASON: MAX_TOKENS` con output vacío:**
→ El modelo está gastando tokens en thinking. Asegurar `thinkingConfig: { thinkingBudget: 0 }` en el generationConfig.

**Nombres falsos tipo "PAGO Yape" aparecen:**
→ **NO DEBERÍA PASAR.** El código actual ya no genera placeholders. Si aparece, buscar en git history por `"PAGO "` + app_name y eliminar.

---

## Invariantes del sistema

1. **Nunca crear un pago sin nombre real.** Mejor dejarlo en `manual_review_queue` que inventar un placeholder.
2. **Idempotencia por `raw_hash`** — una misma notificación nunca se procesa 2 veces.
3. **`user_id` fijo** = `13dcb065-6099-4776-982c-18e98ff2b27a` (single-tenant por ahora).
4. **El Edge Function auto-aprende** — cada éxito deja un patrón que acelera futuras extracciones.
5. **Gemini es el último recurso** — regex y aprendizaje deben fallar antes de llamar la API.
