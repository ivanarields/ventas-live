# Contexto Codex - Indice Operativo

Actualizado: 2026-05-20.

Este folder documenta el funcionamiento actual de la aplicacion para operadores y para auditoria posterior por otra IA.

La verdad principal es:

1. Codigo actual del repositorio.
2. Produccion desplegada el 2026-05-20.
3. Ultima conversacion de cierre del 2026-05-20.

Los documentos anteriores a esa fecha deben leerse solo como historia, no como regla actual, si contradicen este indice o el documento maestro.

## Documentos vigentes

| Documento | Uso |
|---|---|
| `01-app-principal.md` | Panel del operador, etiquetas, pedidos, entregas y pestañas principales |
| `02-sistema-pagos.md` | Pagos Live, pagos tienda, MacroDroid, WhatsApp y revision manual |
| `03-whatsapp-bridge.md` | Bridge WhatsApp y cola de mensajes |
| `04-tienda-online.md` | Funcionamiento completo de la tienda online |
| `05-estado-pendientes.md` | Que esta hecho, que falta probar y riesgos conocidos |
| `06-clientes-verificados.md` | Regla oficial de cliente verificado |
| `07-entrega-auditoria-ia.md` | Documento maestro para operador y auditoria de otra IA |

## Direcciones actuales

| Servicio | Direccion |
|---|---|
| Produccion principal | `https://leidycandy.me` |
| Alias de produccion | `https://leidydiaz.live` |
| Tienda | `https://leidycandy.me/tienda` |
| Health API | `https://leidycandy.me/api/health` |
| WhatsApp bridge | `http://134.122.123.253:3001` |
| MacroDroid receiver | `http://134.122.123.253:3002/api/ingest-notification` |

## Acceso del panel

Login simple oficial:

```text
usuario: leidycandy
PIN: 7020
```

Ese login entra al usuario dueño real de la tienda. No crea un usuario nuevo.

## Regla de lectura para otra IA

Antes de auditar o cambiar algo:

1. Leer `07-entrega-auditoria-ia.md`.
2. Leer `04-tienda-online.md` para tienda.
3. Leer `02-sistema-pagos.md` para pagos, Live, MacroDroid y WhatsApp.
4. Leer `01-app-principal.md` para etiquetas y operacion diaria.
5. Revisar el codigo antes de afirmar que algo sigue vigente.

## Estado general

La aplicacion esta funcional y ya fue subida a produccion el 2026-05-20 con los ultimos cambios de tienda, cliente verificado, pagos dudosos y login simple.

Lo que falta antes de Play Store no es construir funciones nuevas. Falta cerrar pruebas finales reales desde celular y operador:

- tienda con pago exacto, menor, mayor;
- banco sin comprobante;
- comprobante sin banco;
- Live encendido y apagado;
- etiquetas/listo/entregado;
- Buffer encendido y apagado;
- perfil del cliente y retomar pedido.
