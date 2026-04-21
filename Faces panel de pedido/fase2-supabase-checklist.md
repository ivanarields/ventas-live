# Checklist de validación — Fase 2 (Supabase)

Una vez hayas copiado y pegado el código de `fase2-supabase-schema-final.sql` en tu entorno de base de datos **nuevo** de Supabase, revisa obligatoriamente esta lista:

- [ ] **Aislamiento comprobado:** Has verificado visualmente en Supabase que estás en un **Proyecto Diferente** al Supabase clásico de la App original.
- [ ] **Tablas Creadas:** Aparecen en la sección "Table Editor" las 3 tablas siguientes:
  - `panel_raw_webhooks`
  - `panel_clientes`
  - `panel_mensajes`
- [ ] **Bucket Activo:** Existe en "Storage" un balde público llamado exactamente `whatsapp-media`.
- [ ] **Credenciales separadas:** Has copiado en un bloc de notas temporal la URL y la llave privada (`SERVICE_ROLE_KEY`) de este NUEVO PROYECTO, la cual usaremos en la Fase 4 de n8n.
- [ ] **Datos Iniciales Vacíos:** No hay ningún dato y ninguna integración vieja está apuntando hacia acá.

*Si tienes todo con un "Sí", ¡tu arquitectura de datos inicial ya está terminada con 0% fricción! Podemos pasar al código del servidor/puente de la Fase 3.*
