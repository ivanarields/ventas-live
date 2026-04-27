# Análisis completo del error: Dos perfiles duplicados en el Sistema Pulpo

**Fecha:** 2026-04-27  
**Detectado por:** Ivan Ariel (captura: mentira.png)  
**Severidad:** Media — no afecta pagos ni pedidos, afecta integridad de identidad

---

## El problema en una línea

El Sistema Pulpo no puede unir automáticamente dos perfiles cuando uno tiene **nombre pero no teléfono** y el otro tiene **teléfono pero no nombre** — porque no hay ningún dato en común para conectarlos.

---

## Cronología exacta de lo que pasó

### Abr 20 — Primera notificación MacroDroid

MacroDroid detecta un pago de Bs 1 desde "IVAN ARIEL DIAZ SANCHEZ". La función `ingest-notification` busca en `identity_profiles` si ya existe alguien con ese nombre normalizado. No existe nadie. Crea:

```
Perfil A
  display_name: "IVAN ARIEL DIAZ SANCHEZ"
  phone: null
  panel_phone: null
  evidencia: MacroDroid Bs 1
```

Hasta aquí todo correcto.

---

### Abr 23 — Pedido desde la tienda online

Ivan Ariel entra a la tienda con el teléfono +59172698959. El sistema de la tienda solo sabe su número de teléfono, no su nombre. La función `sync-store` (o el conector de tienda) crea:

```
Perfil B
  display_name: ""  ← VACÍO, la tienda solo tiene teléfono
  phone: +59172698959
  panel_phone: +59172698959
  evidencia: Tienda Bs 45
```

En este momento existen dos perfiles. **No hay ningún dato en común entre ellos.** El sistema no puede saber que son la misma persona porque uno tiene solo nombre y el otro solo teléfono.

---

### Abr 26 — Segunda notificación MacroDroid (Bs 2)

MacroDroid vuelve a detectar un pago de "IVAN ARIEL DIAZ SANCHEZ". La función busca por nombre en todos los perfiles. Encuentra el Perfil A (nombre exacto = "IVAN ARIEL DIAZ SANCHEZ"). Lo usa correctamente. Agrega la evidencia al Perfil A.

```
Perfil A
  display_name: "IVAN ARIEL DIAZ SANCHEZ"
  evidencia: MacroDroid Bs 1 + MacroDroid Bs 2  ← acumulando correctamente
```

Esta parte funcionó bien. El error no estaba aquí.

---

### Abr 26 — Primera conversación por WhatsApp

El conector de WhatsApp registra el contacto del número +59172698959. Como ya existe el Perfil B con ese teléfono, agrega la evidencia de WhatsApp al Perfil B. El `display_name` sigue vacío porque el cliente todavía no mandó ningún comprobante.

```
Perfil B
  display_name: ""  ← sigue vacío
  phone: +59172698959
  evidencia: Tienda Bs 45 + WhatsApp contacto
```

---

### Abr 27 — Se analiza el comprobante

Llega el comprobante de Ivan Ariel. `summarize-conversation` extrae el nombre "IVAN ARIEL DIAZ SANCHEZ" y el teléfono "59172698959". Llama a `findOrCreateProfile`. El orden que sigue esa función es:

```
1. ¿Hay un perfil con phone = +59172698959?
   → SÍ → Perfil B encontrado → PARA ACÁ, devuelve el Perfil B
   → NUNCA llega al paso de buscar por nombre
```

Entonces actualiza el `display_name` del Perfil B a "IVAN ARIEL DIAZ SANCHEZ". Resultado:

```
Perfil A: "IVAN ARIEL DIAZ SANCHEZ" | sin teléfono | MacroDroid
Perfil B: "IVAN ARIEL DIAZ SANCHEZ" | +59172698959 | WhatsApp + Tienda
```

**Dos perfiles con el mismo nombre. El código nunca verificó si ya había un perfil con ese nombre antes de asignar el nombre al Perfil B.**

---

## Por qué el sistema no lo evitó

Hay tres funciones involucradas. Ninguna de las tres tiene esta verificación:

### `findOrCreateProfile` (identityService.ts)
Cuando encuentra por teléfono, para inmediatamente. No compara el nombre recién extraído contra todos los perfiles existentes para detectar duplicados.

### `ingest-notification` (edge function de Supabase)
Busca por nombre. Encuentra el Perfil A correctamente. No sabe que el Perfil B también va a tener ese nombre en el futuro.

### `summarize-conversation` (ai-gateway.ts)
Asignó el nombre al Perfil B después de encontrarlo por teléfono. No verificó si ya existía otro perfil con ese nombre para fusionarlos automáticamente.

---

## Todos los escenarios posibles

### Escenario 1 — Lo que pasó (tienda/WhatsApp antes del comprobante)
El cliente hace un pedido en tienda o escribe por WhatsApp **antes** de mandar un comprobante. Se crea un perfil con teléfono y sin nombre. Cuando llega la notificación MacroDroid con el nombre, va a un perfil diferente. Resultado: dos perfiles separados para la misma persona.

**Frecuencia:** Cualquier cliente que interactuó antes de que se implementara el sistema de análisis de comprobantes.

### Escenario 2 — Comprobante llega antes que todo lo demás (FUNCIONA BIEN)
El cliente manda el comprobante y el sistema lo analiza antes de que exista ningún perfil. `findOrCreateProfile` no encuentra nada por teléfono ni por nombre → crea un perfil nuevo con nombre + teléfono. Cuando después llegue MacroDroid con el mismo nombre, lo encuentra y lo usa. Un solo perfil.

### Escenario 3 — Solo MacroDroid, nunca WhatsApp (FUNCIONA BIEN)
El cliente paga por transferencia pero nunca escribe por WhatsApp. Se crea un perfil con nombre, sin teléfono. Confianza baja porque solo tiene un canal. Funciona correctamente para lo que necesita.

### Escenario 4 — Cliente nuevo que llega después del fix de Abr 27 (SIGUE FALLANDO)
`summarize-conversation` ahora asigna el nombre al perfil del teléfono. Pero el bug de auto-merge sigue presente: si ya existe un perfil con ese nombre (por MacroDroid previo), quedan dos perfiles con el mismo nombre. **Este escenario sigue sin estar resuelto.**

---

## Consecuencias reales de este error

| Área | Impacto |
|---|---|
| Pagos registrados | ✅ Sin impacto — los pagos se guardaron correctamente en `pagos` |
| Pedidos creados | ✅ Sin impacto — los pedidos se crearon correctamente |
| Dinero contabilizado | ✅ Sin impacto — los montos están bien |
| Panel de identidad | ❌ Muestra dos tarjetas para la misma persona |
| Confianza del perfil | ❌ Ambos perfiles tienen confianza baja/incompleta por estar divididos |
| Fotos de WhatsApp en perfil | ❌ No se pueden mostrar porque el `panel_phone` estaba en el perfil equivocado |

---

## Estado actual de los perfiles de Ivan Ariel

```
Perfil A (e5e4770a):
  nombre:    IVAN ARIEL DIAZ SANCHEZ
  teléfono:  null
  canales:   MacroDroid
  evidencia: 2 pagos (Bs 2 + Bs 1)
  confianza: 45% (baja)

Perfil B (72bec13b):
  nombre:    IVAN ARIEL DIAZ SANCHEZ  ← asignado el 27 abr
  teléfono:  +59172698959
  canales:   WhatsApp + Tienda
  evidencia: 3 eventos WhatsApp + Tienda Bs 45
  confianza: 85%
```

**Solución inmediata:** fusionar Perfil A dentro de Perfil B. El Perfil B es el más completo (tiene teléfono). La evidencia MacroDroid de A pasa a B. El Perfil A se elimina.

---

## Qué hace falta para que nunca vuelva a pasar

Una sola verificación en `summarize-conversation` (ai-gateway.ts):

> Después de asignar el nombre a un perfil encontrado por teléfono, buscar si existe **otro perfil diferente** con ese mismo nombre. Si existe, fusionarlos automáticamente: mover toda la evidencia del perfil sin teléfono al perfil con teléfono y eliminar el duplicado.

Esta verificación nunca se implementó porque el caso de uso (perfil con teléfono sin nombre + perfil con nombre sin teléfono = misma persona) no se anticipó en el diseño original.

---

## Archivos involucrados

| Archivo | Rol en el error |
|---|---|
| `supabase/functions/ingest-notification/index.ts` | Crea Perfil A por nombre, no sabe del Perfil B |
| `src/services/identityService.ts` → `findOrCreateProfile` | Encuentra por teléfono y para, no busca duplicados por nombre |
| `src/routes/ai-gateway.ts` → `summarize-conversation` | Asignó nombre al Perfil B sin verificar si existía otro Perfil A con ese nombre |
