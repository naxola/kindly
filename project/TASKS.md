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
- [ ] PoC WhatsApp — pasos 1-14 completos según `docs/INTEGRATIONS.md`
      sección 3 (cuenta de prueba, Embedded Signup, envío/recepción en ambas
      direcciones, no duplicación, delivery/read status, ventana de 24h,
      desconexión/reconexión, estabilidad de identificadores).
- [ ] PoC WhatsApp: verificar explícitamente disponibilidad real de
      "coexistence" con WhatsApp Business App para el mercado objetivo.
- [ ] Registrar resultado de ambas PoC en `docs/DECISIONS.md` (lo hace el
      usuario, o el agente a partir de lo que el usuario reporte).
- [ ] Si WhatsApp no soporta el requisito fundamental: decisión explícita del
      usuario entre alternativas A/B/C (`docs/INTEGRATIONS.md` sección 2.2)
      antes de empezar el paquete de integración de WhatsApp.

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

## Fase 3 (resto) — Unified Inbox — candidato para `PKG-004`, sin definir

- [ ] Unified Inbox (UI): listado, filtros, no leídos, sin selección manual
      de canal al responder.
- [ ] Marcado explícito de `Contact → Unassigned` en UI y flujo para
      identificar/fusionar/asignar un remitente desconocido (el backend de
      PKG-003 ya garantiza que ningún mensaje se pierde — crea un Contact
      mínimo automáticamente — pero no expone ningún marcado de UI todavía).
- [ ] UI de conexión de canal (Embedded Signup / deep link) — PKG-003 solo
      dejó `connectMessagingAccount`/`disconnectMessagingAccount` a nivel de
      servicio.

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
