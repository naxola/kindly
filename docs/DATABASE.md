# DATABASE.md — Modelo de datos

PostgreSQL + pgvector. Drizzle ORM. Este documento describe el modelo
conceptual; la estructura exacta de columnas/índices puede evolucionar
durante la implementación (se actualiza este archivo cuando cambie, no se
deja desincronizado del código).

No crear tablas solo por anticipar funcionalidades futuras (sección 45 del
encargo original).

## 1. Tablas núcleo (mínimo inicial)

```
users
organizations
organization_members

contacts

messaging_accounts

conversations
messages

cases
conversation_cases
tasks

activities

documents
document_versions
knowledge_chunks

ai_suggestions
ai_sources

webhook_events
```

## 2. Tenancy

Toda tabla con datos propios de una organización lleva `organization_id`
explícito (no depender solo de joins indirectos). Preparado para PostgreSQL
Row Level Security (RLS) cuando sea apropiado. Ver `docs/ARCHITECTURE.md`
sección 3 y `docs/DECISIONS.md`.

## 3. Users, Organizations, OrganizationMembers

- `User`: persona que puede iniciar sesión en Kindly.
- `Organization`: tenant.
- `OrganizationMember`: relaciona `User` con `Organization` y le asigna un
  rol: `ADMIN` o `DELEGATE`.

**Implementado en PKG-001** (`src/modules/auth/schema.ts`,
`src/modules/organizations/schema.ts`):

- `users` (tabla `users`, en plural): la gestiona Better Auth (login,
  sesión). Columnas: `id`, `name`, `email` (único), `email_verified`,
  `image`, `created_at`, `updated_at`. Better Auth también crea `sessions`,
  `accounts` (guarda el hash de contraseña del proveedor `credential`) y
  `verifications` — infraestructura de auth, no entidades de negocio, por
  eso no aparecen en la lista de tablas núcleo de la sección 45.
  Decisión de no usar el plugin `organization` de Better Auth para
  `organizations`/`organization_members` registrada en `docs/DECISIONS.md`.
- `organizations`: `id` (uuid), `name`, `created_at`, `updated_at`.
- `organization_members`: `id` (uuid), `organization_id` → `organizations.id`
  (`ON DELETE CASCADE`), `user_id` → `users.id` (`ON DELETE CASCADE`), `role`
  (enum Postgres `organization_role`: `ADMIN` | `DELEGATE`), `created_at`,
  `updated_at`. Restricción `UNIQUE(organization_id, user_id)`: un usuario no
  puede pertenecer dos veces a la misma organización.

## 4. Contact

Persona con la que la organización tiene una relación. No tiene login. Puede
tener varias `Conversation`, varios `Case`, y ser atendido por distintos
`DELEGATE`. Teléfono en E.164 cuando exista, pero no como identificador
técnico de integración (ver sección 6).

## 5. MessagingAccount

Representa la identidad de comunicación de un `DELEGATE` en un canal
concreto (su número de WhatsApp, su cuenta de Telegram).

Campos iniciales:

```
id
organization_id
delegate_id
channel                          -- 'whatsapp' | 'telegram' (preparado para 'email', 'sms', ...)
phone_e164
external_account_id
external_business_account_id
external_connection_id
display_name
status
metadata
credentials_reference            -- referencia a almacén seguro, nunca el secreto en claro
connected_at
disconnected_at
last_sync_at
last_error
created_at
updated_at
```

Estados (`status`):

```
PENDING
CONNECTING
CONNECTED
DEGRADED
DISCONNECTED
REVOKED
ERROR
```

No asumir que todos los proveedores usan el mismo modelo de identidad — los
campos `external_*` guardan literalmente lo que da cada plataforma (para
Telegram: `business_connection_id`, `telegram_user_id`; para WhatsApp:
`external_business_account_id` = WABA id, `external_account_id` = phone
number id de Cloud API). Detalle por proveedor en `docs/INTEGRATIONS.md`.

## 6. Identidad técnica vs. teléfono

`phone_e164` nunca es la clave técnica de una integración. La identidad
técnica es siempre el identificador que da el proveedor
(`external_account_id`, `external_connection_id`,
`external_business_account_id`, `telegram_user_id`,
`business_connection_id`). Cambiar el teléfono mostrado no debe tocar estos
campos.

## 7. Conversation

Conversación concreta entre un `Contact` y una identidad de comunicación
(`MessagingAccount`) concreta.

```
id
organization_id
messaging_account_id
contact_id
channel
external_conversation_id
created_at
updated_at
```

Restricción:

```sql
UNIQUE (messaging_account_id, external_conversation_id)
```

Esta combinación identifica técnicamente una conversación externa.

## 8. Message

```
id
organization_id
conversation_id
messaging_account_id
external_message_id
external_chat_id
direction                 -- INBOUND | OUTBOUND
delivery_status           -- PENDING | SENT | DELIVERED | READ | FAILED
edited_at
deleted_at
raw_event_reference
created_at
updated_at
```

Idempotencia: los identificadores externos (`external_message_id` +
`messaging_account_id`) garantizan que un mismo webhook recibido dos veces
nunca crea dos `Message`. Ver `docs/ARCHITECTURE.md` sección 7.

## 9. Case

```
id
organization_id
contact_id
title
description
status                    -- OPEN | IN_PROGRESS | WAITING | RESOLVED | CLOSED
priority
assigned_to
created_at
updated_at
closed_at
```

Sin workflow complejo en el MVP.

## 10. conversation_cases

Tabla intermedia N:M entre `Conversation` y `Case` (un Contact puede tener
varios Cases; un Case puede tocar varias Conversations).

```
conversation_id
case_id
created_at
```

## 11. Task

Relacionable con `Contact`, `Conversation`, `Case` y `User`. Sin campos
cerrados en este documento salvo los evidentes (título, descripción, estado,
fecha límite, asignado). La AI puede sugerir tareas; no se auto-crean sin
revisión salvo que se decida lo contrario explícitamente.

## 12. Activity

Historial de actividad, tipos mínimos:

```
MESSAGE_RECEIVED
MESSAGE_SENT
CASE_CREATED
CASE_ASSIGNED
TASK_CREATED
TASK_COMPLETED
AI_SUGGESTION_GENERATED
AI_SUGGESTION_ACCEPTED
AI_SUGGESTION_EDITED
AI_SUGGESTION_REJECTED
CHANNEL_CONNECTED
CHANNEL_DISCONNECTED
```

## 13. Document / DocumentVersion

Conocimiento versionado. Separación estricta entre:

```
GLOBAL / PLATFORM KNOWLEDGE      (público: leyes, reglamentos, guías oficiales)
ORGANIZATION PRIVATE KNOWLEDGE   (privado por organization_id)
```

Una organización nunca recupera conocimiento privado de otra.

`DocumentVersion`:

```
effective_from
effective_until
status            -- CURRENT | REPEALED | SUPERSEDED | DRAFT | HISTORICAL
version
source
jurisdiction
territory
scope
```

El versionado permite responder correctamente preguntas sobre situaciones
pasadas cuando la norma vigente hoy no es la aplicable en la fecha relevante
(version-aware retrieval, ver sección 15).

## 14. KnowledgeChunk

División semántica de los documentos — no solo por número de caracteres.
Cuando sea posible, se conserva la jerarquía real del documento: Chapter,
Section, Article, Paragraph, Fragment, con sus metadatos. Cada chunk mantiene
relación con su `Document` y `DocumentVersion` de origen.

## 15. Hard filters en RAG (antes de relevancia semántica)

Como mínimo, siempre antes de calcular similitud:

```
organization_id
visibility
legal_status
effective_from
effective_until
jurisdiction
territory
scope
```

Nunca se recupera un documento solo porque semánticamente parece relevante si
pertenece a otra `Organization` o está fuera del periodo de vigencia
aplicable. No basta con `is_current = true`: la recuperación debe poder
seleccionar la versión aplicable a una fecha relevante concreta usando
`effective_from`/`effective_until`.

## 16. AISuggestion / AISource

```ts
interface AISuggestion {
  issue: string;
  suggestedReply: string;
  evidenceLevel: EvidenceLevel;   // SUFFICIENT | PARTIAL | INSUFFICIENT
  sources: AISource[];
  warnings: string[];
  missingInformation: string[];
}
```

`AISource` debe permitir identificar: Document, DocumentVersion, Article,
Section, Fragment, Source — de forma que el frontend pueda mostrar "Fuente:
documento X → versión Y → artículo Z" y abrir el fragmento correspondiente.

## 17. WebhookEvent

Guarda eventos externos crudos para idempotencia, debugging, auditoría,
reintentos y trazabilidad. Referencia al evento original vía
`raw_event_reference`, sin exponer información sensible innecesaria en logs.

## 18. Auditoría — qué se debe poder reconstruir

Para acciones importantes: quién, qué, cuándo, en qué organización, sobre qué
recurso. Especialmente: cambios de permisos, conexión/desconexión de canales,
envío de mensajes, modificaciones de Case, cambios de documentos, AI
suggestions y su aceptación/edición/rechazo.

Para auditabilidad de la AI (sección 67 del encargo original): qué
pregunta/contexto recibió, qué fuentes recuperó, qué respuesta generó, qué
hizo el profesional con ella — sin necesariamente guardar de forma
indiscriminada todos los prompts completos si eso crea riesgo de privacidad.
La política exacta de retención se registra en `docs/DECISIONS.md` cuando se
defina.
