# 📋 Plan de Testeo — IA de Pagos
## Ventas Live · Abril 2026 · Versión Final para Revisión

> **Contexto:** este documento existe para validar que la IA que extrae datos de comprobantes y notificaciones bancarias funcione bien, **antes** de empezar el sistema de triangulación de perfiles de clientes. Si la IA extrae mal los nombres, los perfiles se van a duplicar o ensuciar.

> **Regla sagrada (memoria del proyecto):** la IA NUNCA puede inventar un nombre. Si no está seguro → `null` + cola manual.

---

## 📑 Índice

- [Parte 1 — Versión Simple (con ejemplos)](#parte-1--versión-simple-con-ejemplos)
- [Parte 2 — Plan Técnico Completo](#parte-2--plan-técnico-completo)
- [Parte 3 — Resumen Ultra-Simple](#parte-3--resumen-ultra-simple)
- [Parte 4 — Posibles Baches a Revisar](#parte-4--posibles-baches-a-revisar)

---

# PARTE 1 — Versión Simple (con ejemplos)

Explicación en palabras claras, con un ejemplo real por cada punto.

---

## 1. El Objetivo Rector

**Qué es:** antes de testear, hay que tener claro PARA QUÉ testeamos. No estamos probando "si la IA funciona" en general. Estamos probando que la IA haga bien su trabajo para que después los perfiles de clientes se armen solos y sin errores.

**Por qué importa:** si la IA se equivoca en algo chiquito (por ejemplo, escribe "María" en lugar de "MARIA"), el sistema después cree que son dos personas distintas y te duplica el cliente.

**Ejemplo:**
> Llega comprobante de Yape → la IA lee "MARIA GARCIA" → el sistema lo guarda bien → cuando "MARIA GARCIA" pague de nuevo, la app la reconoce al toque y suma el pago al mismo perfil.
>
> ❌ Si la IA leyera "Maria Garcia" (con minúsculas) → el sistema crea un cliente nuevo → ya tenés dos Marías en vez de una.

---

## 2. Qué entra y qué no

**Qué es:** no vamos a testear TODA la IA de la app. Solo lo que tenga que ver con pagos y comprobantes, porque eso es lo que alimenta los perfiles.

**Por qué importa:** si intentamos testear todo a la vez, no vamos a terminar nunca. Cortamos el alcance.

**Ejemplo:**
> ✅ Testeamos: comprobantes de Yape/BCP (generan pagos)
> ✅ Testeamos: notificaciones bancarias (generan pagos)
> ❌ NO testeamos: transcribir audios de WhatsApp (no tenés WA conectado todavía)
> ❌ NO testeamos: catalogar ropa para la tienda (no genera un perfil de cliente)

---

## 3. Qué le exige la triangulación a la IA

**Qué es:** los 6 datos que la IA DEBE devolver bien para que los perfiles funcionen: nombre, monto, banco, confianza, receptor, número de operación.

**Por qué importa:** si alguno de esos 6 datos viene mal, se rompe algo más adelante.

**Ejemplo:**
> La IA lee un comprobante y devuelve:
> ```
> pagador: "MARIA GARCIA"     ← nombre limpio para matchear
> monto: 120                  ← se guarda en pagos
> banco_app: "Yape"           ← sabemos de dónde viene
> confianza: "alta"           ← la app decide vincular automático
> receptor: "ChehiApp"        ← confirma que el pago es tuyo
> nro_operacion: "A12345"     ← evita duplicar si llega 2 veces
> ```
> Si `confianza: "baja"` en vez de "alta", el sistema manda el caso a cola de revisión manual y vos decidís. Por eso tiene que venir bien calibrado.

---

## 4. Armar el "paquete de prueba" (Fixtures)

**Qué es:** juntar imágenes reales de comprobantes, fotos de ropa, y textos de notificaciones. **Sin estas muestras, el testeo no sirve.**

**Por qué importa:** no podemos probar con datos inventados. Necesitamos lo que de verdad recibís en tu operación.

**Ejemplo:**
> Armás una carpeta `tests/fixtures/receipts/` con 15 imágenes + 5 no-comprobantes + 10 notificaciones.
>
> Para cada imagen, al lado creás un archivo `.json` diciendo lo que la IA **debería** responder:
> ```
> receipt_01.png   → "MARIA GARCIA pagó 120 por Yape"
> receipt_01.json  → { pagador: "MARIA GARCIA", monto: 120, banco_app: "Yape" }
> ```
> Así el test compara automáticamente: ¿coincide lo esperado con lo que dijo la IA? ✅ o ❌

---

## 5. Las 7 Pruebas (el testeo de verdad)

### 🧪 Prueba 1 — ¿Lee bien los comprobantes?
> Le mandás 15 imágenes. Tiene que acertar nombre y monto en al menos 13 de 15.
>
> *Ejemplo:* le mando Yape de JUAN PEREZ por 80 Bs → devuelve `pagador: "JUAN PEREZ", monto: 80` ✅

### 🧪 Prueba 2 — ¿Distingue ropa de comprobante?
> Le mandás una foto de una blusa. NO puede decir "es un comprobante".
>
> *Ejemplo:* foto de una blusa rosa → devuelve `tipo: PRENDA_ROPA` ✅
> *Sería grave si dijera* `tipo: COMPROBANTE_PAGO` → crearía un pago falso.

### 🧪 Prueba 3 — ¿Normaliza bien los nombres?
> "María" con tilde y "MARIA" en mayúsculas tienen que terminar iguales.
>
> *Ejemplo:*
> - IA lee "JOSÉ ANDRÉS LÓPEZ"
> - Sistema lo convierte a "JOSE ANDRES LOPEZ"
> - Cuando llega otro pago de "José Lopez" (escrito diferente) → matchea con el mismo cliente ✅

### 🧪 Prueba 4 — ¿Las notificaciones bancarias terminan bien?
> Notificación conocida (Yape) → crea pago automático.
> Notificación rara → la IA (Gemini) la rescata.
> Notificación basura → va a revisión manual.
>
> *Ejemplo:*
> - "MARIA, te envió Bs 50" → pago creado automáticamente ✅
> - "Oferta 30% descuento en..." → NO crea pago, va a cola manual ✅

### 🧪 Prueba 5 — ¿Funciona el plan B de las API Keys?
> Si tu key principal de Gemini se queda sin cupo, ¿pasa sola a la de respaldo?
>
> *Ejemplo:*
> - Llega comprobante → key principal falla → app usa key secundaria → comprobante procesado igual ✅
> - Sin esto, un día que se llene la key principal, toda la IA de pagos queda muerta hasta que manualmente la cambies.

### 🧪 Prueba 6 — ¿Queda registrado todo lo que hace la IA?
> Cada vez que la IA trabaja, tiene que quedar una línea en la tabla `ai_usage_log` con cuánto tardó y si funcionó.
>
> *Ejemplo:*
> - Dentro de un mes un cliente dice "no me identificó" → entrás al panel IA → ves el log → "sí se analizó a las 14:32, tardó 1200ms, éxito: sí, nombre extraído: MARIA GARCIA" → sabés qué pasó.

### 🧪 Prueba 7 — ¿No se duplica si llega dos veces?
> El mismo comprobante entra dos veces (porque el cliente lo reenvió) → NO se crean dos pagos.
>
> *Ejemplo:*
> - Primera vez: "MARIA pagó 120" → se crea un pago ✅
> - Segunda vez: "MARIA pagó 120" (misma imagen) → el sistema lo detecta → no hace nada ✅

---

## 6. El orden para hacer las pruebas

**Qué es:** hay un orden lógico. No empezar por la más compleja.

**Por qué importa:** si arrancamos desordenados, no sabemos qué arregla qué.

**Ejemplo:**
> 1. Primero armar las 30 muestras (fixtures)
> 2. Después Prueba 2 (clasificación) — la más rápida, filtra falsos comprobantes
> 3. Después Prueba 1 (extracción) — la más importante, la más larga
> 4. Y así hasta la 7

Es como cocinar: primero lavás, después cortás, después cocinás. No al revés.

---

## 7. Qué me llevo al final (Entregables)

**Qué es:** las cosas concretas que tiene que existir cuando terminamos.

**Por qué importa:** sin esto es solo "charla", no hay evidencia de que pasó el test.

**Ejemplo:**
> Cuando termine el día vas a tener:
> - 📁 Carpeta con las 30 muestras + sus respuestas esperadas
> - 💻 Un script `test-ai-receipts.mjs` que podés correr cuando quieras para re-testear
> - 📄 Un reporte: "Prueba 1 pasó 14/15, Prueba 2 pasó 5/5, etc."
> - 🔧 El `fallback2` de la API key cableado (si no lo estaba)

---

## 8. ¿Qué hago si algo falla?

**Qué es:** cuando una prueba no pase, no empezar a cambiar 10 cosas a la vez.

**Por qué importa:** si cambiás 5 cosas y pasa el test, no sabés cuál de las 5 arregló el problema.

**Ejemplo:**
> Prueba 1 falla: la IA confunde "BCP" con "Banco Unión" en 3 imágenes.
>
> ❌ Mal enfoque: cambio el prompt Y el modelo Y la temperatura al mismo tiempo.
>
> ✅ Enfoque correcto:
> 1. Cambio SOLO una línea del prompt ("si ves logo BCP, devolver `banco_app: BCP`")
> 2. Re-corro la Prueba 1
> 3. ¿Pasó? Perfecto. ¿No pasó? Cambio otra cosa.

---

## 9. ¿Cuándo digo que está "terminado"?

**Qué es:** unos números concretos que marcan el final. No termina "cuando me parezca que anda bien".

**Por qué importa:** sin criterios claros, uno termina mareándose testeando infinito.

**Ejemplo:**
> ✅ Prueba 1 pasa si: 90% de los nombres están bien (13 de 15)
> ✅ Prueba 2 pasa si: 0 fotos de ropa se clasifican como comprobante (CERO, sin excepción)
> ✅ Prueba 5 pasa si: funcionó el fallback automático
> ...
>
> Cuando los 7 pasan → listo, siguiente paso (la triangulación).

---

## 10. ¿Cuánto tiempo me toma esto?

**Qué es:** la estimación realista.

**Por qué importa:** para que sepas si te compromete un día o una semana.

**Ejemplo concreto:**
> - Mañana sábado: juntás las 30 imágenes/textos (3-4 horas)
> - Mañana tarde: corro el script y te paso los resultados (2-3 horas)
> - Si algo falla, ajustamos (1-3 horas)
>
> **Total: 1 día intenso o 2 días cómodos.**
>
> Al terminar, ya podés arrancar la Etapa 1 del plan de triangulación con la tranquilidad de que la IA no te va a meter basura en los perfiles.

---

---

# PARTE 2 — Plan Técnico Completo

Versión detallada con criterios técnicos, umbrales, fixtures y orden de ejecución.

---

## 1. Objetivo Rector

Este testeo **no es un testeo genérico**. Cada prueba existe para garantizar que los datos que la IA produce sirvan para la triangulación posterior. Si la IA extrae mal el nombre, el matcher nunca va a encontrar al cliente. Si marca un comprobante falso, creamos un perfil fantasma. Por eso cada criterio de éxito está pensado para alimentar el sistema de perfiles.

**Regla de oro sagrada (memoria):** la IA nunca puede inventar un nombre. Si no está seguro → `null` + cola manual. Esto se verifica en cada prueba.

---

## 2. ¿Qué se testea y qué no?

### ✅ SÍ entra en este plan
- **Extractor de comprobantes por imagen** (`/api/ai/analyze-qr`) — el más crítico para triangulación
- **Clasificador unificado de imagen** (`/api/ai/analyze-image`) — evita que una foto de ropa se confunda con comprobante
- **Parser de notificaciones bancarias** (Edge Function `ingest-notification` — cascada regex → learned → Gemini)
- **Cascada de API keys** (principal → fallback → fallback2)
- **Log de uso en `ai_usage_log`** (que cada llamada quede registrada)

### ❌ NO entra (por ahora)
- Transcripción de audios de WhatsApp — requiere WA conectado
- Prompt de resumen de conversación — depende de WA conectado
- Catalogado de productos para la tienda — no afecta triangulación
- Fotos seleccionadas por cliente — requiere WA conectado

---

## 3. Lo que la triangulación exige de la IA (criterios de diseño)

| Dato que extrae la IA | Por qué importa para triangulación |
|---|---|
| `pagador` (nombre del que pagó) | Es la llave de matcheo en `fn_link_customer_wa`. Si viene con tildes, minúsculas o palabras extra → no matchea. |
| `es_comprobante` (boolean) | Si es `false` cuando es una foto de ropa, evitamos crear `pagos` falsos y perfiles fantasma. |
| `monto` | Va a la tabla `pagos`. Un monto mal extraído contamina el historial de pagos del perfil. |
| `confianza` (alta/media/baja) | Determina si vinculamos automático (alta) o mandamos a cola manual (media/baja). |
| `receptor` | Confirma que el pago es para vos. Si el receptor es otra persona, no es un pago tuyo → no crear perfil. |
| `nro_operacion` | Idempotencia: evita duplicar el mismo pago si llega dos veces. |

---

## 4. Corpus de Fixtures (lo que hay que preparar primero)

**Sin un buen corpus, el testeo no vale nada.** Hay que juntar material REAL de tu operación.

### Fixture A — Comprobantes de pago (15 imágenes)
Guardar en `tests/fixtures/receipts/` con un JSON de "respuesta esperada" al lado.

| # | Tipo | Ejemplo | Caso que valida |
|---|---|---|---|
| 1 | Yape persona | "MARIA GARCIA te envió Bs 120" | Base feliz |
| 2 | Yape QR | "QR de ChehiApp — Juan Perez pagó 80" | Receptor correcto |
| 3 | BCP transferencia | Voucher con nombre completo | Banco clásico |
| 4 | Banco Unión | Pantallazo con monto grande | Banco clásico |
| 5 | Tigo Money | | Cobertura |
| 6 | BancoSol | | Cobertura |
| 7 | Nombre con tilde | "JOSÉ ANDRÉS LÓPEZ" | Normalización |
| 8 | Nombre con iniciales | "J. RODRIGUEZ M." | Nombres parciales |
| 9 | Comprobante borroso legible | | Robustez |
| 10 | Comprobante muy borroso ilegible | | Debe devolver pagador=null |
| 11 | Comprobante recortado (sin monto) | | Campos null parciales |
| 12 | Comprobante con 2 nombres (mandó alguien por otra persona) | | Desambiguación |
| 13 | Screenshot de WhatsApp con comprobante adentro | | Caso real |
| 14 | Foto de pantalla de TV mostrando app (foto de foto) | | Caso degradado |
| 15 | Comprobante a OTRO receptor (no es tu tienda) | | Debe detectar que el receptor no sos vos |

### Fixture B — No-comprobantes (5 imágenes)
Para verificar que NO clasifica como comprobante lo que no lo es.

| # | Tipo | Debe responder |
|---|---|---|
| 16 | Foto de blusa | `PRENDA_ROPA` |
| 17 | Foto de pantalón | `PRENDA_ROPA` |
| 18 | Foto de gato | `OTRO` |
| 19 | Screenshot de chat de WhatsApp (solo texto) | `OTRO` |
| 20 | Selfie de persona | `OTRO` |

### Fixture C — Notificaciones bancarias (10 textos)
Para `tests/fixtures/notifications/` con el string de notificación + paquete Android + respuesta esperada.

- Yape directo: `"MARIA, te envió Bs 50. Saldo..."`
- Yape QR: `"QR DE JUAN te envió..."`
- BCP: mensaje típico
- Banco Unión: mensaje típico
- 3 casos nuevos que el regex no reconoce (para testear cascada learned → Gemini)
- 2 casos basura (spam, promociones) → deben ir a `manual_review_queue`
- 1 duplicado exacto del primero → debe detectarse por hash

### Fixture D — JSON de respuestas esperadas
Cada fixture va con su "esperado". Ejemplo para `receipt_01.json`:
```json
{
  "es_comprobante": true,
  "pagador": "MARIA GARCIA",
  "monto": 120,
  "banco_app": "Yape",
  "confianza_minima": "media"
}
```

Solo chequeamos campos críticos (no fecha/hora exactas). Esto evita que el test se rompa por cosas cosméticas.

---

## 5. Batería de Pruebas

### 🧪 PRUEBA 1 — Extracción de comprobantes (la más importante)
**Qué valida:** que el prompt QR extrae `pagador`, `monto`, `banco_app` y `confianza` correctos.

**Cómo funciona:**
- Script corre Fixture A (1-15) contra `/api/ai/analyze-qr`
- Compara cada respuesta con su JSON esperado
- Genera tabla: aciertos / fallos por campo

**Criterio de éxito (umbrales duros):**
- `pagador` correcto (normalizado, MAYÚSCULAS sin tildes) → **≥ 90%** de los casos 1-9
- `pagador` = null en caso 10 (ilegible) → obligatorio
- `monto` con error ≤ 1 Bs → **≥ 95%** de los casos con monto visible
- `banco_app` correcto → **≥ 85%**
- Caso 15 (receptor ajeno): `receptor` debe contener un nombre distinto al tuyo

**Si falla:** ajustar el prompt en `server.ts:1206`. Documentar qué cambió.

---

### 🧪 PRUEBA 2 — Clasificación unificada (evitar falsos comprobantes)
**Qué valida:** que `/api/ai/analyze-image` NO clasifique ropa o cualquier otra cosa como comprobante.

**Cómo funciona:**
- Script corre Fixture B (16-20) contra `/api/ai/analyze-image`
- Verifica que `tipo` NO sea `COMPROBANTE_PAGO`

**Criterio de éxito:**
- 0 falsos positivos. Si una foto de ropa se clasifica como comprobante → **test falla y se bloquea el deploy**.

Esto es crítico: un falso positivo acá equivale a crear un pago y un perfil inventado.

---

### 🧪 PRUEBA 3 — Normalización del nombre extraído
**Qué valida:** que cualquier nombre que salga de la IA, ya venga con tildes, minúsculas o puntuación, se normalice igual antes de compararse con `canonical_name`.

**Cómo funciona:**
- Usar casos 7, 8 de Fixture A
- Tomar el `pagador` devuelto y pasarlo por la misma función de normalización que usa `server.ts:1258`
- Verificar que el resultado coincide exactamente con el esperado

**Criterio de éxito:**
- "JOSÉ ANDRÉS LÓPEZ" → "JOSE ANDRES LOPEZ"
- "J. Rodriguez M." → "J RODRIGUEZ M"
- 100% de casos deben normalizar igual.

**Por qué este test existe:** si `MARÍA` y `MARIA` producen dos canonicales distintos, el matcher de triangulación nunca los va a unir.

---

### 🧪 PRUEBA 4 — Parser de notificaciones bancarias (cascada completa)
**Qué valida:** el flujo regex → learned_patterns → Gemini → manual_review_queue.

**Cómo funciona:**
- Script manda cada texto de Fixture C a la Edge Function `ingest-notification`
- Verifica en qué tabla termina (`pagos`, `learned_text_patterns`, `manual_review_queue`)

**Criterio de éxito:**
- Yape/BCP/Unión clásicos → regex directo → `pagos` creado
- Casos nuevos → cae en Gemini → nombre extraído → `pagos` creado
- Spam → `manual_review_queue`, NO crea `pagos`
- Duplicado → detectado por hash, NO duplica
- **Ningún caso crea un pago con nombre placeholder** (si no hay nombre real → cola manual)

---

### 🧪 PRUEBA 5 — Cascada de API keys (resiliencia)
**Qué valida:** que si la key principal falla, pasa a fallback, y si esa falla, pasa a fallback2.

**Estado actual:** la columna `fallback2_key_encrypted` existe (migración 027) pero **hay que verificar en `server.ts` que `callGeminiGateway` realmente la use**. Sospecho que no — es parte del testeo confirmarlo y agregarlo si falta.

**Cómo funciona (tres sub-pruebas):**
1. Invalidar la principal (meter una key mala) → la siguiente llamada debe loguearse como error y reintentarse con fallback → éxito
2. Invalidar principal + fallback → debe usar fallback2 → éxito
3. Invalidar las tres → debe devolver error claro al cliente, no un crash

**Criterio de éxito:**
- Cada fallback debe aparecer en `ai_usage_log` con la key que usó (para debugging)
- La latencia total no debe superar 15 segundos (el reintento no bloquea)

---

### 🧪 PRUEBA 6 — Logging completo en `ai_usage_log`
**Qué valida:** que cada llamada (éxito o error) quede registrada con feature, tokens, latencia y, cuando aplica, el nombre extraído en `metadata`.

**Cómo funciona:**
- Al final de las pruebas 1-5, contar filas en `ai_usage_log` de las últimas 2 horas
- Debe haber ≥ 1 fila por llamada hecha

**Criterio de éxito:**
- Sin huecos: toda llamada dejó traza
- Los errores tienen `error_message` poblado
- El panel IA (`AiSettingsPanel.tsx`) muestra las llamadas correctamente en la sección "Log reciente"

**Por qué importa:** cuando un cliente diga "no me reconoció" semanas después, este log es la única forma de auditar qué pasó.

---

### 🧪 PRUEBA 7 — Idempotencia (regla de triangulación)
**Qué valida:** que si el mismo comprobante entra dos veces (ej: cliente reenvía la misma imagen), no se crea un segundo pago ni un segundo perfil.

**Cómo funciona:**
- Tomar caso 1 de Fixture A
- Llamar a `/api/ai/analyze-qr` dos veces con el mismo `waNumber`
- Verificar en `customers` que `wa_linked_at` no se sobreescribió (según la lógica actual de `fn_link_customer_wa`)

**Criterio de éxito:**
- Segunda llamada no crea un nuevo `customer`
- No sobreescribe un `wa_number` ya vinculado (regla clave de la función SQL)

---

## 6. Orden de Ejecución

```
1. Preparar Fixtures A, B, C (1 día — trabajo manual)
        ↓
2. Prueba 2 (clasificación) — FILTRA falsos positivos
        ↓
3. Prueba 1 (extracción QR) — la más larga, la más importante
        ↓
4. Prueba 3 (normalización) — en paralelo con 1
        ↓
5. Prueba 4 (notificaciones) — independiente
        ↓
6. Prueba 5 (cascada keys) — requiere keys alternativas de prueba
        ↓
7. Prueba 6 (logging) — se verifica al final
        ↓
8. Prueba 7 (idempotencia) — cierre
```

---

## 7. Entregables concretos

Al terminar el testeo debés tener:

1. **Carpeta `tests/fixtures/`** con las 30 imágenes/textos + sus JSON esperados
2. **Script `scripts/test-ai-receipts.mjs`** que corre todas las pruebas y escupe un reporte
3. **Reporte `docs/testeo-ia-YYYYMMDD.md`** con:
   - Tabla de aciertos/fallos por prueba
   - Casos donde la IA falló (para ajustar prompt)
   - Decisión: ¿el prompt actual sirve o hay que re-tunearlo?
4. **Fix de `fallback2`** en `callGeminiGateway` si resulta que no está cableado
5. **Ajustes de prompt** si alguna prueba no llega al umbral (solo si es necesario)

---

## 8. Qué hago si una prueba falla

No cambiar 10 cosas a la vez. Proceso:

1. **Identificar el tipo de fallo:**
   - ¿El prompt está mal? → ajustar texto del prompt
   - ¿El modelo no puede leer la imagen? → probar con `gemini-2.5-flash` en lugar de `flash-lite`
   - ¿Es un caso extremo (1 de 15)? → aceptar y documentar como limitación
2. **Cambiar UNA cosa**
3. **Re-correr solo esa prueba**
4. **Si pasa, re-correr todas** (verificar que no se rompió otra cosa)

---

## 9. Definición de "Listo"

El testeo está completo cuando:

- ✅ Prueba 1: `pagador` correcto en ≥ 90% de casos legibles
- ✅ Prueba 2: 0 falsos positivos (foto de ropa nunca es comprobante)
- ✅ Prueba 3: normalización 100% consistente
- ✅ Prueba 4: cascada completa funciona, 0 pagos con nombre placeholder
- ✅ Prueba 5: fallback2 cableado y funcionando
- ✅ Prueba 6: log completo en `ai_usage_log`
- ✅ Prueba 7: idempotencia respetada

Solo cuando los 7 pasan, podés arrancar la Etapa 1 de la triangulación con **confianza real** de que los datos que entran son limpios.

---

## 10. Tiempos estimados

| Tarea | Tiempo |
|---|---|
| Armar fixtures (juntar imágenes reales + escribir JSON esperados) | 3-4 horas |
| Script de test (una vez armada la estructura) | 2-3 horas |
| Correr las 7 pruebas + analizar resultados | 2 horas |
| Ajustes de prompt si hace falta (iterativo) | 1-3 horas |
| Fix de `fallback2` si no está cableado | 30 minutos |
| Redactar reporte de resultados | 1 hora |

**Total estimado: 1 día intenso o 2 días cómodos.**

---

## 11. Lo que queda habilitado después del testeo

Una vez que este plan pasa, tu IA está **lista para alimentar la triangulación**. Eso significa que cuando empieces el plan de perfiles:

- Cada nombre que llegue por comprobante ya está normalizado → matchea bien con `canonical_name`
- Ningún "pago fantasma" se cuela por mala clasificación de imagen
- El `fn_link_customer_wa` recibe datos confiables
- El panel de revisión manual (cuando lo hagas) tiene el `confianza` bien calibrado para decidir qué mandar a cola

---

---

# PARTE 3 — Resumen Ultra-Simple

Para explicárselo a alguien que no sabe nada de código:

> "Vamos a darle a la IA 30 ejercicios de examen (comprobantes, fotos, notificaciones). Cada ejercicio tiene una respuesta correcta escrita al lado. Corremos un programita que le hace todos los ejercicios a la IA y cuenta cuántos acertó. Si saca menos de 9 en cada prueba, cambiamos una cosa, le damos otra vuelta, y listo. Cuando todas las pruebas pasen, sabemos que la IA ya está lista para que empecemos a armar los perfiles de clientes sin miedo a que meta datos mal."

---

---

# PARTE 4 — Posibles Baches a Revisar

Antes de arrancar, revisá estos puntos y decidí:

1. **¿Tenés 15 comprobantes reales a mano** para poder armar el fixture? Si no, ¿podés pedir a amigos/familia que te reenvíen algunos viejos?

2. **¿Tenés una segunda API key de Gemini** para probar el fallback? Si no, hay que crear una gratis en Google AI Studio.

3. **Los comprobantes reales** — ¿están en tu celular, en el chat de WhatsApp, o dónde? Juntarlos puede ser lo que más tarde.

4. **¿El 90% de acierto te parece suficiente** o querés apuntar a 95%? (Subir el umbral = más tiempo de ajuste de prompt)

5. **Los falsos positivos** — ¿te parece bien la regla "0 falsos positivos en Prueba 2", aunque sea estricta?

---

## 📌 Conexión con el Siguiente Paso (Triangulación)

Cuando este plan se complete, queda habilitada la **Etapa 1 de la triangulación de perfiles**:

```
Testeo IA de Pagos (este documento)
        ↓
        ✅ Pasa
        ↓
Etapa 1: Diagnóstico de perfiles existentes
Etapa 2: Normalización universal (números y nombres)
Etapa 3: Los 4 "porteros" (WA, tienda, comprobante, notificación)
Etapa 4: Cola de revisión manual
Etapa 5: Buscador unificado
```

Cada comprobante que ingrese ya estará "limpio" y listo para alimentar el perfil único del cliente.

---

*Documento generado el 2026-04-24. Última actualización: versión final para revisión.*

---

---

# 📌 ACTUALIZACIÓN — 2026-04-24 (decisiones tomadas y setup ejecutado)

## Auditoría previa de la base de datos

Antes de arrancar, se auditaron los 87 pagos existentes para confirmar que no
hay datos corruptos:

```
Total pagos:                     87
Sin nombre (NULL/vacío):          0
Placeholders tipo "PAGO Yape":    0
Nombres cortos (≤3 chars):        0
Con números en nombre:            0
En cola manual sin procesar:      0
```

**Conclusión:** la base está limpia. Los pagos viejos sin nombre que existían
con la configuración anterior de MacroDroid ya no están (limpiados por
migraciones `010` y `012`). La regla actual de MacroDroid funciona bien.

## Decisiones tomadas

| # | Decisión | Motivo |
|---|---|---|
| 1 | Prompts movidos a `src/ai/prompts/` | Evitar mantener prompts en server.ts de 8000 líneas |
| 2 | `user_id` de prueba dedicado (no proyecto Supabase separado) | Suficiente para aislar, más simple |
| 3 | Regla MacroDroid se mantiene igual | Base limpia, regla actual funciona |
| 4 | Umbral de acierto: 95% (en vez de 90%) | Datos más confiables para la triangulación |

## Setup ejecutado

- ✅ `src/ai/prompts/` creado con 4 archivos:
  - `product-catalog.ts`
  - `image-classifier.ts`
  - `receipt-qr.ts`
  - `notification-parser.ts`
  - `index.ts` (barrel export)
  - `README.md` (docs del directorio)
- ✅ `server.ts` actualizado para importar prompts (typecheck limpio)
- ✅ Usuario de prueba creado en Supabase Auth:
  - email: `test-ai-fixtures@ventaslive.test`
  - ID guardado en `tests/test-user.json`
  - Safety check: imposible que coincida con el user real
- ✅ `tests/fixtures/` creado con estructura:
  - `receipts/` (esperando los 15 comprobantes)
  - `non-receipts/` (esperando las 5 fotos de ropa/otros)
  - `notifications/` con 4 ejemplos base (Yape directo, QR, spam, sin nombre)
- ✅ Auditoría `scripts/audit-pagos-corruptos.mjs` creada y ejecutada (0 corruptos)

## Siguientes pasos para vos

1. **Juntar 15 comprobantes reales** desde los chats de tus clientes
2. **Renombrarlos** `receipt_01.png`, `receipt_02.png`, etc.
3. **Copiarlos a** `tests/fixtures/receipts/`
4. **Crear el JSON esperado** de cada uno (ver `_EJEMPLO.json`)
5. **Juntar 5 fotos de no-comprobantes** (ropa, gato, screenshot de chat, etc.)
   en `tests/fixtures/non-receipts/`
6. **Cargar la segunda API key** de Gemini en el panel IA de la app
   (o en `.env` como `GEMINI_API_KEY_FALLBACK`)

Cuando termines, el siguiente paso es el **script de test** que corre las 7
pruebas automáticamente contra los fixtures.

