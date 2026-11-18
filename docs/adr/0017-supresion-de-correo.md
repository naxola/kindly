# 0017 — Supresión de correo (rebotes y quejas)

**Estado:** Aceptado (2026-11-14). El usuario validó el diseño con las opciones recomendadas:
las supresiones se quitan **solo por script** (`pnpm ops:email`) y el adaptador del webhook se
escribe para **Resend**. Implementado en R3.4.

## Problema

No se procesan rebotes ni quejas: se sigue enviando a direcciones que el proveedor de correo ya
marcó, lo que daña la reputación del dominio y puede acabar en bloqueo del remitente.

## Decisión propuesta

1. **Webhook firmado del proveedor** (`/api/webhooks/email`, mismo patrón que el de pagos: firma
   verificada antes de leer nada, respuesta 2xx siempre que el evento sea válido para que el
   proveedor no reintente sin fin).
2. **Tabla global `email_suppressions`** (declarada en `GLOBAL_TABLES` con este ADR): `email_hash`
   (SHA-256 del email normalizado en minúsculas, **D11: nunca el email en claro**), `reason`
   (`BOUNCE_PERMANENT` o `COMPLAINT`), `source_event_id` (idempotencia), `created_at`.
3. **Comprobación en el `EmailSender`** antes de enviar: si el hash está suprimido, no se envía, se
   registra en el log **sin la dirección** y el job termina bien (no es un fallo que reintentar).
4. **Correos de acceso** (verificación, recuperación de contraseña): solo se suprimen por **rebote
   permanente**, nunca por queja (una queja sobre una invitación no debe impedir recuperar la
   cuenta). Rebotes temporales no se registran.
5. **Quitar una supresión:** por script de operaciones (`pnpm ops:email unsuppress <email>`), no por
   la interfaz; se documenta en `docs/operations.md`.

## Alternativas

- **Guardar el email en claro:** permite mostrar «esta dirección está suprimida», pero añade un
  dato personal más a una tabla global sin tenant. Descartada por D11.
- **Confiar solo en la lista de supresión del proveedor:** el proveedor ya no envía a esas
  direcciones, pero seguimos creando trabajos, registros y reintentos inútiles y no vemos el
  problema. Se mantiene como respaldo, no como solución.
- **No hacer nada:** descartada por el riesgo de reputación.

## Impacto

- Una tabla global y una consulta por hash antes de cada envío (clave primaria).
- Una variable nueva de entorno: el secreto de firma del webhook del proveedor (`.env.example`,
  `infra/staging/compose.yml`, `infra/staging/.env.example`).
- **Formato comprobado el 2026-11-14** en la documentación de Resend (eventos `email.bounced` y
  `email.complained`, `data.to` es una lista, `bounce.type` vale `Permanent` o `Temporary`) y de
  Svix (firma HMAC-SHA256 sobre `id.timestamp.cuerpo` con la parte base64 del secreto `whsec_`).
  La verificación se hace con `node:crypto`, sin dependencia nueva. Si el producto usa otro
  proveedor, cambia el adaptador y no el resto.
- Con solo el hash no se puede avisar a una persona de que su dirección está suprimida; sí se
  puede comprobar la dirección de quien está dentro de la sesión (su email se hashea al vuelo).

## Decisiones tomadas (2026-11-14)

- ¿Te vale que quitar una supresión sea **solo por script** (recomendado) o la quieres en la interfaz?
- ¿Confirmas **Resend** como proveedor sobre el que escribir el adaptador del webhook?
