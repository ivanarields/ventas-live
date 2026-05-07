# Plan Mayo — Tienda Profesional

## Proposito Unico

Crear una tienda profesional, rapida y adictiva para el cliente.

Contexto real del negocio:

- Hoy la mayoria de clientas compra por WhatsApp.
- La tienda no debe pelear contra WhatsApp.
- La tienda debe ser una alternativa facil cuando la clienta tenga tiempo.
- La tienda tambien debe ser el lugar donde la clienta consulta todo sin preguntar siempre por chat.
- La tienda debe sentirse como una red social de ventas de ropa: novedades, productos, Lives, estados y avisos.

La tienda debe lograr esto:

- El cliente entra y entiende todo rapido.
- El cliente ve productos y quiere seguir mirando.
- El cliente compra con la menor cantidad de pasos posible.
- El cliente ve el estado de sus pedidos sin preguntar por WhatsApp.
- El cliente puede elegir dia y horario para recibir o retirar.
- El cliente puede ver sus compras de tienda y de Live en un solo historial.
- La duena puede manejar pedidos, calendario, productos y mensajes desde un panel claro.
- El cliente puede resolver dudas frecuentes: cuando entregan, cuando hay Live, donde queda la direccion y que novedades hay.

## Regla Principal

Todo lo nuevo debe vivir en la base de datos de la tienda.

Base de tienda:

`thgbfurscfjcmgokyyif`

No se deben modificar datos de la app principal para las nuevas funciones de tienda.

## Que Se Puede Tocar

Se puede tocar codigo de tienda:

- `src/storefront/`
- `src/components/AdminTiendaView.tsx`
- Endpoints de tienda en `server.ts`
- Scripts o migraciones para la base de datos de tienda
- Documentacion de tienda

## Que No Se Debe Tocar

No se debe tocar el flujo principal de trabajo:

- Lista de Pagos principal
- Perfil principal del cliente
- Mesa de Preparacion principal
- Casilleros
- Sistema principal de WhatsApp
- Datos principales ya existentes

## Advertencia Importante

La tienda actual ya tiene una conexion que, al confirmar pago, puede crear pago y pedido en la app principal.

Para la nueva Tienda Profesional, esa conexion debe tratarse como una parte delicada.

Recomendacion:

- Primero construir las mejoras en modo tienda-only.
- Guardar calendario, historial, mensajes y novedades solo en la base de tienda.
- No escribir datos nuevos en la app principal sin aprobacion explicita.
- Si hace falta mostrar datos de Live, usar una copia resumida en la base de tienda.

## Excepcion Controlada

Si se necesita mostrar compras de Live dentro de la tienda, la forma recomendada es crear una copia resumida en la base de tienda.

La tienda lee esa copia.

La tienda no cambia el sistema principal.

## Resultado Esperado

Al final, el cliente tendra una experiencia tipo app:

- Entra a la tienda.
- Mira productos.
- Compra rapido.
- Elige cuando quiere su pedido.
- Ve su historial.
- Ve estados claros.
- Recibe o puede consultar mensajes claros.
- Vuelve porque la tienda se siente facil, bonita y confiable.
- Consulta cuando hay Live.
- Consulta fechas de entrega.
- Consulta direccion y novedades.
- Puede comprar por tienda o seguir comprando por WhatsApp sin friccion.
