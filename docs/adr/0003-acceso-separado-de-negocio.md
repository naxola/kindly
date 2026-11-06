# 0003 — Acceso (`auth_*`) separado de los usuarios de negocio

**Estado:** Aceptado (2026-11-06)

## Contexto
Quien puede entrar al sistema (credenciales, sesiones, verificación) y quién es
esa persona para el negocio (perfil, organización, rol, datos propios de cada
SaaS) son preocupaciones distintas. Mezclarlas obliga a crear un perfil de
negocio en el alta aunque no haga falta para acceder, acopla el negocio a la
librería de autenticación y complica borrar el acceso conservando el historial.

## Decisión
- **Acceso**: tablas con prefijo `auth_` (`auth_users`, `auth_sessions`,
  `auth_accounts`, `auth_verifications`, `auth_two_factors`…), gestionadas por la
  librería de autenticación con nombres configurados. Solo contienen lo necesario
  para acceder. **No conocen el negocio**: ninguna columna ni FK hacia tablas de negocio.
- **Negocio**:
  - `users`: la persona dentro del SaaS. Lleva `auth_user_id` (único, FK a
    `auth_users.id`). Es la única relación entre ambos mundos, y vive en el negocio.
  - `organization_members`: la persona en una organización, con su rol y sus
    datos en esa organización. Referencia `users.id`.
  - Cada producto añade lo suyo sobre `users`/`organization_members`. El nombre
    `members` queda libre para el significado propio de cada negocio.
- Toda tabla de negocio referencia `users.id` u `organization_members.id`,
  **nunca** `auth_users.id`.
- El alta crea **solo** `auth_users`. La fila `users` se crea cuando la persona
  entra por primera vez al producto (al crear una organización o aceptar una invitación).
- Solo `packages/adapters/auth` y `core/identity` acceden a `auth_*`. El resto de
  `core` recibe un `Actor` de negocio (`userId`, `organizationId`, `memberId`, rol).
  El script de fronteras lo verifica.
- El nombre visible y demás datos de perfil viven en `users`. Si la librería de
  autenticación exige un campo `name`, se trata como dato técnico mínimo.
  `SUPUESTO` a verificar con la versión exacta elegida.

## Alternativas
- **Una sola tabla `users` compartida con la librería de auth** (como kindly y
  procurement hoy): más simple al principio, pero acopla negocio y acceso.
- **Perfil creado en el alta:** filas sin uso para quien nunca entra al producto.

## Consecuencias
- Cambiar el sistema de acceso (SSO, un proveedor OIDC común a varios productos)
  solo afecta a la capa de acceso.
- RGPD: se puede eliminar el acceso de una persona y anonimizar `users` sin
  romper la integridad del historial de negocio.
- Resolver el `Actor` en cada petición requiere una consulta
  `auth_user_id → users → organization_members`; se resuelve una vez por petición.
