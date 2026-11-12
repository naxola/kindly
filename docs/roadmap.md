# Roadmap de la plantilla

**Versión actual: `v1.0.0` (2026-11-12).** Fases 0 a 4c validadas (2026-11-06/07); fases 5 y 6 y cobros entregadas, con lo pendiente de probar en staging anotado abajo. La fase 5 se valida en staging con GlitchTip, ntfy y Uptime Kuma autoalojados (ADR 0011). Newsletter: listmonk (formulario pendiente). La fase 4 se divide en 4a, 4b y 4c para que cada entrega sea revisable.

`main` creada el 2026-11-09 desde `staging` y etiquetada `v1.0.0` el 2026-11-12, por decisión del usuario. **Al etiquetar seguían sin probarse en staging**: la observabilidad (fase 5: GlitchTip, ntfy y Uptime Kuma) y los pagos con el sandbox de Paddle (el adaptador sigue la documentación, pero no está probado contra Paddle). Los productos que partan de la plantilla deben tenerlo en cuenta.

| Fase                        | Contenido                                                                                                 | Estado                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 0. Decisiones               | `CLAUDE.md`, ADR 0001–0008                                                                                | ✅ Validada (2026-11-06)                    |
| 1. Esqueleto                | Monorepo, `config`, `database`, script de fronteras, CI (lint, typecheck, tests)                          | ✅ Validada (2026-11-06)                    |
| 2. Acceso y organizaciones  | `auth_*`, `users`, `organization_members`, invitaciones, RLS                                              | ✅ Validada (2026-11-06)                    |
| 3. Worker                   | `JobQueue`, worker, correo asíncrono, eventos de negocio                                                  | ✅ Validada (2026-11-06)                    |
| 4a. UI y esqueleto de `web` | `packages/ui`, Next + es/en + temas, API `/api/v1`, Better Auth montado, alta/login/recuperación, E2E     | ✅ Validada (2026-11-06)                    |
| 4b. Organizaciones en `web` | Onboarding, organización activa, shell, miembros e invitaciones, E2E                                      | ✅ Validada (2026-11-06)                    |
| 4c. Web pública (`site`)    | `packages/content`, portada, precios, blog MDX, legales, sitemap, RSS, newsletter                         | ✅ Validada (2026-11-07)                    |
| 5. Observabilidad           | Errores, logs, health/ready, alertas                                                                      | 🟡 Validar en staging                       |
| 6. Despliegue               | Imágenes, compose local y staging, Coolify en el homelab (producción: ADR aparte)                         | 🟡                                          |
| 7. v1.0.0                   | Validación del usuario, creación de `main` y etiqueta `v1.0.0`                                            | ✅ `v1.0.0` (2026-11-12)                    |
| B1–B5. Cobros               | Planes, derechos, medición de uso, Paddle, excedentes, impagos (ADR 0012)                                 | 🟡 Entregadas; Paddle sin probar en sandbox |
| D1–D2. Sin Next.js          | Nivel 1: puertos de presentación y regla de fronteras. Nivel 2 (opcional): Hono + Vite + Astro (ADR 0013) | ⏸ Pospuesto por el usuario                  |

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

**Newsletter (decidido 2026-11-07):** listmonk autoalojado (ADR 0011); falta el formulario de alta.

### Corrección (2026-11-07): el CI fallaba desde la fase 4b

En una base de datos nueva, la web intentaba encolar antes de que existieran las tablas de pg-boss (las creaba solo el worker al arrancar): «pg-boss is not installed». En local no aparecía porque la base ya las tenía. Se añade `pnpm queue:install`, que el CI, los tests de integración y los E2E ejecutan tras las migraciones, y que **todo despliegue debe ejecutar junto a `db:deploy`** (fase 6). Reproducido en local con una base nueva antes y después del arreglo.

También: `pnpm env:check` compara `.env` con `.env.example` y se ejecuta antes de `pnpm dev`.

## Fase 5 — entregado

- **Errores** (Sentry o GlitchTip, mismo DSN): worker (fallos definitivos de jobs) y servidor de la web (errores no controlados de la API con su `correlationId`, errores de páginas, errores inesperados de Better Auth). Sin datos personales: solo ids; cookies, cabeceras, cuerpos, query strings, variables locales y breadcrumbs desactivados y limpiados otra vez antes de enviar.
- **Alertas al móvil** (ntfy o Telegram, `ALERT_PROVIDER`): crítica cuando un job agota sus reintentos, aviso cuando una cola tiene un job listo esperando más de 15 minutos. Una por motivo cada 15 minutos; si el canal falla, queda en el log.
- **Salud del worker**: `/health` y `/ready` en `WORKER_HEALTH_PORT` (3002) para el healthcheck del contenedor.
- **Panel de la cola** en terminal: `pnpm ops:queue` (estado y últimos fallos) y `pnpm ops:queue retry <cola> <id>`.
- **Runbook**: `docs/operations.md`. ADR 0008 concretado.

**Verificado en local:** format, lint (con fronteras), typecheck, 50 unitarias (alertas y su limitación, limpieza de datos de los errores, reporte de errores de la API, panel de la cola), 55 de integración (gancho de fallo definitivo, foto de la cola y cola atascada contra pg-boss real; salud del worker y alerta de cola atascada), 11 E2E, build, sincronía esquema/migraciones y auditoría sin avisos altos (2 moderados aceptados, ADR 0009). A mano: la web compilada, con la base de datos caída, envía el error de Better Auth a un Sentry simulado sin email, contraseña ni cookie; el worker compilado desde un `pnpm deploy` responde `/health` y `/ready` y para limpio con SIGTERM.

**Pendiente, anotado:** errores del navegador; centralizar logs y monitor externo (fase 6).

## Fase 6 — entregado

- **`Dockerfile`** con un destino por proceso: `web` y `site` (Next standalone), `worker` (dependencias de producción planas), `migrate` (migraciones + tablas de la cola, paso único de cada despliegue) y `postgres` (con los roles del ADR 0002). Sin variables del entorno dentro de las imágenes, salvo las URLs de la web pública (prerenderizada).
- **`infra/staging/compose.yml`** para Coolify: Postgres → `migrate` → web y worker; variables obligatorias que paran el despliegue si faltan; healthchecks en todas las imágenes.
- **CI**: construye las cinco imágenes, las arranca con el compose de staging (prueba de humo de web, worker y web pública) y, en `staging`, las publica en `ghcr.io` (`staging` y `sha-<commit>`).
- **Latido del worker** (`HEARTBEAT_URL`) para el monitor _Push_ de Uptime Kuma.
- **Guía** `docs/deploy.md`: Coolify, Cloudflare Tunnel, espejo en Forgejo, GlitchTip, ntfy y monitores de Uptime Kuma. ADR 0011 (servicios autoalojados) y ADR 0006 concretado.
- Corregido por el camino: la web ya no lee variables de entorno durante `next build` (la imagen no las tiene), y una variable vacía cuenta como no definida (Compose y Coolify pasan `VAR=`).

**Verificado en local:** format, lint (con fronteras), typecheck, 54 unitarias (latido del worker, variables vacías), 55 de integración, 11 E2E, build y sincronía esquema/migraciones. Sin Docker en el entorno de desarrollo, se comprobó a mano lo que cada imagen ejecuta: la web compilada sin ninguna variable de entorno; la web y la web pública _standalone_ copiadas fuera del repositorio responden (`/api/ready`, CSS, portada con las URLs de staging, blog, imagen social); el worker desde un `pnpm deploy` plano; y el script de `migrate` contra la base local. **Las imágenes en sí las construye y prueba el CI** (trabajo «Docker images»).

**Mejora anotada:** la imagen del worker pesa cerca de 1 GB porque las dependencias opcionales de Better Auth (`next`, `vitest`…) se resuelven desde el workspace. Funciona y respeta el lockfile; se adelgazará empaquetando el worker por completo o separando el adaptador de acceso.

**Para publicar imágenes** el repositorio necesita las variables `STAGING_SITE_URL` y `STAGING_APP_URL` (`docs/deploy.md`). Sin ellas el CI construye y prueba, pero no publica.

## Cobros B1 + B2 — entregado (ADR 0012)

- **Catálogo en código** (`defineCatalog`): métricas con su forma de agregar (`sum`, `max`, `unique`), funciones y planes versionados con cuota incluida, límite estricto o flexible y precio de excedente. Validado al arrancar. La plantilla solo trae el plan gratuito, sin precios inventados.
- **Suscripciones** (`subscriptions`, RLS): sin fila, el plan por defecto en el mes natural; con fila, su periodo, que se avanza solo si la renovación del proveedor se retrasa.
- **Medición** (`usage_events`, RLS y solo inserción): `recordUsage` idempotente, serializado por organización y métrica, que rechaza el efecto con límite estricto (`QUOTA_EXCEEDED`, 402) y avisa al 80 % y al 100 % (evento de negocio y correo a los administradores, una vez por periodo).
- **Derechos**: `requireFeature`, separado de los permisos. Permisos `billing.read` y `billing.manage`.
- **API** `GET /api/v1/billing` y `GET /api/v1/billing/plans`; pantalla _Ajustes → Plan y consumo_; componente `Progress` en `packages/ui`.

**Verificado en local:** format, lint (con fronteras), typecheck, 61 unitarias (catálogo, periodos, correo de aviso), 67 de integración (11 de cobros contra Postgres real: plan por defecto, idempotencia, límite estricto que deshace la transacción, concurrencia que no supera la cuota, avisos al 80 % y 100 % una sola vez, `max` y `unique`, límite flexible, funciones por plan, vista de consumo, MEMBER sin acceso, aislamiento por RLS y uso no editable; y la API con ADMIN y MEMBER), 12 E2E, build, sincronía esquema/migraciones y auditoría sin avisos altos.

## Cobros B4 — entregado (ADR 0012)

- **Cierre de periodo** cada hora (job programado + un cierre por organización en su tenant), con 1 hora de margen para el uso tardío. Foto inmutable por periodo con líneas por métrica, excedente redondeado a céntimos, tope e importe a cobrar; solo cambia el estado del cobro (permisos por columna).
- **Tope de gasto** por suscripción: limita lo que se cobra y rechaza el uso que lo superaría.
- `GET /api/v1/billing/periods`, `PUT /api/v1/billing/spend-cap`; en la pantalla, el tope (si el plan tiene excedentes) y los periodos cerrados.
- El cobro del importe pendiente lo hará el proveedor (B3).

**Verificado en local:** format, lint, typecheck, 66 unitarias (excedente y redondeo, tope, periodos vencidos), 72 de integración (cierre único con su foto y excedente correcto, uso del periodo siguiente excluido, tope que limita el cobro y rechaza el uso, tope solo para ADMIN con suscripción, periodo cerrado inalterable salvo el estado del cobro, escaneo horario que encola un cierre por organización, programación registrada en el worker), 12 E2E (incluida la pantalla con un periodo cerrado), build y sincronía esquema/migraciones.

## Cobros B3 + B5 — entregado, pendiente de probar con el sandbox de Paddle (ADR 0012)

- **Puerto `PaymentProvider`** y **adaptador Paddle**: pago con Paddle.js, portal del cliente, cargo del excedente y verificación de la firma de los webhooks. Construido con la documentación oficial (2026-11-08).
- **Webhook** `POST /api/webhooks/payments`: verifica y encola; el worker aplica el evento a la suscripción, ignorando los antiguos que llegan tarde.
- **Cobro del excedente** tras cada cierre, sin reintentos automáticos (Paddle no documenta idempotencia): fallo → `CHARGE_FAILED` + alerta.
- **Impagos**: 7 días de gracia (SUPUESTO) y después el plan por defecto hasta que se pague, sin borrar datos.
- Pantalla: contratar plan, gestionar suscripción (portal) y aviso de pago pendiente. Variables `PAYMENT_PROVIDER` y `PADDLE_*` en local y staging.
- **Pendiente**: probar con el sandbox (`docs/deploy.md`), cambio de plan de una suscripción existente, créditos manuales (necesitan operador de plataforma) y cuadre automático contra Paddle.

**Verificado en local:** format, lint, typecheck, 76 unitarias (10 del adaptador Paddle: firma válida y con rotación, cuerpo alterado, secreto erróneo, firma caducada, normalización de eventos y estados, cargo en céntimos, errores sin la clave, portal), 80 de integración (evento → plan por su precio, eventos antiguos ignorados, gracia y vuelta al plan por defecto y su recuperación, precio desconocido, condiciones del pago, cobro único y fallo marcado sin reintento, webhook HTTP con firma real que rechaza falsificaciones y encola una sola vez), 12 E2E, build, sincronía esquema/migraciones y auditoría sin avisos altos. **No probado contra Paddle.**
