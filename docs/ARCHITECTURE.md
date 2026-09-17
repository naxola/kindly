# ARCHITECTURE.md — Cómo está construido Kindly

## 1. Forma general: modular monolith + worker

Kindly es un **modular monolith** (Next.js) más un **worker** para trabajo en
background. No microservicios. No Kubernetes. Ver sección 8 para la lista
completa de lo que no se construye todavía y por qué.

```
                    ┌─────────────────┐
                    │     Next.js     │
                    │      App        │
                    └────────┬────────┘
                             │
                 ┌───────────┴───────────┐
                 │                       │
          ┌──────▼──────┐         ┌──────▼──────┐
          │ PostgreSQL  │         │    Redis    │
          │ + pgvector  │         │  (opcional) │
          └─────────────┘         └─────────────┘

                    ┌─────────────────┐
                    │     Worker      │
                    │ Webhooks / Jobs │
                    └─────────────────┘

                    ┌─────────────────┐
                    │ Object Storage  │
                    │  (S3-compatible)│
                    └─────────────────┘

External Providers:
   WhatsApp   Telegram
        ↕
   MessagingAdapters
```

Diagrama conceptual completo de capas:

```
                         Kindly (Next.js)
        ┌─────────────────────────────────────────┐
        │  CRM: Inbox · Contacts · Conversations   │
        │        Cases · Tasks                     │
        │  Knowledge · AI Copilot                  │
        └────────────────────┬──────────────────────┘
                              │
                   Application Services
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
 Messaging Adapters     Knowledge / RAG        AI Providers
        │                     │
   WhatsApp / Telegram   PostgreSQL + pgvector
```

## 2. Módulos (backend)

```
app/
  modules/
    auth/
    organizations/
    contacts/
    conversations/
    messaging/
    cases/
    tasks/
    knowledge/
    ai/
    audit/
```

Cada módulo separa capas internamente:

```
Route → Application Service → Domain Logic → Repository / Adapter
```

No poner lógica de dominio en los route handlers. El dominio no debe conocer
detalles específicos de WhatsApp o Telegram (aislamiento de proveedor, ver
`MessagingAdapter` más abajo).

## 3. Multi-tenancy

Entidad raíz: `Organization`. Todo dato pertenece explícitamente a una
organización vía `organization_id` en la tabla (no solo por joins indirectos).
Preparado para usar PostgreSQL Row Level Security (RLS) cuando sea apropiado,
como defensa adicional además del filtrado explícito en la capa de
aplicación. Nunca debe ser posible acceder, ni por accidente, a datos de otra
`Organization` — esto incluye al RAG (ver `docs/DATABASE.md` sección de hard
filters).

## 4. MessagingAdapter — abstracción de mensajería

El CRM nunca llama directamente a las APIs de los proveedores. Toda
integración pasa por esta interfaz:

```ts
interface MessagingAdapter {
  connectAccount(input: ConnectAccountInput): Promise<ConnectionResult>;
  disconnectAccount(account: MessagingAccount): Promise<void>;
  getConnectionStatus(account: MessagingAccount): Promise<ConnectionStatus>;
  sendMessage(
    account: MessagingAccount,
    conversation: Conversation,
    message: OutboundMessage
  ): Promise<SendResult>;
  handleWebhook(payload: unknown): Promise<WebhookResult>;
}
```

Implementaciones iniciales: `WhatsAppAdapter`, `TelegramAdapter`. Preparado
para añadir `EmailAdapter`, `SMSAdapter` sin tocar el núcleo del CRM. Reglas
detalladas de cada proveedor en `docs/INTEGRATIONS.md`.

## 5. Identidad técnica frente a número de teléfono

`phone_e164` nunca es el identificador técnico principal de una integración
(el teléfono puede cambiar). La integración usa siempre los identificadores
que da el proveedor: `external_account_id`, `external_connection_id`,
`external_business_account_id`, `telegram_user_id`,
`business_connection_id`, etc. Cambiar `phone_e164` en un `MessagingAccount`
nunca debe alterar artificialmente la identidad externa — se guardan por
separado.

## 6. Sincronización bidireccional

```
Mobile App → Messaging Provider → Webhook → Kindly
Kindly → Messaging Provider → Mobile App
```

La conversación canónica vive en Kindly; los proveedores externos mantienen
su propio estado operativo. Cada mensaje debe poder determinar: de qué
`MessagingAccount` procede, a qué `Conversation` pertenece, su
`external_message_id`, su dirección y su estado.

## 7. Webhooks

Pipeline de procesamiento (nunca hacer trabajo pesado antes de responder al
webhook):

```
Provider → Validate signature → Persist raw event (WebhookEvent)
→ Return HTTP 200 → Async processing (worker) → Normalize event
→ Find MessagingAccount → Find/Create Contact → Find/Create Conversation
→ Create Message → Trigger downstream processing
```

Idempotencia obligatoria: la integración debe asumir webhooks duplicados,
reintentos, eventos fuera de orden, mensajes editados/eliminados,
reconexiones y eventos parcialmente repetidos. Se garantiza usando los
identificadores externos (`external_message_id`, etc.) — nunca se crea un
segundo `Message` por un webhook repetido.

## 8. Background jobs

Worker (pg-boss o Inngest) para: procesamiento de webhooks, generación de
embeddings, indexación, generación de summaries, tareas de AI,
sincronizaciones y cualquier operación lenta. Nunca bloquear un request HTTP
con trabajo pesado.

## 9. RAG y conocimiento

Stack inicial, sin infraestructura adicional:

```
PostgreSQL + pgvector + PostgreSQL Full Text Search
```

Recuperación híbrida: semantic search + full text search. No se introduce
Elasticsearch, OpenSearch ni una base vectorial externa mientras no exista una
necesidad real y documentada. Detalle de hard filters, chunking y
version-aware retrieval en `docs/DATABASE.md`.

## 10. AI — abstracción de proveedor

El dominio no se acopla a un proveedor concreto de LLM/embeddings:

```
LLMProvider
EmbeddingProvider
```

OpenAI como proveedor inicial, pero el código debe permitir cambiar de
proveedor sin reescribir la aplicación. La salida de la AI siempre es
estructurada (`AISuggestion` con `issue`, `suggestedReply`, `evidenceLevel`,
`sources`, `warnings`, `missingInformation`) — nunca se depende de parsear
texto libre.

No se envía ciegamente todo el historial de una conversación al modelo. El
contexto se construye a partir de: mensajes recientes, resumen de la
conversación, Contact, Case, tareas, documentos relevantes, normativa
relevante y conocimiento de la organización — controlando coste, tokens,
privacidad y relevancia.

## 11. Frontend

Navegación principal: Inbox, Contacts, Cases, Tasks, Knowledge, AI,
Analytics, Administration. Pantalla inicial: **Inbox**, porque la
comunicación es el centro del producto.

Vista de conversación:

- Panel central: mensajes, composición de respuesta, estado, archivos.
- Panel lateral: Contact, datos relevantes, Cases, Tasks, historial.
- AI Copilot: issue, suggested response, sources, evidence level, warnings,
  missing information; con acciones Accept / Edit / Reject antes de enviar.

Principio de UX: minimizar decisiones técnicas innecesarias. Por ejemplo, no
se pide elegir canal al responder si la conversación ya lo determina — la
complejidad técnica queda detrás de la interfaz
(`Conversation → MessagingAccount → Adapter → Send`).

## 12. Observability

Toda operación relevante debe poder rastrearse con `trace_id`, `request_id`,
`organization_id`, `user_id`. Structured logging + Sentry + OpenTelemetry.
Nunca secretos ni contenido sensible innecesario en logs.

## 13. Stack de referencia

```
Next.js, TypeScript, React, Tailwind CSS, shadcn/ui
PostgreSQL, pgvector
Drizzle ORM
Better Auth
pg-boss / Inngest
Redis (opcional)
S3-compatible storage (p. ej. Cloudflare R2)
LLM Provider abstraction / Embedding Provider abstraction (OpenAI inicial)
Sentry, OpenTelemetry
Vitest, Playwright
Docker, GitHub Actions
```

Redis solo se introduce cuando exista una necesidad concreta (caching, rate
limiting, coordination), no de entrada.

## 14. Qué no construir todavía

Microservicios, Kubernetes, Elasticsearch, OpenSearch, vector database
externa, apps móviles nativas, respuestas automáticas de la AI, motor de
workflows complejo, billing avanzado, analítica avanzada, sistemas de
permisos elaborados más allá de ADMIN/DELEGATE, decenas de proveedores de
mensajería, integraciones no oficiales de WhatsApp.

Razón: la prioridad es validar las integraciones de mensajería y construir el
CRM alrededor de capacidades reales, no anticipar escala o funcionalidades
que todavía no tienen usuarios reales detrás. La arquitectura modular deja
espacio para separar en servicios más adelante si hay una razón real para
ello, pero eso no es una decisión que se tome hoy.

## 15. Fases de desarrollo (resumen — detalle en project/TASKS.md)

```
Phase 0 — Validación técnica (PoC Telegram y WhatsApp)
Phase 1 — Foundation (auth, organizations, tenant isolation)
Phase 2 — CRM (Contacts, Conversations, Cases, Tasks)
Phase 3 — Messaging core (MessagingAccount, Adapter, webhooks, inbox)
Phase 4 — Telegram (TelegramAdapter)
Phase 5 — WhatsApp (WhatsAppAdapter, solo tras superar la PoC)
Phase 6 — Cases (lifecycle, assignment, activity history)
Phase 7 — Knowledge (Documents, versions, chunks, hybrid retrieval)
Phase 8 — AI (Copilot, RAG, EvidenceLevel, citations, auditability)
```

## 16. Principios de ingeniería

Simplicidad (no infraestructura porque sea interesante), explicitness (código
fácil de leer), type safety (TypeScript estricto), separación de capas (UI /
Application / Domain / Infrastructure / External providers), aislamiento de
proveedor (el dominio no conoce WhatsApp/Telegram), testability (servicios
probables sin depender de APIs externas), observability, y seguridad desde el
diseño (aislamiento de tenants presente desde el primer commit).
