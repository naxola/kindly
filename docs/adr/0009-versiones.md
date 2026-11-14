# 0009 — Versiones de la fase 1

**Estado:** Aceptado (2026-11-06)

## Criterio

Se toma la **combinación ya probada en procurement** (ADR 0013 de procurement,
fijada el 2026-10-17 con el criterio «estable y publicada hace al menos 14 días»).
Funciona en conjunto y lleva semanas en uso. Versiones exactas (`save-exact=true`);
las actualizaciones siempre se revisan (ver la enmienda del final: Renovate propone, nunca fusiona).

## Runtime e infraestructura

| Componente | Versión                                  |
| ---------- | ---------------------------------------- |
| Node.js    | 24.21.0 LTS (`.node-version`, `engines`) |
| pnpm       | 10.34.6 (corepack, `packageManager`)     |
| PostgreSQL | 18.6 (`postgres:18.6-trixie`) en Docker  |

## Dependencias de la fase 1

| Paquete                                      | Versión                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| typescript                                   | 6.0.3                                                          |
| prisma / @prisma/client / @prisma/adapter-pg | 7.10.0                                                         |
| pg                                           | 8.23.1                                                         |
| zod                                          | 4.6.7 (4.6.5 tenía un aviso de seguridad, GHSA-mrhx-c7xc-m3w5) |
| uuid                                         | 14.0.2                                                         |
| turbo                                        | 2.11.7                                                         |
| vitest                                       | 5.0.3                                                          |
| eslint / typescript-eslint / @eslint/js      | 10.12.0 / 8.71.0 / 10.0.1                                      |
| prettier                                     | 3.9.9                                                          |
| tsx                                          | 4.23.15                                                        |

## Fase 2

| Paquete     | Versión |
| ----------- | ------- |
| better-auth | 1.7.7   |

## Fase 3

| Paquete            | Versión                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| pg-boss            | 12.36.0                                                                        |
| pino / pino-pretty | 10.4.0 / 13.1.3                                                                |
| resend             | 6.32.0                                                                         |
| nodemailer         | 10.2.1 (10.0.13 de procurement tiene 3 avisos moderados, corregidos en 10.1.4) |
| esbuild            | 0.28.2                                                                         |

## Fase 4a

| Paquete                                 | Versión                                                                                                                                                                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| next                                    | **16.4.3** (procurement usa 16.3.8: las versiones 16.0.0–16.4.0 tienen dos vulnerabilidades críticas de ejecución remota de código, GHSA-2464-fhr4-w9xw y GHSA-673q-mjm6-r5xr, y una alta de denegación de servicio, GHSA-p3m5-59mp-jv5r) |
| react / react-dom                       | 19.3.0                                                                                                                                                                                                                                    |
| next-intl / next-themes                 | 4.14.9 / 0.4.6                                                                                                                                                                                                                            |
| hono / @hono/zod-openapi                | 4.13.12 / 1.6.3                                                                                                                                                                                                                           |
| @tanstack/react-query                   | 5.104.1                                                                                                                                                                                                                                   |
| openapi-fetch / openapi-typescript      | 0.17.0 / 7.13.0                                                                                                                                                                                                                           |
| tailwindcss / @tailwindcss/postcss      | 4.3.3                                                                                                                                                                                                                                     |
| radix-ui / lucide-react / sonner / cmdk | 1.6.7 / 1.50.0 / 2.0.8 / 1.1.1                                                                                                                                                                                                            |
| @playwright/test                        | 1.63.0                                                                                                                                                                                                                                    |

**Criterio ante avisos de seguridad:** una corrección de seguridad crítica o alta
prevalece sobre la regla de los 14 días; se toma la versión corregida más antigua
que cumpla ese plazo, o la primera corregida si ninguna lo cumple.

## Fase 4c

| Paquete     | Versión |
| ----------- | ------- |
| @mdx-js/mdx | 3.1.1   |
| remark-gfm  | 4.0.1   |
| yaml        | 2.9.1   |
| @types/mdx  | 2.0.14  |

## Fase 5

| Paquete      | Versión                 |
| ------------ | ----------------------- |
| @sentry/node | 11.9.0 (del 2026-10-23) |

**Avisos moderados aceptados:** `@sentry/node` arrastra `@sentry/bundler-plugins`, que depende de
`glob` 13 y `minimatch` 10 (GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249). Afectan a patrones de
búsqueda de archivos controlados por un atacante; el código de la plantilla no los usa en
ejecución. La corrección exige `glob` 14 y `minimatch` 11 (versión mayor, publicadas hace menos de
14 días), así que no se fuerza con `overrides`: se revisa al actualizar Sentry. El CI solo para
con avisos altos o críticos.

Las fases siguientes añaden sus dependencias con el mismo criterio.

## Excepciones del escaneo de imágenes

Las excepciones aceptadas viven en `.trivyignore.yaml`, cada una acotada a su fichero, con su
motivo y una **fecha de caducidad**: al vencer, el escaneo vuelve a fallar y se revisa.

- **CVE-2025-68121** (crítica, `crypto/tls` de Go) en `usr/local/bin/gosu` de la imagen oficial
  `postgres:18.6-trixie`. `gosu` solo cambia de usuario al arrancar el contenedor y no abre
  conexiones TLS. Aceptada por el usuario el 2026-11-14, **caduca el 2026-12-14**. Salida prevista:
  subir a `postgres:18.7-trixie` cuando cumpla 14 días (2026-11-26) y comprobar que trae `gosu`
  recompilado.

## Enmienda (2026-11-14): actualizaciones con Renovate

Decisión D9 del usuario. `.github/renovate.json5` hace que Renovate **abra pull requests contra
`staging`**; nunca fusiona (`automerge: false`) y cada actualización pasa por el CI y por revisión.

- **Cuándo:** una ejecución semanal, el lunes antes de las 6:00 (Europa/Madrid).
- **Cómo se agrupan:** parches y menores de npm en un solo PR; acciones de GitHub e imágenes base
  en otro; **cada mayor en su propio PR**, con la etiqueta `major`. Prisma (`prisma`,
  `@prisma/client`, `@prisma/adapter-pg`), Node (`.node-version`, `Dockerfile`) y pnpm
  (`packageManager`, `Dockerfile`) se mueven siempre juntos.
- **La regla de los 14 días se mantiene:** `minimumReleaseAge: 14 days`. Los avisos de seguridad
  se saltan el calendario y esa espera, como ya fijaba el criterio de la fase 4a.
- **Versiones exactas:** `rangeStrategy: pin` (coherente con `save-exact=true`); las acciones de
  GitHub siguen fijadas por hash y se actualizan con él.
- **Límites deliberados:** Node se queda en la línea 24 LTS (un salto de mayor es decisión
  humana); un Postgres mayor no se propone (es una operación de base de datos, no un bump);
  `engines.node` se gestiona a mano con `.node-version`.
- **Cubre también** la imagen de Trivy del CI (etiqueta y digest) y la versión de pnpm del
  `Dockerfile`, que Renovate no reconoce por sí solo (gestores `regex`).
- **Para activarlo** hay que instalar la app de GitHub de Renovate en el repositorio
  (https://github.com/apps/renovate); sin ella el fichero no hace nada. Los avisos de seguridad
  de Renovate requieren además tener activadas las alertas de Dependabot del repositorio.

## Desviación respecto a procurement

Los ids UUID v7 los genera la aplicación (`@default(uuid(7))` de Prisma), no la
función `uuidv7()` de Postgres 18. Así la plantilla no depende de una versión
concreta de Postgres (por ejemplo, si un producto usa un Postgres gestionado más antiguo).
