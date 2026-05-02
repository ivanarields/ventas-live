# Migración del Bridge WhatsApp: Railway → Oracle Cloud

**Fecha:** 2026-05-01
**Estado:** Planificación
**Autor:** OpenCode + Ivan

---

## 1. Resumen

Migrar el microservicio Bridge WhatsApp desde Railway (~$5/mes) a Oracle Cloud Always Free ($0/mes), manteniendo la misma funcionalidad y disponibilidad 24/7.

---

## 2. Arquitectura Actual (Railway)

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────┐     ┌──────────────┐
│  WhatsApp    │ ←→  │  Bridge (Railway)   │ ←→  │  Vercel      │ ←→  │  Supabase    │
│  Web         │     │  Node.js + Chromium │     │  server.ts   │     │  DB/Storage  │
│  (whatsapp-  │     │  Puerto 3000        │     │  /api/       │     │  Edge Funcs  │
│   web.js)    │     │  Always-on          │     │  whatsapp/*  │     │              │
└──────────────┘     └─────────────────────┘     └──────────────┘     └──────────────┘
```

### Archivos del bridge

| Archivo | Función |
|---------|---------|
| `bridge/index.js` | Servidor principal: cliente WhatsApp, servidor HTTP, QR, captura de mensajes entrantes |
| `bridge/send.js` | API de envío saliente (`POST /api/send`) y health check (`GET /api/health`) |
| `bridge/package.json` | Dependencias: whatsapp-web.js, axios, qrcode, dotenv |
| `bridge/Dockerfile` | Imagen Docker con Node 20 + Chromium para Railway |
| `bridge/railway.json` | Config de build/deploy en Railway |
| `bridge/.env` | Variables: WEBHOOK_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY |

---

## 3. Arquitectura Objetivo (Oracle Cloud)

```
┌──────────────┐     ┌──────────────────────────┐     ┌──────────────┐     ┌──────────────┐
│  WhatsApp    │ ←→  │  Bridge (Oracle VM)      │ ←→  │  Vercel      │ ←→  │  Supabase    │
│  Web         │     │  Ubuntu 22.04 ARM/AMD    │     │  server.ts   │     │  DB/Storage  │
│              │     │  Node.js 20 + Chromium   │     │              │     │              │
│              │     │  PM2 (process manager)   │     │              │     │              │
│              │     │  Puerto 3000             │     │              │     │              │
└──────────────┘     └──────────────────────────┘     └──────────────┘     └──────────────┘
```

### Diferencias clave

| Aspecto | Railway | Oracle Cloud |
|---------|---------|-------------|
| **Despliegue** | Docker push automático | Manual vía SSH + script |
| **Process manager** | Plataforma | PM2 |
| **Auto-reinicio** | Nativo de Railway | PM2 + systemd |
| **Actualización** | git push → rebuild | SSH → git pull → pm2 restart |
| **Costo** | ~$5/mes | $0/mes |

---

## 4. Requisitos de la VM en Oracle

### Shape recomendado

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| **CPU** | 1 OCPU | 1 OCPU |
| **RAM** | 1 GB | 4 GB |
| **Disco** | 20 GB | 50-100 GB |
| **OS** | Ubuntu 22.04 o 24.04 | Ubuntu 24.04 |

### Opciones de Shape (Free Tier)

| Shape | CPU | RAM | Disponibilidad |
|-------|-----|-----|----------------|
| `VM.Standard.A1.Flex` (ARM) | 1-4 OCPU | 4-24 GB | ⭐ Ideal, pero puede no haber capacidad |
| `VM.Standard.E2.1.Micro` (AMD) | 1/8 OCPU | 1 GB | Alternativa si ARM no está disponible |

### Puertos a abrir (Security List)

| Puerto | Protocolo | Origen | Propósito |
|--------|-----------|--------|-----------|
| 22 | TCP | 0.0.0.0/0 | SSH |
| 3000 | TCP | 0.0.0.0/0 | Bridge HTTP (status, health, send) |

> El puerto 3000 debe ser público para que Vercel pueda llamar a `/api/send`, `/api/health` y `/status`.

---

## 5. Paso a Paso de la Migración

### Fase 1: Crear la VM en Oracle Cloud

1. Entrar a [cloud.oracle.com](https://cloud.oracle.com)
2. **Compute** → **Instances** → **Create instance**
3. Configurar:
   - **Name:** `whatsapp-bridge`
   - **Image:** Ubuntu 24.04 (Canonical)
   - **Shape:** `VM.Standard.A1.Flex` (1 OCPU, 4 GB RAM)
   - **SSH Key:** Subir clave pública o generar nueva
   - **Boot volume:** 50 GB
4. Crear y esperar ~1 minuto
5. Copiar la IP pública

### Fase 2: Configurar Firewall (Security List)

1. Ir a la subnet de la VM → **Security Lists**
2. Agregar regla de ingreso:
   - Source: `0.0.0.0/0`
   - Protocol: TCP
   - Port: `3000`
   - Description: `WhatsApp Bridge HTTP`

> ⚠️ Importante: También desactivar el firewall interno de Ubuntu con `iptables` o abrir el puerto 3000.

### Fase 3: Instalar software en la VM

Conectarse por SSH y ejecutar:

```bash
# 1. Actualizar sistema
sudo apt update && sudo apt upgrade -y

# 2. Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Instalar Chromium y dependencias de Puppeteer
sudo apt install -y \
  chromium-browser \
  fonts-liberation \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libxss1 \
  libxtst6 \
  xdg-utils

# 4. Instalar PM2 (process manager)
sudo npm install -g pm2

# 5. Verificar
node --version   # v20.x
chromium-browser --version
pm2 --version
```

### Fase 4: Clonar el proyecto y configurar el bridge

```bash
# 1. Clonar repositorio
cd /home/ubuntu
git clone https://github.com/ivanarields/ventas-live.git
cd ventas-live/bridge

# 2. Instalar dependencias
npm install --omit=dev

# 3. Crear archivo .env
cp .env.example .env
nano .env   # Editar con las variables reales
```

Variables en `.env`:

```
WEBHOOK_URL="https://vwaocoaeenavxkcshyuf.supabase.co/functions/v1/ingest-whatsapp"
SUPABASE_URL="https://vwaocoaeenavxkcshyuf.supabase.co"
SUPABASE_SERVICE_KEY="<KEY-REAL>"
WEBHOOK_SECRET="<SECRET-REAL>"
PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium-browser"
RAILWAY_ENVIRONMENT=true
PORT=3000
```

### Fase 5: Configurar PM2 para always-on

```bash
# 1. Iniciar con PM2
pm2 start index.js --name whatsapp-bridge

# 2. Guardar configuración para auto-inicio
pm2 save

# 3. Configurar systemd para que PM2 arranque al boot
pm2 startup systemd
# (Ejecutar el comando que muestra pm2 startup)
```

### Fase 6: Migrar la sesión de WhatsApp

```bash
# Copiar la carpeta .wwebjs_auth desde Railway a la VM
# Opción A: Desde Railway (si tenés acceso SSH al contenedor)
#   scp -r railway:/app/.wwebjs_auth ubuntu@<IP_VM>:~/ventas-live/bridge/

# Opción B: Sincronizar desde el bucket de Supabase Storage
#   (Si guardaste la sesión ahí como backup)

# Opción C: Escanear QR nuevo
#   Si no se puede migrar la sesión, simplemente se escanea un QR nuevo
#   El bridge generará uno nuevo y se muestra en la app
```

> ⚠️ Si se escanea un QR nuevo, WhatsApp cerrará la sesión anterior. Planificar esta migración en horario de bajo tráfico.

### Fase 7: Actualizar variables en Vercel

Cambiar la URL del bridge en las variables de entorno de Vercel:

```
WHATSAPP_BRIDGE_URL=http://<IP_PUBLICA_VM>:3000
```

> La IP pública de la VM de Oracle es estática mientras la VM exista. No cambia con reinicios.

### Fase 8: Verificar

1. Visitar `http://<IP_PUBLICA>:3000/` → Debe mostrar el QR o "Conectado"
2. Visitar `http://<IP_PUBLICA>:3000/api/health` → `{"connected":true,...}`
3. Desde la app (Vercel), verificar que:
   - El panel de WhatsApp muestra el estado de conexión
   - Los mensajes entrantes se capturan correctamente
   - El envío de mensajes salientes funciona

---

## 6. Configuración del servidor local para el bridge

Actualmente `server.ts` (en el diff local no commiteado) tiene el proxy a `/api/whatsapp/status` eliminado porque se movió a `src/routes/whatsapp.ts`. No es necesario cambiar nada en el código — solo actualizar la variable de entorno en Vercel.

### Variable de entorno a actualizar

| Variable | Valor actual (Railway) | Valor nuevo (Oracle) |
|----------|----------------------|---------------------|
| `WHATSAPP_BRIDGE_URL` | URL de Railway | `http://<IP_PUBLICA_VM>:3000` |
| `WEBHOOK_SECRET` | (mismo) | (mismo) |

---

## 7. Comandos útiles post-migración

```bash
# Ver logs del bridge
pm2 logs whatsapp-bridge

# Reiniciar bridge
pm2 restart whatsapp-bridge

# Actualizar código
cd ~/ventas-live && git pull && cd bridge && npm install --omit=dev && pm2 restart whatsapp-bridge

# Ver estado
pm2 status
```

---

## 8. Plan de rollback

Si algo falla, revertir es inmediato:

1. Volver a cambiar `WHATSAPP_BRIDGE_URL` en Vercel a la URL de Railway
2. El bridge de Railway sigue funcionando normalmente (no se toca hasta que Oracle esté estable)

---

## 9. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Oracle VM no disponible (out of capacity) | Media | Bloqueante | Usar AMD E2.1.Micro como alternativa |
| Sesión de WhatsApp expira al migrar | Media | Requiere escanear QR nuevo | Migrar en horario de bajo tráfico, notificar al operador |
| IP de Oracle cambia | Baja | Bridge inaccesible desde Vercel | La IP pública de Oracle es estática mientras la VM existe |
| Chromium no funciona en ARM | Baja | Bridge no arranca | Usar `chromium-browser` del repo de Ubuntu (compilado para ARM) |
| Límite de 10 TB/mes de transferencia | Muy baja | Irrelevante | El bridge solo transmite JSON y alguna media ocasional |

---

## 10. Costos estimados

| Plataforma | Costo mensual | Costo anual |
|------------|--------------|-------------|
| **Railway** (actual) | ~$5/mes | ~$60/año |
| **Oracle Cloud** (propuesto) | **$0/mes** | **$0/año** |

**Ahorro anual: ~$60**

---

## 11. Pendientes antes de ejecutar

- [ ] Crear VM en Oracle Cloud
- [ ] Configurar Security List (puerto 3000)
- [ ] Generar y configurar API Key de OCI CLI
- [ ] Copiar `.env` del bridge actual a la VM
- [ ] Decidir si migrar sesión WhatsApp o escanear QR nuevo
- [ ] Agendar ventana de migración (5-10 minutos de posible downtime)
- [ ] Actualizar `WHATSAPP_BRIDGE_URL` en Vercel
- [ ] Verificar funcionamiento completo
- [ ] Dar de baja Railway (después de 48h de estabilidad)

---

## 12. Referencias

- [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/)
- [OCI CLI Documentation](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/cliconcepts.htm)
- [WhatsApp Web.js](https://wwebjs.dev/)
- [PM2 Documentation](https://pm2.keymetrics.io/)
