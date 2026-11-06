# 0007 — Stack base: ORM, API, auth y UI

**Estado:** Aceptado (2026-11-06)

## Decisión
| Área | Decisión |
|---|---|
| Runtime | Node 24 LTS, pnpm, TypeScript estricto, versiones exactas (se fijan en un ADR de versiones en la fase 1) |
| App | Next.js App Router |
| ORM | **Prisma** (procurement ya resuelve con él `withTenant` y RLS) |
| API | **Hono + @hono/zod-openapi** en `/api/v1`, OpenAPI generado desde los esquemas zod |
| Cliente | **TanStack Query** sobre un cliente tipado generado del OpenAPI. Sin Server Actions para lógica de negocio |
| Auth | Better Auth con tablas `auth_*` (ADR 0003) |
| UI | shadcn/ui + Radix + Tailwind, sonner, TanStack Table, react-hook-form, temas claro/oscuro |
| i18n | next-intl, es/en |
| Correo | Interfaz `EmailSender`; Resend (asíncrono, vía worker) |
| Tests | Vitest (unitarios e integración contra Postgres real) + Playwright |

## Alternativas descartadas
- **Drizzle** (kindly): migrar kindly a la plantilla sería más directo, pero
  procurement ya tiene probado el aislamiento con Prisma.
- **Server Actions** (kindly): menos código, pero ata el dominio a Next y no da
  una API reutilizable por otros clientes.

## Consecuencias
- Llevar kindly a la plantilla implica cambiar de ORM y de forma de llamar al
  servidor: se hará por partes, no como reescritura completa.
