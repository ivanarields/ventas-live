# Fase Final: Automatización Total — Plan de Triangulación de Datos

**Estado:** 📋 PENDIENTE — No iniciar hasta confirmación explícita  
**Fecha de análisis:** 21 abr 2026  
**Prioridad:** Alta — Es la base para que todo funcione como un solo sistema

---

## El Problema Central

La app vive en **2 bases de datos Supabase separadas** que no se conocen:

- **DB A** (`vhczofpmxzbqzboysoca`) → App principal: clientes, pagos, pedidos, casilleros
- **DB B** (`vwaocoaeenavxkcshyuf`) → Panel WhatsApp: chats, fotos, audios, resúmenes IA

El operador tiene que leer ambas pantallas por separado y conectar los datos en su cabeza. El objetivo de esta fase es que la **app lo haga sola**.

---

## Los 3 Datos Clave (Triangulación de Identidad)

```
① pagos.nombre         = "FUENTES MARIA"    ← Banco (100% fidedigno, verificado por sistema financiero)
② panel_clientes.phone = "59172698959"       ← WhatsApp (auténtico, no modificable por nadie)
③ Gemini en foto       = "MARIA FUENTES"    ← IA extrae nombre del comprobante enviado por WA
```

Con estos 3 datos se puede identificar unívocamente a cualquier cliente sin intervención humana.

---

## Plan de Implementación (5 Tareas en Orden)

### TAREA 1 — El Puente Telefónico (Base de todo lo demás)
**Qué hace:** Vincula `customers.phone` (DB A) con `panel_clientes.phone` (DB B).  
**Cómo:** Cuando el operador abre el Perfil de un Cliente que tiene teléfono guardado, la app consulta DB B y trae sus fotos y resumen IA automáticamente.  
**Resultado visible:** En Perfil del Cliente aparece una galería de fotos del chat de WhatsApp y el resumen IA del último pedido, sin que nadie haga nada.  
**Dependencias:** Ninguna. Es la base.

### TAREA 2 — Extracción del Nombre del Comprobante (IA)
**Qué hace:** Gemini, al analizar las fotos del chat, detecta si alguna es un comprobante de pago y extrae el nombre del pagador.  
**Cómo:** Modificar la Edge Function `summarize-conversation` para agregar al prompt: *"Si hay una imagen de comprobante de pago, extrae: nombre_pagador, monto, banco"*. Se guarda en `panel_clientes.nombre`.  
**Resultado visible:** El Panel de WhatsApp muestra "MARIA FUENTES" en vez de solo "+591 72 698 959".  
**Dependencias:** Ninguna. Puede hacerse en paralelo con Tarea 1.

### TAREA 3 — Match Automático Pago ↔ Chat WhatsApp
**Qué hace:** Cuando llega un pago nuevo del banco (OCR MacroDroid), el sistema busca automáticamente si hay una conversación de WhatsApp reciente con el mismo nombre o monto.  
**Cómo:** Al insertar en `pagos`, comparar `cleanName(pagos.nombre)` con `cleanName(panel_clientes.nombre)` de las últimas 24h. Si hay match con score > 80%, marcar la vinculación.  
**Resultado visible:** En la Lista de Pagos, cada pago muestra una etiqueta "✅ Match WA" con una miniatura de la foto de la prenda. El operador solo confirma, no busca.  
**Dependencias:** Tarea 2 debe estar completa (necesita `panel_clientes.nombre`).

### TAREA 4 — Pre-llenado de la Mesa de Preparación
**Qué hace:** Al crear un pedido para un cliente que tiene conversación WA activa, la Mesa de Preparación se abre con la cantidad de prendas ya puesta.  
**Cómo:** Botón "🚀 Crear Pedido" en el Panel WA que lee `resumen.cantidad` y `resumen.talla` del JSON de Gemini, y pre-llena los campos del nuevo pedido.  
**Resultado visible:** El operador abre Mesa de Preparación y el contador de prendas ya dice "3" en vez de 0. Solo verifica y aprieta "PEDIDO LISTO".  
**Dependencias:** Tarea 1 (necesita saber a qué cliente de DB A pertenece el chat).

### TAREA 5 — Respuesta Automática por WhatsApp al Asignar Casillero
**Qué hace:** Cuando el sistema PostgreSQL asigna un casillero (A, B, 1, 2...), el cliente recibe automáticamente un WhatsApp de confirmación.  
**Cómo:** Al hacer commit en Mesa de Preparación, el backend llama a Railway (bridge WA) con el número del cliente y el mensaje: *"✨ Tu pedido fue registrado. Casillero: A-3. ¡Gracias!"*  
**Resultado visible:** El cliente recibe confirmación automática. Cero intervención del operador.  
**Dependencias:** Tarea 1 + Bridge de WhatsApp activo en Railway.

---

## Flujo Final (lo que verá el operador cuando todo esté listo)

```
ANTES (ahora):
1. Leer chat WA en panel separado
2. Abrir app, buscar cliente
3. Recordar cantidad de prendas, tipearlas
4. Asignar casillero (automático ✅)
5. Abrir WhatsApp en celular, escribir confirmación al cliente

DESPUÉS (fase final):
1. Abrir app → Lista de Pagos → ver "✅ Match WA" en cada pago
2. Click en cliente → ven fotos de prendas YA en el perfil
3. Click "Crear Pedido" → Mesa pre-llenada con 3 prendas
4. Click "PEDIDO LISTO" → Casillero asignado + WA enviado automáticamente
```

**El operador pasa de 5 pasos mentales a 3 clics.**

---

## Datos Disponibles por Panel (Resumen)

| Panel | Datos que YA tiene | Datos que le FALTAN |
|---|---|---|
| **Lista de Pagos** | Nombre banco, monto, fecha, método | Fotos prendas, número WA |
| **Perfil del Cliente** | Nombre, teléfono (manual), label casillero, historial $ | Fotos WA, chat, comprobante |
| **Detalle del Pedido** | Prendas, bolsas, casillero, monto | Fotos del pedido original |
| **Panel WA** | Número real WA, fotos, audios, resumen IA | Nombre real, vínculo con pago |
| **Mesa de Preparación** | Nada pre-llenado (todo manual) | Cantidad/talla del chat WA |

---

## Notas Técnicas para Retomar

- La función `cleanName()` ya existe en `App.tsx` — normaliza nombres para match insensible a orden y acentos.
- La Edge Function `summarize-conversation` ya llama a Gemini con fotos — solo hay que agregar extracción de comprobante al prompt.
- El Bridge de Railway ya sabe el número (`fromPhone`) — agregar endpoint de envío de mensajes de salida.
- `customers.phone` existe pero se llena manualmente — el primer paso es poblar este campo con datos de WA cuando haya match confirmado.

---

*Documento creado: 21 abr 2026 | Retomar cuando el sistema base esté estable*
