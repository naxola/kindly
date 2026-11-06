# 0007 — Stack base: ORM, API, auth y UI

**Estado:** Propuesto

## Propuesta (la de procurement, salvo donde se indica)
| Área | Propuesta | Alternativa a decidir |
|---|---|---|
| Runtime | Node 24 LTS, pnpm, TypeScript estricto, versiones exactas | — |
| App | Next.js App Router | — |
| ORM | **Prisma** (procurement ya tiene `withTenant` y RLS resueltos con él) | **Drizzle** (kindly): migrar kindly a la plantilla sería más directo |
| API | Hono + zod-openapi en `/api/v1`, cliente tipado + TanStack Query | Server Actions (kindly): menos código, pero el dominio queda más atado a Next |
| Auth | Better Auth con tablas `auth_*` (ADR 0003) | — |
| UI | shadcn/ui + Radix + Tailwind, sonner, TanStack Table, react-hook-form, temas claro/oscuro | — |
| i18n | next-intl, es/en | — |
| Correo | Interfaz `EmailSender`; Resend | — |
| Tests | Vitest (unitarios e integración contra Postgres real) + Playwright | — |

## Pendiente
El usuario debe elegir ORM y estilo de API: afectan a toda la plantilla y al
coste de llevar kindly a ella.
