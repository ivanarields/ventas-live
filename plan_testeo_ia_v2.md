# 📋 Plan Completo v2 — IA + Perfil de Cliente
## Ventas Live · Abril 2026 · Modo Análisis

---

# BLOQUE 1 — Plan de Testeo Actualizado

## Correcciones de la imagen anotada

### ✅ Riesgo 3 eliminado
El riesgo de "comprobantes con texto pequeño" **NO aplica**.
Los clientes envían screenshots digitales (no fotos de pantalla), por lo que la resolución siempre es suficiente para Gemini. **Este riesgo se elimina del plan.**

### ✅ 2do Fallback Key — Agregar después de las pruebas
El gateway actual soporta 1 fallback. Implementar 2do fallback (3 keys rotando) es trabajo de ~5 minutos después de confirmar que las pruebas pasan. Ninguna limitación técnica lo impide.

---

## Observación clave de la imagen: PROMPT UNIFICADO DE IMAGEN

### Problema detectado
Actualmente existen DOS prompts separados para imágenes:
1. **Catalogar producto** → identifica ropa para agregar a la tienda
2. **Análisis de fotos en WhatsApp** → identifica si es ropa o comprobante

El usuario pide **unificar** estos en un solo prompt inteligente que haga las tres cosas:

| Escenario | Qué debe detectar |
|---|---|
| Cliente envía foto de ropa por WhatsApp | "Esto es lo que quiero comprar" → qué prenda eligió |
| Operador agrega producto a la tienda | Nombre, categoría, color, talla |
| Cliente envía comprobante de pago | Nombre del pagador, monto, banco |

### Propuesta de Prompt Unificado
```
Analiza esta imagen y clasifícala en UNA de estas 3 categorías:

A) COMPROBANTE_PAGO: Si es screenshot de Yape, transferencia bancaria, QR pagado.
   Extrae: {"tipo":"COMPROBANTE_PAGO","pagador":"NOMBRE EXACTO","monto":número,"banco":"Yape|BancoUnion|etc"}

B) PRENDA_ROPA: Si es foto de una prenda de vestir.
   Extrae: {"tipo":"PRENDA_ROPA","nombre":"2-3 palabras","color":"color principal",
            "categoria":"Blusas|Pantalones|Vestidos|Chaquetas|etc","talla":"si visible"}

C) OTRO: Cualquier otra cosa.
   Extrae: {"tipo":"OTRO","descripcion":"breve descripción"}

Responde SOLO con JSON válido. Sin explicaciones.
```

**Ventaja:** Un solo endpoint de IA maneja catalogado, selección de producto por WhatsApp, Y comprobantes.

---

## Observación de la imagen: PROMPT ESPECIALIZADO DE QR

El usuario quiere un prompt completo **dedicado exclusivamente a comprobantes QR** que extraiga:
- **Nombre del pagador** (quién pagó)
- **Nombre del propietario** (a quién le pagaron — puede ser el nombre de la tienda o la dueña)
- Monto, banco, fecha/hora si está visible

### Propuesta de Prompt QR Especializado
```
Eres un extractor de datos de comprobantes de pago bolivianos.
Analiza este comprobante (Yape, QR bancario, transferencia) y extrae EXACTAMENTE:

{
  "es_comprobante": true/false,
  "pagador": "NOMBRE COMPLETO del que pagó (como aparece en el comprobante)",
  "receptor": "NOMBRE del que recibió el pago (nombre de la tienda o persona)",
  "monto": número,
  "moneda": "BOB|USD",
  "banco_app": "Yape|BancoUnion|BCP|Tigo Money|etc",
  "fecha": "YYYY-MM-DD si es visible",
  "hora": "HH:MM si es visible",
  "nro_operacion": "número de operación si existe"
}

Si un campo no es visible con certeza, usar null.
NUNCA inventar datos. Si la imagen no es un comprobante, "es_comprobante": false y el resto null.
```

**Nuevo campo importante: `receptor`** — esto permite identificar si el pago es para ChehiApp (la operadora) o para otra persona.

---

## Pruebas Actualizadas

### PRUEBA 1 — Catalogar Producto con Prompt Unificado
**Estado anterior:** ✅ Pasó con prompt separado
**Nuevo objetivo:** Verificar que el PROMPT UNIFICADO también cataloga correctamente

Casos:
- Foto de chaqueta → `{"tipo":"PRENDA_ROPA","nombre":"Chaqueta Jean","color":"Azul"...}`
- Foto de blusa → identifica como prenda
- Screenshot de Yape → `{"tipo":"COMPROBANTE_PAGO","pagador":"JUAN PEREZ"...}`
- Foto de gato → `{"tipo":"OTRO",...}`

### PRUEBA 2 — Resumen WhatsApp solo texto
**Sin cambios respecto al plan original**

### PRUEBA 3 — Transcripción Audio WhatsApp
**Sin cambios. Requiere WhatsApp conectado.**

### PRUEBA 4 — Comprobante QR con Prompt Especializado
**Actualización:** Usar el nuevo Prompt QR Especializado que también extrae `receptor` y `nro_operacion`

Verificar:
- `pagador` → nombre real del cliente que paga
- `receptor` → nombre del negocio (confirmar que es ChehiApp)
- `monto` → coincide con lo visible en el comprobante
- `es_comprobante: false` cuando se envía foto de ropa

### PRUEBA 5 — Parser Notificaciones
**Estado:** ✅ Ya pasó (3/4 casos correctos, 1 correcto a manual_review)

### PRUEBA 6 (NUEVA) — Fotografías seleccionadas por el cliente
**¿Qué prueba?** Que cuando un cliente envía varias fotos de ropa por WhatsApp, el resumen identifica cuáles prendas eligió.

Flujo:
1. Cliente envía 3 fotos de blusas distintas por WhatsApp
2. Hace click en "Actualizar resumen"
3. El resumen debe indicar: "El cliente seleccionó: Blusa rosa M, Vestido negro talla L"

Requiere: WhatsApp conectado + nuevo prompt unificado implementado

---

## Checklist Actualizado

```
□ Implementar Prompt Unificado de Imagen (reemplaza los 2 actuales)
□ Implementar Prompt QR Especializado (nuevo endpoint o parámetro)
□ Implementar 2do fallback key en el gateway
□ PRUEBA 1  — Catalogar prenda con prompt unificado
□ PRUEBA 1b — Comprobante con prompt unificado → clasifica correctamente
□ PRUEBA 2  — Resumen WhatsApp texto
□ PRUEBA 3  — Audio WhatsApp (requiere WA conectado)
□ PRUEBA 4  — QR con prompt especializado → extrae pagador + receptor
□ PRUEBA 4b — Foto de ropa → es_comprobante: false
□ PRUEBA 5  — Parser notificaciones (ya validado)
□ PRUEBA 6  — Fotos seleccionadas por cliente (requiere WA conectado)
□ Verificar log en panel IA — todas las pruebas registradas
```

---

# BLOQUE 2 — Sistema de Perfil de Cliente

## Diagnóstico actual: 4 puertas de entrada, 2 bases de datos distintas

```
┌─────────────────────────────────────────────────────────┐
│                  CLIENTE REAL                           │
│                 (una sola persona)                      │
└───────┬──────────┬───────────┬────────────┬─────────────┘
        │          │           │            │
   PUERTA 1    PUERTA 2    PUERTA 3     PUERTA 4
   Pago en     Tienda      WhatsApp     MacroDroid
   App         Online      Panel        (Notif. banco)
        │          │           │            │
        ▼          ▼           ▼            ▼
  tabla:        tabla:      tabla:       tabla:
  customers   store_cust  panel_clie    pagos
  (ChehiApp)  (TiendaDB)   ntes        (ChehiApp)
        │          │           │            │
        ▼          ▼           ▼            ▼
  Tiene:        Tiene:      Tiene:       Tiene:
  nombre        número WA   número WA    nombre
  label         email       pedido IA    monto
  pedidos       historial   fotos        fecha
```

### El problema: los 4 sistemas NO se hablan entre sí
Un mismo cliente "MARIA GARCIA" puede existir 4 veces en 4 tablas distintas sin ninguna conexión.

---

## Campos actuales por tabla

### Tabla `customers` (ChehiApp — Supabase principal)
```sql
id              BIGSERIAL
full_name       TEXT          -- nombre completo
normalized_name TEXT          -- nombre normalizado para búsqueda
canonical_name  TEXT          -- nombre canónico uppercase
phone           TEXT          -- número de WhatsApp (FRECUENTEMENTE VACÍO)
active_label    TEXT          -- casillero asignado (A, B, 1, 2...)
active_label_type TEXT
user_id         TEXT          -- propietario del negocio
is_active       BOOLEAN
```
❌ **Campo `phone` frecuentemente vacío** — es el eslabón perdido para la triangulación.

### Tabla `store_customers` (TiendaOnline — Supabase Store)
```sql
id              BIGSERIAL
whatsapp        TEXT          -- número WA (SIEMPRE tiene número)
display_name    TEXT          -- nombre (a veces vacío)
pin_hash        TEXT
total_orders    INT
total_spent     NUMERIC
```
✅ Siempre tiene número. ❌ A veces no tiene nombre real.

### Tabla `panel_clientes` (Supabase Panel WhatsApp)
```sql
id              TEXT          -- número WA como ID
phone           TEXT          -- número WA (SIEMPRE tiene número)
last_interaction TIMESTAMPTZ
resumen         TEXT          -- último resumen IA en JSON
resumen_at      TIMESTAMPTZ
estado          TEXT
```
✅ Siempre tiene número. ✅ Tiene historial de conversación con IA. ❌ No tiene nombre.

### Tabla `pagos` (ChehiApp — Supabase principal)
```sql
id              TEXT
nombre          TEXT          -- nombre del pagador
pago            NUMERIC
date            TIMESTAMPTZ
user_id         TEXT
customer_id     BIGINT        -- FK a customers (A VECES vacío)
```
✅ Siempre tiene nombre. ❌ `customer_id` no siempre se llena.

---

## Cuántos clientes puedes almacenar

**Supabase Free Tier:**
- Filas ilimitadas (no hay límite de filas)
- Base de datos: 500 MB de almacenamiento gratis
- 1 fila de `customers` ≈ ~500 bytes → **puedes almacenar ~1 millón de clientes gratis**
- En la práctica: para un negocio de ropa live, nunca superarás 10,000 clientes → **sin restricciones prácticas**

---

## Cómo debería funcionar la triangulación

### Escenario 1: Cliente paga por la app (puerta 1)
```
Llega pago → se crea/actualiza registro en customers
→ Tiene: nombre ✅ | WA ❌ | casillero ✅
→ Falta: vincular número de WhatsApp
```

### Escenario 2: Cliente compra en tienda online (puerta 2)
```
Se registra con WA → store_customers
→ Tiene: número WA ✅ | nombre (si lo puso) | historial de compras ✅
→ Falta: vincularlo al perfil en customers (ChehiApp)
```

### Escenario 3: Cliente escribe por WhatsApp (puerta 3)
```
Mensaje llega → se crea panel_clientes con número
→ IA resume conversación → puede extraer qué quiere comprar
→ Falta: vincular ese número al nombre en customers
```

### Escenario 4: Notificación bancaria (puerta 4)
```
Llega notificación → parser extrae nombre → se crea en pagos + customers
→ Tiene: nombre ✅ | WA ❌
→ Falta: vincular número de WA
```

---

## El rol de la IA en la triangulación

La IA ayuda en UN momento específico:

**En el resumen de WhatsApp** → cuando el cliente envía un comprobante:
- El nuevo Prompt QR extrae: `pagador: "MARIA GARCIA"`, `monto: 120`
- El sistema busca en `customers` si existe alguien con `canonical_name = "MARIA GARCIA"`
- Si hay match → **vincula automáticamente** el número de WhatsApp a ese perfil
- Si no hay match → crea perfil nuevo con nombre + número

**Esta es la triangulación real:**
```
comprobante (nombre + monto) + número WA del remitente = perfil completo
```

---

## Propuesta: Perfil Unificado de Cliente

### Campos recomendados para agregar a `customers`

```sql
-- Campos a agregar a la tabla customers existente:
wa_number       TEXT          -- número WhatsApp (puente con panel y tienda)
wa_linked_at    TIMESTAMPTZ   -- cuándo se vinculó el WA
store_customer_id BIGINT      -- FK a store_customers (si compró en tienda)
source          TEXT          -- 'manual'|'pago'|'tienda'|'whatsapp'|'notif'
last_payment_at TIMESTAMPTZ   -- último pago registrado
total_payments  INT           -- cantidad de pagos históricos
total_spent     NUMERIC       -- total gastado (suma histórica)
notes           TEXT          -- notas del operador
tags            TEXT[]        -- etiquetas (ej: ['cliente_frecuente','vip'])
```

### Lógica de vinculación automática (propuesta)

```
Cuando llega comprobante por WhatsApp:
  1. Extraer nombre del pagador (Prompt QR)
  2. Buscar en customers por canonical_name (fuzzy match)
  3a. Si match con confianza > 80%:
      → UPDATE customers SET wa_number = [número_WA] WHERE id = [match_id]
      → Perfil vinculado automáticamente ✅
  3b. Si no hay match o confianza baja:
      → Crear nuevo customers con nombre + wa_number
      → Marcar para revisión del operador
  4. Guardar pago con customer_id correctamente lleno
```

---

## Prioridades para implementar (en orden)

| Prioridad | Qué implementar | Impacto |
|---|---|---|
| 🔴 **1** | Agregar `wa_number` a tabla `customers` | Permite triangulación básica |
| 🔴 **2** | Lógica de vinculación al recibir comprobante por WA | Crea perfil automáticamente |
| 🟡 **3** | Prompt QR especializado con campo `pagador` | Mejora la extracción |
| 🟡 **4** | Prompt unificado de imagen | Simplifica el código |
| 🟢 **5** | Vista de perfil de cliente con historial completo | UX del operador |
| 🟢 **6** | 2do fallback key en el gateway | Resiliencia |
| ⚪ **7** | FK entre `store_customers` y `customers` | Unificación total |

---

## Lo que NO necesita la IA para la triangulación

La IA **no es necesaria** para buscar si el cliente ya existe — eso lo hace una búsqueda por `canonical_name` en PostgreSQL (coincidencia exacta o fuzzy con `pg_trgm`).

La IA **sí es necesaria** para:
- Extraer el nombre del comprobante (cuando viene de imagen)
- Extraer el nombre de la notificación bancaria (cuando el regex no alcanza)
- Resumir la conversación para saber qué prenda quiere el cliente

---

## Resumen ejecutivo del Bloque 2

```
HOY:
  - 4 tablas separadas, mismos clientes duplicados sin conexión
  - customers tiene nombre pero pocas veces tiene número WA
  - El perfil del cliente está incompleto al nacer

PROPUESTA:
  - Agregar wa_number a customers
  - Cuando llega comprobante por WA → vincular automáticamente nombre + número
  - 1 perfil unificado = nombre + WA + casillero + historial de pagos + pedidos

CAPACIDAD:
  - Sin límite práctico en Supabase (1M+ filas gratis)
  - Para tu escala: 0-10,000 clientes → sin ninguna restricción
```

> **Próximo paso sugerido:** Aprobar este plan → implementar `wa_number` en `customers` + lógica de vinculación → luego los prompts actualizados.
