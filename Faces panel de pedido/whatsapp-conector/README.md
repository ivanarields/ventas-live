# 📲 Conector Puente WhatsApp a n8n

Este microservicio se encarga pura y exclusivamente de hacer de antena. Escucha la sesión de WhatsApp mediante escaneo QR y descarga todo el flujo de texto y multimedia para dispararlo al webhook receptor de n8n.

## 🚀 Despliegue en la Nube (Railway o Render)

No hace falta que lo despliegues en la web mientras estemos construyendo la Fase 4 (n8n). Úsalo en local para hacer tus pruebas escaneando el código QR en esta misma terminal.

Una vez que comprobemos que todo camina perfecto:
1. Crea una cuenta gratuita apuntando tu GitHub a **Railway.app** (o **Render.com**).
2. Sube esta carpetita `whatsapp-conector` a un repositorio de Github.
3. Las plataformas de Railway instalarán Node.js automáticamente porque ven tu `package.json` y usarán tu script `"start": "node index.js"`.
4. El QR code aparecerá en la consola de Logs web de Railway. Lo escaneas desde tu celular ¡y listo! Ya no dependerás de tu computadora encendida.
