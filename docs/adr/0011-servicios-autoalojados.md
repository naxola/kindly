# 0011 — Servicios de apoyo autoalojados

**Estado:** Aceptado (2026-11-07)

## Contexto

Los productos aspiran a crecer, y depender de planes gratuitos de terceros (Sentry, ntfy.sh,
herramientas de newsletter) es un riesgo de coste y de límites a medida que crecen. El usuario
tiene un homelab con Coolify y Uptime Kuma.

## Decisión

Los servicios de apoyo de los productos se autoalojan en el homelab, compartidos por todos los
productos, y la plantilla habla con ellos por protocolos abiertos para poder cambiarlos:

| Necesidad        | Servicio autoalojado | Alternativa compatible sin tocar código |
| ---------------- | -------------------- | --------------------------------------- |
| Errores          | GlitchTip            | Sentry (mismo protocolo, `SENTRY_DSN`)  |
| Alertas al móvil | ntfy                 | ntfy.sh o Telegram (`ALERT_PROVIDER`)   |
| Disponibilidad   | Uptime Kuma          | Cualquier monitor HTTP y de latido      |
| Newsletter       | listmonk             | —                                       |

- El worker envía un **latido** (`HEARTBEAT_URL`, monitor _Push_ de Uptime Kuma) para que un
  worker caído o colgado se detecte sin exponer su puerto.
- **Newsletter con listmonk**: la lista, el doble opt-in, las bajas y los envíos los gestiona
  listmonk; la web pública solo ofrece el formulario de alta. Los productos no guardan
  suscriptores en su base de datos.
- Excepciones aceptadas: GitHub (código, CI y registro de imágenes) y el proveedor de correo
  transaccional (Resend), porque enviar correo con buena entregabilidad desde un homelab no es
  viable.

## Impacto

- Coste: recursos del homelab (GlitchTip es el más pesado: necesita su propia base de datos).
- Riesgo: si el homelab cae, caen a la vez staging y la vigilancia. Para producción hará falta al
  menos un monitor fuera del homelab (ADR de producción, pendiente).
- Pendiente: el formulario de newsletter de la web pública (requiere una instancia de listmonk
  con una lista pública).
