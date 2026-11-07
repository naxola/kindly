# 0008 — Observabilidad y alertas

**Estado:** Aceptado (2026-11-06)

## Contexto

El objetivo es enterarse de un fallo antes que el cliente, saber dónde ocurrió
y poder reintentar sin perder datos.

## Decisión

- **Errores**: Sentry o GlitchTip autoalojado, con usuario y organización (ids, nunca emails).
- **Logs**: JSON con pino, `correlationId` de la petición propagado a los jobs;
  centralizados (Grafana Loki o Better Stack).
- **Jobs**: alerta cuando un job llega a fallo definitivo; panel con la cola
  (pendientes, fallidos, duración).
- **Salud**: `/api/health` (vivo) y `/api/ready` (BD, cola, storage), vigilados
  desde fuera de la infraestructura que vigilan (monitor externo).
- **Alertas**: un único canal en el móvil (Telegram o ntfy), con niveles.

## Concreción (fase 5, 2026-11-07)

- **Errores**: protocolo de Sentry con `@sentry/node`, que sirve igual para Sentry y para
  GlitchTip (se elige con el DSN). Lo usan el worker y el servidor de la web
  (`instrumentation.ts`); el adaptador vive en `@saas/adapters/errors`. No se usa
  `@sentry/nextjs`: añade un plugin de build y más superficie sin aportar nada al servidor.
  Privacidad: el SDK 11 lo recoge todo por defecto, así que se desactiva cada categoría
  (`dataCollection`), las variables locales y los breadcrumbs, y `beforeSend` vuelve a limpiar
  el evento. Se envían solo ids y el `correlationId`.
- **Qué se reporta**: errores no controlados de la API y de las páginas, errores inesperados de
  Better Auth (no los esperados: contraseña errónea, límite de intentos) y jobs en fallo
  definitivo. Los `DomainError` 4xx no se reportan.
- **Alertas**: ntfy o Telegram (`ALERT_PROVIDER`), una por motivo cada 15 minutos. Críticas: job
  en fallo definitivo. Aviso: cola con un job listo esperando más de `QUEUE_MAX_WAIT_SECONDS`.
- **Salud del worker**: servidor HTTP mínimo con `/health` y `/ready` (BD) en
  `WORKER_HEALTH_PORT`, para el healthcheck del contenedor.
- **Panel de la cola**: en terminal (`pnpm ops:queue` y `pnpm ops:queue retry`), sin pantalla
  web: es una herramienta de operador, no de cliente, y no necesita permisos nuevos.
- **Runbook**: `docs/operations.md`.

## Pendiente

- Errores del navegador: no se recogen todavía (se añadirían con un DSN público y el mismo
  criterio de privacidad).
- Centralizar logs (Grafana Loki o Better Stack) y el monitor externo: con el despliegue
  (fase 6) y cuando se decida dónde vive producción (ADR 0006).
