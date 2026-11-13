# CLAUDE.md — Kindly

Kindly es un SaaS multi-tenant (CRM + bandeja unificada + casos + base de
conocimiento + AI Copilot) descrito en `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`,
`docs/DATABASE.md` e `docs/INTEGRATIONS.md`. `docs/DECISIONS.md` recoge por qué
se decidió cada cosa importante.

**Base técnica:** parte de `naxola/saas-template` **`v1.0.0`** (remoto `template`,
solo lectura). La plantilla aporta estructura y fontanería (acceso,
organizaciones, cola y worker, correo, observabilidad, eventos de negocio, UI
base, web pública con blog y despliegue); Kindly añade solo su negocio. Las
decisiones de la plantilla están en `docs/adr/` (estado **Aceptado**); las de
Kindly en `docs/DECISIONS.md`.

- Desarrollador único. Conversación y documentación en **español**; código,
  identificadores, tablas, comentarios y commits en **inglés**.
- Este archivo se lee siempre, en cada sesión. Lo que cambia con frecuencia
  (qué se está haciendo, qué queda) vive en `project/`, no aquí.

## Estado: migración a la plantilla (activa)

La app anterior (Next.js + Drizzle, npm) está en `legacy/` y se porta por fases
a esta estructura. **Plan, equivalencias, protocolo de sesión y registro:
`project/MIGRATION.md` (leerlo entero al empezar).** Reglas de la migración:

- `legacy/` es solo referencia: no se modifica salvo para **borrar lo ya
  portado**, y está fuera de pnpm, ESLint, Prettier, `tsc` y Vitest.
- Se trabaja en la rama `migration/saas-template` (o ramas desde ella). No se
  añaden funcionalidades a `master` mientras dure (D12).
- No se toca nada de `saas-template` desde aquí: el remoto `template` no admite
  push. Las mejoras genéricas se proponen a la plantilla aparte, y sus versiones
  nuevas se traen con `git merge` entre fases, nunca a mitad de una.

## Qué hay que leer antes de tocar código

1. `project/CURRENT_TASK.md` — qué toca ahora mismo.
2. `project/MIGRATION.md` — mientras dure la migración.
3. `docs/DECISIONS.md` y `docs/adr/` — restricciones ya validadas; no las
   contradigas sin registrar una decisión nueva.
4. El documento de `docs/` relevante al módulo que vas a tocar.
5. Si el cambio toca interfaz: `docs/ui/README.md` y los documentos que indique
   (pendiente de actualizar a `packages/ui`, fase M11). No se hardcodean
   colores, radios, sombras, alturas ni z-index, y no se crea un componente si
   ya existe uno equivalente en `packages/ui` o `apps/web/src/components/`.

## Reglas de ejecución (obligatorias)

1. Respeta las decisiones **Aceptadas** de `docs/adr/` y de `docs/DECISIONS.md`.
   Las **Propuestas** no se implementan hasta que el usuario las valide.
2. **La fontanería no lleva dominio.** `packages/ui`, `packages/config`,
   `packages/adapters` genéricos, etc. no conocen contactos, afiliados ni
   WhatsApp. El negocio de Kindly va en `packages/core/src/modules/<negocio>/`,
   `apps/web/src/features/<negocio>/`, su marca y sus textos.
3. Inspecciona antes de tocar: estado del repo, convenciones y código existente.
4. Incrementos pequeños, revisables y reversibles.
5. Nada de datos simulados presentados como reales ni botones sin comportamiento.
6. Para cambiar una decisión arquitectónica: entrada nueva en
   `docs/DECISIONS.md` (problema, alternativas, impacto) y aprobación del usuario.
7. Toda dependencia o infraestructura nueva se justifica por necesidad y coste.
   Sigue fuera: microservicios, Kubernetes, Elasticsearch/OpenSearch, vector DB
   externa, apps móviles nativas, respuestas automáticas de la AI, motor de
   workflows, analítica avanzada, más canales de mensajería, integraciones no
   oficiales de WhatsApp (`docs/ARCHITECTURE.md`, «No construir todavía»).
8. **No afirmes haber ejecutado pruebas que no has ejecutado.** No ocultes
   fallos borrando pruebas ni relajando validaciones o permisos.
9. Nunca expongas secretos, tokens ni datos personales en logs, respuestas o UI.
10. Ninguna migración destructiva sin autorización expresa.

## Principios de producto que no se rompen

Innegociables salvo decisión explícita del usuario registrada en
`docs/DECISIONS.md`:

1. **Identidad de comunicación del profesional.** Cada delegado usa su propia
   cuenta de WhatsApp/Telegram. Kindly sincroniza, no sustituye ni centraliza
   en un número de la organización, salvo que una limitación real de la
   plataforma lo obligue y quede documentada con la alternativa aceptada.
2. **La AI es copiloto, nunca autoenvía.** Ninguna respuesta generada por AI
   llega al contacto sin que un humano la revise, edite o acepte
   explícitamente. Vale también para tareas y automatizaciones futuras.
3. **Conocimiento normativo verificable.** Toda sugerencia de la AI basada en
   normativa o documentación incluye fuente real, versión, vigencia y
   `EvidenceLevel`. Nunca se inventan citas ni se afirma algo que la fuente
   recuperada no dice.

Además: el dominio no se acopla a un proveedor concreto (WhatsApp, Telegram,
OpenAI); siempre a través de los puertos `MessagingAdapter`, `LLMProvider` y
`EmbeddingProvider`. Kindly no almacena archivos de los afiliados.

### Antes de implementar una integración externa

1. Comprueba si depende de una capacidad real y **actual** de la API del
   proveedor (no supongas).
2. Si no está confirmada, dilo y propón una PoC o pregunta antes de construir
   el resto alrededor de esa hipótesis.
3. Nunca sustituyas una limitación real por una solución no oficial (scraping,
   WhatsApp Web automatizado, sesiones no oficiales).
4. Si una limitación obliga a cambiar un requisito de producto, no lo cambies
   en silencio: para, explica, propón alternativas oficiales y registra la
   decisión en `docs/DECISIONS.md`.

## Flujo de ramas y commits

- `master`: la app anterior, estable, **congelada durante la migración**. Solo el
  usuario fusiona en ella; al terminar (M13) fusionará `migration/saas-template`.
- `migration/saas-template`: rama de integración de la migración. Cada fase, en
  su propio commit o en una rama corta desde ella (`feat/…`, `fix/…`, `chore/…`,
  `docs/…`) fusionada con `--no-ff`.
- Sin force-push ni reescritura de historial publicado.
- Commits en inglés con [Conventional Commits](https://www.conventionalcommits.org/)
  y alcance de fase o paquete: `feat(M4a): …`, `chore(M1a): …`, `docs(M0): …`.
- Solo se commitea con **lint + typecheck + tests en verde**. Si algo falla y no
  se puede resolver en la sesión, se anota en `project/CURRENT_TASK.md` y no se
  commitea código roto.
- Las versiones de la plantilla de las que parte Kindly se anotan en el README.

## Cómo trabajar por sesiones

Al empezar: leer `project/CURRENT_TASK.md` (y `MIGRATION.md`), `git status`,
`git log --oneline -10`, y comprobar que lo que ya existe está en verde.

Al terminar (haya acabado el paquete o no):

- Actualizar `project/CURRENT_TASK.md` con el estado real y el hash del último
  commit (o `sin commits`), `project/TASKS.md` marcando lo hecho y
  `project/PROGRESS.md` si cambia una fase (**siempre** su línea «Última
  actualización:» en formato YYYY-MM-DD).
- Decisión de arquitectura no trivial → entrada nueva en `docs/DECISIONS.md`
  (nunca borrar entradas, solo superseder). Fases de migración →
  `project/MIGRATION.md` §8.

## Estructura

```
apps/web          SaaS (app.producto.com): pantallas con sesión + API
apps/site         Web pública (producto.com): portada, precios, blog, legales
apps/worker       Consumidor de la cola: correos, eventos, webhooks, ingesta, tareas
packages/config   Validación de env (zod), tsconfig/eslint compartidos
packages/database Esquema, migraciones, RLS, cliente con contexto de tenant
packages/core     Dominio común + casos de uso por módulo, autorización
packages/adapters Auth, correo, cola, storage, logger, cobros, mensajería, embeddings
packages/ui       Sistema de diseño compartido por web y site (tokens de marca)
packages/content  Fuente de contenidos del blog (MDX; CMS más adelante)
infra/            Compose de staging (homelab), init de Postgres, script de migrate
Dockerfile        Imágenes: web, site, worker, migrate, postgres (docs/deploy.md)
legacy/           App anterior de Kindly; referencia temporal de la migración
docs/ project/    Documentación y seguimiento de Kindly
```

- En `packages/core` cada módulo es una carpeta con un `index.ts` público.
  **Prohibido importar el interior de otro módulo.** Las fronteras se verifican
  en `lint` con un script propio.
- Las reglas de negocio viven solo en `core`. Rutas, páginas y worker son capas
  finas que llaman a los mismos casos de uso.
- Lo que añade Kindly: `packages/core/src/modules/<negocio>/`,
  `apps/web/src/features/<negocio>/`, su archivo de marca y sus textos.

## Acceso, persona y cargo (ADR 0003 + D4/D14/D15 de `docs/DECISIONS.md`)

- **Acceso** = tablas `auth_*` (`auth_users`, `auth_sessions`, `auth_accounts`,
  `auth_verifications`…). Solo sabe quién puede entrar. **No conoce nada del
  negocio**: ninguna columna ni clave foránea hacia tablas de negocio.
- **Negocio** = `users` (persona dentro del SaaS) y `organization_members`
  (persona en una organización, con su **rol de acceso** `ADMIN`/`MEMBER`, que
  decide solo permisos). La relación vive en el negocio:
  `users.auth_user_id → auth_users.id` (única).
- **Ficha y cargo (Kindly)**: `member_profiles` (nombre, apellidos, teléfono,
  email de contacto, notas; 1:1 con `organization_members`, del tenant) y
  `member_positions` (cargo configurable por organización: delegado,
  presidente…; **es solo un nombre**: ninguna regla ni permiso lee el cargo).
- «Delegado» en las reglas de negocio de Kindly significa `role = MEMBER`: es quien tiene
  la visibilidad restringida a sus afiliados y quien puede ser responsable de un caso. El
  **delegado de referencia** de un afiliado puede ser cualquier miembro activo (un ADMIN
  que crea un contacto es el primero). Las reglas piden permisos (`contacts.read_all`,
  `contacts.assign`…), no cargos.
- Todas las tablas de negocio referencian `users.id` u
  `organization_members.id`, **nunca** `auth_users.id`.
- El alta solo crea `auth_users`. El `users` de negocio nace cuando la persona
  entra al producto por primera vez (crear organización o aceptar invitación).
- Solo `packages/adapters/auth` y el módulo `core/identity` tocan las tablas
  `auth_*`. El resto de `core` trabaja con un `Actor` de negocio.

## Reglas de datos

- Aislamiento entre tenants: `organization_id` en toda tabla del tenant, filtro
  explícito y además RLS (ADR 0002). Nunca una consulta que devuelva filas de
  otra organización «por descuido».
- Autorización en servidor, dentro de cada caso de uso, con denegación por
  defecto. Los filtros de la UI no son seguridad.
- Validación con zod en todos los límites del sistema. Errores normalizados.
- Auditoría de acciones relevantes con actor, tenant, acción, recurso y `correlationId`.
- Jobs idempotentes, con reintentos limitados, backoff y fallo definitivo visible.
- Logs estructurados con `correlationId`. Nunca contraseñas, tokens ni datos
  personales innecesarios.

## Seguridad (no negociable)

- Nunca secretos en frontend, logs, respuestas de API, código fuente o Git.
  `credentials_reference` apunta a un almacén seguro, no contiene el secreto.
- Todo webhook entrante se valida por firma antes de procesar.
- Rate limiting en endpoints públicos y en el envío de mensajes salientes.
- Validación de archivos subidos (tipo, tamaño, contenido) y guardia SSRF en
  toda URL que el servidor descargue.
- No se usan datos de clientes para entrenar modelos salvo configuración
  explícita y jurídicamente revisada.

## Comandos

Node 24.21.0 (`.node-version`) y pnpm 10.34.6 vía corepack. Postgres local en el puerto **5441**.

| Comando                                                  | Qué hace                                                                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                           | Dependencias (aisladas: `node-linker=isolated`)                                                                                                |
| `cp .env.example .env`                                   | Configuración local (solo vale para el `docker-compose.yml` local)                                                                             |
| `pnpm env:check`                                         | Lista las variables de `.env.example` que faltan en tu `.env` (se ejecuta antes de `pnpm dev`)                                                 |
| `pnpm infra:up` / `pnpm infra:down`                      | Postgres en Docker, con los roles `app_migrator`, `app_user` y `app_platform`                                                                  |
| `pnpm db:generate`                                       | Genera el cliente Prisma                                                                                                                       |
| `pnpm db:migrate`                                        | Crea o aplica migraciones en desarrollo. **Las políticas RLS se añaden a mano al SQL**                                                         |
| `pnpm db:deploy` / `pnpm db:check`                       | Aplica migraciones / verifica que esquema y migraciones coinciden                                                                              |
| `pnpm queue:install`                                     | Crea o actualiza las tablas de pg-boss. **Va siempre junto a `db:deploy`** (la web solo encola y no las crea)                                  |
| `pnpm ops:queue` / `pnpm ops:queue retry <cola> <id>`    | Estado de las colas y últimos fallos definitivos / reintenta un job fallido (runbook: `docs/operations.md`)                                    |
| `pnpm knowledge:ingest`                                  | Carga conocimiento GLOBAL (PDF, URL o texto) con el rol de plataforma; no es para uso de una organización (`docs/DECISIONS.md`, M8a)           |
| `pnpm lint`                                              | ESLint + `scripts/check-boundaries.ts`                                                                                                         |
| `pnpm typecheck` · `pnpm test` · `pnpm test:integration` | Tipos · unitarias · integración (requiere `infra:up`)                                                                                          |
| `pnpm format` / `pnpm format:check`                      | Prettier                                                                                                                                       |
| `pnpm dev`                                               | Web (http://localhost:3000), web pública (http://localhost:3001) y worker en modo desarrollo                                                   |
| `pnpm api:generate`                                      | Regenera `docs/api/openapi.json` y los tipos del cliente. Ejecutar tras cambiar una ruta                                                       |
| `pnpm test:e2e`                                          | E2E con Playwright (build de producción contra la BD de test; requiere `infra:up`). Con Chromium preinstalado: `PW_CHROMIUM_PATH=/ruta/chrome` |
| `pnpm build`                                             | Build de todos los paquetes                                                                                                                    |

La app anterior se ejecuta aislada: `cd legacy && npm install --no-package-lock && npm test`
(`npm ci` falla por el lockfile; ver `project/MIGRATION.md` §8).

## Convenciones al añadir código

- Toda tabla nueva del tenant lleva `organization_id` y su política RLS en la
  migración; el test de esquema (`packages/database/test/rls.int.test.ts`) falla si no.
- Una tabla global (sin RLS de tenant) se declara en `GLOBAL_TABLES` de ese test, con su ADR
  o entrada de decisión.
- Un paquete nuevo se declara en `ALLOWED` de `scripts/check-boundaries.ts`.
- Rutas nuevas de la API: en `apps/web/src/server/api/routes/`, registradas en
  `app.ts` (`v1`) con esquemas zod, y después `pnpm api:generate` (el CI falla si el
  contrato no está al día). Las rutas son capas finas: contexto → caso de uso de `core`.
  Sin Server Actions para lógica de negocio (ADR 0007).
- Textos de interfaz: `apps/web/messages/{es,en}.json` (un test exige las mismas claves).
- Módulos nuevos en la navegación: `apps/web/src/navigation/config.tsx` (`MODULES`),
  con los permisos que muestran cada elemento (`anyOf`). Solo filtra la interfaz.
- Las rutas de negocio usan `actorCtx(c)` (organización activa + permisos);
  `accessCtx(c)` solo para lo que ocurre antes de entrar al producto.
- Identidad visual del producto: solo `packages/ui/src/brand.css` (color de acento y
  radio) y `app.name` en los mensajes.
- Web pública: textos en `apps/site/messages/{es,en}.json`; enlaces, datos legales y
  planes en `apps/site/src/site.config.ts`; posts en `apps/site/content/blog/<idioma>/*.mdx`
  y textos legales en `apps/site/content/legal/<idioma>/`. Las páginas solo leen el
  contenido a través de `ContentSource` (`@saas/content`).
- Solo `packages/adapters/src/auth` y `packages/core/src/modules/identity` acceden a
  `auth_*` (`tx.authUser`…). El script de fronteras lo comprueba (los tests pueden
  crear datos de prueba en esas tablas).
- Permisos nuevos: en `core/src/modules/identity/permissions.ts` (`PERMISSIONS` y
  `ROLE_PERMISSIONS`). Cada caso de uso empieza con `authorize(ctx.actor, …)`.
- Jobs nuevos: `defineJob` en el módulo de `core`, añadido a `ALL_JOBS`
  (`core/src/index.ts`) y registrado en `apps/worker/src/handlers.ts`. Un test falla
  si un job no tiene consumidor. Se encolan con `ctx.queue.enqueue(tx, …)` dentro de
  la transacción del cambio y con una clave de idempotencia del efecto de negocio.
- Eventos de negocio nuevos: tipo en `BUSINESS_EVENT_TYPES` (`core/src/modules/events`)
  y `emitEvent(ctx, tx, …)` en el caso de uso (ADR 0010).
- Cobros (ADR 0012): métricas, funciones y planes del producto en `CATALOG`
  (`core/src/modules/billing/catalog.ts`); un precio nuevo es una **versión nueva**, nunca se
  edita una publicada. Lo que consume cuota se registra con `recordUsage(ctx, tx, …)` dentro
  de la transacción del efecto y con su clave de idempotencia; una función de pago se comprueba
  con `requireFeature(ctx, tx, …)` además de `authorize`. Nombres visibles de planes, métricas
  y unidades en `billing.*` de los mensajes. Dinero y cantidades: decimales, nunca `float`.
  (En Kindly los cobros están presentes pero inactivos: D11.)
- Observabilidad (ADR 0008): los errores inesperados se reportan con `captureError`
  (`@saas/adapters/errors`) con ids y `correlationId`, nunca emails ni datos de la petición.
  Los `DomainError` esperados (4xx) no se reportan. Las alertas al móvil (`AlertSender`) son
  solo para lo que necesita a una persona ya.
- Despliegue (ADR 0006): las imágenes no llevan variables del entorno (se leen al arrancar);
  nada debe leer `env()` durante `next build`. Una variable nueva va en `.env.example`,
  en `infra/staging/compose.yml` y en `infra/staging/.env.example`.
- El worker compilado (`dist/main.js`) solo arranca con un `node_modules` plano: la imagen
  lo instala desde el lockfile con `pnpm install --prod --filter "@saas/worker..."
--config.node-linker=hoisted` (ver `Dockerfile`). En local se usa `pnpm dev`.

## Testing — Definition of Done

Ninguna funcionalidad de negocio está terminada sin:

- Tests unitarios de la lógica de dominio afectada (servicios, permisos, filtros
  de RAG, idempotencia).
- Tests de integración si toca PostgreSQL, un `MessagingAdapter` o el
  procesamiento de webhooks (incluido el aislamiento entre organizaciones).
- Para flujos de usuario completos (Inbox, conexión de canal, AI Copilot): al
  menos un E2E del camino feliz.
- APIs externas simuladas con mocks o adaptadores falsos, nunca tests que
  dependan de credenciales reales de WhatsApp/Telegram/OpenAI en CI.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from `apps/web` or `apps/site`; in this monorepo the `next` package is not visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
