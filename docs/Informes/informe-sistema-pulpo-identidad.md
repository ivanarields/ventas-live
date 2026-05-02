# Informe tecnico - Sistema Pulpo de identidad

## 1. Objetivo del documento

Este informe documenta el Sistema Pulpo como una pieza independiente y central dentro de Ventas Live. Los informes anteriores mencionan `identity_profiles` e `identity_evidence`, pero los tratan como identidad global dentro de otros flujos. Eso no es suficiente para una automatizacion robusta.

El Pulpo debe quedar documentado con nombre propio porque es el sistema que intenta responder una pregunta critica:

> Esta compra, este chat, este pago y este pedido, pertenecen a la misma clienta?

Sin una respuesta confiable a esa pregunta, la tienda online, WhatsApp, MacroDroid, pagos manuales, pedidos internos y casilleros pueden funcionar por separado, pero no como un sistema automatico coherente.

Este documento cubre:

- que es el Sistema Pulpo;
- que existe hoy en el codigo;
- que tablas usa;
- que funciones y endpoints lo alimentan;
- como calcula coincidencias y confianza;
- como influye en automatizacion;
- que riesgos tiene;
- que falta para convertirlo en una base confiable para automatizacion futura.

No se proponen cambios de codigo en este documento. Es un informe tecnico de analisis.

## 2. Correccion de enfoque

El Pulpo no debio quedar oculto dentro de otros informes como si fuera solo una tabla auxiliar. En realidad, el Pulpo es una capa transversal.

Los documentos anteriores cubrieron:

- tienda online;
- WhatsApp y ventas live;
- perfiles, preparacion y casilleros;
- datos y eventos para automatizacion.

Pero faltaba un informe dedicado a explicar como se unen los datos de una misma persona. Esa union es la base para automatizar sin crear duplicados, sin enviar mensajes a la clienta equivocada y sin preparar pedidos que no correspondan.

La correccion es esta:

- El Pulpo debe ser tratado como el motor de identidad y evidencia.
- El Pulpo no debe ser tratado como motor de decision final.
- El Pulpo conecta datos, pero no debe confirmar pagos, prendas ni casilleros por si solo cuando la confianza no sea suficiente.

## 3. Definicion del Sistema Pulpo

El Sistema Pulpo es el modulo de identidad unificada de Ventas Live. Su trabajo es recibir senales desde varios canales y agruparlas alrededor de una persona real.

Canales que conecta:

| Canal | Que aporta |
|---|---|
| Tienda online | nombre, telefono, pedidos, monto, productos |
| WhatsApp | telefono, chat, fotos, comprobantes, confirmaciones |
| MacroDroid | notificaciones bancarias, nombre de pagador, monto, hora |
| Pagos manuales | nombre registrado por operador, monto, fecha |
| Clientes internos | cliente operativo, historial, pedidos, casilleros |

El nombre "Pulpo" es adecuado porque el sistema tiene varios brazos:

- un brazo para tienda;
- un brazo para WhatsApp;
- un brazo para pagos;
- un brazo para clientes internos;
- un brazo para evidencia;
- un brazo para fusion y correccion.

Su responsabilidad principal es mantener un perfil unificado por clienta y conservar la evidencia que justifica cada vinculo.

## 4. Rol dentro de la automatizacion general

La automatizacion completa depende del Pulpo porque cada flujo necesita saber quien es la clienta.

Ejemplos:

- La tienda crea una compra. El Pulpo debe encontrar o crear el perfil de esa clienta.
- WhatsApp recibe fotos y comprobantes. El Pulpo debe asociarlos con el mismo perfil.
- MacroDroid detecta un pago. El Pulpo debe ayudar a conectarlo con la persona correcta.
- Un operador registra un pago manual. El Pulpo debe depositar evidencia historica.
- El sistema prepara un pedido interno. El Pulpo debe evitar crear una clienta duplicada.
- La clienta entra a su perfil visible. El Pulpo debe permitir mostrar sus pedidos y estados.

Sin el Pulpo, cada modulo puede crear su propia version de la clienta:

```text
store_customers      -> clienta de tienda
panel_clientes       -> contacto WhatsApp
customers/clientes   -> cliente interno
pagos                -> nombre de pagador
identity_profiles    -> perfil unificado
```

El objetivo del Pulpo es que esas piezas apunten a una identidad central cuando la evidencia sea suficiente.

## 5. Ubicacion actual en el proyecto

El sistema esta distribuido en varias partes del codigo:

| Area | Archivo | Responsabilidad |
|---|---|---|
| Servicio principal | `src/services/identityService.ts` | Matching, normalizacion, evidencia, confianza |
| Endpoints REST | `src/routes/identity.ts` | API de perfiles, evidencia, sync, merge y reassign |
| IA/WhatsApp | `src/routes/ai-gateway.ts` | Vincula telefono WhatsApp con nombre de comprobante |
| UI | `src/components/IdentityPanel.tsx` | Visualiza perfiles, evidencia, origen y fusion |
| Migracion base | `supabase/migrations/030_identity_system.sql` | Crea `identity_profiles` e `identity_evidence` |
| Migracion origin | `supabase/migrations/031_identity_origin.sql` | Agrega `origin` auto/manual |
| Montaje API | `server.ts` | Monta `/api/identity` e ingesta pagos manuales |

Esto confirma que el Pulpo ya existe como sistema funcional, aunque todavia necesita reglas mas estrictas para ser una base de automatizacion completa.

## 6. Tablas principales

### 6.1 `identity_profiles`

Representa un perfil unificado. Un registro deberia equivaler a una persona real.

Campos importantes:

| Campo | Funcion |
|---|---|
| `id` | Identificador del perfil Pulpo |
| `user_id` | Operador/dueño de los datos |
| `display_name` | Nombre canonico editable |
| `phone` | Telefono normalizado principal |
| `cliente_id` | Vinculo con cliente interno/casilleros |
| `store_phone` | Telefono usado en tienda online |
| `panel_phone` | Telefono usado en panel WhatsApp |
| `confidence` | Confianza del perfil |
| `merged_from` | Perfiles absorbidos por fusion |
| `origin` | `auto` si lo creo Pulpo, `manual` si lo ingreso operador |
| `created_at` | Fecha de creacion |
| `updated_at` | Fecha de actualizacion |

Lectura operativa:

- Si `phone`, `store_phone` y `panel_phone` coinciden o son compatibles, el perfil es fuerte.
- Si solo existe nombre sin telefono, el perfil es debil.
- Si tiene `cliente_id`, puede conectarse con el flujo interno.
- Si `origin = auto`, debe ser visible que fue creado por el sistema.
- Si `origin = manual`, debe respetarse como correccion humana.

### 6.2 `identity_evidence`

Representa evidencia que justifica por que un dato pertenece a un perfil.

Campos importantes:

| Campo | Funcion |
|---|---|
| `id` | Identificador de evidencia |
| `user_id` | Operador/dueño de los datos |
| `profile_id` | Perfil asociado |
| `source` | Canal de origen |
| `source_id` | ID del registro en el sistema origen |
| `source_ref` | Referencia adicional |
| `event_type` | Tipo de evento: pago, orden, contacto, mensaje |
| `amount` | Monto si aplica |
| `phone` | Telefono detectado |
| `name_raw` | Nombre original |
| `name_normalized` | Nombre normalizado |
| `event_at` | Fecha del evento de origen |
| `payload` | Datos extra del origen |
| `created_at` | Fecha de deposito de evidencia |

La evidencia es mas importante que el resultado final. Si un perfil queda mal vinculado, la evidencia permite corregirlo.

### 6.3 `origin`

La migracion `031_identity_origin.sql` agrega `origin` a `identity_profiles`.

Valores:

| Valor | Significado |
|---|---|
| `auto` | El Pulpo creo o matcheo automaticamente |
| `manual` | El operador lo ingreso manualmente |

Este campo es importante para auditoria. Un perfil creado automaticamente no tiene el mismo peso que una correccion manual hecha por el operador.

## 7. Fuentes de evidencia actuales

El esquema actual acepta estas fuentes:

| Fuente | Significado | Ejemplo |
|---|---|---|
| `manual_payment` | Pago registrado a mano | Operador crea pago desde la app |
| `macrodroid` | Notificacion bancaria | Pago detectado desde Android |
| `whatsapp` | Contacto, mensaje o comprobante WhatsApp | Chat o comprobante enviado |
| `store_order` | Pedido de tienda online | Compra realizada en la tienda |

Estas fuentes son suficientes para una primera automatizacion, pero conviene tratarlas con distinto peso:

| Fuente | Peso recomendado |
|---|---|
| WhatsApp con telefono | Alto |
| Tienda con telefono | Alto |
| Cliente interno con `cliente_id` | Alto |
| MacroDroid con nombre y monto | Medio |
| Pago manual solo con nombre | Bajo/medio |
| IA sin confirmacion | Bajo |

## 8. Funciones actuales del servicio

### 8.1 `normalizeName`

Normaliza nombres para poder comparar registros que vienen de distintas fuentes.

Comportamiento:

- convierte a mayusculas;
- remueve tildes;
- elimina caracteres que no son letras o espacios;
- compacta espacios;
- recorta extremos.

Utilidad:

- comparar nombres de pagos con nombres de perfiles;
- reducir diferencias por mayusculas/minusculas;
- detectar coincidencias exactas o parciales.

Riesgo:

- dos personas con nombres parecidos pueden parecer la misma.
- el nombre no debe ser match definitivo cuando no existe telefono u otra evidencia.

### 8.2 `normalizePhone`

Normaliza telefonos, especialmente para Bolivia.

Comportamiento actual:

- si recibe 8 digitos, agrega `+591`;
- si recibe 10 o mas digitos, agrega `+`;
- si no puede normalizar, devuelve el texto recortado.

Utilidad:

- unir tienda, WhatsApp y clientes internos;
- resolver diferencias entre `72600000`, `59172600000` y `+59172600000`.

Riesgo:

- telefonos invalidos pueden quedar como texto.
- falta una politica mas estricta de validacion si se usara para automatizacion total.

### 8.3 `findOrCreateProfile`

Es la funcion principal del Pulpo. Busca un perfil existente o crea uno nuevo.

Orden de matching actual:

1. Telefono exacto.
2. `cliente_id`.
3. Nombre normalizado exacto.
4. Nombre parcial con coincidencia de palabras.
5. Creacion de perfil nuevo.

Resultado:

```json
{
  "profile": "identity_profile",
  "confidence": 1,
  "match_type": "phone_exact|name_exact|name_partial|new"
}
```

Lectura tecnica:

- `phone_exact` es un match fuerte.
- `cliente_id` tambien es fuerte, aunque se devuelve como tipo `phone_exact` en la implementacion actual.
- `name_exact` es probable, no definitivo.
- `name_partial` es riesgoso para automatizacion.
- `new` crea perfil cuando no hay coincidencia.

Recomendacion:

- Usar telefono y `cliente_id` como vinculos fuertes.
- Usar nombre exacto como sugerencia o match con revision cuando el impacto sea alto.
- Usar nombre parcial solo para sugerir posibles coincidencias.

### 8.4 `depositEvidence`

Guarda evidencia en `identity_evidence`.

Recibe:

- fuente;
- ID de origen;
- tipo de evento;
- monto;
- telefono;
- nombre;
- fecha;
- payload.

Responsabilidad:

- conservar el dato original;
- normalizar nombre y telefono;
- vincular la evidencia con un perfil.

Importancia:

- Ninguna automatizacion deberia modificar estados importantes sin dejar evidencia.
- La evidencia permite explicar por que el Pulpo vinculo un pago o pedido a una clienta.

### 8.5 `recalculateAllConfidences`

Recalcula la confianza de perfiles segun canales detectados.

Modelo actual:

| Caso | Confianza |
|---|---:|
| WhatsApp + 2 canales adicionales | 0.97 |
| WhatsApp + 1 canal adicional | 0.85 |
| Solo WhatsApp | 0.60 |
| Solo MacroDroid | 0.45 |
| Tiene telefono pero no WhatsApp | 0.55 |
| Solo pago manual sin telefono | 0.30 |

Lectura:

- WhatsApp tiene mucho peso porque aporta telefono/contacto directo.
- Multiples canales elevan confianza.
- MacroDroid solo no es suficiente para decisiones finales.
- Pago manual sin telefono es evidencia debil.

Recomendacion:

- Mantener la confianza como indicador visual y operativo.
- No usar confianza alta como permiso automatico para casillero.
- Usar confianza baja para crear revision manual o advertencias.

### 8.6 `ingestManualPayment`

Se llama cuando se registra un pago manual.

Hace:

- busca o crea perfil por nombre y `cliente_id`;
- deposita evidencia `manual_payment`;
- registra monto y fecha.

Importancia:

- Los pagos manuales tambien alimentan el Pulpo.
- Esto permite que pagos historicos ayuden a futuras coincidencias.

Riesgo:

- Si el pago manual tiene nombre mal escrito, puede crear o alimentar un perfil incorrecto.

## 9. Endpoints actuales

### 9.1 Perfiles

| Endpoint | Funcion |
|---|---|
| `GET /api/identity/profiles` | Lista perfiles, permite busqueda y filtro por fuente |
| `GET /api/identity/profiles/:id` | Devuelve perfil completo con evidencia |
| `POST /api/identity/profiles` | Crea o encuentra perfil por nombre/telefono |
| `PATCH /api/identity/profiles/:id` | Edita nombre, telefono, vinculos de tienda/panel/cliente |

Uso esperado:

- panel de identidad;
- correcciones manuales;
- integraciones de tienda o WhatsApp;
- busqueda de perfil antes de crear pedido.

### 9.2 Evidencia

| Endpoint | Funcion |
|---|---|
| `POST /api/identity/profiles/:id/evidence` | Deposita evidencia manual o desde integraciones |
| `GET /api/identity/evidence` | Lista evidencia por perfil, fuente o limite |
| `PATCH /api/identity/evidence/:id/reassign` | Reasigna evidencia a otro perfil |

Uso esperado:

- auditar por que un dato pertenece a una clienta;
- corregir matches incorrectos;
- alimentar el Pulpo sin tocar directamente perfiles.

### 9.3 Resolucion

| Endpoint | Funcion |
|---|---|
| `POST /api/identity/resolve` | Busca perfil por nombre o telefono sin crearlo |

Uso esperado:

- validar antes de automatizar;
- mostrar sugerencias al operador;
- evitar crear perfiles duplicados.

Limitacion:

- Solo resuelve telefono exacto o nombre exacto.
- Si no encuentra coincidencia, responde sin crear.

### 9.4 Sincronizaciones

| Endpoint | Fuente | Funcion |
|---|---|---|
| `POST /api/identity/sync-store` | Tienda online | Lee `store_orders` y deposita evidencia `store_order` |
| `POST /api/identity/sync-whatsapp` | Panel WhatsApp | Lee `panel_clientes` y deposita evidencia `whatsapp` |
| `POST /api/identity/sync-pagos` | Pagos | Lee `pagos` y deposita evidencia `manual_payment` o `macrodroid` |

Uso esperado:

- backfill de datos existentes;
- reconstruccion de perfiles;
- sincronizacion entre modulos.

Riesgo:

- Son procesos de backfill; deben ser idempotentes.
- Actualmente revisan `source_id` existente, pero el esquema deberia reforzar unicidad para automatizacion fuerte.

### 9.5 Fotos de WhatsApp

| Endpoint | Funcion |
|---|---|
| `GET /api/identity/whatsapp-photos?phone=...&date=...&days=...` | Busca fotos de WhatsApp cercanas a una fecha |

Uso esperado:

- tienda espejo;
- confirmacion de prendas por clienta;
- conciliacion de ventas live.

Importancia:

- Este endpoint muestra que el Pulpo no solo une nombres. Tambien puede servir para recuperar evidencia visual por telefono.

### 9.6 Fusion y correccion

| Endpoint | Funcion |
|---|---|
| `POST /api/identity/profiles/:id/merge` | Fusiona un perfil origen dentro de un perfil destino |
| `PATCH /api/identity/evidence/:id/reassign` | Mueve evidencia a otro perfil |
| `POST /api/identity/recalculate-confidence` | Recalcula confianza de todos los perfiles |

Uso esperado:

- corregir duplicados;
- reparar evidencia mal asignada;
- subir o bajar confianza despues de nuevos datos.

Riesgo:

- Fusionar elimina el perfil origen.
- Debe haber auditoria suficiente para entender que se fusiono y por que.

## 10. Flujos actuales del Pulpo

### 10.1 Flujo desde pago manual

```text
Operador registra pago
  -> server.ts llama ingestManualPayment
  -> findOrCreateProfile(nombre, clienteId)
  -> depositEvidence(source = manual_payment)
  -> perfil queda alimentado
```

Estado:

- Existe.
- Esta conectado al flujo de pagos.
- Es util para historial.

Riesgo:

- Si el nombre manual esta mal escrito, puede crear perfil nuevo incorrecto.

### 10.2 Flujo desde tienda online

```text
sync-store
  -> lee store_orders
  -> findOrCreateProfile(customer_name, customer_wa)
  -> actualiza store_phone
  -> deposita evidence source = store_order
  -> recalcula confianza
```

Estado:

- Existe como backfill/sync.
- Permite que pedidos de tienda alimenten identidad.

Parcial:

- No necesariamente esta acoplado en tiempo real a cada checkout.
- Falta convertirlo en parte obligatoria del flujo de compra si se quiere automatizacion total.

### 10.3 Flujo desde WhatsApp

```text
sync-whatsapp
  -> lee panel_clientes
  -> findOrCreateProfile(nombre, phone)
  -> actualiza panel_phone
  -> deposita evidence source = whatsapp
  -> recalcula confianza
```

Estado:

- Existe.
- WhatsApp es fuente fuerte por telefono.

Parcial:

- El contacto se sincroniza, pero no necesariamente cada mensaje o cada media como evidencia individual.
- La propuesta de prendas por IA debe seguir conectandose con este perfil.

### 10.4 Flujo desde pagos existentes

```text
sync-pagos
  -> lee pagos
  -> decide source segun method
  -> findOrCreateProfile(nombre, customer_id)
  -> deposita evidence
  -> recalcula confianza
```

Estado:

- Existe.
- Sirve para alimentar identidad con pagos historicos.

Riesgo:

- Pago MacroDroid puede tener nombre sin telefono.
- Nombre igual o parecido no deberia fusionar sin cuidado.

### 10.5 Flujo desde IA/WhatsApp/comprobante

En `ai-gateway.ts`, el resumen de conversacion intenta vincular:

```text
telefono WhatsApp + nombre del comprobante
  -> findOrCreateProfile
  -> actualiza panel_phone/display_name si aplica
  -> busca duplicado por nombre
  -> auto-merge si encuentra duplicado
  -> depositEvidence(source = whatsapp, event_type = comprobante_pago)
```

Estado:

- Existe.
- Es una de las partes mas potentes del Pulpo.
- Conecta conversacion, comprobante y perfil.

Riesgo:

- El auto-merge por nombre puede ser agresivo si dos personas tienen nombres parecidos o iguales.
- Deberia existir revision manual para casos con confianza media/baja.

## 11. Matching actual

### 11.1 Telefono exacto

Es el match mas fuerte.

Ejemplo:

```text
WhatsApp: 59170000000
Tienda:   70000000
Pulpo:    +59170000000
```

Si normalizacion funciona, ambos deben apuntar al mismo perfil.

Recomendacion:

- Usar telefono como llave fuerte.
- Estandarizar siempre antes de guardar y buscar.
- Guardar tambien el valor original en evidencia cuando sea necesario.

### 11.2 `cliente_id`

Es un vinculo fuerte con el sistema interno.

Uso actual:

- `findOrCreateProfile` busca por `cliente_id`.
- Si lo encuentra, devuelve perfil existente.

Recomendacion:

- Tratar `cliente_id` como enlace operativo.
- No duplicar perfil si ya existe `cliente_id`.

### 11.3 Nombre normalizado exacto

Es un match probable.

Ejemplo:

```text
"Maria Jose Perez"
"MARIA JOSE PEREZ"
"María José Pérez"
```

Todos pueden normalizarse igual.

Riesgo:

- Dos clientas pueden tener el mismo nombre.
- Un pagador puede no ser la clienta.
- El nombre bancario puede venir incompleto.

Recomendacion:

- Usar nombre exacto para sugerir match.
- Permitir automatizacion solo si hay otra evidencia fuerte.

### 11.4 Nombre parcial

Es el match mas riesgoso.

Uso actual:

- Si al menos dos palabras coinciden y el score supera el umbral, devuelve `name_partial`.

Riesgo:

- Puede unir personas equivocadas.
- Puede confundir familiares, nombres comunes o nombres incompletos.

Recomendacion:

- No usar para fusion automatica.
- Usar para mostrar "posibles perfiles".
- Enviar a revision manual si el resultado crearia pedido, confirmacion o pago.

### 11.5 Perfil nuevo

Si no hay match, se crea un perfil nuevo.

Riesgo:

- Si cada canal crea su propio perfil, aparecen duplicados.

Recomendacion:

- Crear perfil nuevo esta bien, pero debe quedar con `origin = auto`.
- Debe poder fusionarse despues.
- Debe depositarse evidencia desde el primer evento.

## 12. Modelo de confianza

El Pulpo ya calcula confianza por combinacion de canales.

### 12.1 Solo manual

Confianza baja.

Motivo:

- Puede tener solo nombre.
- Puede estar mal escrito.
- Puede no tener telefono.

Uso recomendado:

- Historial y sugerencia.
- No decision automatica de alta importancia.

### 12.2 Solo MacroDroid

Confianza baja/media.

Motivo:

- Puede tener nombre y monto.
- Normalmente no tiene telefono.
- El nombre del pagador puede no ser la clienta.

Uso recomendado:

- Crear candidato de pago.
- Vincular si hay pedido con monto y otra evidencia.
- Si falta nombre real o hay ambiguedad, revision manual.

### 12.3 Solo WhatsApp

Confianza media.

Motivo:

- Tiene telefono.
- Es el canal de conversacion directa.
- Puede no tener nombre real confirmado.

Uso recomendado:

- Crear o vincular perfil.
- Preparar propuesta de pedido.
- No confirmar pago solo por mensaje.

### 12.4 WhatsApp + otros canales

Confianza alta.

Motivo:

- Telefono + pedido de tienda.
- Telefono + pago.
- Telefono + cliente interno.

Uso recomendado:

- Automatizar prellenado.
- Encolar mensajes.
- Vincular pedidos con menos friccion.
- Mantener revision para acciones sensibles si hay conflictos.

## 13. Influencia directa en cada modulo

### 13.1 Tienda online

El Pulpo debe permitir:

- crear perfil automaticamente al checkout;
- vincular `store_order` a una identidad;
- guardar `store_phone`;
- depositar evidencia `store_order`;
- buscar si esa clienta ya existe por WhatsApp o cliente interno.

Flujo ideal:

```text
Checkout tienda
  -> normalizar telefono
  -> findOrCreateProfile
  -> depositEvidence(store_order)
  -> vincular store_order con profile_id
  -> esperar pago/verificacion
```

Beneficio:

- la clienta puede tener perfil visible;
- el pedido no queda aislado;
- el pago de MacroDroid puede conectarse mas facil.

### 13.2 WhatsApp y ventas live

El Pulpo debe permitir:

- identificar clienta por telefono de WhatsApp;
- conectar comprobante con conversacion;
- guardar evidencia de contacto;
- usar fotos cercanas para seleccion de prendas;
- evitar crear varias clientas para el mismo numero.

Flujo ideal:

```text
Mensaje WhatsApp
  -> normalizar telefono
  -> findOrCreateProfile(phone)
  -> depositEvidence(whatsapp)
  -> IA resume y propone prendas
  -> operador/clienta confirma
```

Beneficio:

- las ventas live pasan de chat desordenado a flujo trazable.

### 13.3 MacroDroid y pagos

El Pulpo debe permitir:

- depositar evidencia de pago detectado;
- cruzar nombre/monto con pedidos;
- elevar confianza si existe telefono o pedido previo;
- enviar a revision si solo hay nombre ambiguo.

Flujo ideal:

```text
Notificacion bancaria
  -> raw event
  -> parseo
  -> pago candidato
  -> Pulpo busca identidad por evidencia
  -> si seguro, vincula
  -> si dudoso, revision manual
```

Beneficio:

- menos pagos sueltos;
- menos nombres duplicados;
- mejor trazabilidad de confirmacion.

### 13.4 Clientes internos y casilleros

El Pulpo debe permitir:

- vincular `cliente_id` con identidad global;
- mostrar historial unificado;
- preparar pedido interno con el cliente correcto;
- evitar duplicar cliente antes de Mesa de Preparacion.

Regla importante:

- El Pulpo puede ayudar a elegir cliente.
- El Pulpo no debe asignar casillero.
- El backend de casilleros debe seguir asignando despues de confirmacion fisica.

### 13.5 Perfil visible para clienta

El Pulpo puede ser la base del perfil visible.

Deberia permitir:

- que la clienta vea pedidos de tienda;
- que vea pedidos nacidos por WhatsApp;
- que vea estados internos;
- que confirme prendas;
- que suba comprobante;
- que consulte progreso.

Riesgo:

- Si el Pulpo fusiona mal, una clienta podria ver datos de otra. Por eso los matches dudosos requieren revision antes de exponer informacion sensible.

## 14. Lo que ya existe

### 14.1 Base de datos

Existe:

- `identity_profiles`;
- `identity_evidence`;
- indices por `user_id`, telefono, cliente, fuente y fecha;
- `origin` auto/manual;
- trigger de `updated_at`.

### 14.2 Servicio

Existe:

- normalizacion de nombre;
- normalizacion de telefono;
- busqueda/creacion de perfil;
- deposito de evidencia;
- listado de perfiles;
- consulta de perfil con evidencia;
- recalculo de confianza;
- ingesta desde pago manual.

### 14.3 API

Existe:

- CRUD parcial de perfiles;
- deposito/listado de evidencia;
- resolucion sin crear;
- sincronizacion desde tienda;
- sincronizacion desde WhatsApp;
- sincronizacion desde pagos;
- consulta de fotos de WhatsApp;
- fusion de perfiles;
- reasignacion de evidencia;
- estadisticas.

### 14.4 Integracion con WhatsApp/IA

Existe:

- resumen de conversacion;
- extraccion de datos de comprobante;
- vinculacion telefono WhatsApp + nombre comprobante;
- deposito de evidencia `whatsapp`;
- auto-merge por nombre duplicado.

### 14.5 UI

Existe:

- panel de identidad;
- indicador de origen automatico/manual;
- confianza;
- fuentes de evidencia;
- fusion manual.

## 15. Lo que esta parcialmente conectado

### 15.1 Tienda online en tiempo real

Existe `sync-store`, pero para automatizacion completa el checkout deberia alimentar el Pulpo en el momento de crear la orden, no solo por backfill.

### 15.2 WhatsApp por mensaje individual

Existe sincronizacion de contactos y evidencia desde resumen/comprobante, pero conviene guardar evidencia por eventos importantes:

- contacto nuevo;
- comprobante;
- confirmacion de prendas;
- propuesta aceptada;
- media usada en pedido.

### 15.3 MacroDroid como evidencia Pulpo

`sync-pagos` puede convertir pagos existentes en evidencia `macrodroid`, pero la ingesta bancaria ideal deberia depositar evidencia en el momento del parseo exitoso o de revision aprobada.

### 15.4 Revision manual

Existen herramientas de merge y reassign, pero falta formalizar una bandeja de matches dudosos:

- posible duplicado;
- nombre exacto sin telefono;
- nombre parcial;
- telefono conflictivo;
- evidencia contradictoria.

### 15.5 Auditoria de fusion

`merged_from` conserva IDs, pero para automatizacion fuerte deberia existir registro auditable de:

- quien fusiono;
- cuando;
- por que;
- evidencia antes/despues.

## 16. Lo que falta para automatizacion confiable

### 16.1 Politica clara de matches

Definir que puede hacer el sistema con cada tipo de match:

| Match | Accion segura |
|---|---|
| Telefono exacto | Vincular automaticamente |
| `cliente_id` exacto | Vincular automaticamente |
| Nombre exacto + monto + ventana temporal | Sugerir o vincular con revision segun riesgo |
| Nombre exacto solo | Sugerir, no fusionar definitivo |
| Nombre parcial | Revision manual |
| Conflicto de telefono | Revision manual |

### 16.2 Idempotencia fuerte de evidencia

Hoy existe indice por `source, source_id`, pero para automatizacion completa conviene reforzar que una misma evidencia no se duplique por usuario/fuente/origen.

Regla recomendada:

```text
user_id + source + source_id = evidencia unica
```

Si no hay `source_id`, usar hash de payload o referencia de evento.

### 16.3 Revision manual de identidad

El Pulpo necesita una cola formal para dudas:

- `identity_possible_duplicate`;
- `identity_name_match_only`;
- `identity_phone_conflict`;
- `identity_low_confidence`;
- `identity_auto_merge_candidate`;
- `identity_evidence_conflict`.

### 16.4 Proteccion contra auto-merge agresivo

El auto-merge por nombre puede ser util, pero debe limitarse.

Regla recomendada:

- auto-merge solo con telefono exacto o `cliente_id`;
- nombre exacto puede sugerir merge;
- nombre parcial nunca debe fusionar automaticamente.

### 16.5 Perfil visible seguro

Antes de usar el Pulpo para mostrar datos a clientas, se debe asegurar que:

- el telefono este verificado;
- el perfil no tenga conflicto;
- los pedidos visibles pertenezcan a esa identidad;
- los datos sensibles no se expongan por match de nombre solamente.

### 16.6 Eventos de auditoria

Cada accion importante deberia registrar auditoria:

- perfil creado;
- evidencia depositada;
- perfil fusionado;
- evidencia reasignada;
- confianza recalculada;
- decision manual aplicada.

## 17. Riesgos tecnicos actuales

### 17.1 Fusion incorrecta por nombre parecido

El riesgo mas importante es unir dos clientas distintas por un nombre similar.

Impacto:

- pedidos mezclados;
- mensajes a persona equivocada;
- perfil visible mostrando informacion incorrecta;
- pagos atribuidos mal.

Mitigacion:

- usar telefono como match fuerte;
- enviar nombre parcial a revision;
- no auto-fusionar nombres sin telefono.

### 17.2 Telefonos con formatos distintos

WhatsApp puede guardar `591...`, tienda puede usar 8 digitos y el perfil puede usar `+591...`.

Impacto:

- duplicados;
- fotos no encontradas;
- pedidos no vinculados.

Mitigacion:

- normalizar siempre en backend;
- guardar variantes solo como evidencia;
- buscar con tolerancia, pero guardar canonico.

### 17.3 Evidencia duplicada

Si el sync corre varias veces o llega el mismo evento con diferente formato, puede duplicar evidencia.

Impacto:

- confianza inflada;
- historial ruidoso;
- decisiones mal calibradas.

Mitigacion:

- unicidad por `user_id + source + source_id`;
- hash cuando no haya ID externo;
- logs de skipped/created.

### 17.4 Auto-merge agresivo

El flujo de IA/WhatsApp actualmente puede fusionar duplicados por nombre.

Impacto:

- errores dificiles de detectar si los nombres son comunes.

Mitigacion:

- convertir auto-merge por nombre en sugerencia;
- exigir telefono, cliente_id o evidencia adicional para merge automatico;
- guardar auditoria de merge.

### 17.5 Pulpo tomando decisiones que no le corresponden

El Pulpo debe identificar, no decidir todo.

No deberia:

- confirmar pago;
- confirmar prendas;
- asignar casillero;
- marcar pedido como entregado;
- enviar mensaje irreversible sin cola.

Si el Pulpo hace demasiado, un error de identidad se convierte en error operativo.

### 17.6 Falta de revision manual para matches dudosos

Sin revision formal, los casos dudosos se resuelven de forma invisible.

Mitigacion:

- toda coincidencia baja/media con impacto operativo debe generar tarea.

## 18. Reglas recomendadas de decision

### 18.1 Lo que el Pulpo si puede hacer automaticamente

- Crear perfil con `origin = auto`.
- Depositar evidencia.
- Normalizar nombre y telefono.
- Vincular por telefono exacto.
- Vincular por `cliente_id`.
- Recalcular confianza.
- Sugerir duplicados.
- Prellenar datos en flujos de tienda o WhatsApp.

### 18.2 Lo que el Pulpo puede hacer con revision

- Fusionar por nombre exacto.
- Asociar pago sin telefono.
- Asociar comprobante sin notificacion MacroDroid.
- Unir perfiles con datos incompletos.
- Resolver conflictos entre tienda y WhatsApp.
- Reasignar evidencia sensible.

### 18.3 Lo que el Pulpo no deberia hacer solo

- Confirmar pago final.
- Confirmar prendas elegidas.
- Crear casillero.
- Marcar pedido como listo.
- Marcar pedido como entregado.
- Mostrar datos sensibles en perfil visible si la identidad no esta verificada.

## 19. Flujo ideal del Pulpo por evento

### 19.1 Evento de tienda

```text
store_order_created
  -> normalizar telefono
  -> resolve por telefono
  -> si existe, vincular
  -> si no existe, crear perfil auto
  -> depositar evidence store_order
  -> guardar profile_id en orden o referencia
```

Si hay conflicto:

```text
telefono pertenece a otro perfil con nombre distinto
  -> crear revision manual
  -> no fusionar
```

### 19.2 Evento de WhatsApp

```text
whatsapp_message_received
  -> normalizar telefono
  -> findOrCreateProfile(phone)
  -> actualizar panel_phone
  -> depositar evidence whatsapp
  -> asociar chat al profile_id
```

Si el mensaje contiene comprobante:

```text
extraer nombre/monto
  -> depositar evidence comprobante
  -> cruzar con payment_events/pagos
  -> si coincide, sugerir verificacion
  -> si no, revision manual
```

### 19.3 Evento MacroDroid

```text
bank_notification_received
  -> parsear nombre/monto
  -> crear payment candidate
  -> depositar evidence macrodroid
  -> buscar perfil por nombre y contexto
  -> si solo nombre, no fusionar fuerte
  -> si coincide con pedido/telefono, vincular
```

### 19.4 Evento de pedido interno

```text
internal_order_created
  -> requiere customer_id o identity_profile_id
  -> guardar origen
  -> mostrar en perfil
  -> esperar Mesa de Preparacion
```

El Pulpo ayuda a elegir identidad, pero el pedido fisico sigue controlado por el flujo interno.

## 20. Panel Pulpo recomendado

El panel actual ya muestra perfiles y evidencia. Para automatizacion completa, deberia evolucionar hacia un centro de control de identidad.

Secciones recomendadas:

| Seccion | Funcion |
|---|---|
| Perfiles | Lista de identidades |
| Evidencia | Historial por fuente |
| Duplicados sugeridos | Posibles fusiones |
| Conflictos | Telefonos/nombres contradictorios |
| Baja confianza | Perfiles que necesitan revision |
| Cambios recientes | Auditoria de fusiones y reasignaciones |

Acciones recomendadas:

- Fusionar perfiles.
- Reasignar evidencia.
- Marcar perfil como verificado.
- Separar perfil mal fusionado.
- Vincular cliente interno.
- Vincular telefono de tienda.
- Vincular telefono de WhatsApp.

## 21. Checklist de pruebas

### 21.1 Cliente existe solo en tienda

Pasos:

1. Crear orden de tienda con nombre y telefono.
2. Ejecutar o simular `sync-store`.
3. Verificar perfil Pulpo.
4. Verificar evidencia `store_order`.
5. Verificar `store_phone`.

Resultado esperado:

- Se crea un perfil con evidencia de tienda.
- No se crea duplicado si se repite el sync.

### 21.2 Cliente existe solo en WhatsApp

Pasos:

1. Crear contacto en panel WhatsApp.
2. Ejecutar `sync-whatsapp`.
3. Verificar perfil Pulpo.
4. Verificar `panel_phone`.
5. Verificar evidencia `whatsapp`.

Resultado esperado:

- Se crea o vincula perfil por telefono.
- Confianza queda acorde a solo WhatsApp.

### 21.3 Pago MacroDroid sin telefono

Pasos:

1. Crear pago bancario con nombre y monto.
2. Ejecutar `sync-pagos`.
3. Verificar evidencia `macrodroid`.
4. Revisar si crea perfil solo por nombre.

Resultado esperado:

- El pago se conserva como evidencia.
- Si no hay telefono ni pedido claro, no debe automatizar acciones finales.

### 21.4 WhatsApp + comprobante con mismo nombre

Pasos:

1. Tener contacto WhatsApp con telefono.
2. Procesar resumen con comprobante.
3. Extraer nombre del comprobante.
4. Vincular telefono + nombre.
5. Depositar evidencia.

Resultado esperado:

- El perfil queda con telefono WhatsApp y nombre mas completo.
- La evidencia guarda monto/nombre/hora.

### 21.5 Nombres parecidos

Casos:

- "Maria Perez".
- "Maria Jose Perez".
- "Maria Perez Rojas".

Resultado esperado:

- Nombre parcial no debe fusionar automaticamente en flujos sensibles.
- Debe quedar como sugerencia o revision.

### 21.6 Telefonos con formatos distintos

Casos:

- `70000000`.
- `59170000000`.
- `+59170000000`.

Resultado esperado:

- Todos normalizan al mismo formato canonico.
- No se crean tres perfiles distintos.

### 21.7 Fusion manual

Pasos:

1. Crear dos perfiles de prueba.
2. Depositar evidencia en ambos.
3. Fusionar source dentro de target.
4. Revisar evidencia.
5. Revisar `merged_from`.

Resultado esperado:

- La evidencia queda en el perfil destino.
- El perfil origen se elimina.
- El destino conserva vinculos faltantes.

### 21.8 Reasignacion de evidencia

Pasos:

1. Tomar evidencia asignada a perfil equivocado.
2. Usar reassign.
3. Verificar perfil nuevo.

Resultado esperado:

- La evidencia se mueve sin borrar payload.
- El historial sigue consultable.

### 21.9 Recalculo de confianza

Pasos:

1. Crear perfiles con distintas fuentes.
2. Ejecutar recalculo.
3. Comparar confianza.

Resultado esperado:

- Solo manual queda bajo.
- Solo WhatsApp queda medio.
- WhatsApp + otros canales queda alto.

## 22. Checklist de seguridad y privacidad

Antes de usar el Pulpo para perfil visible de clienta:

- Verificar telefono.
- No mostrar pedidos por match de nombre solamente.
- No mostrar fotos si el telefono no coincide.
- No exponer pagos de otra clienta.
- No usar perfiles de baja confianza para acceso externo.
- Registrar toda fusion manual o automatica.

Antes de enviar WhatsApp automatico:

- Confirmar telefono canonico.
- Confirmar que el mensaje apunta al pedido correcto.
- Usar cola con idempotencia.
- Evitar mensajes duplicados.
- Permitir cancelacion manual.

Antes de crear pedido interno:

- Confirmar identidad suficiente.
- Confirmar origen del pedido.
- Confirmar pago o revision.
- Evitar pedido duplicado para el mismo origen.

## 23. Prioridades de mejora

### Prioridad 1 - Politica de matching

Definir formalmente que hace el sistema con:

- telefono exacto;
- cliente_id;
- nombre exacto;
- nombre parcial;
- conflicto de telefono;
- perfil de baja confianza.

Esta politica debe guiar tienda, WhatsApp, pagos y perfil visible.

### Prioridad 2 - Idempotencia de evidencia

Reforzar que una evidencia no se duplique.

Clave recomendada:

```text
user_id + source + source_id
```

Cuando no exista `source_id`, usar hash del evento.

### Prioridad 3 - Revision manual de identidad

Crear o conectar una cola para:

- matches dudosos;
- fusiones sugeridas;
- conflictos;
- evidencia sin perfil;
- perfiles duplicados.

### Prioridad 4 - Auditoria de fusiones

Registrar:

- perfil destino;
- perfil origen;
- evidencia movida;
- actor;
- fecha;
- motivo;
- antes/despues.

### Prioridad 5 - Integracion en tiempo real

Hacer que cada evento importante alimente Pulpo al momento de ocurrir:

- checkout tienda;
- mensaje WhatsApp;
- comprobante;
- pago parseado;
- revision aprobada;
- pedido interno creado.

## 24. Preguntas pendientes para futura implementacion

Estas preguntas no bloquean el informe, pero deben resolverse antes de automatizar mas:

1. Que nivel de confianza minimo permite enviar un mensaje automatico?
2. Que nivel de confianza minimo permite mostrar pedidos en perfil visible?
3. El operador debe aprobar toda fusion por nombre?
4. Se permite auto-merge por nombre exacto si tambien coincide monto/fecha?
5. Que pasa si el telefono de tienda y WhatsApp difieren?
6. Como se separa una fusion incorrecta si ya se elimino el perfil origen?
7. El perfil visible se autentica por telefono, PIN, link magico o codigo WhatsApp?
8. Cuanto tiempo se conservan evidencias de fotos y comprobantes?
9. Que datos debe poder corregir el operador desde el Panel Pulpo?
10. Que eventos deben crear revision manual obligatoria?

## 25. Conclusion

El Sistema Pulpo es una pieza central para hacer que Ventas Live avance hacia automatizacion real. No reemplaza la tienda, WhatsApp, MacroDroid ni casilleros. Los conecta.

Su papel correcto es:

- unificar identidades;
- guardar evidencia;
- calcular confianza;
- sugerir vinculos;
- prevenir duplicados;
- preparar el camino para automatizacion.

Su papel incorrecto seria:

- confirmar pagos sin validacion;
- confirmar prendas sin clienta u operador;
- asignar casilleros;
- fusionar perfiles dudosos sin revision;
- exponer datos sensibles por matches debiles.

La recomendacion final es tratar el Pulpo como el sistema nervioso de identidad de la aplicacion. Si se fortalece con idempotencia, revision manual, auditoria y reglas claras de matching, puede permitir que tienda, WhatsApp, pagos y pedidos internos funcionen como un flujo automatico seguro sin reescribir toda la aplicacion.
