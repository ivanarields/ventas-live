# Migración WhatsApp Bridge: Railway → Oracle Cloud Always Free

**Estado:** Pendiente de ejecución  
**Plazo:** Antes de que Railway expire (~20 días desde 2026-04-27)  
**Responsable:** Ivan + Antigravity  
**Tiempo estimado total:** 1–2 horas

---

## Contexto

El conector de WhatsApp (`whatsapp-bridge`) actualmente corre en **Railway** con un plan
que está próximo a vencer. Este documento describe la migración completa a **Oracle Cloud
Always Free**, que ofrece una VM con 4 núcleos ARM y hasta 24 GB de RAM, sin costo
mensual y sin fecha de vencimiento.

### Arquitectura actual (Railway)

```
Celular empresa (WhatsApp)
        │
        ▼
Railway — bridge-production-13f7.up.railway.app
  • Node.js + whatsapp-web.js + Puppeteer/Chromium
  • Expone GET /status → { connected, qrDataUrl }
  • Al recibir mensaje → POST a WEBHOOK_URL
        │
        ├──► Supabase BD2 (vwaocoaeenavxkcshyuf)
        │    └── panel_clientes, panel_mensajes
        │
        └──► (via ingest-whatsapp Edge Function)
             Supabase BD1 (vhczofpmxzbqzboysoca)
             └── identity_profiles, identity_evidence
```

### Arquitectura destino (Oracle Cloud)

```
Celular empresa (WhatsApp)
        │
        ▼
Oracle Cloud VM — IP_PUBLICA_ORACLE:3000
  • Mismo código, mismas variables de entorno
  • systemd garantiza que el proceso siempre esté activo
  • Disco persistente → sesión WhatsApp sobrevive reinicios
        │
        (mismos destinos que antes)
```

---

## Variables de entorno del conector (a copiar en Oracle)

| Variable | Valor |
|---|---|
| `WEBHOOK_URL` | `https://vwaocoaeenavxkcshyuf.supabase.co/functions/v1/ingest-whatsapp` |
| `SUPABASE_URL` | `https://vwaocoaeenavxkcshyuf.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `[TU_SUPABASE_SERVICE_KEY]` |
| `PORT` | `3000` |

> ⚠️ Estas variables ya están en `Faces panel de pedido/whatsapp-conector/.env`

---

## Plan de migración paso a paso

---

### FASE 0 — Preparación (antes de empezar)

- [ ] Cuenta Oracle Cloud creada ✅ (ya hecho el 2026-04-27)
- [ ] Tener acceso al dashboard de Oracle Cloud
- [ ] Tener el archivo `.pem` de la API Key descargado (para OCI CLI)
- [ ] OCI CLI instalado en la máquina local (Antigravity lo instala)

---

### FASE 1 — Crear la VM en Oracle Cloud

**Quién lo hace:** Antigravity (via OCI CLI) o Ivan (via web console)  
**Tiempo estimado:** 10–15 minutos

#### Especificaciones de la VM a crear

| Parámetro | Valor |
|---|---|
| Shape | `VM.Standard.A1.Flex` (ARM — Always Free) |
| OCPUs | 2 |
| RAM | 12 GB |
| SO | Ubuntu 22.04 LTS (Minimal) |
| Almacenamiento | 50 GB SSD (siempre gratis) |
| Red | VCN con subred pública |

#### Pasos via OCI CLI (cuando Antigravity tenga acceso)

```bash
# 1. Instalar OCI CLI
pip install oci-cli

# 2. Configurar con API Key
oci setup config

# 3. Crear la VM (Antigravity genera el comando exacto)
oci compute instance launch \
  --availability-domain ... \
  --compartment-id ... \
  --shape VM.Standard.A1.Flex \
  --shape-config '{"ocpus":2,"memoryInGBs":12}' \
  --image-id ... \
  --subnet-id ...
```

#### Pasos alternativos via Web Console (más visual)

1. Ir a **Compute → Instances → Create Instance**
2. Cambiar Shape a **VM.Standard.A1.Flex**
3. Configurar: 2 OCPU, 12 GB RAM
4. Imagen: **Ubuntu 22.04**
5. Generar y descargar el **SSH Key Pair**
6. Crear instancia
7. Anotar la **IP pública** asignada

---

### FASE 2 — Configurar el firewall de Oracle

> ⚠️ Oracle bloquea todos los puertos por defecto. Hay que abrir el puerto 3000.

**Quién lo hace:** Antigravity (via OCI CLI o web console)

```bash
# Agregar regla de entrada en Security List
# Puerto 3000 TCP desde cualquier origen (0.0.0.0/0)

# También abrir en el firewall interno de Ubuntu:
sudo ufw allow 3000/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

---

### FASE 3 — Instalar dependencias en la VM

**Conexión SSH:**
```bash
ssh -i oracle_key.pem ubuntu@IP_PUBLICA_ORACLE
```

**Instalación de Node.js 20 LTS:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # Verificar: v20.x.x
```

**Instalación de Chromium (requerido por Puppeteer/whatsapp-web.js):**
```bash
sudo apt-get update
sudo apt-get install -y chromium-browser
which chromium-browser  # Verificar: /usr/bin/chromium-browser
```

**Dependencias del sistema:**
```bash
sudo apt-get install -y \
  libgbm-dev \
  libxshmfence-dev \
  libasound2 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libxss1 \
  libxtst6 \
  git
```

---

### FASE 4 — Subir y configurar el código

**Opción A — Clonar desde Git:**
```bash
git clone https://github.com/ivanarields/ventas-live.git
cd ventas-live/Faces\ panel\ de\ pedido/whatsapp-conector/
```

**Opción B — Transferir directamente (scp):**
```bash
# Desde la máquina local
scp -i oracle_key.pem -r \
  "Faces panel de pedido/whatsapp-conector/" \
  ubuntu@IP_PUBLICA_ORACLE:~/whatsapp-conector/
```

**Crear archivo .env en el servidor:**
```bash
cd ~/whatsapp-conector
cat > .env << 'EOF'
WEBHOOK_URL="https://vwaocoaeenavxkcshyuf.supabase.co/functions/v1/ingest-whatsapp"
SUPABASE_URL="https://vwaocoaeenavxkcshyuf.supabase.co"
SUPABASE_SERVICE_KEY="[TU_SUPABASE_SERVICE_KEY]"
PORT=3000
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
EOF
```

**Instalar dependencias Node:**
```bash
npm install
```

---

### FASE 5 — Configurar el servicio systemd (auto-reinicio)

> Este es el paso clave para que el proceso nunca se apague, ni siquiera si el servidor reinicia.

```bash
sudo nano /etc/systemd/system/whatsapp-bridge.service
```

Contenido del archivo:
```ini
[Unit]
Description=WhatsApp Bridge — Ventas Live
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/whatsapp-conector
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**Activar el servicio:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable whatsapp-bridge
sudo systemctl start whatsapp-bridge
sudo systemctl status whatsapp-bridge
```

---

### FASE 6 — Verificar que funciona

**Verificar que el endpoint responde:**
```bash
curl http://IP_PUBLICA_ORACLE:3000/status
# Debe devolver: {"connected":false,"qrDataUrl":"data:image/png;base64,..."}
```

**Ver logs en tiempo real:**
```bash
sudo journalctl -u whatsapp-bridge -f
```

---

### FASE 7 — Actualizar Vercel con la nueva URL

```bash
# Desde la carpeta del proyecto principal (ventas-live)
# 1. Eliminar la variable vieja
vercel env rm WHATSAPP_CONNECTOR_URL production

# 2. Agregar la nueva URL de Oracle
echo "http://IP_PUBLICA_ORACLE:3000" | vercel env add WHATSAPP_CONNECTOR_URL production

# 3. Redesplegar
vercel --prod
```

---

### FASE 8 — Escanear el QR y verificar conexión completa

1. Abrir la app: **https://ventas-live.vercel.app**
2. Ir a **Configuración → Sistema**
3. Escanear el QR con el celular de la empresa
4. Confirmar que aparece **"WhatsApp conectado ✓"**
5. Enviar un mensaje de prueba al número de la empresa
6. Verificar que llega al **Panel de Pedidos**

---

### FASE 9 — Apagar el servicio en Railway (opcional)

Una vez confirmado que Oracle funciona correctamente:

```bash
# Desde la carpeta whatsapp-conector
railway down   # Elimina el servicio de Railway
```

O directamente desde el dashboard de Railway → Delete Service.

---

## Checklist final de migración

- [ ] VM Oracle creada con IP pública
- [ ] Puerto 3000 abierto en firewall Oracle + UFW
- [ ] Node.js 20 + Chromium instalados
- [ ] Código subido al servidor
- [ ] `.env` configurado en el servidor
- [ ] `npm install` ejecutado
- [ ] Servicio `systemd` activo y habilitado
- [ ] `curl /status` devuelve QR
- [ ] `WHATSAPP_CONNECTOR_URL` actualizada en Vercel
- [ ] `vercel --prod` ejecutado
- [ ] QR escaneado desde la app
- [ ] Mensaje de prueba recibido en Panel de Pedidos
- [ ] Servicio Railway dado de baja

---

## Notas importantes

### Sobre la sesión de WhatsApp
- La primera vez **siempre hay que escanear el QR** (sesión nueva)
- La sesión queda guardada en `~/.wwebjs_auth/` en el disco de Oracle
- Si el servidor reinicia, **NO hay que re-escanear** (systemd reinicia el proceso y carga la sesión guardada)
- WhatsApp puede pedir re-escaneo cada **14–60 días** — esto es normal y ocurre en cualquier plataforma

### Sobre Railway
- El servicio actual en Railway seguirá funcionando hasta que expire
- No apagarlo hasta confirmar que Oracle funciona correctamente
- La variable `WHATSAPP_CONNECTOR_URL` en Vercel apunta a uno a la vez

### Comandos de mantenimiento en Oracle (para el futuro)
```bash
# Ver estado del servicio
sudo systemctl status whatsapp-bridge

# Ver logs
sudo journalctl -u whatsapp-bridge -f

# Reiniciar si algo falla
sudo systemctl restart whatsapp-bridge

# Actualizar el código
cd ~/whatsapp-conector
git pull   # si se clonó desde git
sudo systemctl restart whatsapp-bridge
```

---

*Documento creado: 2026-04-27*  
*Última actualización: 2026-04-27*
