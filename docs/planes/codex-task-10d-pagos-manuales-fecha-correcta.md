# Pagos manuales: fecha correcta por dia

Lee primero los archivos indicados. No toques nada fuera de este flujo.

Objetivo:
- Cada pago manual debe quedar en la fecha elegida.
- No debe juntarse con los pagos de otro dia.

---

## Archivos a leer antes de empezar

- `src/App.tsx`
- `server.ts`

---

## CAMBIO 1 - Guardar la fecha elegida sin mezclarla con hoy

**Archivo:** `src/App.tsx`

Buscar exactamente esto:
```tsx
      // Convert date string to ISO format correctly to avoid timezone offsets
      const now = new Date();
      const [year, month, day] = date.split('-').map(Number);
      const selectedD = new Date(year, month - 1, day, 12, 0, 0);
      let finalDateStr = date;
      
      if (selectedD.toDateString() === now.toDateString()) {
        // If it's today, we can use the current time for better sorting
        finalDateStr = now.toISOString();
      } else {
        // For other days, we use noon to ensure it stays on the same day across timezones
        finalDateStr = selectedD.toISOString();
      }
```

Reemplazar con:
```tsx
      // Guardar siempre el dia exacto elegido en el formulario
      const [year, month, day] = date.split('-').map(Number);
      const selectedD = new Date(year, month - 1, day, 12, 0, 0);
      const finalDateStr = selectedD.toISOString();
```

---

## CAMBIO 2 - Verificar que el listado no vuelva a agrupar por error

**Archivo:** `src/App.tsx`

Buscar exactamente esto:
```tsx
      const pDate = parseAppDate(p.date);
      const dateKey = pDate ? pDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : 'SIN FECHA';
```

No cambiarlo si ya agrupa correctamente por el campo `date`. Solo confirmar que no usa otro campo que mezcle días.

---

## Verificacion

1. Crear un pago manual para hoy y otro para una fecha distinta.
2. Confirmar que quedan en grupos distintos.
3. Confirmar que editar un pago no le cambia el dia sin querer.
