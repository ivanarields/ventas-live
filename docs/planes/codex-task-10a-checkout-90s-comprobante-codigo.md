# Checkout 90s, expiracion y comprobante con codigo

Lee primero los archivos indicados. No toques nada fuera de este flujo.

Objetivo:
- La pantalla de pago debe durar 1 minuto y medio.
- Al terminar el tiempo, el pedido debe cancelarse y el producto debe volver a estar disponible.
- El comprobante de WhatsApp debe llegar con codigo de pedido para entrar a revision manual.

---

## Archivos a leer antes de empezar

- `src/storefront-v2/components/Checkout.tsx`
- `server.ts`

---

## CAMBIO 1 - Subir el tiempo de pago a 90 segundos

**Archivo:** `src/storefront-v2/components/Checkout.tsx`

Buscar exactamente esto:
```tsx
const PAYMENT_SECONDS = 60; // 1 minuto
```

Reemplazar con:
```tsx
const PAYMENT_SECONDS = 90; // 1 minuto y medio
```

Buscar exactamente esto:
```tsx
        const next = e + 1;
        if (next >= 60 && !waNudge) setWaNudge(true);
```

Reemplazar con:
```tsx
        const next = e + 1;
        if (next >= 90 && !waNudge) setWaNudge(true);
```

---

## CAMBIO 2 - Reserva de tienda en 90 segundos

**Archivo:** `server.ts`

Buscar exactamente esto:
```ts
      const RESERVATION_MINUTES = 1;
```

Reemplazar con:
```ts
      const RESERVATION_MINUTES = 1.5;
```

---

## CAMBIO 3 - Comprobante WhatsApp con codigo obligatorio

**Archivo:** `server.ts`

Buscar exactamente esto:
```ts
      const refMatch = messageText?.match(/#(\d+)/);
      const orderRef = refMatch?.[1] ?? null;

      // Guardar mensaje
      const waEvent: any = {
        from_wa: fromWa.replace(/\D/g, ''),
        summary: messageText ?? '',
        has_proof: !!hasProof,
        order_ref: orderRef,
      };

      // Intentar cruzar con pedido (ventana 10 min para WA)
      const result = await tryMatchOrder({
        senderPhone: fromWa,
        orderRef: orderRef ?? undefined,
        windowMinutes: 10, // ventana más amplia para WA
      });
```

Reemplazar con:
```ts
      const refMatch = messageText?.match(/#(\d+)/);
      const orderRef = refMatch?.[1] ?? null;

      // Guardar mensaje
      const waEvent: any = {
        from_wa: fromWa.replace(/\D/g, ''),
        summary: messageText ?? '',
        has_proof: !!hasProof,
        order_ref: orderRef,
      };

      if (!orderRef) {
        await supabaseStore.from('wa_messages').insert(waEvent as any);
        return res.json({ ok: true, matched: false, orderId: null, reason: 'missing_order_code' });
      }

      // Intentar cruzar con pedido solo cuando el comprobante trae codigo
      const result = await tryMatchOrder({
        senderPhone: fromWa,
        orderRef,
        windowMinutes: 10,
      });
```

---

## Verificacion

1. Abrir checkout y confirmar que el contador arranca en 90 segundos.
2. Dejar vencer el tiempo y confirmar que el pedido expira.
3. Confirmar que el producto vuelve a estar disponible.
4. Enviar comprobante WA sin codigo y confirmar que no cruza automaticamente.
5. Enviar comprobante WA con `#ID` y confirmar que entra a revision manual.
