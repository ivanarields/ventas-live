# PLAN MAESTRO: AUTOMATIZACIÓN DE WHATSAPP Y CONCILIACIÓN DE LIVES

Este documento detalla la arquitectura, el diseño de la base de datos y los flujos de trabajo para implementar un sistema de mensajería automatizada por WhatsApp y un flujo unificado de conciliación de prendas para ventas por TikTok Live.

## 1. OBJETIVO GENERAL
Crear un ecosistema donde la aplicación pueda comunicarse de vuelta con los clientes de forma segura (sin riesgo de baneo de WhatsApp). Para las ventas en vivo, el sistema delega el trabajo de seleccionar las prendas pagadas al propio cliente, utilizando la Tienda Online como "puerta de entrada" y unificando el historial en el Perfil Master de la aplicación principal.

---

## 2. ARQUITECTURA DE DATOS (El Modelo "Espejo")

Para evitar la duplicación de datos y la fragmentación de perfiles, se utilizará el **Número de Teléfono (+591...)** como Llave Universal.

*   **DB 1 (Main App - Perfil Master):** Es el rey. Administra clientes, pagos, pedidos y casilleros. Recibirá el resultado final de la selección de la clienta.
*   **DB 2 (WhatsApp / Panel Pedidos):** Es el almacén temporal. Guarda las fotos reales de las prendas enviadas por el chat.
*   **DB 3 (Tienda Online):** Es la puerta de entrada segura. Maneja la autenticación (Teléfono + PIN). No guarda las fotos; las consulta en tiempo real desde la DB 2 y escribe la confirmación en la DB 1.

---

## 3. FASES DE IMPLEMENTACIÓN TÉCNICA

### FASE 1: Motor de Envío (WhatsApp Bridge)
Actualmente, el conector en Railway solo lee mensajes. Debe poder enviarlos.

*   **Acciones:**
    1.  Modificar `whatsapp-conector/index.js` para añadir un endpoint `POST /api/send`.
    2.  Protegerlo con un `WEBHOOK_SECRET` para que solo tu servidor pueda dispararlo.
    3.  Implementar la función `client.sendMessage(chatId, text)`.
*   **Control de Errores (Bache):** Si WhatsApp rechaza el envío (ej. número no existe), el bridge devolverá un error HTTP 400 para que el sistema lo marque como fallido y el administrador se entere.

### FASE 2: Panel de Automatización Anti-Baneo (El Centro de Control)
Evitaremos enviar ráfagas de mensajes en la madrugada para proteger el número.

*   **Cambios en Base de Datos (DB 1):**
    *   Crear la tabla `whatsapp_message_queue` (Cola de Mensajes).
    *   Campos: `id`, `phone`, `message_body`, `type` (ej. 'store_verification', 'live_confirmation'), `status` ('pending', 'sent', 'failed'), `created_at`.
*   **UI en la Aplicación (Panel Pulpo):**
    *   Nueva pestaña "Mensajería".
    *   Muestra una tabla con los mensajes pendientes de enviar.
    *   **Modo "Envío Seguro":** Un botón que envía los mensajes pendientes con un *delay* aleatorio de 2 a 4 minutos entre cada uno (simulando comportamiento humano).
    *   Opciones para editar el texto de un mensaje antes de enviarlo o cancelarlo.

### FASE 3: Flujo 1 - Tienda Online (El caso estructurado)
Notificar a los clientes de la tienda que su pago fue exitoso.

*   **Lógica:**
    *   Cuando en la aplicación se marca un pago de la tienda como "Verificado" (ya sea manualmente o por la IA MacroDroid), el sistema inserta un registro en la tabla `whatsapp_message_queue`.
    *   Texto base: *"¡Hola! Tu pago ha sido verificado. Tu pedido de la Tienda Online está confirmado y en preparación."*
    *   El mensaje queda en estado `pending` hasta que tú le des "Enviar" desde el panel.

### FASE 4: Flujo 2 - TikTok Live y el "Espejo" en la Tienda
Dejar que la clienta arme su propio pedido.

*   **Generación del Link:**
    *   Tras un Live, cuando verificas los pagos de los comprobantes que enviaron, el sistema inserta un mensaje en la cola: *"¡Hola! Ya tenemos tu pedido listo. Confirma tus prendas ingresando con tu PIN aquí: [Link a la tienda]"*.
*   **La Experiencia de la Clienta (Front-End Tienda):**
    1.  Entra al link y se loguea (Número + PIN).
    2.  La Tienda le pregunta a tu servidor (`server.ts`): *"¿Qué fotos mandó este número por WhatsApp anoche?"*.
    3.  El servidor lee las imágenes de **DB 2** (filtrando las que la IA no haya marcado como "comprobante") y las devuelve a la Tienda.
    4.  La clienta ve un formulario con sus fotos, selecciona las prendas y presiona "Confirmar Selección".
*   **Cierre de Orden:**
    *   Al confirmar, la Tienda envía la orden al servidor, que crea un **Pedido Oficial** en el **Perfil Master (DB 1)** con las fotos definitivas.
*   **Limpieza Automática (Higiene de Datos):**
    *   Crear una rutina (Edge Function o Script) que borre de DB 2 las imágenes no seleccionadas por la clienta (después de 7 días), para no gastar espacio en la nube en "fotos basura".

---

## 4. GESTIÓN DE ERRORES Y PLAN DE CONTINGENCIA

| Posible Bache / Riesgo | Estrategia de Mitigación (Plan de Cuidado) |
| :--- | :--- |
| **Baneo del Número de WhatsApp** | La existencia de la `whatsapp_message_queue` es el escudo. Nunca se envían mensajes en ráfaga. El "Envío Seguro" controla el ritmo (1 mensaje cada 3 min). |
| **Caída del Servidor Bridge (Railway)** | Si el conector está offline, el intento de envío fallará. El sistema marcará el mensaje como `failed` en la cola, permitiendo al administrador intentar enviarlo más tarde sin perder el dato. |
| **Diferencias de Formato en Teléfonos** | DB 1 usa `+591`, la tienda usa solo los 8 dígitos, WhatsApp usa `5917...`. Solución: Crear una función estricta de `normalizePhone()` en el backend que garantice que todas las consultas a las 3 DBs usen el mismo estándar exacto (E.164). |
| **Clienta no recuerda su PIN** | La tienda ya tiene / debe tener una opción rápida de recuperación o reset por el mismo WhatsApp, o tú puedes resetearlo manualmente desde el Perfil Master si la clienta pide ayuda. |
| **Clienta selecciona más prendas de las que pagó** | En el Perfil Master, las órdenes de Live aparecerán como "Para Revisión". El operador puede echar un ojo final para confirmar que lo seleccionado corresponde al pago (auditoría visual). |

---

## 5. PASOS INICIALES PARA EL DESARROLLO (MODO LOCAL)

Se recomienda ejecutar en este orden para evitar regresiones en producción:

1.  **Levantar el Bridge localmente** y añadir el endpoint `POST /api/send`. Probar enviando un mensaje manual con Postman a un número de prueba.
2.  **Crear la UI del Panel Anti-Baneo** en React (`whatsapp_message_queue`) y la lógica de "Envío Seguro" con `setTimeout`.
3.  **Construir el "Espejo" en el Backend** (`server.ts`), conectándolo a DB 2 para obtener las imágenes de WhatsApp por número.
4.  **Desarrollar el formulario en la Tienda Online**, que se comunique con el backend y permita guardar las selecciones en DB 1.

---

## 6. AUDITORÍA TÉCNICA EXHAUSTIVA DE RIESGOS Y MITIGACIONES (PRE-MORTEM)

Para garantizar la máxima robustez del sistema, se ha realizado este análisis de "Posibles Puntos de Fallo" en cada capa de la arquitectura. Cada riesgo viene con su solución técnica (vacuna) que debe programarse durante la implementación.

### 6.1. Capa de Infraestructura y Conexión (WhatsApp Bridge)

| Riesgo / Posible Fallo | Impacto | Estrategia de Solución (Mitigación) |
| :--- | :--- | :--- |
| **Expiración de Sesión de WhatsApp Web (`auth_failure`)** | El bot deja de enviar y recibir sin que el administrador se dé cuenta. La cola de envíos falla masivamente. | **Monitoreo de Estado:** El bridge debe exponer un endpoint `/api/health`. El Panel debe hacer polling (cada X min) a este endpoint. Si la sesión cae, el sistema detiene la cola automáticamente y envía una alerta visual roja en el Panel: *"⚠️ WhatsApp Desconectado. Escanea el QR"*. |
| **Baneo de IP del Servidor (Railway/Oracle)** | WhatsApp detecta que la IP del servidor es de un Data Center y bloquea la sesión web constantemente. | **Calentamiento de Línea:** Evitar picos de envío. Si ocurre baneo de IP (distinto a baneo de número), será necesario usar un Proxy Residencial o migrar el contenedor a un VPS local/nacional (Oracle Cloud suele ser seguro). |
| **Condición de Carrera en la Cola de Mensajes (Race Condition)** | Si dos administradores abren el panel y presionan "Enviar" a la vez, el sistema podría enviar el mismo mensaje de confirmación dos veces al cliente. | **Bloqueo a Nivel de Base de Datos:** Usar la instrucción `SELECT ... FOR UPDATE SKIP LOCKED` en PostgreSQL al procesar la tabla `whatsapp_message_queue`. Esto asegura que un mensaje solo sea tomado y enviado por un proceso a la vez. |

### 6.2. Capa de Integración de Base de Datos (El "Espejo" Multi-DB)

| Riesgo / Posible Fallo | Impacto | Estrategia de Solución (Mitigación) |
| :--- | :--- | :--- |
| **Mala Clasificación de la IA (Falso Positivo de Comprobantes)** | La IA confunde la foto de una blusa con un recibo bancario. Cuando la clienta entra al link a confirmar, su foto no aparece. | **Botón de Fuga (Escape Hatch):** En el formulario de la tienda, agregar un botón: *"¿Faltan prendas?"*. Al tocarlo, avisa al Panel del administrador para revisión manual y muestra las fotos no categorizadas. |
| **Desajuste de Formato Numérico (El Asesino Silencioso)** | Un cliente se registra en la tienda como `72698959`. WhatsApp registra `59172698959`. La consulta cruzada devuelve vacío. | **Middleware de Normalización Estricta:** Implementar una utilidad global `formatPhoneToE164(phone)` en el backend. Tanto en la inserción de la DB de WhatsApp como en la búsqueda desde la Tienda, el número SIEMPRE pasará por este filtro antes de hacer la query SQL. |
| **Duplicación de Órdenes (Doble Submit)** | La clienta impaciente presiona el botón "Confirmar Prendas" tres veces rápido, creando 3 órdenes en la DB 1. | **Idempotencia y Bloqueo de UI:** Deshabilitar el botón inmediatamente al hacer clic (loading state). Además, en el backend, verificar si ese comprobante/chat ya fue conciliado ese día antes de permitir un nuevo `INSERT` en la tabla de pedidos. |

### 6.3. Capa de Autenticación y Experiencia de Usuario (Tienda)

| Riesgo / Posible Fallo | Impacto | Estrategia de Solución (Mitigación) |
| :--- | :--- | :--- |
| **Pérdida del PIN o Cambio de Dispositivo** | La clienta del Live entra al link pero no recuerda su PIN de la tienda y no puede confirmar. Abandona el proceso. | **Recuperación In-App:** Agregar flujo de "Olvidé mi PIN" que envíe automáticamente un código de 4 dígitos temporales por WhatsApp (usando el mismo Bridge de salida que acabamos de crear). |
| **Desincronización de Imágenes (Stale Data)** | La clienta abre el formulario. Mientras lo tiene abierto, manda otra foto por WhatsApp. Esa última foto no le aparece porque cargó la página antes. | **Boton de Recarga Suave:** Un botón de "Refrescar mis fotos" en la interfaz de la tienda que haga un nuevo `fetch` rápido a la DB 2 sin recargar toda la página. |
| **Confirmación Parcial Errónea** | La clienta pagó Bs 150 (3 prendas). Selecciona solo 1 prenda por error y le da a Confirmar. Faltarían Bs 100 sin conciliar. | **Verificación Visual Administrativa:** El sistema permite la confirmación, PERO en el Panel del Administrador (DB 1), el pedido entra con un tag *"Revisión de Monto"*, permitiendo al operador ver si el valor de las prendas cuadra con el comprobante verificado antes de asignar el casillero. |

### 6.4. Ejecución del Worker (Procesador de la Cola)

| Riesgo / Posible Fallo | Impacto | Estrategia de Solución (Mitigación) |
| :--- | :--- | :--- |
| **Detención del Envío por Cierre de Pestaña** | Si el envío progresivo (1 mensaje cada 3 min) depende del navegador del administrador, al cerrar Chrome la cola se paraliza. | **Arquitectura de Ejecución:** <br>Opción A (Fácil): El panel en React debe mostrar un Modal bloqueante que diga *"Deje esta pestaña abierta mientras se envían X mensajes"*. <br>Opción B (Robusta): Usar `pg_cron` en Supabase o Edge Functions agendadas (Cron) para que el servidor procese la tabla `whatsapp_message_queue` en segundo plano, independiente de la computadora del administrador. *(Se recomienda Opción B para producción)*. |

Esta auditoría garantiza que el desarrollo no será "feliz" (asumiendo que todo funciona siempre), sino una "programación defensiva", donde cada error previsible tiene una red de seguridad lista para actuar.
