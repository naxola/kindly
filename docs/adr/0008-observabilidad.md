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

## Pendiente

Elegir herramienta de errores y de logs (coste frente a autoalojar) al llegar a
la fase de observabilidad. El monitor externo de producción se concreta cuando
se decida dónde vive producción (ADR 0006).
