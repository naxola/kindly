# Roadmap de la plantilla

**Fase actual: 4c, web pública (terminada, pendiente de validación del usuario).** Fases 0 a 4b validadas el 2026-11-06. La fase 4 se divide en 4a, 4b y 4c para que cada entrega sea revisable.

`main` no existe todavía: se crea cuando el usuario valide la plantilla completa, con la etiqueta `v1.0.0`.

| Fase                        | Contenido                                                                                             | Estado                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------ |
| 0. Decisiones               | `CLAUDE.md`, ADR 0001–0008                                                                            | ✅ Validada (2026-11-06) |
| 1. Esqueleto                | Monorepo, `config`, `database`, script de fronteras, CI (lint, typecheck, tests)                      | ✅ Validada (2026-11-06) |
| 2. Acceso y organizaciones  | `auth_*`, `users`, `organization_members`, invitaciones, RLS                                          | ✅ Validada (2026-11-06) |
| 3. Worker                   | `JobQueue`, worker, correo asíncrono, eventos de negocio                                              | ✅ Validada (2026-11-06) |
| 4a. UI y esqueleto de `web` | `packages/ui`, Next + es/en + temas, API `/api/v1`, Better Auth montado, alta/login/recuperación, E2E | ✅ Validada (2026-11-06) |
| 4b. Organizaciones en `web` | Onboarding, organización activa, shell, miembros e invitaciones, E2E                                  | ✅ Validada (2026-11-06) |
| 4c. Web pública (`site`)    | `packages/content`, portada, precios, blog MDX, legales, sitemap, RSS, newsletter                     | 🟣 Pendiente de validar  |
| 5. Observabilidad           | Errores, logs, health/ready, alertas                                                                  | ⚪                       |
| 6. Despliegue               | Imágenes, compose local y staging, Coolify en el homelab (producción: ADR aparte)                     | ⚪                       |
| 7. v1.0.0                   | Validación del usuario, creación de `main` y etiqueta `v1.0.0`                                        | ⚪                       |

## Fase 1 — entregado

- Monorepo pnpm + Turborepo, TypeScript estricto, ESLint con tipos, Prettier, Vitest (proyectos `unit` e `integration`).
- `@saas/config`: validación de variables de entorno con zod, sin filtrar valores en los errores.
- `@saas/database`: Prisma 7, `organizations` y `audit_logs` (append-only) con RLS forzado, `withTenant`, roles de Postgres separados.
- `@saas/core`: errores de dominio normalizados (`DomainError`).
- `scripts/check-boundaries.ts`: grafo de paquetes, imports profundos y módulos de `core`, con tests.
- `docker-compose.yml` con Postgres 18 y script de roles; `.env.example`.
- CI en GitHub Actions: formato, lint, tipos, unitarias, build, integración contra Postgres real, migraciones desde cero, sincronía esquema/migraciones y auditoría de dependencias.
- ADR 0009 (versiones).

**Verificado en local** (Node 24.21.0, Postgres 16 en lugar del contenedor porque esta sesión no tiene Docker): format, lint (con una violación de fronteras provocada y detectada), typecheck, 8 unitarias, 9 de integración, `db:deploy`, `db:check` y build.
**No verificado todavía:** el arranque con `docker compose` y el CI en GitHub (se comprueba con el push).

## Fase 2 — entregado

- **Acceso** (`@saas/adapters/auth`): Better Auth 1.7.7 sobre `auth_users`, `auth_sessions`, `auth_accounts` y `auth_verifications`. Email y contraseña (12–128 caracteres), verificación obligatoria por defecto, recuperación, sesiones en BD sin caché en cookie, límites por IP. Los correos se entregan mediante funciones inyectadas: el worker los conecta en la fase 3.
- **Negocio** (`core/identity`): `users` (creado al entrar al producto, no en el alta), `organization_members` (roles ADMIN y MEMBER), `invitations` (token solo hasheado, caducidad, revocación, el email del acceso debe coincidir), `resolveActor`, `authorize` con catálogo de permisos ampliable, cambio de rol y baja con la regla «siempre queda un ADMIN activo», auditoría de cada acción.
- **RLS**: miembros e invitaciones por organización; contexto `app.user_id` que solo permite leer las membresías propias; contexto por hash de token que solo deja leer esa invitación.
- **Fronteras**: nueva regla en `check-boundaries.ts` que impide tocar `auth_*` fuera de `adapters/auth` y `core/identity`.
- Borrar el acceso deja el usuario de negocio con `auth_user_id` nulo y sus membresías intactas (RGPD).

**Verificado en local:** format, lint (con fronteras), typecheck, 12 unitarias, 28 de integración (9 de RLS, 4 de Better Auth, 15 de identidad), migraciones, sincronía esquema/migraciones, auditoría y build.

**Pendiente, anotado:** envío real de correos de verificación, recuperación e invitación (fase 3, worker); MFA TOTP (más adelante); la API y las pantallas de alta, login, organizaciones y miembros llegan con `apps/web` (fase 4).

## Fase 3 — entregado

- **Cola** (`core/jobs` + `@saas/adapters/queue`): `defineJob`, interfaz `JobQueue`, pg-boss 12 con encolado dentro de la transacción del cambio, id del job derivado de la clave de idempotencia, reintentos con backoff y fallo definitivo registrado como `error` («job failed permanently»). Esquema `pgboss` en una migración.
- **Correo** (`@saas/adapters/email`): proveedores `log` (solo desarrollo y test: el worker lo rechaza en staging), SMTP (Mailtrap) y Resend, todos con clave de idempotencia.
- **Correos de acceso e invitación asíncronos**: `queuedAuthEmails(db, queue)` conecta Better Auth con la cola; `createInvitation` encola su correo con el enlace `/invitations/<token>`.
- **Eventos de negocio** (ADR 0010, _propuesto_): `user.created`, `organization.created`, `invitation.created` y `member.joined`, emitidos en la transacción y entregados por webhook firmado con HMAC (`@saas/adapters/events`).
- **Logger** (`@saas/adapters/logger`): pino con redacción de contraseñas, tokens, cookies y cabeceras de autorización.
- **Worker** (`apps/worker`): solo cableado; consume todas las colas o las de `WORKER_QUEUES`, valida la configuración de correo al arrancar y se detiene esperando los jobs en curso. Un test exige que todo job de `ALL_JOBS` tenga consumidor.

**Verificado en local:** format, lint (con fronteras), typecheck, 25 unitarias, 40 de integración (incluidas 6 de pg-boss real —commit, rollback, idempotencia, reintento y fallo definitivo— y un flujo completo: crear organización e invitar → el worker envía el correo y entrega 3 eventos), migraciones, sincronía esquema/migraciones, auditoría sin vulnerabilidades, build del worker y arranque/parada del worker compilado desde un despliegue `pnpm deploy`.

**Pendiente, anotado:** alertas sobre el fallo definitivo (fase 5, observabilidad); panel de la cola (fase 5); la imagen Docker del worker (fase 6).

## Fase 4a — entregado

- **`packages/ui`** (extraído de procurement): tokens claro/oscuro, componentes (botón, campos, callout, tabla, menús, diálogo de confirmación, panel lateral, paleta de comandos, toasts) y shell (TopBar, NavRail, ProductMenu, móvil). La identidad de cada producto vive solo en `brand.css`.
- **`apps/web`**: Next.js 16.4.3 (App Router, salida `standalone`), next-intl es/en por cookie o `Accept-Language`, tema claro/oscuro, TanStack Query.
- **API** (`/api`): Hono + zod-openapi con `correlationId` en cada petición, errores normalizados (`{ error: { code, message, details, correlationId } }`), defensa CSRF, `/api/health`, `/api/ready` (BD y cola), `/api/v1/me` y Better Auth en `/api/auth/*`. Contrato en `docs/api/openapi.json` y cliente tipado generado.
- **Pantallas**: alta, confirmación de email, inicio y cierre de sesión, recuperación y nueva contraseña; inicio protegido. Los correos se encolan (el worker los envía).
- `/api/v1/me` distingue acceso y negocio: con sesión pero sin haber entrado al producto, `user` es `null` (ADR 0003).

**Verificado en local:** format, lint (con fronteras), typecheck, 28 unitarias, 46 de integración (6 de la API: health/ready, errores normalizados, CSRF y el flujo alta → job de verificación en la cola → verificación → login → `/me`), 3 E2E en Chromium contra la build de producción (alta y verificación, cierre e inicio de sesión con contraseña errónea y correcta, protección de páginas, recuperación de contraseña por el enlace), build y auditoría sin vulnerabilidades.

**Seguridad:** next 16.3.8 (procurement) y 16.3.5 (kindly) están afectados por vulnerabilidades críticas; la plantilla usa 16.4.3 (ADR 0009).

## Fase 4b — entregado

- **API** (`/api/v1`): `POST /organizations` (primera entrada al producto: crea el usuario de negocio, la organización y la deja activa), `PUT /me/organization`, `GET /organization` (permisos efectivos), `GET /members`, `PUT /members/{id}/role`, `PUT /members/{id}/status`, `GET|POST /invitations`, `POST /invitations/{id}/revoke`, `POST /invitations/preview` (pública, con límite por IP) y `POST /invitations/accept`.
- **Organización activa** en la cookie `active_org`, validada en cada petición y borrada si deja de valer (ADR 0003).
- **Interfaz**: shell completo (barra superior con selector de organización y menú de usuario, rail, menú de módulo, ⌘K, móvil), onboarding (elegir o crear organización con identificador generado del nombre), pantalla de invitación (token en el fragmento, alta o login sin perder la invitación, aviso si la cuenta es de otro email), ajustes de miembros (rol, desactivar/reactivar con confirmación, invitar en panel lateral, invitaciones pendientes y revocación). Los permisos ocultan acciones; la API las rechaza igualmente.
- `core`: `listMembers` con el email de acceso (solo `identity` lee `auth_*`), `enableMember`, `resolveActor` devuelve el idioma por defecto, el idioma de la interfaz considera la preferencia de la persona y la de la organización.

**Verificado en local:** format, lint (con fronteras), typecheck, 29 unitarias, 49 de integración (un recorrido de dos personas por la API: sin organización → crear → invitar → vista pública → otra cuenta rechazada → aceptar → miembros → último ADMIN → MEMBER sin permiso → desactivar y limpieza de la cookie → cambiar de organización → revocar), 5 E2E en Chromium contra la build de producción (incluidos: invitar desde ajustes, aceptar registrándose desde el enlace, ascender y desactivar a un miembro, cambiar de organización), build y auditoría sin vulnerabilidades.

**Corregido por el camino:** el `setup` de integración vacía también la cola de pg-boss; los E2E dejaban jobs que hacían intermitente el test del worker.

### Fase 4b — ajuste tras la revisión del usuario (2026-11-06)

- **Alta desde la invitación**: la pantalla del enlace se adapta a cada situación. Email sin cuenta → nombre y contraseña en la misma página, cuenta creada ya verificada (el enlace prueba el buzón), sesión iniciada y dentro de la organización. Email con cuenta → solo «Iniciar sesión y unirme», con el email ya relleno. Enlace ya usado → lo dice y ofrece iniciar sesión. Revocado o caducado → lo dice, sin botones (ADR 0003).
- `POST /api/v1/invitations/register` (pública, límite de 5 por minuto e IP) y `emailRegistered` en la vista pública.
- Corregido: al volver de iniciar sesión, la invitación usaba de la caché la respuesta «sin sesión»; el login vacía la caché y la pantalla consulta siempre la sesión.
- Tests: 3 de integración nuevos (cuenta nueva sin correo de verificación, enlace ya usado, email con cuenta previa, contraseña corta) y E2E del alta desde el enlace, del enlace reutilizado y del invitado con cuenta previa.

## Fase 4c — entregado

- **`packages/content`**: `ContentSource` (posts y páginas por idioma) sobre archivos MDX, cabecera validada con zod (error con el archivo y el motivo), borradores solo en desarrollo, tiempo de lectura y `renderMdx` (GFM, componentes propios, variables `{{nombre}}` que paran la build si faltan).
- **`apps/site`**: Next.js 16.4.3 con las 24 páginas prerenderizadas en estático (`/es`, `/en`): portada (hero, ventajas, preguntas frecuentes, llamada a la acción), precios desde `site.config.ts`, blog (lista, post, RSS por idioma), legales (privacidad, términos, cookies) como plantillas con aviso mientras no se revisen, imágenes Open Graph generadas en la build, datos estructurados (SoftwareApplication, BlogPosting), sitemap con hreflang, robots y Plausible opcional. Comparte el sistema de diseño y la marca con `web`.
- Un post de ejemplo por idioma que explica cómo escribir posts (se borra al publicar el primero real).

**Verificado en local:** format, lint (con fronteras), typecheck, 36 unitarias (6 de contenido), 52 de integración, build de todos los paquetes, auditoría sin vulnerabilidades y 11 E2E (5 nuevos de la web pública: redirección y enlaces a la app, cambio de idioma, post con datos estructurados e imagen social, RSS, sitemap, legales con datos de la empresa y aviso, precios sin planes).

**Pendiente de decisión:** la newsletter (doble opt-in propio en la BD o herramienta externa como Brevo o Loops).
