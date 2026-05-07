# Plan de migracion sin corte - WhatsApp Bridge Railway a Dokploy

**Fecha:** 2026-05-06  
**Estado:** Documento operativo para migracion  
**Objetivo:** mover el WhatsApp Bridge desde Railway hacia Dokploy en una VPS con Docker, manteniendo la app principal funcionando y minimizando el riesgo de perder la sesion actual de WhatsApp.

---

## 1. Resumen ejecutivo

El sistema actual de WhatsApp funciona como un puente persistente entre el WhatsApp del negocio y Ventas Live. El bridge esta corriendo en Railway y mantiene una sesion de WhatsApp Web activa mediante `whatsapp-web.js` + `LocalAuth`.

La migracion a Dokploy debe hacerse sin apagar la app principal. La app puede seguir funcionando con Railway hasta que el bridge en Dokploy este listo. El cambio real se hace actualizando `WHATSAPP_BRIDGE_URL` para que apunte al nuevo bridge.

Punto critico: WhatsApp Web no debe tener dos procesos activos usando la misma sesion al mismo tiempo. Por eso, el plan correcto es preparar Dokploy en paralelo, validar el contenedor y hacer un corte controlado de segundos/minutos para transferir la sesion o escanear QR.

---

## 2. Arquitectura actual

```text
WhatsApp del negocio
    ↕
WhatsApp Bridge en Railway
    - Node.js
    - whatsapp-web.js
    - Chromium/Puppeteer
    - LocalAuth en .wwebjs_auth/
    - Puerto 3000
    ↕
Ventas Live / Vercel / servidor principal
    - /api/whatsapp/status
    - /api/whatsapp/health
    - /api/whatsapp/send-next
    ↕
Supabase
    - panel_clientes
    - panel_mensajes
    - whatsapp_message_queue
    - Storage bucket whatsapp-media
```

Datos actuales documentados:

| Recurso | Valor |
|---|---|
| Bridge actual | `https://bridge-production-13f7.up.railway.app` |
| Plataforma actual | Railway |
| Variable en app principal | `WHATSAPP_BRIDGE_URL` |
| Secret de envio | `WEBHOOK_SECRET` |
| Telefono de prueba | `LIVE_SALES_TEST_PHONE` / `LIVE_SALES_TEST_PHONES` |
| Supabase panel WhatsApp | `vwaocoaeenavxkcshyuf` |
| Bucket de media | `whatsapp-media` |

---

## 3. Como esta hecho el bridge

El bridge esta en la carpeta `bridge/`.

Archivos principales:

| Archivo | Funcion |
|---|---|
| `bridge/index.js` | Proceso principal, crea cliente WhatsApp, expone servidor HTTP, captura QR, recibe mensajes y sube media. |
| `bridge/send.js` | Maneja `GET /api/health`, `POST /api/send` y CORS. |
| `bridge/Dockerfile` | Imagen Docker con Node 20, Chromium y dependencias para Puppeteer. |
| `bridge/package.json` | Dependencias: `whatsapp-web.js`, `axios`, `qrcode`, `dotenv`, `qrcode-terminal`. |
| `bridge/.env.example` | Variables base del bridge. |

Tecnologias usadas:

| Tecnologia | Uso |
|---|---|
| `whatsapp-web.js` | Conexion a WhatsApp Web. |
| `LocalAuth` | Guarda la sesion local en `.wwebjs_auth/`. |
| Chromium/Puppeteer | Navegador headless requerido por WhatsApp Web. |
| Node.js HTTP nativo | Servidor del bridge. |
| Axios | POST al webhook y subida directa de media. |
| Supabase Storage | Guarda fotos/audios/docs en bucket `whatsapp-media`. |
| Supabase Edge Function | Recibe eventos del bridge en `ingest-whatsapp`. |

---

## 4. Contrato HTTP del bridge

La app principal espera que el bridge mantenga estos endpoints compatibles:

### `GET /status`

Usado por `GET /api/whatsapp/status` de la app principal.

Respuesta esperada:

```json
{
  "connected": true,
  "qrDataUrl": null
}
```

Cuando no esta conectado, puede responder `connected: false` y `qrDataUrl` con el QR en base64.

### `GET /api/health`

Usado por el indicador de salud de WhatsApp.

Respuesta esperada:

```json
{
  "connected": true,
  "timestamp": "2026-05-06T00:00:00.000Z",
  "service": "whatsapp-bridge"
}
```

### `POST /api/send`

Usado por `POST /api/whatsapp/send-next` para enviar mensajes desde la cola.

Headers:

```http
Content-Type: application/json
x-webhook-secret: <WEBHOOK_SECRET>
```

Body:

```json
{
  "phone": "+59172698959",
  "message": "Texto del mensaje"
}
```

Respuesta correcta:

```json
{
  "ok": true,
  "chatId": "59172698959@c.us",
  "sent_at": "2026-05-06T00:00:00.000Z"
}
```

---

## 5. Flujo de mensajes entrantes

Cuando llega un mensaje al WhatsApp del negocio:

1. `whatsapp-web.js` dispara `message_create`.
2. El bridge intenta obtener el numero real con `msg.getContact()`.
3. Normaliza el telefono.
4. Si el mensaje tiene media, ejecuta `downloadMedia()`.
5. Sube el archivo a Supabase Storage en `whatsapp-media`.
6. Arma el payload.
7. Envia el payload a `WEBHOOK_URL`, que apunta a la Edge Function `ingest-whatsapp`.
8. La ingesta crea/actualiza `panel_clientes`.
9. Inserta el mensaje en `panel_mensajes`.
10. La app principal puede luego procesar la conversacion con IA.

Payload enviado por el bridge:

| Campo | Descripcion |
|---|---|
| `id` | ID serializado del mensaje de WhatsApp. |
| `from` | ID raw de WhatsApp. |
| `fromPhone` | Numero real normalizado cuando esta disponible. |
| `fromMe` | `true` si el mensaje fue enviado desde el WhatsApp del negocio. |
| `to` | Destinatario raw. |
| `body` | Texto del mensaje. |
| `hasMedia` | Indica si trae archivo. |
| `mediaMimetype` | MIME del archivo. |
| `mediaUrl` | URL publica del archivo en Supabase Storage. |
| `timestamp` | Timestamp del mensaje. |

---

## 6. Flujo de mensajes salientes

Cuando la app quiere enviar un WhatsApp:

1. La app encola el mensaje en `whatsapp_message_queue`.
2. El frontend/panel llama `POST /api/whatsapp/send-next`.
3. El backend principal toma un mensaje con `fn_dequeue_whatsapp_message`.
4. El backend llama al bridge: `POST <WHATSAPP_BRIDGE_URL>/api/send`.
5. El bridge valida `x-webhook-secret`.
6. Si WhatsApp esta conectado, ejecuta `client.sendMessage()`.
7. Si sale bien, la app marca el mensaje como `sent`.
8. Si falla, la app marca el mensaje como `failed` y queda disponible para reintento.

Este diseno protege contra caidas: si el bridge esta desconectado, no se pierde el mensaje; queda en la cola o queda como fallido para reintento.

---

## 7. Como se mantiene la sesion de WhatsApp

El bridge usa:

```js
authStrategy: new LocalAuth({ dataPath: join(__dirname, '.wwebjs_auth') })
```

Eso significa que la sesion vive en:

```text
bridge/.wwebjs_auth/
```

Para que Dokploy no pierda la sesion en reinicios, redeploys o actualizaciones, esa carpeta debe estar en un volumen persistente de Docker.

Regla critica:

```text
Sin volumen persistente = riesgo de perder sesion y pedir QR de nuevo.
Con volumen persistente = reinicios seguros sin reescanear QR.
```

Nota importante: si la sesion actual de Railway no se puede exportar, la migracion requerira escanear un QR una sola vez en Dokploy. Despues de ese QR, Dokploy debe conservar `.wwebjs_auth/` en volumen persistente.

---

## 8. Arquitectura objetivo en Dokploy

```text
WhatsApp del negocio
    ↕
Bridge en Dokploy
    - App Docker
    - Imagen desde bridge/Dockerfile
    - Volumen persistente: /app/.wwebjs_auth
    - Puerto interno: 3000
    - Dominio: https://bridge.<dominio>
    - Auto restart habilitado
    ↕
App principal Ventas Live
    - WHATSAPP_BRIDGE_URL=https://bridge.<dominio>
    - WEBHOOK_SECRET igual al actual
    ↕
Supabase
```

Recomendado:

| Recurso | Recomendacion |
|---|---|
| VPS | DigitalOcean Droplet con Ubuntu 22.04/24.04 |
| RAM | 2 GB minimo, 4 GB recomendado |
| CPU | 1 vCPU minimo, 2 vCPU recomendado |
| Disco | 25 GB minimo, 50 GB recomendado |
| Plataforma | Dokploy sobre Docker |
| Dominio | `bridge.tudominio.com` |
| HTTPS | Gestionado por Dokploy/Traefik/Caddy segun configuracion |

---

## 9. Variables de entorno requeridas en Dokploy

Configurar estas variables en la app del bridge dentro de Dokploy:

```env
PORT=3000
WEBHOOK_URL=https://vwaocoaeenavxkcshyuf.supabase.co/functions/v1/ingest-whatsapp
SUPABASE_URL=https://vwaocoaeenavxkcshyuf.supabase.co
SUPABASE_SERVICE_KEY=<SERVICE_ROLE_KEY_DEL_PANEL_WHATSAPP>
WEBHOOK_SECRET=<MISMO_SECRET_QUE_USA_LA_APP_PRINCIPAL>
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RAILWAY_ENVIRONMENT=true
```

Notas:

- `WEBHOOK_SECRET` debe ser el mismo que ya usa la app principal.
- `SUPABASE_SERVICE_KEY` debe ser la service key del proyecto del panel WhatsApp (`vwaocoaeenavxkcshyuf`), no la anon key.
- `RAILWAY_ENVIRONMENT=true` se conserva porque el codigo lo usa para activar ruta de Chromium y argumentos especiales de Puppeteer. El nombre es historico; en Docker/Dokploy sigue sirviendo.
- Si se quiere limpiar esto en el futuro, se puede renombrar a `DOCKER_ENVIRONMENT`, pero no es necesario para migrar.

---

## 10. Volumen persistente obligatorio

En Dokploy se debe montar un volumen persistente hacia:

```text
/app/.wwebjs_auth
```

Ejemplo conceptual de Docker Compose:

```yaml
services:
  whatsapp-bridge:
    build:
      context: ./bridge
      dockerfile: Dockerfile
    container_name: whatsapp-bridge
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      PORT: "3000"
      WEBHOOK_URL: "https://vwaocoaeenavxkcshyuf.supabase.co/functions/v1/ingest-whatsapp"
      SUPABASE_URL: "https://vwaocoaeenavxkcshyuf.supabase.co"
      SUPABASE_SERVICE_KEY: "${SUPABASE_SERVICE_KEY}"
      WEBHOOK_SECRET: "${WEBHOOK_SECRET}"
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: "true"
      PUPPETEER_EXECUTABLE_PATH: "/usr/bin/chromium"
      RAILWAY_ENVIRONMENT: "true"
    volumes:
      - whatsapp_auth:/app/.wwebjs_auth

volumes:
  whatsapp_auth:
```

En Dokploy, si se configura desde interfaz, el equivalente es:

| Campo | Valor |
|---|---|
| Build context | `bridge` |
| Dockerfile | `bridge/Dockerfile` |
| Puerto interno | `3000` |
| Dominio | `https://bridge.<dominio>` |
| Volumen | `whatsapp_auth` |
| Mount path | `/app/.wwebjs_auth` |
| Restart policy | `unless-stopped` o auto-restart habilitado |

---

## 11. Preparacion antes de tocar Railway

Checklist obligatorio:

- [ ] Dokploy instalado y funcionando en la VPS.
- [ ] Dominio/subdominio apuntando a la IP de la VPS.
- [ ] HTTPS activo para el subdominio del bridge.
- [ ] Repositorio conectado a Dokploy o codigo subido manualmente.
- [ ] App creada en Dokploy usando `bridge/Dockerfile`.
- [ ] Variables de entorno configuradas.
- [ ] Volumen persistente montado en `/app/.wwebjs_auth`.
- [ ] Railway sigue activo y funcionando.
- [ ] No se ha actualizado todavia `WHATSAPP_BRIDGE_URL` en produccion.

---

## 12. Estrategia de migracion recomendada

Hay dos escenarios posibles.

### Escenario A: se puede exportar `.wwebjs_auth/` desde Railway

Este es el mejor escenario porque permite conservar la sesion actual.

Pasos:

1. Preparar Dokploy con volumen persistente.
2. Detener temporalmente el bridge en Railway para evitar dos clientes con la misma sesion.
3. Copiar `.wwebjs_auth/` desde Railway.
4. Colocar esa carpeta dentro del volumen persistente de Dokploy.
5. Iniciar el bridge en Dokploy.
6. Abrir `https://bridge.<dominio>/api/health`.
7. Confirmar `connected: true`.
8. Actualizar `WHATSAPP_BRIDGE_URL` en la app principal.
9. Probar envio y recepcion.
10. Mantener Railway apagado pero disponible para rollback durante 24-48 horas.

Limitacion: Railway normalmente no facilita acceso directo tipo SSH al filesystem efimero. Si `.wwebjs_auth/` no esta en un volumen descargable o no hay shell/acceso al contenedor, probablemente no se pueda extraer la sesion.

### Escenario B: no se puede exportar `.wwebjs_auth/` desde Railway

Este es el escenario mas probable si Railway no tiene volumen persistente descargable.

Pasos:

1. Preparar Dokploy completo.
2. Levantar el bridge en Dokploy sin sesion.
3. Abrir `https://bridge.<dominio>/`.
4. Escanear QR con el celular del negocio.
5. Confirmar `connected: true` en `https://bridge.<dominio>/api/health`.
6. Actualizar `WHATSAPP_BRIDGE_URL` en la app principal.
7. Verificar envio/recepcion.
8. Dejar Railway como respaldo unas horas, pero ya no deberia usarse con la misma cuenta.

Impacto: requiere un re-login de WhatsApp una sola vez. Si el volumen de Dokploy queda bien montado, no deberia pedir QR nuevamente en reinicios normales.

---

## 13. Por que no conviene correr Railway y Dokploy conectados al mismo tiempo

WhatsApp Web maneja sesiones de dispositivo vinculado. Si dos procesos automatizados intentan controlar la misma sesion al mismo tiempo, pueden ocurrir problemas:

- desconexion de uno de los dos procesos;
- QR nuevo inesperado;
- mensajes duplicados;
- mensajes entrantes capturados por el bridge equivocado;
- sesion marcada como inestable por WhatsApp Web.

Por eso el plan es paralelo solo en infraestructura, no en sesion activa:

```text
Correcto:
Railway activo mientras Dokploy se prepara.
Luego corte controlado: Railway off -> Dokploy on.

Incorrecto:
Railway y Dokploy conectados simultaneamente al mismo WhatsApp.
```

---

## 14. Configuracion en Dokploy paso a paso

### 14.1 Crear proyecto

1. Entrar al panel de Dokploy.
2. Crear proyecto: `ventas-live` o `whatsapp-bridge`.
3. Crear aplicacion: `whatsapp-bridge`.
4. Elegir despliegue desde GitHub o repositorio.
5. Seleccionar el repositorio de Ventas Live.

### 14.2 Configurar build Docker

Configurar:

| Campo | Valor |
|---|---|
| Root / context | `bridge` |
| Dockerfile | `Dockerfile` |
| Build command | No necesario, usa Dockerfile |
| Start command | No necesario, usa `CMD ["node", "index.js"]` |
| Internal port | `3000` |

Si Dokploy pide ruta completa del Dockerfile desde raiz del repo, usar:

```text
bridge/Dockerfile
```

### 14.3 Configurar dominio

Recomendado:

```text
bridge.<tu-dominio>.com
```

Debe resolver a la IP publica de la VPS donde corre Dokploy.

Validar DNS:

```bash
nslookup bridge.<tu-dominio>.com
```

### 14.4 Configurar volumen

Crear volumen persistente:

```text
whatsapp_auth
```

Montarlo en:

```text
/app/.wwebjs_auth
```

Este paso es obligatorio.

### 14.5 Configurar variables

Agregar las variables de la seccion 9 en Dokploy.

### 14.6 Desplegar

Hacer deploy y revisar logs.

Logs esperados antes de conectar:

```text
Servidor QR escuchando en puerto 3000
QR generado - visita la URL del servicio para escanearlo
```

Logs esperados conectado:

```text
WhatsApp conectado y listo para recibir mensajes
```

---

## 15. Pruebas antes del corte

Antes de cambiar `WHATSAPP_BRIDGE_URL`, validar:

### Health del bridge nuevo

```bash
curl https://bridge.<dominio>/api/health
```

Debe responder JSON. Si ya esta conectado:

```json
{
  "connected": true,
  "service": "whatsapp-bridge"
}
```

### Status del bridge nuevo

```bash
curl https://bridge.<dominio>/status
```

Debe responder `connected` y `qrDataUrl`.

### Envio directo controlado

Solo despues de estar conectado:

```bash
curl -X POST https://bridge.<dominio>/api/send \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: <WEBHOOK_SECRET>" \
  -d '{"phone":"+59172698959","message":"Prueba controlada desde Dokploy"}'
```

### Recepcion

Enviar un mensaje desde otro telefono al WhatsApp del negocio y validar:

- logs del bridge muestran `Enviando [Texto]` o `Enviando [Media]`;
- Supabase recibe el mensaje;
- el panel de WhatsApp muestra la conversacion.

---

## 16. Cutover: cambio de Railway a Dokploy

Cuando Dokploy ya este verificado:

1. Confirmar que el bridge nuevo responde `connected: true`.
2. Cambiar en la app principal:

```env
WHATSAPP_BRIDGE_URL=https://bridge.<dominio>
```

3. Mantener el mismo:

```env
WEBHOOK_SECRET=<MISMO_SECRET>
```

4. Redeploy de la app principal si la plataforma lo requiere.
5. Abrir Ventas Live.
6. Revisar indicador de WhatsApp.
7. Enviar un mensaje desde la cola.
8. Recibir un mensaje entrante de prueba.
9. Revisar logs de Dokploy durante 30-60 minutos.

En este proyecto, el backend principal usa `WHATSAPP_BRIDGE_URL` en `src/routes/whatsapp.ts`. No hace falta cambiar codigo para migrar; es cambio de variable.

---

## 17. Rollback inmediato

Si algo falla despues del corte:

1. Volver `WHATSAPP_BRIDGE_URL` al valor de Railway:

```env
WHATSAPP_BRIDGE_URL=https://bridge-production-13f7.up.railway.app
```

2. Redeploy de la app principal si aplica.
3. Verificar `GET /api/whatsapp/health` desde la app.
4. Revisar si Railway sigue conectado.

Advertencia: si se escaneo QR en Dokploy, WhatsApp puede haber invalidado la sesion anterior de Railway. En ese caso el rollback tecnico de URL no alcanza; habria que volver a escanear QR en Railway. Por eso, si no se puede migrar `.wwebjs_auth/`, el rollback real debe considerar QR.

---

## 18. Monitoreo despues de migrar

Durante las primeras 24-48 horas revisar:

- `GET https://bridge.<dominio>/api/health` responde rapido.
- `connected` permanece en `true`.
- no aparecen errores repetidos de `auth_failure`.
- no aparecen errores de Chromium/Puppeteer.
- la cola `whatsapp_message_queue` no acumula muchos `failed`.
- las fotos se siguen subiendo al bucket `whatsapp-media`.
- los mensajes entrantes se ven en `panel_mensajes`.

Comandos utiles en la VPS/Dokploy:

```bash
docker ps
docker logs -f <contenedor_whatsapp_bridge>
docker restart <contenedor_whatsapp_bridge>
```

Si Dokploy muestra logs desde interfaz, usar la interfaz antes que comandos manuales.

---

## 19. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| No se puede exportar `.wwebjs_auth/` de Railway | Requiere QR nuevo | Planificar re-login en horario de bajo trafico. |
| Volumen mal montado en Dokploy | Pedira QR en cada redeploy | Verificar que `/app/.wwebjs_auth` sea persistente. |
| Dos bridges conectados al mismo WhatsApp | Sesion inestable o duplicados | No correr Railway y Dokploy activos al mismo tiempo con la misma sesion. |
| Chromium no arranca | Bridge offline | Usar el `Dockerfile` actual con `chromium` y `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`. |
| Secret incorrecto | `POST /api/send` devuelve 401 | Usar el mismo `WEBHOOK_SECRET` en app principal y bridge. |
| Supabase service key incorrecta | No sube media | Verificar `SUPABASE_SERVICE_KEY` del proyecto `vwaocoaeenavxkcshyuf`. |
| Dominio/HTTPS mal configurado | App no alcanza al bridge | Probar `/api/health` desde navegador y desde servidor. |
| Redeploy sin persistencia | QR nuevo | Mantener volumen y evitar borrar volumenes. |

---

## 20. Checklist final de migracion

Antes:

- [ ] Dokploy funcionando.
- [ ] App `whatsapp-bridge` creada.
- [ ] Dockerfile apunta a `bridge/Dockerfile`.
- [ ] Puerto 3000 expuesto.
- [ ] Dominio HTTPS configurado.
- [ ] Variables configuradas.
- [ ] Volumen `/app/.wwebjs_auth` configurado.
- [ ] Railway sigue funcionando.

Durante:

- [ ] Decidir si se migra `.wwebjs_auth/` o se escanea QR nuevo.
- [ ] Evitar dos instancias activas con la misma sesion.
- [ ] Confirmar `connected: true` en Dokploy.
- [ ] Cambiar `WHATSAPP_BRIDGE_URL`.
- [ ] Probar envio.
- [ ] Probar recepcion.
- [ ] Revisar Supabase y panel.

Despues:

- [ ] Monitorear 24-48 horas.
- [ ] Revisar cola de mensajes fallidos.
- [ ] Confirmar que reiniciar el contenedor no pide QR.
- [ ] Mantener Railway como respaldo hasta estabilidad comprobada.
- [ ] Apagar Railway solo cuando Dokploy este estable.

---

## 21. Decision clave pendiente

La decision que define el tipo de migracion es esta:

```text
¿Se puede recuperar la carpeta .wwebjs_auth/ actual de Railway?
```

Si la respuesta es si:

```text
Migracion con sesion actual, probablemente sin QR.
```

Si la respuesta es no:

```text
Migracion con QR unico en Dokploy, luego persistencia por volumen.
```

En ambos casos, la app principal puede mantenerse funcionando. El objetivo real es que el corte operativo sea minimo y que Dokploy quede con sesion persistente para no repetir el problema.

---

## 22. Resultado esperado

Al terminar:

- el bridge corre en Dokploy;
- WhatsApp queda conectado;
- la sesion vive en un volumen persistente;
- la app principal apunta al nuevo `WHATSAPP_BRIDGE_URL`;
- los mensajes entrantes siguen guardandose en `panel_clientes` y `panel_mensajes`;
- las fotos siguen subiendo a `whatsapp-media`;
- la cola de mensajes salientes sigue usando `/api/send`;
- Railway queda como respaldo temporal y luego se puede apagar.
