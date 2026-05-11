# Plantilla — Documento de tarea para la IA ejecutora

Copiá esta plantilla y completá cada sección.
El documento tiene que ser autocontenido: la IA ejecutora no puede preguntar nada.

---

## Cómo usar esta plantilla

1. Copiá el contenido de abajo
2. Guardalo en `docs/planes/codex-task-XX-nombre.md`
3. Completá cada sección con información real del código
4. Borrá las instrucciones entre corchetes `[así]`
5. Dale el comando al usuario para ejecutarlo

Comando a darle al usuario:
```
codex --full-auto "lee docs/planes/[nombre-del-archivo].md y ejecuta exactamente los cambios descritos ahí, sin hacer nada más"
```

---

# PLANTILLA (copiar desde aquí)

---

# [Título descriptivo de la tarea]

Lee los archivos mencionados antes de tocar cualquier cosa.
Aplicá los cambios en orden. No hagas nada que no esté escrito aquí.

---

## Archivos a leer antes de empezar

- `[ruta/archivo1.tsx]` — [por qué leerlo]
- `[ruta/archivo2.ts]` — [por qué leerlo]

---

## CAMBIO 1 — [Descripción en una línea]

**Archivo:** `[ruta/archivo.tsx]`

**Por qué:** [explicación breve de por qué se hace este cambio]

Buscar exactamente esto:
```[lenguaje]
[código exacto a reemplazar — copiado del archivo real]
```

Reemplazar con:
```[lenguaje]
[código nuevo exacto]
```

---

## CAMBIO 2 — [Descripción en una línea]

**Archivo:** `[ruta/archivo.ts]`

**Por qué:** [explicación breve]

Buscar exactamente esto:
```[lenguaje]
[código exacto]
```

Reemplazar con:
```[lenguaje]
[código nuevo]
```

---

[Repetir para cada cambio adicional]

---

## Verificación — Hacer después de todos los cambios

Leer cada archivo modificado y confirmar punto por punto:

1. Abrir `[archivo1]` y buscar `[texto que debe estar]`. Debe aparecer.
2. Abrir `[archivo1]` y buscar `[texto que fue eliminado]`. No debe aparecer.
3. Abrir `[archivo2]` y confirmar que `[función o lógica]` hace [lo que debe hacer].
4. [Continuar para cada cambio]

Si algo no quedó correcto, escribir el problema en `docs/planes/[nombre-hallazgos].md`.

---

# NOTAS PARA COMPLETAR LA PLANTILLA

### Sobre el "código exacto a reemplazar"

- Copiarlo del archivo real, no inventarlo
- Incluir suficiente contexto (2-4 líneas antes y después) para que sea único en el archivo
- Si el texto aparece más de una vez en el archivo, incluir más contexto para diferenciarlo

### Sobre la sección de verificación

- Siempre pedir que se RE-LEA el archivo después del cambio
- Verificar tanto que el código nuevo esté, como que el código viejo no esté
- Para cambios de lógica, verificar que los dos extremos conectan (ej: el frontend llama el mismo endpoint que tiene el servidor)

### Sobre cuándo agregar una sección de investigación

Si no sabés exactamente cuál es el bug (por ejemplo: favoritos que no guardan), agregar una sección así:

```markdown
## INVESTIGACIÓN — [Problema a investigar]

Antes de hacer cambios, leer estos archivos y seguir el flujo:

1. Leer `[archivo A]` — buscar dónde se llama `[función]`
2. Leer `[archivo B]` — verificar que recibe los datos correctamente
3. Leer `[archivo C]` — confirmar que guarda en la base de datos

Posibles causas:
- [causa A]: verificar si `[condición]` es verdadera
- [causa B]: verificar si `[otra condición]` ocurre

Según lo que encuentres, aplicar el fix correspondiente.
Si no encontrás la causa, escribirla en `docs/planes/hallazgos.md` y no hacer cambios.
```

### Sobre cuándo dividir en dos documentos

Dividir en `06a` y `06b` si:
- Hay más de 6 cambios
- Algún cambio depende de investigar algo primero
- Los cambios tocan partes muy distintas

El documento A va primero. El B solo se ejecuta después de verificar el A.
