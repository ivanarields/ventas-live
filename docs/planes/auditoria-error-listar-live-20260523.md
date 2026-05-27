# Auditoría Del Error Al Listar Live - 23/05/2026

Documento de hechos sobre lo ocurrido en el Live del 22/05/2026 al 23/05/2026.

Este documento no propone cambios de código. Solo registra lo que pasó según la base de datos y el código existente.

## Resumen Directo

El banco/MacroDroid registró 3 pagos reales por un total de 125 Bs.

Después de cerrar el Live y usar `Listar`, el sistema procesó conversaciones de WhatsApp con IA y creó 14 registros en `pagos_venta_live`.

El problema visible fue que la pantalla de pagos mezcló:

- pagos reales del banco/MacroDroid
- comprobantes o imágenes detectadas desde WhatsApp
- comprobantes pendientes o en revisión manual

Por eso aparecieron más de 3 pagos en la app, aunque MacroDroid solo había recibido 3 pagos reales.

## Sesión Live

| Dato | Valor |
|---|---|
| ID de sesión | 19 |
| Nombre | Procesamiento Live 23/5/2026 |
| Inicio del Live | 22/05/2026 22:31:21 |
| Cierre del Live | 23/05/2026 00:41:00 |
| Duración registrada | 130 minutos |
| Estado | completed |
| Marcado como procesado | 23/05/2026 00:47:10 |

## Notificaciones Reales De MacroDroid

MacroDroid registró 3 notificaciones bancarias reales.

| Hora del pago en banco | Hora recibida por app | Persona | Monto | Motivo |
|---|---|---:|---:|---|
| 22/05/2026 23:35:49 | 22/05/2026 23:36:33 | MARQUEZ ROMERO GABRIELA | 75 Bs | ACH SIMPLE |
| 22/05/2026 23:36:49 | 22/05/2026 23:37:38 | WENDY ALVARADO ROSAS | 25 Bs | Pagos |
| 22/05/2026 23:39:04 | 22/05/2026 23:39:08 | GONZALES CHOQUE RUTH | 25 Bs | 1 sueter Pagos |

Total real recibido por MacroDroid: 125 Bs.

## Pagos Guardados En La Tabla Principal

La tabla principal `pagos` guardó los mismos 3 pagos.

| ID | Hora del pago | Nombre | Monto | Método |
|---:|---|---|---:|---|
| 494 | 22/05/2026 23:35:49 | MARQUEZ ROMERO GABRIELA | 75 Bs | Notificación bancaria |
| 495 | 22/05/2026 23:36:49 | WENDY ALVARADO ROSAS | 25 Bs | Notificación bancaria |
| 496 | 22/05/2026 23:39:04 | GONZALES CHOQUE RUTH | 25 Bs | Notificación bancaria |

No hay más pagos reales de MacroDroid en esa ventana.

## Botón Listar Live

La base no tiene una tabla de clicks del botón. Por eso no existe un contador directo que diga "se presionó exactamente X veces".

Lo que sí se puede confirmar por datos:

| Hecho | Hora |
|---|---|
| El Live se cerró | 23/05/2026 00:41:00 |
| Empezó el procesamiento con IA | 23/05/2026 00:41:43 |
| La sesión quedó marcada como procesada | 23/05/2026 00:47:10 |
| Hubo más llamadas de IA después de procesado | 23/05/2026 00:48:44 a 00:55:29 |

Lectura factual:

- Hay una ejecución principal de `Listar` entre 00:41:43 y 00:47:10.
- Después de 00:47:10 hubo más procesamiento de IA.
- Eso indica al menos una segunda acción de análisis/reanálisis o una continuación manual posterior, pero la base no guarda el click exacto.

## Investigación Del Rango De 5 Minutos Después Del Cierre

El código sí tiene una regla de 5 minutos después del cierre del Live.

La regla está en el procesamiento de `POST /api/ai/summarize-conversation`:

- `LIVE_LATE_PROOF_GRACE_MINUTES = 5`
- el sistema lee mensajes desde el inicio del Live hasta `cierre del Live + 5 minutos`
- si un comprobante entra dentro de esos 5 minutos posteriores y no hace match con MacroDroid, se marca como `revision_manual`

Para este Live:

| Dato | Hora |
|---|---|
| Cierre del Live | 23/05/2026 00:41:00 |
| Fin del rango extra de 5 minutos | 23/05/2026 00:46:00 |

Se revisó la tabla `panel_mensajes` entre 00:41:00 y 00:46:00.

Resultado:

| Rango revisado | Mensajes encontrados |
|---|---:|
| 00:41:00 a 00:46:00 | 0 |

Conclusión de este punto:

El rango de 5 minutos existe, pero no fue la causa directa de los registros raros de este caso, porque no había mensajes nuevos dentro de esos 5 minutos posteriores al cierre.

Los registros raros creados por `Listar` vinieron de mensajes e imágenes que ya estaban dentro del Live antes de las 00:41:00.

## IA Que Analizó El Live

La IA registrada en `ai_usage_log` fue:

| Dato | Valor |
|---|---|
| Proveedor usado por el backend | OpenRouter |
| Modelo registrado | openrouter:google/gemini-2.5-flash-lite |
| Funciones usadas | chat_summary, photo_selection |
| Primera llamada IA | 23/05/2026 00:41:43 |
| Última llamada IA | 23/05/2026 00:55:29 |
| Total de llamadas IA en esa ventana | 238 |

Llamadas por minuto:

| Minuto | Total llamadas | chat_summary | photo_selection |
|---|---:|---:|---:|
| 00:41 | 8 | 6 | 2 |
| 00:42 | 30 | 22 | 8 |
| 00:43 | 31 | 24 | 7 |
| 00:44 | 14 | 13 | 1 |
| 00:45 | 6 | 6 | 0 |
| 00:46 | 28 | 21 | 7 |
| 00:47 | 25 | 22 | 3 |
| 00:48 | 10 | 10 | 0 |
| 00:49 | 4 | 3 | 1 |
| 00:50 | 27 | 24 | 3 |
| 00:51 | 3 | 2 | 1 |
| 00:53 | 9 | 6 | 3 |
| 00:54 | 28 | 25 | 3 |
| 00:55 | 15 | 13 | 2 |

## Registros Creados Por Listar En Pagos Live

Al listar se crearon 14 registros en `pagos_venta_live`.

Ninguno de estos 14 registros quedó vinculado a un pago principal real de MacroDroid (`main_pago_id` estaba vacío).

| Hora creado | Nombre mostrado | Monto | Estado | Texto detectado |
|---|---|---:|---|---|
| 00:42:03 | VERO MENDOZA | 6000.21 Bs | pendiente_whatsapp | VERO MENDOZA - Bs 6000.21 - 12:07 |
| 00:42:13 | ELDY ERIKA CABRERA GUZMAN | 25 Bs | pendiente_whatsapp | ELDY ERIKA CABRERA GUZMAN - Bs 25 |
| 00:43:22 | MACHUCA VALLEJOS MARIELA | 25 Bs | pendiente_whatsapp | MACHUCA VALLEJOS MARIELA - Bs 25 - 23:52 |
| 00:43:23 | SIN NOMBRE | 6000.21 Bs | revision_manual | Bs 6000.21 - 23:39 |
| 00:43:23 | MACHUCA VALLEJOS MARIELA | 25 Bs | pendiente_whatsapp | MACHUCA VALLEJOS MARIELA - Bs 25 - 23:36 |
| 00:43:42 | DIAZ SANCHEZ LEIDY CANDY | 25 Bs | pendiente_whatsapp | DIAZ SANCHEZ LEIDY CANDY - Bs 25 - 23:53 |
| 00:43:42 | SIN NOMBRE | 6000.21 Bs | revision_manual | Bs 6000.21 - 23:52 |
| 00:44:23 | GONZ LES | 6000.21 Bs | pendiente_whatsapp | GONZ@LES - Bs 6000.21 - 12:15 |
| 00:44:24 | GONZALES CHOQUE RUTH | 25 Bs | pendiente_whatsapp | GONZALES CHOQUE RUTH - Bs 25 - 00:10 |
| 00:44:24 | GONZALES CHOQUE RUTH | 25 Bs | pendiente_whatsapp | GONZALES CHOQUE RUTH - Bs 25 - 23:38 |
| 00:46:03 | MARQUEZ ROMERO GABRIELA | 75 Bs | pendiente_whatsapp | MARQUEZ ROMERO GABRIELA - Bs 75 - 23:35 |
| 00:46:04 | SIN NOMBRE | 6000.21 Bs | revision_manual | Bs 6000.21 - 23:33 |
| 00:46:05 | SIN NOMBRE | 6000.21 Bs | revision_manual | Bs 6000.21 - 23:16 |
| 00:47:09 | WENDY ALVARADO ROSAS | 25 Bs | pendiente_whatsapp | WENDY ALVARADO ROSAS - Bs 25 - 23:36 |

## Evidencias Guardadas Por Listar

El proceso guardó 28 evidencias:

| Tipo | Cantidad |
|---|---:|
| comprobante | 14 |
| prenda | 14 |
| total | 28 |

Esto confirma que `Listar` no solo miró pagos bancarios. También analizó imágenes de WhatsApp y las separó entre comprobantes y prendas.

## Conversaciones Relevantes

### MARQUEZ ROMERO GABRIELA

Mensajes dentro del rango Live:

| Hora | Tipo | Texto |
|---|---|---|
| 23:07:43 | imagen | sin texto |
| 23:20:33 | imagen | sin texto |
| 23:20:48 | imagen + texto | Ese |
| 23:38:46 | imagen | sin texto |
| 23:59:27 | texto | Por esa negra |
| 23:59:43 | texto | Si ok |
| 23:59:54 | texto | Te transfiero |
| 00:03:16 | texto | Ya esta case |
| 00:03:16 | texto | Gracias |
| 00:03:23 | imagen | sin texto |

Pago real MacroDroid relacionado:

- 75 Bs, recibido en banco a las 23:35:49.

Registros creados al listar:

- 75 Bs como MARQUEZ ROMERO GABRIELA.
- 6000.21 Bs sin nombre.
- 6000.21 Bs sin nombre.

### WENDY ALVARADO ROSAS

Mensajes dentro del rango Live:

| Hora | Tipo | Texto |
|---|---|---|
| 23:27:30 | texto | Disculpe sigue disponible? |
| 23:27:33 | imagen | sin texto |
| 00:00:18 | imagen + texto | Es esa cierto ?? |
| 00:03:38 | imagen | sin texto |

Pago real MacroDroid relacionado:

- 25 Bs, recibido en banco a las 23:36:49.

Registro creado al listar:

- 25 Bs como WENDY ALVARADO ROSAS.

### GONZALES CHOQUE RUTH / GONZ@LES

Mensajes dentro del rango Live:

| Hora | Tipo | Texto |
|---|---|---|
| 23:32:26 | imagen | sin texto |
| 23:32:26 | imagen | sin texto |
| 00:03:23 | imagen | sin texto |
| 00:03:37 | texto | Voy a pagar |
| 00:03:54 | texto | Esa |
| 00:03:57 | imagen | sin texto |
| 00:07:56 | texto | La roja sigue disponible? |
| 00:08:01 | imagen | sin texto |
| 00:08:08 | texto | Está sigue disponible? |
| 00:08:08 | imagen | sin texto |
| 00:11:09 | imagen | sin texto |
| 00:11:22 | texto | Auringa le pago |
| 00:11:29 | imagen + texto | Listo Case |
| 00:32:01 | imagen | sin texto |

Pago real MacroDroid relacionado:

- 25 Bs, recibido en banco a las 23:39:04.

Registros creados al listar:

- 25 Bs como GONZALES CHOQUE RUTH.
- 25 Bs como GONZALES CHOQUE RUTH.
- 6000.21 Bs como GONZ LES.

### MACHUCA VALLEJOS MARIELA

Mensajes dentro del rango Live:

| Hora | Tipo | Texto |
|---|---|---|
| 23:29:38 | imagen | sin texto |
| 23:29:41 | texto | Mariel |
| 23:29:56 | texto | Páseme su qr |
| 23:30:06 | texto | Es en sc para recoger |
| 00:03:43 | texto | Gracias amiga |
| 00:03:44 | imagen | sin texto |
| 00:08:07 | texto | La del maniquí |
| 00:08:08 | texto | El rojo |
| 00:08:08 | imagen | sin texto |
| 00:08:24 | texto | Si |
| 00:08:25 | texto | Enseguida |
| 00:08:29 | texto | Cancelo |
| 00:08:36 | imagen | sin texto |

En la captura bancaria del usuario aparecen dos pagos de Machuca Vallejos Mariela por 25 Bs.

En la base de MacroDroid consultada para esa ventana solo quedaron 3 notificaciones totales y no aparecen esas dos notificaciones de Machuca.

Registros creados al listar:

- 25 Bs como MACHUCA VALLEJOS MARIELA.
- 25 Bs como MACHUCA VALLEJOS MARIELA.
- 6000.21 Bs sin nombre.

### ELDY ERIKA CABRERA GUZMAN

Mensajes dentro del rango Live:

| Hora | Tipo | Texto |
|---|---|---|
| 00:08:07 | texto | . |
| 00:08:14 | imagen | sin texto |
| 00:08:32 | texto | Por la hora no me deja casé mi banca |
| 00:08:39 | texto | Si |
| 00:27:48 | imagen | sin texto |

Registro creado al listar:

- 25 Bs como ELDY ERIKA CABRERA GUZMAN.

### VERO MENDOZA

Mensajes dentro del rango Live:

| Hora | Tipo | Texto |
|---|---|---|
| 00:11:15 | texto | Buenas noches esa m interesa |
| 00:11:15 | imagen | sin texto |
| 00:11:16 | imagen | sin texto |
| 00:11:19 | texto | Cómo se adquiere |
| 00:11:21 | texto | Soy nueva |
| 00:11:22 | texto | Me agrega a su grupo |
| 00:16:51 | texto | Cómo se recoge luego m |
| 00:16:52 | texto | Comunica |

Registro creado al listar:

- 6000.21 Bs como VERO MENDOZA.

## Orden Cronológico De Los Hechos

| Hora | Hecho |
|---|---|
| 22:31:21 | Se inicia el Live #19. |
| 23:35:49 | Banco registra pago de MARQUEZ por 75 Bs. |
| 23:36:33 | App recibe notificación MacroDroid de MARQUEZ. |
| 23:36:49 | Banco registra pago de WENDY por 25 Bs. |
| 23:37:38 | App recibe notificación MacroDroid de WENDY. |
| 23:39:04 | Banco registra pago de GONZALES por 25 Bs. |
| 23:39:08 | App recibe notificación MacroDroid de GONZALES. |
| 00:41:00 | Se cierra el Live. |
| 00:41:43 | Empieza procesamiento IA del Live. |
| 00:42:03 | Se crea registro WhatsApp de VERO por 6000.21 Bs. |
| 00:42:13 | Se crea registro WhatsApp de ELDY por 25 Bs. |
| 00:43:22 - 00:43:23 | Se crean 3 registros WhatsApp de MACHUCA: 25, 6000.21 y 25. |
| 00:43:42 | Se crean 2 registros WhatsApp de DIAZ SANCHEZ/imagen: 25 y 6000.21. |
| 00:44:23 - 00:44:24 | Se crean 3 registros WhatsApp de GONZALES/GONZ LES: 6000.21, 25 y 25. |
| 00:46:03 - 00:46:05 | Se crean 3 registros WhatsApp de MARQUEZ: 75, 6000.21 y 6000.21. |
| 00:47:09 | Se crea registro WhatsApp de WENDY por 25 Bs. |
| 00:47:10 | La sesión queda marcada como procesada. |
| 00:48:44 - 00:55:29 | Hay más llamadas de IA posteriores al marcado como procesado. |

## Qué Fue Lo Que Pasó

Hecho confirmado:

- MacroDroid no creó 14 pagos.
- MacroDroid creó 3 pagos.
- `Listar` creó 14 registros de pagos Live desde WhatsApp.

El error visible fue que esos registros de WhatsApp quedaron visibles en la pantalla de pagos junto a los pagos reales.

La app mostró más de 3 pagos porque `Listar` transformó imágenes o comprobantes detectados en WhatsApp en registros de pago Live.

Los montos `6000.21` no vinieron de MacroDroid. Vinieron de registros creados por el procesamiento de WhatsApp/IA.

## Conclusión Factual

Ese día entraron 3 pagos reales por MacroDroid.

Después de usar `Listar`, el sistema generó 14 registros en pagos Live desde conversaciones de WhatsApp.

El origen del problema fue la mezcla en la interfaz y en el flujo de revisión entre:

- pago real bancario
- comprobante de WhatsApp
- imagen de prenda
- comprobante pendiente
- comprobante en revisión manual

La evidencia principal es que los 14 registros creados por `Listar` no tenían `main_pago_id`, es decir, no estaban vinculados a un pago bancario real de MacroDroid.
