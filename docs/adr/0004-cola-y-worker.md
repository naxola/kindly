# 0004 — Cola pg-boss con encolado transaccional y worker

**Estado:** Aceptado (2026-11-06)

## Contexto
Correos, eventos de negocio, importaciones y tareas programadas no deben
bloquear la petición del usuario ni perderse si el proceso se reinicia.

## Decisión (igual que procurement)
- pg-boss sobre el mismo PostgreSQL, detrás de la interfaz `JobQueue` de `core`.
- El job se encola **en la misma transacción** que el cambio de negocio.
- Cada job lleva `organizationId`, `correlationId` y una clave de idempotencia
  de la que se deriva su id: el mismo efecto nunca se encola dos veces.
- Reintentos limitados con backoff; al agotarse, fallo definitivo visible y alertado (ADR 0008).
- La web solo encola (`producer`); `apps/worker` consume, supervisa y programa.
- Jobs definidos con `defineJob` en `core`, registrados en `apps/worker/src/handlers.ts`.

## Alternativas
- BullMQ + Redis: otro servicio y sin encolado transaccional.
- Inngest / colas serverless: sin encolado transaccional (requiere outbox).
- `after()` de Next (kindly hoy): sin reintentos ni durabilidad.

## Consecuencias
- El sondeo de pg-boss mantiene la BD activa: incompatible con planes que
  suspenden la BD por inactividad (Neon gratuito).
