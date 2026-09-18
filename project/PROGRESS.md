# PROGRESS.md — Estado resumido del proyecto

Última actualización: 2026-09-18.

## Resumen en una línea

`PKG-001 — Foundation`, `PKG-002 — CRM básico` y `PKG-003 — Messaging core
(backend)` completos: Next.js + PostgreSQL/Drizzle + Better Auth +
Contacts/Cases/Tasks/Activity + MessagingAccount/Conversation/Message con
webhooks idempotentes, todo con aislamiento multi-tenant real, tests y CI.
Sin paquete activo ahora mismo — `PKG-004` (Unified Inbox, UI) es el
candidato natural, sin definir todavía. La PoC de Telegram/WhatsApp sigue
aparte, tarea manual, sin fecha, y sigue sin bloquear nada de esto (Fase 0
solo bloquea `WhatsAppAdapter`/`TelegramAdapter` reales).

## Estado por fase / paquete

| Fase / Paquete | Nombre | Tipo | Estado |
|---|---|---|---|
| Fase 0 | Validación técnica (PoC WhatsApp/Telegram) | Manual (usuario) | 🟡 Pendiente, sin fecha — no bloquea el desarrollo de código |
| **PKG-001** | **Foundation** | Código (agente) | 🟢 **Completo** (2026-09-18) |
| **PKG-002** | **CRM básico** | Código (agente) | 🟢 **Completo** (2026-09-18), ver `CURRENT_TASK.md` |
| **PKG-003** | **Messaging core (backend, sin UI)** | Código (agente) | 🟢 **Completo** (2026-09-18), ver `CURRENT_TASK.md` |
| PKG-004 | Por definir (candidato: Unified Inbox, UI) | Código (agente) | ⚪ Sin definir — pendiente de decisión del usuario |
| Fase 4 | Telegram | Código (futuro paquete) | ⚪ No iniciada |
| Fase 5 | WhatsApp | Código (futuro paquete, bloqueado por resultado de Fase 0) | ⚪ No iniciada |
| Fase 6 | Cases (lifecycle avanzado) | Código (futuro paquete) | ⚪ No iniciada |
| Fase 7 | Knowledge | Código (futuro paquete) | ⚪ No iniciada |
| Fase 8 | AI | Código (futuro paquete) | ⚪ No iniciada |

Leyenda: 🔴 activo · 🟡 pendiente/manual · 🟢 completo · ⚪ no iniciado.

Nota sobre numeración: `PKG-001` = antigua "Fase 1 — Foundation", `PKG-002` =
antigua "Fase 2 — CRM" (con `Conversation`/`conversation_cases` movidas a
Messaging core, ver `docs/DECISIONS.md`). Las fases 4-8 se desglosarán en
paquetes numerados cuando corresponda. Ver `project/TASKS.md`.

## Decisiones importantes tomadas hasta ahora

Ver `docs/DECISIONS.md` para el detalle completo. Resumen:

- Estructura de documentación de contexto entre sesiones adoptada
  (`CLAUDE.md`, `docs/`, `project/`, `tests/README.md`).
- Riesgo crítico identificado y **sin resolver todavía**: la identidad de
  comunicación del delegado en WhatsApp depende de la disponibilidad real de
  "coexistence" con WhatsApp Business App, que debe verificarse con una PoC
  antes de construir el `WhatsAppAdapter`.
- UX de conexión de canales ajustada: no hay QR oficial para Telegram
  Business Bots ni para WhatsApp Cloud API; se usa autorización oficial
  (deep link para Telegram, Embedded Signup/OAuth para WhatsApp).
- **(2026-09-17, corrige la anterior)** La Fase 0 (PoC WhatsApp/Telegram) se
  desacopla del desarrollo de código: es una tarea manual del usuario, sin
  fecha, y **no bloquea** el arranque de `PKG-001 — Foundation`. El
  desarrollo de código empieza por `PKG-001`, no por la PoC. Ver
  `docs/DECISIONS.md`.
- **(2026-09-18)** `PKG-001` no usa el plugin `organization` de Better Auth
  (se hand-rolló `organizations`/`organization_members` propias) ni el
  paquete `@better-auth/cli` (deprecado en npm con arrastre de
  vulnerabilidades críticas de OAuth) — el esquema de Better Auth se verificó
  directamente contra el código fuente instalado. Detalle completo en
  `docs/DECISIONS.md`.
- **(2026-09-18)** `PKG-002`: se detectó que `Conversation` (documentada con
  una FK obligatoria a `messaging_accounts`) no podía crearse todavía —
  `MessagingAccount` es de un paquete futuro. Se movió `Conversation`,
  `conversation_cases` y `Task.conversation_id` a Messaging core. Además:
  bootstrap automático de `Organization` al registrarse (Better Auth no
  gestiona esto al no usar su plugin `organization`), `Case.priority` como
  texto libre (sin enum inventado), `Task` sin columna de estado (se deriva
  de `completed_at`), y `Activity.type` como texto libre con referencia
  polimórfica (no enum, no FK) porque esa lista crece con cada fase futura.
  Detalle completo en `docs/DECISIONS.md`.
- **(2026-09-18, fix reportado por el usuario)** Una cuenta creada antes del
  bootstrap de Organization se quedaba sin poder entrar (login correcto,
  vuelta silenciosa a `/login`). Se añadió autoreparación en
  `getCurrentOrganizationMember()`, lo que expuso una condición de carrera
  real (dos Organizations para el mismo usuario bajo peticiones
  concurrentes) corregida con `UNIQUE(user_id)` en `organization_members` +
  transacción en `bootstrapOrganizationForUser()`. Detalle completo,
  verificación y test de regresión en `docs/DECISIONS.md`.
- **(2026-09-18)** `PKG-003`: `MessagingAccount`, interfaz `MessagingAdapter`
  (dividida en `verifyWebhookSignature`/`parseWebhookEvents` en vez del
  `handleWebhook` único del pseudocódigo original), registro de adapters por
  canal (vacío en producción, sin proveedor real todavía), infraestructura
  de webhooks con idempotencia real (`after()` de Next.js en vez de
  pg-boss/Inngest, sin necesidad concreta de un worker separado todavía), y
  `Conversation`/`conversation_cases`/`Task.conversation_id` recuperadas de
  PKG-002. Mensaje de remitente desconocido crea un Contact mínimo
  automáticamente (sin fusión de duplicados). Misma condición de carrera que
  el fix de login (Contact+Conversation en transacción,
  `isPostgresUniqueViolation` extraído a `src/db/errors.ts`). Detalle
  completo en `docs/DECISIONS.md`.

## Qué falta decidir con el usuario

- Resultado de la PoC de WhatsApp: si "coexistence" no cubre el caso de uso
  real, elegir entre alternativas A (coexistence limitado, aceptar sus
  restricciones), B (número dedicado de Cloud API por delegado) o C (número
  centralizado de organización, requiere aprobación explícita porque rompe
  un principio de producto). Ver `docs/INTEGRATIONS.md` sección 2.2. Sin
  fecha, pendiente de que el usuario ejecute la PoC manualmente.
- **Alcance de `PKG-004`** — candidato natural: Unified Inbox (UI de
  listado/filtros/no leídos/composición de respuesta, marcado de
  `Contact → Unassigned`, UI de conexión de canal). No se empieza a
  programar nada de esto sin que el usuario lo confirme primero.

## Repositorio

Proyecto Next.js + TypeScript funcionando: PostgreSQL/Drizzle, Better Auth
(login/registro/sesión), CRM básico (Contacts/Cases/Tasks/Activity) y
Messaging core backend (MessagingAccount/Conversation/Message/WebhookEvent,
interfaz MessagingAdapter, endpoint de webhooks) con aislamiento multi-tenant
real, sin UI de Inbox todavía. Estructura de módulos completa
(`src/modules/{auth,organizations,contacts,conversations,messaging,cases,
tasks,knowledge,ai,audit}`, con código real en todos salvo `knowledge` y
`ai`), tests (Vitest + Playwright) y CI en GitHub Actions. Ver `README.md`
para arrancar en local.
