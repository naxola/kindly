# 0010 — Contrato de eventos de negocio

**Estado:** Aceptado (2026-11-06)

## Contexto

Los cuatro productos del portafolio necesitan avisar de lo que pasa (altas,
organizaciones nuevas, invitaciones, pagos más adelante) a un único sitio que
alimente el CRM, las notificaciones al móvil y el marketing, sin que un fallo
de esas herramientas afecte al producto.

## Decisión

- Los casos de uso emiten eventos con `emitEvent(ctx, tx, …)` **dentro de su
  transacción**: el evento existe solo si el cambio se confirma (ADR 0004).
- El worker los entrega por **webhook HTTP firmado** (n8n u otro receptor).
- Formato (JSON): `{ id, type, occurredAt, organizationId, data }`.
- Cabeceras: `X-Event-Id`, `X-Event-Type`, `X-Timestamp` (segundos unix) y
  `X-Signature: sha256=HMAC_SHA256(secreto, "<timestamp>.<cuerpo>")` en hex.
- El receptor debe verificar la firma, rechazar marcas de tiempo de más de 5
  minutos y **deduplicar por `X-Event-Id`**: la entrega es _at-least-once_.
  `verifyEventSignature` en `@saas/adapters/events` es la implementación de referencia.
- Una respuesta no 2xx es un fallo: 8 reintentos con backoff desde 30 s, para
  aguantar que el receptor (n8n del homelab) esté caído un rato.
- Sin `EVENTS_WEBHOOK_URL`, los eventos solo se registran en el log del worker
  (tipo e id, nunca los datos).
- **Minimización de datos**: ids y lo mínimo que necesita el receptor. Hoy solo
  `user.created` (email de contacto) y `organization.created` (email del
  propietario) llevan un email; nunca tokens ni contraseñas.

## Eventos de la plantilla

| Tipo                   | Cuándo                      | Datos                                                         |
| ---------------------- | --------------------------- | ------------------------------------------------------------- |
| `user.created`         | Primera entrada al producto | `userId`, `email`                                             |
| `organization.created` | Alta de organización        | `organizationId`, `name`, `slug`, `ownerUserId`, `ownerEmail` |
| `invitation.created`   | Invitación creada           | `invitationId`, `role`                                        |
| `member.joined`        | Invitación aceptada         | `memberId`, `userId`, `role`                                  |

Cada producto añade sus tipos en `core/src/modules/events`.

## Alternativas

- **Llamar a n8n desde la petición:** un n8n caído rompería el alta.
- **Cola o bus externo (Kafka, SNS…):** infraestructura sin necesidad a este volumen.

## Consecuencias

- n8n recibe todos los productos con el mismo contrato y la misma verificación.
- Los emails enviados a n8n cuentan como tratamiento de datos: deben figurar en la
  política de privacidad de cada producto.
