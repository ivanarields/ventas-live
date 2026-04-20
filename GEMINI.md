# GEMINI.md

Este proyecto usa [`AGENTS.md`](./AGENTS.md) como fuente única de contexto para cualquier agente de IA.

**Por favor lee primero `AGENTS.md`** — contiene:
- Qué es la app (Ventas Live — consignación de ropa en Bolivia)
- Flujo operativo (4 pantallas)
- Sistema de etiquetas/casilleros
- Stack (React 19 + Express + Supabase)
- Credenciales de desarrollo
- Comandos (`npm run dev`, deploy de Edge Functions)
- Schema de base de datos
- Convenciones de código
- Fases completadas (1-4)
- Reglas de negocio críticas
- Configuración de Gemini 2.5 Flash Lite para el parser de notificaciones

**Documentación técnica detallada:** [`docs/notifications-system.md`](./docs/notifications-system.md).

---

## Notas específicas para Gemini / Antigravity

- **Idioma:** responder siempre en español.
- **Eres la IA que está integrada en el parser de notificaciones bancarias** (`supabase/functions/ingest-notification/index.ts`). Cuando modifiques ese archivo, usar el modelo `gemini-2.5-flash-lite` con `thinkingConfig.thinkingBudget: 0` — otros modelos fallan (ver AGENTS.md sección "Modelos descartados").
- **Deploy Edge Functions:** `C:/Users/IVAN/bin/supabase.exe functions deploy <nombre> --no-verify-jwt --project-ref vhczofpmxzbqzboysoca`. El flag `--no-verify-jwt` es **obligatorio** (sin eso MacroDroid recibe 401).
- **Nunca generar nombres placeholder de pagadores** (tipo "PAGO Yape", "Depósito recibido"). Si no hay nombre real en la notificación, dejar en `manual_review_queue`.
