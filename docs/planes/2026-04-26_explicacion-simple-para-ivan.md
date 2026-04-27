# El Plan Explicado Simple — Para Ivan

---

## El problema que queremos resolver

Ahora mismo, cuando llega una clienta, vos tenés que hacer esto:

1. Ves que llegó un pago de "FUENTES MARIA" en la app
2. Abrís el panel de WhatsApp en otra pantalla
3. Buscás a mano quién es esa persona en el chat
4. Te acordás cuántas prendas mandó en la foto
5. Escribís el número a mano en la Mesa de Preparación
6. Cuando le asignás el casillero, agarrás el celular y le mandás un WhatsApp de confirmación

**Son 6 pasos. El objetivo es bajarlos a 2 o 3.**

---

## La situación actual (lo que ya está hecho)

La app vive en **dos mundos separados** que no se conocen:

- **Mundo 1 — La App Principal:** acá están los pagos, los pedidos, los casilleros. Sabés que existe "FUENTES MARIA" y que pagó Bs 150.
- **Mundo 2 — El Panel de WhatsApp:** acá están los chats, las fotos de las prendas, los audios. Sabés que el número +591 726 98959 mandó 3 fotos de ropa.

**El problema:** la app no sabe que "FUENTES MARIA" y "+591 726 98959" son la misma persona.

---

## Lo que ya construimos (el Sistema Pulpo)

Construimos una especie de **libreta inteligente** que va juntando pistas de los dos mundos para darse cuenta de que "FUENTES MARIA" y "+591 726 98959" son la misma persona.

Esta libreta se llama "Sistema Pulpo" porque conecta muchos tentáculos (canales) a una misma persona.

### ¿Qué sabe la libreta?

Por cada clienta, la libreta guarda:
- Su nombre (del banco o del pago manual)
- Su número de WhatsApp
- Si ya pagó antes (cuántas veces, cuánto)
- Si ya mandó fotos por WhatsApp
- Un número del 0 al 100 que dice "qué tan seguro estoy de que esta persona es quien creo que es"

### ¿Cómo funciona el número de confianza?

- **97%** → la conocemos por WhatsApp Y por el banco Y por otro lado. Casi imposible que sea otra persona.
- **85%** → la conocemos por WhatsApp Y por un canal más. Muy probable.
- **60%** → solo la conocemos por WhatsApp. Sabemos el número pero nada más.
- **45%** → solo llegó un pago del banco. Tiene nombre pero no teléfono.
- **30%** → solo pagó una vez en efectivo. No sabemos casi nada de ella.

### ¿Desde dónde llegan las pistas?

Hay 4 fuentes de pistas (canales):
1. **MacroDroid** → cuando el banco le manda una notificación y MacroDroid lo capta automáticamente. Llega con nombre del pagador.
2. **WhatsApp** → cuando una clienta escribe o manda fotos. Llega con número de teléfono.
3. **Pago manual** → cuando vos registrás un pago a mano. Llega con nombre.
4. **Tienda online** → pedidos de la tienda web. Llega con nombre y teléfono.

### ¿Qué ya hace automático el Pulpo?

- Cuando llega un mensaje de WhatsApp → la libreta ya busca si conoce ese número, y si lo conoce, lo anota en el perfil de esa persona. Si no lo conoce, crea uno nuevo.
- Cuando llega un pago del banco → mismo proceso: busca el nombre, lo anota.
- Vos podés ir a Configuración → Identidad y ver todos los perfiles con sus pistas.
- Podés hacer "Sincronizar" y agregar los datos históricos que faltaban.
- Podés fusionar dos perfiles si la app se confundió y creó duplicados.

---

## Lo que todavía falta conectar (las 5 tareas)

El Pulpo ya sabe que FUENTES MARIA y +591726... son la misma persona. **Pero no te lo muestra todavía en las pantallas que usás todos los días.** Eso es lo que falta.

---

### TAREA 1 — Ver las fotos de WhatsApp dentro del Perfil de la Clienta
**Lo que falta:** Cuando abrís el perfil de una clienta en la app, abajo de los pagos, debería aparecer una galería con las fotos que esa persona mandó por WhatsApp en los últimos días.

**Cómo funciona internamente:** La app ya puede buscar las fotos usando el teléfono de la clienta. Solo falta que las muestre en pantalla.

**Lo que vas a ver cuando esté listo:** Abrís el perfil de FUENTES MARIA, y abajo ves tres fotos de las prendas que mandó el martes por WhatsApp. Sin abrir otra pantalla.

**¿Cuánto código implica?** Solo cambiar la pantalla de Perfil del Cliente. El sistema de búsqueda ya existe.

---

### TAREA 2 — Que la IA lea el comprobante de pago que mandan por WhatsApp
**Lo que falta:** Muchas clientas mandan una foto del comprobante de Yape o transferencia por WhatsApp. En esa foto dice el nombre de quién pagó. Queremos que la app lea ese nombre automáticamente.

**Cómo funciona internamente:** Ya usamos Gemini (la IA de Google) para resumir conversaciones de WhatsApp. Solo hay que decirle: "Si ves una foto de comprobante de pago, anotame el nombre que dice ahí."

**Lo que vas a ver cuando esté listo:** En el panel de WhatsApp, en vez de ver el número "+591 726 98959", vas a ver el nombre "MARIA FUENTES" porque la IA lo extrajo del comprobante que mandó.

**¿Cuánto código implica?** Modificar la instrucción que le mandamos a Gemini. Cambio chico.

---

### TAREA 3 — Ver una marquita verde en la lista de pagos cuando hay match con WhatsApp
**Lo que falta:** En la lista de pagos (la pantalla principal), al lado del nombre de cada clienta que TAMBIÉN tiene conversación activa en WhatsApp, mostrar un ícono verde de WhatsApp.

**Cómo funciona internamente:** Los datos ya están: si la libreta Pulpo sabe que "FUENTES MARIA" tiene un número de WhatsApp vinculado, solo hay que mostrar ese dato visualmente en la lista.

**Lo que vas a ver cuando esté listo:** Mirás la lista de pagos y ves quiénes ya mandaron fotos por WA. Sabés de un vistazo con quiénes ya hablaste por chat y con quiénes no.

**¿Cuánto código implica?** Solo cambiar la pantalla de la lista. Sin backend nuevo.

---

### TAREA 4 — Que la Mesa de Preparación arranque con el número de prendas ya puesto
**Lo que falta:** Cuando abrís la Mesa de Preparación, el contador de prendas siempre empieza en 0 y tenés que tipear el número. Si la clienta mandó las fotos por WhatsApp y la IA ya las contó en el resumen, ese número debería aparecer solo.

**Cómo funciona internamente:** Gemini ya hace un resumen del chat de WhatsApp. En ese resumen está la cantidad de prendas que la clienta mencionó. Solo hay que leer ese dato y ponerlo en el contador.

**Lo que vas a ver cuando esté listo:** Abrís la Mesa de Preparación y ya dice "3 prendas". Vos solo verificás y apretás "PEDIDO LISTO".

**¿Cuánto código implica?** Mediano. Depende de que la Tarea 2 esté andando primero (porque necesitamos que Gemini ya sepa contar prendas).

---

### TAREA 5 — Que la app mande el WhatsApp de confirmación sola cuando asigna el casillero
**Lo que falta:** Ahora cuando apretás "PEDIDO LISTO" y el sistema asigna un casillero (ej: casillero A), vos tenés que agarrar el celular y escribirle a la clienta: "Listo, tu pedido está en el casillero A." Queremos que eso lo haga la app sola.

**Cómo funciona internamente:** El conector de WhatsApp (el programa que corre en tu computadora) ya sabe recibir mensajes. Hay que agregarle la capacidad de también enviar mensajes. Cuando el sistema asigne el casillero, le avisa al conector y el conector manda el WhatsApp.

**Lo que vas a ver cuando esté listo:** Apretás "PEDIDO LISTO", el casillero se asigna, y la clienta recibe en segundos: "✨ Tu pedido fue registrado. Casillero: A. ¡Gracias por elegirnos!"

**¿Cuánto código implica?** Mediano. Hay que agregar el envío al conector de WhatsApp y conectarlo con el flujo del casillero.

---

## El orden que recomiendo

**Primero** las dos que se ven de inmediato y no dependen de nada:
- Tarea 1 (fotos en el perfil)
- Tarea 3 (marquita WA en la lista)

**Después** la que mejora los datos:
- Tarea 2 (IA lee el comprobante)

**Al final** las que dependen de las anteriores:
- Tarea 5 (WhatsApp automático)
- Tarea 4 (pre-llenar mesa de preparación)

---

## El resultado final

Hoy:
```
Llega un pago → buscás en WhatsApp quién es → contás prendas → las escribís
→ asignás casillero → agarrás el celular → escribís confirmación
```

Cuando todo esté:
```
Llega un pago → ves el ícono WA verde → abrís el perfil y ves las fotos solas
→ apretás PEDIDO LISTO → el número de prendas ya está puesto
→ el WhatsApp de confirmación se manda solo
```

**De 6 pasos manuales a 2 clics.**

---

*Explicación creada: 26 abr 2026*
