# PROGRESS.md — Estado resumido del proyecto

Última actualización: 2026-09-17.

## Resumen en una línea

Proyecto recién iniciado. Documentación de arquitectura y producto completa.
Cero código implementado. Próximo paso: PoC de Telegram y WhatsApp.

## Estado por fase

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Validación técnica (PoC) | 🔴 No iniciada — **activa**, ver `CURRENT_TASK.md` |
| 1 | Foundation | ⚪ No iniciada |
| 2 | CRM | ⚪ No iniciada |
| 3 | Messaging core | ⚪ No iniciada |
| 4 | Telegram | ⚪ No iniciada |
| 5 | WhatsApp | ⚪ No iniciada (bloqueada por resultado de Fase 0) |
| 6 | Cases | ⚪ No iniciada |
| 7 | Knowledge | ⚪ No iniciada |
| 8 | AI | ⚪ No iniciada |

Leyenda: 🔴 activa/bloqueante · 🟡 en progreso · 🟢 completa · ⚪ no iniciada.

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
- Prioridad de trabajo: Fase 0 (PoC) antes que el CRM, siguiendo la
  prioridad absoluta del encargo original.

## Qué falta decidir con el usuario

- Resultado de la PoC de WhatsApp: si "coexistence" no cubre el caso de uso
  real, elegir entre alternativas A (coexistence limitado, aceptar sus
  restricciones), B (número dedicado de Cloud API por delegado) o C (número
  centralizado de organización, requiere aprobación explícita porque rompe
  un principio de producto). Ver `docs/INTEGRATIONS.md` sección 2.2.
- Si Fase 1 (Foundation) arranca en paralelo a la PoC de WhatsApp o se
  espera al resultado antes de tocar el modelo de datos de mensajería.

## Repositorio

Sin commits todavía. Estructura de carpetas creada:
`CLAUDE.md`, `docs/{PRODUCT,ARCHITECTURE,DATABASE,INTEGRATIONS,DECISIONS}.md`,
`project/{TASKS,CURRENT_TASK,PROGRESS}.md`, `tests/README.md`, `src/`
(vacío, pendiente de Fase 1).
