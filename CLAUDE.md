# CLAUDE.md — Plantilla SaaS

Plantilla base para los SaaS del portafolio (procurement, kindly, syncroforms,
priorityhunter). Contiene **estructura y fontanería, nunca dominio**: acceso,
organizaciones, cola y worker, correo, observabilidad, eventos de negocio, UI
base, web pública con blog y despliegue. Cada producto añade solo su negocio.

Origen: extraída de la arquitectura de `naxola/procurement` (rama `staging`).

- Decisiones: `docs/adr/`. Estado y siguientes pasos: `docs/roadmap.md`.
- Desarrollador único. Conversación y documentación en **español**; código,
  identificadores y commits en **inglés**.

## Reglas de ejecución (obligatorias)

1. Respeta las decisiones de `docs/adr/` con estado **Aceptado**. Las que están
   en **Propuesto** no se implementan hasta que el usuario las valide.
2. **Nada de dominio en la plantilla.** Si algo solo tiene sentido para un
   producto concreto, no entra aquí.
3. Inspecciona antes de tocar: estado del repo, convenciones y código existente.
4. Incrementos pequeños, revisables y reversibles.
5. Nada de datos simulados presentados como reales ni botones sin comportamiento.
6. Para cambiar una decisión arquitectónica: ADR nuevo (problema, alternativas,
   impacto) y aprobación del usuario.
7. Toda dependencia o infraestructura nueva se justifica por necesidad y coste.
8. **No afirmes haber ejecutado pruebas que no has ejecutado.** No ocultes
   fallos borrando pruebas ni relajando validaciones o permisos.
9. Nunca expongas secretos, tokens ni datos personales en logs, respuestas o UI.
10. Ninguna migración destructiva sin autorización expresa.

## Flujo de ramas (obligatorio)

- `main`: versión estable de la plantilla. **Solo el usuario fusiona en `main`.**
  Todavía no existe: se crea al validar la plantilla, con la etiqueta `v1.0.0`.
- `staging`: integración. Todo el trabajo llega aquí.
- Cada cambio en su propia rama desde `staging`: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Al terminar: push de la rama, merge `--no-ff` en `staging` y push de `staging`.
- Sin force-push ni reescritura de historial publicado.
- Las versiones de la plantilla se etiquetan (`v1.0.0`…). Cada producto anota
  en su README de qué versión partió.

## Estructura

```
apps/web          SaaS (app.producto.com): pantallas con sesión + API
apps/site         Web pública (producto.com): portada, precios, blog, legales
apps/worker       Consumidor de la cola: correos, eventos, tareas programadas
packages/config   Validación de env (zod), tsconfig/eslint compartidos
packages/database Esquema, migraciones, RLS, cliente con contexto de tenant
packages/core     Dominio común + casos de uso por módulo, autorización
packages/adapters Auth, correo, cola, storage, logger, cobros
packages/ui       Sistema de diseño compartido por web y site (tokens de marca)
packages/content  Fuente de contenidos del blog (MDX; CMS más adelante)
infra/            Compose de local y staging (homelab); producción por decidir
```

- En `packages/core` cada módulo es una carpeta con un `index.ts` público.
  **Prohibido importar el interior de otro módulo.** Las fronteras se verifican
  en `lint` con un script propio.
- Las reglas de negocio viven solo en `core`. Rutas, páginas y worker son capas
  finas que llaman a los mismos casos de uso.
- Lo que añade un producto: `packages/core/src/modules/<negocio>/`,
  `apps/web/src/features/<negocio>/`, su archivo de marca y sus textos.

## Acceso frente a negocio (ADR 0003)

- **Acceso** = tablas `auth_*` (`auth_users`, `auth_sessions`, `auth_accounts`,
  `auth_verifications`…). Solo sabe quién puede entrar. **No conoce nada del
  negocio**: ninguna columna ni clave foránea hacia tablas de negocio.
- **Negocio** = `users` (persona dentro del SaaS) y `organization_members`
  (persona en una organización, con su rol). La relación vive en el negocio:
  `users.auth_user_id → auth_users.id` (única).
- Todas las tablas de negocio referencian `users.id` u
  `organization_members.id`, **nunca** `auth_users.id`.
- El alta solo crea `auth_users`. El `users` de negocio nace cuando la persona
  entra al producto por primera vez (crear organización o aceptar invitación).
- Solo `packages/adapters/auth` y el módulo `core/identity` tocan las tablas
  `auth_*`. El resto de `core` trabaja con un `Actor` de negocio.
- `members` queda libre para el significado que le dé cada producto (socios,
  afiliados…).

## Reglas de datos

- Aislamiento entre tenants: `organization_id` en toda tabla del tenant, filtro
  explícito y además RLS (ADR 0002).
- Autorización en servidor, dentro de cada caso de uso, con denegación por
  defecto. Los filtros de la UI no son seguridad.
- Validación con zod en todos los límites del sistema. Errores normalizados.
- Auditoría de acciones relevantes con actor, tenant, acción, recurso y `correlationId`.
- Jobs idempotentes, con reintentos limitados, backoff y fallo definitivo visible.
- Logs estructurados con `correlationId`. Nunca contraseñas, tokens ni datos
  personales innecesarios.

## Comandos

Node 24.21.0 (`.node-version`) y pnpm 10.34.6 vía corepack. Postgres local en el puerto **5441**.

| Comando                                                  | Qué hace                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm install`                                           | Dependencias (aisladas: `node-linker=isolated`)                                        |
| `cp .env.example .env`                                   | Configuración local (solo vale para el `docker-compose.yml` local)                     |
| `pnpm infra:up` / `pnpm infra:down`                      | Postgres en Docker, con los roles `app_migrator`, `app_user` y `app_platform`          |
| `pnpm db:generate`                                       | Genera el cliente Prisma                                                               |
| `pnpm db:migrate`                                        | Crea o aplica migraciones en desarrollo. **Las políticas RLS se añaden a mano al SQL** |
| `pnpm db:deploy` / `pnpm db:check`                       | Aplica migraciones / verifica que esquema y migraciones coinciden                      |
| `pnpm lint`                                              | ESLint + `scripts/check-boundaries.ts`                                                 |
| `pnpm typecheck` · `pnpm test` · `pnpm test:integration` | Tipos · unitarias · integración (requiere `infra:up`)                                  |
| `pnpm format` / `pnpm format:check`                      | Prettier                                                                               |
| `pnpm build`                                             | Build de todos los paquetes                                                            |

Convenciones al añadir código:

- Toda tabla nueva del tenant lleva `organization_id` y su política RLS en la
  migración; el test de esquema (`packages/database/test/rls.int.test.ts`) falla si no.
- Una tabla global (sin RLS de tenant) se declara en `GLOBAL_TABLES` de ese test, con su ADR.
- Un paquete nuevo se declara en `ALLOWED` de `scripts/check-boundaries.ts`.
- Solo `packages/adapters/src/auth` y `packages/core/src/modules/identity` acceden a
  `auth_*` (`tx.authUser`…). El script de fronteras lo comprueba (los tests pueden
  crear datos de prueba en esas tablas).
- Permisos nuevos: en `core/src/modules/identity/permissions.ts` (`PERMISSIONS` y
  `ROLE_PERMISSIONS`). Cada caso de uso empieza con `authorize(ctx.actor, …)`.
