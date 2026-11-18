# Tests de Kindly

Definición de «terminado» en `CLAUDE.md` (sección _Testing_). Esta es la guía práctica. Los tests viven **junto al código** (no en una
carpeta aparte), salvo los E2E.

## Qué hay y dónde

| Tipo                | Dónde                                                                        | Comando                                             | Necesita                                  |
| ------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| Unitarios           | `packages/*/test/*.test.ts`, `apps/*/test/*.test.ts`, `scripts/**/*.test.ts` | `pnpm test`                                         | nada                                      |
| Integración         | `*.int.test.ts` junto al paquete                                             | `pnpm test:integration`                             | Postgres con pgvector (puerto 5441)       |
| E2E (Playwright)    | `e2e/*.spec.ts`                                                              | `pnpm test:e2e`                                     | Postgres + build de producción + Chromium |
| Contrato de la API  | `docs/api/openapi.json`                                                      | `pnpm api:generate` (el CI falla si no está al día) | —                                         |
| Fronteras y entorno | `scripts/check-boundaries.ts`, `scripts/check-env.ts`                        | `pnpm lint`, `pnpm env:check`                       | —                                         |

Antes de dar nada por hecho: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm db:check && pnpm build && pnpm test:e2e`.
`pnpm lint` ya arranca ESLint con 4 GB de memoria (con menos se quedaba sin ella).

## Qué se prueba con qué

- **Dominio puro** (reglas, filtros, validación de subidas, troceado, fusión RRF, visibilidad): unitarios.
- **Todo lo que toca PostgreSQL**: integración, **incluido el aislamiento entre organizaciones** (cada módulo tiene su «una organización no ve lo de
  otra»). `packages/database/test/rls.int.test.ts` falla si una tabla nueva no tiene RLS forzada; `knowledge-rls.int.test.ts` cubre GLOBAL.
- **La API**: `apps/web/test/*.int.test.ts` llama a `api.request` con sesiones reales (helpers en `api-helpers.ts`).
- **El worker con pg-boss real**: `apps/worker/test/worker.int.test.ts`.
- **Flujos de usuario** (bandeja, conversación, canales, conocimiento, trámites, contactos, tareas, web pública, accesibilidad): E2E del
  camino feliz **y** de lo que debe fallar visiblemente.

## Reglas

- **Nunca** credenciales reales de WhatsApp/OpenAI/Telegram ni red en CI: adaptadores y proveedores falsos (`FakeMessagingAdapter`,
  `FakeEmbeddingProvider`, `fetch` inyectado). El canal falso de E2E (`E2E_FAKE_MESSAGING_SECRET`) y los embeddings falsos
  (`E2E_FAKE_EMBEDDINGS`) **solo los pone `playwright.config.ts`** y la validación de entorno los rechaza con `APP_ENV=production`.
- El entorno de E2E **no corre worker**: los helpers (`deliverFakeMessage`, `ingestPendingKnowledge`) procesan con el mismo caso de uso.
- La base de pruebas (`saas_test`) se comparte: el conocimiento GLOBAL que dejan unas pruebas lo leen todas. Las aserciones miran **solo lo
  propio** de cada prueba (palabras únicas, filtrar por organización).
- En E2E: `press()` envía el clic como evento (para botones bajo indicadores flotantes) pero **un menú de Radix se abre con pointer down**: ahí
  `click()` real. No cerrar un panel con `Esc` si lo que se prueba es su botón de cerrar.
- Accesibilidad: `e2e/accessibility.spec.ts` (axe, claro y oscuro, 320 px). La app arranca en oscuro: el test fija el tema en `localStorage`.
- Una prueba que falla de forma intermitente es un fallo, no un «reintentar»: se investiga (tres pasadas seguidas en verde antes de darla por buena).

## Entorno local sin Docker

Postgres 16 + pgvector con el script de roles de la plantilla (`infra/postgres/init/00-roles.sh`); detalle en `project/MIGRATION.md` §8.
Node 24 y pnpm 10.34.6 vía corepack. Chromium preinstalado: `PW_CHROMIUM_PATH=/ruta/chrome pnpm test:e2e`.

La suite del código anterior (381 pruebas unitarias, integración y E2E) sigue en `legacy/tests/`; se borra a medida que se porta
(`project/MIGRATION.md`).
