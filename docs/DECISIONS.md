# DECISIONS.md — Registro de decisiones de arquitectura

Formato: cada entrada es un hecho consumado en una fecha concreta. Nunca se
borra ni se reescribe una entrada anterior — si una decisión cambia, se añade
una entrada nueva que referencia y supersede a la anterior. Esto es la
memoria de "por qué" del proyecto; `docs/*.md` reflejan el estado actual,
este archivo refleja la historia.

---

## 2026-09-17 — Análisis inicial: riesgos y ambigüedades del encargo original

Antes de escribir código se revisó el prompt maestro completo. Hallazgos:

### Riesgo crítico: identidad de comunicación de WhatsApp

El requisito de que el `DELEGATE` siga usando su WhatsApp personal/habitual
en el móvil sin cambios, mientras Kindly sincroniza por detrás, **no es
alcanzable sin matices** con la WhatsApp Business Platform (Cloud API)
oficial. Detalle completo en `docs/INTEGRATIONS.md` sección 2.2. Resumen:

- Solo es viable, y con matices, si el número usa WhatsApp Business App y la
  funcionalidad de "coexistence" de Meta está disponible para el
  mercado/BSP de la organización en el momento de implementar.
- Si no está disponible, las alternativas oficiales son: número dedicado de
  Cloud API por delegado (rompe parcialmente "número habitual", mantiene "un
  número por delegado"), o número centralizado de organización (rompe el
  principio de producto de la sección 74.1 del encargo — solo se adoptaría
  con aprobación explícita del usuario).
- **Esto no se resuelve en este documento.** Se resuelve ejecutando la PoC
  descrita en `docs/INTEGRATIONS.md` sección 3 (Fase 0 del roadmap,
  `project/TASKS.md`), y el resultado se añade aquí como una nueva entrada.
- **Estado: pendiente de PoC.** No se debe construir `WhatsAppAdapter` en
  serio (más allá de estructura mínima para no bloquear otras fases) hasta
  que esta entrada tenga una decisión registrada.

### Ambigüedad resuelta: UX de conexión "QR" para Telegram y WhatsApp

El encargo describe una UX deseada `Connect → Scan QR → Connected` "si la
plataforma lo soporta oficialmente". Verificado: **ninguna de las dos
plataformas ofrece ese mecanismo para este caso de uso concreto**.

- Telegram: la conexión de un Connected Business Bot ocurre dentro de la
  app de Telegram del propio usuario (Settings → Telegram Business →
  Chatbots), no vía un QR mostrado por Kindly.
- WhatsApp: el mecanismo oficial es Embedded Signup (OAuth de Facebook
  Login), no QR.

**Decisión:** se sustituye la UX de QR por
"Connect → Autorización oficial (deep link / OAuth embebido) → Connected"
para ambos canales, tal como permite explícitamente el propio encargo en su
sección 18 ("Si no existe [QR]: utilizar OAuth, deep links, autorización
oficial"). No es un cambio de requisito oculto: el encargo ya contemplaba
esta rama.

### Ambigüedad resuelta: `EvidenceLevel` no es un porcentaje

El encargo es explícito en prohibir `confidence: 87%` y pedir
`SUFFICIENT / PARTIAL / INSUFFICIENT`. No hay contradicción aquí, se registra
solo para que quede como decisión de diseño explícita del sistema de AI, ver
`docs/DATABASE.md` sección 16.

### Dependencia externa a verificar continuamente

Tanto el alcance de "coexistence" de WhatsApp como los límites de Telegram
Business (disponibilidad por país, límites de Telegram Premium) son
capacidades que las plataformas cambian con el tiempo. Cualquier suposición
técnica sobre ellas debe reverificarse en el momento de implementar cada
fase, no darse por buena porque quedó escrita aquí en una fecha anterior.

### Sin contradicciones bloqueantes en el resto del encargo

El resto de requisitos (multi-tenancy, RAG con PostgreSQL+pgvector,
modular monolith, AI como copiloto sin autoenvío, versionado de conocimiento)
son coherentes entre sí y con capacidades reales de PostgreSQL/pgvector/LLMs
actuales. No se identifican más contradicciones técnicas de partida.

---

## 2026-09-17 — Estructura de documentación de contexto entre sesiones

**Decisión:** se adopta la estructura de archivos pedida por el usuario para
mantener contexto entre sesiones de Claude Code:

```
CLAUDE.md
docs/{PRODUCT,ARCHITECTURE,DATABASE,INTEGRATIONS,DECISIONS}.md
project/{TASKS,CURRENT_TASK,PROGRESS}.md
tests/README.md
```

**Por qué:** separar "qué es el producto" (docs/) de "qué se está haciendo
ahora" (project/) permite retomar el trabajo en cualquier sesión nueva o con
otro modelo sin perder contexto, sin tener que releer todo el historial de
Git o de conversación.

---

## 2026-09-17 — Fase 0 activa: PoC de mensajería antes que código de producto

**Decisión:** siguiendo la prioridad absoluta del encargo original (sección
75), la primera tarea real del proyecto es la validación técnica de Telegram
y WhatsApp, no el CRM. Ver `project/CURRENT_TASK.md`.

**Por qué:** construir Contacts/Conversations/Cases sobre una hipótesis de
integración no verificada (especialmente WhatsApp) arriesga tener que
rediseñar el modelo de `MessagingAccount`/`Conversation` después. Se prefiere
pagar el coste de la incertidumbre ahora, de forma barata (una PoC), que
después, de forma cara (reescribir el core).

---

## 2026-09-17 — Corrección: "PKG-000" no existe; nace la numeración PKG-XXX desacoplada de la Fase 0

**Contexto:** al iniciar la sesión de implementación, el usuario pidió
"implementar PKG-000 completamente" asumiendo que ya existía esa
identificación. Al revisar `project/TASKS.md` y `project/CURRENT_TASK.md` no
existía ningún paquete numerado — solo "fases" (0 a 8) sin identificador de
paquete. Además, la fase activa en ese momento (Fase 0) consiste en pasos
manuales (PoC de Telegram/WhatsApp con cuentas reales, Premium de Telegram,
verificación de negocio en Meta) que el agente no puede ejecutar ni simular.
Se detuvo el trabajo y se preguntó al usuario en vez de asumir.

**Decisión:**

1. Se introduce formalmente una numeración de paquetes de desarrollo
   `PKG-001`, `PKG-002`, ... Cada paquete es una unidad de trabajo de código
   que el agente implementa completa, con Objective/Scope/Non-goals/
   Acceptance criteria/Tests/Exit criteria definidos en
   `project/CURRENT_TASK.md` antes de empezar.
2. La **Fase 0 (PoC de WhatsApp/Telegram) no es ni será un paquete
   numerado**. Es trabajo manual que ejecuta el usuario con sus propias
   cuentas y dispositivos. El agente no la ejecuta, no la simula, y no
   implementa `WhatsAppAdapter`/`TelegramAdapter` reales mientras esté
   pendiente.
3. El desarrollo de código **no espera** al resultado de la Fase 0. Empieza
   directamente por `PKG-001 — Foundation` (base técnica: proyecto Next.js,
   PostgreSQL + Drizzle, testing, lint/typecheck, CI, y únicamente las tablas
   `users`/`organizations`/`organization_members`). Esto no contradice la
   prioridad del encargo original de validar mensajería antes de construir
   sobre ella: `PKG-001` no toca `MessagingAccount` ni ningún modelo de
   mensajería, así que no hay nada que rehacer si el resultado de la PoC
   obliga a ajustar ese modelo más adelante.
4. La Fase 0 solo bloquea el futuro paquete que implemente el
   `WhatsAppAdapter` real (Fase 5 del backlog), no `PKG-001` ni,
   previsiblemente, el paquete de Messaging core (que se construye contra la
   interfaz `MessagingAdapter`, no contra una implementación concreta).

**Por qué:** evita que el agente invente un alcance para un identificador que
no existía, y separa con claridad qué es responsabilidad del usuario (validar
capacidades reales de plataformas externas con sus propias cuentas) de qué es
responsabilidad del agente (escribir e integrar código sobre esas
capacidades, una vez confirmadas).

**Supersede a:** la entrada "2026-09-17 — Fase 0 activa: PoC de mensajería
antes que código de producto" de este mismo documento, en cuanto a que la
Fase 0 ya no es la primera tarea del proyecto ni una condición previa al
desarrollo — sigue siendo importante y pendiente, pero en paralelo.

---

## 2026-09-18 — PKG-001 (Foundation): decisiones técnicas de implementación

Contexto: al implementar la base técnica (Next.js, PostgreSQL + Drizzle,
Better Auth, testing, CI) surgieron varias decisiones no triviales que no
estaban prescritas por `docs/ARCHITECTURE.md`/`docs/DATABASE.md` en detalle.
Se registran aquí, verificadas contra el código real instalado (no memoria),
siguiendo `CLAUDE.md` sección 3.

**1. No se usa el plugin `organization` de Better Auth.**
Better Auth incluye un plugin oficial (`better-auth/plugins/organization`)
que ya implementa Organization/Member/Invitation con roles configurables.
Se evaluó y se descarta para PKG-001: introduce una tabla `invitation` (no
documentada, fuera de alcance), un modelo de equipos opcional, y acopla nuestro
dominio de negocio (`Organization`) a una librería de autenticación — rompe
el principio de aislamiento de proveedor de `docs/ARCHITECTURE.md` sección
16. En su lugar, `organizations`/`organization_members` son tablas Drizzle
propias en `src/modules/organizations/schema.ts`, con su propio enum
`organization_role` (`ADMIN`/`DELEGATE`). Better Auth solo gestiona
`users`/`sessions`/`accounts`/`verifications`.

**2. Better Auth usa nombres de tabla en plural, alineados a `docs/DATABASE.md`.**
El adaptador de Drizzle de Better Auth (`@better-auth/drizzle-adapter`) usa
por defecto nombres de modelo en singular (`user`, `session`, ...). Se activó
`usePlural: true` para que use `users`, `sessions`, `accounts`,
`verifications`, coincidiendo con la tabla `users` ya documentada en
`docs/DATABASE.md` sección 3, en vez de crear una tabla `user` paralela.

**3. El esquema de las tablas de Better Auth se escribió a mano, verificado
contra el código fuente instalado, no contra el CLI oficial.**
Better Auth ofrece un paquete `@better-auth/cli` para generar el esquema de
Drizzle automáticamente. Al instalarlo, `npm audit` reportó que arrastra una
copia vendorizada y desactualizada de `better-auth` (≤1.6.21, con
vulnerabilidades **críticas** de OAuth) y de `drizzle-orm`, y npm marca el
propio paquete `@better-auth/cli` como
`DEPRECATED — Package no longer supported. Contact Support`, un aviso que
en el registro de npm normalmente indica una retirada por seguridad, no una
simple sugerencia de actualizar de versión. Por precaución (no se pudo
verificar la causa exacta de la retirada) se descartó ese CLI por completo:
se desinstaló, y el esquema real de `users`/`sessions`/`accounts`/
`verifications` (`src/modules/auth/schema.ts`) se escribió leyendo
directamente el código fuente TypeScript del paquete `better-auth` legítimo
ya instalado (`@better-auth/core/src/db/schema/{shared,user,session,account,
verification}.ts`), que es autoritativo y no arrastra esas dependencias.

**4. Base de datos de test separada (`kindly_test`).**
Los tests de integración (`tests/integration/`) corren migraciones reales
contra PostgreSQL. Para no tocar nunca los datos de desarrollo, se creó una
base de datos separada (`kindly_test`, mismo contenedor) y
`tests/setup.ts` redirige `DATABASE_URL` hacia `TEST_DATABASE_URL` antes de
que cualquier test importe `src/db/client.ts` o `src/modules/auth/auth.ts`.
`docker/init-test-db.sh` la crea automáticamente la primera vez que se
levanta `docker compose up -d` (montado en `/docker-entrypoint-initdb.d/`).

**5. Vulnerabilidad moderada aceptada: esbuild vía `drizzle-kit`.**
`npm audit` señala una vulnerabilidad moderada de `esbuild` (<=0.24.2) a
través de una dependencia transitiva de `drizzle-kit` (versión ya la más
reciente disponible, 0.31.10 — no hay una versión sin esa dependencia). El
aviso original es sobre el servidor de desarrollo de `esbuild` aceptando
peticiones de cualquier origen; `drizzle-kit` no expone ningún servidor de
ese tipo, solo usa `esbuild` para cargar su propio archivo de configuración
en local. Riesgo aceptado y documentado; revisar si una versión futura de
`drizzle-kit` lo soluciona.

**6. El bloque `<!-- BEGIN:nextjs-agent-rules -->` en `CLAUDE.md` es de
Next.js, no nuestro, y se mantiene.**
Next.js 16 (`next dev`/`next build`) reescribe automáticamente un bloque al
final de `CLAUDE.md` (o `AGENTS.md`) avisando a los agentes de que esta
versión tiene cambios respecto a su conocimiento de entrenamiento y deben
leer `node_modules/next/dist/docs/` antes de escribir código (mecanismo
documentado en esa misma guía de Next.js, sección "Set up AI agent docs").
Quitarlo manualmente solo hace que reaparezca como cambio sin commitear en
el siguiente `next dev`; Next.js recomienda commitearlo. Se mantiene tal
cual al final de `CLAUDE.md`.

---

## 2026-09-18 — PKG-001 (Foundation): cerrado

Todos los *acceptance criteria* de `project/CURRENT_TASK.md` verificados:
build, lint, typecheck, 14 tests unitarios/integración en verde, migración
aplicada contra PostgreSQL real, flujo de registro/login/sesión/logout
verificado tanto por HTTP directo (curl) como por un E2E de Playwright.
Ver `project/PROGRESS.md` para el resumen y `project/TASKS.md` para el
detalle marcado. Siguiente paso: decidir con el usuario el alcance de
`PKG-002` — no se predefine aquí (ver entrada "Corrección: PKG-000 no
existe..." más arriba).

---

## 2026-09-18 — PKG-002 (CRM básico): decisiones técnicas de implementación

Contexto: el usuario eligió CRM básico como alcance de `PKG-002` (ver
`project/CURRENT_TASK.md`). Antes de escribir código se detectó una
contradicción real entre `docs/DATABASE.md` y `project/TASKS.md`, y durante
la implementación surgieron varias decisiones de diseño no triviales por
campos que el encargo original nunca especificó del todo. Se registran aquí.

**1. `Conversation`, `conversation_cases` y `Task.conversation_id` se
mueven al paquete de Messaging core.**
`docs/DATABASE.md` documentaba `Conversation.messaging_account_id` como
columna obligatoria (`NOT NULL`, con `UNIQUE(messaging_account_id,
external_conversation_id)`), pero `messaging_accounts` no existe hasta el
paquete de Messaging core. `project/TASKS.md` pedía crear `Conversation`
"sin canales reales todavía" en la fase de CRM, lo cual es incompatible con
una FK obligatoria a una tabla inexistente. Una Conversation sin canal
tampoco es un concepto real del producto
(`docs/PRODUCT.md` sección 7). **Decisión:** `Conversation`,
`conversation_cases` y la columna `Task.conversation_id` se crean junto con
`MessagingAccount`, no en PKG-002. No cambia ningún requisito de producto,
solo el orden de creación de tablas. `docs/DATABASE.md` y
`project/TASKS.md` quedan actualizados para reflejarlo.

**2. Bootstrap automático de Organization al registrarse.**
Better Auth (elegido en PKG-001) no usa su plugin `organization` (decisión
de PKG-001), así que no hay ningún mecanismo que le dé automáticamente una
`Organization` a un usuario nuevo. Sin `organization_id`, ninguna fila de
CRM puede existir (aislamiento multi-tenant, no negociable). Se usa el hook
`databaseHooks.user.create.after` de Better Auth
(`src/modules/auth/auth.ts`) para crear una `Organization` y su
`organization_members` (`ADMIN`) justo después del registro
(`src/modules/organizations/bootstrap.ts`). Gestión completa de
organizaciones (invitar miembros, pertenecer a varias, cambiar de rol)
queda fuera de alcance — un usuario tiene exactamente una organización por
ahora, y `getCurrentOrganizationMember()`
(`src/modules/organizations/service.ts`) asume "la primera membership
encontrada" en base a eso. Quien implemente multi-organización debe
sustituir esa función, no añadirle un parámetro que el cliente pueda
falsificar.

**3. `Case.priority` es texto libre, no un enum.**
El encargo original nunca especificó valores concretos de prioridad (solo
menciona "prioridad si se implementa" en el contexto del Inbox). Inventar
un enum cerrado (`LOW/MEDIUM/HIGH`, etc.) sería añadir un requisito de
producto no pedido. Se deja como texto libre hasta que exista una decisión
de producto explícita sobre qué valores tiene sentido ofrecer.

**4. `Task` no tiene columna de estado — se deriva de `completed_at`.**
El encargo describe ejemplos de tareas pero nunca un state machine ni una
lista de estados. En vez de inventar uno, "pendiente"/"completada" se
deriva de si `completed_at` es `NULL` o no
(`src/modules/tasks/domain.ts::isTaskPending`). Si el producto necesita más
estados en el futuro (`IN_PROGRESS`, `BLOCKED`, ...), esa es una decisión de
producto que debe tomarse explícitamente, no inferirse aquí.

**5. `Activity.type` es texto libre, no un enum de Postgres — a diferencia
de `organization_role` y `case_status`.**
La lista de tipos de actividad va a seguir creciendo en cada fase futura
(Messaging, Knowledge, AI añaden los suyos). Extender un enum de Postgres
requiere una migración `ALTER TYPE ... ADD VALUE` por cada tipo nuevo;
extender una validación de aplicación (`ActivityType` en
`src/modules/audit/service.ts`) es un cambio de código sin migración. Para
un conjunto pequeño y estable como el rol o el estado de un Case, el enum
de Postgres es la opción correcta (validación en la base de datos); para
uno abierto y creciente como los tipos de actividad, no lo es.

**6. `Activity.entity_type`/`entity_id` son una referencia polimórfica sin
foreign key.**
La alternativa — una columna FK nullable por cada tipo de entidad
auditable (`contact_id`, `case_id`, `task_id`, y en el futuro
`conversation_id`, `message_id`, `ai_suggestion_id`, ...) — obligaría a
migrar la tabla `activities` cada vez que se audite un tipo de entidad
nuevo. Se acepta perder la integridad referencial de la base de datos en
este punto concreto a cambio de que `activities` no cambie de forma cuando
llegue Messaging/Knowledge/AI.

**7. Se evaluó y se descartó dar de baja registros (`Contact`/`Case`/
`Task`) en este paquete.**
El encargo pide CRUD pero no especifica semántica de borrado (¿duro?
¿blando? ¿con qué implicaciones de auditoría?). `Case` ya tiene un estado
natural de cierre (`CLOSED`/`RESOLVED`) que cumple la misma función sin
decidir esa semántica todavía. PKG-002 implementa crear/listar/ver/editar
para las tres entidades, sin eliminar — se retoma cuando el producto lo
pida explícitamente.

**8. `server-only` se stubea en los tests (`vitest.config.mts`,
`tests/stubs/server-only.ts`).**
El paquete `server-only` (añadido en PKG-002 para marcar
`src/db/client.ts` y los `service.ts`/`bootstrap.ts` de cada módulo como
"no importable desde un Client Component") lanza una excepción
incondicional cuando se importa fuera del bundler de Next.js — incluyendo
bajo Vitest, que corre en Node plano. Sin un alias, cualquier test que
importe un service module (incluidos los de PKG-001, `auth.ts`) rompe. Se
alía `"server-only"` a un módulo vacío solo para los tests; la protección
real sigue intacta en el build/dev real de Next.js, que es donde importa.

---

## 2026-09-18 — PKG-002 (CRM básico): cerrado

Todos los *acceptance criteria* de `project/CURRENT_TASK.md` verificados:
build, lint, typecheck, 27 tests unitarios/integración en verde (incluyendo
aislamiento multi-tenant explícito), 3 E2E de Playwright en verde
(auth de PKG-001 + flujo completo de Contact→Case→Task + aislamiento entre
dos organizaciones a nivel de UI). Bootstrap de Organization al registrarse
verificado manualmente contra PostgreSQL real antes de escribir los tests
automatizados. Ver `project/PROGRESS.md` y `project/TASKS.md`. Siguiente
paso: decidir con el usuario el alcance de `PKG-003` (candidato natural:
Messaging core, que recupera `Conversation`/`conversation_cases` diferidas
en la decisión 1 de esta misma fecha).

---

## 2026-09-18 — Fix: login "silencioso" para cuentas sin Organization + condición de carrera al autorepararlo

**Incidente reportado por el usuario:** al iniciar sesión con su cuenta real
(creada antes de que el bootstrap automático de Organization de PKG-002
existiera), volvía a la pantalla de login sin ningún mensaje de error, pese
a tener el usuario y la contraseña correctos.

**Causa raíz:** `getCurrentOrganizationMember()`
(`src/modules/organizations/service.ts`) devolvía `null` si la sesión
existía pero no había fila en `organization_members` — exactamente el caso
de cualquier cuenta creada antes del hook de bootstrap de PKG-002 (o de
cualquier fallo futuro de ese hook). El layout `(app)` interpreta un
`null` como "no autenticado" y redirige a `/login` sin distinguir "no hay
sesión" de "hay sesión pero falta la organización" — desde fuera, un login
correcto se veía exactamente igual que uno incorrecto.

**Fix 1 — autoreparación:** `getCurrentOrganizationMember()` ahora, si
encuentra una sesión válida sin membership, llama a
`bootstrapOrganizationForUser()` sobre la marcha y vuelve a consultar. Así
cualquier cuenta huérfana se repara sola la próxima vez que inicia sesión,
sin intervención manual.

**Fix 2 — la autoreparación en sí tenía una condición de carrera real,
detectada al verificar el Fix 1 manualmente (no en un test, en la propia
verificación):** dos Server Components de la misma petición (el layout
`(app)` y la página que envuelve) pueden invocar
`getCurrentOrganizationMember()` en paralelo para la misma sesión huérfana,
y ambos intentaban crear una Organization a la vez — un usuario real
acabó con dos organizaciones distintas durante la prueba. Se añadió una
restricción `UNIQUE(user_id)` en `organization_members`
(`organization_members_user_unique`, migración `0002_nice_blacklash.sql`),
formalizando una invariante que ya estaba documentada pero no forzada a
nivel de base de datos ("un usuario tiene exactamente una organización en
este modelo MVP", `docs/DECISIONS.md` entrada de PKG-002 nº2).
`bootstrapOrganizationForUser()` ahora crea la Organization y su membership
dentro de una transacción; si pierde la carrera contra otra llamada
concurrente, la restricción única hace fallar el `insert` de
`organization_members`, la transacción entera revierte (sin dejar una
`organizations` huérfana) y la función devuelve `null` — el llamador
vuelve a consultar y recibe la fila de quien ganó la carrera.

**Detalle no obvio que costó una segunda vuelta:** el primer intento de
capturar "es una violación de unicidad de Postgres" comprobaba
`error.code === '23505'`, pero Drizzle envuelve cualquier error del driver
en `DrizzleQueryError`, cuyo `.cause` es el error real de `postgres.js`
— el código vive ahí, no en el objeto que se captura directamente. El fix
comprueba ambos niveles.

**Verificado:** 5 peticiones concurrentes a `/dashboard` con una sesión sin
organización, antes del fix, devolvían error 500 en 2 de las 5 (por la
condición de carrera sin capturar) aunque no duplicaban la fila gracias al
constraint; después del fix, las 5 devuelven 200 y queda exactamente una
Organization. Test de regresión en
`tests/integration/organizations.test.ts` (llama a
`bootstrapOrganizationForUser` 8 veces en paralelo para el mismo usuario y
comprueba que solo una sobrevive, sin filas huérfanas). Cuenta real del
usuario sin tocar manualmente — se autorepara en su próximo login.

---

## 2026-09-18 — PKG-003 (Messaging core, backend): decisiones técnicas de implementación

Contexto: el usuario eligió el alcance "backend completo, sin UI de Inbox"
para `PKG-003` (la Unified Inbox queda como `PKG-004`). No existe ningún
proveedor real (`WhatsAppAdapter`/`TelegramAdapter`) porque la Fase 0 (PoC)
sigue pendiente, así que todo el pipeline se construye y prueba contra la
interfaz `MessagingAdapter` y un adapter falso interno.

**1. `MessagingAdapter.handleWebhook(payload: unknown)` se divide en
`verifyWebhookSignature` + `parseWebhookEvents`.**
El pseudocódigo de `docs/ARCHITECTURE.md` sección 4 tenía un único método de
webhook, pero validar una firma requiere el body crudo y los headers *antes*
de parsear nada — un `payload: unknown` ya parseado no lo permite, y el
pipeline exige exactamente ese orden (`docs/ARCHITECTURE.md` sección 7:
validar firma → persistir → responder → normalizar). Se dividió en dos
métodos llamados en ese orden por `src/modules/messaging/webhook-service.ts`.
No es un cambio de requisito de producto, solo una corrección de una
interfaz que, tal como estaba escrita, no podía implementarse correctamente.

**2. Registro de adapters por canal, vacío en producción en este paquete.**
`src/modules/messaging/registry.ts` mapea `channel → MessagingAdapter`. En
PKG-003 no se registra ningún canal real (Fase 4/5 lo harán). Solo los tests
registran un `FakeMessagingAdapter` (`tests/fakes/messaging-adapter.ts`) para
probar el pipeline completo; nada en el código de producción lo registra, así
que es inalcanzable desde una petición real — verificado manualmente con
`curl` contra `next dev`: cualquier canal devuelve 404.

**3. No se introduce pg-boss/Inngest todavía — se usa `after()` de
`next/server`.**
`docs/ARCHITECTURE.md` sección 8 prevé un worker para procesamiento de
webhooks, pero sin tráfico real de ningún proveedor conectado no hay
necesidad concreta de esa infraestructura (CLAUDE.md sección 2). `after()`
(Next.js 15.1+, estable) cumple el contrato real que se necesita ahora mismo
("responder 200 → procesar después, sin bloquear el request") sin añadir un
proceso worker ni una tabla de jobs. Limitación aceptada: si el proceso
muere a mitad de un `after()`, el `WebhookEvent` queda con
`processed_at = NULL` sin reintento automático — aceptable mientras no haya
tráfico real; se revisita cuando lo haya.

**4. `channel` en `MessagingAccount`/`Conversation`/`WebhookEvent` es texto
libre, no un enum de Postgres.**
Misma razón que `Activity.type` (entrada de PKG-002 más arriba): la lista de
canales sigue creciendo (Telegram, WhatsApp, email, SMS...) y un enum de
Postgres es costoso de extender. Se valida en la capa de aplicación contra
el registro de adapters del punto 2 — no puede haber una `MessagingAccount`
con un canal para el que no exista un adapter implementado.

**5. `Message.body` y `Message.sourceWebhookEventId` se añaden al
pseudocódigo de `docs/DATABASE.md` sección 8.**
El pseudocódigo original no incluía ninguna columna de contenido — un
`Message` sin texto no sirve para nada (no se puede mostrar ni reenviar).
`sourceWebhookEventId` (FK nullable a `webhook_events`) sustituye al
`raw_event_reference` mencionado en la sección 17: como el evento crudo ya
es una fila propia en esta misma base de datos, una FK real es mejor que una
referencia string a un sistema externo que no existe. Nula en mensajes
salientes (no vienen de ningún webhook).

**6. `webhook_events` guarda el body crudo inline (texto), no una referencia
a almacenamiento externo (S3).**
`docs/DATABASE.md` sección 17 sugiere `raw_event_reference`, que podría leerse
como un puntero a un objeto externo. Se descarta introducir S3/object
storage para esto sin una necesidad concreta (CLAUDE.md sección 2/8) dado el
volumen esperado (mensajes de texto cortos, no adjuntos grandes — eso, si
llega, es una decisión aparte cuando exista).

**7. Mensaje entrante de remitente desconocido: se crea un `Contact` mínimo
automáticamente, sin fusión/detección de duplicados.**
`docs/PRODUCT.md` sección 4: "un mensaje de un Contact desconocido no se
pierde: entra como Contact → Unassigned". Sin UI de Inbox en este paquete,
no existe un concepto de "Unassigned" que mostrar — la garantía que sí
implementa el backend es que la `Conversation` y el `Message` siempre se
crean, con un `Contact` cuyo nombre es el display name que dé el proveedor,
o si no lo hay, el teléfono, o si no, el identificador externo crudo (nunca
se inventa un nombre). Sin fusión automática de identificadores distintos
(deferido, igual que en PKG-002) — cualquier "Unassigned" visible y
asignación manual es trabajo de `PKG-004` (Inbox).

**8. Condición de carrera en la creación de `Conversation`+`Contact` resuelta
con el mismo patrón que `bootstrapOrganizationForUser`.**
Dos webhooks concurrentes para la misma conversación nueva podían crear dos
Contacts (uno de ellos huérfano). Se extrajo `isPostgresUniqueViolation` de
`src/modules/organizations/bootstrap.ts` a `src/db/errors.ts` (sin cambiar su
comportamiento) y se reutiliza en
`src/modules/conversations/service.ts::findOrCreateConversation`: Contact +
Conversation se crean en una transacción; si pierde la carrera contra la
restricción `UNIQUE(messaging_account_id, external_conversation_id)`, la
transacción entera revierte (sin Contact huérfano) y se relee la fila
ganadora.

**Supersede a:** nada — extiende el modelo de `Conversation`/
`conversation_cases`/`Task.conversation_id` cuya creación se difirió en la
entrada de PKG-002 (punto 1) hasta este paquete.

---

## 2026-09-18 — PKG-004 (Unified Inbox): decisiones técnicas de implementación

Contexto: el usuario confirmó el alcance completo de `PKG-004` (Unified
Inbox: listado/filtros/no leídos, composición de respuesta, marcado de
`Contact → Unassigned`, UI de conexión de canal). Al construirlo aparecieron
varias decisiones de diseño y, más importante, **tres bugs reales
pre-existentes** (ninguno introducido por este paquete) descubiertos al
intentar probar el flujo end-to-end contra un build de producción real.

**1. Esquema: `contacts.is_unassigned` y `conversations.last_read_at`.**
Ver `docs/DATABASE.md` secciones 4 y 7. `is_unassigned` se pone a `true`
solo en la creación automática de Contact desde un remitente desconocido
(`findOrCreateConversation`); `last_read_at` no tiene granularidad por
usuario en este MVP (un solo valor compartido por organización, mismo nivel
de simplicidad que el resto del modelo de permisos).

**2. "Reasignar" mueve la Conversation a un Contact existente, sin fusionar
ni eliminar el Contact mínimo original.** `docs/PRODUCT.md` sección 4
describe "identificarlo, crear un Contact nuevo, fusionarlo o asignarlo"
para un remitente desconocido. Fusión real (trasladar Cases/Tasks/Activity
de un Contact a otro y eliminar el sobrante) es una pieza de producto no
trivial (¿qué pasa con el historial? ¿qué Contact "gana"?) que no estaba
pedida con ese detalle — se implementa solo la reasignación de la
Conversation, dejando el Contact original huérfano sin datos que perder
(nunca tuvo Cases/Tasks propios, es minúsculo por construcción). Fusión real
queda explícitamente fuera de alcance (`project/CURRENT_TASK.md`).

**3. Endurecimiento de `connectMessagingAccount`: valida que `delegateId`
sea miembro de la organización.** Encontrado al construir `/channels`, el
primer llamador real de esa función fuera de tests — sin el check, un
`delegateId` de un usuario ajeno a la organización se aceptaba sin validar
(mismo patrón de defensa en profundidad que `cases/service.ts`).

**4. Bug real #1 — un `Map` a nivel de módulo no es un singleton bajo
Turbopack en producción.** `src/modules/messaging/registry.ts` (PKG-003)
guardaba los adapters registrados en un `const adapters = new Map()` a
nivel de módulo, asumiendo que import = misma instancia en todo el proceso
(cierto bajo Vitest, un solo proceso Node sin bundling). Al construir
`src/instrumentation.ts` para que Playwright pudiera registrar
`FakeMessagingAdapter` contra un build real (`next build && next start`),
se comprobó empíricamente (logging temporal con un id aleatorio por
instanciación de módulo) que Turbopack da a `instrumentation.ts` y a una
ruta/página **instancias de módulo separadas** — lo registrado desde una es
invisible desde la otra. Fix: `registry.ts` ahora guarda el `Map` en
`globalThis` (`globalThis.__kindlyMessagingAdapters`), lo único que
realmente comparten todos los chunks del mismo proceso Node.

**5. Bug real #2 (más grave, pre-existente desde PKG-001) — el pool de
conexiones de PostgreSQL solo se cacheaba en `globalThis` fuera de
producción.** `src/db/client.ts` tenía
`if (process.env.NODE_ENV !== "production") { global.__kindlyPostgresClient
= client; }` — razonado en su momento solo para sobrevivir al HMR de
`next dev`. Por el mismo motivo del punto 4, cada chunk que toca la base de
datos en un build de producción real bajo Turbopack obtiene su propia
instancia de `src/db/client.ts`, y con ese guard, **cada una abría su propio
pool de hasta 10 conexiones** en vez de compartir uno. Esto es la causa raíz
real de una intermitencia que parecía (y casi se documentó como) una
condición de carrera en `bootstrapOrganizationForUser`/
`getCurrentOrganizationMember`: bajo carga de arranque en frío, suficientes
pools abriéndose a la vez agotaban momentáneamente la capacidad de conexión
real. Fix: se cachea en `globalThis` en todos los entornos, sin la condición
de `NODE_ENV`.

**6. Bug real #3 (la causa raíz de la inestabilidad de los E2E, no una
condición de carrera) — el rate limiting de Better Auth solo está activo en
producción.** Better Auth limita por defecto `/sign-up`, `/sign-in`, etc. a
3 peticiones cada 10s por IP, pero **solo cuando está en producción** — algo
documentado en su propio tipo (`BetterAuthRateLimitOptions.enabled`), nunca
visible en `next dev` (por eso nunca se vio en PKG-001/002/003). Como
`playwright.config.ts` siempre arrancó el servidor con
`next build && next start` (producción real) desde PKG-001, este límite
estuvo activo en todos los E2E desde el principio; `PKG-004` simplemente
añadió suficientes registros nuevos (`tests/e2e/inbox.spec.ts`) para que la
suite completa superase las 3 peticiones en 10s desde la misma IP de forma
consistente, hasta entonces solo latente. Verificado con reproducción
directa por HTTP (fuera de Playwright): el 4º registro en menos de 10s
devuelve 429 del propio Better Auth, y el cliente simplemente se queda en
`/login` mostrando el error — exactamente el síntoma observado ("esperaba
`/dashboard`, recibió `/login`"), sin ningún 500 ni fallo real de sesión.
Fix: `rateLimit: { enabled: process.env.DISABLE_AUTH_RATE_LIMIT !== "true"
}` en `src/modules/auth/auth.ts`; esa variable la fija únicamente
`playwright.config.ts` (`webServer.env`) — ausente en cualquier despliegue
real, donde el rate limiting por defecto de Better Auth sigue intacto.

**Por qué se documentan los tres bugs con este nivel de detalle:** ninguno
lo introdujo este paquete, pero los tres solo se manifestaban bajo
condiciones que PKG-004 fue el primero en ejercitar de verdad (un
`instrumentation.ts` real, y una suite de E2E lo bastante grande como para
chocar con el rate limit). Sin este registro, una sesión futura podría
volver a "descubrirlos" desde cero, o peor, reintroducir el guard de
`NODE_ENV` en `db/client.ts` pensando que es una limpieza inocente.

**7. Canal de pruebas E2E controlado por variable de entorno
(`E2E_FAKE_MESSAGING_CHANNEL`).** `src/instrumentation.ts` registra
`FakeMessagingAdapter` (movido de `tests/fakes/` a
`src/modules/messaging/testing/fake-adapter.ts` porque necesita ser
importable desde `src/`) solo si `process.env.E2E_FAKE_MESSAGING_CHANNEL
=== "true"`. Esa variable la fija únicamente `playwright.config.ts`. Riesgo
aceptado y acotado: si alguna vez se filtrara a un despliegue real, lo único
que expone es un adapter falso sin credenciales ni efectos externos reales
(no una vulnerabilidad de datos) — nunca aparece en `.env.example` ni en
ninguna configuración de despliegue documentada.

**Supersede a:** nada de lo anterior — extiende el modelo de `Contact`/
`Conversation` de PKG-002/003 y corrige (sin cambiar su contrato público)
`src/db/client.ts` (PKG-001) y `src/modules/messaging/registry.ts` (PKG-003).

---

## 2026-09-19 — WhatsApp: se adopta coexistence (Alternativa A). Riesgo crítico cerrado

**Contexto:** la entrada del 2026-09-17 ("Riesgo crítico: identidad de
comunicación de WhatsApp") dejó el `WhatsAppAdapter` bloqueado a la espera de
una PoC que confirmase si "coexistence" existía de verdad. El usuario aportó
una observación decisiva: **GoHighLevel tiene el flujo en producción**, y
describió su UX completa (activación de la integración con coste repercutido
al usuario; pantalla de elección entre conectar tu WhatsApp / crear una cuenta
nueva / migrar desde otro BSP; pantalla previa de advertencias —código de
país, número en el Business Manager de Meta, uso de WhatsApp Business App,
sincronización de historial de 6 meses—; redirección a Facebook; vuelta con el
número conectado).

Eso convirtió la pregunta "¿existe?" en "¿qué implica?". Se verificó contra la
documentación oficial de Meta (no contra el prompt original ni por
extrapolación, según `CLAUDE.md` sección 3).

**Decisión:** se adopta la **Alternativa A** de `docs/INTEGRATIONS.md` sección
2.2 — **coexistence vía Embedded Signup**, con el evento
`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, saltándose el registro del número.
El `DELEGATE` conserva su número y su WhatsApp Business App en el móvil, y
Kindly sincroniza por detrás. **El principio 1 de `CLAUDE.md` (identidad de
comunicación del profesional) queda satisfecho sin excepciones ni
sustituciones.** No se adoptan las alternativas B (número dedicado por
delegado) ni C (número centralizado de organización).

**Verificado (documentación oficial de Meta, consultada el 2026-09-19):**

- Coexistence está disponible en producción desde mayo de 2025, y desde abril
  de 2026 Embedded Signup es la vía por defecto para altas nuevas.
- Requisitos del número: WhatsApp **Business App** 2.24.17 o superior, y que
  el número **no esté ya registrado solo en Cloud API**.
- Sincronización de historial: **180 días**, solo chats 1:1 (sin grupos), en
  tres fases (día 0-1, 1-90, 90-180). Los adjuntos solo llegan para mensajes
  de los **últimos 14 días**.

**Requisito de plataforma que condiciona todo el calendario:** para ofrecer
este flujo, **Kindly debe ser Tech Provider o Solution Partner de Meta**, estar
ya usando Cloud API, e implementar Embedded Signup **con session logging**.
Además, para coexistence **no sirve la verificación de negocio clásica**: solo
Partner-Led Business Verification o Meta Verified, y **no hay cuenta oficial
(badge azul)**. Esto no es trabajo de código: es un alta nuestra ante Meta y es
el camino crítico real de la Fase 5.

**Hallazgos que obligan a cambiar diseño ya existente** (esto es lo que
justifica registrar la decisión ahora y no al empezar el paquete):

1. **La ventana de 24 h se comporta al revés de lo intuitivo.** Los mensajes
   que el delegado envía **desde su móvil no abren ni extienden** la ventana de
   servicio de Cloud API; solo la abre un mensaje entrante del usuario a la
   cuenta ya onboardeada. El delegado puede ver un hilo vivo en su teléfono
   mientras el Inbox de Kindly no puede responder en texto libre. Esa
   disonancia debe tratarse explícitamente en la UI de composición, no
   descubrirse en producción.
2. **`smb_message_echoes` rompe el modelo de eventos actual.** Cada mensaje que
   el delegado envía desde la Business App vuelve como eco por webhook. El tipo
   `NormalizedInboundEvent` de `src/modules/messaging/adapter.ts` solo
   contempla `MESSAGE` (entrante) y `DELIVERY_UPDATE`: **no existe el caso
   "mensaje saliente que Kindly no originó"**. Hace falta un tercer tipo de
   evento, y es además el principal riesgo de duplicación (un mensaje enviado
   desde Kindly podría volver como eco).
3. **Hay un plazo duro de 24 horas.** Tras el onboarding hay **24 h para
   sincronizar el historial o el cliente debe ser dado de baja**. Eso no cabe
   en el `after()` de Next.js que usa hoy
   `src/app/api/webhooks/[channel]/[accountId]/route.ts`: es trabajo en
   background real y reintentable. **Este es el primer caso de uso concreto que
   podría justificar pg-boss/Inngest** según el criterio de
   `docs/ARCHITECTURE.md` ("No construir todavía" exige necesidad demostrada:
   aquí ya la hay).
4. **El botón "Desconectar" de `/channels` no puede funcionar para WhatsApp.**
   Para números en coexistence **no se puede usar la Deregister API**: el
   negocio se desconecta a mano desde su móvil y Kindly se entera por un
   webhook `account_update` con `PARTNER_REMOVED`. El método
   `disconnectAccount` de `MessagingAdapter` no tiene equivalente real en este
   canal; `src/app/(app)/channels/page.tsx` necesita rediseño para no prometer
   una acción que no existe.
5. **Suscripciones de webhook obligatorias: tres**, no una — `history`,
   `smb_app_state_sync` (contactos) y `smb_message_echoes`. La de contactos
   mapea contra nuestro modelo `Contact` y mitiga parcialmente el caso
   "remitente desconocido" de PKG-003.
6. **Pérdidas de funcionalidad en el móvil del delegado**, que deben aparecer
   en la pantalla de advertencias previa a conectar: se desactivan mensajes
   temporales, "ver una vez", ubicación en directo y listas de difusión; y
   WhatsApp para Windows y WearOS **se desvinculan** durante el onboarding.
7. **Coste.** Los mensajes enviados desde la Business App del móvil siguen
   siendo gratis; los enviados vía Cloud API (es decir, los que salgan del
   Inbox de Kindly) se facturan a tarifa Cloud API normal. Esto es lo que en
   GoHighLevel aparece como coste repercutido al usuario de la cuenta. **No
   implica construir billing** (sigue en "no construir todavía"), pero sí que
   el flujo de activación lo advierta.

**No verificado — pendiente al construir, no asumir:**

- **La lista de países/regiones no soportados** (el "country code check" del
  flujo de GoHighLevel). Que existen restricciones regionales es cierto; la
  lista oficial enumerada no se localizó. **No se hardcodea desde un blog**: se
  consulta la fuente oficial en el momento de implementar.
- **El throughput.** La documentación de Meta indica **20 mensajes/segundo**
  fijos para números en coexistence; documentación de un BSP indica 5.
  Discrepancia sin resolver, irrelevante para el volumen previsto pero
  registrada para que no sorprenda.
- **Embedded Signup v2 se deprecia el 8 de octubre de 2026.** Kindly no tiene
  ninguna implementación previa, así que se implementa **v4 directamente** —
  se anota para no seguir tutoriales desactualizados.
- El encaje del **Meta Business Manager de la organización** con el número
  personal del delegado: el número debe añadirse al BM de la organización, lo
  que le da control administrativo sobre un número personal. Encaja con el
  principio 1, pero tiene lectura legal/laboral. **Aplazado explícitamente por
  el usuario el 2026-09-19** ("luego vemos el tema del BM de la org"); se
  decide antes de abrir el paquete de Fase 5.

**Alternativas consideradas:** B (número de Cloud API dedicado por delegado) y
C (número centralizado de la organización), ambas descritas en
`docs/INTEGRATIONS.md` sección 2.2. Se descartan porque A está confirmada como
disponible y es la única que no rompe, ni parcialmente, el principio de
identidad de comunicación del profesional. Quedan documentadas como plan de
repliegue por si el alta como Tech Provider resultara inviable.

**Efecto sobre la Fase 0:** la PoC de WhatsApp **no se cancela, se reenfoca**.
Ya no tiene que responder "¿existe coexistence?" (respondido), sino "¿funciona
para nuestro caso concreto?": alta como Tech Provider, Embedded Signup v4 con
un número real en Business App, y comprobación de los puntos 1-6 de arriba.
Sigue siendo trabajo manual del usuario, sin fecha, y sigue sin bloquear
paquetes que no sean el `WhatsAppAdapter`.

**Supersede a:** la sección "Riesgo crítico: identidad de comunicación de
WhatsApp" de la entrada del 2026-09-17, cuyo estado era "pendiente de PoC" y
que dejaba sin decidir la elección entre A/B/C. Esa entrada se mantiene intacta
como registro histórico; esta la resuelve.

---

## 2026-09-20 — PKG-005 (en curso): eco de salientes de coexistence

Primer bloque de `PKG-005` (ver `project/CURRENT_TASK.md`): los mensajes que
el `DELEGATE` escribe desde su propio móvil y que el proveedor nos devuelve
como eco (`smb_message_echoes`).

**1. Tipo de evento nuevo, no reutilizar `MESSAGE`.** Se añade
`NormalizedOutboundEcho` (`kind: "OUTBOUND_ECHO"`) a la unión
`NormalizedInboundEvent` en `src/modules/messaging/adapter.ts`. Un eco es
OUTBOUND pero Kindly no lo originó, así que no cabe en
`NormalizedInboundMessage` sin mentir sobre la dirección. Lleva los mismos
campos de contacto que un entrante **a propósito**: un eco puede ser lo
primero que Kindly ve de una conversación, cuando el delegado inicia un chat
nuevo desde su teléfono, así que necesita poder crear Contact y Conversation
igual que un mensaje entrante.

**2. Cómo se distingue el origen: columna explícita `messages.sent_from_device`
(boolean, `NOT NULL DEFAULT false`), no derivarlo.** La alternativa evaluada
era derivarlo de `direction = OUTBOUND AND source_webhook_event_id IS NOT
NULL`, que no habría necesitado migración y no tiene riesgo de desincronizarse
por ser un dato calculado.

Se descarta por el punto 3: con un dato derivado, la carrera entre el envío y
su eco solo se podría corregir **destruyendo la procedencia** del webhook
(poniendo `source_webhook_event_id` a NULL). La columna explícita permite
corregir exactamente el flag que importa y no tocar nada más. Además se lee
directamente en la UI sin que cada llamador tenga que recordar la regla.

Se eligió booleano y no un enum: la pregunta real que responde la columna es
binaria ("¿lo escribió en su móvil?"), y para un mensaje INBOUND cualquier
enum de origen tendría un valor sin sentido. Mismo criterio que llevó a no
inventar un enum para `Case.priority` en PKG-002.

**3. La carrera entre `sendOutboundMessage` y el eco — y por qué
`onConflictDoUpdate`.** El proveedor solo hace eco de un mensaje que ya
aceptó, pero ese eco puede llegar y procesarse **antes** de que commitee el
`INSERT` de `sendOutboundMessage`. Con el `onConflictDoNothing` original, el
eco se quedaba con la fila y el mensaje aparecía para siempre como escrito en
el móvil, cuando se había compuesto en Kindly.

`sendOutboundMessage` pasa a `onConflictDoUpdate` fijando **solo**
`sentFromDevice: false` (y `updatedAt`). En particular **no** toca
`deliveryStatus`: un callback `DELIVERED`/`READ` puede habernos adelantado
también, y sobrescribirlo con `SENT` sería una regresión de estado. Cubierto
por el test "labels the message as composed in Kindly even when its echo
arrives first".

**4. Idempotencia: no hace falta nada nuevo.** El
`unique(messaging_account_id, external_message_id)` que ya existía desde
PKG-003 hace doble trabajo aquí: absorbe el webhook reentregado **y** el caso
que de verdad importa en este canal — que un mensaje enviado desde Kindly
vuelva como eco. `insertEchoedMessage` usa `onConflictDoNothing` y devuelve
`created: false`, así que no hay fila duplicada ni segunda Activity.

**5. `MESSAGE_SENT_FROM_DEVICE` como `ActivityType` propio.** No se reutiliza
`MESSAGE_SENT`: nadie actuó dentro de Kindly, no hay `actorUserId`, y
fusionarlos haría imposible distinguir en el historial lo que hizo el
profesional desde la app de lo que hizo desde su teléfono. `Activity.type` es
texto libre en base de datos (decisión de PKG-002), así que no hay migración.

**Nota sobre la suite E2E (no es un cambio de código).** Los E2E fallaron al
principio de esta sesión por una causa ajena al paquete: `playwright.config.ts`
usa `reuseExistingServer: !process.env.CI`, y había un `next-server` levantado
desde hacía 23 horas ocupando el puerto 3000. Playwright se enganchó a él, y
ese proceso no tenía `E2E_FAKE_MESSAGING_CHANNEL` (sin ella no se registra el
canal `fake`) ni `DISABLE_AUTH_RATE_LIMIT` (sin ella el rate limiting de
Better Auth tumba los tests que registran dos usuarios seguidos). Verificado
haciendo `git stash`: los mismos 3 tests fallaban en árbol limpio. Con el
puerto libre, los 6 E2E pasan. **Si vuelve a ocurrir, ése es el primer sitio
donde mirar** — el síntoma (no existe el selector "Canal") no apunta en
absoluto a su causa.

**Supersede a:** nada. Extiende `MessagingAdapter` (PKG-003) y el modelo de
`Message` (PKG-003) sin romper sus contratos — `sent_from_device` tiene
default, y el tipo de evento nuevo es un miembro más de una unión que los
adapters existentes no emiten.

---

## 2026-09-20 — PKG-005 cerrado: capacidades de canal, historial, ventana y desconexión externa

Resto de `PKG-005`, tras el eco de salientes (entrada anterior de hoy).

**1. Las particularidades del proveedor se declaran como capacidades, no se
consultan por nombre.** Se añade `MessagingChannelCapabilities` a
`MessagingAdapter`:

```
serviceWindowHours: number | null   -- null = el canal no tiene ventana
canDisconnect: boolean              -- false = Kindly no puede terminar la conexión
```

La alternativa era que el dominio y la UI preguntasen `if (channel ===
"whatsapp")`, que es exactamente lo que prohíbe `CLAUDE.md` sección 2. Ambas
existen porque coexistence las responde distinto de cualquier otro canal; un
`TelegramAdapter` futuro declarará `{ serviceWindowHours: null,
canDisconnect: true }` y ni el dominio ni la UI cambian.

**2. La ventana de servicio se calcula solo desde el último mensaje
ENTRANTE.** `getServiceWindowState(lastInboundAt, serviceWindowHours, now)` en
`conversations/domain.ts`, puro y sin I/O.

Éste es el punto que más fácil habría sido equivocar: lo intuitivo es usar "el
último mensaje" de la conversación, y habría estado mal. En coexistence los
mensajes que el delegado escribe desde su móvil llegan como salientes y **no
abren ni extienden** la ventana de Cloud API (`docs/INTEGRATIONS.md` sección
2.4). Calcularla sobre el último mensaje de cualquier dirección reportaría
"ventana abierta" sobre conversaciones a las que Kindly no puede responder, y
el fallo aparecería como un error del proveedor al enviar, no como un bug
nuestro. Hay un test dedicado (`does not let the delegate's own phone reopen a
closed window`).

`sendOutboundMessage` además **rechaza** el envío con la ventana cerrada. La
UI ya oculta el compositor, pero registrar un mensaje que el proveedor va a
rechazar dejaría la conversación mintiendo.

**3. El historial importado no es novedad.** Tres consecuencias, todas
deliberadas:

- **No marca la conversación como no leída.** Importar 180 días dejaría el
  Inbox como un muro de conversaciones sin leer que nadie ha dejado sin leer.
  `markConversationReadUpTo` marca leído hasta la fecha del propio mensaje
  importado, **nunca hacia atrás**: una conversación que el usuario ya abrió
  se queda donde la dejó, y una fase posterior del historial no puede
  "des-leerla". Un mensaje en vivo realmente nuevo sigue apareciendo sin leer
  (test dedicado).
- **No genera una Activity por mensaje.** El feed de actividad no es un
  volcado del historial.
- **Un saliente importado es siempre `sentFromDevice: true`**: es anterior a
  la conexión, así que por definición Kindly no lo compuso.

**4. La desconexión que Kindly no inicia.** Tipo de evento
`ACCOUNT_DISCONNECTED` (nombre genérico, no `PARTNER_REMOVED`, que es
vocabulario de Meta) y `applyProviderDisconnection`, que deja la cuenta en
`DISCONNECTED` con `actorUserId: null` — nadie actuó aquí — y es idempotente
ante reentrega.

Simétricamente, `disconnectMessagingAccount` **lanza** si el canal declara
`canDisconnect: false`, en vez de marcar la fila como desconectada: la
conexión seguiría viva en el proveedor y el estado de Kindly sería falso.
`/channels` sustituye el botón por "Se desconecta desde el móvil del
delegado", que es lo que de verdad hay que hacer.

**5. Cambio de alcance registrado.** El punto 5 del Scope original de
`PKG-005` (flujo de conexión de canal con advertencias previas) **sale de este
paquete** y pasa a `PKG-008` en `project/TASKS.md`, donde se desglosó con el
detalle que pidió el usuario el 2026-09-20. No se ha dejado sin hacer: se ha
movido a un paquete propio porque creció.

**Nota operativa: la suite E2E y el puerto 3000, segunda vez.** Hoy volvieron
a fallar los E2E, con otra causa distinta de la de ayer pero el mismo
mecanismo: `playwright.config.ts` usa `reuseExistingServer: !process.env.CI`,
así que **cualquier** servidor en el puerto 3000 se reutiliza — incluido uno
que arrancó la propia Playwright en una ejecución anterior y que quedó vivo
con un build **antiguo**, sin el código recién escrito. El síntoma vuelve a
no apuntar a la causa (tests que fallan por UI "inexistente" que sí existe en
el fuente). Regla práctica: si los E2E fallan de forma inexplicable,
`ss -ltnp | grep :3000` antes que nada. Queda como candidato a endurecer la
configuración en un paquete futuro.

**Supersede a:** nada. Extiende `MessagingAdapter` con `capabilities` — un
miembro nuevo obligatorio de la interfaz, que solo implementa hoy
`FakeMessagingAdapter` porque no hay ningún adapter real todavía.

---

## 2026-09-20 — PKG-006: invitaciones y miembros de la organización

**Contexto.** Al desglosar la integración de WhatsApp en ajustes del delegado
(petición del usuario del 2026-09-20) apareció un bloqueo que no estaba
registrado: `bootstrapOrganizationForUser` creaba una Organization por
usuario con rol `ADMIN`, y **no existía ningún flujo de invitación**. Toda
organización tenía exactamente un miembro, el rol `DELEGATE` no lo tenía
nadie, y el selector de Delegate de `/channels` siempre ofrecía una sola
opción. "El administrador o el delegado" era, literalmente, la misma persona.

**Decisión: la invitación se vincula por email, no por token.** El token de
`/invite/<token>` solo direcciona la página; lo que convierte la invitación en
membresía es que el email de la cuenta recién creada coincida con el de una
invitación pendiente, comprobado en el hook de creación de usuario de Better
Auth.

La alternativa era arrastrar el token por el flujo de registro (query param,
cookie o estado) hasta poder canjearlo tras crear la cuenta. Se descarta
porque el registro lo gestiona Better Auth, no nosotros: meter estado propio
en medio significa que un registro por cualquier otra vía (o un fallo a mitad)
deja la invitación colgada. Emparejar por email hace que el camino funcione
igual venga de donde venga la cuenta, y es idempotente.

Consecuencia aceptada: quien acepta debe registrarse **con el email exacto al
que se le invitó**. Por eso el campo de email de `/invite/<token>` es de solo
lectura — si se pudiera cambiar, la persona acabaría en silencio como ADMIN de
una organización nueva y vacía en vez de en la que la invitó.

**Decisión: `ensureOrganizationForUser` como único punto de entrada.** Antes
el hook de registro llamaba directamente a `bootstrapOrganizationForUser`, y
la autorreparación de `getCurrentOrganizationMember` también. Ahora ambos
pasan por `ensureOrganizationForUser`, que intenta primero aceptar una
invitación y solo crea organización propia si no hay ninguna. Tener dos sitios
decidiendo qué significa "tiene organización" era exactamente el tipo de
divergencia que causó el incidente del login silencioso del 2026-09-18.

**Límite real, mostrado y no escondido: una persona = una organización.** La
restricción `organization_members_user_unique` (introducida en el fix de la
condición de carrera del 2026-09-18) impide que un usuario pertenezca a dos
organizaciones. Por tanto **una invitación solo es utilizable por un email que
todavía no tiene cuenta**.

En vez de dejar que eso reviente durante el registro, `getInvitationByToken`
devuelve `EMAIL_ALREADY_REGISTERED` como estado propio y la página lo explica.
Los cinco estados (`USABLE`, `EXPIRED`, `REVOKED`, `ALREADY_ACCEPTED`,
`EMAIL_ALREADY_REGISTERED`) se distinguen a propósito: agruparlos en "enlace
inválido" le quita al lector la única información que le permite actuar.
Además, `acceptPendingInvitationForUser` deja la invitación en `PENDING` si la
membresía falla por esa restricción — nunca se marca `ACCEPTED` contra una
membresía que no se creó.

**Índice único parcial para las invitaciones pendientes.**
`UNIQUE (organization_id, email) WHERE status = 'PENDING'`. Un `UNIQUE`
normal sobre esas dos columnas habría impedido volver a invitar a una
dirección tras revocarla o tras una invitación caducada, que es justo cuando
más falta hace. Con el índice parcial, dos invitaciones vivas a la vez para el
mismo destinatario son imposibles — que es lo que evita que dos invitaciones
compitan por ser aceptadas.

**Kindly no envía emails, y se dice.** No hay infraestructura de correo y no se
añade aquí (`CLAUDE.md` sección 2: nada de infraestructura sin necesidad
concreta). Al invitar se genera un enlace que el ADMIN copia y hace llegar por
sus medios. La UI lo explica en vez de mostrar un "Invitación enviada" que
sería falso. Cuando haya proveedor de correo, el cambio es aditivo.

**`requireOrganizationAdmin` y nada más.** Un único helper que comprueba
`role === "ADMIN"`, usado por las acciones de invitar y revocar. Sin matriz de
permisos ni capacidades (`CLAUDE.md` sección 8). La UI oculta el formulario a
un DELEGATE y la acción lo rechaza igualmente: defensa en profundidad, mismo
patrón que `cases/service.ts`.

**Activities con `entityType: "organization"`.** Nuevo valor en
`ActivityEntityType` — las primeras actividades cuyo sujeto es la propia
organización — y tres tipos: `MEMBER_INVITED`, `MEMBER_JOINED`,
`INVITATION_REVOKED`. `MEMBER_JOINED` se registra **fuera** de la transacción
que crea la membresía: el acceso de la persona a su organización no puede
depender de que se escriba bien una fila de auditoría.

**Supersede a:** la afirmación de `bootstrap.ts` (PKG-002) de que gestionar
miembros estaba fuera de alcance, y el Non-goal equivalente de `PKG-002`. La
restricción de una sola organización por persona sigue vigente y sin cambios.

---

## 2026-09-20 — PKG-007: ajustes de canal por delegado

**Se elimina el "conectar en nombre de".** Hasta PKG-006, `/channels` tenía un
formulario con dos desplegables —canal y delegado— que permitía a cualquier
miembro conectar un canal a nombre de otro. **Se retira**, y la conexión es
siempre para uno mismo.

No es una decisión de política ni de permisos: es que **ningún proveedor real
lo permite**. Un Connected Business Bot de Telegram se añade desde dentro de
la app de Telegram del propio delegado (`docs/INTEGRATIONS.md` 1.2), y el
Embedded Signup de WhatsApp corre contra el login de Meta del propio titular
(2.2 y 2.3). Un camino "el ADMIN conecta por ti" solo podría haber sido
decorado: al llegar `PKG-009` no habría tenido nada real detrás. Mantenerlo
habría sido justo lo que prohíbe `CLAUDE.md` sección 3 — construir la UI
alrededor de una hipótesis que la plataforma no sostiene.

`connectMessagingAccount` rechaza ahora `delegateId !== actorUserId` en el
propio servicio, no solo en la UI: defensa en profundidad, mismo patrón que la
comprobación de pertenencia a la organización que se añadió en PKG-004.

**Quién ve qué: un DELEGATE solo sus propias cuentas.** No es ocultación por
higiene visual. El canal es la identidad de comunicación del profesional
(`CLAUDE.md` principio 1), así que enseñarle a un delegado el estado de
conexión de un compañero no es "solo lectura por comodidad": es el teléfono de
otra persona. Un ADMIN sí ve toda la organización, porque gestionarla es su
trabajo — saber que el canal de alguien está roto forma parte de eso.

**Desconectar es asimétrico, a propósito.** Un DELEGATE solo puede desconectar
lo suyo; un ADMIN puede desconectar cualquier cuenta de la organización,
porque eso es dar de baja a alguien que se va. Se implementa con el rol, no
con la propiedad de la fila, y convive con la regla de PKG-005: si el canal
declara `canDisconnect: false`, no lo desconecta nadie desde Kindly, ni
siquiera el ADMIN.

**La máquina de estados deja de ser texto plano.** Hasta ahora `/channels`
imprimía el valor del enum tal cual, así que `DEGRADED` y `REVOKED` se veían
igual de bien que `CONNECTED`. `describeAccountStatus` (en
`messaging/domain.ts`, puro y testeable) traduce cada estado a tono, si
requiere atención y si los mensajes fluyen; la UI añade la explicación en
castellano y muestra `lastError`, `lastSyncAt` y `connectedAt`.

El caso que motiva la distinción entre "operativo" y "requiere atención" es
`DEGRADED`: los mensajes siguen llegando, **y justo por eso** es el estado que
se ignora hasta que se convierte en `ERROR`. Un test de unidad fija que
`CONNECTED` es el único estado a la vez operativo y silencioso.

**Nota de tests.** Dos E2E fallaron al escribirlos por la misma razón, que
conviene recordar: la Organization se llama `"<nombre> 's organization"`, así
que el nombre de un miembro aparece también en la cabecera del layout y un
`getByText(nombre)` casa con dos sitios. Las listas de cuentas llevan ahora
`aria-label` y los tests consultan por rol y nombre accesible — más preciso, y
de paso mejor accesibilidad.

**Supersede a:** el formulario de conexión canal+delegado de `PKG-004`
(`/channels`), que deja de existir. La función `listMessagingAccounts` sigue
disponible para usos internos sin sesión, pero la UI usa
`listMessagingAccountsForMember`.

---

## 2026-09-20 — PKG-008: alta de WhatsApp (elección y comprobaciones previas)

Flujo de conexión que describió el usuario a partir de GoHighLevel,
construido contra el stub. No toca Meta.

**El onboarding lo declara el adapter, no lo deduce la UI del nombre del
canal.** Nueva capacidad `onboarding: "DIRECT" | "WHATSAPP_COEXISTENCE"` en
`MessagingChannelCapabilities`. `/channels` enseña un botón de conexión
directa para los canales `DIRECT` y un enlace al flujo para los demás; las
rutas `/channels/connect/[channel]` devuelven 404 si el canal no declara ese
onboarding.

La alternativa era una ruta `/channels/whatsapp` con el proveedor escrito en
la URL y en el código. Se descarta por la misma razón que en PKG-005: el
dominio y la UI no preguntan por el nombre del proveedor
(`CLAUDE.md` sección 2). Además esta forma tiene una propiedad que la otra no:
cuando llegue `PKG-009`, el `WhatsAppAdapter` real declarará
`WHATSAPP_COEXISTENCE` y **esta misma UI le servirá sin tocarla**.

Consecuencia deliberada: en producción el flujo es inalcanzable hoy, porque no
hay ningún adapter de WhatsApp registrado. Eso no es un hueco, es la verdad
actual — WhatsApp no está disponible hasta `PKG-009`, y `/channels` ya lo dice.
El flujo se ejercita de punta a punta contra `fake-coex`, que declara ese
onboarding sin fingir ser WhatsApp.

**Las tres vías: una disponible, dos deshabilitadas con motivo.** Coexistence
es la única decidida (`docs/DECISIONS.md`, 2026-09-19). Crear cuenta nueva y
migrar desde otro BSP son flujos reales de Meta que Kindly **no** ha adoptado,
así que se listan y se deshabilitan **explicando por qué**, en vez de
ocultarlas u ofrecerlas. Ocultarlas dejaría al delegado preguntándose si se ha
perdido algo; ofrecerlas sería el incumplimiento silencioso que prohíbe
`CLAUDE.md` sección 3.

**Las comprobaciones previas se revalidan en el servidor.** El botón
deshabilitado hasta marcar los seis puntos es una cortesía para quien lee, no
una garantía sobre lo que llega al servidor — y estos puntos concretos tratan
de un móvil que pierde funciones, así que "la UI no te dejaba" no basta. Hay
un E2E que quita el `disabled` por JavaScript y comprueba que el servidor
rechaza igualmente.

El contenido de la lista no es inventado: cada punto sale de
`docs/INTEGRATIONS.md` sección 2.2, que a su vez sale de la documentación de
Meta. Una pantalla que le dice a alguien qué va a pasarle al teléfono no puede
llevar un requisito que no se pueda citar.

**La comprobación de país devuelve `UNKNOWN` por defecto, y eso es correcto.**
`checkCountrySupport` consulta `WHATSAPP_UNSUPPORTED_COUNTRY_CODES` (variable
de entorno, documentada en `.env.example`), **vacía por defecto**.

La lista oficial de regiones excluidas no se pudo confirmar
(`docs/DECISIONS.md`, 2026-09-19). Una lista copiada de un blog sería **peor
que no tener lista**: bloquearía a usuarios reales con falsa seguridad, y el
error sería invisible porque parecería una comprobación legítima. Con la
variable vacía, la UI dice que no puede comprobarlo y por qué. Cuando se tenga
la fuente oficial, se rellena la variable y el comportamiento cambia sin tocar
código.

**Lo que NO se ha hecho, y por qué.** El alcance de `PKG-008` en
`project/TASKS.md` incluía ejercitar `PENDING → CONNECTING → CONNECTED` contra
el stub. **No se ha hecho, y no se debe hacer todavía.** Con un stub síncrono
no existe ningún instante en el que esos estados sean ciertos: habría que
inventar una asincronía artificial y escribir la máquina de estados alrededor
de cómo *suponemos* que se comporta Embedded Signup. Esos estados se vuelven
reales en `PKG-009`, donde el flujo sale de verdad a Facebook y vuelve por un
callback, y ahí se podrán validar.

Sí se ha hecho el **camino de error**, que sí es real hoy: si el proveedor
rechaza la conexión, el flujo vuelve a la pantalla previa mostrando lo que dijo
el proveedor — a esas alturas el delegado ya ha hecho gestiones en su móvil y
merece saber qué parte se rechazó — y no queda ninguna `MessagingAccount` a
medias (test de integración con `failNextConnect`).

**Supersede a:** nada. Amplía `MessagingChannelCapabilities` (PKG-005) con un
tercer campo obligatorio.

---

## 2026-09-20 — PKG-010: sitio público y documentos legales

Prerrequisito del alta como Tech Provider de Meta: la verificación de negocio
exige una web, y la app exige una URL de política de privacidad.

**`/` deja de ser un redirect.** Hasta ahora la raíz mandaba al `/dashboard` o
al `/login`. Ahora es la landing pública, y el grupo de rutas `(public)` queda
**fuera** de `(app)`, que exige sesión. No es una preferencia estética: Meta
comprueba la URL de la política de privacidad de forma periódica y marca la
app si devuelve error o **si pide iniciar sesión**; tres fallos consecutivos
pueden acabar en retirada de la app. Un test E2E abre cada página pública en
un contexto de navegador sin cookies y comprueba que responde 200 y que la
ruta final es la misma — es decir, que no hay redirección al login.

Las páginas legales salen **estáticas** en el build, que es lo que conviene
para esas comprobaciones periódicas.

**La identidad legal vive en un único archivo, con huecos ruidosos.**
`src/config/company.ts` concentra razón social, NIF, domicilio, datos
registrales, correos y teléfono. Todos los valores por defecto empiezan por
`REVISAR:` y, mientras quede alguno, el sitio muestra **una banda roja en
todas las páginas públicas** avisando de que no está publicado.

La alternativa —rellenar con datos verosímiles de ejemplo— se descarta
explícitamente. Un domicilio inventado en un aviso legal no es un
*placeholder*: es una afirmación falsa sobre una entidad jurídica, publicada.
Y hay un motivo práctico además del ético: Meta compara la razón social y el
domicilio **carácter a carácter** con la documentación que se sube, y rechaza
por diferencias tan pequeñas como "C/" frente a "Calle". Un dato plausible
puede colarse hasta producción; uno que grita no.

**La decisión jurídica de fondo: dos papeles, no uno.** La política de
privacidad separa explícitamente:

- Datos de los **profesionales** que usan Kindly (cuenta, organización, rol):
  Kindly es **responsable del tratamiento**.
- Datos de los **clientes de cada despacho** (contactos, conversaciones):
  el despacho es el responsable y Kindly el **encargado del tratamiento**.

Es el encuadre correcto para un SaaS B2B y tiene una consecuencia operativa
que la página dice en voz alta: si el cliente de un despacho quiere ejercer
sus derechos, tiene que dirigirse al despacho, no a nosotros. Tratar todo como
si Kindly fuese responsable de todo habría sido más corto de escribir y
habría prometido algo que no podemos cumplir.

**Contenido anclado en lo que hace el código.** Las categorías de datos, los
plazos y los terceros salen de `docs/DATABASE.md` y `docs/INTEGRATIONS.md`:
qué guardamos de un mensaje, que los payloads originales de los webhooks se
conservan, que el historial de coexistence llega a 180 días y solo de
conversaciones individuales, que las credenciales no están en la base de datos
sino tras un `credentials_reference`. Una política genérica de plantilla
habría sido más rápida y habría sido falsa en varios puntos concretos.

**Requisitos de Meta cubiertos de forma deliberada:**

- `/privacidad` pública, sin login, nombrando app y empresa.
- `/eliminacion-de-datos`, que Meta exige como *Data Deletion Instructions
  URL* para apps con Facebook Login — y el Embedded Signup de WhatsApp lo es.
- `/terminos` y `/aviso-legal` (este último obligatorio en España por la
  LSSI-CE art. 10).
- Metaetiqueta `facebook-domain-verification` inyectada desde
  `FACEBOOK_DOMAIN_VERIFICATION`, el método de verificación de dominio que no
  requiere tocar DNS.
- `NEXT_PUBLIC_SITE_URL` como origen canónico, que debe coincidir con el
  dominio verificado.

**Diseño: el sans vende, el serif documenta.** Una sola idea tipográfica
sostiene el sitio. Los titulares van en sans, apretados; el serif aparece
**solo donde el producto produce algo con peso documental**: el borrador del
copiloto, sus citas, y los propios textos legales. Invierte el tópico de
"serif para el display, sans para el cuerpo" y lo ata al argumento del
producto, que es convertir conversación suelta en trabajo documentado.

La paleta es tinta azul oscura sobre papel frío —deliberadamente no crema— con
un único acento verde de sello de "vigente", que es exactamente lo que el
producto promete sobre la normativa. Los tres niveles de evidencia
(`SUFFICIENT`/`PARTIAL`/`INSUFFICIENT`) son valores reales del dominio, así que
tienen color propio en el sistema en vez de un semáforo decorativo.

El héroe no es una captura ni una cifra: es una **sugerencia del copiloto tal
y como la define `docs/PRODUCT.md` sección 10**, con evidencia **parcial** a
propósito. El estado honesto —la herramienta diciendo qué no sabe— es mejor
argumento que uno en el que todo sale perfecto.

**Lo que NO está hecho, y no lo puede hacer el agente:**

1. **Los datos legales reales.** Sin ellos el sitio no se publica.
2. **Revisión jurídica.** Estos textos son un borrador sólido y anclado en el
   producto real, no un dictamen. Antes de publicarlos deben pasar por alguien
   que responda de ellos.
3. **Dominio y despliegue con HTTPS.** Meta exige certificado válido.
4. **Correo en el dominio propio.** Meta rechaza gmail.com y similares para la
   verificación de negocio.

**Supersede a:** el `src/app/page.tsx` de PKG-001, que redirigía la raíz según
hubiera sesión o no.

---

## 2026-09-23 — Base de datos en la nube: Neon vía integración nativa de Vercel

**Contexto:** el desarrollo local usa PostgreSQL en Docker (`docker-compose.yml`,
`PKG-001`). Hace falta un entorno de staging accesible por internet — entre
otras cosas porque Meta exige un dominio con HTTPS público (ver la entrada de
PKG-010 arriba) — y eventualmente producción, cada uno con su propia base de
datos aislada.

**Decisión:**

- Se usa la integración nativa Neon del Vercel Marketplace, no una cuenta de
  Neon gestionada a mano por fuera de Vercel. Vercel es ya el proveedor de
  despliegue de la aplicación (decisión del usuario, fuera de este documento).
- Un solo proyecto de Neon, con **branches** de base de datos en vez de
  proyectos separados: `production` (mapeado al entorno Production de
  Vercel) y `staging` (branch de Git de larga duración, con dominio fijo en
  Vercel, mapeado a un branch `preview/staging` de Neon). El desarrollo local
  sigue contra Docker, sin cambios — nunca contra Neon.
- Cualquier otro branch de Git desplegado como Preview en Vercel obtiene su
  propia base de datos efímera de Neon automáticamente (comportamiento propio
  de la integración, sin configuración adicional), que se borra sola al
  borrar el branch de Git. Es un efecto colateral aceptado, no algo que haya
  que gestionar.
- `drizzle.config.ts` usa `DATABASE_URL_UNPOOLED` para migraciones cuando
  existe (staging/producción), con `DATABASE_URL` como fallback (local). La
  app en runtime (`src/db/client.ts`) sigue usando siempre `DATABASE_URL`
  (pooled) — sin cambios ahí.
- **Las migraciones no se ejecutan automáticamente en cada build de Vercel.**
  Se ejecutan a mano (`npm run db:migrate` con la URL del entorno que toque)
  cuando se quiere aplicar un cambio de esquema a staging o producción. Un
  build automático de migraciones en cada deploy correría también en
  cualquier Preview de una rama de feature, lo cual no es lo que se quiere.

**Por qué:**

- La URL *pooled* de Neon pasa por PgBouncer en modo transacción, que no
  soporta de forma fiable el bloqueo a nivel de sesión que usa `drizzle-kit`
  al migrar — de ahí la URL directa aparte, solo para ese caso.
- Usar branches de una sola base de datos lógica (en vez de instancias
  Postgres separadas) es el patrón recomendado por Neon para este caso y
  evita gestionar credenciales y aprovisionamiento a mano por entorno.
- No es una nueva categoría de infraestructura de las vetadas en
  `docs/ARCHITECTURE.md` ("no construir todavía"): sigue siendo
  PostgreSQL + pgvector, solo alojado de forma gestionada.

**Alternativas consideradas:** cuenta de Neon independiente conectada a mano
(más control, pero credenciales y aprovisionamiento manuales por entorno sin
necesidad real de ese control todavía); ejecutar staging también en Docker
detrás de un túnel (no da un dominio ni TLS estables, y no sirve para lo que
Meta exige).

---

## 2026-09-25 — PKG-011: adapter de WhatsApp contra el número de prueba de Meta

**Contexto:** `PKG-009` (coexistence real) sigue bloqueado por el alta como
Tech Provider. Mientras, se quiere validar contra Meta de verdad la tubería
`webhook → Conversation → Inbox → respuesta`, usando el número de prueba
gratuito de la app.

**Decisión:**

- Canal `"whatsapp-test"`, nunca `"whatsapp"`. Vive en
  `src/modules/messaging/testing/`, como el adapter falso: es una herramienta
  de ingeniería, no una forma de conectar un delegado (violaría el principio
  de identidad, `CLAUDE.md` 2.1).
- Solo se registra con `WHATSAPP_TEST_ADAPTER_ENABLED=true` **y** las cuatro
  credenciales, y se niega en `VERCEL_ENV=production` aunque el flag esté
  puesto. Las credenciales viven en variables de entorno de Vercel
  (Preview); `credentials_reference` guarda solo `env://…`.
- `MessagingAdapter` gana un método **opcional**
  `verifyWebhookChallenge(query)`, y la ruta del webhook un `GET` que lo usa
  (el handshake `hub.challenge` de Meta). Los canales sin handshake
  responden 404; no se persiste nada, no es un evento.
- La conversación se identifica por el `wa_id` del Contact
  (`externalConversationId = externalContactId = wa_id`). Es el
  identificador que da el proveedor, así que cumple `docs/DATABASE.md` 6,
  aunque en la práctica coincida con los dígitos del teléfono. **Pregunta
  abierta para `PKG-009`:** Meta está introduciendo identificadores de
  usuario por negocio (nombres de usuario de WhatsApp); cuando se
  confirmen en la documentación oficial, habrá que decidir si la identidad
  técnica pasa a ser ese identificador.
- `parseWebhookEvents` descarta lo que no va dirigido a su
  `phone_number_id`: una app recibe en su callback los eventos de todos los
  números de todas las WABA suscritas.
- Un envío rechazado por Meta (ventana cerrada, destinatario no permitido)
  se guarda como mensaje `FAILED` con id sintético `failed-<uuid>` en vez
  de lanzar excepción, para que se vea en el hilo; el motivo va al log del
  servidor, porque ninguna columna lo guarda todavía.
- `connectAccount` llama a Meta (lee el número y hace `POST
  /{waba}/subscribed_apps`): unas credenciales erróneas fallan en
  `/channels`, no en silencio en el primer envío.
- `disconnectAccount` es solo del lado de Kindly: nunca se da de baja el
  número de prueba compartido.
- Mensajes que no son de texto se muestran con un texto provisional en vez
  de descartarse.

**Límite conocido:** `UNIQUE(channel, external_account_id)` impide volver a
conectar el mismo número de prueba tras desconectarlo (la fila
`DISCONNECTED` sigue ahí). Para esta herramienta es aceptable; `PKG-009`
tendrá que resolver la reconexión de verdad.

---

## 2026-09-25 — PKG-012: email con Resend y recuperación de contraseña

**Contexto:** el usuario perdió la contraseña de su cuenta de staging y no
había forma de recuperarla sin tocar la base de datos. Es la necesidad
concreta que faltaba para introducir email, que PKG-006 dejó fuera a
propósito ("Kindly no envía emails, y se dice"). **Supersede parcialmente**
esa línea: Kindly ya envía email, pero solo para el reset de contraseña; las
invitaciones siguen compartiéndose con enlace copiado (cambio aditivo
pendiente, ver `project/TASKS.md`).

**Decisión:**

- Proveedor: **Resend**, elegido por el usuario. Llamada REST directa
  (`POST https://api.resend.com/emails`) sin el SDK: una sola llamada no
  justifica una dependencia.
- Detrás de una interfaz `EmailSender` (`src/modules/email/sender.ts`), mismo
  criterio que `MessagingAdapter`/`LLMProvider`: cambiar de proveedor no toca
  a quien envía.
- Sin `RESEND_API_KEY`: fuera de producción se imprime el correo en consola
  (el desarrollo local no necesita cuenta); **en producción no hay
  sustituto**, el envío falla y Better Auth lo registra en el log. Un enlace
  de reset en un log es una credencial en un log (`CLAUDE.md` sección 5).
- Reset con el flujo nativo de Better Auth (`sendResetPassword`): token de
  un solo uso que caduca en 1 hora, respuesta idéntica exista o no el email
  (sin enumeración de cuentas), rate limit por defecto de 3 solicitudes por
  minuto e IP, y `revokeSessionsOnPasswordReset: true`: quien restablece la
  contraseña puede estar echando a alguien que la tenía.
- Páginas públicas `/forgot-password` y `/reset-password`, fuera del grupo
  `(app)`.
- `scripts/reset-password.ts` (`npm run auth:reset-password`) se mantiene
  como herramienta de operador para cuando el email no está disponible.

**Límite conocido:** hasta que se verifique un dominio en Resend, el
remitente solo puede ser `onboarding@resend.dev` y Resend solo entrega al
email dueño de la cuenta de Resend. Es el mismo dominio propio que ya exige
la verificación de negocio de Meta.

---

## 2026-09-25 — Orígenes de confianza de Better Auth en Vercel

**Contexto:** en staging, registrarse desde
`kindly-git-staging-naxolas-projects.vercel.app` fallaba porque
`BETTER_AUTH_URL` apuntaba a otro host (`kindly-peach.vercel.app`): Better
Auth rechaza las peticiones de cualquier origen distinto de su `baseURL`, y
un deploy de Vercel responde en varios hosts a la vez.

**Decisión:** `trustedOrigins` = los hosts exactos que Vercel inyecta
(`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`), con
`https://`. **Nunca `*.vercel.app`**: confiaría en las apps de cualquier
otro cliente de Vercel. Fuera de Vercel la lista queda vacía y nada cambia.
`BETTER_AUTH_URL` sigue siendo el host canónico: con él se construyen los
enlaces de los emails, así que en Preview debe ser la URL pública de la rama
`staging`.

**`BETTER_AUTH_URL` se reduce a su origen** (`authBaseOrigin`): con una ruta
(`https://host/login`, copiado de la barra del navegador) Better Auth la toma
como base completa de sus endpoints y todo `/api/auth/*` respondía 404 en
staging. Kindly siempre sirve auth en `/api/auth`, así que solo el origen
tiene sentido; un valor sin protocolo falla al arrancar en vez de a medias.

**Hallazgo relacionado:** `kindly-peach.vercel.app` es un alias de los
deploys de la rama `staging` (entorno Preview), pero a diferencia de la URL
de la rama responde con Vercel Authentication a peticiones sin sesión de
Vercel; la URL de la rama es pública. Los webhooks
de Meta tienen que apuntar a la URL pública, que además es donde se registra
el adapter `whatsapp-test` (variables solo en Preview).

---

## 2026-09-25 — PKG-013: conversación en vivo (envío optimista, checks, sondeo, "escribiendo…")

**Contexto:** en la primera prueba real con WhatsApp (PKG-011) el usuario
reenvió varias veces el mismo mensaje porque la pantalla no daba señal de
envío, y la conversación no se actualizaba sola. Pidió además el indicador
de "escribiendo…" en ambos sentidos.

**Capacidad del proveedor, verificada** (`CLAUDE.md` sección 3) en
https://developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators :

- La empresa **sí** puede mostrar "escribiendo…" al contacto
  (`status: "read"` + `typing_indicator`, anclado a un mensaje entrante),
  hasta 25 s o hasta la respuesta. **La misma llamada marca ese mensaje
  como leído**: el contacto ve el doble check azul.
- **No existe** ningún webhook que avise de que el contacto está
  escribiendo. Kindly **no lo muestra** y no lo simula.

**Decisiones (validadas por el usuario):**

- **"Escribiendo…" hacia el contacto: activado**, aceptando explícitamente
  que marca su último mensaje como leído. Se envía al teclear, como mucho
  una vez cada 20 s (`TYPING_INDICATOR_THROTTLE_MS`), solo con la ventana
  de servicio abierta. Es best effort: si falla se registra en el log y no
  molesta al escribir. Es un método **opcional** del adapter
  (`sendTypingIndicator`); los canales que no lo tengan no lo ofrecen.
- **Tiempo real por sondeo, no infraestructura nueva:** la conversación
  abierta consulta `GET /api/conversations/[id]/thread` cada 3 s con la
  pestaña visible, y la lista `/inbox` se refresca cada 5 s. Vercel no
  mantiene conexiones abiertas, y un servicio de tiempo real (Pusher, Ably)
  sería un proveedor más sin necesidad demostrada. Cuando el volumen lo
  justifique, se revisa aquí.
- **Envío optimista:** el mensaje aparece al instante con un reloj, el
  campo se vacía (un segundo clic ya no envía nada) y la acción devuelve el
  mensaje guardado o un error que se muestra junto al mensaje con
  "Reintentar". Intro envía y Mayús+Intro hace salto de línea.
- **Checks:** ✓ enviado, ✓✓ entregado, ✓✓ azul leído, a partir de los
  webhooks `statuses` que ya se guardaban. El azul depende de que el
  contacto tenga activadas las confirmaciones de lectura.
- **Los estados de entrega ya no retroceden** (`shouldApplyDeliveryStatus`):
  Meta no garantiza el orden de `sent`/`delivered`/`read`. `FAILED` solo
  sustituye a un mensaje que no llegó al teléfono, y un
  `delivered`/`read` posterior prevalece sobre `FAILED`.

**Límites conocidos:** sin clave de idempotencia en el servidor (el
reintento de un envío que en realidad sí salió podría duplicarlo; es
improbable porque el fallo devuelto viene de Meta rechazándolo). Si el
webhook `delivered` llegara antes de que se guarde el propio envío, esa
actualización se perdería; no se ha observado.

---

## 2026-09-26 — Rediseño UI/UX: sistema de diseño por tokens inspirado en Supabase (fases UI-0 y UI-1)

**Contexto:** el usuario pide rediseñar la interfaz de forma integral con el
dashboard de Supabase como referencia de calidad y de patrones (no de
aspecto), por fases, dejando la estrategia documentada para que otra IA
pueda continuarla. La app autenticada no tenía componentes compartidos ni
tokens: usaba la paleta de Tailwind en crudo (27 archivos), sin sidebar,
sin confirmaciones y con el Inbox navegando fuera de la lista.

**Decisión:**

1. **`docs/ui/` es la fuente de verdad de UI/UX** (principios, tokens,
   componentes, navegación, organización, Inbox, chat, accesibilidad,
   responsive, roadmap). Amplía la estructura `docs/` + `project/` en vez
   de crear una paralela; las fases son paquetes `UI-0`…`UI-9` en
   `project/TASKS.md`.
2. **Tokens en tres capas** (primitivas → semánticos → utilidades
   Tailwind, más tokens de componente) en `src/styles/tokens.css`, con
   nombres de la gramática de Supabase (`foreground-light`, `surface-200`,
   `border-control`) y compatibles con Figma Variables. Dos tests los
   protegen: contraste WCAG de cada par usado y prohibición de valores
   sueltos en los directorios migrados.
3. **Identidad propia, no la de Supabase:** se conserva la de PKG-010
   (tinta sobre papel frío, verde sello). El verde pasa a ser el acento
   funcional (`primary`), como el verde en Supabase. **Tema claro** por
   defecto; el oscuro de Supabase se descarta por ahora (la capa semántica
   lo deja preparado).
4. **Primitivas accesibles: Radix (vía patrón shadcn)**, que ya estaba en
   el stack de `docs/ARCHITECTURE.md`. En la Fase 1 solo entran
   `class-variance-authority`, `clsx`, `tailwind-merge` y `lucide-react`;
   `radix-ui` y `sonner` en las Fases 2–3 cuando haya el primer uso.
5. **Una sola familia de confirmación** (`ConfirmDialog` parametrizado, con
   texto a escribir opcional para irreversibles) en lugar del trío
   AlertDialog/ConfirmationModal/TextConfirmDialog de Supabase.
6. **La conversación se abre en un Sheet derecho modal** sobre la lista,
   con rutas paralelas + interceptadas de Next 16 para que `/inbox/<id>`
   siga siendo enlazable. El modo "anclado" no modal en pantallas anchas
   se evalúa y se aplaza (`docs/ui/CHAT.md` §5).
7. **La organización entra en la navegación** (miga del header + módulo
   `/organization` con General, Miembros, Canales); `/members` y
   `/channels` se moverán con redirecciones en la Fase 7.
8. **El Inbox no inventa estados**: "pendiente de respuesta" se deriva del
   último mensaje entrante; asignación/archivo/etiquetas no existen en el
   dominio y no se simulan.

**Alternativas consideradas:** copiar `packages/ui` de Supabase (arrastra
su derivación OKLCH, su tema oscuro y dependencias que no necesitamos);
seguir con Tailwind en crudo y extraer componentes sobre la marcha (es lo
que produjo 30 copias del mismo input); un JSON DTCG como fuente con
generación de CSS (tooling prematuro: se añade un exportador en la Fase 9).

**Por qué:** el orden de criterio fijado por el usuario (función →
accesibilidad → consistencia → Supabase → reutilización → simplicidad →
estética) favorece un sistema pequeño, propio y verificable por tests
frente a una copia visual.

**Efecto visible colateral:** `ink-faint` del sitio público pasa de
`#7a879e` (3,6:1, no cumplía AA) a `#5b6880`. Es el único cambio visual
fuera de la app autenticada.

---

## 2026-09-26 — Rediseño UI/UX: respuestas del usuario a las preguntas abiertas

**Contexto:** tras cerrar UI-0/UI-1 quedaron tres preguntas para el usuario.
**Decisión (del usuario):**

1. **Cambiar el rol de un miembro: sí.** Se añade la acción de dominio en
   UI-7, con validación en servidor (solo ADMIN, misma organización, nunca
   dejar la organización sin ADMIN) y sus tests. Amplía PKG-006, que solo
   fijaba el rol al invitar.
2. **Tema oscuro: sí**, en UI-8, con selector Claro / Oscuro / Sistema
   (por defecto Sistema) y el test de contraste extendido al tema oscuro.
3. **Conversación anclada y sin velo en pantallas anchas.** A partir de
   `xl` (1280 px) el panel de conversación se ancla a la derecha sin velo
   y la lista sigue interactiva; por debajo sigue siendo Sheet modal, y a
   pantalla completa en móvil. Se asume la pérdida del focus trap en ese
   modo, compensada con región etiquetada, foco inicial explícito, `F6`
   entre regiones y `Esc` para cerrar (`docs/ui/CHAT.md` §4–5).

**Supersede a:** los puntos 3 (oscuro "descartado por ahora") y 6 (modo
anclado "aplazado") de la entrada anterior del mismo día.

---

## 2026-09-26 — Rediseño UI/UX, UI-2: shell de aplicación

**Contexto:** construir el header y la sidebar globales (`docs/ui/LAYOUT_NAVIGATION.md`)
sin romper ninguna URL, texto o selector de los que dependen los E2E, y sin
adelantar trabajo de fases futuras (Organización no existe hasta UI-7).

**Decisión:**

1. **La miga de organización del header es texto plano, no un menú**, pese
   a que `LAYOUT_NAVIGATION.md` §2 la diseña como desplegable a "Ajustes /
   Miembros / Canales". Esa ruta (`/organization`) no existe hasta UI-7;
   un menú que abriera ahí sería un menú a ninguna parte. Se retoma cuando
   la ruta exista.
2. **La sidebar se mantiene plana** (Inbox, Contacts, Cases, Tasks,
   Canales, Miembros — mismas etiquetas y URLs que el nav anterior) en
   vez de agrupar Canales/Miembros bajo "Organización" ya. Misma razón que
   el punto 1; se agrupan en UI-7 cuando esas páginas se muevan a
   `/organization/*`.
3. **Destino tras registro/login pasa de `/dashboard` a `/inbox`**
   (`docs/ARCHITECTURE.md` §11: la comunicación es el centro del
   producto). `/dashboard` queda como redirección para enlaces
   antiguos. Efecto en cascada: los 6 specs E2E que aserian
   `toHaveURL(/\/dashboard$/)` tras un alta pasan a `/inbox$/`, y 8 clics
   a `getByRole("link", {name:"Canales"})` necesitaron `exact: true`
   porque el Inbox (nueva pantalla de aterrizaje) contiene el texto
   "Todos los canales" como filtro, que coincidía como subcadena del
   nombre accesible no-exacto.
4. **Shell de scroll fijo** (`h-dvh` + `grid-rows-[auto_1fr]`): el header
   nunca se desplaza y `<main>` tiene su propio scroll, en vez de un
   `sticky` con `calc()`. Mismo patrón que el Studio de Supabase. Cambia
   el modelo de scroll de toda la app autenticada (antes la página entera
   hacía scroll); no rompió ningún E2E existente.
5. **Preferencia de sidebar contraída en cookie** (`kindly_sidebar`),
   leída en un Server Component (`sidebar-cookie.ts`) y escrita por una
   Server Action en un archivo separado (`sidebar-actions.ts`) — un
   archivo `"use server"` expone cada export como RPC invocable desde el
   cliente, y una simple lectura de cookie no tiene por qué serlo.
6. **`countUnreadConversations` es de toda la organización, no por
   delegado.** El Inbox ya era compartido por todos los miembros
   (`listConversationsWithPreview` no filtra por `delegateId`, decisión de
   PKG-004); el contador de la sidebar tenía que ser coherente con eso.
   Solo Canales es por delegado (PKG-007).
7. **`Cerrar sesión` se movió a un menú** (`UserMenu`, sobre
   `DropdownMenu`) y dejó de ser un botón suelto en la cabecera.

**Por qué:** en cada caso, construir la pieza "completa" tal como la
diseña `docs/ui/` habría exigido adelantar trabajo de una fase posterior
(rutas que no existen) o inventar navegación sin destino real — contrario
al criterio de decisión de `docs/ui/PRINCIPLES.md` §3 (necesidad funcional
antes que fidelidad al diseño).

---

## 2026-09-26 — Rediseño UI/UX, UI-3: componentes avanzados

**Contexto:** completar el catálogo de componentes (Dialog, ConfirmDialog,
Sheet con formulario sucio, Tabs, Popover, Toast, Table, DataList,
SearchInput, FilterBar, SegmentedControl, RelativeTime) y decidir cómo
probarlos.

**Decisión:**

1. **Entorno de test de componentes: Vitest + jsdom + Testing Library,
   activado por archivo** (`// @vitest-environment jsdom`), no una config
   de Vitest separada ni un runner distinto. El resto de la suite sigue en
   `environment: "node"`. `tests/setup.ts` añade `afterEach(cleanup)` a
   mano, porque React Testing Library solo se auto-limpia cuando
   `test.globals: true` (no es el caso aquí); sin esto, el DOM de un test
   sobrevive al siguiente dentro del mismo archivo.
2. **`ConfirmDialog` captura el error de `onConfirm` automáticamente** en
   vez de recibir una prop `error` controlada: las server actions de este
   proyecto lanzan en vez de devolver `{ok, error}`, así que atrapar la
   excepción y mostrar `error.message` es lo que de verdad ahorra código
   en cada sitio que lo use.
3. **`CommandMenu` (`cmdk`) y el patrón `loading.tsx`/`error.tsx` se
   aplazan**, con motivo: el primero no tiene ninguna página que lo
   necesite todavía (ninguna tiene búsqueda global); el segundo depende de
   `PageContainer`, que es UI-4. Construirlos ahora habría sido
   especulativo.
4. **Bug real de hidratación en `RelativeTime`, corregido antes de
   cerrar la fase.** Calculaba el tooltip con
   `toLocaleString(..., { dateStyle: "long", timeStyle: "short" })`. Esa
   opción compone internamente el conector entre fecha y hora ("a las" en
   una implementación de ICU, "," en otra) a partir de los datos CLDR
   empaquetados con cada motor — y el Node del servidor y el Chromium del
   navegador no siempre coinciden. Como `DataList` recibe `renderItem`
   como función —y una función no puede cruzar el límite Server→Client de
   Next.js—, cualquier página que ponga un `RelativeTime` dentro de un
   `DataList` fuerza su ejecución en cliente, así que ambos pases
   (servidor y cliente) lo ejecutan por separado y pueden divergir. Se
   detectó al construir la demo de `/ui-kit`, no en un test: los 12 tests
   de componentes pasaban igual, porque ninguno renderiza a la vez en
   servidor y cliente como sí hace Next. **Corrección:** formatear fecha y
   hora por separado (`Intl.DateTimeFormat` con opciones simples) y
   unirlas con un separador que elegimos nosotros, nunca compuesto por
   ICU. Deja constancia de que la verificación visual real (no solo tests
   unitarios) sigue encontrando cosas que los tests no cubren.

**Por qué:** en los cuatro casos, el criterio de `docs/ui/PRINCIPLES.md`
§3 (necesidad funcional → simplicidad) evita construir infraestructura sin
un consumidor real y prioriza corregir un bug de plataforma verificado
sobre añadir alcance nuevo.

---

## 2026-09-27 — Rediseño UI/UX, UI-4: arquitectura de páginas

**Contexto:** migrar todas las páginas de `(app)` y las cuatro de auth al
sistema de diseño (`PageContainer`/`PageHeader`/`PageSection`, altas a
Sheet/Dialog, confirmaciones a `ConfirmDialog`, Contactos/Casos/Tareas en
español).

**Decisión:**

1. **`buttonVariants` se separa de `button.tsx` a `button-variants.ts`,
   sin `"use client"`.** El límite Server/Client de Next.js se aplica al
   archivo entero, no exportación a exportación: como `button.tsx` lleva
   `"use client"` (por el `useId()` del motivo de deshabilitado),
   `buttonVariants` —una función pura, sin hooks— se había vuelto
   client-only también, y llamarla desde un Server Component (el patrón
   "`<Link>` con pinta de botón" que el propio comentario del componente
   documentaba) fallaba en tiempo de ejecución con un error que TypeScript
   no detecta. Apareció al migrar `channels/page.tsx`. Los Server
   Components que necesiten `buttonVariants` importan ahora desde
   `button-variants.ts` directamente.
2. **Los campos de las pantallas de auth (login, invitar, olvidé/cambiar
   contraseña) ganan un `<label>` real pero visualmente oculto**, no un
   `Field` con label visible. El diseño visual (compacto, con el nombre
   del campo solo como placeholder) se mantiene sin cambios; el
   `placeholder` se mantiene con el texto idéntico. Motivo: casi todos los
   specs E2E del proyecto (cualquiera que registre o inicie sesión)
   rellenan estos campos por `getByPlaceholder("Nombre"|"Email"|
   "Contraseña")`. Un label visible habría exigido, como mínimo,
   reconsiderar esa asociación en decenas de sitios para una ganancia de
   accesibilidad marginal sobre la opción elegida (que ya corrige el
   problema real: antes no había ningún `<label>`, ni oculto).
3. **Canales, Miembros y el flujo de conexión de WhatsApp no se
   traducen** en esta fase — a diferencia de Contactos/Casos/Tareas. Su
   texto ya pasó revisión (`docs/DECISIONS.md`, entradas de PKG-006/007/008/010)
   y no estaba en el alcance que `docs/ui/ROADMAP.md` fijó para UI-4.
4. **Altas por umbral de campos, aplicado de forma consistente**:
   Contacto (4 campos) y Tarea (5) y Caso (5, no 2 como parecía a
   primera vista — el formulario real incluye prioridad, asignación y
   descripción) van a Sheet; Invitar miembro (2 campos) va a Dialog.

**Por qué:** cada decisión prioriza no repetir trabajo ya validado
(Canales/Miembros), no tocar más superficie de la necesaria (auth), y
seguir el criterio de `docs/ui/COMPONENTS.md` §4 de forma literal en vez
de por intuición visual.

---

## 2026-09-27 — Rediseño UI/UX, UI-5: Inbox

**Contexto:** construir la bandeja según `docs/ui/INBOX.md` (vistas,
búsqueda, filtros, fila densa, sondeo sin saltos) sobre un servicio que
hoy cargaba todos los mensajes de todas las conversaciones para hallar el
último de cada una — no escalaba a las vistas/contadores que pedía el
diseño.

**Decisión:**

1. **El unread de la fila es un punto, no un `CountBadge`.** El dominio
   solo compara `lastReadAt` contra el último mensaje
   (`isConversationUnread`) — no cuenta mensajes no leídos por
   conversación. `INBOX.md` §3 pedía un `CountBadge`; se corrige a un
   punto simple. Si el dominio llega a contar mensajes no leídos, el
   `CountBadge` va en `InboxRow` (`src/app/(app)/inbox/inbox-row.tsx`).
2. **El indicador de ventana de servicio no se muestra en la fila de
   lista**, solo en la conversación abierta. Añadirlo a cada fila exigiría
   un segundo `LEFT JOIN LATERAL` (último mensaje `INBOUND`) más una
   consulta a las capacidades del adapter por canal, repetida en cada
   sondeo de 5 s de una lista de N filas — coste que no se justifica hoy.
3. **Las vistas son una condición SQL de la misma consulta
   (`inboxViewCondition`), no un filtro en memoria.** `pending` (último
   mensaje `INBOUND`), `unread`, `unassigned`, `all` se resuelven en el
   servidor exactamente igual para la lista y para los contadores
   (`countConversationsByView`) — evita que ambos puedan discrepar.
4. **Los contadores del ContextNav no reaccionan a la búsqueda de texto**,
   solo a canal/delegado. Igual que las carpetas de Gmail: si el número
   saltara con cada tecla escrita, dejaría de leerse como "cuánto hay
   pendiente" para leerse como "cuántos resultados hay ahora".
5. **`NativeSelect` cambia a qué elemento aplica `className`.** Su
   contenedor (`<span>`) llevaba `w-full` fijo sin forma de overridirlo —
   el `className="w-auto"` que necesitaba el `FilterBar` de Inbox solo
   llegaba al `<select>` interno. Ahora `className` controla el
   contenedor y el `<select>` interno es siempre `w-full` del contenedor.
   Ningún otro consumidor (Tareas, Casos, Miembros) pasaba `className`,
   así que no cambia su render.

**Alternativas consideradas:** para (2), mantener el indicador en la lista
con un lateral adicional — descartado por coste repetido en cada sondeo
sin una necesidad de producto que lo pida hoy (la conversación abierta ya
lo muestra antes de escribir). Para (5), añadir una prop nueva
(`wrapperClassName`) en vez de redirigir `className` — descartado por
introducir dos formas de pasar clases al mismo componente cuando ningún
consumidor existente necesitaba las dos a la vez.

**Por qué:** ninguna corrección inventa un dato que el dominio no tiene
(no leídos, ventana por fila); la reescritura del servidor es la que hace
viable el resto del diseño de `INBOX.md` sin cargar toda la tabla de
mensajes en cada render de la bandeja.

---

## 2026-09-27 — Rediseño UI/UX, UI-6: conversación en Sheet

**Contexto:** construir la conversación según `docs/ui/CHAT.md` — rutas
paralelas/interceptadas, `ConversationSheet` en tres modos (anclado sin
velo en `xl+`, modal, pantalla completa), reutilizando la lógica en vivo
de PKG-013 (`conversation-thread.tsx`) sobre el sistema de diseño.

**Decisión:**

1. **`@sheet/default.tsx` no basta para cerrar el panel.** Hace falta
   además un `@sheet/page.tsx` real (no interceptado) que devuelva `null`,
   idéntico al `@auth/page.tsx` del propio ejemplo de Next.js sobre
   parallel routes: en una navegación suave a una URL sin ruta real para
   un slot, Next.js **deja el slot mostrando lo último que tenía** en vez
   de recurrir a `default.tsx` (eso solo pasa en carga directa/refresco).
   Sin el archivo, un `<Link>` normal al `/inbox` bare (el del nav global,
   no el `router.back()` del propio panel) dejaba el panel abierto encima
   de la lista.
2. **El modo anclado (`<aside>`) es un componente aparte, no
   `Sheet modal={false}`.** `SheetTitle`/`SheetDescription` envuelven
   `Dialog.Title`/`Description` de Radix, que llaman a
   `useDialogContext()` internamente y **lanzan** si no hay un
   `Dialog.Root` por encima. El modo anclado deliberadamente no es un
   Dialog (sin velo, sin focus trap — `CHAT.md` §4/§5), así que no puede
   reutilizarlos: `PanelTitle`/`PanelDescription` (locales a
   `conversation-sheet.tsx`) renderizan un `h2`/`p` con las mismas clases.
   `SheetHeader`/`SheetBody`/`SheetFooter` sí se reutilizan tal cual en
   los tres modos — son estilo puro, sin ningún primitivo de Radix detrás.
3. **La sidebar se contrae mientras el panel está anclado, vía evento de
   `window`, no Contexto de React.** El sidebar cuelga de `AppShell`, por
   encima de toda la ruta; el panel vive varios segmentos de ruta más
   abajo, en un slot de rutas paralelas distinto al de la sidebar — no hay
   ningún Server Component común por el que enhebrar un Provider sin
   reestructurar `AppShell`. Es un override **temporal**: nunca escribe la
   cookie que guarda la preferencia manual del usuario
   (`sidebar-actions.ts`), se revierte solo al cerrar el panel.
4. **El orden de conversaciones compartido entre slots usa
   `useSyncExternalStore`, no una `ref` mutable directa.** Primer diseño:
   una `ref` que la lista actualiza y el panel lee dentro de un `useMemo`
   para anterior/siguiente — como las `ref` no disparan render, ese
   `useMemo` nunca se recalculaba tras el montaje inicial, y anterior/
   siguiente quedaba congelado en el primer orden visto. Una mini-tienda
   externa (`getOrder`/`setOrder`/`subscribe`) resuelve esto sin recurrir
   a `useState` en la lista (que sí re-renderizaría en cada sondeo de 5 s
   aunque el orden real no cambiase).
5. **`useMediaQuery` se construye sobre `useSyncExternalStore`, no
   `useState`+`useEffect`.** `eslint-plugin-react-hooks` 7.x (el set de
   reglas "React Compiler") añade `react-hooks/set-state-in-effect`, que
   marca como error un `setState` síncrono dentro de un efecto — el patrón
   que se escribiría de forma natural para leer `matchMedia` en el
   montaje. `useSyncExternalStore` es el patrón que la propia regla
   prefiere para sincronizar con un sistema externo.
6. **El borrador de la conversación (`sessionStorage`) necesitó un guard
   contra una condición de carrera real, no solo un `eslint-disable`.**
   El efecto que lee el borrador difiere su `setText` un tick (mismo
   patrón que el efecto `isLive` ya existente, para no anunciar el
   historial inicial a un lector de pantalla); pero el efecto que
   *escribe* el borrador corre en el mismo montaje, ve `text=""` (el
   borrador real todavía no se ha aplicado) y borra lo que el otro efecto
   acababa de leer — reproducido de forma consistente bajo el
   doble-montaje de Strict Mode en desarrollo. Un `hasReadDraftRef` retiene
   el efecto de escritura hasta que el de lectura confirma haber corrido.
7. **Corrección de un bug real de layout, no solo del panel**: el nombre
   del Contact en `InboxRow` podía colapsar a 0 px en modo anclado a
   1280 px (detalle en `docs/ui/CHAT.md` §5) — el nombre del delegado se
   ocultaba por un breakpoint de *viewport* (`sm:`), irrelevante cuando lo
   que se estrecha es la *columna* de la lista, no la ventana. Se cambia a
   un breakpoint de *contenedor* de Tailwind v4 (`@container`/`@sm:inline`)
   y el nombre del Contact pasa a `min-w-0 flex-1` para reclamar espacio
   antes que el resto de la fila.

**Alternativas consideradas:** para (3), un Contexto de React montado en
`AppShell` — descartado por exigir tocar un componente de Fase 2 no
relacionado con esta fase para un override que ni siquiera es la
preferencia persistida del usuario. Para (7), ocultar el badge o la hora
en vez del nombre del delegado — descartado porque ambos son señales más
cortas y ya acotadas (`shrink-0`), mientras que el nombre del delegado no
tenía techo de ancho alguno.

**Por qué:** cada corrección resuelve un caso reproducido de verdad (no
hipotético) durante la verificación visual de los tres modos responsive,
no una preferencia estética — la mayoría solo se manifiesta en modo
anclado a la anchura mínima del propio umbral (1280 px, que además es el
viewport por defecto de Playwright).

---

## 2026-09-28 — Fix post-cierre de UI-6: solapamiento del historial sobre el footer

**Contexto:** el usuario reportó, probando UI-6 ya desplegado en staging
(con conversaciones reales, más mensajes que en la verificación de cierre
de fase), que el historial se solapaba con el footer/compositor y que en
algunos anchos el compositor no se veía en absoluto.

**Decisión:** el envoltorio de `SheetBody` en
`src/app/(app)/inbox/[id]/conversation-thread.tsx`
(`<div className="relative min-h-0 flex-1">`) no era un contenedor flex.
Sin `display: flex` en el padre, la clase `flex-1` de `SheetBody` no tiene
ningún efecto (las propiedades flex solo aplican a elementos que son
*items* de un contenedor flex), así que `SheetBody` crecía a la altura de
su propio contenido en vez de recibir el espacio que realmente le
correspondía, y ese desbordamiento se solapaba visualmente con el
`SheetFooter` de al lado. Corregido añadiendo `flex flex-col` al
envoltorio. De paso, se añadió `animate-slide-in-right` al `<aside>` del
modo anclado (no tenía ninguna animación de entrada, al no pasar por
ningún `Dialog` de Radix que la dispare).

**Alternativas consideradas:** ninguna — es la causa raíz real, verificada
inspeccionando los `getBoundingClientRect()` del árbol antes/después del
cambio (el alto de `SheetBody` pasó de no coincidir con su contenedor a
coincidir exactamente).

**Por qué:** un bug de layout que solo se manifestaba con conversaciones
con bastantes mensajes — la verificación de cierre de fase usó solo 2-3
mensajes por conversación, insuficientes para que el contenido superase el
alto disponible y expusiera el problema. **Lección para futuras
verificaciones de UI-6 o similares**: probar con historiales largos
(15-20+ mensajes) y con la ventana de servicio cerrada, no solo con el
camino feliz corto.

**Pendiente:** un informe de un panel duplicado al cambiar de vista con
una conversación abierta, no reproducido tras varios intentos (detalle en
`docs/ui/CHAT.md` §5) — a la espera de pasos de reproducción más precisos.

## 2026-09-28 — Inbox: la conversación anclada no contrae la sidebar; menú de producto estilo Supabase

**Contexto:** el usuario reportó que abrir una conversación contraía la
sidebar global, y pidió copiar el comportamiento del asistente de IA de
Supabase Studio (que no contrae ningún menú) y su menú de segundo nivel
con líneas de separación. Revisado en el repositorio oficial
(`apps/studio/components/layouts/DefaultLayout.tsx`,
`ProjectLayout/index.tsx`, `ProjectLayout/LayoutSidebar/index.tsx`,
`Navigation/ProductMenuBar.tsx`, `components/ui/ProductMenu/index.tsx`):
el asistente es un `ResizablePanel` hermano de `<main>` — relativo en
`xl+` (estrecha el contenido), superpuesto por debajo — y la sidebar
global nunca reacciona a él; el menú de producto es una columna de 256 px
con cabecera de la altura del header (`border-b`), grupos con título
monoespaciado en mayúsculas separados por reglas, y `border-r` frente al
contenido.

**Decisión:** se elimina la contracción automática
(`src/components/shell/sidebar-auto-collapse.ts` y su escucha en
`AppSidebar`). El panel anclado mide `--sheet-w-sm` (384 px) en `xl` y
`--sheet-w-md` (560 px) en `2xl+`, de modo que sidebar expandida + menú +
lista (~400 px) + panel caben en 1280 px. Nuevo `ProductMenu`
(`src/components/shell/product-menu.tsx`) para las vistas de Inbox en
`lg+`; el `PageHeader` muestra la vista activa. En la fila, el nombre del
delegado pasa de `@sm:inline` a `@lg:inline` para no truncar el nombre del
Contact con la lista más estrecha.

**Alternativas consideradas:** anclar solo desde `2xl` (1536 px) y usar el
Sheet modal por debajo — descartada: en 1280 px la lista dejaría de ser
interactiva con la conversación abierta, justo lo que el modo anclado
existe para evitar (y el Sheet modal ocultaría la lista al árbol de
accesibilidad, algo que el E2E de recarga con el panel abierto comprueba).
Panel redimensionable como el de Supabase — aplazado: añade una
dependencia (`react-resizable-panels`) sin necesidad concreta todavía.

**Por qué:** la navegación global no debe cambiar por una acción local de
una página; el usuario lo pidió explícitamente con Supabase de referencia.

**Supersede a:** la parte de "la sidebar se contrae mientras el panel está
anclado" de la entrada de UI-6 (2026-09-27).

## 2026-09-28 — Inbox pasa a "Conversaciones": una sola lista, vistas como filtro

**Contexto:** tras ver el `ProductMenu` en Inbox, el usuario señaló que
vistas como "Pendientes" o "Sin identificar" no existen en WhatsApp: la
página debe ser, como en WhatsApp, un listado de todas las conversaciones
por fecha, con las no leídas marcadas con un punto verde, y al hacer clic
se abre el chat. El menú lateral se guarda para otras páginas.

**Decisión:** las vistas pasan a un desplegable "Mostrar" en el
`FilterBar`, con **Todas** por defecto (antes Pendientes); "Pendientes"
se renombra "Pendientes de respuesta". El módulo se llama
**"Conversaciones"** en la navegación, el título y el `<title>`; la URL
`/inbox` y los nombres en código no cambian (evita tocar rutas, E2E y
enlaces sin ganancia visible). El orden (último mensaje, en cualquier
dirección) ya era el pedido; se corrige que las conversaciones sin
mensajes salían **primeras** (`DESC` con `NULL` en PostgreSQL) con un
`coalesce` a la fecha de creación. El punto de no leída se apaga al abrir
la conversación, sin esperar al sondeo de 5 s. `ProductMenu`/`ContextNav`
se conservan sin consumidor, para Organización (UI-7).

**Alternativas consideradas:** nombre "Chats" (más cercano a WhatsApp,
pero anglicismo; el resto de módulos usa español) — el usuario puede
pedir otro, es un cambio de una línea. Renombrar también la URL a
`/conversations` — aplazado, no aporta nada visible.

**Supersede a:** la parte de "vistas en `ProductMenu`" de la entrada
anterior del mismo día, y la excepción "Inbox" de `docs/ui/PRINCIPLES.md` §5.

## 2026-09-28 — Espacio de respuesta: un panel con chat + ficha del afiliado; copiloto sobre el compositor

**Contexto:** el usuario quiere que, al abrir una conversación, el
delegado vea a la vez la información relevante del afiliado (afiliación
activa y desde cuándo, número, documentación aportada, resumen de la
situación) y un copiloto que ayude según avanza la conversación. Preguntó
si la ficha y el chat debían abrirse a la vez.

**Decisión (aceptada por el usuario):** un **único panel** que se desliza
desde la derecha con dos columnas (chat + ficha), no dos paneles
independientes; se abre con un clic en la fila entera; la ficha es de
**solo lectura** en la primera versión. El copiloto va entre el historial
y el compositor (donde se escribe), no en la ficha; "Usar como borrador"
solo rellena el compositor. Se planifica como fase UI-10 (paquetes
UI-10a…f) en `docs/ui/CONVERSATION_WORKSPACE.md`, sin código todavía;
mockup estático con datos ficticios en `docs/ui/mockups/`.

**Alternativas consideradas:** dos paneles que se abren por separado
(doble animación, dos cierres, estados huérfanos como una ficha sin chat);
abrir la ficha con clic solo en el texto del último mensaje (no
descubrible, y la fila es un único enlace por accesibilidad); copiloto en
la columna de la ficha (lejos de donde se escribe la respuesta).

**Por qué:** contestar necesita ver chat y contexto a la vez; un panel
único mantiene un solo modelo de apertura/cierre/foco, ya resuelto en
UI-6.

## 2026-09-28 — Kindly no almacena archivos de afiliados; trámites en el knowledge base; afiliación manual

**Contexto:** al planificar la ficha del afiliado (UI-10), el usuario fijó
que la plataforma **no guarda PDFs ni ningún archivo de los afiliados**,
solo trámites; que los datos de afiliación se dan de alta a mano por ahora
(con el caso "activa pero con la cuota actual sin pagar", y peticiones de
facturas de cuota); que el knowledge base incluye **trámites** con sus
documentos requeridos; y que la ficha y la documentación solo las ven el
delegado y los ADMIN.

**Decisión:** (1) los adjuntos que llegan por WhatsApp se guardan solo
como **metadatos** del `Message`; el contenido se descarga bajo demanda
por un proxy en streaming hacia la Graph API, sin escribirse en disco,
storage, logs ni caché. Se descarta `MessageAttachment` con storage R2
(que se había planteado horas antes en `CONVERSATION_WORKSPACE.md`). (2) La
sección "Documentación" de la ficha pasa a "Trámite y documentación":
lista de requisitos del trámite (`Procedure`, Fase 7) con estado
recibido/falta. (3) `Membership` con alta manual y `fee_paid_until`; "cuota
pendiente" se deriva. Las facturas de cuota no las genera ni guarda Kindly:
son un trámite. (4) Al afiliado se le avisa con un texto **veraz**: Kindly
no guarda el archivo, pero no puede prometer que se borre del WhatsApp del
delegado (coexistence) ni de Meta.

**Pendiente de confirmar antes de construir:** plazo de descarga y
retención de medios en la documentación actual de Meta (`CLAUDE.md` §3);
cómo se entrega el aviso (propuesta: texto que el delegado inserta y
envía, más la política de privacidad); cómo encaja "solo el delegado y los
ADMIN" con que hoy todos los miembros ven todo el Inbox y con que un
Contact puede tener varios delegados (`CONVERSATION_WORKSPACE.md` §7).

**Por qué:** minimiza el riesgo sobre datos sensibles (partes de baja =
datos de salud, art. 9 RGPD) y es decisión explícita del usuario. Nota: el
"entrenar un modelo con webs y PDFs" del encargo se implementa como
indexación con citas (RAG), no como entrenamiento, coherente con
`CLAUDE.md` §2.3 y §5.

## 2026-09-28 — Asignación de afiliados: un delegado a la vez, visibilidad por rol

**Contexto:** al definir quién ve la ficha del afiliado (UI-10) se vio que
el modelo actual no tenía "delegado del afiliado": hoy todos los miembros
ven todo el Inbox y `docs/PRODUCT.md` decía que un Contact puede ser
atendido por varios delegados.

**Decisión del usuario:** un afiliado tiene **un solo delegado a la vez**
y puede haber tenido varios en el pasado (histórico); un DELEGATE ve sus
afiliados; un ADMIN ve todos y puede reasignarlos. Se implementa como
paquete propio, **PKG-014**, antes de UI-10. Sustituye a la frase de
`docs/PRODUCT.md` §4 (actualizada).

**Choque con el principio de identidad (`CLAUDE.md` §2.1), sin resolver
todavía:** una conversación de WhatsApp vive en el número del delegado
que la recibió. Si el ADMIN reasigna a Marta de Ana a Luis, Luis **no
puede responder desde el número de Ana** sin romper el principio (y
sería suplantar a Ana ante Marta). Además, con coexistence, los mensajes
que Marta siga enviando al número de Ana llegan al móvil de Ana igualmente,
los muestre Kindly o no. Propuesta (a confirmar por el usuario):

- El historial de conversaciones pasa a ser visible para Luis en **solo
  lectura**, con la ficha completa.
- Luis contacta a Marta **desde su propio número**. Si han pasado más de
  24 h desde el último mensaje de Marta, WhatsApp solo permite una
  plantilla aprobada (`docs/INTEGRATIONS.md` §2.4), que hoy no existe en
  Kindly.
- Ana deja de ver la ficha de Marta, pero **sigue viendo las
  conversaciones de su propio número** (están en su móvil de todas formas).
  Si Marta le vuelve a escribir, la conversación muestra "Ahora la atiende
  Luis" para que Ana la redirija, y se avisa a Luis y al ADMIN.

**Alternativas:** que Luis responda desde el número de Ana (descartada:
rompe el principio 1); ocultarle a Ana todo lo de Marta (no evita que lo
vea en su móvil y deja mensajes sin atender).

## 2026-09-28 — Delegado de referencia y acceso temporal de otros delegados

**Contexto:** resuelve la pregunta abierta de la entrada anterior ("qué
pasa con las conversaciones al reasignar").

**Decisión del usuario:** se acepta la propuesta (historial en solo
lectura para el nuevo delegado, que contacta desde su propio número;
aviso de redirección) y se precisa:

1. Un afiliado tiene **un único delegado de referencia**, con histórico
 de los anteriores; el ADMIN lo reasigna. Un afiliado puede escribir
 por WhatsApp a **uno o varios** delegados.
2. El delegado de referencia ve al afiliado siempre, con **todo el
 historial con cualquier delegado** (lo de otros delegados, en solo
 lectura: solo se responde desde el número propio).
3. Si el afiliado escribe a un delegado que **no es su referencia**
 (Ana), Ana lo ve en su lista **resaltado en azul** ("Su delegado de
 referencia es Luis — redirígele los mensajes"), ve todo el historial
 con cualquier delegado y **puede contestar** desde Kindly o desde su
 móvil (siempre desde su propio número; le indica al afiliado que le
 contesta Ana).
4. En cuanto hay un mensaje entre el afiliado y su delegado de referencia
 **en cualquier dirección** (Marta escribe a Luis, o Luis escribe a
 Marta, desde Kindly o desde su móvil), Ana **deja de verlo** en su
 lista automáticamente; Luis ve también los
 mensajes que el afiliado cruzó con Ana.
5. El ADMIN ve todo.

**Cómo se respeta el principio de identidad:** nadie responde nunca desde
el número de otro delegado; ver el historial de otro delegado es lectura.
El acceso temporal de Ana **se deriva** de los mensajes (último entrante a
Ana más reciente que el último mensaje, en cualquier dirección, entre Marta
y Luis), sin estado adicional que pueda desincronizarse.

**Por definir al construir (propuesta por defecto):** si el afiliado no
vuelve a escribir a Luis, Ana lo sigue viendo indefinidamente (resaltado);
que el ADMIN pueda cortar ese acceso a mano. ~~Si es Luis quien escribe
primero al afiliado, el acceso de Ana no termina.~~ **Corregido por el
usuario el mismo día:** si Luis escribe a Marta, Ana también deja de verla
(regla 4 ya actualizada).

**Supersede a:** la propuesta de la entrada "Asignación de afiliados" del
mismo día (que decía que Ana seguía viendo sus conversaciones pero no la
ficha).

---

## 2026-09-28 — Rediseño UI/UX, UI-7: Organización

**Contexto:** construir `/organization` según `docs/ui/ORGANIZATION.md` —
General/Miembros/Canales bajo un único módulo, moviendo `/members` y
`/channels` (con su flujo de conexión) bajo `/organization/*`, más la
acción "cambiar rol" aprobada el 2026-09-26.

**Decisión:**

1. **Rutas movidas, no reescritas.** `members/` y `channels/` (incluido
   `channels/connect/[channel]/{,coexistence}`) pasan a
   `organization/members/` y `organization/channels/…` con `git mv` —
   mismos componentes, solo imports/`href` internos actualizados. Las
   rutas antiguas quedan como páginas de una línea con `redirect(...)`
   (`organization/channels/connect/.../coexistence` conserva el
   `?error=` al redirigir, para no perder el mensaje de un enlace
   antiguo a mitad del onboarding).
2. **Sidebar: un único ítem "Organización".** `NAV_ITEMS` pierde
   `Canales`/`Miembros`; `ORGANIZATION_NAV_ITEM` (icono `Building2`) se
   renderiza aparte, tras un separador, en `AppSidebar` y `MobileNav` —
   exactamente como preveía `LAYOUT_NAVIGATION.md` §3 desde la Fase 2,
   aplazado hasta que la ruta existiera.
3. **La miga de organización del header pasa a ser un menú de verdad**
   (`OrgMenu`, `DropdownMenu` con "Ajustes de la organización"/"Miembros"/
   "Canales") — la UI-2 la dejó como texto plano explícitamente porque
   `/organization` no existía; ya existe. `UserMenu` recupera el atajo
   "Mis canales" que UI-2 había retirado por redundante con el ítem de
   sidebar que esta fase elimina.
4. **`ProductMenu` (reservado desde UI-5) tiene por fin un consumidor**:
   `organization/layout.tsx` lo monta (`lg+`) con los tres ítems de
   `shell/organization-nav.ts`; cada página repite los mismos ítems como
   `ContextNav` horizontal (`<lg`) justo bajo su `PageHeader`, porque el
   layout no tiene cabecera propia bajo la que colocarlo una sola vez.
5. **Cambiar rol** (`organizations/service.ts::changeMemberRole`):
   transacción que bloquea (`for("update")`) todas las filas `ADMIN` de
   la organización antes de contarlas, no solo la fila del objetivo —
   sin eso, dos degradaciones concurrentes de dos ADMIN distintos podrían
   leer "quedan 2" cada una y dejar la organización sin ninguno, misma
   clase de carrera que `bootstrapOrganizationForUser` (2026-09-18).
   `ChangeRoleControl` es un `NativeSelect` en la fila (como pedía
   `ORGANIZATION.md` §4) que muestra el rol objetivo mientras se confirma
   y revierte al cancelar — solo hay dos roles, así que "cambiar" es
   siempre elegir el otro.
6. **Hallazgo real — los `throw` de una Server Action se redactan en
   producción.** El E2E del guardarraíl "la organización debe tener al
   menos un ADMIN" esperaba ver ese texto dentro del `ConfirmDialog` y en
   su lugar encontró el placeholder de React ("Minified React error
   #441"): contra `next build && next start` (lo que corre toda la
   suite E2E), un error lanzado dentro de una Server Action **no lleva
   su `message` al cliente**, solo un `digest` — la app real jamás vería
   el motivo de un rechazo así, solo un error genérico. Confirmado contra
   la guía oficial de Next para esta versión
   (`node_modules/next/dist/docs/.../10-error-handling.md`, "Handling
   expected errors": modelar como valor de retorno, no `throw`/`catch`).
   `changeMemberRoleAction` ya no lanza: devuelve `{ error }`, y
   `ChangeRoleControl` es quien relanza ese mensaje, pero **en el
   cliente** — ese `throw` nunca cruza el límite del servidor, así que no
   se redacta, y el contrato ya documentado de `ConfirmDialog` ("puede
   lanzar; su mensaje se muestra") se sigue cumpliendo sin tocarlo.
   `renameOrganizationAction` se dejó igual (sigue lanzando): su único
   caso de error es un nombre en blanco, ya bloqueado en el cliente por
   `required`, y ningún E2E lo ejercita — el mismo problema existe ahí en
   teoría (mostraría el error genérico de Next en vez de nada, sin
   `error.tsx` en `(app)`, como casi todas las rutas fuera de Inbox), pero
   corregirlo exigía introducir `useActionState` en un formulario que hoy
   usa el patrón `<form action={...}>` + `SubmitButton` de todo el resto
   de la app — cambio de patrón más amplio que esta fase, anotado para
   cuando alguna ruta lo necesite de verdad.

**Por qué:** cada punto sigue el mismo criterio que las fases anteriores
(`docs/ui/PRINCIPLES.md` §3): construir la pieza que el propio diseño de
`docs/ui/` ya preveía, en el momento en que deja de ser "un menú a ninguna
parte". El punto 6 es la excepción — no estaba planeado, lo encontró el
E2E nuevo, y se corrigió porque el mismo patrón (`ConfirmDialog` + una
Server Action que lanza) ya se usaba en dos sitios más (`revoke-invitation-
button.tsx`, `disconnect-channel-button.tsx`) que hasta ahora nunca habían
sido ejercitados con un error real en un build de producción.

**Verificación:** `tests/e2e/organization.spec.ts` nuevo (rename por
ADMIN + menú del header, cambiar rol ADMIN→DELEGATE→ADMIN y que un
DELEGATE ve el rol como texto plano, el guardarraíl del último ADMIN con
mensaje visible y reversión al cancelar); `tests/integration/
organizations.test.ts` ampliado (`changeMemberRole`/`renameOrganization`,
incluida la concurrencia del guardarraíl vía el bloqueo de fila). 281/281
unit+integration, 30/30 E2E (`members.spec.ts`/`channels.spec.ts`/
`whatsapp-onboarding.spec.ts`/`inbox.spec.ts`/`auth.spec.ts` actualizados
a las URLs nuevas). Verificación visual real a 900/1280/1920 px.

---

## 2026-09-28 — PKG-014: asignación de afiliados, dominio y visibilidad (parte 1)

**Contexto:** implementar las reglas ya decididas en las dos entradas
anteriores ("Asignación de afiliados", "Delegado de referencia y acceso
temporal"). Esta entrada cubre la primera parte de la sesión: esquema,
servicio de asignación, la regla de visibilidad en SQL, y su cableado en
Inbox/Contactos/Casos/Tareas. La UI (fila azul, aviso, reasignar,
histórico) queda para una segunda parte de la misma sesión.

**Decisión:**

1. **`contact_assignments` es un log, no una columna.** Una fila por
   asignación, nunca se actualiza en su sitio: reasignar cierra la fila
   activa (`ended_at = now()`) e inserta una nueva. Un índice único
   parcial (`WHERE ended_at IS NULL`) garantiza una sola fila activa por
   Contact incluso bajo condiciones de carrera — mismo patrón que
   `organization_invitations_pending_unique` (PKG-006). Migración
   `0007_magical_owl.sql`: además de crear la tabla, hace *backfill* de
   cada Contact existente con Conversation al delegado de la más
   reciente — el primer caso en este repositorio de una migración que
   escribe datos, no solo esquema.
2. **La asignación inicial no genera Activity propia.** Tanto la creación
   manual (`createContact`, asignada a quien la crea) como la automática
   por mensaje entrante (`findOrCreateConversation`, asignada al delegado
   dueño de la cuenta que lo recibió) insertan su fila de
   `contact_assignments` **dentro de la misma transacción** que crea el
   Contact — nunca hay un instante en que un Contact exista sin
   asignación — pero sin `recordActivity`: `CONTACT_CREATED` ya cubre "este
   Contact nació"; solo una reasignación explícita posterior
   (`assignContactToDelegate`, `CONTACT_DELEGATE_ASSIGNED`) es un evento
   que vale la pena en el feed.
3. **El formulario de alta manual de Contact no tiene selector de
   delegado.** Se asigna a quien lo crea (ADMIN o DELEGATE por igual).
   Añadir un campo obligatorio solo relevante cuando un ADMIN da de alta
   en nombre de otra persona habría complicado el formulario para el caso
   común; la acción "Reasignar" ya cubre la corrección inmediata.
   **Propuesta por defecto, no confirmada explícitamente por el
   usuario** — igual que otros puntos ya marcados así en las entradas
   anteriores.
4. **La visibilidad es un único predicado SQL reutilizado en todas
   partes** (`contacts/visibility.ts::contactVisibilityCondition`), no una
   consulta separada por módulo. Autocontenido (su propio
   `exists (select ... from contacts c ...)` con alias local `c`) en vez
   de asumir que quien lo llama ya tiene `contacts` en el `FROM`/`JOIN` —
   así sirve igual para `contacts` directamente, o para `cases`/`tasks`/
   `conversations` pasando su columna `contact_id` respectiva. `undefined`
   para un ADMIN (sin filtro, mismo convenio que el resto del código con
   `and(...)`). Para un DELEGATE: referencia activa, **o** "acceso
   temporal" — el último mensaje entrante del Contact hacia él es más
   reciente que el último mensaje (cualquier dirección) entre el Contact y
   su delegado de referencia — calculado con SQL de tres valores
   (`NULL > x` es `NULL`/falso), sin necesitar comprobar explícitamente
   "nunca escribió" como caso aparte. Un Contact sin ningún delegado de
   referencia (solo alcanzable para uno de antes de esta migración sin
   Conversation) cae a "quien lo escribió por última vez puede verlo" vía
   `coalesce(..., '-infinity')`.
5. **Cada módulo gana una variante `...ForMember` junto a la que ya
   tenía**, nunca sustituyéndola: `listContacts`/`getContact`,
   `listCases`/`getCase`, `listTasks`/`getTask` siguen sin filtrar,
   reservadas para comprobaciones internas de integridad (¿este id
   pertenece a esta organización?) que no deben depender de quién
   pregunta. Mismo patrón que `listMessagingAccountsForMember` (PKG-007)
   junto a `listMessagingAccounts`. Una `Task` sin `contactId` (tarea
   general) es visible para todos — solo se filtra cuando tiene uno.
6. **Cerrado un hueco real de identidad, no solo de visibilidad**:
   `sendOutboundMessage` no comprobaba que quien pulsaba "Enviar" fuera el
   delegado dueño de la cuenta de esa Conversation — con el Inbox
   compartido de PKG-004, cualquier miembro podía responder a través del
   número de otro delegado. La regla 3 de "Delegado de referencia..."
   ("Ana... puede contestar... siempre desde su propio número") solo se
   cumple si esto se aplica en el dominio, no solo ocultando el
   compositor en la UI — así que `sendOutboundMessage` ahora rechaza el
   envío si `account.delegateId !== actorUserId`, para cualquier rol
   (tampoco un ADMIN puede enviar por el número de un delegado). La UI
   para ocultar/deshabilitar el compositor en ese caso queda para la
   segunda parte.
7. **Aceptado sin cubrir en esta parte** (bajo riesgo, anotado para no
   perderlo): el indicador de "escribiendo…" (`signalTyping`) no
   comprueba dueño de cuenta — es una señal efímera, no dice nada
   persistente en nombre de otro delegado; `reassignConversationContact`
   (mover una Conversation a otro Contact) no revalida visibilidad más
   allá del aislamiento por organización — solo alcanzable hoy vía la UI
   del Inbox, que ya filtra qué Conversations se ofrecen; el filtro de
   canal de Inbox (`listConversationChannels`) sigue sin acotar por
   delegado, igual que ya era independiente de vista/búsqueda por diseño
   (`docs/ui/INBOX.md` §2) — un DELEGATE puede ver una opción de canal que
   no le devuelva resultados, imperfección de UX, no de seguridad.

**Verificación:** `tests/integration/contact-assignments.test.ts` nuevo —
asignación inicial (manual y por mensaje), reasignación (historial,
no-op al reasignar al mismo, rechazo fuera de organización), el escenario
completo Marta/Ana/Luis (acceso temporal que aparece y desaparece según
quién escribió a quién y cuándo, incluida la corrección "si Luis escribe a
Marta, Ana también deja de verla"), Casos/Tareas heredando la visibilidad
de su Contact, aislamiento multi-tenant. `tests/integration/inbox.test.ts`
y `messaging.test.ts` actualizados a las firmas nuevas, con dos tests
nuevos que sustituyen a uno cuya premisa PKG-014 volvía falsa ("el Inbox es
compartido, no por delegado" ya no es cierto para un DELEGATE). 294/294
unit+integration, 30/30 E2E (sin cambios de comportamiento visible para
las suites existentes: todas registran un único ADMIN que actúa sobre sus
propios datos, donde el nuevo filtro de visibilidad no cambia nada).

---

## 2026-09-28 — PKG-014, parte 2: UI de acceso temporal, reasignar y solo lectura

**Contexto:** cierra el paquete con la parte de interfaz que la parte 1
dejó pendiente — resaltado, aviso, reasignar y solo lectura entre
delegados.

**Decisión:**

1. **Un Contact con más de un delegado escribiéndole se ve como varias
   filas del Inbox, una por Conversation, no como un hilo fusionado.**
   `docs/PRODUCT.md`/`TASKS.md` piden "ver todo el historial con
   cualquier delegado"; la forma más simple de dar eso con el modelo
   actual (una Conversation = un `MessagingAccount` = un delegado) es
   dejar que la visibilidad por Contact (ya resuelta en la parte 1) haga
   que ambas Conversations aparezcan, en vez de escribir un mecanismo
   nuevo para fusionar mensajes de varias Conversations en un solo hilo
   con atribución de autor por mensaje. Un hilo de verdad fusionado se
   deja para UI-10 (`CONVERSATION_WORKSPACE.md`), donde ya hace falta
   diseñar la ficha del afiliado de todas formas — construirlo aquí
   habría sido diseñar dos veces la misma pieza.
2. **`ConversationPreview`/`ConversationDetails` ganan
   `referenceDelegateId`** (un `LEFT JOIN` a `contact_assignments` sobre
   `ended_at IS NULL`, seguro como join 1:1 gracias al índice único
   parcial) — la UI decide el resaltado comparando ese id con el
   visor, no repitiendo la lógica de "acceso temporal" en el cliente:
   si el visor no es el id, la fila/conversación se marca, sea por ser
   temporal o simplemente por no ser su propio canal.
3. **Cerrado el hueco de identidad de la parte 1 en la UI**:
   `ConversationThread` oculta el compositor entero (no solo lo
   deshabilita) cuando `canReply` es falso — calculado comparando el
   delegado dueño de la propia `MessagingAccount` de la Conversation con
   el visor, independiente de si es o no el delegado de referencia. Un
   `Alert` "Solo lectura" explica por qué, con el nombre del dueño real.
4. **Hallazgo real, esta vez de proceso, no de producto**: un proceso
   `next-server` que sobrevivió a una comprobación visual manual anterior
   (`lsof -ti:3000 | xargs kill` no verificado con un `ps`/`lsof` de
   seguimiento) quedó escuchando en el puerto 3000. `playwright.config.ts`
   tiene `reuseExistingServer: !process.env.CI`, así que cada
   `npm run test:e2e` posterior — incluida la verificación "30/30" de la
   parte 1 de este mismo paquete — reutilizó ese proceso en vez de
   reconstruir, sin dar ningún error: los specs existentes, ajenos al
   código nuevo, seguían pasando igual contra el build viejo. Se detectó
   solo porque una aserción nueva (que solo podía cumplirse con el código
   de la parte 1) falló mientras la misma lógica, probada de forma
   aislada con un test de integración directo contra la misma base de
   datos, era correcta — lo que apuntaba al *servidor bajo prueba*, no al
   código. Confirmado con `ps aux | grep next-server`. Solución: matar el
   proceso, `rm -rf .next`, reconstruir y repetir toda la suite E2E desde
   cero. Anotado en memoria para no repetirlo.

**Verificación:** `tests/e2e/contact-assignments.spec.ts` nuevo, con dos
delegados reales y una organización — Marta escribe primero a Luis
(referencia), luego a Ana (llamada directa a SQL para adjuntar la segunda
Conversation, ya que el pipeline de webhooks nunca fusiona un Contact
existente): la fila de Ana sale resaltada con "Ref.: Luis", su propia
Conversation con Marta admite responder, la de Luis (abierta por Ana) es
"Solo lectura"; el ADMIN reasigna desde `/contacts/[id]` y el resaltado se
mueve. 295/295 unit+integration, **31/31 E2E — reconstruido desde cero y
reverificado tras el hallazgo del punto 4**, verificación visual real
(highlight, aviso, solo lectura, control de reasignar).

---

## 2026-09-28 — Fix: migración pendiente en staging + panel roto al re-hacer clic en la conversación abierta

**Contexto:** el usuario probó PKG-014 en staging (desplegado tras hacer
`git push` de esta sesión) y encontró dos problemas reales, ninguno
cubierto por la suite hasta ahora porque ambos son específicos de un
entorno desplegado o de un patrón de clic que ningún test ejercitaba.

**Problema 1 — `relation "contact_assignments" does not exist` en
staging.** La migración `0007_magical_owl.sql` (PKG-014) solo se había
aplicado contra la base de datos local del agente
(`npm run db:migrate`, que lee `DATABASE_URL_UNPOOLED`/`DATABASE_URL` del
`.env` local) — nunca contra la base de datos real que usa el despliegue
de staging en Vercel. El proyecto no ejecuta migraciones en el build
(`"build": "next build"`, sin paso de migración), así que aplicarlas en
cada entorno sigue siendo manual. Se aplicó a mano contra la base de
datos de staging (Neon) con la cadena de conexión real de ese entorno.
**Nada que corregir en el código** — es un recordatorio de proceso: toda
sesión que añada una migración de esquema debe señalarlo explícitamente
como pendiente de aplicar en cada entorno desplegado, no solo en local.

**Problema 2 — el panel se rompía al volver a hacer clic en la
conversación ya abierta** (real, encontrado en staging, reproducido
después en local): la fila era un `<Link href="/inbox/<id>">` sin más;
al hacer clic estando ya en esa URL, el router de Next no lo trata como
el no-op que sería un enlace normal a la página actual — para esta ruta
(interceptada/paralela: `@sheet/(.)[id]` junto a `inbox/page.tsx`)
resolvió los *slots* de forma distinta la segunda vez, dejando caer la
lista entera y pinchando el panel solo, pegado al borde izquierdo. Ya
había un aviso sin reproducir en `docs/ui/CHAT.md` §1 sobre "panel
duplicado al cambiar de vista con una conversación abierta" — probable-
mente la misma clase de fallo, con un patrón de clic distinto.
**Corregido en `DataList`** (`src/components/ui/data-list.tsx`), no en
Inbox específicamente — cualquier fila ya seleccionada ahora bloquea la
navegación en su propio `onClick` (`event.preventDefault()` cuando
`selected` es `true`), así que el clic nunca llega a iniciar esa
navegación redundante. Arregla la clase entera de fallo sin necesidad de
entender el porqué exacto de cómo Next resuelve los *slots* la segunda
vez.

**Hallazgo de proceso, no de producto, durante la investigación**: varios
procesos `next dev`/`next-server` de sesiones de depuración anteriores
habían quedado vivos en paralelo (puertos 3000/3001/3002), interfiriendo
entre sí y con el *hot reload* — un `console.log` de depuración tardó dos
intentos en aparecer en los logs del navegador porque el servidor que
respondía no era el que acababa de recompilar. Mismo tipo de causa raíz
que el hallazgo de servidor obsoleto de la parte 2 de PKG-014: verificar
siempre con `ps aux | grep next` antes de fiarse de un resultado que no
cuadra.

**Verificación:** nuevo test E2E
`tests/e2e/inbox.spec.ts::"re-clicking the already-open conversation
keeps the list next to the panel"` — abre una conversación y hace clic
en la misma fila dos veces más, comprobando que la lista y el hilo
siguen visibles después de cada uno. 295/295 unit+integration, 32/32
E2E (reconstruido desde cero).

---

## 2026-09-29 — UI-10a: panel de dos columnas (chat + ficha del afiliado)

**Contexto:** `docs/ui/CONVERSATION_WORKSPACE.md` (fase UI-10, decisiones
del usuario del 2026-09-28) pide que el panel de conversación pase de una
columna (solo chat) a dos — chat y una ficha del afiliado de solo lectura
— con un solo cierre y una sola animación de entrada. UI-10a es el primer
paquete de esa fase, el único sin dominio nuevo.

**Decisión:** la ficha vive como segunda columna del mismo `<aside>`
anclado (`ConversationSheet`), no como un panel independiente — así el
cierre y la animación de entrada siguen siendo uno solo por construcción,
sin coordinar dos componentes. Es plegable en `xl+` con un botón en el
header (`PanelRightClose`/`PanelRightOpen`), cuya preferencia se recuerda
en una cookie (`kindly_ficha`, `src/app/(app)/inbox/ficha-cookie.ts` +
`ficha-actions.ts`) exactamente igual que la sidebar
(`sidebar-cookie.ts`/`sidebar-actions.ts`) — mismo motivo: seguir
correcto en la siguiente carga completa basta, no hace falta esperar la
escritura en el clic. Por debajo de `xl` no caben dos columnas legibles
(mismo umbral y razón que UI-6 para el modal), así que la ficha pasa a
ser una pestaña "Ficha" junto a "Chat" del mismo panel (`Tabs`, estado
local, sin tocar la URL).

**Identificación, movida; delegado de referencia, extraído sin
duplicarse:** el `Alert` "Contacto no identificado" que vivía sobre el
chat (`conversation-sheet.tsx`) se movió tal cual a la ficha
(`identification-section.tsx`) — la acción de "acceso temporal" (aviso
"Su delegado de referencia es X") **no** se movió: sigue sobre el chat en
los tres modos, porque describe una situación de *esta* conversación, no
del afiliado en general (`CONVERSATION_WORKSPACE.md` §7: "la ficha se
muestra completa" con o sin ese aviso). La sección "Delegado de
referencia" de `/contacts/[id]` (que ya llevaba una nota deliberada
señalando que era provisional hasta que existiera la ficha) se extrajo a
`src/app/(app)/contacts/reference-delegate-section.tsx`, reutilizada por
ambos sitios en vez de reescrita — la página de contacto sigue mostrando
exactamente lo mismo que antes.

**Tres consultas nuevas, sin migración:** `listCasesForContact`,
`listTasksForContact` (mismo predicado `contactVisibilityCondition` que
sus variantes `...ForMember`, acotado a un `contactId`) y un filtro
`contactId` añadido a `listConversationsWithPreview` — la ficha reutiliza
la consulta ya probada del Inbox en vez de escribir una nueva para
"otras conversaciones".

**Teclado:** `F6`/`Ctrl+F6`, que alternaban entre lista y chat, pasan a
recorrer tres zonas (lista → chat → ficha) cuando la ficha está visible
(detectando la zona actual por `contains(document.activeElement)`), dos
en caso contrario — generalización que coincide exactamente con el
comportamiento anterior en el caso de dos zonas.

**Fuera de esta fase, a propósito:** afiliación/`Membership` (UI-10b),
adjuntos sin almacenar (UI-10c), resumen de situación por IA (UI-10d) y
copiloto (UI-10e) no tienen dominio todavía — sus filas de la tabla de
`CONVERSATION_WORKSPACE.md` §3 no aparecen en la ficha, no se dejaron como
huecos vacíos o placeholders.

**Verificación:** 300/300 unit+integration (12 tests nuevos en
`tests/integration/contact-assignments.test.ts`), 34/34 E2E (2 nuevos en
`tests/e2e/conversation-workspace.spec.ts`: ficha visible por defecto y
plegable con preferencia persistente en anclado; pestañas Chat/Ficha por
debajo de `xl`), captura visual real a 1280/1536/1920px y móvil (390px)
comparada con el mockup de `docs/ui/mockups/conversation-workspace.html`.

---

## 2026-09-29 — Fix: la lista "tintineaba" al abrir una conversación

**Superseded — ver la entrada siguiente ("...reservar el ancho al clic no
bastaba")**: la solución de esta entrada (reservar el ancho de la lista en
el propio evento de clic) sí quitó el salto sin transición, pero introdujo
un problema nuevo — la lista y el panel dejaban de moverse a la vez. Se
conserva esta entrada porque el diagnóstico de por qué el salto no era
transicionable (hermano `flex-1` reaccionando a la inserción de otro
hermano) sigue siendo válido y es la base del arreglo final.

**Reportado por el usuario**, probando UI-10a: al hacer clic en una
conversación desde `/inbox`, la zona de la lista hacía "una animación
extraña... tintineando, reapareciendo todo el listado" al aparecer el
chat y la ficha. Pedido explícito: quitar esa animación; que la única
animación visible sea la entrada del panel y la contracción de la lista.

**Diagnóstico** (con un script Playwright instrumentado con
`MutationObserver` + muestreo de `getBoundingClientRect()` por frame,
relativo al timestamp real del clic, no a `performance.now()` desde la
carga de la página — el primer intento midió mal por esta confusión):
la lista **nunca se remonta** (el nodo `<ul>` persiste; PKG-014 ya lo
garantiza — ver la entrada de arriba sobre el bug de re-clic). El único
cambio real es que su ancho salta **instantáneamente**, sin transición,
en el mismo commit de React en que el panel (`ConversationSheet`)
termina de montarse — y ese commit llega solo después de que el
`Promise.all` de datos del panel (más consultas desde que UI-10a añadió
la ficha) resuelve en el servidor, típicamente 400-500 ms después del
clic. La causa de que sea *instantáneo* en vez de transicionado: el
ancho de un hermano `flex-1` que cambia porque **otro hermano se acaba
de insertar** no es una propiedad transicionable de ese elemento — es un
recálculo de layout ajeno, y CSS no anima eso.

**Por qué `loading.tsx` no sirve aquí**: se probó primero un esqueleto
(`@sheet/(.)[id]/loading.tsx`) del tamaño final del panel, para que el
hueco se reservara en cuanto Next empezara a cargar la ruta. No se llegó
a ver nunca: Next envuelve la navegación cliente en una transición de
React, que mantiene la UI **anterior** en pantalla (aquí, nada) hasta que
el árbol nuevo está listo — el *fallback* de Suspense nunca llega a
pintarse para este tipo de navegación. Se retiró (no tiene sentido dejar
código que nunca se ejecuta).

**Decisión: reaccionar al propio evento de clic, no a la navegación.**
`DataList` (`src/components/ui/data-list.tsx`) gana un `onItemClick`,
disparado de forma síncrona en el mismo `onClick` que ya existía (el
guardarraíl de PKG-014 contra el re-clic de la fila ya seleccionada).
`InboxList` lo usa para reservar el ancho final del panel **en el mismo
frame que el clic** — con un estado local (`pendingOpenId`), no atado al
router ni a ninguna transición. Como ahora el cambio de ancho es un
alternar de clase sobre el propio elemento (igual que el colapso de la
sidebar, `app-sidebar.tsx`), sí es transicionable de verdad
(`transition-[max-width]`).

**Segundo bug real, encontrado verificando la propia transición**: con la
clase ya puesta, el ancho seguía saltando sin animar. Causa: el estado
"sin reservar" no llevaba ningún `max-w-*` (equivalente a `max-width:
none`), y una transición CSS no puede interpolar hacia o desde `none` —
ninguna de las dos partes que compara existía como valor concreto.
Corregido dándole también un valor definido al estado por defecto
(`xl:max-w-full`, visualmente idéntico a no tener la clase, pero
transicionable).

**La reserva adivina el ancho de la ficha** (colapsada o no) leyendo la
cookie `kindly_ficha` directamente con `document.cookie` en un efecto
diferido (no importada de `ficha-cookie.ts`, que es `server-only`) — solo
tiene que acertar lo bastante a menudo como para no producir un
*segundo* salto, no estar siempre actualizada al segundo.

**Verificación**: nuevo test E2E,
`tests/e2e/conversation-workspace.spec.ts::"opening a conversation
narrows the list immediately, not once the panel's data has loaded"` —
deliberadamente sin espera de por medio (una carrera contra un
temporizador habría sido frágil en ambos sentidos); comprueba el ancho
justo después de que `.click()` resuelve. Verificado a mano con
`git stash` que **falla** contra el código anterior (ancho sin cambiar)
y **pasa** con el arreglo. 300/300 unit+integration, 35/35 E2E completo.

---

## 2026-09-29 — Fix: reservar el ancho al clic no bastaba, hacía falta una sola transición

**Superseded — ver "Panel de conversación en cliente, sin navegación"
(misma fecha, más abajo).** El `@starting-style` de esta entrada solo
animaba la entrada, y seguía empezando tras el viaje al servidor.

**Reportado por el usuario**, probando el arreglo de la entrada anterior:
"sigue habiendo tintineo cuando se expande el chat y la ficha al hacer
clic... se encoge más rápido que lo que se expande el chat". Diagnóstico
correcto del usuario: el arreglo anterior hacía que la lista reaccionara
al clic **de inmediato** (~10-70 ms, confirmado por muestreo), mientras
que el panel de verdad no empieza a aparecer hasta que el servidor
responde (~400-500 ms) — dos movimientos separados, desincronizados, en
vez de uno solo. La lista "terminaba" su animación mucho antes de que el
panel ni siquiera empezara la suya.

**Decisión: que sea un único elemento el que anima, y que el resto lo
siga gratis.** Se revirtió por completo el mecanismo de la entrada
anterior (`onItemClick` de `DataList`, `pendingOpenId`, la adivinanza de
la cookie de ficha, las clases `max-w-*` de `InboxList`) — nada de eso
sobrevive. En su lugar, el propio `<aside>` del panel
(`conversation-sheet.tsx`) pasa de una animación de `transform`
(`animate-slide-in-right`, que nunca toca el layout — por eso la lista ya
tenía su ancho final desde el primer frame, sin nada que animar cuando el
panel por fin llegaba) a una transición real de `width`, con
`@starting-style` (variante `starting:` de Tailwind — soportado por los
navegadores actuales) para que crezca desde `0` en el momento de
insertarse, sin JavaScript. La lista, un simple hermano `flex-1` sin
ninguna clase nueva, sigue ese crecimiento **frame a frame** porque ahora
es una propiedad que de verdad cambia de forma continua en el propio
elemento — el mismo mecanismo por el que el panel de contenido junto a la
sidebar (`app-sidebar.tsx`) ya se ajusta solo cuando esta colapsa, sin
ningún código propio.

**Por qué no valía con transicionar el `max-width` de la lista** (lo que
hacía la entrada anterior): eso solo puede dispararse en el mismo commit
en que el panel real aparece — que es exactamente el momento en que React
ya no muestra ningún estado intermedio para esta navegación (ver la
entrada anterior, "por qué `loading.tsx` no sirve aquí"). Adelantarlo al
clic (como se hizo) lo desacopla del panel real. La única forma de que
ambos se muevan **a la vez y a la misma velocidad** es que uno sea
la causa física del otro — de ahí crecer el propio panel en vez de
reservar espacio por separado.

**`overflow-hidden` en el `<aside>`**: sus dos columnas (chat, ficha)
mantienen su ancho fijo de siempre durante todo el crecimiento — no se
comprimen, se revelan de izquierda a derecha a medida que el panel se
ensancha. Verificado con capturas rápidas en sucesión: el chat se revela
primero (ocupa casi todo el crecimiento inicial), la ficha aparece y se
termina de revelar en el último tramo — un fotograma suelto puede pillar
el borde derecho de la ficha a medio cortar, se resuelve en el fotograma
siguiente. Aceptado como razonable dada la brevedad (con
`--duration-slow`, 250 ms nominales).

**Verificación, sin depender de temporizadores frágiles**: el test E2E
anterior (que medía "¿ya es más estrecha justo después del clic?") ya no
tiene sentido — con este mecanismo la lista **no** reacciona antes de que
el panel llegue, reacciona **con** él. Se sustituyó por
`tests/e2e/conversation-workspace.spec.ts::"anchored: the panel grows
into place (and the list follows it) over several frames, not in one
jump"`: muestrea el ancho real del `<aside>` en cada frame desde antes
del clic hasta después de que la ficha es visible, y comprueba que hay
**más de dos valores distintos** — la señal de que hubo una interpolación
de verdad, no un salto. Verificado a mano con `git stash` que **falla**
contra el `<aside>` anterior (un único valor de ancho, el salto) y
**pasa** con el arreglo. 300/300 unit+integration, 35/35 E2E completo.

---

## 2026-09-29 — Panel de conversación en cliente, sin navegación (supersede el diseño de rutas de UI-6)

**Superseded en parte — ver "Inbox con estado en la URL y caché cliente"
(misma fecha, más abajo).** Sigue vigente: panel siempre montado,
transición única de ancho, cookie de ficha en cliente, sin
`revalidatePath` en las acciones del Inbox. Cambia: la URL (`/inbox/<id>`
→ `?conversation=<id>`), la caché casera (→ TanStack Query) y la lista y
los filtros, que aquí seguían siendo navegación de servidor.

**Contexto:** tercera ronda del usuario sobre el mismo síntoma: "al hacer
clic, tarda en abrir unos milisegundos... debe ser suave y limpio al
aparecer y al cerrar... el botón de contraer la ficha no desplaza a la
derecha el panel de chats... revisa si al cerrar se recarga el listado".
Las dos entradas anteriores trataron el síntoma con CSS; la causa era de
arquitectura. Revisado a fondo:

1. **Abrir era una navegación de servidor** (ruta interceptada
   `@sheet/(.)[id]`, UI-6): nada podía empezar a moverse antes del viaje
   de ida y vuelta (~400-500 ms, más desde que la ficha añadió consultas).
2. **Cerrar desmontaba el panel** (la ruta dejaba de coincidir): ninguna
   transición de salida era posible. En carga directa, además, cerraba con
   `router.push('/inbox')`, que **sí volvía a renderizar la lista entera en
   el servidor**.
3. **Plegar la ficha la desmontaba al instante** (render condicional), y
   la preferencia se guardaba con una Server Action que escribe cookie:
   según la documentación de Next (`cookies.md`), eso re-renderiza la
   página actual en el servidor — **toda la lista, en cada clic**.
4. `sendReplyAction`, `markContactIdentifiedAction` y
   `reassignConversationContactAction` llamaban a `revalidatePath("/inbox")`:
   otro re-render completo de la página en el servidor **en cada mensaje
   enviado**, para unas props que la lista ya montada nunca vuelve a leer
   (inicializa su estado una vez y sondea `/api/inbox` cada 5 s).

**Decisión:** el panel pasa a ser un componente cliente **siempre montado**
junto a la lista (`InboxWorkspace` + `ConversationPanel`), y abrir/cambiar/
cerrar dejan de ser navegaciones:

- Estado "abierto" local y urgente, actualizado en el propio clic; URL con
  `window.history.pushState`/`replaceState` (API nativa, integrada
  oficialmente con `usePathname`; Atrás/Adelante los restaura Next desde
  la propia entrada del historial — verificado en
  `node_modules/next/dist/client/components/app-router.js`). `/inbox/<id>`
  sigue siendo una URL real (carga directa = `[id]/page.tsx`, mismo
  componente con los datos resueltos en servidor).
- Datos del panel por `GET /api/conversations/<id>/workspace` (mismo
  constructor que la carga directa, `conversation-workspace-data.ts`),
  **precargados al pasar el ratón o el foco por la fila** y cacheados; la
  precarga no marca como leída (`getConversationThreadState` gana
  `{ markRead }`), lo hace el primer sondeo del hilo, ahora inmediato.
  Sin datos todavía, el panel abre igual al instante con esqueleto.
- Un único `<aside>` cuyo `width` transiciona entre cerrado / solo chat /
  chat + ficha: abrir, cerrar y plegar son la misma transición en ambos
  sentidos, la lista (`flex-1`) la sigue frame a frame, y la ficha ya no se
  desmonta al plegar — sale por el borde mientras el chat se desplaza a la
  derecha. El contenido cerrado sigue renderizado hasta terminar de salir.
- Cookie de la ficha escrita desde el navegador (`ficha-preference.ts`);
  eliminadas `ficha-actions.ts` y todas las carpetas `@sheet`.
- Quitados los `revalidatePath` de las tres acciones del Inbox; la ficha
  recarga sus propios datos tras una mutación (`onMutated`), y
  `ReassignDelegateControl` gana `onReassigned` para lo mismo.
- Filas: `DataList` gana `onItemActivate` (un clic normal abre sin navegar;
  un clic con modificador sigue abriendo pestaña) y `onItemIntent`
  (precarga); con `onItemActivate` los enlaces dejan de prefetchear una
  ruta a la que nunca se navega.

**Alternativas consideradas:** mantener las rutas y animar alrededor (las
dos entradas anteriores — el viaje al servidor seguía siendo el primer
paso de cada apertura, y el cierre seguía sin salida animable); abrir en
`/inbox?c=<id>` (una sola ruta, pero cambia URLs ya enlazadas y
documentadas).

**Medido tras el cambio** (Playwright, clics reales, 1600 px): el panel
empieza a moverse a ~30 ms del clic y termina a ~230 ms, con el contenido
ya presente desde el primer frame si se precargó; plegar/desplegar y
cerrar, igual; cambiar de conversación, sin movimiento y contenido a
~12 ms. **Tests**: `tests/e2e/conversation-workspace.spec.ts` — transición
real en ambos sentidos con la suma de anchos lista + panel constante en
cada frame; plegar desplaza el chat a la derecha; abrir/cerrar/Atrás/
Adelante sin ninguna petición de ruta al servidor y sin remontar la lista.
298/298 unit+integration (el test de tokens crea un caso por `.tsx`: se
borraron 3 `@sheet`, se añadió 1), 36/36 E2E.

**Supersede a:** el diseño de rutas paralelas/interceptadas de UI-6
(`docs/ui/CHAT.md` §1, reescrito) y las dos entradas anteriores de hoy.

---

## 2026-09-29 — Inbox con estado en la URL y caché cliente (TanStack Query)

**Contexto:** cuarta ronda del usuario: "has tratado de optimizar un
problema en vez de resolverlo... desde la URL no debería llamarse al
servidor al hacer clic en una conversación... la pantalla debería cargar
las conversaciones por detrás y tenerlas en caché, como TanStack Query...
`/inbox?conversation=<id>`... con botón de reintentar si se queda sin red,
y el filtro iría más rápido". Correcto: la entrada anterior sacó el panel
de las rutas pero dejó la mitad del Inbox atada al servidor — cada cambio
de filtro era `router.push` (render completo de la página y remonte de la
lista), la conversación abierta era un segmento de ruta (`/inbox/<id>`,
otra página distinta de `/inbox`), y los datos del panel vivían en una
caché casera sin reintentos ni estado de error.

**Decisión:**

- **Todo el estado de la pantalla es query string**:
  `/inbox?view&search&channel&delegateId&conversation=<id>`, una sola
  ruta. Cambiarlo — abrir, cambiar o cerrar conversación, filtrar — es
  History API (`pushState`/`replaceState`), nunca navegación. `page.tsx`
  solo se renderiza en la primera carga o una recarga. `/inbox/<id>`
  queda como redirección a `?conversation=<id>` (enlaces y marcadores).
- **TanStack Query** (`@tanstack/react-query` 5, dependencia nueva, pedida
  por el usuario) como caché cliente del área autenticada
  (`src/components/providers/query-provider.tsx`, en el layout `(app)`):
  una consulta por combinación de filtros (refresco en segundo plano cada
  5 s, sustituye al `setInterval` propio; `keepPreviousData` para que un
  filtro nuevo no parpadee a esqueleto) y una por conversación (chat +
  ficha; precarga al pasar el ratón, reutilizada 15 s). El servidor la
  siembra en la primera carga (`HydrationBoundary` + `dehydrate`), así que
  el primer pintado sale completo. Tras una mutación se invalidan las
  consultas afectadas; enviar un mensaje refresca la lista al momento.
- **Errores**: dos reintentos automáticos en fallos de red/5xx (nunca en
  4xx), y después "Reintentar" visible en la lista y en el panel. 404/403
  → `EmptyState`, también en carga directa.
- `/api/inbox` y la página comparten un único parser de filtros
  (`inbox-filters.ts`); de paso se corrige que la API tomara "pending"
  como vista por defecto y la página "all".
- La lista ya no se remonta al cambiar de filtro (antes llevaba `key` por
  filtros): el buscador conserva el foco mientras se escribe; el aviso de
  "conversaciones nuevas" se reinicia por su cuenta al cambiar de filtro.

**Alternativas consideradas:** mantener `/inbox/<id>` como URL de la
conversación (obliga a dos páginas de servidor distintas para la misma
pantalla y a mezclar ruta y estado); una caché propia (ya existía y era
justo lo que faltaba: reintentos, invalidación, deduplicación, estado de
error); SWR (equivalente para este caso; TanStack Query es la opción que
nombró el usuario y trae hidratación desde Server Components documentada).

**Por qué no contradice `docs/ARCHITECTURE.md` §14 ("no introducir
infraestructura sin necesidad"):** es una biblioteca de cliente, sin
servicio ni proceso nuevo; la necesidad concreta es este Inbox.
`docs/ARCHITECTURE.md` §11/§13 actualizados.

**Verificación:** 299/299 unit+integration, 38/38 E2E. Nuevos en
`tests/e2e/conversation-workspace.spec.ts`: filtrar (incluido escribir en
el buscador, que conserva el foco) y volver atrás sin ninguna navegación
de servidor; un fallo de red al abrir muestra "Reintentar" y, al
recuperarse, carga. Los tests existentes cuentan como petición de servidor
cualquier documento o RSC que no sea precarga de enlaces (la barra lateral
precarga `/inbox` por su cuenta).

**Supersede a:** en parte, "Panel de conversación en cliente, sin
navegación" (misma fecha).

---

## 2026-09-29 — Fix: el panel quedaba desplazado de lado al abrirse (`scrollIntoView`)

**Reportado por el usuario:** al abrir una conversación desde `/inbox`,
"algo extraño, como un re-render o un reload" justo al desplegarse el
panel; y al terminar, sin la línea vertical izquierda del panel y con unos
píxeles de la ficha asomando a la derecha — corregido solo al plegar y
desplegar la ficha.

**Diagnóstico** (muestreo por fotograma en Playwright): no había ni
re-render de la lista (mismo nodo) ni peticiones al servidor. En el
fotograma del clic, `scrollLeft` del `<aside>` saltaba a 17 px y la
**ventana entera** se desplazaba 1 px en horizontal durante un fotograma
(el "tirón"). Causa: al montarse, el hilo llevaba al último mensaje con
`scrollIntoView`, que desplaza **todos** los ancestros con overflow para
mostrar el elemento — incluido el `<aside>` (`overflow-hidden` sigue
siendo un contenedor desplazable) cuando aún medía 0 de ancho. Si el
panel no llegaba a ancho suficiente para "absorber" ese desplazamiento
(ficha plegada, o según el momento), se quedaba corrido: borde izquierdo
fuera, ficha asomando. Cambiar el ancho (plegar/desplegar) lo reajustaba.

**Decisión:** el hilo desplaza solo su propio contenedor
(`scrollTo` sobre el `SheetBody`), nunca `scrollIntoView`; y el panel usa
`overflow-clip`, que no es contenedor de desplazamiento y no puede
correrse por programa (defensa por si otro componente vuelve a hacerlo).

**Verificación:** el test de transición de
`tests/e2e/conversation-workspace.spec.ts` comprueba ahora, en cada
fotograma y con la ficha visible y plegada, que ni el panel ni la página
se desplazan de lado; confirmado con `git stash` que falla sin el arreglo.
299/299 unit+integration, 38/38 E2E.

---

## 2026-09-29 — UI-10b: `Membership`, alta/edición/baja manual

**Contexto:** siguiente paquete de la fase UI-10
(`docs/ui/CONVERSATION_WORKSPACE.md` §5.1), ya planificado el 2026-09-28:
afiliación con alta manual, tres estados visibles (activa y al corriente /
activa con cuota pendiente / baja) donde "cuota pendiente" se deriva, no
se guarda como tercer valor, y edición restringida a quien ya ve la ficha
del Contact (PKG-014).

**Decisión:**

1. **`memberships`** (`src/modules/memberships/schema.ts`): una fila por
   período continuo de afiliación, nunca columnas sueltas en `contacts` —
   mismo razonamiento y misma forma que `contact_assignments` (PKG-014):
   dar de baja no borra ni muta a otra cosa, cierra la fila (`endedAt` +
   `status = INACTIVE`); "volver a afiliarse" inserta una fila nueva, así
   que el histórico de períodos (y el "desde cuándo"/"afiliado del X al
   Y" tras una baja) es la tabla misma. Índice único parcial
   `memberships_active_unique` sobre `ended_at is null` — idéntica
   expresión a `contact_assignments_active_unique` — garantiza como
   mucho un período abierto por Contact. `status` (`ACTIVE`/`INACTIVE`,
   enum real de Postgres) es redundante con `ended_at IS NULL` a
   propósito: se escriben siempre juntos en `memberships/service.ts`,
   nunca por separado, y evita que cada lectura tenga que re-derivarlo.
2. **"Cuota pendiente" se deriva** (`memberships/domain.ts::isFeeOverdue`,
   pura, sin DB — mismo patrón que `messaging/domain.ts`): `ACTIVE` y
   `feePaidUntil` anterior al mes en curso. Nunca `true` en `INACTIVE` ni
   sin cuota registrada (nada de lo que estar "atrasado" hasta que se
   registra una vez). `firstUnpaidMonth` da el mes exacto para el aviso
   ("cuota de septiembre pendiente").
3. **Quién puede editar = quién puede ver el Contact**
   (`memberships/actions.ts::requireEditableContact`, vía
   `getContactForMember`/`contactVisibilityCondition`): reutiliza el
   mismo predicado que ya decide si la ficha del panel es visible, en vez
   de mantener una segunda regla de permisos en paralelo. Llegar a
   `/contacts/[id]` (que ya devuelve 404 si el Contact no es visible) es
   entonces equivalente a poder editar su `Membership` — sin un flag
   `canEdit` que sincronizar a mano.
4. **Un único formulario siempre visible** en `/contacts/[id]`
   (`membership-section.tsx`), sin modo vista/edición separado — mismo
   patrón que la tarjeta "Editar" de esa misma página. Alta y "volver a
   afiliarse" comparten la misma Server Action
   (`createMembershipAction`): el dominio los trata como la misma
   operación (insertar una fila ACTIVE cuando no hay ninguna abierta), y
   solo cambia la etiqueta del botón. La ficha del panel de conversación
   (`contact-ficha.tsx`) sigue siendo de solo lectura — reutiliza el
   mismo componente de presentación (`membership-status.tsx`), sin
   formulario propio, tal como se decidió el 2026-09-28 para toda la
   ficha en esta fase.

**Bug real encontrado y corregido antes de cerrar** (no anticipado): el
formulario de alta solo pide una **fecha** (`<input type="date">`, sin
hora) para `startedAt`. Dar de baja y "volver a afiliarse" el mismo día
produce dos filas con `started_at` **idéntico** — un caso de uso
perfectamente normal, no un borde raro. `getCurrentMembership` ordenaba
solo por `ORDER BY started_at DESC LIMIT 1`, sin desempate determinista
entre esas dos filas; Postgres podía devolver la fila **cerrada** como
"actual", y así lo hizo de forma reproducible en el E2E (verificado
también con un `page.reload()`, para descartar que fuera una fila de
caché del cliente: el dato mal leído venía del servidor). Corregido
ordenando primero por si la fila está abierta
(`(ended_at is null) desc`) antes que por `started_at`, con `created_at`
como último desempate. `listMembershipHistory` recibió el mismo
desempate por consistencia. Test de regresión en
`tests/integration/memberships.test.ts` que fija un `started_at`
idéntico explícito (no el de `defaultNow()`, que casi nunca empata) para
las dos filas y comprueba que se devuelve la abierta.

**Alternativas consideradas:** guardar `status` solo como columna
derivada (sin persistir) — descartado porque el encargo original lista
`status` como campo explícito y una columna consultable es más simple
que recalcular `ended_at IS NULL` en cada lectura; un `canEdit` calculado
aparte de la visibilidad — descartado por el riesgo de que las dos reglas
diverjan con el tiempo.

**Verificación:** 319/319 unit+integration (10 tests nuevos en
`tests/integration/memberships.test.ts`, 7 en
`tests/unit/memberships-domain.test.ts`), 39/39 E2E (`membership.spec.ts`
nuevo: alta con cuota atrasada → aviso ámbar, baja → aviso de
oportunidad, volver a afiliarse en el mismo día → estado activo, el caso
exacto que reprodujo el bug de arriba).

---

<!--
Plantilla para nuevas entradas:

## YYYY-MM-DD — Título corto de la decisión

**Contexto:** por qué hizo falta decidir esto.
**Decisión:** qué se decidió.
**Alternativas consideradas:** qué otras opciones había y por qué no.
**Por qué:** justificación.
**Supersede a:** (si aplica) enlace a la entrada anterior que queda obsoleta.
-->

## 2026-09-29 — UI-8 (Fase 8), primer tramo: tema oscuro

**Contexto:** con `UI-10b` cerrado, el resto de `UI-10` (c/d/e) sigue
bloqueado por Fase 7/8 de producto (knowledge base y AI, que no existen
todavía) y `UI-10f` espera validación visual del usuario — el único
paquete de UI realmente desbloqueado es `UI-8` (`docs/ui/ROADMAP.md`
"Fase 8"), aprobado el 2026-09-26. Es una fase con tres piezas
independientes (tema oscuro, axe-core automático, recorrido manual); esta
entrada cubre solo la primera.

**Decisión — arquitectura:** la capa de tokens de tres niveles
(`docs/ui/TOKENS.md`) hace que el tema oscuro sea *solo* un cambio de
`tokens.css`, cero cambios de componentes (ninguno referencia un color
directamente). Dos bloques nuevos redefinen exactamente los mismos
nombres semánticos que el `:root` claro:
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }`
para "Sistema" (con el guard para que una elección explícita "Claro"
siempre gane sobre el SO) y `:root[data-theme="dark"] {…}` para una
elección explícita "Oscuro". "Sistema" no necesita valor de cookie ni
bloque propio: es la ausencia del atributo `data-theme`.

**Decisión — paleta:** los acentos claros (verde/rojo/ámbar/azul) no
alcanzan 4.5:1 como texto sobre un fondo casi negro, así que el tema
oscuro añade 5 primitivas "-night" (`--palette-green-night` etc., más su
variante `-hover`/`-soft`/`-border`) — mismos matices de marca, ajustados
para superficie oscura. Todo lo demás (fondos, texto, bordes) reutiliza
`--palette-ink-*` invertido, sin primitivas nuevas. Las 30 parejas de
`tests/unit/ui-tokens.test.ts` se verificaron a mano con la misma fórmula
de contraste antes de escribir el CSS (un fork hizo el diseño inicial y
el cálculo; se re-verificó independientemente con un script Node
reproduciendo `luminance`/`contrast` línea a línea, hallazgo trivial en
el propio script de verificación — un desfase de índices en el slice del
hex sin `#` — no en la paleta). Margen más ajustado:
`primary-soft-foreground/primary-soft` y
`destructive-soft-foreground/destructive-soft`, ambos ~4.9:1. Nota de
diseño: el verde suficientemente brillante para ser texto legible sobre
`background` no admite texto blanco encima a la vez (matemáticamente
incompatible con un único tono) — los sólidos (`primary`/`destructive`)
llevan texto oscuro (`ink-950`) en el tema oscuro, no blanco: "el acento
brilla sobre la tinta", coherente con la identidad "ink on paper" del
producto, no una inversión genérica de colores.

**Decisión — cookie y SSR sin parpadeo:** `kindly_theme`
(`src/components/shell/theme-cookie.ts` server-only +
`theme-preference.ts` cliente, mismo patrón exacto que
`sidebar-cookie.ts`/`ficha-cookie.ts`+`ficha-preference.ts`: la constante
del nombre de cookie vive en el archivo *sin* `"server-only"`, y el
archivo server-only la importa de ahí — nunca al revés, para que un
import de tipo/constante no arrastre `"server-only"` a un bundle de
cliente). Escritura de cookie sin Server Action (evita re-renderizar toda
la página en cada cambio de tema, igual que `ficha-preference.ts`):
`document.documentElement.setAttribute`/`removeAttribute` aplica el
cambio al instante, `document.cookie` solo deja lista la *siguiente*
carga completa.

**Pregunta al usuario y decisión — coste de render dinámico:**
`src/app/layout.tsx` es el único sitio donde se puede fijar
`<html data-theme>` (una capa anidada no puede re-declarar `<html>`/
`<body>` en el App Router), y es compartido por el sitio público y la
app. Leer `cookies()` ahí para evitar el parpadeo fuerza **todas** las
rutas a render dinámico — confirmado con un build limpio: las 8 rutas
que eran estáticas (`/`, `/login`, `/forgot-password`,
`/reset-password`, `/privacidad`, `/terminos`, `/aviso-legal`,
`/eliminacion-de-datos`, deliberadamente estáticas desde PKG-010) pasan
a `ƒ` (dinámica) junto con las 25 que ya lo eran. Se preguntó
explícitamente al usuario entre aceptar este coste (un solo mecanismo,
más simple) o mantener estático el sitio público (el selector solo vive
en la app autenticada, que ya era 100% dinámica; el público seguiría
solo el tema del sistema operativo vía CSS puro, sin cookie ni
override) — **eligió aceptar el coste**. Sin ese cambio no hay forma de
"pintar en servidor sin parpadeo" en el App Router; la alternativa
(script bloqueante en `<head>` que lee la cookie y fija el atributo
antes del primer pintado) evita el coste de render dinámico pero ya no
es estrictamente "servidor" y no se implementó.

**Piezas nuevas:** `DropdownMenuRadioGroup`/`DropdownMenuRadioItem` en
`dropdown-menu.tsx` (primera vez que se usa `RadioGroup` de Radix en el
repo — más honesto que tres `DropdownMenuItem` con un check a mano para
una elección exclusiva de 3 vías); selector en `UserMenu`, recibe el
valor inicial como prop desde `AppShell` → `AppHeader` (mismo
`Promise.all` que ya leía `getSidebarCollapsed`).

**Verificación:** 352/352 unit+integration (nuevo `describe("design
tokens: contrast (dark theme, UI-8)")` reutilizando el array `PAIRS`
existente contra un segundo mapa de tokens resuelto desde el bloque
`:root[data-theme="dark"]`), 40/40 E2E (nuevo test en `shell.spec.ts`:
selección instantánea sin recarga, `page.request.get()` confirma que el
HTML *servido por el servidor* ya trae el atributo antes de cualquier
hidratación, persiste tras `page.reload()`, "Sistema" quita el atributo
en vez de fijar un tercer valor), build limpio, captura visual real de
`/login`, `/inbox`, `/ui-kit` y `/contacts/[id]` (con los estados de
`Membership` de UI-10b) en modo oscuro y claro del sistema.

**Pendiente de esta fase (no de este tramo):** `@axe-core/playwright` en
los E2E principales, recorrido manual de teclado/lector de pantalla,
verificación responsive 320/768/1024/1440 — siguiente paso, aparte.

## 2026-09-30 — UI-8, segundo tramo: axe-core automático + recorrido manual (fase cerrada)

**Contexto:** con el tema oscuro cerrado, quedaban las otras dos piezas
de `UI-8` (`docs/ui/ROADMAP.md` "Fase 8"): auditoría automática con
axe-core en los E2E principales, y el recorrido manual (teclado, lector
de pantalla, 320/768/1024/1440 px) que `ACCESSIBILITY.md`/`RESPONSIVE.md`
piden por fase.

**Decisión — alcance del gate automático:** `expectNoSeriousAccessibilityViolations`
(`tests/e2e/axe-helpers.ts`) solo falla el test ante violaciones de
impacto `serious`/`critical`. `minor`/`moderate` quedan fuera del gate
automático a propósito — la propia documentación de axe-core avisa de más
falsos positivos en esos niveles, que necesitan criterio humano; ese
criterio es el recorrido manual, no un segundo gate automático. Nuevo
`tests/e2e/accessibility.spec.ts`: Inbox vacío, Inbox con conversaciones,
conversación abierta (chat + ficha de UI-10a/b + ticks de entrega tras
una respuesta), y `/organization` — las tres superficies que
`ROADMAP.md` nombra explícitamente — repetido en claro **y** oscuro (un
`test.describe` por tema con `test.use({ colorScheme })`), ya que ninguno
de los dos temas es más proclive que el otro a un fallo serio y repetir
el chequeo es barato.

**Dos bugs reales encontrados y corregidos, sin relación con el tema
oscuro** (preexistentes, solo visibles ahora por tener por fin un gate
automático — exactamente el propósito de esta pieza de la fase):

1. **Contraste del hint del compositor** (`conversation-thread.tsx`):
   "Intro para enviar · Mayús+Intro salto de línea" usaba
   `text-foreground-muted` — ese token está diseñado a propósito para
   quedar *por debajo* de AA (`tests/unit/ui-tokens.test.ts`: "keeps
   foreground-muted for disabled/decorative text only"), pero este texto
   es instructivo, no decorativo ni deshabilitado. Cambiado a
   `text-foreground-lighter` (AA), mismo token que ya usaba la línea de
   "Ventana de respuesta libre abierta hasta…" un poco más arriba en el
   mismo archivo.
2. **Estructura de lista del hilo de mensajes**: `<ul role="log">` con
   `<li>` dentro. Un rol ARIA explícito (`log`) sustituye el rol
   implícito del elemento (`list` para un `<ul>`), así que sus `<li>`
   quedaban sin un ancestro con rol de lista válido — axe lo marca dos
   veces (`listitem`, "serious": "List item parent element has a role
   that is not role=list"; y tras un primer intento de arreglo con
   `role="listitem"` explícito en cada `<li>`, `aria-required-parent`,
   "critical": ese rol explícito sí exige un ancestro con rol `list`,
   que seguía sin existir). Solución final: el `role="log"`/`aria-live`
   se mueve a un `<div>` que envuelve al `<ul>`; el `<ul>`/`<li>` interior
   se quedan sin rol explícito (implícito `list`/`listitem`, válido) y el
   `<ul>` lleva `className="contents"` para no añadir una caja extra al
   `flex` que ya aportaba el `<div>`. `page.getByRole("log", { name:
   "Mensajes" })`, usado en seis specs E2E existentes, sigue resolviendo
   igual: el rol `log` es válido en cualquier elemento, no solo en un
   `<ul>`.

**Decisión — recorrido manual sin lector de pantalla real:** este
entorno no tiene NVDA/VoiceOver disponibles. Se pilotó un recorrido
100% por teclado con Playwright (Tab al enlace "Saltar al contenido",
`Enter` mueve el foco a `#main`, fila de conversación enfocable y
activable con `Enter`, el foco nunca cae a `<body>` al abrir el panel,
`F6` recorre las tres zonas — lista → chat → ficha → lista — confirmado
con 4 pulsaciones consecutivas, `Esc` cierra y quita `?conversation=` de
la URL) y se inspeccionó el árbol de accesibilidad con
`page.locator("body").ariaSnapshot()` — exactamente los datos que
consume un lector de pantalla real (landmarks, roles, nombres
accesibles) — como sustituto razonado, no como equivalente completo a
probarlo con software real. Confirmó: landmarks correctos (`banner`,
`complementary`, `main`, región `live` de notificaciones), un único
`h1`, controles de formulario con nombre accesible real. Sin scroll
horizontal a 320 px ni con zoom 200% en `/inbox`; capturas reales a
320 px de `/inbox`, `/organization` y `/contacts/[id]` (con la sección
Afiliación de UI-10b) sin truncar ni desbordar.

**Verificación:** 42/42 E2E (2 nuevos en `accessibility.spec.ts`, claro y
oscuro), 352/352 unit+integration sin cambios (el fix de
`conversation-thread.tsx` no toca lógica de dominio), lint+typecheck
limpios, build limpio.

Con esto, `UI-8` (`docs/ui/ROADMAP.md` "Fase 8") queda completa.
Siguiente fase de UI sin empezar: `UI-9` — Consolidación.

---

## 2026-09-30 — UI-9 (Fase 9): reset de paleta/radios/sombras por defecto + exportador DTCG (fase cerrada, rediseño UI/UX completo)

**Contexto:** `UI-9` era la última fase pendiente del rediseño UI/UX
(`docs/ui/ROADMAP.md` "Fase 9"): retirar componentes obsoletos, cerrar el
agujero de que la app autenticada aún podía usar la paleta/radios/sombras
*por defecto* de Tailwind en vez de los tokens propios (el comentario en
`tokens.css` decía literalmente "Default radii/shadows stay defined until
legacy pages migrate (Phase 9)"), completar `TOKENISED_DIRECTORIES`, y
construir el exportador de tokens a DTCG que `docs/ui/TOKENS.md` §3 daba
por pendiente desde `UI-1`.

**Investigación previa a tocar código (con un agente Explore que compiló
Tailwind v4 de verdad contra el repo, no solo grep):** ningún archivo de
componente obsoleto o sin referencias en todo `src/components`/`src/app`
— los candidatos que `docs/ui/AUDIT.md` (Fase 0) señalaba
(`auto-refresh.tsx`, `sign-out-button.tsx`) ya no existían, retirados en
fases anteriores sin que quedara anotado aquí. `TOKENISED_DIRECTORIES`
(`tests/unit/ui-tokens.test.ts`) ya cubría de hecho toda la app
autenticada salvo `(public)` — nada que tocar. `docs/ui/COMPONENTS.md`
tenía dos filas desactualizadas por fases posteriores a cuando se
escribieron: `ContextNav` ("no tiene consumidor", falso desde que UI-7 le
dio uno vía `OrganizationContextNav`) y `AppHeader` ("miga de
organización aún no interactiva", falso desde que UI-7 la convirtió en
`OrgMenu`) — corregidas.

**Decisión — el reset de `--color-*`/`--radius-*`/`--shadow-*: initial`
en `tokens.css` es seguro para toda la app salvo `src/app/(public)`:**
esa carpeta no está tokenizada a propósito (`ROADMAP.md`: "sin cambios
visuales ahí") y usaba directamente `bg-white`/`text-white` (10 sitios,
`layout.tsx` + `page.tsx`) y `rounded-2xl` (2 sitios) del *default* de
Tailwind — sin sombras por defecto en ningún sitio del repo. Dos opciones
sobre la mesa: (a) migrar esos ~12 sitios a tokens propios, o (b) añadir
supervivientes explícitos, idénticos en valor, junto al reset. Se eligió
(b): `--color-white: var(--palette-white)` y `--radius-2xl: 1rem`. Migrar
a (a) habría sido un cambio real, no cosmético: `--paper` en claro es
`--palette-ink-50` (`#f5f7f9`), no blanco puro, así que `bg-paper` en vez
de `bg-white` habría cambiado el tono; y como el sitio público **sí** es
sensible al tema desde `UI-8` (la cookie `kindly_theme` se lee en el
layout raíz, compartido), esos elementos habrían pasado a oscurecerse con
el tema oscuro cuando nunca lo hicieron — exactamente el tipo de cambio
de comportamiento que "consolidación" no pedía. Verificado comparando el
CSS generado por Tailwind antes/después del cambio (`rounded-2xl`,
`bg-white`, `text-white` y su variante `/70` resuelven byte a byte igual)
y con captura visual real del sitio público en claro y oscuro.

**Decisión — exportador de tokens a DTCG (`scripts/export-tokens.ts` +
`scripts/lib/tokens-dtcg.ts`, `npm run tokens:export`):** parsea
`tokens.css` con el mismo patrón ya probado en
`tests/unit/ui-tokens.test.ts::resolveDarkTokens` (los bloques `:root {
}`/`:root[data-theme="dark"] { }` son declaraciones planas sin llaves
anidadas, así que un `[^}]*` no codicioso es seguro), extendido para
resolver también `rgb(var(--palette-shadow) / alpha)` (sombras y
`--overlay`) y sombras multi-capa con paréntesis anidados (`rgb(var(...))`
dentro de `rgb(...)`, que rompía un regex ingenuo de "hasta el primer
`)`" — resuelto con un escáner de profundidad de paréntesis en vez de una
regex). Salida: `tokens/dtcg/{primitives,semantic.light,semantic.dark,
$themes}.json`, el flujo multi-set de Tokens Studio que `TOKENS.md` §3 ya
anticipaba (dos colecciones, Primitives de un modo y Semantic con modos
claro/oscuro). Los nombres de token con guiones se anidan en una ruta
(`foreground-light` → `color.foreground.light`), tal como ya documentaba
`TOKENS.md` §3 (`color/foreground/light`); cuando un nombre es a la vez
hoja y prefijo de grupo (`--border` vs. `--border-strong`/`-control`), la
hoja pasa a `DEFAULT` — convención estándar de Style Dictionary/Tailwind
para esa colisión exacta. Solo color/radio/sombra se exportan: tipografía,
dimensiones de componente y z-index no los pide `TOKENS.md` §3 y siguen
sincronizándose a mano. El JSON se commitea (no es un artefacto de build
efímero): es lo que se importa a mano en Figma hasta que exista una
sincronización automática, y `tests/unit/export-tokens.test.ts` (13 tests)
lo cubre contra los valores reales de `tokens.css` para que un cambio de
paleta que rompa el exportador falle ahí, no en un JSON corrupto que
alguien importa sin darse cuenta.

**Hallazgo de proceso, real pero no del producto — anotado en memoria del
agente:** `lsof -ti:3000 | xargs -r kill -9` no liberó de verdad el puerto
varias veces seguidas en este entorno (sin error, `lsof` posterior lo
reportaba libre), dejando un `next-server` viejo (sin
`DISABLE_AUTH_RATE_LIMIT`/`E2E_FAKE_MESSAGING_CHANNEL`) sirviendo tráfico
por detrás. `playwright.config.ts` lo reutilizó (`reuseExistingServer`),
produciendo primero 26 E2E en rojo que parecían un regresión real de este
cambio, y después — al intentar aislar el problema a mano — un falso
"la variable `DISABLE_AUTH_RATE_LIMIT` no funciona" que llevó a leer el
código fuente de `better-auth` (que resultó correcto). `ss -ltnp`/`fuser`
sí detectaron el proceso vivo que `lsof` no. Con el puerto realmente
libre, la suite corre 42/42 en verde de forma reproducible. Sin relación
con `UI-9` ni con ningún paquete anterior — puramente un problema de
gestión de procesos de esta sesión.

**Verificación:** lint+typecheck+365/365 unit-integration (352 previos +
13 nuevos de `export-tokens.test.ts`)+42/42 E2E+build limpio; CSS generado
comparado antes/después para los 12 sitios de `(public)` en riesgo.

Con esto, `UI-9` (`docs/ui/ROADMAP.md` "Fase 9") queda completa y el
rediseño UI/UX completo (`UI-0`…`UI-9`) queda cerrado.

## 2026-09-30 — Fase 6: máquina de estados de Case, asignación restringida a DELEGATE, vínculo Conversation↔Case en UI

El usuario eligió `Fase 6` (`project/TASKS.md`) entre las opciones
ofrecidas al cerrar `UI-9` (`Fase 6`, `Fase 7`, o cualquier otro
pendiente). Tres decisiones de producto, todas confirmadas explícitamente
por el usuario antes de escribir código:

**1. Máquina de estados con reapertura, sustituye "sin restricciones de
transición" (PKG-002, más arriba en este documento).** El encargo original
solo listaba los cinco estados sin especificar transiciones; PKG-002
decidió no restringir nada a falta de una decisión de producto explícita.
Esa decisión ahora se supersede — no se borra, PKG-002 seguía siendo
correcta con la información disponible entonces. Regla elegida:
`OPEN → IN_PROGRESS → WAITING → RESOLVED → CLOSED` hacia adelante,
`WAITING → IN_PROGRESS` hacia atrás, `RESOLVED → IN_PROGRESS` reabre un
caso resuelto, `CLOSED` es terminal (ninguna transición de salida, ni
siquiera para un ADMIN). Implementado como tabla pura
(`src/modules/cases/domain.ts::CASE_STATUS_TRANSITIONS`/
`isValidCaseStatusTransition`, sin DB, mismo patrón que
`memberships/domain.ts`), validada en `cases/service.ts::updateCase` antes
de escribir, con el `<select>` de `/cases/[id]` limitado a las opciones
válidas desde el estado actual — el guardarraíl es visible, no solo del
lado servidor.

**2. `Case.assignedTo` restringido a `DELEGATE`, antes cualquier miembro.**
El nombre de la tarea en `project/TASKS.md` ("Asignación de Case a
DELEGATE") es más explícito que el dominio original: un ADMIN administra
la organización, no lleva un caso. Mismo reparto que el "delegado de
referencia" de un Contact (PKG-014). Nueva
`isOrganizationDelegate` (`organizations/service.ts`, mismo shape que
`isOrganizationMember`) usada por `createCase`/`updateCase`; los
`<select>` de "Asignar a" (`/cases`, `/cases/[id]`) solo listan miembros
con rol `DELEGATE`.

**3. Vínculo `Conversation ↔ Case` (`conversation_cases`, PKG-003) gana UI
en los dos sitios que el usuario pidió**, no solo uno: la página del Case
(control completo — vincular una conversación existente del mismo
Contact, quitar un vínculo) y una acción rápida desde la ficha del
afiliado en el Inbox (UI-10a, sección "Casos abiertos" — vincular la
conversación que se está viendo a uno de los casos del Contact sin salir
del Inbox). `linkConversationToCase` (`conversations/service.ts`, existía
desde PKG-003 sin ningún llamador) gana una validación que nunca tuvo: la
Conversation y el Case deben compartir Contact, no solo organización — un
Case es siempre de un único Contact (`cases.contactId NOT NULL`) y
vincular la conversación de otro Contact no tenía sentido de producto ni
nada lo impedía hasta ahora. Sin `ConfirmDialog` al quitar un vínculo: a
diferencia de dar de baja una Membership (UI-10b), retirar una fila de una
tabla N:M es trivialmente reversible y no borra nada del Contact ni de la
Conversation. Dos tipos de actividad nuevos,
`CASE_CONVERSATION_LINKED`/`CASE_CONVERSATION_UNLINKED` (entidad `case`,
`audit/service.ts`).

**Verificación:** lint+typecheck+398/398 unit-integration (365 previos +
33 nuevos: `cases-domain.test.ts` — 22, transiciones puras; ampliaciones de
`crm.test.ts` — 5, ciclo de vida/asignación; `cases-conversations.test.ts`
nuevo — 6, el vínculo)+45/45 E2E (42 previos + `cases.spec.ts` nuevo, 3
tests: ciclo de vida completo por UI verificando las opciones ofrecidas en
cada paso, asignación limitada a DELEGATE, vincular/quitar una conversación
desde la página del Case)+build limpio.

## 2026-09-30 — Fase 7a: capa de datos del backbone RAG (documentos versionados, chunks, pgvector, `EmbeddingProvider`)

**Contexto:** cerrada la Fase 6 y el rediseño UI/UX completo, el usuario
eligió arrancar la **Fase 7 — Knowledge** y, dentro de ella, empezar por el
**backbone RAG** (no por los Trámites). Fase 7 es demasiado grande para una
sesión (10 entregables en `project/TASKS.md`), así que se parte en
sub-paquetes: **7a** (esta entrada) la capa de datos; 7b la ingesta
(PDF/web → chunks) + pipeline de embeddings; 7c la recuperación híbrida con
hard filters y citas; 7d los Trámites (`Procedure`, desbloquea `UI-10c`);
7e la UI de Knowledge. Este paquete es solo backend/dominio, sin UI.

**Decisiones no triviales:**

1. **Separación estricta GLOBAL vs ORGANIZATION garantizada por un CHECK,
   no solo por convención** (`CLAUDE.md` §2, `PRODUCT.md` §11). En
   `knowledge_documents`, `organization_id IS NULL` ⟺ `visibility =
   'GLOBAL'` mediante el CHECK `knowledge_documents_global_null_org`, además
   de validarse en `service.ts::createDocument` (defensa en profundidad). El
   conocimiento público (leyes, guías oficiales) no pertenece a ninguna
   organización; el privado siempre a una. `knowledgeVisibilityCondition`
   (`visibility.ts`, calcado de `contacts/visibility.ts`) es el único
   predicado de lectura: GLOBAL + propia, nunca la privada de otra
   organización. Sin distinción ADMIN/DELEGATE — el conocimiento es por
   organización, no por afiliado.

2. **`organization_id` + `visibility` denormalizados en `knowledge_chunks`.**
   `DATABASE.md` §15 exige aplicar los hard filters de tenancy/visibilidad
   *antes* del ranking semántico. Duplicar esas dos columnas en la fila del
   chunk permite que la recuperación de 7c filtre tenancy sobre la propia
   fila **sin un join** al documento en la ruta caliente. Son inmutables
   tras la creación (un documento no cambia de organización ni de ámbito) y
   los escribe siempre junta `createDocumentVersion`, derivados del documento
   padre — nunca a mano por separado. El test de integración verifica que
   org A recupera su chunk y nunca el idéntico de org B.

3. **`EmbeddingProvider` con proveedor fake determinista, sin OpenAI todavía**
   (`ARCHITECTURE.md` §10, `CLAUDE.md` §2/§3). Interfaz + registro respaldado
   por `globalThis` (mismo patrón que `messaging/registry.ts` y
   `db/client.ts`, por el aislamiento de módulos de Turbopack en producción);
   a diferencia de mensajería hay un único proveedor activo, no un mapa
   por-canal. El fake (`testing/fake-embedding-provider.ts`) es una bolsa de
   palabras hasheada a 1536 dims y normalizada: texto idéntico → vector
   idéntico (coseno 1.0, permite tests de round-trip), palabras compartidas →
   más similitud. En producción `getEmbeddingProvider()` lanza hasta que se
   cablee el proveedor real (7b+) — coherente con no construir alrededor de
   una API externa sin confirmarla.

4. **Dimensión fija 1536** = objetivo del proveedor real inicial (OpenAI
   `text-embedding-3-small`), en `EMBEDDING_DIMENSIONS` (`schema.ts`). Así
   cambiar a OpenAI más tarde es registrar otro proveedor, **sin migración**,
   mientras la dimensión coincida.

5. **`CREATE EXTENSION IF NOT EXISTS vector` añadido a mano** al inicio de la
   migración `0009` (drizzle-kit no la emite), mismo patrón de SQL manual que
   `0004`/`0007`. La imagen Docker ya era `pgvector/pgvector:pg16` desde
   PKG-001 (lo dejó preparado a propósito) y Neon trae pgvector, así que la
   extensión está disponible en todos los entornos. `tsvector` se declara con
   `customType` (drizzle 0.45 no tiene tipo nativo) para que drizzle-kit lo
   rastree y la columna generada `content_tsv` no cuente como drift.

6. **FTS en `'spanish'` + índice HNSW coseno**, ambos en `knowledge_chunks`
   para la búsqueda híbrida de 7c: columna generada `content_tsv =
   to_tsvector('spanish', content)` con índice GIN (el conocimiento normativo
   del producto es en español) y `hnsw (embedding vector_cosine_ops)`.
   `document_versions` lleva un índice único parcial `WHERE status='CURRENT'`
   (como mucho una versión vigente por documento; una nueva CURRENT supersede
   la anterior, patrón "cerrar la fila abierta" de `memberships`).

7. **Version-aware retrieval como función pura** (`domain.ts::
   selectApplicableVersion`, `DATABASE.md` §15): elige la versión cuyo
   `[effective_from, effective_until]` cubre una fecha relevante, excluyendo
   `DRAFT`/`REPEALED` pero conservando `SUPERSEDED`/`HISTORICAL` (una norma ya
   no vigente es justo lo aplicable a un caso pasado). Sin DB, muy testeada;
   7c y la Fase 8 la reutilizan.

**Fuera de alcance de 7a (anotado, no hecho):** ingesta/parseo de PDF/web
(7b), ranking de recuperación y hard filters de vigencia/jurisdicción en la
query (7c), Trámites (7d), UI y visor de citas (7e), auditoría específica de
knowledge (con la UI). Los chunks se embeben inline en la escritura; 7b
sustituye "lista de chunks dada a mano" por "parsear PDF/URL → chunks"
reutilizando la misma llamada al proveedor, movida a un `after()` (decisión
previa de no meter worker aún).

**Verificación:** lint+typecheck+420/420 unit-integration (398 previos + 22
nuevos: `knowledge-domain.test.ts` — 7, version-aware puro;
`knowledge-embedding.test.ts` — 6, el fake; `knowledge.test.ts` — 9,
invariante GLOBAL⟺org a nivel de código y de CHECK, aislamiento multi-tenant
de documentos y de chunks, superseder de CURRENT, round-trip del embedding y
recuperación por coseno con hard filter de tenancy)+build limpio. Migración
`0009` aplicada en local; **pendiente aplicarla a mano contra
staging/producción** (`npm run db:migrate`, este repo no migra en el deploy).

## 2026-09-30 — Fase 7b: ingesta (PDF/web → chunks jerárquicos) + pipeline de embeddings

**Contexto:** cerrada la Fase 7a (capa de datos del backbone RAG), el
usuario eligió continuar con **7b** — el hueco que 7a dejó anotado:
`createDocumentVersion` ya sabe insertar chunks embebidos, pero esperaba la
lista hecha a mano. 7b añade la extracción (PDF/web/texto → texto plano), el
chunker jerárquico y un proveedor real de embeddings, sin tocar el dominio
de 7a. Sigue sin haber UI (7e).

**Decisiones tomadas con el usuario (`AskUserQuestion`):**

1. **`unpdf` para PDF** (wrapper de pdf.js, sin binarios nativos, pensado
   para serverless) en vez de `pdf-parse` o aplazar el PDF. Cero dependencias
   transitivas nuevas; exige Node ≥22 (ya lo usa el repo).
2. **OpenAI cableado ya**, no solo el fake. `OpenAIEmbeddingProvider`
   (`knowledge/openai-embedding-provider.ts`) registrado desde
   `src/instrumentation.ts` solo si `OPENAI_API_KEY` está presente — ausente
   en todos los entornos salvo que se configure, igual que hoy
   (`getEmbeddingProvider()` sigue lanzando, **nunca** cae en silencio al
   fake, que sería semánticamente falso para conocimiento real — `CLAUDE.md`
   §3). `fetch` crudo, sin el SDK de OpenAI, mismo patrón que
   `ResendEmailSender` (`email/resend.ts`): una sola llamada no justifica una
   dependencia, error mapeado solo al mensaje de OpenAI (nunca la request,
   que lleva la clave — `CLAUDE.md` §5).
3. **Disparo por script de operador** (`npm run knowledge:ingest`), no por
   UI ni ruta HTTP — no hay UI de Knowledge hasta 7e. `ingestDocumentVersion`
   (`knowledge/ingestion/pipeline.ts`) es la única función que el script usa
   y que 7e reutilizará; ya queda en forma de envolver con `after()` sin
   reescritura cuando haga falta (decisión previa de no meter worker
   todavía, `ARCHITECTURE.md` §8).

**Hallazgo de diseño, reutilizable para futuros scripts:** `knowledge/
service.ts`, `embedding-provider.ts` y `openai-embedding-provider.ts`
empiezan con `import "server-only"`, que **lanza siempre** en un proceso
Node/tsx normal — confirmado en vivo (`node script.mjs` lanza, `node
--conditions=react-server script.mjs` no, porque `server-only`'s
`package.json` resuelve a un no-op bajo esa condición de `exports`).
`scripts/reset-password.ts` evitaba el problema hablando SQL crudo
directamente, aceptable para una sola `UPDATE`; aquí habría significado
duplicar el invariante GLOBAL/ORG, el superseder de `CURRENT` y la
denormalización de tenancy de 7a, con riesgo real de desincronización. En
vez de eso, `package.json` invoca el script con `NODE_OPTIONS=
--conditions=react-server`, que `tsx` respeta igual que `node` — los alias
`@/*` de `tsconfig.json` se resuelven igual bajo esa condición. El script
reutiliza `createDocument`/`createDocumentVersion`/`ingestDocumentVersion`
sin tocarlos ni un carácter. El mismo `NODE_OPTIONS` sirve para cualquier
script futuro que necesite importar un módulo `server-only`.

**Segundo hallazgo, de proceso:** el script colgaba varios minutos tras
terminar su trabajo (documento y versión creados correctamente, pero el
proceso nunca salía). Causa: el pool de PostgreSQL de `db/client.ts` está
cacheado en `globalThis` (compartido con toda la app, PKG-004) y ningún
script lo cierra — a diferencia de `reset-password.ts`, que abre su propia
conexión y la cierra en un `finally`, este script reutiliza el pool
compartido, que no es suyo para cerrar. Arreglado saliendo explícitamente
con `process.exit(0)`/`process.exit(1)` al terminar, en vez de dejar que el
runtime intente drenar un event loop que nunca se vacía solo.

4. **Heurística de chunking, mejor esfuerzo documentado como tal**
   (`ingestion/chunking.ts`, función pura): reconoce `TÍTULO`/`CAPÍTULO`
   (nivel `CHAPTER`), `SECCIÓN` (`SECTION`) y `ARTÍCULO` (`ARTICLE`) al
   inicio de línea, manteniendo un breadcrumb de contexto para `path`. Cada
   fila de `knowledge_chunks` es el contenido de **una unidad concreta**, no
   "una fila por nivel" (el esquema no tiene aristas padre/hijo entre
   chunks): una unidad que cabe en un chunk conserva su propio nivel; una
   demasiado larga se divide por párrafo (`PARAGRAPH`); un párrafo todavía
   demasiado largo, o cualquier texto sin estructura reconocible (una web
   genérica, un manual interno), cae a fragmentos de tamaño fijo
   (`FRAGMENT`). El texto que sigue a una cabecera en la misma línea se trata
   siempre como cuerpo, nunca como parte del `label` — la extracción de PDF
   suele colapsar un artículo entero en una sola línea, así que "lo que
   sigue al número" es a menudo prosa, no un título. Límite conocido: el
   orden de extracción de texto de un PDF con columnas/cabeceras puede
   desordenar las líneas; aceptado como limitación de "cuando sea posible"
   (`DATABASE.md` §14), no un parser legal completo.
5. **Extracción de web sin librería de parseo HTML** (`ingestion/
   extract-web.ts`): un stripper por regex (etiquetas de bloque → salto de
   línea, el resto fuera, entidades decodificadas) en vez de cheerio/jsdom
   en producción (`CLAUDE.md` §2) — suficiente para páginas oficiales
   estáticas. Rechaza esquemas que no sean `http(s)` y limita el tamaño de
   la respuesta (10 MiB) antes de procesarla.
6. **`--provider fake` como escape explícito**, nunca por defecto
   (`scripts/lib/knowledge-ingest-args.ts`): el operador tiene que pedirlo a
   propósito para ingerir con el fake determinista (dev/testing), con un
   aviso en consola de que el resultado es semánticamente inútil — igual
   que el resto de fakes del repo, nunca una sustitución silenciosa.

**Verificación:** lint+typecheck+471/471 unit-integration (420 previos + 51
nuevos: `knowledge-chunking.test.ts` — 11, chunker puro;
`knowledge-extract-web.test.ts` — 11, `htmlToText` puro + `fetchWebText` con
`fetchImpl` de prueba; `knowledge-openai-provider.test.ts` — 6, `fetch`
mockeado; `knowledge-ingest-args.test.ts` — 18, parseo/validación de flags;
`knowledge-ingestion.test.ts` — 5, pipeline completo PDF/WEB/TEXT contra
PostgreSQL real con el fake registrado, incluida una fixture PDF mínima
válida en `tests/fixtures/knowledge/sample.pdf`)+build limpio. Sin E2E
(sigue sin haber UI, mismo motivo que 7a). Smoke test manual del script con
`--provider fake` contra la base local (texto, PDF, y el camino de error de
flags faltantes) antes de cerrar la sesión; filas de prueba borradas después.

## 2026-09-30 — Fase 7c: recuperación híbrida (FTS + vector) con hard filters

**Contexto:** cerradas 7a (capa de datos) y 7b (ingesta), el usuario eligió
continuar con **7c** — la pieza que de verdad "busca": combinar full-text
search y similitud vectorial aplicando los hard filters de `DATABASE.md`
§15 antes del ranking. A diferencia de 7b no había decisiones de producto
abiertas (el stack — PostgreSQL FTS + pgvector, sin Elasticsearch/vector DB
externa — y los hard filters ya estaban fijados en `ARCHITECTURE.md` §9 y
`DATABASE.md` §15); las decisiones de esta entrada son de ingeniería.

**Decisiones no triviales:**

1. **Reciprocal Rank Fusion (RRF)** para combinar `ts_rank` (FTS) y
   similitud coseno (vector) — no son comparables en la misma escala, RRF
   evita inventar una normalización: cada lista aporta `1/(k+posición)`
   por elemento (k=60, el estándar de la literatura, el mismo que usa la
   guía de búsqueda híbrida de Supabase — la referencia de calidad de este
   proyecto). Implementado como función **pura**
   (`knowledge/retrieval-fusion.ts::combineRankedResults`), testeable sin
   DB.
2. **Dos queries de Drizzle + fusión en JS, no una CTE SQL a mano.** El
   repo no tenía precedente de `db.execute` con SQL crudo; el patrón
   existente (`conversations/service.ts::listConversationsWithPreview`) es
   query builder + fragmentos `sql\`...\`` puntuales. Una query ordenada por
   `ts_rank(content_tsv, websearch_to_tsquery('spanish', query))` y otra por
   `cosineDistance` (helper que `drizzle-orm` ya exporta, coincide con el
   índice HNSW `vector_cosine_ops` de 7a — confirmado
   `import { cosineDistance } from "drizzle-orm"`), cada una con los mismos
   hard filters, limit `max(4×limit, 20)` candidatos, fusionadas con RRF. Dos
   round-trips en vez de uno: aceptable a esta escala (`CLAUDE.md` §2) y
   mucho más simple/testable que una CTE con window functions.
3. **Hard filters, reutilizando 7a sin reinventar:** tenancy sigue siendo
   `knowledgeVisibilityCondition` sin cambios, aplicada sobre
   `knowledge_chunks` directamente (denormalizado, sin join — tal como 7a lo
   diseñó). Vigencia/`legal_status`: nueva condición SQL
   (`versionApplicabilityCondition`, `retrieval.ts`) que reproduce la regla
   de `domain.ts::selectApplicableVersion` a nivel de fila —
   `domain.ts` exporta ahora `APPLICABLE_STATUSES` (antes privado) para que
   la condición SQL no duplique la lista de estados aplicables a mano.
   Requiere join `knowledge_chunks → knowledge_document_versions →
   knowledge_documents` — a propósito: 7a solo denormalizó tenancy para
   evitar join en la ruta caliente, vigencia/jurisdicción siempre lo
   necesitaron. Jurisdicción/territorio/ámbito: filtro exacto
   case-insensitive solo cuando el llamador lo pasa (campos de texto libre,
   sin filtro si se omiten).
4. **Simplificación conocida y documentada:** a diferencia de
   `selectApplicableVersion` (que elige *una* versión por documento,
   desempatando por `effectiveFrom` más reciente si dos se solapasen para
   la misma fecha — dato mal formado), la condición SQL no hace ese
   desempate: aquí conviven muchos documentos a la vez, no la selección de
   una sola versión de un documento concreto. Con datos bien formados
   (como mucho una versión abierta por fecha) el resultado es idéntico.
5. **Sin relevancia mínima ("floor"):** la búsqueda vectorial siempre
   devuelve los `limit` vecinos más cercanos entre lo que pasa los hard
   filters, aunque ninguno sea realmente relevante — es el comportamiento
   esperado de k-NN, no un defecto. Fase 8 (AI Copilot) decidirá si un
   resultado de `score` bajo debe traducirse en `evidenceLevel: INSUFFICIENT`
   o en no citar nada; 7c no impone un umbral por su cuenta.
6. **`retrieveKnowledge` requiere `EmbeddingProvider` registrado**, igual
   que la ingesta de 7b — lanza si no hay ninguno, nunca cae en silencio a
   un modo "solo FTS" (`CLAUDE.md` §3).

**Fuera de alcance de 7c (anotado, no hecho):** construir
`AISuggestion`/`AISource` (Fase 8) — 7c solo expone `KnowledgeSearchResult`
con los metadatos que una cita necesita (documento, versión, nivel,
`label`/`path`, nota de fuente, URL de origen). Sin UI (7e).

**Verificación:** lint+typecheck+485/485 unit-integration (471 previos + 14
nuevos: `knowledge-retrieval-fusion.test.ts` — 8, RRF puro;
`knowledge-retrieval.test.ts` — 6, tenancy/vigencia/jurisdicción/forma del
resultado/límite contra PostgreSQL real con el fake registrado)+build
limpio. Sin E2E (sigue sin haber UI, mismo motivo que 7a/7b).

## 2026-09-30 — Fase 7e: UI de Knowledge (solo lectura + búsqueda con citas)

**Contexto:** el usuario eligió 7e (frente a 7d). Con 7a/7b/7c hay datos,
ingesta y recuperación reales que mostrar.

**Decisiones:**

1. **Alcance de solo lectura.** `/knowledge` (lista de documentos GLOBAL +
   propios, y búsqueda) y `/knowledge/[id]` (versiones con estado, vigencia,
   nota de fuente y fragmentos). **Sin subida/edición de documentos desde
   UI**: la ingesta sigue siendo script de operador; una UI de ingesta
   necesita decidir permisos (¿solo ADMIN?) y ejecución en segundo plano, y
   no estaba pedida.
2. **Citas siempre con procedencia.** `CitationCard` muestra fuente,
   versión, estado, vigencia y ubicación del fragmento (`CLAUDE.md` §2,
   principio 3). **`EvidenceLevel` no se muestra**: lo calcula el Copilot
   (Fase 8), no la recuperación; no se inventa aquí.
3. **Degradación explícita sin `EmbeddingProvider`** (dev/CI sin
   `OPENAI_API_KEY`): la búsqueda muestra "La búsqueda no está disponible",
   nunca un modo solo-FTS silencioso ni un "sin resultados" engañoso.
4. **Búsqueda por GET (`?q=`)**, renderizada en servidor: enlazable y sin JS.
5. Nuevo `listChunksForVersion` en `service.ts`, filtrado por visibilidad
   (columnas denormalizadas del chunk). Ítem "Conocimiento" en el sidebar.

**Verificación:** lint+typecheck+485/485 unit-integration+48/48 E2E (45
previos + `knowledge.spec.ts`, 3 tests: aislamiento de tenancy en lista y
404 en detalle ajeno, versiones/fragmentos, degradación de la búsqueda; con
axe sin violaciones serias)+build limpio. La búsqueda con resultados solo
se cubre en integración (7c): el E2E no tiene proveedor de embeddings.

## 2026-09-30 — Fase 7d: Trámites (`Procedure`) + permisos de gestión del conocimiento

**Contexto:** cerrada 7e, el usuario pidió continuar con Trámites y fijó que
**de momento solo un ADMIN puede subir/gestionar** conocimiento.

**Decisiones:**

1. **Solo ADMIN escribe; cualquier miembro lee.** Crear trámites y publicar
   versiones exige `requireOrganizationAdmin()`; un DELEGATE necesita leer la
   lista de documentos requeridos pero no ve controles de edición. Para la
   subida de documentos de Knowledge (ingesta desde UI, aún no construida)
   rige la misma regla: cuando se construya será ADMIN-only. Sin matriz de
   permisos (`CLAUDE.md` §8).
2. **Tablas propias, no chunks RAG.** `procedures` → `procedure_versions`
   (`version` entero 1,2,3…; estados `CURRENT`/`SUPERSEDED`, índice único
   parcial: una sola CURRENT) → `procedure_steps` y
   `procedure_required_documents` (filas, no JSON: UI-10c necesitará
   apuntar a cada documento requerido por id). Un trámite es estructura
   para checklist, no texto para recuperar con citas; privado por
   organización (sin GLOBAL), `organization_id` denormalizado en la versión.
3. **Sin DRAFT/REPEALED ni fechas de vigencia**: es la regla propia de la
   organización, no legislación; publicar = la nueva versión pasa a CURRENT
   y la anterior queda SUPERSEDED, intacta (lo ya tramitado bajo ella no se
   reescribe). Editar = publicar versión nueva copiando la vigente en el
   formulario. Número de versión calculado con `SELECT … FOR UPDATE` sobre
   el trámite para serializar publicaciones concurrentes.
4. **Fuera de alcance (es de UI-10c):** vincular trámite a Caso/conversación
   y guardar el estado `required/received` (canal y fecha) por documento;
   sigue sin guardarse ningún archivo.
5. UI: `/knowledge/procedures` (lista; "Nuevo trámite" solo ADMIN) y
   `/knowledge/procedures/[id]` (historial; "Publicar nueva versión" solo
   ADMIN). Pasos y documentos se introducen uno por línea
   (`domain.ts::parseLineList`). Actividades `PROCEDURE_CREATED` /
   `PROCEDURE_VERSION_PUBLISHED` (entidad `procedure`). Migración `0010`.

**Verificación:** lint+typecheck+492/492 unit-integration (485 previos + 3
unit de `parseLineList` + 4 integración: versión 1, supersesión con una sola
CURRENT, aislamiento entre organizaciones, listado)+49/49 E2E (48 previos +
`procedures.spec.ts`: ADMIN crea y publica v2, DELEGATE solo lee; axe sin
violaciones serias)+build limpio.

