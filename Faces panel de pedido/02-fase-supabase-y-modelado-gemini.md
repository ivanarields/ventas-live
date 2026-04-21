# Fase 2 — Supabase, esquema de datos y criterios de persistencia
**Modelo recomendado:** Gemini 3.1 Pro (High)

## Objetivo de esta fase
Dejar definido y validado el modelo de datos, la persistencia y las reglas mínimas de almacenamiento.

## Entradas que debes darle
Pásale:
- SQL completo de tablas
- definición del bucket `whatsapp-media`
- variables de entorno relacionadas con Supabase
- requisitos funcionales de mensajes, clientes, media y payload crudo

## Lo que debe entregar
1. Revisión crítica del SQL.
2. Versión final del SQL lista para ejecutar.
3. Reglas de almacenamiento de medios.
4. Recomendaciones de índices, constraints y campos obligatorios.
5. Política mínima de seguridad y acceso.
6. Checklist de pruebas de base de datos.

## Prompt sugerido
Quiero que revises y mejores el diseño de Supabase para este MVP.  
Necesito una salida lista para implementación real.

Tu tarea:
1. revisar el SQL,
2. mantenerlo simple,
3. proponer mejoras solo si son necesarias,
4. asegurar que soporte mensajes entrantes, salientes y multimedia,
5. definir cómo guardar rutas de media y payload crudo,
6. preparar una versión final lista para ejecutar.

Reglas:
- no compliques el modelo innecesariamente,
- prioriza velocidad de implementación,
- explica los cambios solo si aportan valor real,
- entrega SQL final, checklist de pruebas y notas de operación.

## Salida esperada
- `supabase-schema-final.sql`
- `supabase-checklist.md`
- `storage-policy.md`
