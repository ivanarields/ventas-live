# Rellenar con IA: error JSON al leer producto

Lee primero los archivos indicados. No toques nada fuera de este flujo.

Objetivo:
- El boton `Rellenar con IA` no debe romperse por texto extra en la respuesta.
- Si la IA devuelve basura alrededor del JSON, el servidor debe limpiarla o devolver un error claro.

---

## Archivos a leer antes de empezar

- `src/components/AdminTiendaView.tsx`
- `src/routes/ai-gateway.ts`

---

## CAMBIO 1 - Hacer mas robusta la extraccion JSON del producto

**Archivo:** `src/routes/ai-gateway.ts`

Buscar exactamente esto:
```ts
      const m = result.text.match(/\{[\s\S]*\}/);
      if (!m) return res.status(422).json({ ok: false, error: 'Respuesta no parseable' });
      const parsed = JSON.parse(m[0]);
      res.json({ ok: true, data: parsed });
```

Reemplazar con:
```ts
      const cleanText = String(result.text ?? '').trim().replace(/```json|```/g, '');
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');
      if (firstBrace < 0 || lastBrace <= firstBrace) {
        return res.status(422).json({ ok: false, error: 'Respuesta no parseable' });
      }

      try {
        const parsed = JSON.parse(cleanText.slice(firstBrace, lastBrace + 1));
        res.json({ ok: true, data: parsed });
      } catch (parseErr: any) {
        return res.status(422).json({ ok: false, error: parseErr?.message || 'Respuesta no parseable' });
      }
```

---

## CAMBIO 2 - Mostrar el error real en la UI sin romper el formulario

**Archivo:** `src/components/AdminTiendaView.tsx`

Buscar exactamente esto:
```tsx
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setAiError(json.error || 'No se pudo analizar las imágenes.');
        setAiStatus('error');
        return;
      }
```

Reemplazar con:
```tsx
      const json = await res.json().catch(() => ({ ok: false, error: 'Respuesta inválida del servidor' }));

      if (!res.ok || !json.ok) {
        setAiError(json.error || 'No se pudo analizar las imágenes.');
        setAiStatus('error');
        return;
      }
```

---

## Verificacion

1. Subir 3 fotos y tocar `Rellenar con IA`.
2. Confirmar que ya no rompe con error JSON crudo.
3. Confirmar que, si falla, el mensaje es legible y el formulario sigue vivo.
