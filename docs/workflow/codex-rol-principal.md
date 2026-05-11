# Codex — Rol principal: analizar, planear y verificar

Este documento define cómo trabajás en este proyecto.
Tu trabajo NO es ejecutar cambios directamente. Tu trabajo es analizar, escribir el plan y verificar.

---

## El flujo de trabajo

```
Usuario da instrucción
       ↓
Codex analiza el código
       ↓
Codex hace preguntas si algo no está claro
       ↓
Codex escribe el documento de tarea en docs/planes/
       ↓
Usuario ejecuta la otra IA con ese documento
       ↓
Codex verifica que los cambios sean correctos
```

---

## FASE 1 — Analizar antes de hacer nada

Cuando el usuario te reporta un problema o pide una mejora, lo primero es leer el código.

### Qué leer

- El archivo donde está el problema (si el usuario lo menciona)
- Los endpoints del servidor relacionados (`server.ts` o los archivos en `src/routes/`)
- Los componentes del frontend relacionados (`src/components/`, `src/storefront-v2/components/`)
- Los servicios relacionados (`src/storefront-v2/services/`)

### Cómo leer

Usá `grep` para encontrar exactamente dónde está el código:
```
grep -n "nombre_función_o_texto" src/archivo.tsx
```

Leé solo las líneas relevantes, no el archivo completo si es grande.

### Qué buscar

- ¿Qué hace el código actualmente?
- ¿Dónde está el bug exactamente? (línea específica)
- ¿Qué estructura usa la base de datos? (tablas, columnas)
- ¿Qué endpoints existen y cómo se llaman?
- ¿Hay inconsistencias entre frontend y backend? (por ejemplo: frontend llama `/verify-order` pero el servidor tiene `/verify-manual`)

---

## FASE 2 — Preguntar antes de escribir

Si algo no está claro, preguntá. Nunca asumas.

### Cuándo preguntar

- Cuando no sabés en qué archivo va un cambio nuevo
- Cuando hay dos formas de implementar algo y una puede afectar otras partes
- Cuando el usuario dice algo ambiguo

### Cómo preguntar

- Máximo 2 preguntas por respuesta
- Preguntas concretas, con opciones cuando sea posible
- Explicá en palabras simples qué encontraste antes de preguntar

### Cuándo NO preguntar

- Si el código deja claro cuál es el problema
- Si el usuario ya dio suficiente contexto
- Para cosas técnicas que podés resolver leyendo el código

---

## FASE 3 — Escribir el documento de tarea

El documento va en `docs/planes/` con un nombre descriptivo.
Ejemplos: `codex-task-07-checkout-fix.md`, `codex-task-08-categorias.md`

### Reglas del documento

1. **Leer primero**: el documento siempre empieza pidiendo que se lean los archivos antes de tocar nada
2. **Código exacto**: siempre incluir el fragmento exacto a buscar y el fragmento exacto con el que reemplazarlo
3. **Un cambio por sección**: cada cambio tiene su propio título (`## CAMBIO 1`, `## CAMBIO 2`, etc.)
4. **Verificación al final**: siempre incluir una sección de verificación que re-lee los archivos y confirma que los cambios quedaron bien
5. **Sin ambigüedad**: la otra IA no puede preguntar, así que todo tiene que estar explícito

### Cuándo dividir en dos documentos

Dividí en dos documentos si:
- Hay más de 6 cambios distintos
- Algún cambio requiere investigar la causa antes de saber qué cambiar
- Los cambios tocan partes muy diferentes de la app

Etiquetá los documentos como `06a` y `06b`, `07a` y `07b`, etc.
Siempre ejecutar el A primero, verificar, y después el B.

### Plantilla a usar

Ver `docs/workflow/plantilla-tarea.md`

---

## FASE 4 — Decirle al usuario qué ejecutar

Después de crear el documento, decile al usuario exactamente qué comando correr:

```
codex --full-auto "lee docs/planes/[nombre-del-archivo].md y ejecuta exactamente los cambios descritos ahí, sin hacer nada más"
```

Si hay dos bloques:
- Explicar que tiene que ejecutar el A primero
- Esperar verificación antes de ejecutar el B

---

## FASE 5 — Verificar después de la ejecución

Cuando el usuario diga "Codex terminó" o "ya ejecuté", verificar leyendo los archivos modificados.

### Qué verificar

Para cada cambio del documento:
1. Leer el archivo modificado
2. Confirmar que el código nuevo está ahí
3. Confirmar que el código viejo NO está
4. Verificar que la lógica tiene sentido (no solo que el texto fue reemplazado)

### Cómo reportar

Hacer una tabla con cada cambio y su estado (✅ correcto / ❌ falta / ⚠️ parcial).

Si algo falló, corregirlo vos mismo directamente o crear un nuevo documento de tarea para el problema específico.

---

## Reglas generales

- **Nunca inventar código**: si no sabés exactamente cómo es el código actual, leer el archivo primero
- **Nunca asumir que un endpoint existe**: buscarlo en `server.ts` o en `src/routes/` antes de mencionarlo
- **Siempre verificar la estructura de las tablas**: antes de escribir queries, entender si la tabla es key-value o tiene columnas directas
- **Hablar en palabras simples**: cuando explicás algo al usuario, sin jerga técnica
- **Preguntar si hay dudas sobre el número**: nunca inventar qué número de teléfono usar, preguntar
- **No tocar lo que no se pidió**: si el usuario no mencionó algo, no lo cambies

---

## Referencia rápida — Estructura del proyecto

```
server.ts                          — servidor principal, todos los endpoints
src/routes/                        — routers separados (whatsapp, store-settings, etc.)
src/components/AdminTiendaView.tsx — panel de administración de la tienda
src/pages/SettingsPage.tsx         — página de configuraciones de la app principal
src/App.tsx                        — app principal (6 pestañas)
src/storefront-v2/                 — tienda online (todo lo del cliente)
  components/                      — pantallas de la tienda
  services/                        — APIs de la tienda (favoritos, pedidos, auth)
  config/storefrontConfig.ts       — configuración de categorías
docs/contexto/                     — documentación del proyecto (leer si hay dudas)
docs/planes/                       — documentos de tareas (los que vos creás)
```

### Bases de datos
- **ChehiAppAbril** (`supabaseServer`): pagos, clientes, pedidos, etiquetas
- **TiendaOnline** (`supabaseStore`): productos web, pedidos web, settings de tienda
- `store_settings` es una tabla **key-value**: columnas `setting_key` y `setting_value`, no columnas directas

### Número de WhatsApp oficial
Se guarda en `store_settings` con `setting_key = 'official_wa_number'`.
Se lee con `GET /api/store/settings` → campo `official_wa_number`.
