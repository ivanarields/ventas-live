# Reporte tecnico completo - Automatizacion Ventas Live

## 1. Proposito

Este reporte es el indice maestro para entender y planificar la automatizacion completa de Ventas Live.

No reemplaza los informes detallados. Su funcion es conectar los tres flujos principales:

1. Tienda online.
2. WhatsApp / Ventas Live.
3. Perfiles, preparacion y casilleros.

El objetivo general es convertir la aplicacion en un sistema semi-automatico:

```text
Cliente compra o escribe
  -> se crea/vincula perfil
  -> se registra evidencia
  -> se verifica pago
  -> se confirma pedido
  -> entra a preparacion
  -> operador confirma prendas y bolsas
  -> backend asigna casillero
  -> entrega libera casillero
```

La automatizacion debe mantener control manual en los puntos de riesgo: nombres faltantes, pagos ambiguos, prendas detectadas por IA y conteo fisico de bolsas/prendas.

## 2. Informes creados

| Informe | Archivo | Proposito |
|---|---|---|
| Flujo de tienda online | [`informe-flujo-tienda-online.md`](./informe-flujo-tienda-online.md) | Explica catalogo, carrito, checkout, perfil de tienda, pago, MacroDroid, revision manual, WhatsApp y pedido interno. |
| Flujo WhatsApp / Ventas Live | [`informe-flujo-whatsapp-ventas-live.md`](./informe-flujo-whatsapp-ventas-live.md) | Explica bridge, ingesta, panel, IA, comprobantes, propuesta de prendas, confirmacion por link y paso a preparacion. |
| Perfiles, preparacion y casilleros | [`informe-perfiles-preparacion-casilleros.md`](./informe-perfiles-preparacion-casilleros.md) | Explica identidad, clientes, pagos, pedidos internos, Mesa de Preparacion, funciones PL/pgSQL, etiquetas, casilleros y entrega. |

## 3. Estado general de la aplicacion

Ventas Live ya tiene una base fuerte. No hace falta rehacer toda la app para automatizar.

Ya existe:

- Frontend React/Vite con app interna y tienda.
- Backend Express en `server.ts`.
- Supabase como base principal.
- Proyecto separado para tienda mediante `supabaseStore`.
- Proyecto separado para panel WhatsApp mediante `supabasePanel`.
- Auth principal por Supabase.
- Auth de tienda por WhatsApp + PIN.
- CRUD de clientes, pagos y pedidos.
- Tienda online con productos, carrito, checkout y pedidos.
- Bridge WhatsApp con `whatsapp-web.js`.
- Ingesta de mensajes WhatsApp a panel.
- IA con Gemini para resumen, imagenes y comprobantes.
- MacroDroid para notificaciones bancarias.
- Sistema de identidad global.
- Cola de mensajes WhatsApp.
- Mesa de Preparacion.
- Sistema de etiquetas/casilleros en PostgreSQL.

Lo que falta no es una pieza grande nueva, sino unificar contratos:

- estados;
- nombres de columnas;
- fuente de verdad de perfiles;
- flujo manual de revision;
- paso seguro desde tienda/WhatsApp hacia preparacion;
- perfil visible de clienta;
- auditoria de confirmaciones.

## 4. Vision de arquitectura recomendada

La arquitectura recomendada es por capas:

```text
Canales de entrada
  - Tienda online
  - WhatsApp
  - MacroDroid
  - Registro manual

Nucleo de identidad y evidencia
  - identity_profiles
  - identity_evidence
  - customers
  - store_customers
  - panel_clientes

Nucleo de pedido/verificacion
  - pedido de tienda
  - propuesta WhatsApp
  - pago automatico o manual
  - revision manual

Operacion interna
  - pagos
  - pedidos
  - Mesa de Preparacion

Logistica fisica
  - orders
  - order_bags
  - storage_containers
  - container_allocations
```

La regla mas importante es que los canales externos no deben asignar casilleros directamente. Todos deben terminar en `pedidos.status = 'procesar'` y esperar que el operador confirme fisicamente prendas y bolsas.

## 5. Flujo unificado recomendado

### 5.1 Entrada desde tienda

```text
Catalogo
  -> carrito
  -> WhatsApp + PIN
  -> store_customer
  -> store_order pending
  -> pago
  -> MacroDroid/comprobante/manual
  -> pago verificado
  -> mensaje WhatsApp
  -> pedido interno `procesar`
  -> preparacion
```

Detalles completos: [`informe-flujo-tienda-online.md`](./informe-flujo-tienda-online.md).

### 5.2 Entrada desde WhatsApp

```text
Mensaje/foto/audio
  -> bridge
  -> panel_clientes + panel_mensajes
  -> identidad global
  -> resumen IA
  -> propuesta de prendas
  -> operador revisa
  -> link de confirmacion
  -> clienta confirma
  -> pago verificado/manual
  -> pedido interno `procesar`
  -> preparacion
```

Detalles completos: [`informe-flujo-whatsapp-ventas-live.md`](./informe-flujo-whatsapp-ventas-live.md).

### 5.3 Entrada desde pago manual o MacroDroid

```text
Pago registrado
  -> customers
  -> pagos
  -> identity_evidence
  -> pedidos `procesar`
  -> preparacion
```

Detalles completos: [`informe-perfiles-preparacion-casilleros.md`](./informe-perfiles-preparacion-casilleros.md).

## 6. Decisiones tecnicas recomendadas

### 6.1 Automatizacion semi-automatica

Automatizar:

- creacion/vinculacion de perfiles;
- registro de evidencia;
- cruce de pagos;
- creacion de pedidos internos verificados;
- mensajes WhatsApp;
- seguimiento de estados.

Mantener manual:

- revision de pagos ambiguos;
- correccion de propuesta IA;
- confirmacion del operador antes de preparar;
- conteo final de prendas y bolsas;
- entrega.

### 6.2 Perfil de clienta como portal comun

Cada numero de WhatsApp debe tener un perfil visible en tienda.

Ese perfil debe mostrar:

- pedidos de tienda;
- pedidos por WhatsApp/Live;
- prendas pendientes de confirmar;
- pago pendiente/verificado;
- preparacion;
- listo;
- entregado.

### 6.3 Identidad global como puente

Usar `identity_profiles` como tabla de union logica:

```text
identity_profiles
  -> cliente_id -> customers.id
  -> store_phone -> store_customers.whatsapp
  -> panel_phone -> panel_clientes.phone
```

Cada evento importante debe depositar evidencia en `identity_evidence`.

### 6.4 Preparacion como frontera fisica

La Mesa de Preparacion debe ser el punto donde se confirma la realidad fisica:

- cantidad real de prendas;
- cantidad real de bolsas;
- pedido listo;
- asignacion de casillero.

Antes de Mesa, todo es digital. Despues de Mesa, ya se puede ocupar casillero.

### 6.5 No inventar datos

Reglas:

- No inventar nombres de pagadores.
- No inventar prendas desde fotos ambiguas.
- No verificar pagos solo por imagen si no hay evidencia suficiente.
- No crear identidades definitivas con nombres placeholder.
- En duda, revision manual.

## 7. Riesgos principales

| Riesgo | Impacto | Prioridad |
|---|---|---|
| Estados inconsistentes en `store_orders` | Puede romper checkout, admin y verificacion. | Alta |
| Columnas no alineadas en tienda (`customer_phone` vs `customer_wa`) | Puede romper seguimiento y matching. | Alta |
| Eventos WhatsApp de tienda no unificados (`wa_events` vs `wa_messages`/panel) | Auditoria incompleta. | Alta |
| Nombres placeholder | Ensucia identidad y pagos. | Alta |
| IA tomando decisiones finales | Puede crear pedidos incorrectos. | Alta |
| Casillero antes de contar bolsas | Error fisico operativo. | Alta |
| Perfiles duplicados | Historial fragmentado. | Media/Alta |
| RLS pendiente | Riesgo para produccion multiusuario. | Media/Alta |
| Definiciones faltantes de tablas de tienda | Dificulta despliegue reproducible. | Media/Alta |

## 8. Ruta de implementacion recomendada

### Fase 1 - Normalizar tienda

- Definir estados canonicos de `store_orders`.
- Alinear backend, UI y migraciones.
- Elegir campo unico para telefono de tienda.
- Formalizar `store_customers` y `products` en migraciones.
- Centralizar confirmacion en `confirmStoreOrder`.

Resultado:

- tienda puede operar con pago automatico/manual y crear pedido interno sin romper flujo.

### Fase 2 - Nucleo de identidad y evidencia

- Asegurar que tienda, WhatsApp, pago manual y MacroDroid depositen evidencia.
- Mejorar merge de perfiles duplicados.
- Definir reglas para perfiles parciales por telefono.
- Evitar nombres falsos.

Resultado:

- todos los canales apuntan a la misma persona.

### Fase 3 - Perfil visible de clienta

- Unificar pedidos de tienda y WhatsApp.
- Mostrar estado de pago/preparacion/entrega.
- Permitir confirmacion de prendas.

Resultado:

- la clienta puede seguir sus pedidos sin depender solo del chat.

### Fase 4 - Flujo WhatsApp con IA

- Crear modelo de propuesta de pedido WhatsApp.
- IA genera propuesta, no pedido final.
- Operador revisa/corrige.
- Se envia link de confirmacion.
- Clienta confirma.

Resultado:

- WhatsApp se convierte en flujo ordenado y auditable.

### Fase 5 - Pago y revision manual

- Cruzar propuestas/ordenes con MacroDroid.
- Si no hay match confiable, crear revision manual.
- Registrar aprobacion manual con auditoria.

Resultado:

- menos pagos perdidos y menos errores de verificacion.

### Fase 6 - Preparacion y casilleros

- Todo canal crea `pedidos` en `procesar`.
- Mesa confirma prendas/bolsas.
- Backend asigna casillero.
- Entrega libera casillero.

Resultado:

- automatizacion conectada con operacion fisica sin perder control.

## 9. Pruebas maestras de aceptacion

### 9.1 Tienda

- Clienta compra producto.
- Se crea perfil de tienda.
- Se crea orden pendiente.
- MacroDroid confirma pago.
- Se encola WhatsApp.
- Se crea pedido interno.
- Operador prepara.
- Casillero se asigna.
- Entrega libera.

### 9.2 WhatsApp

- Clienta envia fotos.
- Bridge guarda mensajes/media.
- IA propone pedido.
- Operador corrige/aprueba.
- Clienta confirma por link.
- Pago se verifica o va a revision.
- Pedido pasa a preparacion.
- Casillero se asigna despues de conteo.

### 9.3 Manual

- Operador registra pago.
- Se crea pedido.
- Se prepara.
- Se asigna casillero.
- Se entrega.

### 9.4 Identidad

- Mismo telefono entra por tienda, WhatsApp y pago.
- Se vincula a un `identity_profile`.
- Evidencias quedan guardadas.
- Perfil interno y perfil de clienta muestran historial coherente.

### 9.5 Casilleros

- 1 bolsa asigna numero.
- 2+ bolsas asigna letra.
- Correccion simple -> complejo migra.
- Correccion complejo -> simple downgradea.
- Entrega libera.
- Historial permanece.

## 10. Orden recomendado de lectura

1. Leer este reporte maestro.
2. Leer [`informe-flujo-tienda-online.md`](./informe-flujo-tienda-online.md).
3. Leer [`informe-flujo-whatsapp-ventas-live.md`](./informe-flujo-whatsapp-ventas-live.md).
4. Leer [`informe-perfiles-preparacion-casilleros.md`](./informe-perfiles-preparacion-casilleros.md).

## 11. Conclusion

La aplicacion ya esta cerca de poder automatizarse. El avance mas seguro no es reescribir, sino ordenar el sistema alrededor de tres ideas:

1. Identidad global con evidencia.
2. Pedidos externos que terminan en `procesar`.
3. Casilleros asignados solo despues de confirmar prendas y bolsas.

Con esta arquitectura, Ventas Live puede automatizar tienda, WhatsApp, pagos, confirmaciones y seguimiento sin perder el control humano donde mas importa.
