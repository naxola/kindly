# TASKS.md — Backlog por fases y paquetes

Backlog completo. El paquete activo siempre se refleja en
`project/CURRENT_TASK.md`; este archivo es la vista de conjunto. Se marca
`[x]` al completar y no se borran tareas completadas (sirve de historial
rápido junto con Git).

## Dos tipos de trabajo en este backlog

1. **Fase 0 — Validación técnica**: trabajo **manual**, no es un paquete de
   desarrollo (`PKG-XXX`), no lo ejecuta ni lo simula el agente. La ejecuta
   el usuario con sus propias cuentas y dispositivos. Ver
   `docs/DECISIONS.md` entrada "PKG-000 no existe...".
2. **Paquetes (`PKG-001`, `PKG-002`, ...)**: trabajo de código que sí
   implementa el agente, uno detrás de otro, cada uno con su definición
   completa (Objective/Scope/Non-goals/Acceptance criteria/Tests/Exit
   criteria) en `project/CURRENT_TASK.md` cuando esté activo. La numeración
   de paquetes se asigna de forma incremental a medida que se activan — no se
   predefine de antemano el contenido exacto de `PKG-002` en adelante hasta
   que `PKG-001` esté cerrado.

## Fase 0 — Validación técnica (PoC) — MANUAL, pendiente, no bloquea PKG-001

> El agente no debe ejecutar, simular, ni escribir código de producto para
> estos pasos. Puede, si se le pide explícitamente en un paquete futuro,
> construir herramientas de apoyo (p. ej. un endpoint de logging) — pero eso
> requeriría su propio paquete y una petición explícita del usuario.

- [ ] PoC Telegram: crear bot, conectar Connected Business Bot desde una
      cuenta Telegram Business real, recibir `business_connection`.
- [ ] PoC Telegram: recibir mensaje entrante real, verificar payload
      (`business_message`).
- [ ] PoC Telegram: enviar mensaje en nombre del usuario, verificar que
      aparece en su app de Telegram.
- [ ] PoC Telegram: responder desde la app de Telegram del usuario, verificar
      que el bot lo recibe.
- [ ] PoC Telegram: verificar edición/eliminación de mensajes
      (`edited_business_message`, `deleted_business_messages`).
- [ ] PoC Telegram: desconectar y reconectar, verificar estabilidad de
      `business_connection_id`.
- [x] PoC WhatsApp: verificar disponibilidad real de "coexistence" con
      WhatsApp Business App. **Confirmada el 2026-09-19** contra documentación
      oficial de Meta (disponible desde mayo 2025; Embedded Signup por defecto
      desde abril 2026). Ver `docs/DECISIONS.md`.
- [x] Decisión entre alternativas A/B/C (`docs/INTEGRATIONS.md` sección 2.2):
      **adoptada la A (coexistence)** el 2026-09-19. B y C quedan como plan de
      repliegue.
- [ ] **Bloqueante, no técnico:** alta de Kindly como **Tech Provider o
      Solution Partner de Meta**, con Cloud API activo y verificación de
      negocio válida para coexistence (Partner-Led o Meta Verified, nunca la
      clásica). Camino crítico real de la Fase 5 — sin esto no hay PoC.
- [ ] Decidir el encaje del **Meta Business Manager de la organización** con
      el número personal del delegado (control administrativo sobre un número
      personal: lectura legal/laboral). Aplazado por el usuario el 2026-09-19;
      se decide antes de abrir el paquete de Fase 5.
- [ ] PoC WhatsApp — pasos 1-14 completos según `docs/INTEGRATIONS.md`
      sección 3, ya reenfocados a coexistence (Embedded Signup v4 con
      `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, las tres suscripciones de
      webhook, sincronización de historial dentro del plazo de 24 h, no
      duplicación de ecos, ventana de 24 h, desconexión desde el móvil con
      `PARTNER_REMOVED`, países no soportados y throughput real).
- [ ] Registrar resultado de la PoC de Telegram en `docs/DECISIONS.md` (lo
      hace el usuario, o el agente a partir de lo que el usuario reporte).

## PKG-001 — Foundation (cerrado el 2026-09-18)

Base técnica del proyecto únicamente. Sin CRM, sin Messaging, sin
WhatsApp/Telegram, sin Knowledge, sin AI. Definición completa en
`project/CURRENT_TASK.md`. Resumen:

- [x] Inicializar/configurar Next.js + TypeScript (si no existe ya).
- [x] Configurar la estructura de módulos del modular monolith
      (`docs/ARCHITECTURE.md` sección 2).
- [x] Configurar PostgreSQL + Drizzle ORM (conexión, migraciones).
- [x] Configurar infraestructura de testing (Vitest, más Playwright para el
      E2E de PKG-001).
- [x] Configurar lint y typecheck.
- [x] Configurar estructura inicial de `src/`.
- [x] Preparar configuración de desarrollo local (Docker Compose para
      PostgreSQL, variables de entorno de ejemplo).
- [x] Configurar GitHub Actions (lint + typecheck + test + build + e2e en
      cada push/PR contra `main`).
- [x] Crear únicamente las tablas/modelos estrictamente necesarios para
      Foundation (`users`, `organizations`, `organization_members`), sin
      lógica de negocio de CRM/Messaging/Knowledge/AI.
- [x] Configurar Better Auth (login/registro con email+contraseña, sesión en
      PostgreSQL vía Drizzle) mapeado a la tabla `users` documentada, con una
      página mínima de login/registro y una ruta protegida de prueba.

Ver `docs/DECISIONS.md` (entradas del 2026-09-18) para las decisiones
técnicas no triviales tomadas durante la implementación.

## PKG-002 — CRM básico (cerrado el 2026-09-18)

Contacts, Cases, Tasks y Activity, con aislamiento multi-tenant real y UI
mínima. **`Conversation` y `conversation_cases` se movieron a Messaging core**
(ver contradicción documentada en `project/CURRENT_TASK.md`: dependen de
`MessagingAccount`, que todavía no existe). Resumen:

- [x] Bootstrap automático de `Organization` + `organization_members` (rol
      `ADMIN`) al registrarse un usuario.
- [x] Entidad `Contact` (CRUD sin eliminar, formato E.164, sin identidad
      técnica en teléfono).
- [x] Entidad `Case` (CRUD sin eliminar, estado enum documentado, sin
      `conversation_cases` todavía).
- [x] Entidad `Task` relacionable con Contact/Case/User (sin
      `conversation_id` todavía; "completada" vía `completed_at`).
- [x] `Activity` (historial) con referencia polimórfica a Contact/Case/Task.
- [x] Aislamiento multi-tenant verificado con tests explícitos (integración
      y E2E).
- [x] UI: Contacts, Cases, Tasks (listados y detalle básicos) + layout
      autenticado compartido.

Ver `docs/DECISIONS.md` (entradas del 2026-09-18, bloque "PKG-002") para las
decisiones técnicas no triviales tomadas durante la implementación.

## PKG-003 — Messaging core, backend (cerrado el 2026-09-18)

Alcance elegido por el usuario: backend completo, sin UI. Definición
completa en `project/CURRENT_TASK.md`. Resumen:

- [x] Entidad `MessagingAccount` con estados y campos completos.
- [x] Interfaz `MessagingAdapter` (sin implementación de proveedor todavía;
      refinada con `verifyWebhookSignature`/`parseWebhookEvents` en vez de
      un único `handleWebhook`, ver `docs/DECISIONS.md`).
- [x] Infraestructura de webhooks: endpoint, validación de firma,
      `WebhookEvent`, respuesta 200 inmediata, procesamiento asíncrono con
      `after()` (sin pg-boss/Inngest todavía, ver `docs/DECISIONS.md`).
- [x] Entidad `Conversation` (movida aquí desde Fase 2, ver PKG-002) +
      `conversation_cases` (N:M con Case) + columna `Task.conversation_id`.
- [x] Pipeline de normalización: MessagingAccount → Contact → Conversation →
      Message, con idempotencia garantizada por identificadores externos.
- [x] Envío saliente genérico (contra la interfaz `MessagingAdapter`).

Ver `docs/DECISIONS.md` (entradas del 2026-09-18, bloque "PKG-003") para las
decisiones técnicas no triviales tomadas durante la implementación.

## PKG-004 — Unified Inbox, UI (cerrado el 2026-09-18)

Alcance elegido por el usuario: completo. Definición completa en
`project/CURRENT_TASK.md`. Resumen:

- [x] Unified Inbox (UI): listado (`/inbox`), filtros por canal y no
      leídos, sin selección manual de canal al responder.
- [x] Vista de conversación (`/inbox/[id]`): historial de mensajes,
      composición y envío de respuesta.
- [x] Marcado explícito de `Contact → Unassigned` en UI ("Marcar como
      identificado") y reasignación de la Conversation a un Contact
      existente (fusión/eliminación real del Contact original sigue fuera
      de alcance).
- [x] UI de conexión/desconexión de canal (`/channels`) contra cualquier
      adapter realmente registrado — sin campos específicos de proveedor
      todavía (no hay ninguno real).
- [x] Corregidos tres bugs pre-existentes encontrados al construirlo:
      singleton de `messaging/registry.ts` roto bajo Turbopack en
      producción, pool de conexiones de `db/client.ts` no cacheado en
      producción, rate limiting de Better Auth (solo activo en producción)
      chocando con la suite de E2E ampliada.

Ver `docs/DECISIONS.md` (entradas del 2026-09-18, bloque "PKG-004") para el
detalle completo.

## Fase 4 — Telegram

- [ ] `TelegramAdapter` implementando `MessagingAdapter` con Bot API +
      Connected Business Bots.
- [ ] Flujo de conexión: instrucciones + deep link al bot, detección de
      `business_connection`.
- [ ] Manejo de mensajes entrantes/editados/eliminados.
- [ ] Envío saliente vía `business_connection_id`.
- [ ] Acceptance test completo de la sección "Telegram acceptance test" del
      encargo original (conectar, recibir, mostrar en Inbox, responder desde
      Kindly y desde Telegram, sin duplicados, desconexión/reconexión).

## Fase 5 — WhatsApp coexistence (Alternativa A, decidida el 2026-09-19)

Bloqueada por el alta como Tech Provider de Meta (Fase 0), no por la decisión
de arquitectura, que ya está tomada. Ver `docs/DECISIONS.md` y
`docs/INTEGRATIONS.md` sección 2.2.

- [ ] `WhatsAppAdapter` implementando `MessagingAdapter` sobre Cloud API en
      modo coexistence.
- [ ] Embedded Signup **v4** (v2 se depreca el 2026-10-08) con
      `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, saltando el registro del
      número, y con session logging.
- [ ] UI de conexión: pantalla previa de advertencias (país, número en el
      Business Manager, requisito de WhatsApp Business App, historial de 180
      días, funciones que se desactivan en el móvil, coste de Cloud API).
- [ ] Tercer tipo de evento en `NormalizedInboundEvent`: saliente que Kindly
      no originó (`smb_message_echoes`), con idempotencia frente a los
      mensajes enviados desde el propio Inbox.
- [ ] Sincronización inicial de historial (`history`) dentro del plazo duro de
      24 h → primer caso de uso concreto que justifica un job en background
      reintentable (pg-boss/Inngest) en vez de `after()`.
- [ ] Sincronización de contactos (`smb_app_state_sync`) contra el modelo
      `Contact`.
- [ ] Manejo de ventana de 24h y plantillas en la UI de composición,
      incluyendo el caso contraintuitivo: un mensaje enviado desde el móvil
      del delegado no abre ni extiende la ventana de Cloud API.
- [ ] Rediseñar la desconexión en `/channels`: no hay Deregister API para
      coexistence — la inicia el delegado desde su móvil y llega como
      `account_update` / `PARTNER_REMOVED`.
- [ ] Manejo de delivery/read status vía webhooks de estado.
- [ ] Acceptance test completo (sección "WhatsApp acceptance test" del
      encargo), incluyendo verificación explícita del comportamiento de
      identidad de comunicación decidido en Fase 0.

## Fase 6 — Cases

- [ ] Ciclo de vida completo de `Case` (transiciones de estado).
- [ ] Asignación de Case a `DELEGATE`.
- [ ] Relación Case ↔ Conversation múltiple vía `conversation_cases` en UI.
- [ ] Historial de actividad ligado a Case.

## Fase 7 — Knowledge

- [ ] `Document`, `DocumentVersion` con campos de vigencia/jurisdicción.
- [ ] Separación estricta GLOBAL vs. ORGANIZATION knowledge.
- [ ] `KnowledgeChunk` con jerarquía (Chapter/Section/Article/Paragraph).
- [ ] Pipeline de embeddings (worker, `EmbeddingProvider`).
- [ ] PostgreSQL FTS + pgvector, búsqueda híbrida.
- [ ] Hard filters de tenancy/vigencia antes de ranking semántico.
- [ ] Version-aware retrieval (selección por fecha relevante, no solo
      `is_current`).
- [ ] Citations trazables en UI.

## Fase 8 — AI

- [ ] Abstracción `LLMProvider` (OpenAI inicial).
- [ ] Construcción de contexto acotado (mensajes recientes, resumen, Contact,
      Case, tareas, conocimiento relevante).
- [ ] AI Copilot: `AISuggestion` estructurado (issue, suggestedReply,
      evidenceLevel, sources, warnings, missingInformation).
- [ ] UI de Copilot en la vista de conversación (Accept / Edit / Reject).
- [ ] Auditabilidad de AI (qué recibió, qué recuperó, qué generó, qué hizo el
      profesional) con política de retención explícita.
- [ ] Garantía de que ninguna sugerencia se envía sin acción humana.

## Backlog explícitamente fuera del MVP (no planificar todavía)

Microservicios, Kubernetes, Elasticsearch/OpenSearch, vector DB externa, apps
móviles nativas, respuestas automáticas de la AI, motor de workflows
complejo, billing avanzado, analítica avanzada, más roles/permisos, más
canales de mensajería, detección/fusión automática de Contacts duplicados
(solo detección asistida manual en MVP).
