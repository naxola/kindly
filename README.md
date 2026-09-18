# Kindly

CRM + bandeja unificada + AI Copilot. Ver `docs/PRODUCT.md` para la visión
completa y `CLAUDE.md` para las reglas de trabajo en este repositorio.

Estado actual: `PKG-001 — Foundation` y `PKG-002 — CRM básico` completos (ver
`project/CURRENT_TASK.md`). Hay auth, Contacts, Cases y Tasks con
aislamiento multi-tenant real. El Inbox, la mensajería (WhatsApp/Telegram) y
la AI llegan en paquetes posteriores.

## Arrancar en local

Requisitos: Node 22+, Docker.

```bash
cp .env.example .env
# Genera un secreto real:
#   openssl rand -base64 32
# y pégalo en BETTER_AUTH_SECRET dentro de .env

docker compose up -d      # PostgreSQL local (crea también kindly_test)
npm install
npm run db:migrate        # aplica las migraciones a la base `kindly`
npm run dev                # http://localhost:3000
```

## Comandos

```bash
npm run dev          # servidor de desarrollo
npm run build         # build de producción
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm test              # unit + integration (Vitest, usa kindly_test)
npm run test:e2e      # E2E (Playwright, levanta build+start solo)
npm run db:generate    # genera una migración a partir de src/db/schema.ts
npm run db:migrate     # aplica migraciones pendientes
npm run db:studio      # explorador de datos de Drizzle
```
