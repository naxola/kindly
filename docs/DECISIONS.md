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

<!--
Plantilla para nuevas entradas:

## YYYY-MM-DD — Título corto de la decisión

**Contexto:** por qué hizo falta decidir esto.
**Decisión:** qué se decidió.
**Alternativas consideradas:** qué otras opciones había y por qué no.
**Por qué:** justificación.
**Supersede a:** (si aplica) enlace a la entrada anterior que queda obsoleta.
-->
