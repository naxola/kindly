# 0013 — Desacoplar la plantilla del framework web (Next.js)

**Estado:** Pospuesto (2026-11-12). El usuario decidió, de momento, no desacoplar la plantilla
de Next.js; la plantilla se etiqueta `v1.0.0` con Next.js 16. El ADR queda como referencia por
si cambia de opinión: no se implementa ni el nivel 1 ni el 2 sin una nueva validación.

## Contexto

La app (`apps/web`) y la web pública (`apps/site`) están hechas con Next.js 16 (ADR 0001 y
0007). En la práctica, Next aporta poco a la plantilla:

- **La app** está entera detrás del login: no necesita que un buscador indexe sus pantallas
  ni que el servidor pinte HTML. Los datos se cargan en el navegador con TanStack Query desde
  la API, como en una aplicación de una sola página (SPA).
- **La API** ya no está escrita en Next: es Hono, montado dentro de un route handler.
- **La web pública** se genera en estático al compilar.

En cambio, depender de Next tiene un coste:

- Cambia mucho entre versiones (kindly lleva un aviso «This is NOT the Next.js you know»).
- Está orientado a Vercel.
- En 2026 ha tenido vulnerabilidades críticas de ejecución remota de código (ADR 0009), que
  obligan a actualizar todos los productos con prisa.

El usuario quiere poder cambiar de tecnología en el futuro con el menor coste posible, como
hace n8n (backend Node + interfaz SPA, sin Next).

### Inventario de dependencias de Next (2026-11-09)

| Dónde                                                             | Qué depende de Next                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/core`, `database`, `adapters`, `content`, `apps/worker` | **Nada**                                                                                    |
| `packages/ui` (sistema de diseño y shell)                         | **Nada**: el enlace se recibe como parámetro (`LinkComponent`)                              |
| `apps/web/src/server/api` (API Hono)                              | **Nada**, salvo el route handler que la monta                                               |
| `apps/web/src/app` (páginas y layouts)                            | Enrutado por carpetas, `redirect`, `generateMetadata`, `next/font`, `instrumentation.ts`    |
| `apps/web/src/server/viewer.ts`                                   | Sesión leída en el servidor con `next/headers` para redirigir antes de pintar               |
| `apps/web/src/features` y `components` (11 archivos)              | `next/navigation` (`useRouter`, `usePathname`, `useSearchParams`), `next/link`, `next-intl` |
| `apps/site`                                                       | Todo: páginas, `next-intl`, `next/og` (imágenes sociales), `next/script`                    |

La lógica de negocio, la base de datos, el worker y los cobros ya son independientes. Lo atado
a Next es la **capa de presentación**, y dentro de ella, sobre todo tres cosas: **navegación,
traducción y sesión en el servidor**.

## Decisión propuesta

Dos niveles, que se validan por separado.

### Nivel 1 — Desacoplar sin cambiar de tecnología (recomendado ya)

Que **cambiar de framework sea un trabajo mecánico y acotado**, aunque hoy sigamos con Next:

1. **Puertos de presentación** en `apps/web/src/platform/`, la única carpeta de las pantallas
   que puede importar de Next:
   - `navigation.ts`: `useNavigate()`, `useLocation()`, `useSearchParam()`, `Link`.
   - `i18n.ts`: `useT()`, `useFormat()` y la carga de mensajes.
   - `theme.ts`: el cambio de tema claro u oscuro.

   Las pantallas (`features/`) y los componentes (`components/`) solo importan de
   `platform/`, de `@saas/ui` y del cliente de la API. Cambiar de framework = reescribir
   `platform/` y las páginas, no las pantallas.

2. **Páginas finas**: cada archivo de `app/` solo monta una pantalla de `features/` y declara
   su título. Ninguna lógica en las páginas.
3. **Protección de rutas en un solo sitio**: las redirecciones (sin sesión → login; sin
   organización → onboarding; sin permiso) en un único guardián que lee `GET /api/v1/me`.
   Hoy viven en layouts de Next.
4. **API ejecutable sola**: `apps/web/src/server/api/server.ts` arranca la misma API con el
   servidor Node de Hono, sin Next. Los tests de integración ya la ejercitan así
   (`api.request`). Next solo le pasa las peticiones.
5. **Regla automática**: el script de fronteras (`scripts/check-boundaries.ts`) prohíbe
   importar `next`, `next/*` y `next-intl` fuera de `apps/web/src/app`,
   `apps/web/src/platform` y `apps/site`. Una dependencia nueva de Next en una pantalla
   rompe el `lint`.
6. **Nada del framework en la configuración**: las variables se leen al arrancar (ya es así,
   ADR 0006); ninguna `NEXT_PUBLIC_*`. Lo que el navegador necesita lo da la API (ya se hace
   con el token de Paddle).
7. **Tests independientes del framework**: los de integración van contra la API y los E2E
   contra URLs, textos y roles (ya es así). Se mantienen al migrar y son la red de seguridad.

Coste estimado: bajo-medio. Unos 30 archivos cambian sus imports a `platform/`, más el
guardián, el servidor de la API y la regla de fronteras. Sin cambios visibles para el usuario
final.

### Nivel 2 — Quitar Next (opcional, cuando el usuario lo decida)

Con el nivel 1 hecho, la migración sería por piezas, cada una revisable y reversible:

| Pieza        | Hoy                 | Destino                                                                   | Qué cambia                                                                            |
| ------------ | ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| API          | Hono dentro de Next | **Hono en Node** (`server.ts`)                                            | Nada en rutas, contrato ni tests                                                      |
| App          | Next.js             | **React + Vite (SPA)**, servida como estáticos por el mismo servidor Hono | `platform/` (router e i18n) y las páginas; las pantallas no                           |
| Web pública  | Next.js estático    | **Astro** (estático)                                                      | Páginas y plantillas; el contenido MDX, los textos y `site.config.ts` se reaprovechan |
| Imagen `web` | Next standalone     | Un proceso Node: API + estáticos                                          | Dockerfile más simple; mismo dominio, sin CORS ni cambios de cookies                  |

Candidatos para el nivel 2, a decidir en su momento:

- **Router**: TanStack Router (tipado, de la misma familia que TanStack Query) o React Router.
- **Traducción**: i18next o Lingui, que reaprovechan los archivos `messages/{es,en}.json`.

Diferencia visible: las redirecciones de acceso pasan al navegador. Durante un instante se ve
«cargando» en vez de llegar ya redirigido.

## Alternativas consideradas

- **Seguir con Next sin cambios**: cero coste hoy, pero cada actualización o vulnerabilidad
  toca todos los productos, y cambiar de framework más adelante obligaría a tocar todas las
  pantallas.
- **Migrar ya al nivel 2 sin pasar por el 1**: más rápido sobre el papel, pero un cambio
  grande y difícil de revisar (regla 4 de `CLAUDE.md`).
- **Express en lugar de Hono para la API**: obligaría a rehacer las rutas, los middlewares y
  la generación del contrato OpenAPI, sin ventaja funcional. Hono ya es un servidor HTTP
  ligero y estándar (Request/Response de la web) que corre en Node, Bun o Deno.
- **Otro framework «completo»** (Remix/React Router en modo framework, SvelteKit, Nuxt):
  cambia una dependencia grande por otra. Lo que se busca es no depender de ninguna.

## Impacto

- **Nivel 1**: cambio interno de la plantilla. Los productos que partan de ella heredan la
  regla de fronteras. kindly y procurement no cambian salvo que se decida aplicarlo allí.
- **Nivel 2**: cambia los ADR 0001 (apps) y 0007 (stack) en la capa de presentación, el
  Dockerfile y la guía de despliegue. La base de datos, el worker, los cobros y la API no
  cambian.
- **Riesgo**: bajo en el nivel 1 (los tests actuales lo cubren). En el nivel 2, el riesgo
  está en la navegación y el SEO de la web pública; los E2E existentes lo vigilan.

## Pendiente de decidir por el usuario

- Validar el nivel 1.
- Si se hace el nivel 2, y cuándo: antes o después de etiquetar `v1.0.0` y de crear el primer
  producto desde la plantilla.
