# 0017 — Supresión de correo (rebotes y quejas)

**Estado:** Propuesto (2026-11-14). Decisión D11 (guardar solo el hash del email) ya tomada por el
usuario; falta validar el resto del diseño. **No se implementa (R3.4) hasta que el usuario lo valide.**

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
- **Pendiente de comprobar antes de escribir código:** el formato exacto de eventos y de firma de
  los webhooks de Resend en su documentación vigente (no leído todavía); si el producto usa otro
  proveedor, el adaptador cambia pero el puerto no.
- Con solo el hash no se puede avisar a una persona de que su dirección está suprimida; sí se
  puede comprobar la dirección de quien está dentro de la sesión (su email se hashea al vuelo).

## Decisiones que necesito de ti

- ¿Te vale que quitar una supresión sea **solo por script** (recomendado) o la quieres en la interfaz?
- ¿Confirmas **Resend** como proveedor sobre el que escribir el adaptador del webhook?
