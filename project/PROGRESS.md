# PROGRESS.md — Estado resumido del proyecto

Última actualización: 2026-09-18.

## Resumen en una línea

`PKG-001 — Foundation` completo: Next.js + PostgreSQL/Drizzle + Better Auth
funcionando end-to-end, con tests y CI. Sin paquete activo ahora mismo —
`PKG-002` está por definir con el usuario. La PoC de Telegram/WhatsApp sigue
aparte, como tarea manual del usuario, sin fecha.

## Estado por fase / paquete

| Fase / Paquete | Nombre | Tipo | Estado |
|---|---|---|---|
| Fase 0 | Validación técnica (PoC WhatsApp/Telegram) | Manual (usuario) | 🟡 Pendiente, sin fecha — no bloquea el desarrollo de código |
| **PKG-001** | **Foundation** | Código (agente) | 🟢 **Completo** (2026-09-18), ver `CURRENT_TASK.md` |
| PKG-002 | Por definir | Código (agente) | ⚪ Sin definir — pendiente de decisión del usuario |
| Fase 2 | CRM | Código (candidato a PKG-002, sin número asignado) | ⚪ No iniciada |
| Fase 3 | Messaging core | Código (futuro paquete) | ⚪ No iniciada |
| Fase 4 | Telegram | Código (futuro paquete) | ⚪ No iniciada |
| Fase 5 | WhatsApp | Código (futuro paquete, bloqueado por resultado de Fase 0) | ⚪ No iniciada |
| Fase 6 | Cases | Código (futuro paquete) | ⚪ No iniciada |
| Fase 7 | Knowledge | Código (futuro paquete) | ⚪ No iniciada |
| Fase 8 | AI | Código (futuro paquete) | ⚪ No iniciada |

Leyenda: 🔴 activo · 🟡 pendiente/manual · 🟢 completo · ⚪ no iniciado.

Nota sobre numeración: `PKG-001` corresponde al alcance de la antigua "Fase
1 — Foundation". Las fases 2-8 se desglosarán en paquetes numerados
(`PKG-002` en adelante) cuando corresponda; su número concreto no está
asignado todavía. Ver `project/TASKS.md`.

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

## Qué falta decidir con el usuario

- Resultado de la PoC de WhatsApp: si "coexistence" no cubre el caso de uso
  real, elegir entre alternativas A (coexistence limitado, aceptar sus
  restricciones), B (número dedicado de Cloud API por delegado) o C (número
  centralizado de organización, requiere aprobación explícita porque rompe
  un principio de producto). Ver `docs/INTEGRATIONS.md` sección 2.2. Sin
  fecha, pendiente de que el usuario ejecute la PoC manualmente.
- **Alcance de `PKG-002`** — es la decisión pendiente inmediata. Candidatos
  naturales según `project/TASKS.md`: CRM básico (Contacts/Cases/Tasks) o
  adelantar Messaging core (MessagingAccount + MessagingAdapter sin
  proveedor concreto). No se empieza a programar nada de esto sin que el
  usuario lo confirme primero.

## Repositorio

Proyecto Next.js + TypeScript funcionando: PostgreSQL/Drizzle, Better Auth
(login/registro/sesión), estructura de módulos completa
(`src/modules/{auth,organizations,contacts,conversations,messaging,cases,
tasks,knowledge,ai,audit}`, solo `auth` y `organizations` con código real),
tests (Vitest + Playwright) y CI en GitHub Actions. Ver `README.md` para
arrancar en local.
