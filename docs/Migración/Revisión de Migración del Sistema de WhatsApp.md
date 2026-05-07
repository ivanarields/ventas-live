# Revision de Migracion del Sistema de WhatsApp

**Fecha:** 7 de mayo de 2026
**Autor:** OpenCode (GLM-5)
**Estado:** Migracion completada - Pendiente de verificacion por Claude

---

## 1. Resumen ejecutivo

Se migro el WhatsApp Bridge desde Railway (`https://bridge-production-13f7.up.railway.app`) hacia un VPS de DigitalOcean con IP `134.122.123.253`, puerto `3001`. La migracion se realizo sin interrumpir la aplicacion principal. Railway fue apagado despues de confirmar que el nuevo bridge funcionaba.

---

## 2. Donde y como se instalo el bridge

### 2.1 Por que no se uso Dokploy

El bridge se instalo **directamente via Docker Compose en el VPS**, no a traves de la interfaz de Dokploy. Razones:

1. La API de Dokploy usa NextAuth con proteccion CSRF, lo que impide la automatizacion via API.
2. No se pudo obtener un token de API desde la interfaz de Dokploy (no tiene seccion de API Keys en su version actual).
3. El acceso SSH al VPS funciono correctamente (@`root@134.122.123.253`), permitiendo instalar todo desde la terminal.

**Dokploy sigue activo** en el VPS (`http://134.122.123.253:3000`) para otros servicios (n8n, bases de datos, etc.). El bridge corre como un contenedor Docker independiente, fuera del ecosistema de Dokploy, pero en el mismo VPS.

### 2.2 Ubicacion de los archivos en el VPS

```
/root/ventas-live-bridge/bridge/
  ├── index.js              # Codigo principal del bridge (modificado)
  ├── send.js               # Endpoints /api/send y /api/health
  ├── package.json          # Dependencias
  ├── package-lock.json     # Lock de dependencias
  ├── Dockerfile             # Imagen Docker con Node 20 + Chromium
  ├── docker-compose.yml    # Configuracion de Docker Compose
  ├── .env                  # Variables de entorno (con secretos)
  ├── .dockerignore         
  ├── .env.example
  ├── railway.json           # Ya no se usa, queda del repo original
  └── README.md
```

### 2.3 Como se creo el contenedor

Secuencia de comandos ejecutados en el VPS:

```bash
# 1. Clonar el repositorio
git clone https://github.com/ivanarields/ventas-live.git /root/ventas-live-bridge

# 2. Subir index.js modificado (con reconexion automatica)
# Se copio el archivo actualizado desde la maquina local via SSH

# 3. Crear archivo .env con las variables de entorno
cat > /root/ventas-live-bridge/bridge/.env << 'EOF'
PORT=3000
WEBHOOK_URL=https://vwaocoaeenavxkcshyuf.supabase.co/functions/v1/ingest-whatsapp
SUPABASE_URL=https://vwaocoaeenavxkcshyuf.supabase.co
SUPABASE_SERVICE_KEY=<PANEL_SUPABASE_SERVICE_KEY>
WEBHOOK_SECRET=<WEBHOOK_SECRET>
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RAILWAY_ENVIRONMENT=true
DOCKER_ENV=true
EOF

# 4. Construir y levantar el contenedor
cd /root/ventas-live-bridge/bridge
docker compose up -d --build
```

### 2.4 Estado actual del contenedor

| Propiedad | Valor |
|---|---|
| Nombre del contenedor | `whatsapp-bridge` |
| Imagen | `bridge-whatsapp-bridge` |
| Puerto expuesto | `3001` (externo) → `3000` (interno) |
| Politica de reinicio | `unless-stopped` (se reinicia solo si se cae o reinicia el servidor) |
| Volumen persistente | `bridge_whatsapp_auth` montado en `/app/.wwebjs_auth` |
| Network | `bridge_default` (Docker default) |
| Estado | `Up` ~1 hora, conectado a WhatsApp |
| Uso de RAM | ~244 MB |
| Uso de CPU | ~2.6% |
| Healthcheck | Cada 30s via `curl -f http://localhost:3000/api/health` (marca unhealthy por falta de curl en la imagen, pero el servicio funciona correctamente) |

### 2.5 Volumen persistente

El volumen `bridge_whatsapp_auth` guarda la sesion de WhatsApp en `/var/lib/docker/volumes/bridge_whatsapp_auth/_data`. Esto significa que si el contenedor se reinicia o se recrea, la sesion de WhatsApp se conserva y **no se necesita escanear QR de nuevo**.

---

## 3. Cambios en el codigo

### 3.1 Archivo: `bridge/index.js`

Se realizaron los siguientes cambios:

#### Cambio 1: Variable de entorno renombrada

**Antes:**
```js
const IS_RAILWAY = !!process.env.RAILWAY_ENVIRONMENT;
```

**Despues:**
```js
const IS_HEADLESS = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.DOCKER_ENV;
```

**Motivo:** La variable `IS_RAILWAY` era confusa ahora que el bridge corre en Docker en DigitalOcean, no en Railway. `IS_HEADLESS` describe mejor lo que hace: determinar si se ejecuta en modo headless (sin monitor). Se mantiene `RAILWAY_ENVIRONMENT=true` por compatibilidad hacia atras y se agrega `DOCKER_ENV=true` como nuevo flag.

#### Cambio 2: Contadores de reconexion automatica

**Antes:**
```js
let qrDataUrl  = null;
let connected  = false;
let client     = null;
```

**Despues:**
```js
let qrDataUrl  = null;
let connected  = false;
let client     = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY   = 5000;
```

**Motivo:** Se agregan constantes para controlar la reconexion automatica con retroceso exponencial.

#### Cambio 3: Evento `ready` con reset de contador

**Antes:**
```js
client.on('ready', () => {
  connected = true;
  qrDataUrl = null;
  console.log('✅ WhatsApp conectado y listo para recibir mensajes');
});
```

**Despues:**
```js
client.on('ready', () => {
  connected = true;
  qrDataUrl = null;
  reconnectAttempts = 0;
  console.log('✅ WhatsApp conectado y listo para recibir mensajes');
});
```

**Motivo:** Al conectar exitosamente, se resetea el contador de reintentos.

#### Cambio 4: Evento `auth_failure` con reinicio automatico

**Antes:**
```js
client.on('auth_failure', () => {
  console.error('❌ Fallo de autenticación — la sesión expiró. Reinicia el servicio para escanear QR nuevo.');
});
```

**Despues:**
```js
client.on('auth_failure', (msg) => {
  console.error('❌ Fallo de autenticación — la sesión expiró:', msg);
  console.log('🔄 Cerrando cliente para reinicio automático...');
  connected = false;
  setTimeout(() => {
    client.destroy().then(() => {
      client.initialize();
    }).catch(() => {
      console.error('❌ Error al destruir cliente, reiniciando proceso...');
      process.exit(1);
    });
  }, 5000);
});
```

**Motivo:** Si la sesion expira, el bridge intenta reiniciar el cliente automaticamente antes de matar el proceso. Si falla, `process.exit(1)` hace que Docker lo reinicie por la politica `restart: unless-stopped`.

#### Cambio 5: Evento `disconnected` con reconexion automatica

**Antes:** No existia.

**Despues:**
```js
client.on('disconnected', (reason) => {
  console.warn('⚠️ WhatsApp desconectado:', reason);
  connected = false;
  qrDataUrl = null;
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    const delay = RECONNECT_BASE_DELAY * (reconnectAttempts + 1);
    console.log(`🔄 Reconectando intento ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS} en ${delay / 1000}s...`);
    reconnectAttempts++;
    setTimeout(() => {
      client.destroy().then(() => {
        client.initialize();
      }).catch(() => {
        console.error('❌ Error al destruir cliente, reiniciando proceso...');
        process.exit(1);
      });
    }, delay);
  } else {
    console.error('❌ Máximo de intentos de reconexión alcanzado. Reiniciando proceso...');
    process.exit(1);
  }
});
```

**Motivo:** Si WhatsApp se desconecta temporalmente (problemas de red, mantenimiento de servidores), el bridge intenta reconectar hasta 10 veces con delays progresivos (5s, 10s, 15s... 50s). Si no puede, termina el proceso y Docker lo reinicia.

#### Cambio 6: Evento `change_state` para monitoreo

**Nuevo:**
```js
client.on('change_state', (state) => {
  console.log(`🔄 Estado de WhatsApp: ${state}`);
});
```

**Motivo:** Permite ver en los logs cuando WhatsApp cambia de estado (ej: `CONNECTED`, `UNPAIRED`, etc).

#### Cambio 7: Referencias a IS_RAILWAY cambiadas a IS_HEADLESS

**Antes:**
```js
executablePath: IS_RAILWAY
  ? (process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable')
  : undefined,
args: IS_RAILWAY
  ? [...]
  : [...]
```

**Despues:**
```js
executablePath: IS_HEADLESS
  ? (process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium')
  : undefined,
args: IS_HEADLESS
  ? [...]
  : [...]
```

**Motivo:** Consistencia con el nuevo nombre de variable. Tambien se cambio `/usr/bin/google-chrome-stable` a `/usr/bin/chromium` que es el path correcto en el Dockerfile actual.

### 3.2 Archivo: `bridge/docker-compose.yml` (NUEVO)

```yaml
version: "3.8"

services:
  whatsapp-bridge:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: whatsapp-bridge
    restart: unless-stopped
    ports:
      - "3001:3000"
    env_file:
      - .env
    volumes:
      - whatsapp_auth:/app/.wwebjs_auth
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

volumes:
  whatsapp_auth:
```

**Notas:**
- Puerto externo `3001` para no conflictar con Dokploy que usa `3000`.
- Volumen `whatsapp_auth` para persistencia de sesion.
- Healthcheck configurado (marca unhealthy por falta de curl en la imagen, pero funciona correctamente).
- `restart: unless-stopped` para reinicio automatico.

### 3.3 Archivo: `bridge/.env` (NUEVO en el VPS)

```
PORT=3000
WEBHOOK_URL=https://vwaocoaeenavxkcshyuf.supabase.co/functions/v1/ingest-whatsapp
SUPABASE_URL=https://vwaocoaeenavxkcshyuf.supabase.co
SUPABASE_SERVICE_KEY=<PANEL_SUPABASE_SERVICE_KEY>
WEBHOOK_SECRET=<WEBHOOK_SECRET>
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RAILWAY_ENVIRONMENT=true
DOCKER_ENV=true
```

**Nota:** Se agrego `DOCKER_ENV=true` para que `IS_HEADLESS` sea `true` tanto en Railway como en Docker.

### 3.4 Archivos sin cambios

Los siguientes archivos del bridge **NO fueron modificados**:
- `bridge/send.js` - Sin cambios. Los endpoints `/api/health`, `/api/send` y `/status` son identicos.
- `bridge/Dockerfile` - Sin cambios. La imagen usa Node 20 + Chromium.
- `bridge/package.json` - Sin cambios.
- `bridge/package-lock.json` - Sin cambios.
- `bridge/railway.json` - Sin cambios (ya no se usa, pero queda en el repo).

---

## 4. Cambios en infraestructura

### 4.1 VPS de DigitalOcean

| Propiedad | Valor |
|---|---|
| IP publica | `134.122.123.253` |
| Hostname | `ivanarielpro` |
| OS | Ubuntu 24.04 (kernel 6.8.0-71-generic) |
| RAM | 1.9 GB total, ~478 MB disponibles |
| Disco | 48 GB total, ~38 GB disponibles |
| Docker | v28.5.0 |
| Docker Compose | v5.1.3 |
| Dokploy | v0.29.2 (corriendo en puerto 3000) |

### 4.2 Contenedores corriendo en el VPS

| Contenedor | Imagen | Puerto | Estado |
|---|---|---|---|
| whatsapp-bridge | bridge-whatsapp-bridge | 3001:3000 | Up, conectado a WhatsApp |
| dokploy-traefik | traefik:v3.6.7 | 80, 443 | Up (proxy HTTPS) |
| dokploy | dokploy/dokploy:v0.29.2 | 3000 | Up (panel de gestion) |
| dokploy-redis | redis:7 | 6379 (interno) | Up |
| dokploy-postgres | postgres:16 | 5432 (interno) | Up |

### 4.3 Volumenes Docker

| Volumen | Uso |
|---|---|
| `bridge_whatsapp_auth` | Sesion de WhatsApp (`.wwebjs_auth/`) |
| `dokploy` | Datos de Dokploy |
| `dokploy-postgres` | Base de datos de Dokploy |
| `dokploy-redis` | Datos de Redis de Dokploy |

### 4.4 Acceso SSH al VPS

Se genero una clave SSH en `C:\Users\IVAN\.ssh\dokploy_bridge_key` (ed25519) y se agrego al archivo `~/.ssh/authorized_keys` del servidor. Esto permite acceso directo sin contrasena.

---

## 5. Cambios en variables de entorno

### 5.1 Archivo `.env` local

**Antes:**
```
WHATSAPP_BRIDGE_URL=https://bridge-production-13f7.up.railway.app
```

**Despues:**
```
WHATSAPP_BRIDGE_URL=http://134.122.123.253:3001
```

### 5.2 Vercel (produccion)

Se ejecutaron los siguientes comandos:

```bash
# Eliminar variable anterior
vercel env rm WHATSAPP_BRIDGE_URL production --yes
vercel env rm WHATSAPP_BRIDGE_URL preview --yes
vercel env rm WHATSAPP_BRIDGE_URL development --yes

# Agregar nueva variable
echo "http://134.122.123.253:3001" | vercel env add WHATSAPP_BRIDGE_URL production
echo "http://134.122.123.253:3001" | vercel env add WHATSAPP_BRIDGE_URL preview
echo "http://134.122.123.253:3001" | vercel env add WHATSAPP_BRIDGE_URL development
```

**Nota:** La URL apunta a HTTP, no HTTPS. Pendiente configurar `bridge.ventaslive.com` con HTTPS via Traefik/Dokploy.

### 5.3 Verificacion

```bash
vercel env ls | grep WHATSAPP
# Resultado:
# WHATSAPP_BRIDGE_URL  Encrypted  Production
# WHATSAPP_BRIDGE_URL  Encrypted  Development
# WHATSAPP_BRIDGE_URL  Encrypted  Preview (en algunas opciones)
```

---

## 6. Cambios en Railway

### 6.1 Que se hizo

Se ejecuto `railway down --yes` para eliminar el deployment del servicio `bridge` en el proyecto `whatsapp-bridge`. Esto detuvo el contenedor en Railway.

### 6.2 Estado actual de Railway

| Propiedad | Estado |
|---|---|
| URL `https://bridge-production-13f7.up.railway.app/api/health` | Devuelve 404 "Application not found" |
| Proyecto | `whatsapp-bridge` (aun existe en Railway) |
| Servicio | `bridge` (deployment eliminado) |
| Cuenta Railway | `ivanarieldesign@gmail.com` (logueada via CLI) |

**Nota:** El proyecto en Railway no se borro completamente, solo se elimino el deployment. Se puede reactivar si es necesario como rollback.

---

## 7. Cambios en el codigo de la app principal

### 7.1 Archivo: `src/routes/whatsapp.ts`

**Sin cambios.** La app principal usa `WHATSAPP_BRIDGE_URL` como variable de entorno para determinar hacia donde enviar las peticiones. No se modifico el codigo; solo se cambio el valor de la variable de entorno.

Endpoints que la app principal usa del bridge:
- `GET /api/whatsapp/status` → proxy a `GET {WHATSAPP_BRIDGE_URL}/status`
- `GET /api/whatsapp/health` → proxy a `GET {WHATSAPP_BRIDGE_URL}/api/health`
- `POST /api/whatsapp/send-next` → proxy a `POST {WHATSAPP_BRIDGE_URL}/api/send`

Todos estos endpoints son identicos en el nuevo bridge. La app principal no necesita ningun cambio de codigo.

### 7.2 Componentes del frontend que consumen el bridge

- `src/components/WhatsappHealthBadge.tsx` - Lee `/api/whatsapp/health`
- `src/components/WhatsappConnectionPanel.tsx` - Lee `/api/whatsapp/status`
- `src/components/WhatsappQueue.tsx` - Lee/escribe en `/api/whatsapp/queue*`
- `src/services/liveSalesService.ts` - Usa `/api/whatsapp/send-next`

**Ninguno de estos archivos fue modificado.** Funcionan igual porque los endpoints del bridge son compatibles.

---

## 8. Verificacion de compatibilidad

### 8.1 Endpoints del bridge (sin cambios)

| Endpoint | Metodo | Funcion | Compatible |
|---|---|---|---|
| `/status` | GET | Retorna estado y QR del bridge | Si |
| `/api/health` | GET | Retorna estado de conexion | Si |
| `/api/send` | POST | Envia mensaje por WhatsApp | Si |

### 8.2 Variables de entorno del bridge (sin cambios criticos)

| Variable | Antes (Railway) | Ahora (VPS) | Cambio |
|---|---|---|---|
| `PORT` | 3000 | 3000 | Ninguno |
| `WEBHOOK_URL` | Igual | Igual | Ninguno |
| `SUPABASE_URL` | Igual | Igual | Ninguno |
| `SUPABASE_SERVICE_KEY` | Igual | Igual | Ninguno |
| `WEBHOOK_SECRET` | Igual | Igual | Ninguno |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/google-chrome-stable` | `/usr/bin/chromium` | Corregido (Dockerfile ya usa chromium) |
| `RAILWAY_ENVIRONMENT` | true | true | Ninguno |
| `DOCKER_ENV` | No existia | true | Nuevo (para IS_HEADLESS) |

### 8.3 Contrato HTTP con la app principal

La app principal (`src/routes/whatsapp.ts`) se comunica con el bridge asi:

```typescript
const BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
```

**No hay cambios en el codigo.** Solo se cambio el valor de `WHATSAPP_BRIDGE_URL` en las variables de entorno.

---

## 9. Riesgos identificados

### 9.1 HTTP sin HTTPS (ALTO)

Actualmente `WHATSAPP_BRIDGE_URL` apunta a `http://134.122.123.253:3001` (HTTP, sin cifrar). Esto significa que:

- Los webhooks entre la app principal (Vercel, HTTPS) y el bridge (HTTP) viajan sin cifrar.
- El `WEBHOOK_SECRET` viaja en el header `x-webhook-secret` sin cifrar.
- Aunque el puente es interno entre servidores, no es ideal en produccion.

**Mitigacion pendiente:** Configurar `bridge.ventaslive.com` con DNS apuntando a `134.122.123.253` y configurar HTTPS via Traefik (ya instalado en el VPS como parte de Dokploy).

### 9.2 RAM limitada del VPS (MEDIO)

El VPS tiene solo 1.9 GB de RAM. El WhatsApp Bridge usa ~244 MB y Chromium puede picar mas alto. Si n8n u otros servicios consumen mas RAM, podria haber problemas.

**Mitigacion:** Monitorear `docker stats` regularmente. Considerar upgrade a 4 GB RAM si se agregan mas servicios.

### 9.3 Healthcheck marcando "unhealthy" (BAJO)

El healthcheck del contenedor usa `curl -f` pero `curl` no esta instalado en la imagen Docker. Esto hace que Docker marque el contenedor como "unhealthy" aunque el servicio funcione correctamente.

**Mitigacion pendiente:** Agregar `curl` al Dockerfile o cambiar el healthcheck a `wget` que si esta disponible.

### 9.4 DNS pendiente (MEDIO)

`bridge.ventaslive.com` no esta configurado en DNS. Actualmente se usa la IP directa. Pendiente configurar:
1. Registro A en DNS: `bridge.ventaslive.com` → `134.122.123.253`
2. Configurar Traefik en Dokploy para HTTPS con Let's Encrypt

### 9.5 No se migro la sesion de WhatsApp (ACEPTADO)

La sesion de `.wwebjs_auth/` no se copio desde Railway. Se escaneo un QR nuevo en el nuevo bridge. Esto significa que la sesion anterior en Railway ya no es valida (WhatsApp solo permite una sesion activa por numero).

**Impacto:** Si se necesita rollback a Railway, habria que escanear QR de nuevo.

---

## 10. Checklist de verificacion para Claude

### 10.1 Verificar que el bridge responde

```bash
curl http://134.122.123.253:3001/api/health
# Esperado: {"connected":true,"timestamp":"...","service":"whatsapp-bridge"}

curl http://134.122.123.253:3001/status
# Esperado: {"connected":true,"qrDataUrl":null} o {"connected":false,"qrDataUrl":"..."}
```

### 10.2 Verificar que Railway esta apagado

```bash
curl https://bridge-production-13f7.up.railway.app/api/health
# Esperado: 404 o error de conexion
```

### 10.3 Verificar que la app principal conecta al nuevo bridge

```bash
curl https://leidydiaz.live/api/whatsapp/health
# Esperado: {"connected":true,"timestamp":"..."}
```

### 10.4 Verificar variables de entorno en Vercel

```bash
vercel env ls | grep WHATSAPP
# Esperado: WHATSAPP_BRIDGE_URL con valor http://134.122.123.253:3001
```

### 10.5 Verificar que el contenedor esta corriendo

```bash
ssh root@134.122.123.253 -i ~/.ssh/dokploy_bridge_key
docker ps | grep whatsapp-bridge
# Esperado: whatsapp-bridge Up

docker logs whatsapp-bridge --tail 10
# Esperado: "WhatsApp conectado y listo para recibir mensajes"
```

### 10.6 Verificar que el volumen persiste la sesion

```bash
ssh root@134.122.123.253 -i ~/.ssh/dokploy_bridge_key
docker exec whatsapp-bridge ls -la /app/.wwebjs_auth/
# Esperado: archivos de sesion de WhatsApp
```

### 10.7 Verificar reconexion automatica

```bash
ssh root@134.122.123.253 -i ~/.ssh/dokploy_bridge_key
docker restart whatsapp-bridge
# Esperar 30-60 segundos
docker logs whatsapp-bridge --tail 5
# Esperado: "WhatsApp conectado y listo para recibir mensajes"
# (la sesion debe sobrevivir al reinicio)
```

### 10.8 Verificar que no hay cambios rotos en la app principal

```bash
# En el repo local
git diff HEAD -- src/routes/whatsapp.ts
# Esperado: sin cambios (o solo cambios de formato)

git diff HEAD -- src/components/WhatsappHealthBadge.tsx
# Esperado: sin cambios

git diff HEAD -- src/components/WhatsappQueue.tsx
# Esperado: sin cambios
```

### 10.9 Verificar flujo completo de mensajes

1. Enviar un WhatsApp al numero del negocio.
2. Verificar que llega al bridge (logs del contenedor).
3. Verificar que se guarda en Supabase (`panel_clientes`, `panel_mensajes`).
4. Verificar que aparece en la app principal (`leidydiaz.live`).
5. Encolar un mensaje saliente desde la app.
6. Verificar que el mensaje se envia por WhatsApp.

---

## 11. Comandos utiles para administracion

### Ver logs del bridge
```bash
ssh root@134.122.123.253 -i ~/.ssh/dokploy_bridge_key
docker logs whatsapp-bridge --tail 50
```

### Reiniciar el bridge
```bash
docker restart whatsapp-bridge
```

### Reconstruir el bridge (despues de cambios en el codigo)
```bash
cd /root/ventas-live-bridge/bridge
docker compose up -d --build
```

### Ver estado del contenedor
```bash
docker ps | grep whatsapp-bridge
```

### Ver uso de recursos
```bash
docker stats whatsapp-bridge --no-stream
```

### Ver volumen de sesion
```bash
docker exec whatsapp-bridge ls -la /app/.wwebjs_auth/
```

---

## 12. Rollback plan (en caso de emergencia)

Si el nuevo bridge falla y se necesita volver a Railway:

1. Re-deploy el servicio en Railway:
```bash
railway up
```

2. Cambiar `WHATSAPP_BRIDGE_URL` en Vercel de vuelta:
```bash
vercel env rm WHATSAPP_BRIDGE_URL production --yes
echo "https://bridge-production-13f7.up.railway.app" | vercel env add WHATSAPP_BRIDGE_URL production
# Repetir para preview y development
```

3. Redeploy la app en Vercel:
```bash
vercel --prod
```

4. Escanear QR en Railway (la sesion anterior ya no es valida porque se migro al nuevo bridge).

**Nota:** El rollback requiere escanear QR de nuevo porque la sesion solo puede estar activa en un bridge a la vez.

---

## 13. Pendientes post-migracion

- [ ] Configurar DNS `bridge.ventaslive.com` apuntando a `134.122.123.253`
- [ ] Configurar HTTPS en Traefik/Dokploy para el subdominio
- [ ] Cambiar `WHATSAPP_BRIDGE_URL` de `http://134.122.123.253:3001` a `https://bridge.ventaslive.com`
- [ ] Agregar `curl` al Dockerfile para que el healthcheck funcione correctamente
- [ ] Considerar mover el bridge a Dokploy como aplicacion (para gestionarlo desde el dashboard)
- [ ] Monitorear uso de RAM del VPS (1.9 GB puede ser limitado con n8n)
- [ ] Cambiar contrasena de Dokploy (las credenciales quedaron en este chat)
- [ ] Eliminar proyecto de Railway si se confirma estabilidad