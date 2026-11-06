# Roadmap de la plantilla

**Fase actual: 2, acceso y organizaciones (terminada, pendiente de validación del usuario).** Fases 0 y 1 validadas el 2026-11-06.

`main` no existe todavía: se crea cuando el usuario valide la plantilla completa, con la etiqueta `v1.0.0`.

| Fase                       | Contenido                                                                         | Estado                   |
| -------------------------- | --------------------------------------------------------------------------------- | ------------------------ |
| 0. Decisiones              | `CLAUDE.md`, ADR 0001–0008                                                        | ✅ Validada (2026-11-06) |
| 1. Esqueleto               | Monorepo, `config`, `database`, script de fronteras, CI (lint, typecheck, tests)  | ⚪                       |
| 2. Acceso y organizaciones | `auth_*`, `users`, `organization_members`, invitaciones, RLS                      | ⚪                       |
| 3. Worker                  | `JobQueue`, worker, correo asíncrono, eventos de negocio                          | ⚪                       |
| 4. UI y web pública        | `packages/ui`, shell de `web`, `site` con portada, blog MDX y legales             | ⚪                       |
| 5. Observabilidad          | Errores, logs, health/ready, alertas                                              | ⚪                       |
| 6. Despliegue              | Imágenes, compose local y staging, Coolify en el homelab (producción: ADR aparte) | ⚪                       |
| 7. v1.0.0                  | Validación del usuario, creación de `main` y etiqueta `v1.0.0`                    | ⚪                       |

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
