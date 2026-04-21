# Políticas de Almacenamiento (Storage) Supabase

Como este es un **nuevo proyecto de Supabase** aislado para el *Panel de Pedidos*, debes crear un contenedor específico para guardar la las capturas, imágenes y audios que lleguen de WhatsApp.

## 1. Creación del Bucket
Entra a tu nuevo dashboard de Supabase:
1. Ve a **Storage** en el menú izquierdo.
2. Haz clic en **New Bucket**.
3. Nombre exacto: `whatsapp-media`
4. Marca la opción: **Public bucket** (Esto es vital para que la UI local del *PanelPedidos* pueda mostrar la imagen usando un link genérico).

## 2. Lógica de Seguridad de n8n
Dado que vamos a enviar las fotos desde nuestro workflow de **n8n**, utilizaremos el nodo HTTP de Supabase (o nodo específico de Supabase) inyectando tu token **`SERVICE_ROLE_KEY`**. 

El `SERVICE_ROLE_KEY` tiene privilegios de administrador absoluto y sobrepasa por defecto cualquier política de seguridad de escritura limitante (RLS y Storage Policies). No es necesario enredarse creando políticas complejas de autenticación temporal; tu pipeline interno siempre tendrá permiso de guardar las imágenes.

## 3. Formato de guardado lógico (n8n hacia Bucket)
Para mantener ordenado el almacenamiento cuando n8n deposite las imágenes, la ruta que configuraremos en la Fase 4 utilizará el formato:
`/whatsapp-media/{phone}/{timestamp}_archivo.{ext}`

*(Ejemplo: `/whatsapp-media/59160000000/16849303_foto.jpg`)*
