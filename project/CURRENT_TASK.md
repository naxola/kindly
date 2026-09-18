# CURRENT_TASK.md — Paquete activo

> Este es el archivo más importante para retomar el trabajo entre sesiones o
> con otro modelo. Se actualiza al terminar cada sesión, haya terminado o no
> el paquete.

## Paquete activo: ninguno — PKG-002 cerrado, PKG-003 por definir

`PKG-002 — CRM básico` se completó y se verificó el 2026-09-18 (detalle más
abajo). Igual que tras PKG-001, no hay ningún paquete de código en marcha
ahora mismo. Candidato natural para `PKG-003` según `project/TASKS.md`:
Messaging core (`MessagingAccount`, interfaz `MessagingAdapter`,
infraestructura de webhooks, y recuperar `Conversation`/`conversation_cases`
que quedaron diferidas — ver decisión 1 de PKG-002 en `docs/DECISIONS.md`).
No se empieza a programar nada de esto sin que el usuario lo confirme.

La Fase 0 (PoC manual de WhatsApp/Telegram) sigue pendiente y sin fecha, sin
relación con esto.

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
`drizzle/migrations/0002_nice_blacklash.sql`. Pendiente de commitear.

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

**Último commit antes de esta sesión:** `2c3fbff` — "docs(PKG-001): record
final commit hash in CURRENT_TASK.md".

**Esta sesión:** implementado `PKG-002 — CRM básico` completo (ver registro
arriba): bootstrap de Organization, Contact/Case/Task/Activity con
aislamiento multi-tenant real, y UI mínima. Se detectó y resolvió una
contradicción real en la documentación (Conversation dependía de una tabla
que no existe todavía) antes de escribir código — ver `docs/DECISIONS.md`.
Commiteado en `f1c28f9` — "feat(PKG-002): CRM básico — Contacts, Cases,
Tasks, Activity".

**Tests:** 27 unit/integration (Vitest) + 3 E2E (Playwright), todos en
verde. Requieren PostgreSQL local corriendo (`docker compose up -d`) — sin
eso, `npm test` y `npm run test:e2e` fallan al no poder conectar, lo cual es
esperado, no un bug.

**Próxima acción concreta:** el usuario decide el alcance de `PKG-003` (ver
sección de arriba, candidato natural: Messaging core) y se documenta aquí
siguiendo la misma plantilla que PKG-001/PKG-002. No empezar a programar
nada de Messaging/WhatsApp/Telegram/Knowledge/AI antes de esa definición
explícita.
