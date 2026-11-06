# 0008 — Observabilidad y alertas

**Estado:** Propuesto

## Contexto
El objetivo es enterarse de un fallo antes que el cliente, saber dónde ocurrió
y poder reintentar sin perder datos.

## Propuesta
- **Errores**: Sentry o GlitchTip autoalojado, con usuario y organización (ids, nunca emails).
- **Logs**: JSON con pino, `correlationId` de la petición propagado a los jobs;
  centralizados (Grafana Loki o Better Stack).
- **Jobs**: alerta cuando un job llega a fallo definitivo; panel con la cola
  (pendientes, fallidos, duración).
- **Salud**: `/api/health` (vivo) y `/api/ready` (BD, cola, storage), vigilados
  desde fuera de Hetzner (monitor externo) y además desde el homelab.
- **Alertas**: un único canal en el móvil (Telegram o ntfy), con niveles.

## Pendiente
Elegir herramienta de errores y de logs (coste frente a autoalojar).
