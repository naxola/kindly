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
- El nombre visible y demás datos de perfil viven en `users`. Better Auth 1.7.7
  exige `name` en `auth_users`: se trata como dato técnico mínimo y solo se usa
  para proponer el `display_name` inicial (verificado en la fase 2).
- **La organización activa no se guarda en la sesión de acceso** (procurement sí
  lo hace con `activeOrganizationId`). Vive en una cookie de la app
  (`active_org`, httpOnly) que es solo una preferencia: cada petición la valida con
  `resolveActor`, y si ya no es válida se borra. Sin cookie y con una única
  organización, se usa esa.
- El enlace de invitación lleva el token en el **fragmento** (`/invite#token`): el
  navegador no lo envía al servidor, así que no acaba en logs ni en `Referer`.
- **Alta desde una invitación** (2026-11-06, a petición del usuario): si el email
  invitado no tiene cuenta, la propia página de la invitación pide solo nombre y
  contraseña y crea la cuenta **ya verificada**, porque abrir el enlace enviado a ese
  buzón demuestra que se controla. Inicia sesión y une a la organización en el mismo
  paso. Si el email ya tiene cuenta, solo se ofrece iniciar sesión; si el enlace ya se
  usó, se dice y se ofrece iniciar sesión. La vista pública indica si el email tiene
  cuenta: solo lo ve quien tiene el token, enviado a ese mismo buzón.
- `users.auth_user_id` es nullable con `ON DELETE SET NULL`: borrar el acceso
  deja el usuario de negocio anonimizable y su historial intacto.
- MFA (TOTP) queda para más adelante: el plugin de Better Auth añadirá
  `auth_two_factors` sin tocar el negocio.

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
