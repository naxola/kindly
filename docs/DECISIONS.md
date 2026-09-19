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

<!--
Plantilla para nuevas entradas:

## YYYY-MM-DD — Título corto de la decisión

**Contexto:** por qué hizo falta decidir esto.
**Decisión:** qué se decidió.
**Alternativas consideradas:** qué otras opciones había y por qué no.
**Por qué:** justificación.
**Supersede a:** (si aplica) enlace a la entrada anterior que queda obsoleta.
-->
