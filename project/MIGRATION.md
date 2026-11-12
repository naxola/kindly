# MIGRATION.md — Kindly sobre `saas-template`

> Plan vivo de la migración de Kindly a la plantilla `naxola/saas-template`.
> Es la fuente de verdad para retomar el trabajo entre sesiones: **al empezar
> una sesión de migración se lee este archivo entero** y, al terminarla, se
> actualizan el estado de la fase, el hash del commit y las notas (sección 8).

Última actualización: 2026-11-13 (M4b hecha: UI de contactos).

## 1. Objetivo

Tomar `saas-template` (`v1.0.0`) como base de Kindly y montar sobre ella toda la
lógica de negocio que hoy existe en Kindly (PKG-001…PKG-014, UI-0…UI-10b,
Fases 6, 7a–7f), sin perder funcionalidad, tests ni decisiones de producto. El
resultado vive en este repositorio (`naxola/kindly`).

Lo que **aporta la plantilla** y Kindly deja de mantener por su cuenta: monorepo
(web, site, worker), acceso separado de negocio (ADR 0003), RLS real (ADR 0002),
cola pg-boss y worker (ADR 0004), correo asíncrono, eventos de negocio,
observabilidad (errores, alertas, health), API Hono + OpenAPI + cliente tipado,
`packages/ui`, i18n es/en, web pública con blog y legales, imágenes Docker y
compose de staging, cobros (desactivados de momento).

Lo que **aporta Kindly**: su dominio (contactos, afiliación, asignación a
delegados, mensajería y coexistence de WhatsApp, conversaciones e Inbox,
casos, tareas, actividad, conocimiento con RAG, trámites), sus pantallas y
sus decisiones (`docs/DECISIONS.md`).

La plantilla ya lo preveía: ADR 0007 de la plantilla — «llevar kindly a la
plantilla implica cambiar de ORM y de forma de llamar al servidor: se hará por
partes, no como reescritura completa».

## 2. Diferencias que obligan a reescribir (no solo mover)

| Área                     | Kindly hoy                                          | Plantilla (lo que se adopta)                                                                  |
| ------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Repositorio              | Una app Next (`src/`), npm                          | Monorepo pnpm + Turborepo: `apps/{web,site,worker}`, `packages/*`                             |
| ORM                      | Drizzle, migraciones en `drizzle/`                  | Prisma 7, `packages/database/prisma`, RLS y grants escritos a mano en el SQL                  |
| Aislamiento              | Filtro explícito por `organization_id`, **sin RLS** | Filtro explícito **+ RLS forzado** (`withTenant`), roles `app_migrator/app_user/app_platform` |
| Identidad                | Tabla `users` compartida con Better Auth            | `auth_*` (acceso) separado de `users` + `organization_members` (negocio)                      |
| Organizaciones           | Una organización por usuario (restricción única)    | Multiorganización con organización activa (cookie `active_org`)                               |
| Roles                    | `ADMIN` / `DELEGATE`                                | `ADMIN` / `MEMBER` + catálogo de permisos (`authorize`)                                       |
| Llamadas al servidor     | Server Actions + `src/app/api/*` sueltas            | Hono + zod-openapi en `/api/v1`, TanStack Query, sin Server Actions de negocio                |
| Trabajo en segundo plano | `after()` de Next, todo lo demás síncrono           | Jobs pg-boss idempotentes en `apps/worker`                                                    |
| UI                       | `src/components/ui` + tokens propios (`docs/ui/`)   | `packages/ui` + `brand.css`                                                                   |
| Textos                   | Español en el código                                | `apps/web/messages/{es,en}.json` (un test exige las mismas claves)                            |
| Web pública              | Rutas `(public)` dentro de la app                   | `apps/site` (contenido MDX vía `ContentSource`)                                               |
| Despliegue               | Vercel (staging)                                    | Imágenes Docker + compose de staging en el homelab (ADR 0006)                                 |
| Postgres                 | `pgvector/pgvector:pg16`                            | `postgres:18.6-trixie` → **hay que añadirle pgvector** (fase M2)                              |

## 3. Decisiones de la migración

Estado: **Aceptadas por el usuario el 2026-11-12** (registradas en
`docs/DECISIONS.md`). D4 se rehízo a petición suya y D14–D15 se añadieron
(acceso ≠ persona ≠ cargo). Las preguntas Q1–Q3 se resolvieron el mismo
día (sección 3.1).

| #   | Decisión                            | Recomendación                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Estrategia Git                      | Rama de larga duración `migration/saas-template` desde `master`. `master` sigue sirviendo la app actual hasta el corte (M13). El primer commit mueve la app actual a `legacy/`; el segundo **fusiona la etiqueta `v1.0.0` de la plantilla con `--allow-unrelated-histories`**, de modo que las futuras versiones de la plantilla se traen con un `git merge` normal (remoto `template`).                                                                                                                                                                                                                                                                                                                      |
| D2  | Código antiguo durante la migración | En `legacy/` dentro del árbol, fuera del workspace, del lint y del CI. Sirve de referencia para portar y **cada fase borra lo que ya portó**: lo que queda en `legacy/` es exactamente lo que falta. Se borra entero en M13.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D3  | Datos existentes                    | **Sin migración de datos**: staging empieza con base de datos nueva (Kindly no tiene clientes reales). Si hubiera datos que conservar, se añade un script ETL de un solo uso en M13.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D4  | Tres capas de identidad             | **Acceso** = `auth_users` (solo quién puede entrar: email y contraseña). **Rol de acceso** = `organization_members.role` de la plantilla (`ADMIN`/`MEMBER`), que solo decide **permisos**; no se toca el enum. **Cargo** = rol funcional dentro de la organización (delegado, presidente, secretaria…), configurable por organización (D15). El antiguo `DELEGATE` de Kindly se separa en «`MEMBER` + cargo Delegado».                                                                                                                                                                                                                                                                                        |
| D5  | Una organización por usuario        | Se adopta la multiorganización de la plantilla (la restricción era del MVP). La visibilidad por delegado se calcula por membresía, así que no cambia.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D6  | Sistema de diseño                   | Se adopta `packages/ui` + `brand.css`. Los componentes de Kindly que no existan en `packages/ui` (DataList, FilterBar, SegmentedControl, RelativeTime, Sheet de conversación, Tabs, Popover…) se portan a `apps/web/src/components/` (genéricos) o a `apps/web/src/features/<módulo>/` (de negocio). `docs/ui/` se actualiza para apuntar a `packages/ui`. Los genéricos que valgan para todos los productos se proponen después a la plantilla.                                                                                                                                                                                                                                                              |
| D7  | Actividad frente a auditoría        | `activities` de Kindly (línea de tiempo visible en contacto/caso) se mantiene como módulo de negocio `activity`; además cada caso de uso relevante escribe en `audit_logs` de la plantilla. Son cosas distintas: una es producto, otra es seguridad.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D8  | Conocimiento GLOBAL                 | `documents`/`knowledge_chunks` con `organization_id` nulo para lo GLOBAL. Política RLS de lectura `organization_id IS NULL OR organization_id = current`; escritura de lo GLOBAL solo con el rol `app_platform` desde el script de operador. Se declara en el test de RLS con su justificación.                                                                                                                                                                                                                                                                                                                                                                                                               |
| D9  | `after()` → jobs                    | El procesado de webhooks y la ingesta de conocimiento pasan a jobs de pg-boss. Resuelve el pendiente de Fase 7f («la subida es síncrona»).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D10 | Despliegue                          | Se adopta el de la plantilla (Docker + homelab con Coolify). Vercel no puede alojar el worker. Producción sigue sin decidir (igual que en la plantilla).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D11 | Cobros                              | Se mantiene la fontanería de la plantilla con `CATALOG` mínimo y sin proveedor activo. «Billing avanzado» sigue fuera del MVP (`CLAUDE.md` §8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D12 | Congelación de `master`             | Mientras dure la migración no se añaden funcionalidades a `master`. Si fuera imprescindible, se anota en la sección 8 para portarlo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D14 | Ficha del miembro                   | Tabla de producto `member_profiles` (1:1 con `organization_members`, con `organization_id` y RLS): nombre, apellidos, teléfono (`phone_e164`), email de contacto opcional, `position_id` (cargo), notas. Es del tenant y no global porque la gestiona el ADMIN de cada organización (RGPD: cada organización es responsable de sus datos). `users.display_name` de la plantilla se sigue usando para mostrar; se rellena desde nombre + apellidos. El teléfono de la ficha es dato de contacto, **no** la identidad de WhatsApp (esa sigue siendo `messaging_accounts`). No se añaden columnas a las tablas de la plantilla.                                                                                  |
| D15 | Cargos configurables                | Tabla `member_positions` (`organization_id`, nombre único por organización, descripción, orden, `archived_at`; RLS). Se gestiona en **Ajustes → Cargos** (solo ADMIN, permiso `positions.manage`). Al crear la organización se siembra «Delegado» por defecto. Al invitar a un miembro se eligen rol de acceso + cargo + nombre/teléfono (se guardan en `invitation_profiles`, del tenant, y se copian a `member_profiles` al aceptar, en la misma transacción). Un cargo en uso no se borra: se archiva. Para engancharse a crear organización / aceptar invitación se añade a `core/identity` un punto de extensión genérico (`onOrganizationCreated`, `onMemberJoined`), candidato a subir a la plantilla. |
| D13 | Textos en inglés                    | Se rellenan `en.json` con traducciones reales (el test de claves lo exige). Español sigue siendo el idioma por defecto de la organización.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## 4. Equivalencias para portar código

| Kindly (legacy)                                               | Destino en la plantilla                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/modules/<m>/schema.ts` (Drizzle)                         | Modelos en `packages/database/prisma/schema.prisma` + migración con RLS y grants a mano                       |
| `src/modules/<m>/service.ts`, `domain.ts`                     | `packages/core/src/modules/<m>/` (casos de uso que empiezan por `authorize(ctx.actor, …)`, zod en la entrada) |
| `src/modules/<m>/actions.ts` (Server Actions)                 | Ruta en `apps/web/src/server/api/routes/<m>.ts` (`actorCtx(c)` → caso de uso) + hook de TanStack Query        |
| `getCurrentOrganizationMember()`                              | `actorCtx(c)` en la ruta; `ctx.actor` en `core`                                                               |
| `organization_members.role === "DELEGATE"`                    | `actor.role === 'MEMBER'` / permisos de `ROLE_PERMISSIONS`                                                    |
| `src/modules/audit` (`activities`)                            | `core/modules/activity` (línea de tiempo) + `audit` de la plantilla                                           |
| `after(...)`                                                  | `defineJob` + `ctx.queue.enqueue(tx, …)` + handler en `apps/worker/src/handlers.ts`                           |
| `src/modules/email/*` (Resend)                                | `@saas/adapters/email` (ya existe)                                                                            |
| `src/modules/auth/*`                                          | `@saas/adapters/auth` + `core/identity` (ya existen; no se porta)                                             |
| `src/modules/organizations/*` (invitaciones, miembros, roles) | `core/identity` (ya existe; solo se ajustan textos y permisos)                                                |
| `src/modules/messaging/adapter.ts`, `registry.ts`             | Puerto `MessagingAdapter` en `core/modules/messaging`; implementaciones en `packages/adapters/src/messaging/` |
| `src/modules/knowledge/*embedding-provider.ts`                | Puerto `EmbeddingProvider` en `core/modules/knowledge`; OpenAI en `packages/adapters/src/embeddings/`         |
| `src/components/ui/*`                                         | `@saas/ui` o `apps/web/src/components/` (D6)                                                                  |
| `src/app/(app)/<ruta>`                                        | `apps/web/src/app/(app)/<ruta>` (página fina) + `apps/web/src/features/<m>/`                                  |
| `src/app/(public)/*`, `src/config/company.ts`                 | `apps/site` (`content/legal/<idioma>/`, `site.config.ts`)                                                     |
| `scripts/ingest-knowledge.ts`, `reset-password.ts`            | `scripts/` de la raíz (comandos `pnpm …`)                                                                     |
| `tests/unit`, `tests/integration`, `tests/e2e`                | Tests junto a cada paquete (`*.test.ts`, `*.int.test.ts`) y `e2e/` de la raíz                                 |
| Texto en español en el JSX                                    | `apps/web/messages/{es,en}.json`                                                                              |

## 5. Fases (cada una = uno o pocos commits revisables, siempre en verde)

### 3.1 Preguntas resueltas (usuario, 2026-11-12)

- **Q1 El cargo no da comportamiento: es solo un nombre.** Las reglas de
  Kindly que decían «solo un DELEGATE» (delegado de referencia de un
  afiliado, responsable de un caso, visibilidad restringida a sus afiliados)
  dependen **solo de `role = MEMBER`**. Nada en `core` lee el cargo para
  decidir permisos ni reglas de negocio; se muestra y se puede filtrar.
- **Q2 Un cargo por miembro** (columna `member_profiles.position_id`, opcional).
- **Q3 Solo el nombre es obligatorio** en la ficha; apellidos, teléfono y
  cargo son opcionales en la invitación y editables después.

Leyenda: ⬜ pendiente · 🟡 en curso · ✅ hecha · ⏸ bloqueada.

Cada fase de dominio sigue el mismo orden y **no se da por cerrada** sin:
esquema Prisma + migración con RLS (el test `rls.int.test.ts` lo exige) →
casos de uso en `core` con `authorize` y auditoría → rutas `/api/v1` +
`pnpm api:generate` → interfaz en `apps/web` con textos es/en y navegación →
tests portados de `legacy/tests` (unitarios, integración, E2E) → borrar de
`legacy/` lo portado → `pnpm format:check && pnpm lint && pnpm typecheck &&
pnpm test && pnpm test:integration && pnpm test:e2e && pnpm build` en verde.
Cuando una fase es grande se parte en «a» (datos + `core` + API) y «b» (UI + E2E).

| Fase | Contenido                                                                                                                                                                                                                                                                                                                                                                                                                                               | Legacy que porta / borra                                                                         | Estado         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------- |
| M0   | Este plan, decisiones propuestas, enlaces desde `CURRENT_TASK`/`TASKS`/`PROGRESS`/`DECISIONS`                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                | ✅             |
| M1a  | Crear `migration/saas-template`. Mover la app a `legacy/` (`git mv` mecánico: `src`, `tests`, `scripts`, `drizzle`, `docker`, `tokens`, configs de raíz). `docs/` y `project/` se quedan en la raíz                                                                                                                                                                                                                                                     | Todo pasa a `legacy/`                                                                            | ✅             |
| M1b  | Remoto `template`; `git merge --allow-unrelated-histories v1.0.0`. Resolver: `CLAUDE.md` fusionado (reglas de la plantilla + reglas de producto de Kindly, sin contradicciones: Prisma, API, jobs), `README.md` («parte de saas-template v1.0.0»), `.gitignore`. Excluir `legacy/` de pnpm, ESLint, Prettier, tsc y Vitest                                                                                                                              | —                                                                                                | ✅             |
| M1c  | Marca: `brand.css` (acento y radio de Kindly desde `legacy/tokens`), `app.name` «Kindly», nombre del producto en `site.config.ts`. CI de la plantilla en verde en este repo                                                                                                                                                                                                                                                                             | `legacy/tokens` (parte)                                                                          | ✅             |
| M2   | Infra: pgvector en la imagen `postgres` del `Dockerfile` y en `docker-compose.yml`/staging/CI; migración `CREATE EXTENSION vector`. Variables de Kindly (`OPENAI_API_KEY`, Meta/WhatsApp, `FACEBOOK_DOMAIN_VERIFICATION`…) en los tres `.env.example` y `compose.yml`                                                                                                                                                                                   | `legacy/docker`, `legacy/docker-compose.yml`                                                     | ✅             |
| M3a  | Permisos de Kindly (`contacts.*`, `conversations.*`, `cases.*`, `tasks.*`, `knowledge.*`, `procedures.*`, `channels.*`, `positions.manage`, `member_profiles.manage`) en `ROLE_PERMISSIONS`; ajustes de organización y miembros de la plantilla con los textos de Kindly; navegación vacía de los módulos                                                                                                                                               | `legacy/src/modules/organizations`, `auth`, `email`; páginas de `login`, `forgot/reset-password` | ✅ (absorbida) |
| M3b  | **Ficha del miembro y cargos** (D14, D15, §3.1): `member_profiles`, `member_positions`, `invitation_profiles` con RLS; puntos de extensión en `core/identity`; siembra de «Delegado»; **Ajustes → Cargos** (crear, renombrar, ordenar, archivar); invitación con cargo, nombre y teléfono; ficha del miembro editable (ADMIN; cada persona edita su teléfono); cargo visible en la lista de miembros. Tests de RLS, permisos y aceptación de invitación | páginas de `members`, `organization/members`, `invite`; E2E `members`, `organization`            | ✅             |
| M4a  | **Contactos y afiliación** (datos + core + API): `contacts`, `contact_assignments` (delegado de referencia y acceso temporal), predicado único de visibilidad, `memberships`, módulo `activity` (D7)                                                                                                                                                                                                                                                    | `modules/contacts`, `memberships`, `audit` + sus tests                                           | ✅             |
| M4b  | Contactos (UI + E2E): `/contacts`, `/contacts/[id]`, reasignar, afiliación                                                                                                                                                                                                                                                                                                                                                                              | `app/(app)/contacts`, E2E `crm`, `membership`, `contact-assignments` (parte)                     | ✅             |
| M5a  | **Casos y tareas** (datos + core + API): máquina de estados de `Case`, responsable solo delegado, tareas                                                                                                                                                                                                                                                                                                                                                | `modules/cases`, `tasks` + tests                                                                 | ⬜             |
| M5b  | Casos y tareas (UI + E2E)                                                                                                                                                                                                                                                                                                                                                                                                                               | `app/(app)/cases`, `tasks`, `dashboard`; E2E `cases`                                             | ⬜             |
| M6a  | **Mensajería, núcleo**: `messaging_accounts`, `webhook_events`, `conversations`, `messages`, `conversation_cases`; puerto `MessagingAdapter` + registro; webhook público con firma → job idempotente `messaging.process-webhook` (D9)                                                                                                                                                                                                                   | `modules/messaging` (núcleo), `conversations`, `app/api/webhooks` + tests                        | ⬜             |
| M6b  | Mensajería, WhatsApp: envío saliente con guardarraíl de identidad, coexistence (ecos, historial, ventana de servicio, desconexión externa), adaptador de prueba de Meta (PKG-011), comprobaciones de alta (PKG-008), adaptadores falsos para tests                                                                                                                                                                                                      | `messaging/whatsapp-*`, `testing/*` + tests                                                      | ⬜             |
| M7a  | **Inbox** (API + UI): lista única con vistas, contadores, búsqueda y filtros en la URL, `LEFT JOIN LATERAL` (SQL crudo de Prisma), caché TanStack Query, teclado                                                                                                                                                                                                                                                                                        | `app/(app)/inbox`, `app/api/inbox`; E2E `inbox`                                                  | ⬜             |
| M7b  | **Espacio de conversación**: panel de dos columnas (chat + ficha del afiliado), envío optimista, checks, sondeo, «escribiendo…», solo lectura y aviso de otro delegado                                                                                                                                                                                                                                                                                  | `inbox/[id]`, `app/api/conversations`; E2E `conversation-workspace`, `contact-assignments`       | ⬜             |
| M7c  | **Canales**: vista por delegado, máquina de estados, alta de WhatsApp (tres vías) en Organización → Canales                                                                                                                                                                                                                                                                                                                                             | `app/(app)/channels`, `organization/channels`; E2E `channels`, `whatsapp-onboarding`             | ⬜             |
| M8a  | **Conocimiento, datos e ingesta**: `documents`, `document_versions`, `knowledge_chunks` (`vector` como `Unsupported` + SQL crudo), RLS con GLOBAL (D8), `EmbeddingProvider` (OpenAI + falso), extracción PDF/web, guardia SSRF, troceado, ingesta como job (subida asíncrona con estado) y `pnpm knowledge:ingest`                                                                                                                                      | `modules/knowledge` (salvo retrieval), `scripts/ingest-knowledge.ts` + tests                     | ⬜             |
| M8b  | Conocimiento, recuperación + UI: híbrida FTS + vector con RRF y filtros duros, `/knowledge`, detalle de versión, búsqueda con citas, subida y nueva versión (ADMIN)                                                                                                                                                                                                                                                                                     | `knowledge/retrieval*`, `app/(app)/knowledge`; E2E `knowledge`                                   | ⬜             |
| M9   | **Trámites**: `procedures` versionados con pasos y documentos requeridos, ADMIN                                                                                                                                                                                                                                                                                                                                                                         | `modules/procedures`, `knowledge/procedures`; E2E `procedures`                                   | ⬜             |
| M10  | **Web pública**: legales de Kindly en `apps/site` (privacidad, términos, aviso legal, eliminación de datos —URL que exige Meta—), datos de empresa en `site.config.ts` con la banda «REVISAR», `FACEBOOK_DOMAIN_VERIFICATION`, portada de Kindly                                                                                                                                                                                                        | `app/(public)`, `config/company.ts`; E2E `public-site`                                           | ⬜             |
| M11  | Accesibilidad y pulido: axe en E2E (claro/oscuro), atajos (F6), responsive 320 px, tema oscuro con `brand.css`; `docs/ui/` actualizado a `packages/ui` (D6)                                                                                                                                                                                                                                                                                             | `components/*`, `ui-kit`, E2E `accessibility`, `shell`                                           | ⬜             |
| M12  | Documentación: `ARCHITECTURE.md`, `DATABASE.md`, `INTEGRATIONS.md`, `tests/README` al nuevo stack; `CLAUDE.md` definitivo; `PROGRESS.md`                                                                                                                                                                                                                                                                                                                | —                                                                                                | ⬜             |
| M13  | **Corte**: `legacy/` vacío y borrado; despliegue en staging (homelab) con `db:deploy` + `queue:install`; datos (D3); el usuario fusiona `migration/saas-template` en `master`; etiqueta `kindly-v0.2.0`                                                                                                                                                                                                                                                 | Resto de `legacy/`                                                                               | ⬜             |

Lo que sigue **después** de la migración (no es parte de este plan): UI-10c,
Fase 8 (AI Copilot, ya con `LLMProvider` en `adapters` y jobs), PKG-009.

## 6. Protocolo de cada sesión de migración

Al empezar:

1. Leer `CLAUDE.md`, este archivo entero y la última nota de la sección 8.
2. `git fetch` y situarse en `migration/saas-template` (o la rama de trabajo
   que indique la sesión, creada desde ella). `git status` y `git log --oneline -10`.
3. Tomar la **primera fase no ✅** de la tabla. Ver qué queda de esa fase en
   `legacy/` (`git ls-files legacy/<ruta>`).
4. Desde M1: `pnpm install`, `pnpm infra:up` (o Postgres local en 5441) y
   comprobar que todo está en verde antes de tocar nada.

Al terminar (haya acabado la fase o no):

1. Comprobaciones de la sección 5. **No commitear en rojo**; si queda a medias,
   anotarlo en la sección 8 y en `CURRENT_TASK.md`.
2. Marcar la fase (🟡/✅) en la tabla, con el hash del commit en la sección 8.
3. Añadir la nota de sesión (sección 8): qué se hizo, qué falta, próximo paso
   concreto, verificación ejecutada de verdad.
4. Actualizar `CURRENT_TASK.md` (paquete activo = fase de migración) y la
   casilla en `TASKS.md`; `PROGRESS.md` (con su línea «Última
   actualización») si una fase cambia de estado.
5. Decisiones nuevas o desviaciones del plan → `docs/DECISIONS.md`.
6. Commit con Conventional Commits y alcance de fase: `feat(M4a): …`,
   `chore(M1a): …`, `docs(M0): …`. Push.

## 7. Riesgos conocidos

- **Tamaño**: ~19 000 líneas de TS y ~490 tests. Por eso fases pequeñas y
  `legacy/` como medida de lo que falta.
- **SQL crudo**: el Inbox (`LATERAL`), la visibilidad por delegado y la
  recuperación híbrida dependen de SQL que Prisma no expresa; van con
  `$queryRaw` tipado dentro de `withTenant` para que la RLS siga aplicando.
- **pgvector + Prisma**: la columna `vector` es `Unsupported`; el test de
  sincronía esquema/migraciones (`db:check`) debe seguir pasando.
- **Next.js**: la plantilla usa 16.4.3 (Kindly 16.3.5 tiene vulnerabilidades
  críticas); revisar APIs de rutas paralelas/interceptadas al portar.
- **Actualizaciones de la plantilla** durante la migración: se traen con
  `git merge template/main` (posible gracias a D1) entre fases, nunca a mitad.
- **Coexistence / Meta**: no se toca el comportamiento; los tests con
  adaptadores falsos son la red de seguridad del porte.

## 8. Registro de sesiones

### 2026-11-12 — M0

- Hecho: inspección de ambos repositorios (Kindly en `master` @ `d03543e`,
  plantilla `v1.0.0` @ `538f535`), plan de fases, decisiones D1–D13
  propuestas en `docs/DECISIONS.md`, enlaces en `CURRENT_TASK.md`,
  `TASKS.md` y `PROGRESS.md`.
- Commit: el de este registro (`docs(M0): …`).
- Verificación: solo documentación; no se ejecutaron lint/typecheck/tests.
- **Revisión del usuario (misma fecha):** acepta D1–D13 salvo D4. Pide
  separar acceso (`auth_users`) de los datos de la persona (nombre, teléfono…)
  y de su rol funcional en la organización (delegado, presidente…), con una
  tabla de cargos configurable en ajustes y elegible al crear un miembro. D4
  rehecha, D14–D15 y fase M3b añadidas, preguntas Q1–Q3 abiertas.
- **Próximo paso concreto:** M1a (crear `migration/saas-template` desde
  `master` y mover la app a `legacy/`). Q1–Q3 resueltas (sección 3.1).
- **Respuestas del usuario a Q1–Q3:** el cargo es solo un nombre (las reglas
  dependen de `MEMBER`), un cargo por miembro, solo el nombre obligatorio.

### 2026-11-12 — M1a

- Hecho: rama `migration/saas-template` creada desde la rama de trabajo
  `claude/intelligent-einstein-64alkm` (= `master` @ `d03543e` + los tres
  commits de documentación de M0, para que el plan viva en la rama de
  integración). Con `git mv` (sin tocar contenido) la app pasa a `legacy/`:
  `src`, `tests`, `scripts`, `drizzle`, `docker`, `tokens`, `.github`,
  `docker-compose.yml`, `.env.example`, `package*.json` y configs de
  herramientas. En la raíz quedan `docs/`, `project/`, `CLAUDE.md`,
  `README.md` y `.gitignore` (estos tres últimos se fusionan con los de la
  plantilla en M1b). `.gitignore` con exclusiones de `legacy/` ancladas;
  `legacy/README.md` explica su papel.
- Verificación real (en `legacy/`): `npm install --no-package-lock`,
  `tsc --noEmit` limpio y `vitest run tests/unit`: 381/381. **No se
  ejecutaron** integración ni E2E (necesitan Postgres/Playwright; el
  movimiento no cambia contenido).
- Observación: `npm ci` falla en `legacy/` con npm de este entorno
  (`@emnapi/*` ausentes del lockfile). Ya ocurría en `master`, no es del
  movimiento; no se toca (legacy no se modifica). Se usa `npm install
--no-package-lock`.
- **Próximo paso concreto:** M1b — añadir el remoto `template`
  (`naxola/saas-template`) y `git merge --allow-unrelated-histories v1.0.0`;
  resolver conflictos en `CLAUDE.md`, `README.md` y `.gitignore`; excluir
  `legacy/` de pnpm, ESLint, Prettier, `tsc` y Vitest. Antes comprobar que la
  etiqueta `v1.0.0` es accesible (en el clon local solo hay `staging`).

### 2026-11-12 — M1b

- Hecho: remoto `template` (`https://github.com/naxola/saas-template`, **push
  deshabilitado**: `git remote set-url --push template DISABLED`) y
  `git merge --allow-unrelated-histories --no-ff v1.0.0` (`538f535`). La
  plantilla no se modifica en ningún momento: solo se lee. Conflictos (solo
  los esperados, en archivos de Kindly):
  - `.gitignore`: el de la plantilla + exclusiones de `legacy/`.
  - `README.md`: cabecera de Kindly (base `v1.0.0`, migración en curso) +
    puesta en marcha de la plantilla. El README antiguo queda en
    `legacy/README.kindly-old.md`.
  - `CLAUDE.md`: reescrito fusionando reglas técnicas de la plantilla y reglas
    de producto de Kindly (3 principios, integraciones, seguridad, DoD, flujo
    de sesión), con acceso/persona/cargo (D4/D14/D15) y reglas de migración.
    Sustituye a las secciones de stack, «qué no construir» y flujo Git del
    `CLAUDE.md` anterior.
- `legacy/` fuera del tooling: ya lo estaba para pnpm (`apps/*`, `packages/*`),
  Vitest y `tsc` (rutas explícitas); añadido a `eslint.config.js`,
  `.prettierignore` y `.dockerignore`. La documentación histórica de Kindly
  (`docs/{ARCHITECTURE,DATABASE,DECISIONS,INTEGRATIONS}.md`, `docs/ui/`,
  `project/{CURRENT_TASK,TASKS,PROGRESS}.md`) está en `.prettierignore` para no
  reformatear miles de líneas; se revisa en M12.
- Para trabajar: **Node 24** (`/opt/node24/bin` en este entorno; el `node` por
  defecto es 22 y `engines` exige ≥24.21.0), pnpm 10.34.6 vía corepack,
  `cp .env.example .env`, `pnpm install --frozen-lockfile`, `pnpm db:generate`.
- Verificación real (Node 24.22.1): `pnpm format:check`, `pnpm lint`
  (ESLint + fronteras), `pnpm typecheck` (11/11) y `pnpm test` (76/76
  unitarias) en verde. **No ejecutados:** integración, E2E y build (necesitan
  Postgres/Docker; M1c los pone en verde con el CI). La primera pasada de
  `pnpm lint` dio 202 errores de tipos y la repetición, sin cambios, salió
  limpia; probablemente la caché de tipos justo tras generar Prisma.
- **Próximo paso concreto:** M1c — nombre `kindly` en `package.json` y paquetes
  si procede, `brand.css` (acento y radio desde `legacy/tokens`), `app.name`
  «Kindly», `site.config.ts`; actualizar en el README los pasos de rama
  (`git checkout staging` ya no aplica); levantar Postgres (puerto 5441) y
  ejecutar integración, E2E y build para tener el CI de la plantilla en verde.

### 2026-11-12 — M1c

- Hecho: marca de Kindly. `packages/ui/src/brand.css` con el «verde sello» de
  la app anterior (claro `#15654a`, oscuro `#34a37a`, radio 6 px; tomado de
  `legacy/src/styles`); `app.name` «Kindly» en `apps/{web,site}/messages/{es,en}.json`;
  `package.json` raíz `kindly`; proyecto compose `kindly`; imágenes
  `ghcr.io/naxola/kindly/*` (el CI publica con `github.repository`);
  `EMAIL_FROM` de ejemplo «Kindly <…>». El README deja de decir
  `git checkout staging`. CI (`.github/workflows/ci.yml`) también en
  `master` y `migration/saas-template` (publica imágenes solo desde `staging`,
  que Kindly aún no usa: decidir en M13).
- Se mantienen **sin renombrar** las bases de datos `saas`, `saas_test`,
  `saas_shadow` y los paquetes `@saas/*` (nombres de fontanería de la plantilla;
  renombrarlos dificultaría traer sus versiones nuevas).
- Pendiente de marca (no es de M1c): datos legales y portada de Kindly en
  `apps/site` (M10); `docs/ui/` a `packages/ui` (M11).
- Verificación real (Node 24.22.1; **Postgres 16 local en el puerto 5441**
  con el script de roles de la plantilla, porque este entorno no tiene
  Docker): `format:check`, `lint` (+fronteras), `typecheck` (11/11), `test`
  (76), `db:deploy` + `queue:install` + `db:check` (sin diferencias),
  `test:integration` (80/80), `build` (5/5) y `test:e2e` (12/12, Chromium
  preinstalado). **No verificado:** el CI en GitHub (se comprueba con el push),
  el arranque con `docker compose` y la imagen `postgres` (M2 la cambia por una
  con pgvector).
- Cómo repetir el Postgres local sin Docker: `initdb` y `pg_ctl -o '-p 5441'`
  con `/usr/lib/postgresql/16/bin`, y `infra/postgres/init/*.sh` con
  `POSTGRES_USER=postgres`, `APP_*_PASSWORD` (migrator/app/platform) y
  `APP_DATABASES="saas saas_test saas_shadow"`. Tras reiniciar el entorno hay
  que recrearlo (vive fuera del repositorio).
- **Próximo paso concreto:** M2 — pgvector: imagen `postgres` del `Dockerfile`
  (partir de `pgvector/pgvector` con la versión de Postgres de la plantilla,
  o instalarlo sobre `postgres:18.6-trixie`; elegir y registrar en
  `docs/DECISIONS.md`), `docker-compose.yml`, `infra/staging/compose.yml`, CI y
  migración `CREATE EXTENSION vector`; variables de Kindly (`OPENAI_API_KEY`,
  Meta/WhatsApp, `FACEBOOK_DOMAIN_VERIFICATION`…) en los tres `.env.example`
  y `compose.yml`. Aquí el Postgres local es el 16 sin pgvector: para probar
  M2 habrá que instalar `postgresql-16-pgvector` o usar otro Postgres.

### 2026-11-12 — M2

- Hecho (opción A, `docs/DECISIONS.md` «pgvector sobre la imagen…»): target
  `postgres` del `Dockerfile` con `postgresql-${PG_MAJOR}-pgvector`;
  `docker-compose.yml` local construye ese target (`kindly-postgres:local`);
  `infra/postgres/init/00-roles.sh` crea el esquema `extensions` y la extensión
  como superusuario y fija `search_path = public, extensions` en los tres roles;
  migración `20261112210000_pgvector`; test de integración
  `packages/database/test/extensions.int.test.ts`; nota en `docs/deploy.md` para
  bases ya existentes.
- **Descubierto por el camino:** `vector` no es extensión de confianza (el
  migrador no puede crearla) y Prisma vacía `public` al reconstruir la sombra,
  por eso va en el esquema `extensions` y la crea el script de inicio.
- **Desviación del plan:** las variables de entorno de Kindly (OpenAI, Meta,
  verificación de dominio) **no** se añaden en M2, sino en la fase que las lee
  (M8a, M6b, M10), para no dejar configuración sin código.
- Verificación real (Node 24.22.1, Postgres 16 + pgvector 0.6.0 locales, sin
  Docker): un clúster **nuevo** creado con el script de inicio (puerto 5442)
  aplica las migraciones desde cero, `queue:install` y 80/80 de integración; en
  el clúster principal (5441) `db:deploy`, `db:check` («No difference
  detected»), `test:integration` 82/82 (incluye el test de pgvector), `lint`
  y `typecheck` en verde. **No verificado:** `docker build --target postgres`
  (no hay Docker aquí: el paquete `postgresql-18-pgvector` de PGDG para trixie
  se da por existente, sin comprobar), el compose local ni el CI en GitHub.
  Si el primer CI falla en el paso «Start Postgres», empezar por ahí.
- Entorno: el Postgres local ahora lleva pgvector instalado con
  `apt-get install postgresql-16-pgvector`; hay un segundo clúster de prueba
  en 5442 (`/var/lib/pg-kindly2`) que no hace falta conservar.
- **Próximo paso concreto:** M3a — permisos de Kindly en `ROLE_PERMISSIONS`
  (`core/identity/permissions.ts`), textos de ajustes de organización y miembros
  con los de Kindly y navegación vacía de módulos. Después M3b (ficha del
  miembro y cargos).

### 2026-11-12 — M3a (absorbida, sin código)

- Al inspeccionar `core/identity/permissions.ts`, la navegación y los textos de
  ajustes/miembros: los textos de la plantilla ya son genéricos («Administrador»,
  «Miembro»), y los permisos de Kindly (`contacts.*`, `conversations.*`,
  `cases.*`…) no tienen todavía módulo al que aplicarse. Añadirlos ahora sería un
  catálogo sin código que lo use (regla 7) y las entradas de navegación de módulos
  que no existen serían botones sin comportamiento (regla 5).
- **Decisión:** cada fase de módulo (M4a, M5a, M6a, M8a, M9…) añade sus permisos a
  `ROLE_PERMISSIONS`, su entrada en `MODULES` y los textos de rol que haga falta, con
  su test de permisos. M3a se da por cumplida sin commit propio; M3b es el primer
  trabajo real de identidad. La separación de roles de acceso (`ADMIN`/`MEMBER`)
  de D4 no cambia.

### 2026-11-12 — M3b (ficha del miembro y cargos)

- Hecho, de extremo a extremo en un solo paso (datos, `core`, API, UI, tests):
  - **Datos**: modelos `MemberPosition`, `MemberProfile`, `InvitationProfile`
    (migración `20261112220000_team`, RLS forzado por organización, CHECK E.164 del
    teléfono). Cargo con nombre único sin distinguir mayúsculas (`citext`).
  - **`core/team`** (módulo nuevo): `createOrganizationWithTeam`, `inviteMember`,
    `acceptInvitationWithProfile`, `listTeam`, `listTeamInvitations`,
    `updateMemberProfile` (ADMIN), `updateMyProfile` (cada persona), cargos
    (`listPositions`, `createPosition`, `updatePosition`, `setPositionArchived`).
    Permisos nuevos `positions.manage` y `member_profiles.manage` (solo ADMIN).
  - **Puntos de extensión en `core/identity`**: `createOrganization(…, hooks)`,
    `createInvitation(…, { hooks })` y `acceptInvitation(…, hooks)` aceptan callbacks
    opcionales que corren **dentro de su transacción** (atomicidad: si el cargo no es
    válido, no queda invitación). Compatibles hacia atrás; candidatos a subir a la
    plantilla.
  - **API** `/api/v1`: `GET|POST /positions`, `PUT /positions/{id}`,
    `POST /positions/{id}/archive|restore`, `PUT /members/{id}/profile`,
    `PUT /me/profile`; `GET /members` e `/invitations` devuelven ficha y cargo;
    `POST /invitations` exige `firstName` (Q3). `handleError` convierte un
    `ZodError` de un caso de uso en 400 normalizado (antes sería 500).
  - **UI**: invitación con nombre, apellidos, teléfono y cargo; columna Cargo y
    «Editar ficha» en Ajustes → Miembros; Ajustes → **Cargos** (crear, renombrar,
    archivar, restaurar); es/en.
- **Refinamientos de D14/D15 que conviene tener presentes:**
  - **No se escribe `users.display_name` desde la ficha.** `users` es global y una
    persona en dos organizaciones tendría nombres en conflicto; el nombre de la
    organización es el de su ficha y, sin ficha, el de la cuenta.
  - El nombre de un cargo archivado **sigue ocupado** (único por organización): hay
    que restaurarlo, no reutilizarlo.
  - Las **notas internas** solo las devuelve la API a quien tiene
    `member_profiles.manage`; la auditoría de la ficha guarda qué campos cambiaron,
    no sus valores (datos personales).
  - Cada persona edita nombre, apellidos, teléfono y email de contacto propios; el
    cargo y las notas solo el ADMIN. El cargo no concede ni quita nada (Q1).
- **Archivos de la plantilla tocados** (a vigilar en el próximo `git merge template/…`):
  `packages/database/prisma/schema.prisma` (relaciones inversas en `Organization`,
  `OrganizationMember`, `Invitation`), `core/identity/{organizations,invitations,
permissions,index}.ts`, `core/src/index.ts`, `apps/web/src/server/api/{app,errors}.ts`,
  rutas `{members,invitations,organizations}.ts`, `navigation/config.tsx`,
  `features/settings/members.tsx`, `messages/{es,en}.json`, `docs/api/openapi.json`.
  Lo demás es nuevo y no genera conflictos.
- Verificación real (Node 24.22.1, Postgres 16 + pgvector local): `format:check`,
  `lint`, `typecheck` (11/11), `test` (77), `test:integration` (100; incluye 19 nuevos
  de `team.int.test.ts`, el recorrido de la API con cargos y el RLS de las tablas
  nuevas), `db:check` sin diferencias, contrato OpenAPI regenerado, `build` (5/5) y
  `test:e2e` (13/13, con el escenario nuevo de cargos). Un test del worker
  (`sends the invitation email…`) agotó una vez el tiempo mientras fallaba otro test
  en la misma pasada y no volvió a fallar; se anota por si reaparece intermitente.
- **Próximo paso concreto:** M4a — contactos y afiliación (datos + `core` + API):
  `contacts`, `contact_assignments` (delegado de referencia y acceso temporal),
  predicado único de visibilidad por delegado (`role = MEMBER`), `memberships` y el
  módulo `activity`. Aquí se añaden los permisos `contacts.*` a `ROLE_PERMISSIONS`
  y la entrada de navegación del módulo. Antes, releer en `legacy/src/modules/
{contacts,memberships,audit}` y sus tests.

### 2026-11-13 — M4a (contactos, asignación, afiliación y actividad: datos + `core` + API)

- Hecho:
  - **Datos** (migración `20261113100000_crm_contacts`, RLS forzado): `contacts`,
    `contact_assignments`, `affiliations`, `activities`. Todas las referencias a personas
    son a `organization_members` (clave compuesta con la organización). A mano en el SQL:
    índice único parcial «una asignación abierta por contacto» y «una afiliación abierta
    por contacto», CHECK de que `ACTIVE` ⇔ sin fecha de fin, CHECK E.164 y `activities`
    append-only para `app_user`. `db:check` no detecta deriva por los índices parciales.
  - **`core`**: módulos `activity` (línea de tiempo del producto, sin autorización propia),
    `contacts` (listar/ver/crear/editar/identificar, historial de delegados, reasignar,
    línea de tiempo, `assertContactVisible`, `contactVisibilityWhere`) y `affiliations`
    (alta, edición, baja, rehacer alta, historial, regla de cuota vencida en `domain.ts`).
    Permisos nuevos: `contacts.read|write|read_all|assign` y `affiliations.manage` (el
    MEMBER tiene los tres primeros sin `read_all`/`assign`). Extraído
    `core/src/validation.ts` (normalizadores compartidos con `team`).
  - **API** `/api/v1/contacts…` (12 rutas) y contrato regenerado.
- **Decisiones de esta fase** (también en `docs/DECISIONS.md`):
  - «Afiliación» se llama `Affiliation`/`affiliations` (no `Membership`) para no
    confundirla con `OrganizationMember`; los tipos de actividad son `AFFILIATION_*`.
  - **La visibilidad es un fragmento `where` de Prisma** (`contactVisibilityWhere`), no un
    filtro posterior: lo no visible no sale de la base de datos. Se basa en el permiso
    `contacts.read_all`, no en el rol. Un contacto no visible responde 404 en todo.
  - **El acceso temporal sigue pendiente** (regla 3 de «Delegado de referencia y acceso
    temporal»): se deriva de mensajes y conversaciones, que llegan en M6a. Hoy solo existe
    la regla del delegado de referencia. `contactVisibilityWhere` es el único sitio donde
    hay que añadirla; casos, tareas y conversaciones pasarán por él.
  - Cada acción relevante escribe la actividad (producto) **y** una auditoría (seguridad,
    solo ids: nombres, teléfonos y emails son datos personales).
- **Pendiente de la fase anterior y arreglado por el camino:** el test del worker se
  quedaba sin tiempo cuando antes habían corrido otros archivos (la cola acumulaba los
  correos y eventos de los recorridos de la API y el worker los despachaba uno a uno
  antes de llegar a los suyos: **no era intermitente, crecía con cada test nuevo**).
  Ahora vacía `pgboss.job` antes de arrancar. Dos pasadas completas consecutivas en verde.
- **Protocolo de borrado de `legacy/` (refinamiento):** se borra lo portado cuando termina
  **toda la rebanada** (fase «b», con su UI y E2E), y los módulos compartidos (`audit`) en
  su último consumidor. Hoy el resto de `legacy` aún importa `contacts` y `audit`, así que
  M4a no borra nada. De los tests de `legacy/tests/integration/contact-assignments.test.ts`
  siguen **sin portar**: la asignación al recibir un mensaje y el acceso temporal (M6a),
  que casos y tareas heredan la visibilidad (M5a) y las consultas de la ficha
  `…ForContact` (M7b).
- Verificación real (Node 24.22.1, Postgres 16 + pgvector local): `format:check`, `lint`,
  `typecheck` (11/11), `test` (84), `test:integration` (126, dos pasadas; 25 nuevas de
  contactos, afiliaciones y la API más el RLS de las tablas nuevas), `db:check` sin
  diferencias, contrato regenerado, `build` (5/5) y `test:e2e` (13/13, sin cambios de UI).
- **Próximo paso concreto:** M4b — UI de contactos: `/contacts` (lista con delegado de
  referencia), `/contacts/[id]` (ficha editable, reasignar para ADMIN, afiliación con sus
  dos avisos, historial de delegados y línea de tiempo), entrada «Contactos» en la
  navegación con `anyOf: ['contacts.read']`, textos es/en, E2E de crm, afiliación y
  asignación con dos delegados. Releer `legacy/src/app/(app)/contacts`, los componentes de
  `inbox/` que usan la ficha y `docs/ui/CONVERSATION_WORKSPACE.md` §5.1. Al cerrar M4b,
  borrar de `legacy/` lo portado (contacts, memberships, sus páginas y tests).

### 2026-11-13 — M4b (UI de contactos y afiliación)

- Hecho:
  - **Pantallas** (`apps/web/src/features/contacts/`, páginas finas en `app/(app)/contacts`):
    `/contacts` (lista con delegado de referencia, aviso «sin identificar», panel lateral
    «Nuevo contacto», estado vacío) y `/contacts/[id]` (datos editables, delegado de
    referencia con historial y reasignación para quien tiene `contacts.assign`, afiliación
    con sus dos avisos de regla fija, línea de tiempo con autor). Un contacto no visible se
    muestra como inexistente (404 de la API, mismo texto).
  - Entrada **Contactos** en la navegación (`MODULES`); textos `contacts.*` y errores
    nuevos en es/en; claves de TanStack Query por organización (`contactKeys`).
  - **E2E** nuevo `e2e/contacts.spec.ts` (3 escenarios): crear/listar/editar con
    teléfono mal formado y línea de tiempo; afiliación completa (alta, cuota vencida, baja
    y volver a afiliar); delegado frente a ADMIN (visibilidad, 404 visual, reasignación y
    cómo la visibilidad sigue al contacto).
- **`legacy/` — borrado** (rebanada completa): páginas `contacts/page.tsx` y
  `contacts/[id]/page.tsx`, `new-contact-sheet.tsx`, `membership-section.tsx` y los tests
  `memberships-domain`, `memberships` (integración) y `membership.spec`. **Se conservan**
  `reassign-delegate-control.tsx`, `reference-delegate-section.tsx`, `membership-status.tsx`
  y los módulos `contacts`, `memberships` y `audit`: los usa el panel de conversación y la
  bandeja (M7), y `audit` también casos, tareas y mensajería. Se borran en su último consumidor.
- **Notas de diseño:**
  - Los formularios de detalle se remontan con `key` (fecha de actualización o periodo de
    afiliación) para recargar valores por defecto tras guardar: un E2E tiene que esperar a
    que el guardado termine antes de volver a escribir (si no, el reseteo borra lo escrito).
  - La fecha de alta/baja se muestra en UTC (es una fecha, no un instante) para que no
    cambie de día según la zona.
  - La lista de delegados candidatos de «Reasignar» sale de `GET /members` (solo ADMIN lo
    lee); se ofrecen solo miembros activos.
- Verificación real (Node 24.22.1, Postgres 16 + pgvector local): `format:check`, `lint`,
  `typecheck` (11/11), `test` (84), `test:integration` (126), `db:check` sin diferencias,
  contrato sin cambios, `build` (5/5) y `test:e2e` (16/16, con 3 escenarios nuevos).
- **Próximo paso concreto:** M5a — casos y tareas (datos + `core` + API): máquina de estados
  de `Case` (`OPEN → IN_PROGRESS → WAITING → RESOLVED → CLOSED`, reapertura desde
  `RESOLVED`, `CLOSED` terminal), responsable solo `MEMBER` activo, tareas con o sin
  contacto, vínculo y visibilidad heredada de `contactVisibilityWhere`. Releer
  `legacy/src/modules/{cases,tasks}`, `tests/unit/{cases-domain,cases-schema,tasks}.test.ts`
  y `tests/integration/crm.test.ts` / `contact-assignments.test.ts` (partes de casos y
  tareas, que hoy siguen sin portar). Permisos nuevos `cases.*` y `tasks.*` en esta fase.
