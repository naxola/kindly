# 0009 — Versiones de la fase 1

**Estado:** Aceptado (2026-11-06)

## Criterio

Se toma la **combinación ya probada en procurement** (ADR 0013 de procurement,
fijada el 2026-10-17 con el criterio «estable y publicada hace al menos 14 días»).
Funciona en conjunto y lleva semanas en uso. Versiones exactas (`save-exact=true`);
las actualizaciones se hacen a mano y revisadas, nunca automáticas.

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

Las fases siguientes añaden sus dependencias con el mismo criterio.

## Desviación respecto a procurement

Los ids UUID v7 los genera la aplicación (`@default(uuid(7))` de Prisma), no la
función `uuidv7()` de Postgres 18. Así la plantilla no depende de una versión
concreta de Postgres (por ejemplo, si un producto usa un Postgres gestionado más antiguo).
