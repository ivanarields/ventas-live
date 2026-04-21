# Fase 3 — Conector WhatsApp y servicio Node.js
**Modelo recomendado:** Gemini 3.1 Pro (High)

## Objetivo de esta fase
Construir o adaptar el servicio Node.js que escucha mensajes de WhatsApp y los envía al webhook de n8n.

## Entradas que debes darle
Pásale:
- arquitectura general
- variables de entorno
- payload objetivo a n8n
- código orientativo del listener
- notas sobre LocalAuth / RemoteAuth
- despliegue sugerido en Railway o Render

## Lo que debe entregar
1. Estructura de proyecto Node.js.
2. Archivos mínimos necesarios.
3. Listener funcional para `message_create`.
4. Descarga de media con `downloadMedia()`.
5. POST al webhook de n8n.
6. Manejo básico de errores, logs y reconexión.
7. README de despliegue.

## Prompt sugerido
Necesito que construyas el servicio Node.js para este MVP de WhatsApp.

Requisitos:
- usar whatsapp-web.js o una base equivalente,
- escuchar mensajes entrantes y salientes,
- descargar media cuando exista,
- enviar todo a un webhook de n8n,
- usar variables de entorno,
- estar listo para desplegar en Railway o Render,
- dejar código claro, simple y operativo.

Prioridades:
1. primero funcionamiento,
2. luego robustez mínima,
3. luego documentación.

Entrega:
- estructura de carpetas,
- package.json,
- archivos fuente,
- `.env.example`,
- README de despliegue.

## Salida esperada
- `node-service/`
- `README-despliegue.md`
- `env-example.txt`
