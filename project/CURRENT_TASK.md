# CURRENT_TASK.md — Paquete activo

> Este es el archivo más importante para retomar el trabajo entre sesiones o
> con otro modelo. Se actualiza al terminar cada sesión, haya terminado o no
> el paquete.

## Paquete activo: ninguno — PKG-003 cerrado, PKG-004 por definir

`PKG-003 — Messaging core (backend)` se completó y se verificó el
2026-09-18 (detalle más abajo). Candidato natural para `PKG-004`: Unified
Inbox (UI de listado/filtros/composición de respuesta, marcado de
`Contact → Unassigned`, UI de conexión de canal — ver `project/TASKS.md`,
sección "Fase 3 (resto)"). No se empieza a programar nada de esto sin que
el usuario lo confirme.

La Fase 0 (PoC manual de WhatsApp/Telegram) sigue pendiente y sin fecha, sin
relación con esto.

---

## Registro: PKG-003 — Messaging core, backend (cerrado 2026-09-18)

Confirmado por el usuario el 2026-09-18: alcance "backend completo, sin UI
de Inbox" (la Unified Inbox queda como `PKG-004` aparte). La Fase 0 (PoC
manual de WhatsApp/Telegram) sigue pendiente y sin fecha, y no bloquea este
paquete — se construye contra la interfaz `MessagingAdapter`, sin ninguna
implementación de proveedor real (ver `docs/DECISIONS.md`, entrada
"Corrección: PKG-000 no existe...", punto 4).

### Objective

Construir el núcleo de mensajería: `MessagingAccount`, la interfaz
`MessagingAdapter`, infraestructura de webhooks con idempotencia real, y las
entidades `Conversation`/`conversation_cases`/`Task.conversation_id` que
PKG-002 dejó diferidas. Todo probado con un adapter falso interno (nunca
expuesto como canal real) porque no hay proveedor real disponible todavía.
Sin UI — ni de Inbox, ni de conexión de canal.

### Scope

- **`MessagingAccount`**: tabla + servicio (`src/modules/messaging/`), campos
  según `docs/DATABASE.md` sección 5. `status` es un enum real de Postgres
  (7 estados documentados). `channel` es texto libre validado en la capa de
  aplicación contra el registro de adapters (misma razón que
  `Activity.type`: la lista de canales sigue creciendo — Telegram, WhatsApp,
  email, SMS — y un enum de Postgres es costoso de extender). Restricción
  `UNIQUE(channel, external_account_id)`.
- **Interfaz `MessagingAdapter`** (`src/modules/messaging/adapter.ts`):
  `connectAccount`, `disconnectAccount`, `getConnectionStatus`,
  `sendMessage`, más `verifyWebhookSignature` y `parseWebhookEvents` en vez
  del único `handleWebhook(payload: unknown)` de `docs/ARCHITECTURE.md`
  sección 4 — necesario para poder validar la firma sobre el body crudo
  *antes* de parsear nada, ver `docs/DECISIONS.md`. Sin ninguna
  implementación de proveedor real (`WhatsAppAdapter`/`TelegramAdapter` son
  Fase 4/5). Un **registro de adapters** (`registry.ts`) permite registrar
  implementaciones por canal; en este paquete no se registra ningún canal
  real — solo un adapter falso (`FakeAdapter`) usado exclusivamente en
  tests, nunca alcanzable desde una petición real fuera de la suite.
- **Infraestructura de webhooks**: endpoint genérico
  `POST /api/webhooks/[channel]/[accountId]`. Valida firma vía el adapter
  del canal antes de persistir nada; si es inválida, responde 401 sin
  guardar el evento (orden exacto de `docs/ARCHITECTURE.md` sección 7). Si
  es válida, persiste `WebhookEvent` (body crudo + headers), responde 200
  inmediatamente, y procesa la normalización con `after()` de `next/server`
  — no se introduce pg-boss/Inngest todavía (ver `docs/DECISIONS.md`: no hay
  necesidad concreta de un worker separado sin tráfico real de un proveedor
  conectado; se revisita cuando haga falta durabilidad entre reinicios).
- **`Conversation`, `Message`, `conversation_cases`, `Task.conversation_id`**:
  tablas según `docs/DATABASE.md` secciones 7/8/10/11, con los ajustes
  documentados en `docs/DECISIONS.md` (`Message.body` y
  `Message.sourceWebhookEventId` no estaban en el pseudocódigo original y
  hacían falta para que la entidad sirva de algo). Idempotencia real vía
  `UNIQUE(messaging_account_id, external_conversation_id)` y
  `UNIQUE(messaging_account_id, external_message_id)`.
- **Pipeline de normalización idempotente**: mensaje entrante nuevo → si no
  existe `Conversation` para ese `(messaging_account_id,
  external_conversation_id)`, se crea junto con un `Contact` mínimo (nombre
  = display name del proveedor si lo hay, si no el identificador externo —
  nunca se inventa un nombre). Sin fusión/detección de duplicados (deferida,
  igual que en PKG-002). Un evento de actualización de estado de entrega
  actualiza el `Message` saliente existente, no crea uno nuevo. Webhook
  repetido (mismo `external_message_id`) nunca duplica `Message`
  (`onConflictDoNothing`, mismo patrón que la condición de carrera de
  `bootstrapOrganizationForUser` — ver `docs/DECISIONS.md`).
- **Envío saliente genérico**: `sendOutboundMessage` contra la interfaz
  `MessagingAdapter` (sin UI de composición — eso es Inbox, PKG-004).
- **Activity**: se añaden `MESSAGE_RECEIVED`, `MESSAGE_SENT`,
  `CHANNEL_CONNECTED`, `CHANNEL_DISCONNECTED` (ya documentados como
  "mínimos" en `docs/DATABASE.md` sección 12) y se extiende
  `ActivityEntityType` con `"conversation"` y `"messaging_account"`.
- **Aislamiento multi-tenant real**: todo query de `MessagingAccount`/
  `Conversation`/`Message` filtra explícitamente por `organization_id`,
  igual que PKG-002.

### Non-goals (explícitamente fuera de PKG-003)

- `WhatsAppAdapter`/`TelegramAdapter` reales (Fase 4/5, bloqueados por la
  Fase 0 pendiente).
- Unified Inbox (UI), cualquier UI de composición de respuesta —
  `PKG-004`.
- UI/flujo de conexión de canal (Embedded Signup, deep link, "Connect →
  Autorización → Connected") — solo `connectMessagingAccount`/
  `disconnectMessagingAccount` a nivel de servicio, sin pantalla.
- pg-boss/Inngest — se usa `after()` de Next.js mientras no haya necesidad
  concreta de un worker separado (ver Scope).
- Detección/fusión de Contacts duplicados y cualquier marcado explícito de
  "Unassigned" en UI (`docs/PRODUCT.md` sección 4) — el backend solo
  garantiza que ningún mensaje entrante se pierde (crea Contact/Conversation
  mínimos automáticamente si no existen).
- UI para vincular `Conversation` ↔ `Case` — solo la tabla
  `conversation_cases` y una función de servicio para crear el vínculo.
- Reintentos automáticos de envío saliente fallido, plantillas, ventana de
  24h de WhatsApp (Fase 5).

### Acceptance criteria

1. Se puede conectar y desconectar un `MessagingAccount` a través de
   cualquier implementación de `MessagingAdapter` sin que el dominio conozca
   el proveedor concreto — verificado con un adapter falso en tests.
2. `Conversation`, `Message`, `conversation_cases` y `Task.conversation_id`
   existen y coinciden con `docs/DATABASE.md` (actualizado).
3. El endpoint de webhooks: (a) responde 401 y no persiste nada si la firma
   es inválida; (b) con firma válida, persiste `WebhookEvent`, responde 200,
   y crea `Contact`/`Conversation`/`Message` si no existían; (c) un mismo
   `external_message_id` recibido dos veces nunca duplica `Message`; (d) un
   evento de estado de entrega actualiza el `Message` saliente existente;
   (e) canal o cuenta desconocidos devuelven 404.
4. `sendOutboundMessage` persiste un `Message` `OUTBOUND` de forma idempotente
   y registra `MESSAGE_SENT`; el procesamiento de un webhook entrante
   registra `MESSAGE_RECEIVED`.
5. Ningún query de `messaging_accounts`/`conversations`/`messages` puede
   devolver filas de otra `Organization` — test explícito con dos
   organizaciones.
6. `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` en
   verde; la suite E2E de PKG-001/PKG-002 sigue pasando sin cambios (este
   paquete no toca UI).
7. `docs/DATABASE.md` y `docs/ARCHITECTURE.md` reflejan el esquema/interfaz
   realmente implementados.

### Tests

- Unit: enums/columnas de los nuevos schemas (patrón
  `tests/unit/cases-schema.test.ts`); registro de adapters
  (`registerMessagingAdapter`/`getMessagingAdapter`/limpieza entre tests).
- Integration (PostgreSQL real, `kindly_test`): conectar/desconectar una
  cuenta con el adapter falso; endpoint de webhooks completo (firma
  inválida, firma válida primera vez, webhook duplicado, actualización de
  estado de entrega, canal/cuenta desconocidos); `sendOutboundMessage`;
  aislamiento multi-tenant explícito entre dos organizaciones para
  `MessagingAccount`/`Conversation`/`Message`.
- Sin E2E nuevo: este paquete no cambia ningún flujo de usuario visible (sin
  UI). Se verifica que el E2E existente (`tests/e2e/auth.spec.ts`,
  `tests/e2e/crm.spec.ts`) sigue pasando sin modificaciones.

### Exit criteria — verificación final (2026-09-18)

- [x] Acceptance criteria 1-7: verificados con la suite automatizada
      (48 unit/integration en verde) y manualmente con `curl` contra
      `next dev` (cualquier canal, registrado o no en tests, devuelve 404 en
      producción real — el registro de adapters está vacío).
- [x] `npm run lint` — sin errores ni warnings.
- [x] `npm run typecheck` — sin errores.
- [x] `npm test` — 48 tests (6 archivos unit, 5 archivos integration) en
      verde, contra PostgreSQL real (`kindly_test`).
- [x] `npm run test:e2e` — 3 tests Playwright en verde, sin cambios (este
      paquete no toca UI).
- [x] `npm run build` — build de producción sin errores; el endpoint
      `/api/webhooks/[channel]/[accountId]` aparece en la tabla de rutas.
- [x] `project/TASKS.md` actualizado — Fase 3 dividida en `PKG-003` (cerrado)
      y el resto (Unified Inbox, candidato a `PKG-004`, sin definir).
- [x] `project/PROGRESS.md` actualizado con fecha.
- [x] Decisiones no triviales registradas en `docs/DECISIONS.md` (entradas
      del 2026-09-18, bloque "PKG-003"): refinamiento de la interfaz
      `MessagingAdapter`, registro de adapters vacío en producción, `after()`
      en vez de pg-boss/Inngest, `channel` como texto libre,
      `Message.body`/`sourceWebhookEventId`, `webhook_events` con body
      inline, Contact mínimo automático para remitentes desconocidos, y la
      condición de carrera de `findOrCreateConversation` (mismo patrón que
      el fix de login, `isPostgresUniqueViolation` extraído a
      `src/db/errors.ts`).
- [ ] Commit Git — pendiente, se hace a continuación en esta misma sesión.

### Fix post-cierre de PKG-002 (2026-09-18, mismo día): login "silencioso"

El usuario reportó que al hacer login con una cuenta real (creada antes del
bootstrap de Organization de PKG-002) volvía a `/login` sin ver ningún
error. Causa: sesión válida sin fila en `organization_members` —
indistinguible de "credenciales incorrectas" desde la UI. Se corrigió con
autoreparación en `getCurrentOrganizationMember()`, lo cual expuso una
condición de carrera real (dos Organizations creadas para el mismo usuario
bajo peticiones concurrentes), corregida con una restricción
`UNIQUE(user_id)` en `organization_members` + manejo transaccional en
`bootstrapOrganizationForUser()`. Detalle completo, verificación manual y
test de regresión en `docs/DECISIONS.md` (entrada "Fix: login silencioso
para cuentas sin Organization..."). Migración
`drizzle/migrations/0002_nice_blacklash.sql`. Commiteado en `38178b0` —
"fix: self-heal missing Organization on login + fix resulting race
condition".

---

## Registro: PKG-002 — CRM básico (cerrado 2026-09-18)

El usuario eligió CRM básico como PKG-002 (candidato recomendado, porque
Messaging core depende de que `Conversation` exista, y `Conversation` es
parte de CRM).

### Contradicción detectada y cómo se resuelve

`docs/DATABASE.md` sección 7 define `Conversation` con
`messaging_account_id` como columna obligatoria (`NOT NULL`, con
`UNIQUE(messaging_account_id, external_conversation_id)`), pero
`messaging_accounts` no existe todavía (es de Messaging core, Fase 3).
`project/TASKS.md` Fase 2 pedía "Conversation (sin canales reales todavía,
estructura base)", lo cual es incompatible con una FK obligatoria a una
tabla inexistente. Lo mismo aplica a `conversation_cases` (depende de
`Conversation`) y a la columna `conversation_id` de `Task`.

**Resolución:** `Conversation`, `conversation_cases` y la columna
`Task.conversation_id` se crean junto con `MessagingAccount` en el paquete
de Messaging core (no en PKG-002), porque una Conversation sin canal no es
un concepto real en el producto (`docs/PRODUCT.md` sección 7: "el canal de
comunicación concreto... entre un Contact y una identidad de comunicación
concreta"). PKG-002 crea `Task` sin `conversation_id`; esa columna se añade
con su FK en una migración del paquete de Messaging core. Esto no cambia
ningún requisito de producto, solo el orden en que se crean las tablas —
se registra como decisión en `docs/DECISIONS.md` al cerrar este paquete.

### Objective

Construir el CRM básico: gestión de Contacts, Cases y Tasks, con historial
de actividad, para que el profesional pueda empezar a registrar su relación
con las personas antes de que exista ningún canal de mensajería conectado.

### Scope

- **Bootstrap de Organization**: al registrarse un usuario (Better Auth
  `databaseHooks.user.create.after`), se crea automáticamente una
  `Organization` y su `organization_members` con rol `ADMIN` para ese
  usuario. Es el mínimo necesario para que exista `organization_id` en algo
  — gestión completa de organizaciones (invitar miembros, cambiar de rol,
  pertenecer a varias organizaciones) queda fuera (ver Non-goals).
- **Contact**: tabla + CRUD (crear, listar, ver, editar). Campos: `name`,
  `phone_e164` (nullable), `email` (nullable), `notes` (nullable). Sin
  detección/fusión de duplicados (explícitamente diferido en
  `docs/PRODUCT.md` sección 4).
- **Case**: tabla + CRUD. Campos según `docs/DATABASE.md` sección 9:
  `contact_id`, `title`, `description`, `status` (enum
  `OPEN/IN_PROGRESS/WAITING/RESOLVED/CLOSED`, documentado), `priority`
  (texto libre, sin enum — el encargo no especifica valores, no se inventan),
  `assigned_to` (User, nullable), `closed_at`. Sin workflow de transiciones
  (`docs/PRODUCT.md` sección 7: "sin workflow complejo en el MVP").
- **Task**: tabla + CRUD. Relacionable con `Contact` (nullable) y `Case`
  (nullable) y `assigned_to` (User, nullable). Sin `conversation_id` todavía
  (ver contradicción arriba). Sin enum de estado no documentado: se usa
  `completed_at` (nullable) para saber si está hecha, en vez de inventar un
  state machine.
- **Activity**: tabla de historial, con `type` (texto libre validado en la
  capa de aplicación, no enum de Postgres — la lista de tipos va a seguir
  creciendo con cada fase futura y un enum de Postgres es más costoso de
  extender que uno de rol fijo como `organization_role`), referencia
  polimórfica (`entity_type` + `entity_id`, sin FK — apunta a Contact, Case o
  Task por ahora, a Conversation/Message/AISuggestion en el futuro), y
  `actor_user_id` (quién lo hizo). Se registra al crear/actualizar Contact,
  crear/asignar Case, crear/completar Task. Solo escritura en este paquete;
  se muestra como lista de solo lectura en las páginas de detalle de Contact
  y Case (sin página propia `/activities`).
- **Aislamiento multi-tenant real**: todo query de estos módulos filtra
  explícitamente por `organization_id` del usuario autenticado (helper
  `getCurrentOrganizationMember()` en `src/modules/organizations/service.ts`).
  Sigue sin implementarse RLS a nivel de PostgreSQL (diferido, igual que en
  PKG-001) — el filtrado es en la capa de aplicación, en todos los queries,
  sin excepción.
- **UI mínima**: layout autenticado compartido (nav: Contacts, Cases, Tasks,
  cerrar sesión) envolviendo `/dashboard` y las tres secciones nuevas.
  Listado + formulario de creación inline + página de detalle con edición
  para cada entidad. Sin diseño elaborado (mismo nivel que el login de
  PKG-001) — eso es trabajo de un paquete de UI/diseño posterior.

### Non-goals (explícitamente fuera de PKG-002)

- `Conversation`, `conversation_cases`, `Task.conversation_id` (ver
  contradicción arriba — van con Messaging core).
- `MessagingAccount`, `Message`, `WebhookEvent`, cualquier `MessagingAdapter`.
- Gestión de organizaciones: invitar miembros, cambiar roles, pertenecer a
  varias organizaciones, cambiar de organización activa, UI de
  administración de la organización.
- Detección/fusión de Contacts duplicados.
- Workflow/transiciones de estado restringidas para Case (cualquier
  ADMIN/DELEGATE puede poner cualquier estado).
- Prioridad de Case como enum cerrado (es texto libre hasta que el producto
  necesite valores concretos).
- Unified Inbox, AI Copilot, Knowledge.
- Página dedicada de Activity / auditoría completa (solo listas de solo
  lectura embebidas en Contact/Case).

### Acceptance criteria

1. Un usuario que se registra tiene automáticamente una `Organization` con
   rol `ADMIN`, verificable en base de datos.
2. Un `ADMIN` o `DELEGATE` puede crear, listar, ver y editar `Contact`,
   `Case` y `Task` desde la UI, y los cambios persisten en PostgreSQL.
3. Ningún query de `contacts`/`cases`/`tasks`/`activities` puede devolver
   filas de una `Organization` distinta a la del usuario autenticado — hay
   un test que lo demuestra explícitamente (dos organizaciones, un usuario
   de cada una, ninguna ve los datos de la otra).
4. `Case.status` solo admite los cinco valores documentados (enum de
   Postgres).
5. Crear un Contact, crear/asignar un Case y crear/completar una Task
   generan una fila en `activities` con el `type` correcto.
6. `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` y
   `npm run build` en verde.
7. `docs/DATABASE.md` refleja el esquema real implementado (igual que se
   hizo para `organizations`/`organization_members` en PKG-001).

### Tests

- Unit: reglas de la capa de aplicación (p. ej. que `Case.status` solo
  acepte los 5 valores a nivel de tipos, que `Task` sin `completed_at` se
  considere pendiente).
- Integration: CRUD contra PostgreSQL real (`kindly_test`) para Contact,
  Case, Task; el hook de bootstrap de Organization al crear un usuario;
  generación de `Activity` en las operaciones relevantes.
- **Integration obligatorio de aislamiento multi-tenant**: dos
  organizaciones con datos propios, verificar que ningún service devuelve
  ni permite modificar datos de la otra (`tests/README.md` sección
  "Multi-tenancy").
- E2E (Playwright): registro → crear un Contact → crear un Case para ese
  Contact → crear una Task → marcarla completada — un único flujo feliz que
  toca las tres entidades.

### Exit criteria — verificación final (2026-09-18)

- [x] Acceptance criteria 1-7: verificados manualmente (curl + psql para el
      bootstrap de Organization, `next dev` + navegación real para el CRUD)
      y con la suite automatizada.
- [x] `npm run lint` — sin errores ni warnings.
- [x] `npm run typecheck` — sin errores.
- [x] `npm test` — 27 tests (4 archivos unit, 3 archivos integration) en
      verde, contra PostgreSQL real (`kindly_test`), incluyendo el bloque
      dedicado de aislamiento multi-tenant.
- [x] `npm run test:e2e` — 3 tests Playwright en verde: el flujo de auth de
      PKG-001, el flujo completo Contact→Case→Task de PKG-002, y aislamiento
      entre dos organizaciones a nivel de UI.
- [x] `npm run build` — build de producción sin errores.
- [x] `project/TASKS.md` — puntos de PKG-002 marcados `[x]`, `Conversation`/
      `conversation_cases` movidos a la sección de Messaging core.
- [x] `project/PROGRESS.md` — actualizado, PKG-002 completo, siguiente paso
      anotado.
- [x] Decisiones técnicas no triviales registradas en `docs/DECISIONS.md`
      (entradas del 2026-09-18, bloque "PKG-002"): Conversation diferida,
      bootstrap de Organization, priority sin enum, Task sin columna de
      estado, Activity.type sin enum + referencia polimórfica, sin
      eliminación de registros, stub de `server-only` en tests.
- [x] Commit Git — `f1c28f9`.

---

## Registro: PKG-001 — Foundation (cerrado 2026-09-18)

### Objective

Poner en marcha la base técnica del proyecto (repositorio de código,
proyecto Next.js, base de datos, testing, lint/typecheck, CI) para que los
paquetes siguientes (CRM, Messaging, Knowledge, AI) tengan sobre qué
construir. No se implementa ninguna funcionalidad de producto todavía.

### Scope

- Inicializar/configurar Next.js + TypeScript (App Router) si todavía no
  existe en el repositorio.
- Configurar la estructura de carpetas del modular monolith descrita en
  `docs/ARCHITECTURE.md` sección 2 (`src/modules/{auth,organizations,
  contacts,conversations,messaging,cases,tasks,knowledge,ai,audit}`), como
  esqueleto de carpetas — no como módulos con lógica de negocio implementada
  salvo `organizations` (ver más abajo).
- Configurar PostgreSQL + Drizzle ORM: conexión, configuración de
  migraciones, Docker Compose para desarrollo local.
- Configurar infraestructura de testing (Vitest como mínimo para unit tests;
  Playwright puede quedar configurado pero sin suites todavía si no hay UI
  que probar en este paquete).
- Configurar lint (ESLint) y typecheck (`tsc --noEmit`) con scripts de npm.
- Configurar estructura inicial de `src/` acorde a lo anterior.
- Preparar configuración de desarrollo local: `.env.example`, instrucciones
  mínimas de arranque.
- Configurar GitHub Actions (lint + typecheck + test) si el repositorio va a
  vivir en GitHub — verificar remoto antes de asumirlo.
- Crear únicamente las tablas/modelos estrictamente necesarios para
  Foundation, según `docs/DATABASE.md` sección 3: `users`, `organizations`,
  `organization_members` (con su rol `ADMIN`/`DELEGATE` como columna/enum).
  Sin datos semilla de negocio, sin lógica de permisos más allá del propio
  esquema.
- **Better Auth configurado y funcional**: login/registro con email y
  contraseña, sesión persistida en PostgreSQL vía el adaptador de Drizzle, el
  modelo de usuario de Better Auth mapeado a la tabla `users` documentada (no
  una tabla `user` paralela). Una página mínima de login/registro sin diseño
  elaborado (eso es trabajo de un paquete de UI posterior) y una ruta
  protegida de prueba que confirme que la sesión funciona end-to-end.

### Non-goals (explícitamente fuera de PKG-001)

- UI real de producto (layout, navegación, Inbox, etc.) — solo lo mínimo
  para poder probar el login.
- Middleware o políticas de aislamiento multi-tenant en tiempo de ejecución
  (RLS, helpers de query) — PKG-001 solo deja las tablas con `organization_id`
  donde corresponde; la política de acceso se implementa cuando exista algo
  que proteger.
- Entidades de CRM (`Contact`, `Conversation`, `Case`, `Task`, `Activity`).
- Entidades de Messaging (`MessagingAccount`, `Message`, `WebhookEvent`) y
  cualquier `MessagingAdapter`.
- Cualquier código relacionado con WhatsApp o Telegram (la PoC de Fase 0 es
  manual y no forma parte de este paquete, ver `project/TASKS.md`).
- Knowledge (`Document`, `DocumentVersion`, `KnowledgeChunk`) y AI
  (`AISuggestion`, `LLMProvider`, `EmbeddingProvider`).
- Sentry / OpenTelemetry (se añaden cuando haya algo real que observar).
- Rate limiting.

### Acceptance criteria

1. El proyecto Next.js arranca en local (`npm run dev`) sin errores.
2. `npm run typecheck` pasa sin errores con TypeScript en modo estricto.
3. `npm run lint` pasa sin errores.
4. `npm test` ejecuta la suite de Vitest y pasa en verde.
5. Existe una migración de Drizzle que crea `users`, `organizations` y
   `organization_members`, aplicable contra una PostgreSQL local (vía Docker
   Compose) sin errores.
6. La estructura de carpetas de `src/modules/*` existe para los diez módulos
   documentados, cada uno como carpeta real en el repositorio (con al menos
   un archivo, p. ej. `README.md` o `index.ts`, para que Git la trackee),
   marcando claramente cuáles están vacíos/pendientes.
7. `organization_members.role` solo admite `ADMIN` o `DELEGATE` (constraint o
   enum a nivel de base de datos, no solo en TypeScript).
8. No existe ningún secreto en claro en el repositorio (`.env.example` con
   placeholders, `.env` real ignorado por Git).
9. `docs/DATABASE.md` sigue describiendo fielmente el esquema tras esta
   implementación (se actualiza si algo se ajusta respecto a lo ya escrito).
10. Un usuario puede registrarse (email + contraseña) y ver una cookie/sesión
    creada; puede cerrar sesión; una ruta protegida devuelve 401/redirect si
    no hay sesión y contenido si la hay.
11. La tabla de usuarios de Better Auth es la misma `users` documentada (con
    los campos adicionales que Better Auth requiera), no una tabla `user`
    duplicada.

### Tests

- Unit: validación de esquema/tipos de Drizzle para `users`, `organizations`,
  `organization_members` (p. ej. que el enum de rol rechace un valor
  inválido).
- Integration: al menos un test que levante la migración contra una
  PostgreSQL de test (o contenedor efímero) y verifique que las tablas
  existen con las columnas esperadas y que la relación
  `organization_members → users`/`organizations` tiene sus foreign keys.
- Integration: registro + login + acceso a ruta protegida contra la
  instancia real de Better Auth y una PostgreSQL de test (sin mockear
  Better Auth, ya que es infraestructura propia, no un proveedor externo).
- E2E (Playwright): un único flujo feliz, registro → login → ruta protegida
  → logout, porque ya existe una UI mínima que lo permite.

### Exit criteria — verificación final (2026-09-18)

- [x] Acceptance criteria 1-11: verificados manualmente (build, `next dev`,
      curl contra `/api/auth/*`, consultas SQL directas) y con la suite
      automatizada.
- [x] `npm run lint` — sin errores ni warnings.
- [x] `npm run typecheck` — sin errores.
- [x] `npm test` — 14 tests (2 archivos unit, 2 archivos integration) en
      verde, contra PostgreSQL real (`kindly_test`).
- [x] `npm run test:e2e` — 1 test Playwright en verde (registro → dashboard →
      logout → dashboard vuelve a pedir login).
- [x] `npm run build` — build de producción sin errores.
- [x] `project/TASKS.md` — puntos de PKG-001 marcados `[x]`.
- [x] `project/PROGRESS.md` — actualizado, PKG-001 completo, siguiente paso
      anotado.
- [x] Decisiones técnicas no triviales registradas en `docs/DECISIONS.md`
      (entradas del 2026-09-18): por qué no se usa el plugin `organization`
      de Better Auth, por qué no se usa `@better-auth/cli`, base de datos de
      test separada, vulnerabilidad moderada aceptada, bloque de Next.js en
      `CLAUDE.md`.
- [x] Commit Git — `a986fe2`.

## Fase 0 — Validación técnica (PoC WhatsApp/Telegram) — estado aparte

**No forma parte de PKG-001 ni de ningún paquete de código.** Es trabajo
manual que ejecuta el usuario con sus propias cuentas de Telegram/WhatsApp y
dispositivos reales. El agente no debe intentar ejecutarla, simularla, ni
adelantar la implementación de `WhatsAppAdapter`/`TelegramAdapter` mientras
esté pendiente.

- **Estado:** pendiente, sin fecha.
- **Responsable:** el usuario.
- **Qué hacer cuando esté completa:** reportar el resultado (a mano o
  pidiéndole al agente que lo transcriba) para añadir la entrada
  correspondiente en `docs/DECISIONS.md`, según lo previsto en
  `docs/INTEGRATIONS.md` sección 3.
- **Bloquea:** solo el futuro paquete de integración de WhatsApp real (no
  bloquea PKG-001 ni previsiblemente los paquetes de CRM/Messaging core, que
  pueden construirse contra la interfaz `MessagingAdapter` sin una
  implementación concreta de proveedor).

## Estado

**Último commit:** sin commitear todavía — pendiente al final de esta misma
sesión (se registrará el hash aquí en un commit de seguimiento, igual que en
PKG-001/PKG-002).

**Sesión anterior (misma fecha, 2026-09-18):** implementado `PKG-002 — CRM
básico` completo, y el fix post-cierre de login silencioso + condición de
carrera (`38178b0`) descrito arriba. Al retomar esta sesión se corrigió
además `CURRENT_TASK.md`, que había quedado desactualizado sobre ese commit.

**Esta sesión:** implementado `PKG-003 — Messaging core (backend)` completo
(ver registro arriba): `MessagingAccount`, interfaz `MessagingAdapter`
refinada, registro de adapters, infraestructura de webhooks idempotente con
`after()`, `Conversation`/`conversation_cases`/`Task.conversation_id`, envío
saliente genérico, todo con aislamiento multi-tenant real y probado con un
adapter falso interno. Migración `drizzle/migrations/0003_gifted_star_brand.sql`
aplicada contra PostgreSQL de desarrollo. Verificado manualmente con `curl`
contra `next dev` que ningún canal es alcanzable en producción real (404).

**Tests:** 48 unit/integration (Vitest, 11 archivos) + 3 E2E (Playwright,
sin cambios), todos en verde. Requieren PostgreSQL local corriendo (`docker
compose up -d`) — sin eso, `npm test` y `npm run test:e2e` fallan al no
poder conectar, lo cual es esperado, no un bug.

**Próxima acción concreta:** el usuario decide el alcance de `PKG-004` (ver
sección de arriba, candidato natural: Unified Inbox) y se documenta aquí
siguiendo la misma plantilla que los paquetes anteriores. No empezar a
programar nada de Inbox/WhatsApp/Telegram/Knowledge/AI antes de esa definición
explícita.
