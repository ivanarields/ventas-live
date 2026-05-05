# Pruebas pendientes antes de cerrar el ciclo

## Ya probado ✅
- Cliente nuevo llega por WhatsApp → se crea perfil + detalle de pedido automáticamente
- Botón ⚡ Live procesa conversaciones una por una con progreso visible
- Tarjeta gris "PAGO" eliminada del perfil cuando no hay pedido

## Pendiente de probar antes de dar por cerrado

1. **Verificación manual desde el carrusel**
   - Que haya un pago morado/gris en detalle de pedido
   - Tocar el círculo → popup → confirmar
   - Verificar que cambia de color a morado sólido

2. **Dos comprobantes distintos en el mismo Live**
   - Dos números diferentes mandan comprobante
   - ⚡ Live procesa los dos
   - Ambos deben aparecer con perfil y detalle de pedido

3. **Eliminar conversaciones desde Configuración → Datos**
   - Cargar lista de conversaciones → eliminar una o todas
   - Confirmar que desaparecen correctamente

## Estado
Pendiente subir a producción. Todo compilado y probado en local (localhost:3004).
