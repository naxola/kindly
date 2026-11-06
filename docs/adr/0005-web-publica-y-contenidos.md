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

## Consecuencias

- Publicar un post = commit + despliegue de `site`.
- El cambio a CMS queda acotado a `packages/content`.
