# MIGRATION.md — Kindly sobre `saas-template`

> Plan vivo de la migración de Kindly a la plantilla `naxola/saas-template`.
> Es la fuente de verdad para retomar el trabajo entre sesiones: **al empezar
> una sesión de migración se lee este archivo entero** y, al terminarla, se
> actualizan el estado de la fase, el hash del commit y las notas (sección 8).

Última actualización: 2026-11-12 (M0: decisiones validadas por el usuario; D4 rehecha y D14–D15 añadidas).

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

| Área                   | Kindly hoy                                            | Plantilla (lo que se adopta)                                                     |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Repositorio            | Una app Next (`src/`), npm                            | Monorepo pnpm + Turborepo: `apps/{web,site,worker}`, `packages/*`                |
| ORM                    | Drizzle, migraciones en `drizzle/`                    | Prisma 7, `packages/database/prisma`, RLS y grants escritos a mano en el SQL      |
| Aislamiento            | Filtro explícito por `organization_id`, **sin RLS**    | Filtro explícito **+ RLS forzado** (`withTenant`), roles `app_migrator/app_user/app_platform` |
| Identidad              | Tabla `users` compartida con Better Auth              | `auth_*` (acceso) separado de `users` + `organization_members` (negocio)          |
| Organizaciones         | Una organización por usuario (restricción única)      | Multiorganización con organización activa (cookie `active_org`)                   |
| Roles                  | `ADMIN` / `DELEGATE`                                   | `ADMIN` / `MEMBER` + catálogo de permisos (`authorize`)                          |
| Llamadas al servidor   | Server Actions + `src/app/api/*` sueltas              | Hono + zod-openapi en `/api/v1`, TanStack Query, sin Server Actions de negocio    |
| Trabajo en segundo plano | `after()` de Next, todo lo demás síncrono           | Jobs pg-boss idempotentes en `apps/worker`                                        |
| UI                     | `src/components/ui` + tokens propios (`docs/ui/`)      | `packages/ui` + `brand.css`                                                       |
| Textos                 | Español en el código                                  | `apps/web/messages/{es,en}.json` (un test exige las mismas claves)                |
| Web pública            | Rutas `(public)` dentro de la app                     | `apps/site` (contenido MDX vía `ContentSource`)                                   |
| Despliegue             | Vercel (staging)                                      | Imágenes Docker + compose de staging en el homelab (ADR 0006)                     |
| Postgres               | `pgvector/pgvector:pg16`                              | `postgres:18.6-trixie` → **hay que añadirle pgvector** (fase M2)                   |

## 3. Decisiones de la migración

Estado: **Aceptadas por el usuario el 2026-11-12** (registradas en
`docs/DECISIONS.md`). D4 se rehízo a petición suya y D14–D15 se añadieron
(acceso ≠ persona ≠ cargo). Quedan abiertas solo las preguntas de la
sección 3.1, que no bloquean M1–M2.

| #   | Decisión                       | Recomendación                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Estrategia Git                 | Rama de larga duración `migration/saas-template` desde `master`. `master` sigue sirviendo la app actual hasta el corte (M13). El primer commit mueve la app actual a `legacy/`; el segundo **fusiona la etiqueta `v1.0.0` de la plantilla con `--allow-unrelated-histories`**, de modo que las futuras versiones de la plantilla se traen con un `git merge` normal (remoto `template`). |
| D2  | Código antiguo durante la migración | En `legacy/` dentro del árbol, fuera del workspace, del lint y del CI. Sirve de referencia para portar y **cada fase borra lo que ya portó**: lo que queda en `legacy/` es exactamente lo que falta. Se borra entero en M13.                                                                                               |
| D3  | Datos existentes               | **Sin migración de datos**: staging empieza con base de datos nueva (Kindly no tiene clientes reales). Si hubiera datos que conservar, se añade un script ETL de un solo uso en M13.                                                                                                                                       |
| D4  | Tres capas de identidad        | **Acceso** = `auth_users` (solo quién puede entrar: email y contraseña). **Rol de acceso** = `organization_members.role` de la plantilla (`ADMIN`/`MEMBER`), que solo decide **permisos**; no se toca el enum. **Cargo** = rol funcional dentro de la organización (delegado, presidente, secretaria…), configurable por organización (D15). El antiguo `DELEGATE` de Kindly se separa en «`MEMBER` + cargo Delegado». |
| D5  | Una organización por usuario   | Se adopta la multiorganización de la plantilla (la restricción era del MVP). La visibilidad por delegado se calcula por membresía, así que no cambia.                                                                                                                                                                       |
| D6  | Sistema de diseño              | Se adopta `packages/ui` + `brand.css`. Los componentes de Kindly que no existan en `packages/ui` (DataList, FilterBar, SegmentedControl, RelativeTime, Sheet de conversación, Tabs, Popover…) se portan a `apps/web/src/components/` (genéricos) o a `apps/web/src/features/<módulo>/` (de negocio). `docs/ui/` se actualiza para apuntar a `packages/ui`. Los genéricos que valgan para todos los productos se proponen después a la plantilla. |
| D7  | Actividad frente a auditoría   | `activities` de Kindly (línea de tiempo visible en contacto/caso) se mantiene como módulo de negocio `activity`; además cada caso de uso relevante escribe en `audit_logs` de la plantilla. Son cosas distintas: una es producto, otra es seguridad.                                                                       |
| D8  | Conocimiento GLOBAL            | `documents`/`knowledge_chunks` con `organization_id` nulo para lo GLOBAL. Política RLS de lectura `organization_id IS NULL OR organization_id = current`; escritura de lo GLOBAL solo con el rol `app_platform` desde el script de operador. Se declara en el test de RLS con su justificación.                                       |
| D9  | `after()` → jobs               | El procesado de webhooks y la ingesta de conocimiento pasan a jobs de pg-boss. Resuelve el pendiente de Fase 7f («la subida es síncrona»).                                                                                                                                                                                  |
| D10 | Despliegue                     | Se adopta el de la plantilla (Docker + homelab con Coolify). Vercel no puede alojar el worker. Producción sigue sin decidir (igual que en la plantilla).                                                                                                                                                                    |
| D11 | Cobros                         | Se mantiene la fontanería de la plantilla con `CATALOG` mínimo y sin proveedor activo. «Billing avanzado» sigue fuera del MVP (`CLAUDE.md` §8).                                                                                                                                                                             |
| D12 | Congelación de `master`        | Mientras dure la migración no se añaden funcionalidades a `master`. Si fuera imprescindible, se anota en la sección 8 para portarlo.                                                                                                                                                                                         |
| D14 | Ficha del miembro              | Tabla de producto `member_profiles` (1:1 con `organization_members`, con `organization_id` y RLS): nombre, apellidos, teléfono (`phone_e164`), email de contacto opcional, `position_id` (cargo), notas. Es del tenant y no global porque la gestiona el ADMIN de cada organización (RGPD: cada organización es responsable de sus datos). `users.display_name` de la plantilla se sigue usando para mostrar; se rellena desde nombre + apellidos. El teléfono de la ficha es dato de contacto, **no** la identidad de WhatsApp (esa sigue siendo `messaging_accounts`). No se añaden columnas a las tablas de la plantilla. |
| D15 | Cargos configurables           | Tabla `member_positions` (`organization_id`, nombre único por organización, descripción, orden, `archived_at`; RLS). Se gestiona en **Ajustes → Cargos** (solo ADMIN, permiso `positions.manage`). Al crear la organización se siembra «Delegado» por defecto. Al invitar a un miembro se eligen rol de acceso + cargo + nombre/teléfono (se guardan en `invitation_profiles`, del tenant, y se copian a `member_profiles` al aceptar, en la misma transacción). Un cargo en uso no se borra: se archiva. Para engancharse a crear organización / aceptar invitación se añade a `core/identity` un punto de extensión genérico (`onOrganizationCreated`, `onMemberJoined`), candidato a subir a la plantilla. |
| D13 | Textos en inglés               | Se rellenan `en.json` con traducciones reales (el test de claves lo exige). Español sigue siendo el idioma por defecto de la organización.                                                                                                                                                                                  |

## 4. Equivalencias para portar código

| Kindly (legacy)                                                   | Destino en la plantilla                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/modules/<m>/schema.ts` (Drizzle)                              | Modelos en `packages/database/prisma/schema.prisma` + migración con RLS y grants a mano                       |
| `src/modules/<m>/service.ts`, `domain.ts`                          | `packages/core/src/modules/<m>/` (casos de uso que empiezan por `authorize(ctx.actor, …)`, zod en la entrada) |
| `src/modules/<m>/actions.ts` (Server Actions)                      | Ruta en `apps/web/src/server/api/routes/<m>.ts` (`actorCtx(c)` → caso de uso) + hook de TanStack Query         |
| `getCurrentOrganizationMember()`                                  | `actorCtx(c)` en la ruta; `ctx.actor` en `core`                                                               |
| `organization_members.role === "DELEGATE"`                         | `actor.role === 'MEMBER'` / permisos de `ROLE_PERMISSIONS`                                                    |
| `src/modules/audit` (`activities`)                                 | `core/modules/activity` (línea de tiempo) + `audit` de la plantilla                                           |
| `after(...)`                                                      | `defineJob` + `ctx.queue.enqueue(tx, …)` + handler en `apps/worker/src/handlers.ts`                           |
| `src/modules/email/*` (Resend)                                     | `@saas/adapters/email` (ya existe)                                                                            |
| `src/modules/auth/*`                                               | `@saas/adapters/auth` + `core/identity` (ya existen; no se porta)                                             |
| `src/modules/organizations/*` (invitaciones, miembros, roles)      | `core/identity` (ya existe; solo se ajustan textos y permisos)                                                |
| `src/modules/messaging/adapter.ts`, `registry.ts`                  | Puerto `MessagingAdapter` en `core/modules/messaging`; implementaciones en `packages/adapters/src/messaging/`  |
| `src/modules/knowledge/*embedding-provider.ts`                     | Puerto `EmbeddingProvider` en `core/modules/knowledge`; OpenAI en `packages/adapters/src/embeddings/`          |
| `src/components/ui/*`                                              | `@saas/ui` o `apps/web/src/components/` (D6)                                                                  |
| `src/app/(app)/<ruta>`                                             | `apps/web/src/app/(app)/<ruta>` (página fina) + `apps/web/src/features/<m>/`                                   |
| `src/app/(public)/*`, `src/config/company.ts`                      | `apps/site` (`content/legal/<idioma>/`, `site.config.ts`)                                                     |
| `scripts/ingest-knowledge.ts`, `reset-password.ts`                 | `scripts/` de la raíz (comandos `pnpm …`)                                                                     |
| `tests/unit`, `tests/integration`, `tests/e2e`                     | Tests junto a cada paquete (`*.test.ts`, `*.int.test.ts`) y `e2e/` de la raíz                                 |
| Texto en español en el JSX                                         | `apps/web/messages/{es,en}.json`                                                                              |

## 5. Fases (cada una = uno o pocos commits revisables, siempre en verde)

### 3.1 Preguntas abiertas (no bloquean M1–M2; resolver antes de M3b/M4a)

- **Q1 ¿El cargo da comportamiento?** Propuesta: en M3b el cargo es
  informativo (se muestra y se filtra) y las reglas de Kindly que hoy dicen
  «solo un DELEGATE» (delegado de referencia de un afiliado, responsable de un
  caso, visibilidad restringida) pasan a depender de un atributo del cargo:
  `member_positions.handles_contacts` («puede tener afiliados asignados»),
  verdadero en «Delegado». Así un «Presidente» `ADMIN` ve todo y un
  «Presidente» `MEMBER` sin ese atributo no recibe afiliados. Alternativa:
  que dependa solo de `role = MEMBER`.
- **Q2 ¿Uno o varios cargos por miembro?** Propuesta: uno (columna
  `position_id`); si hiciera falta varios, tabla puente más adelante.
- **Q3 ¿Datos obligatorios de la ficha?** Propuesta: nombre obligatorio;
  apellidos, teléfono y cargo opcionales en la invitación y editables después.

Leyenda: ⬜ pendiente · 🟡 en curso · ✅ hecha · ⏸ bloqueada.

Cada fase de dominio sigue el mismo orden y **no se da por cerrada** sin:
esquema Prisma + migración con RLS (el test `rls.int.test.ts` lo exige) →
casos de uso en `core` con `authorize` y auditoría → rutas `/api/v1` +
`pnpm api:generate` → interfaz en `apps/web` con textos es/en y navegación →
tests portados de `legacy/tests` (unitarios, integración, E2E) → borrar de
`legacy/` lo portado → `pnpm format:check && pnpm lint && pnpm typecheck &&
pnpm test && pnpm test:integration && pnpm test:e2e && pnpm build` en verde.
Cuando una fase es grande se parte en «a» (datos + `core` + API) y «b» (UI + E2E).

| Fase | Contenido                                                                                                                                                                                                                                                                       | Legacy que porta / borra                                                                         | Estado |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------ |
| M0   | Este plan, decisiones propuestas, enlaces desde `CURRENT_TASK`/`TASKS`/`PROGRESS`/`DECISIONS`                                                                                                                                                                                   | —                                                                                                | ✅      |
| M1a  | Crear `migration/saas-template`. Mover la app a `legacy/` (`git mv` mecánico: `src`, `tests`, `scripts`, `drizzle`, `docker`, `tokens`, configs de raíz). `docs/` y `project/` se quedan en la raíz                                                                                | Todo pasa a `legacy/`                                                                            | ⬜      |
| M1b  | Remoto `template`; `git merge --allow-unrelated-histories v1.0.0`. Resolver: `CLAUDE.md` fusionado (reglas de la plantilla + reglas de producto de Kindly, sin contradicciones: Prisma, API, jobs), `README.md` («parte de saas-template v1.0.0»), `.gitignore`. Excluir `legacy/` de pnpm, ESLint, Prettier, tsc y Vitest | —                                                                                                | ⬜      |
| M1c  | Marca: `brand.css` (acento y radio de Kindly desde `legacy/tokens`), `app.name` «Kindly», nombre del producto en `site.config.ts`. CI de la plantilla en verde en este repo                                                                                                     | `legacy/tokens` (parte)                                                                          | ⬜      |
| M2   | Infra: pgvector en la imagen `postgres` del `Dockerfile` y en `docker-compose.yml`/staging/CI; migración `CREATE EXTENSION vector`. Variables de Kindly (`OPENAI_API_KEY`, Meta/WhatsApp, `FACEBOOK_DOMAIN_VERIFICATION`…) en los tres `.env.example` y `compose.yml`                 | `legacy/docker`, `legacy/docker-compose.yml`                                                     | ⬜      |
| M3a  | Permisos de Kindly (`contacts.*`, `conversations.*`, `cases.*`, `tasks.*`, `knowledge.*`, `procedures.*`, `channels.*`, `positions.manage`, `member_profiles.manage`) en `ROLE_PERMISSIONS`; ajustes de organización y miembros de la plantilla con los textos de Kindly; navegación vacía de los módulos | `legacy/src/modules/organizations`, `auth`, `email`; páginas de `login`, `forgot/reset-password` | ⬜      |
| M3b  | **Ficha del miembro y cargos** (D14, D15, Q1–Q3): `member_profiles`, `member_positions`, `invitation_profiles` con RLS; puntos de extensión en `core/identity`; siembra de «Delegado»; **Ajustes → Cargos** (crear, renombrar, ordenar, archivar); invitación con cargo, nombre y teléfono; ficha del miembro editable (ADMIN; cada persona edita su teléfono); cargo visible en la lista de miembros. Tests de RLS, permisos y aceptación de invitación | páginas de `members`, `organization/members`, `invite`; E2E `members`, `organization` | ⬜      |
| M4a  | **Contactos y afiliación** (datos + core + API): `contacts`, `contact_assignments` (delegado de referencia y acceso temporal), predicado único de visibilidad, `memberships`, módulo `activity` (D7)                                                                              | `modules/contacts`, `memberships`, `audit` + sus tests                                           | ⬜      |
| M4b  | Contactos (UI + E2E): `/contacts`, `/contacts/[id]`, reasignar, afiliación                                                                                                                                                                                                       | `app/(app)/contacts`, E2E `crm`, `membership`, `contact-assignments` (parte)                     | ⬜      |
| M5a  | **Casos y tareas** (datos + core + API): máquina de estados de `Case`, responsable solo delegado, tareas                                                                                                                                                                        | `modules/cases`, `tasks` + tests                                                                 | ⬜      |
| M5b  | Casos y tareas (UI + E2E)                                                                                                                                                                                                                                                       | `app/(app)/cases`, `tasks`, `dashboard`; E2E `cases`                                             | ⬜      |
| M6a  | **Mensajería, núcleo**: `messaging_accounts`, `webhook_events`, `conversations`, `messages`, `conversation_cases`; puerto `MessagingAdapter` + registro; webhook público con firma → job idempotente `messaging.process-webhook` (D9)                                             | `modules/messaging` (núcleo), `conversations`, `app/api/webhooks` + tests                        | ⬜      |
| M6b  | Mensajería, WhatsApp: envío saliente con guardarraíl de identidad, coexistence (ecos, historial, ventana de servicio, desconexión externa), adaptador de prueba de Meta (PKG-011), comprobaciones de alta (PKG-008), adaptadores falsos para tests                                    | `messaging/whatsapp-*`, `testing/*` + tests                                                      | ⬜      |
| M7a  | **Inbox** (API + UI): lista única con vistas, contadores, búsqueda y filtros en la URL, `LEFT JOIN LATERAL` (SQL crudo de Prisma), caché TanStack Query, teclado                                                                                                                | `app/(app)/inbox`, `app/api/inbox`; E2E `inbox`                                                  | ⬜      |
| M7b  | **Espacio de conversación**: panel de dos columnas (chat + ficha del afiliado), envío optimista, checks, sondeo, «escribiendo…», solo lectura y aviso de otro delegado                                                                                                              | `inbox/[id]`, `app/api/conversations`; E2E `conversation-workspace`, `contact-assignments`       | ⬜      |
| M7c  | **Canales**: vista por delegado, máquina de estados, alta de WhatsApp (tres vías) en Organización → Canales                                                                                                                                                                     | `app/(app)/channels`, `organization/channels`; E2E `channels`, `whatsapp-onboarding`             | ⬜      |
| M8a  | **Conocimiento, datos e ingesta**: `documents`, `document_versions`, `knowledge_chunks` (`vector` como `Unsupported` + SQL crudo), RLS con GLOBAL (D8), `EmbeddingProvider` (OpenAI + falso), extracción PDF/web, guardia SSRF, troceado, ingesta como job (subida asíncrona con estado) y `pnpm knowledge:ingest` | `modules/knowledge` (salvo retrieval), `scripts/ingest-knowledge.ts` + tests                    | ⬜      |
| M8b  | Conocimiento, recuperación + UI: híbrida FTS + vector con RRF y filtros duros, `/knowledge`, detalle de versión, búsqueda con citas, subida y nueva versión (ADMIN)                                                                                                              | `knowledge/retrieval*`, `app/(app)/knowledge`; E2E `knowledge`                                   | ⬜      |
| M9   | **Trámites**: `procedures` versionados con pasos y documentos requeridos, ADMIN                                                                                                                                                                                                  | `modules/procedures`, `knowledge/procedures`; E2E `procedures`                                   | ⬜      |
| M10  | **Web pública**: legales de Kindly en `apps/site` (privacidad, términos, aviso legal, eliminación de datos —URL que exige Meta—), datos de empresa en `site.config.ts` con la banda «REVISAR», `FACEBOOK_DOMAIN_VERIFICATION`, portada de Kindly                                     | `app/(public)`, `config/company.ts`; E2E `public-site`                                           | ⬜      |
| M11  | Accesibilidad y pulido: axe en E2E (claro/oscuro), atajos (F6), responsive 320 px, tema oscuro con `brand.css`; `docs/ui/` actualizado a `packages/ui` (D6)                                                                                                                       | `components/*`, `ui-kit`, E2E `accessibility`, `shell`                                           | ⬜      |
| M12  | Documentación: `ARCHITECTURE.md`, `DATABASE.md`, `INTEGRATIONS.md`, `tests/README` al nuevo stack; `CLAUDE.md` definitivo; `PROGRESS.md`                                                                                                                                       | —                                                                                                | ⬜      |
| M13  | **Corte**: `legacy/` vacío y borrado; despliegue en staging (homelab) con `db:deploy` + `queue:install`; datos (D3); el usuario fusiona `migration/saas-template` en `master`; etiqueta `kindly-v0.2.0`                                                                           | Resto de `legacy/`                                                                               | ⬜      |

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
  `master` y mover la app a `legacy/`). Q1–Q3 se resuelven antes de M3b.
