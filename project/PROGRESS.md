# PROGRESS.md — Estado resumido del proyecto

Última actualización: 2026-09-26.

## Resumen en una línea

`PKG-001 — Foundation`, `PKG-002 — CRM básico`, `PKG-003 — Messaging core
(backend)` y `PKG-004 — Unified Inbox (UI)` completos: Next.js +
PostgreSQL/Drizzle + Better Auth + Contacts/Cases/Tasks/Activity +
MessagingAccount/Conversation/Message con webhooks idempotentes + Inbox
(listado/filtros/no leídos/respuesta/identificación de Contact/conexión de
canal), todo con aislamiento multi-tenant real, tests y CI. Paquete
**`PKG-005` — WhatsApp coexistence (dominio + UI contra stub)** completo el
2026-09-20: ecos, historial, ventana de servicio y desconexión externa, todo
contra el stub. **`PKG-006` — Miembros de la organización** completo el mismo
día: invitaciones, roles reales y `/members`. **`PKG-007` — Ajustes del
delegado y estado del canal** también completo: `/channels` es ahora una
vista por delegado con la máquina de estados expuesta, y **`PKG-008` — Alta
de WhatsApp** cierra el flujo de conexión (tres vías, comprobaciones previas,
comprobación de país configurable) contra el stub. Sin paquete activo ahora
mismo: lo único que queda de WhatsApp es `PKG-009`, bloqueado por el alta
como Tech Provider de Meta y por la decisión del Business Manager. **`PKG-010`
añade el sitio público y los documentos legales** que ese alta exige; le
faltan los datos legales reales, la revisión jurídica y el despliegue. La PoC de
Telegram/WhatsApp sigue aparte, tarea manual, sin fecha, y sigue sin bloquear
nada de esto (Fase 0 solo bloquea `WhatsAppAdapter`/`TelegramAdapter` reales).
**El riesgo crítico de identidad de comunicación en WhatsApp quedó cerrado el
2026-09-19: se adopta coexistence** (ver `docs/DECISIONS.md`). **`PKG-011`**
(2026-09-25) conecta por primera vez con Meta de verdad, contra el número de
prueba y solo en staging, para validar la tubería real mientras `PKG-009`
sigue bloqueado. **`PKG-012`** (2026-09-25) añade el primer envío de email
(Resend) para recuperar la contraseña.
**Rediseño UI/UX** (2026-09-26): arranca por fases `UI-0`…`UI-9` con
`docs/ui/` como fuente de verdad. `UI-0` (auditoría + estudio de Supabase +
documentación), `UI-1` (tokens en tres capas + componentes base +
`/ui-kit`), `UI-2` (shell: header, sidebar contraíble, menú móvil,
organización/usuario en el header) y `UI-3` (Dialog, ConfirmDialog,
DiscardChangesDialog, Sheet completo, Tabs, Popover, Toast, Table,
DataList, SearchInput, FilterBar, SegmentedControl, RelativeTime)
completos; siguiente: `UI-4`, arquitectura de páginas.

## Estado por fase / paquete

| Fase / Paquete | Nombre | Tipo | Estado |
|---|---|---|---|
| Fase 0 | Validación técnica (PoC WhatsApp/Telegram) | Manual (usuario) | 🟡 Pendiente, sin fecha — no bloquea el desarrollo de código. Decisión de coexistence ya cerrada (2026-09-19); queda el alta como Tech Provider de Meta |
| **PKG-001** | **Foundation** | Código (agente) | 🟢 **Completo** (2026-09-18) |
| **PKG-002** | **CRM básico** | Código (agente) | 🟢 **Completo** (2026-09-18), ver `CURRENT_TASK.md` |
| **PKG-003** | **Messaging core (backend, sin UI)** | Código (agente) | 🟢 **Completo** (2026-09-18), ver `CURRENT_TASK.md` |
| **PKG-004** | **Unified Inbox (UI)** | Código (agente) | 🟢 **Completo** (2026-09-18), ver `CURRENT_TASK.md` |
| **PKG-005** | **WhatsApp coexistence (dominio + UI contra stub)** | Código (agente) | 🟢 **Completo** (2026-09-20), ver `CURRENT_TASK.md` |
| **PKG-006** | **Miembros de la organización (invitar delegados)** | Código (agente) | 🟢 **Completo** (2026-09-20) |
| **PKG-007** | **Ajustes del delegado y estado del canal** | Código (agente) | 🟢 **Completo** (2026-09-20) |
| **PKG-008** | **Alta de WhatsApp: elección y comprobaciones previas** | Código (agente) | 🟢 **Completo** (2026-09-20) |
| **PKG-010** | **Sitio público y documentos legales** | Código (agente) | 🟢 **Completo** (2026-09-20) — falta rellenar datos legales, revisión jurídica y despliegue |
| **PKG-011** | **WhatsApp Cloud API contra el número de prueba de Meta** | Código (agente) + prueba manual (usuario) | 🟢 **Completo** (2026-09-25) — recibir y responder validados con el móvil |
| **PKG-013** | **Conversación en vivo (optimista, checks, sondeo, escribiendo)** | Código (agente) | 🟢 **Completo** (2026-09-25) |
| **PKG-012** | **Email (Resend) y recuperación de contraseña** | Código (agente) | 🟢 **Completo** (2026-09-25) — falta `RESEND_API_KEY` en Vercel y dominio verificado |
| **UI-0** | **Rediseño UI/UX: auditoría y documentación (`docs/ui/`)** | Código (agente) | 🟢 **Completo** (2026-09-26) |
| **UI-1** | **Design system: tokens y componentes base** | Código (agente) | 🟢 **Completo** (2026-09-26) |
| **UI-2** | **Shell de aplicación (header, sidebar, menú móvil)** | Código (agente) | 🟢 **Completo** (2026-09-26) |
| **UI-3** | **Componentes avanzados (Dialog, ConfirmDialog, Table, DataList…)** | Código (agente) | 🟢 **Completo** (2026-09-26) |
| UI-4 … UI-9 | Páginas, Inbox, conversación en Sheet, organización, a11y, consolidación | Código (agente) | ⚪ No iniciadas — ver `docs/ui/ROADMAP.md` |
| PKG-009 | Embedded Signup real | Código (agente) | ⚪ Bloqueado: Tech Provider + decisión del BM |
| Fase 4 | Telegram | Código (futuro paquete) | ⚪ No iniciada |
| Fase 5 | WhatsApp coexistence | Código (futuro paquete, bloqueado por el alta como Tech Provider de Meta, no por la decisión) | ⚪ No iniciada |
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
- ~~Riesgo crítico identificado y sin resolver: la identidad de comunicación
  del delegado en WhatsApp depende de la disponibilidad real de
  "coexistence".~~ **Superado por la decisión del 2026-09-19** (ver más
  abajo).
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
- **(2026-09-18)** `PKG-004`: Unified Inbox completa (`/inbox`,
  `/inbox/[id]`, `/channels`), `Contact.is_unassigned` +
  `Conversation.last_read_at`, reasignación de Conversation a un Contact
  existente (sin fusión real). Además, tres bugs **pre-existentes**
  encontrados y corregidos, ninguno introducido por este paquete: un `Map`
  a nivel de módulo en `messaging/registry.ts` no es un singleton bajo
  Turbopack en producción (cada chunk tiene su propia instancia — corregido
  con `globalThis`); el pool de conexiones de `db/client.ts` solo se
  cacheaba fuera de producción, exactamente al revés de lo necesario bajo
  Turbopack (corregido cacheándolo siempre); y el rate limiting por defecto
  de Better Auth (activo solo en producción, nunca en `next dev`) chocaba
  con la suite de E2E ampliada (corregido con una variable de entorno que
  solo fija `playwright.config.ts`). Detalle completo, con reproducción, en
  `docs/DECISIONS.md`.
- **(2026-09-19, cierra el riesgo crítico de WhatsApp)** Se adopta
  **coexistence** (Alternativa A de `docs/INTEGRATIONS.md` sección 2.2): el
  delegado conserva su número y su WhatsApp Business App en el móvil y Kindly
  sincroniza por detrás vía Cloud API, con lo que el principio 1 de
  `CLAUDE.md` queda satisfecho sin excepciones. Verificado contra
  documentación oficial de Meta, a partir de que el usuario señalara que
  GoHighLevel ya tiene el flujo en producción. Implica: alta de Kindly como
  Tech Provider, Embedded Signup v4, tres suscripciones de webhook
  (`history`, `smb_app_state_sync`, `smb_message_echoes`), historial de 180
  días con plazo duro de 24 h, y cuatro cambios sobre diseño ya existente
  (nuevo tipo de evento para ecos de salientes, job en background real,
  ventana de 24 h que no se abre desde el móvil, y desconexión que Kindly no
  controla). Detalle completo en `docs/DECISIONS.md`.
- **(2026-09-20)** `PKG-005`, primer bloque: eco de salientes. Tipo de evento
  propio `OUTBOUND_ECHO` en `MessagingAdapter`, columna explícita
  `messages.sent_from_device` (en vez de derivar el origen de
  `source_webhook_event_id`, que impediría resolver la carrera sin destruir
  la procedencia del webhook), `sendOutboundMessage` con
  `onConflictDoUpdate` para que un eco que llega antes no se quede con la
  fila mal etiquetada, y `MESSAGE_SENT_FROM_DEVICE` como Activity propia. La
  idempotencia no necesitó nada nuevo: el `unique(messaging_account_id,
  external_message_id)` de PKG-003 ya cubre el caso. Detalle en
  `docs/DECISIONS.md`.
- **(2026-09-20)** `PKG-005` cerrado: las particularidades del proveedor se
  declaran como `MessagingChannelCapabilities` en el adapter
  (`serviceWindowHours`, `canDisconnect`) en vez de preguntar por el nombre
  del canal; la ventana de servicio se calcula **solo** sobre el último
  mensaje entrante, porque los mensajes que el delegado escribe desde su
  móvil no la reabren; el historial importado no marca conversaciones como no
  leídas ni genera una Activity por mensaje; y un canal que Kindly no puede
  desconectar lo dice en la UI en vez de ofrecer un botón imposible. Detalle
  en `docs/DECISIONS.md`.
- **(2026-09-20)** `PKG-006`: invitaciones de miembros. Hasta aquí toda
  organización tenía un único miembro ADMIN y el rol DELEGATE no lo tenía
  nadie. La invitación se vincula **por email** en el hook de registro (no por
  token arrastrado por el flujo), `ensureOrganizationForUser` es el único
  punto de entrada para "este usuario debe acabar en una organización", y el
  límite real —una persona pertenece a una sola organización, así que solo
  puede aceptar quien no tenga cuenta— se muestra como un estado propio de la
  invitación en vez de reventar durante el registro. Kindly no envía emails:
  el ADMIN copia el enlace, y la UI lo dice. Detalle en `docs/DECISIONS.md`.
- **(2026-09-20)** `PKG-007`: `/channels` pasa a ser ajustes por delegado.
  Se **retira el "conectar en nombre de"** (ningún proveedor real lo permite:
  Telegram se conecta desde la app del propio delegado y WhatsApp desde su
  login de Meta), un DELEGATE solo ve sus propias cuentas porque el canal es
  su identidad de comunicación y no la de la organización, desconectar es
  asimétrico (el ADMIN puede, para dar de baja a quien se va), y la máquina
  de estados se expone con `describeAccountStatus` en vez de imprimir el
  enum en crudo. Detalle en `docs/DECISIONS.md`.
- **(2026-09-20)** `PKG-008`: flujo de alta de WhatsApp contra el stub. El
  onboarding lo **declara el adapter** (`onboarding:
  "WHATSAPP_COEXISTENCE"`), no lo deduce la UI del nombre del canal, así que
  el `WhatsAppAdapter` real de `PKG-009` reutilizará esta misma UI sin
  tocarla. De las tres vías solo coexistence está disponible; las otras dos
  se deshabilitan **explicando por qué**. Las comprobaciones previas se
  revalidan en el servidor (hay un E2E que fuerza el botón). Y la
  comprobación de país devuelve `UNKNOWN` por defecto: una lista copiada de
  una fuente no oficial bloquearía a usuarios reales con falsa seguridad.
  Los estados `PENDING → CONNECTING` se aplazan a `PKG-009` a propósito.
  Detalle en `docs/DECISIONS.md`.
- **(2026-09-20)** `PKG-010`: sitio público (`/`, `/privacidad`, `/terminos`,
  `/aviso-legal`, `/eliminacion-de-datos`). `/` deja de ser un redirect
  porque Meta comprueba la política de privacidad periódicamente y marca la
  app si pide login. La identidad legal vive en `src/config/company.ts` con
  huecos `REVISAR:` y una banda roja visible mientras queden: un domicilio
  inventado en un aviso legal no es un placeholder, es una afirmación falsa
  publicada. La política separa los dos papeles —Kindly responsable de los
  datos del profesional, encargado de los de sus clientes— y su contenido
  está anclado en lo que hace el código, no en una plantilla. Detalle en
  `docs/DECISIONS.md`.

## Qué falta decidir con el usuario

- **Meta Business Manager de la organización vs. número personal del
  delegado**: el número debe añadirse al BM de la organización, que pasa a
  tener control administrativo sobre un número personal. Encaja con el
  principio 1, pero tiene lectura legal/laboral. Aplazado explícitamente por
  el usuario el 2026-09-19; se decide antes de abrir el paquete de Fase 5.
- **Alta de Kindly como Tech Provider de Meta**: no es una decisión de
  arquitectura sino un trámite bloqueante, y es el camino crítico real de la
  Fase 5. Nivel decidido el 2026-09-19 (Tech Provider, no Solution Partner);
  checklist ordenado en `project/TASKS.md`, Fase 0. Sin fecha de arranque.
- ~~Alcance de `PKG-005`.~~ **Decidido el 2026-09-19**: WhatsApp coexistence
  (dominio + UI contra stub). Definición completa en
  `project/CURRENT_TASK.md`.

## Repositorio

Proyecto Next.js + TypeScript funcionando: PostgreSQL/Drizzle, Better Auth
(login/registro/sesión), CRM básico (Contacts/Cases/Tasks/Activity),
Messaging core backend (MessagingAccount/Conversation/Message/WebhookEvent,
interfaz MessagingAdapter, endpoint de webhooks) y Unified Inbox
(`/inbox`, `/inbox/[id]`, `/channels`), todo con aislamiento multi-tenant
real. Estructura de módulos completa
(`src/modules/{auth,organizations,contacts,conversations,messaging,cases,
tasks,knowledge,ai,audit}`, con código real en todos salvo `knowledge` y
`ai`), tests (Vitest + Playwright) y CI en GitHub Actions. Ver `README.md`
para arrancar en local.
