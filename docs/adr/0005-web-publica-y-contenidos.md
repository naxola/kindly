# 0005 — Web pública separada; blog en MDX, CMS más adelante

**Estado:** Aceptado (2026-11-06)

## Contexto

Cada producto necesita portada, precios, blog y páginas legales, con buen SEO,
y publicar contenido no debe afectar al SaaS.

## Decisión

- `apps/site` es una aplicación separada de `apps/web`, en su propio dominio
  (`producto.com` frente a `app.producto.com`), generada de forma estática siempre
  que sea posible. Comparte `packages/ui`.
- Blog en **MDX** dentro del repo (`apps/site/content/`), leído a través de una
  interfaz `ContentSource` en `packages/content`.
- No se desarrolla un CMS propio. Si hace falta publicar sin desplegar, programar
  entradas, publicar desde n8n o que publique alguien no técnico, se sustituye la
  implementación de `ContentSource` por **Payload CMS** autoalojado (ADR nuevo).
- Incluye: secciones reutilizables de portada, legales parametrizados, sitemap,
  RSS, imágenes Open Graph, datos estructurados, captación de newsletter que emite
  un evento de negocio, analítica y es/en.

## Implementación (fase 4c, 2026-11-06)

- Rutas por idioma (`/es/...`, `/en/...`) **prerenderizadas en estático**, sin proxy
  (`middleware`): la raíz redirige a `/es`. hreflang y canónicas en cada página.
- `packages/content`: interfaz `ContentSource` e implementación sobre archivos MDX
  (`apps/site/content/`). La cabecera se valida con zod y un error para la build
  indicando el archivo. Borradores solo en desarrollo.
- **MDX ejecuta código**: solo se renderiza contenido del repositorio, revisado como
  código. Lo que venga de un CMS o de usuarios no pasa por `renderMdx`.
- Páginas legales (privacidad, términos, cookies) como **plantillas** con los datos de
  la empresa como variables (`site.config.ts`). Mientras `legal.reviewed` sea falso
  muestran un aviso, no se indexan y no están en el sitemap. Una variable sin valor
  para la build.
- Precios desde `site.config.ts`: sin planes, la página lo dice (no hay precios inventados).
- Analítica: Plausible (sin cookies) solo si se configura `PLAUSIBLE_DOMAIN`.
- **Pendiente:** la newsletter queda fuera de la 4c hasta decidir dónde se guarda el
  consentimiento (doble opt-in propio o herramienta externa).

## Consecuencias

- Publicar un post = commit + despliegue de `site`.
- El cambio a CMS queda acotado a `packages/content`.
