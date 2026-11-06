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

Las fases siguientes añaden sus dependencias a esta tabla con el mismo criterio
(Next, Better Auth, Hono, pg-boss…), partiendo de las versiones de procurement.

## Desviación respecto a procurement

Los ids UUID v7 los genera la aplicación (`@default(uuid(7))` de Prisma), no la
función `uuidv7()` de Postgres 18. Así la plantilla no depende de una versión
concreta de Postgres (por ejemplo, si un producto usa un Postgres gestionado más antiguo).
