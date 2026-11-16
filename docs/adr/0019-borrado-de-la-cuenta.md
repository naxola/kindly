# 0019 — Borrado de la cuenta (RGPD)

**Estado:** Aceptado (2026-11-14). El usuario validó el diseño: las organizaciones **unipersonales
se archivan** al ejecutar el borrado, la auditoría **conserva el id del actor** tras anonimizar, y
el plazo de gracia es de **14 días para todas las cuentas**. Implementado el 2026-11-15 (R4.5).

## Problema

Una persona no puede borrar su cuenta ni llevarse sus datos. El esquema ya lo prevé (el acceso
`auth_*` se separa del negocio, `users.auth_user_id` pasa a nulo y existe `users.anonymized_at`, ADR
0003), pero falta el flujo, y el derecho de supresión y de portabilidad del RGPD lo exige.

## Decisión propuesta

1. **Solicitud** desde Ajustes → Cuenta, con la **contraseña** (reautenticación). Se anota
   `deletion_requested_at` y `deletion_scheduled_for` (+14 días) en el usuario de negocio y se envía
   un correo de confirmación con el enlace para cancelar. Durante el plazo la persona **sigue
   entrando con normalidad** y puede **cancelar** con un clic; la pantalla muestra la cuenta atrás.
2. **Reglas antes de aceptar la solicitud:**
   - Si es el **último ADMIN activo** de una organización **con más miembros**: se bloquea, con el
     detalle de cuáles (D6). Debe nombrar a otro ADMIN o archivar la organización.
   - Si es el **único miembro** de una organización: esa organización se **archiva** al borrar (sin
     miembros no tiene sentido); se avisa en la solicitud. Una suscripción de pago activa **debe
     cancelarse antes** (el flujo lo exige, igual que al archivar a mano).
3. **Ejecución** por un job diario (`identity.process-account-deletions`, idempotente): al vencer el
   plazo, en una transacción: borra el acceso (`auth_users`, sus sesiones, cuentas y
   verificaciones), deja `users.auth_user_id` en nulo, **anonimiza** (`display_name` genérico,
   `locale` nulo, `anonymized_at`), **desactiva sus membresías**, archiva las organizaciones
   unipersonales, escribe la auditoría y emite el evento de negocio **`user.deleted`** (solo el id
   del usuario, **nunca el email**) para el CRM.
4. **Exportación de datos personales** (`GET /api/v1/me/export`, JSON descargable): perfil,
   membresías y las entradas de auditoría de las que la persona es autora. Disponible durante el
   plazo y antes de pedir el borrado.
5. **Qué se conserva:** el historial de negocio (miembros anonimizados, auditoría con el id del
   actor, que deja de poder asociarse a una persona al borrarse el acceso). No se borra información
   de la organización: pertenece a la organización.

## Alternativas

- **Borrado inmediato:** más simple, pero un error o una cuenta comprometida es irreversible al
  instante; el plazo de gracia protege (D6).
- **Borrar también el usuario de negocio (`users`):** rompe las claves foráneas del historial
  (auditoría, invitaciones, uso). La anonimización cumple el objetivo sin perder la trazabilidad.
- **Transferir automáticamente la administración** al miembro más antiguo: decide por la
  organización lo que le corresponde decidir a ella. Descartada.
- **Un plazo más largo** (30 días): más protección y más tiempo con datos retenidos; 14 es el
  valor de D6.

## Impacto

- Migración aditiva (dos columnas en `users`), un permiso implícito (acción personal), un job
  programado con su consumidor, un tipo de evento nuevo (`user.deleted` en `BUSINESS_EVENT_TYPES`),
  rutas (`api:generate`), pantalla y plantillas de correo (solicitud, cancelación y borrado
  realizado, es/en).
- **Las copias de seguridad** conservan datos hasta que caducan: la política de retención de copias
  (R5.5, pendiente de D5) debe ser compatible con la respuesta que se dé al RGPD.
- La anonimización no es reversible: se prueba con datos reales en un entorno de staging antes de
  activarla en producción.

## Decisiones tomadas (2026-11-14)

- ¿Las **organizaciones unipersonales se archivan** al borrar la cuenta (recomendado) o se bloquea
  el borrado hasta que la persona las archive ella misma?
- ¿La **auditoría conserva el id del actor** tras anonimizar (recomendado: deja de ser identificable
  porque el acceso desaparece) o se pone a nulo?
- ¿Te vale el plazo de **14 días** también para cuentas con una organización de pago, o quieres un
  plazo distinto en ese caso?
