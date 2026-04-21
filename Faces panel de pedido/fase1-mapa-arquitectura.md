# Mapa de Arquitectura

La arquitectura de este MVP adopta un diseño **Orientado a Eventos E2E** unidireccional y bidireccional simple. Consta de 4 Capas exactas:

##  Capa 1: Front-Interaction (WhatsApp)
* **Entorno:** Dispositivo móvil del cliente / Servidor con sesión Web-WhatsApp.
* **Componente Activo:** La librería de inyección WA (LocalAuth) que captura listeners predefinidos (`message_create`, `message_in`, `message_out`).

## Capa 2: Bridge/Listener (Node.js)
* **Responsabilidad:** Orquestar el QR y mantener la sesión viva. Escuchar el buffer de WhatsApp en tiempo puro.
* **Comportamiento:** Si llega mensaje -> Comprime la cabecera -> Descarga el Media (audio, foto, doc) en buffer temporal base64 -> Agrupa todo en un super objeto JSON -> Hace POST crudo hacia un Catch-Webhook HTTP.

## Capa 3: Lógica y Transformación (n8n Automator)
* **Responsabilidad:** Inteligencia en la nube, limpieza y bifurcación (The Brain).
* **Comportamiento:** 
    1. Recibe Webhook Catch.
    2. Responde 200 al Listener para liberar memoria local.
    3. Normaliza payload (código de país, número de teléfono).
    4. **IF Route:** Si tiene Media -> Upload a Supabase Storage.
    5. **Upsert Profile:** Checa si el Cliente ya existe en Supabase; si no, lo crea.
    6. **Insert Message:** Vuelca la data ligada con URI del storage en la DB.

## Capa 4: Persistencia y Ui (Supabase + Ventas Live)
* **Responsabilidad:** Single Source of Truth.
* **Comportamiento:** Recibir Inserts de n8n con Row Level Security mediante el Service Key o JWT. El estado del pedido ahora aparece disponible en la nueva vista aislada `PanelPedidos.tsx` de la app local del cliente.
