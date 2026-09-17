# TASKS.md — Backlog por fases

Backlog completo. El paquete activo siempre se refleja en
`project/CURRENT_TASK.md`; este archivo es la vista de conjunto. Se marca
`[x]` al completar y no se borran tareas completadas (sirve de historial
rápido junto con Git).

## Fase 0 — Validación técnica (PoC)

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
- [ ] PoC WhatsApp — pasos 1-14 completos según `docs/INTEGRATIONS.md`
      sección 3 (cuenta de prueba, Embedded Signup, envío/recepción en ambas
      direcciones, no duplicación, delivery/read status, ventana de 24h,
      desconexión/reconexión, estabilidad de identificadores).
- [ ] PoC WhatsApp: verificar explícitamente disponibilidad real de
      "coexistence" con WhatsApp Business App para el mercado objetivo.
- [ ] Registrar resultado de ambas PoC en `docs/DECISIONS.md`.
- [ ] Si WhatsApp no soporta el requisito fundamental: decisión explícita del
      usuario entre alternativas A/B/C (`docs/INTEGRATIONS.md` sección 2.2)
      antes de continuar a Fase 5.

## Fase 1 — Foundation

- [ ] Setup Next.js + TypeScript + Tailwind + shadcn/ui.
- [ ] Setup PostgreSQL + pgvector (Docker Compose local).
- [ ] Setup Drizzle ORM + migraciones.
- [ ] Better Auth: login, sesión.
- [ ] Entidades: `User`, `Organization`, `OrganizationMember`.
- [ ] Aislamiento multi-tenant: middleware/helper que exige
      `organization_id` en toda query; evaluar RLS.
- [ ] Roles `ADMIN` / `DELEGATE` y permisos base.
- [ ] UI base (layout, navegación, autenticación).
- [ ] Logging estructurado + Sentry + OpenTelemetry básico.
- [ ] Infraestructura de testing (Vitest, Playwright, CI en GitHub Actions).

## Fase 2 — CRM

- [ ] Entidad `Contact` (CRUD, formato E.164, sin identidad técnica en
      teléfono).
- [ ] Entidad `Conversation` (sin canales reales todavía, estructura base).
- [ ] Entidad `Case` + `conversation_cases` (N:M).
- [ ] Entidad `Task` relacionable con Contact/Conversation/Case/User.
- [ ] `Activity` (historial) con los tipos definidos en `docs/DATABASE.md`.
- [ ] UI: Contacts, Cases, Tasks (listados y detalle básicos).

## Fase 3 — Messaging core

- [ ] Entidad `MessagingAccount` con estados y campos completos.
- [ ] Interfaz `MessagingAdapter` (sin implementación de proveedor todavía).
- [ ] Infraestructura de webhooks: endpoint, validación de firma,
      `WebhookEvent`, respuesta 200 inmediata, cola async.
- [ ] Pipeline de normalización: MessagingAccount → Contact → Conversation →
      Message, con idempotencia garantizada por identificadores externos.
- [ ] Envío saliente genérico (contra la interfaz `MessagingAdapter`).
- [ ] Unified Inbox (UI): listado, filtros, no leídos, sin selección manual
      de canal al responder.
- [ ] Manejo de `Contact → Unassigned` para remitentes desconocidos.

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

## Fase 5 — WhatsApp (solo tras cerrar Fase 0 con decisión registrada)

- [ ] `WhatsAppAdapter` implementando `MessagingAdapter` sobre Cloud API,
      según la alternativa (A/B/C) decidida en `docs/DECISIONS.md`.
- [ ] Embedded Signup para conexión de WABA/número.
- [ ] Manejo de ventana de 24h y plantillas en la UI de composición.
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
