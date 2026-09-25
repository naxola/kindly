# CURRENT_TASK.md — Paquete activo

> Este es el archivo más importante para retomar el trabajo entre sesiones o
> con otro modelo. Se actualiza al terminar cada sesión, haya terminado o no
> el paquete.

## Paquete activo: PKG-011 — código completo (2026-09-25), falta la prueba manual

Último commit: `dd86b96`.

### PKG-011 — WhatsApp Cloud API contra el número de prueba de Meta

Hecho: `WhatsAppTestAdapter` (canal `whatsapp-test`), `GET` de verificación
del webhook, registro condicional en `src/instrumentation.ts`, tests unit e
integración. Decisiones en `docs/DECISIONS.md` (entrada del 2026-09-25).

Variables en Vercel (Preview / rama `staging`), ya cargadas por el usuario:
`WHATSAPP_TEST_ADAPTER_ENABLED`, `WHATSAPP_TEST_PHONE_NUMBER_ID`,
`WHATSAPP_TEST_WABA_ID`, `WHATSAPP_TEST_ACCESS_TOKEN`,
`WHATSAPP_TEST_APP_SECRET`, `WHATSAPP_TEST_VERIFY_TOKEN`.

**Falta (usuario, manual):**

1. Deploy de `staging` con este commit (y redeploy si las variables se
   cargaron después del último build: Vercel solo las lee al construir).
2. `/channels` → conectar `whatsapp-test` → copiar el `accountId`.
3. Meta → WhatsApp → Configuración: Callback URL
   `https://kindly-git-staging-naxolas-projects.vercel.app/api/webhooks/whatsapp-test/<accountId>`
   (la URL de la rama: `kindly-peach` es un alias del mismo deploy pero
   está tras Vercel Authentication, Meta no llegaría), el
   Verify Token, y suscribir el campo `messages`.
4. Móvil añadido como destinatario en "Probar la API" → escribir al número
   de prueba → debe aparecer en `/inbox` → responder → debe llegar al móvil.
5. Si todo va bien, marcar la última casilla de PKG-011 en `TASKS.md`.

Si un envío sale como `FAILED`, el motivo exacto de Meta está en los logs
de Vercel (`[whatsapp-test] send failed: …`).

### PKG-012 — Email (Resend) y recuperación de contraseña (cerrado 2026-09-25)

Hecho: `/forgot-password` → email con enlace → `/reset-password`, sobre el
flujo nativo de Better Auth, con Resend detrás de `EmailSender`. Decisiones
en `docs/DECISIONS.md` (entrada del 2026-09-25).

**Falta (usuario):** en Vercel (Preview, y Production cuando toque),
`RESEND_API_KEY` y `EMAIL_FROM`; comprobar que `BETTER_AUTH_URL` es la URL
pública de staging (el enlace del email se construye con ella). Hasta
verificar dominio en Resend, solo llega al email dueño de la cuenta de
Resend.

**Siguiente paso de código propuesto:** invitaciones por email (aditivo).

## Contexto previo: alta ante Meta (sigue vigente para PKG-009)

El producto tiene ya el mínimo para que el usuario haga sus propias pruebas.
Lo que queda para WhatsApp real **no es código**: es el alta de Kindly ante
Meta.

### Lo que tiene que hacer el usuario, en este orden

1. **Rellenar `src/config/company.ts`** con la razón social exacta, NIF,
   domicilio completo sin abreviaturas, datos registrales, teléfono y correos.
   Mientras quede algún `REVISAR:`, el sitio público muestra una banda roja.
   Meta compara estos datos carácter a carácter con la documentación.
2. **Revisión jurídica** de `/privacidad`, `/terminos`, `/aviso-legal` y
   `/eliminacion-de-datos`. Son un borrador sólido y anclado en lo que hace el
   producto, no un dictamen.
3. **Dominio y despliegue con HTTPS**, y un **correo en ese dominio** (Meta
   rechaza gmail.com y similares para la verificación de negocio). Fijar
   `NEXT_PUBLIC_SITE_URL`.
4. **Verificación de negocio en Meta** — 2-5 días laborables. Para
   coexistence debe ser Partner-Led o Meta Verified, no la clásica. Añadir
   `FACEBOOK_DOMAIN_VERIFICATION` con el token de la metaetiqueta.
5. **App + App Review** (~24 h). No hace falta el producto terminado: valen
   grabaciones del API Setup con cURL o del WhatsApp Manager.
6. Solo entonces `PKG-009` (Embedded Signup real), que además necesita cerrar
   **la decisión del Business Manager de la organización**, aplazada el
   2026-09-19.

### PKG-010 — Sitio público y documentos legales (cerrado 2026-09-20)

- `/` es ahora la landing pública; ya no redirige según haya sesión.
- `/privacidad`, `/terminos`, `/aviso-legal`, `/eliminacion-de-datos`, todas
  accesibles sin sesión y estáticas en el build.
- Identidad legal centralizada en `src/config/company.ts`, con banda de aviso
  mientras queden huecos.
- Diseño: el sans vende, el serif documenta. El héroe es una sugerencia del
  copiloto con evidencia **parcial** — el estado honesto vende mejor que el
  perfecto.

Decisiones completas en `docs/DECISIONS.md` (entrada del 2026-09-20).

### PKG-008 — Alta de WhatsApp: elección y comprobaciones previas (cerrado 2026-09-20)

El flujo que describió el usuario a partir de GoHighLevel, contra el stub.

- `/channels/connect/[channel]`: las tres vías excluyentes. Solo coexistence
  disponible; las otras dos deshabilitadas **con su motivo**.
- `/channels/connect/[channel]/coexistence`: los seis puntos a confirmar,
  aviso de redirección a Facebook y botón final. Revalidado en el servidor.
- Comprobación de país configurable vía `WHATSAPP_UNSUPPORTED_COUNTRY_CODES`,
  vacía por defecto.
- El onboarding lo declara el adapter, así que `PKG-009` reutilizará esta UI
  sin tocarla. En producción el flujo es hoy inalcanzable porque no hay
  adapter de WhatsApp — que es la verdad actual, no un hueco.
- **Aplazado a propósito:** `PENDING → CONNECTING → CONNECTED`. Con un stub
  síncrono no hay ningún instante en que esos estados sean ciertos.

Decisiones completas en `docs/DECISIONS.md` (entrada del 2026-09-20).

### PKG-007 — Ajustes del delegado y estado del canal (cerrado 2026-09-20)

`/channels` deja de ser una tabla de la organización y pasa a ser los ajustes
de canal del profesional.

- Un DELEGATE ve y gestiona solo sus propias `MessagingAccount`; un ADMIN ve
  además las del resto de la organización.
- **Retirado el formulario "canal + delegado"**: la conexión es siempre para
  uno mismo, porque ningún proveedor real permite otra cosa. El servicio lo
  rechaza, no solo la UI.
- Desconectar es asimétrico: un DELEGATE solo lo suyo, un ADMIN cualquiera de
  la organización (dar de baja a quien se va) — salvo en canales que declaran
  `canDisconnect: false`, donde no puede nadie desde Kindly.
- `describeAccountStatus` (puro, en `messaging/domain.ts`) traduce cada estado
  a tono / requiere atención / operativo, y la UI añade la explicación y
  muestra `lastError`, `lastSyncAt` y `connectedAt`.

Decisiones completas en `docs/DECISIONS.md` (entrada del 2026-09-20).

### PKG-006 — Miembros de la organización (cerrado 2026-09-20)

Desbloquea el escenario real del producto: hasta ahora toda organización
tenía un único miembro, siempre ADMIN, así que el rol DELEGATE no lo tenía
nadie y el selector de Delegate de `/channels` siempre ofrecía una sola
opción.

- Tabla `organization_invitations` con índice único **parcial** sobre
  `(organization_id, email) WHERE status = 'PENDING'` (migración
  `0006_organization_invitations.sql`).
- `/members`: miembros con su rol, invitaciones pendientes con su enlace, e
  invitar/revocar solo para ADMIN.
- `/invite/<token>` pública, que distingue los cinco estados de una
  invitación en vez de agruparlos en "enlace inválido".
- `ensureOrganizationForUser` como único punto de entrada, usado por el hook
  de registro de Better Auth y por la autorreparación de
  `getCurrentOrganizationMember`.
- `requireOrganizationAdmin` en las acciones, con la UI ocultando además el
  formulario a un DELEGATE.
- Activities nuevas con `entityType: "organization"`: `MEMBER_INVITED`,
  `MEMBER_JOINED`, `INVITATION_REVOKED`.

Límites conocidos, mostrados en la UI y no escondidos: una persona pertenece
a una sola organización, así que una invitación solo la puede aceptar un email
sin cuenta previa; y Kindly no envía emails, el ADMIN copia el enlace.

Decisiones completas en `docs/DECISIONS.md` (entrada del 2026-09-20).

---

## Registro: PKG-005 — WhatsApp coexistence (cerrado 2026-09-20)

### Progreso — todo hecho (2026-09-20)

- [x] **Eco de salientes.** `NormalizedOutboundEcho`,
      `messages.sent_from_device` (migración `0005_echo_sent_from_device.sql`),
      `insertEchoedMessage`, `sendOutboundMessage` con `onConflictDoUpdate`
      para ganar la carrera contra su propio eco, `MESSAGE_SENT_FROM_DEVICE`
      como Activity, marca "desde el móvil" en `/inbox/[id]`.
- [x] **Capacidades de canal.** `MessagingChannelCapabilities`
      (`serviceWindowHours`, `canDisconnect`) en `MessagingAdapter`, para que
      ni el dominio ni la UI pregunten por el nombre del proveedor.
- [x] **Importación de historial.** `HISTORY_MESSAGE`,
      `importHistoryMessage`, `markConversationReadUpTo` (nunca hacia atrás),
      sin Activity por mensaje.
- [x] **Desconexión iniciada desde fuera.** `ACCOUNT_DISCONNECTED`,
      `applyProviderDisconnection` (sin actor), `disconnectMessagingAccount`
      rechaza los canales con `canDisconnect: false`, y `/channels` lo explica
      en vez de ofrecer un botón imposible.
- [x] **Ventana de servicio en la composición.** `getServiceWindowState`
      calculada **solo** sobre el último mensaje entrante, guard en
      `sendOutboundMessage` y aviso en `/inbox/[id]`.
- [→] Flujo de conexión de canal con advertencias previas — **movido a
      `PKG-008`** (`project/TASKS.md`), no completado aquí.

### Scope

- **Eco de salientes (`smb_message_echoes`) — el cambio más profundo.**
  - Tercer tipo en `NormalizedInboundEvent`
    (`src/modules/messaging/adapter.ts`): un saliente que Kindly no originó.
    Hoy solo existen `MESSAGE` (entrante) y `DELIVERY_UPDATE`.
  - Persistencia en `messages` con `direction = OUTBOUND`. La idempotencia ya
    está garantizada por el `unique(messagingAccountId, externalMessageId)`
    existente — hay que **verificar explícitamente** que un mensaje enviado
    desde el propio Inbox y devuelto después como eco no se duplica.
  - Distinguir el origen (Kindly vs. móvil del delegado) para poder mostrarlo
    en la UI. Decidir al implementar entre una columna explícita
    `messages.origin` (más claro para consultas y UI) o derivarlo de
    `sourceWebhookEventId IS NOT NULL` con `direction = OUTBOUND` (sin
    migración). Registrar la elección en `docs/DECISIONS.md`.
- **Importación de historial.** Servicio idempotente de importación masiva de
  mensajes históricos (180 días, chats 1:1), separado del pipeline de
  webhooks en tiempo real. Reutiliza la misma clave de idempotencia.
- **Desconexión iniciada desde fuera.** `/channels` no puede prometer un
  "Desconectar" que no existe para coexistence (no hay Deregister API). El
  botón pasa a ser condicional por canal, y se añade el camino de entrada
  para una desconexión notificada por el proveedor (`PARTNER_REMOVED`), que
  deja la `MessagingAccount` en `DISCONNECTED` con su `disconnectedAt`.
- **Ventana de 24 h en la composición** (`/inbox/[id]`): estado de ventana
  abierta/cerrada por conversación y aviso explicando el caso
  contraintuitivo — un mensaje enviado desde el móvil del delegado **no**
  abre ni extiende la ventana de Cloud API. Sin gestión de plantillas
  todavía (ver Non-goals).
- **Flujo de conexión de canal** (`/channels`), siguiendo el patrón de
  GoHighLevel que el usuario describió: pantalla de advertencias previas
  (requisito de WhatsApp Business App, número en el Business Manager,
  historial de 180 días, funciones que se desactivan en el móvil, coste de
  Cloud API) antes de iniciar la conexión. El botón final apunta al stub.
- **Stub de canal para desarrollo.** Extender
  `src/modules/messaging/testing/fake-adapter.ts` para emitir ecos,
  historial y `PARTNER_REMOVED`. Se mantiene el guardarraíl existente: solo
  se registra si `E2E_FAKE_MESSAGING_CHANNEL === "true"`, variable que fija
  únicamente `playwright.config.ts`. Nunca alcanzable en un despliegue real.

### Non-goals (explícitamente fuera de PKG-005)

- **`WhatsAppAdapter` real, Embedded Signup y credenciales.** Bloqueados por
  el alta como Tech Provider de Meta. Este paquete no los simula ni los
  adelanta.
- **Cola de jobs (pg-boss/Inngest).** La justificación concreta existe (el
  plazo duro de 24 h para sincronizar historial, ver `docs/DECISIONS.md`),
  pero introducirla ahora significaría elegir semántica de reintentos y
  backoff **contra un stub que nunca falla**. Se introduce en el paquete que
  cablea el proveedor real, donde se puede validar de verdad. El servicio de
  importación se escribe de forma que no dependa de quién lo invoca.
- **Gestión de plantillas de mensaje** (aprobación, envío fuera de ventana).
  Paquete propio, cuando haya proveedor real que las valide.
- **Telegram** (Fase 4) y billing/facturación del consumo de Cloud API.
- **Verificación del país del número** contra la lista de regiones no
  soportadas: la lista oficial no está confirmada (ver `docs/DECISIONS.md`),
  y no se hardcodea desde fuentes no oficiales.

### Acceptance criteria

- Un eco de saliente entrante por webhook aparece en `/inbox/[id]` marcado
  como enviado desde el móvil del delegado, no como enviado desde Kindly.
- Un mensaje enviado desde el Inbox y devuelto después como eco **no se
  duplica** en la conversación.
- Una importación de historial ejecutada dos veces no duplica mensajes.
- Un `PARTNER_REMOVED` deja la `MessagingAccount` en `DISCONNECTED`, y
  `/channels` lo refleja sin ofrecer un "Desconectar" que no puede cumplir.
- Con la ventana de 24 h cerrada, la composición lo indica y explica por qué
  los mensajes del móvil no la reabren.
- El aislamiento multi-tenant se mantiene en todo lo anterior: ningún query
  nuevo sin filtro explícito por `organization_id`.

### Tests

- Unit: normalización del nuevo tipo de evento, cálculo del estado de la
  ventana de 24 h, idempotencia de la importación de historial.
- Integration (PostgreSQL): eco que colisiona con un saliente ya enviado
  desde Kindly, importación repetida, `PARTNER_REMOVED` sobre una cuenta
  conectada, y aislamiento por `organization_id`.
- E2E (Playwright, contra el stub): eco del móvil visible en el Inbox, y
  flujo de conexión con la pantalla de advertencias previas.

### Exit criteria

`npm run lint`, `npm run typecheck` y `npm test` en verde, más la suite E2E.
Actualizar `project/TASKS.md`, `project/PROGRESS.md` y este archivo con el
hash del commit final, y registrar en `docs/DECISIONS.md` las decisiones no
triviales (al menos la de cómo se distingue el origen de un saliente).

---

## Sesión 2026-09-19 — Decisión de WhatsApp coexistence (solo documentación)

Último commit: `dd86b96`.

Sesión sin código. El usuario señaló que GoHighLevel ya tiene el flujo de
coexistence en producción y describió su UX completa. Se verificó contra
documentación oficial de Meta (no contra el prompt original), y se cerró el
riesgo crítico que estaba abierto desde el 2026-09-17: **se adopta la
Alternativa A — coexistence**.

Archivos tocados (documentación únicamente, ningún cambio de código):

- `docs/DECISIONS.md` — entrada nueva del 2026-09-19 con la decisión, lo
  verificado, los seis hallazgos que obligan a cambiar diseño ya existente, y
  lo que queda sin verificar. Supersede la sección "Riesgo crítico" de la
  entrada del 2026-09-17, que se conserva intacta.
- `docs/INTEGRATIONS.md` — sección 2.2 reescrita (de "riesgo sin resolver" a
  "mecanismo adoptado y sus límites"), 2.3 actualizada (Embedded Signup v4;
  v2 se depreca el 2026-10-08), 2.4 ampliada con el matiz contraintuitivo de
  la ventana de 24 h, y sección 3 (PoC) reenfocada.
- `project/TASKS.md` — Fase 0 actualizada (disponibilidad y decisión marcadas
  como hechas; añadidos el alta como Tech Provider y la decisión del BM de la
  organización como pendientes); Fase 5 desglosada para coexistence.
- `project/PROGRESS.md` — estado y lista de decisiones actualizados.

### Próximos pasos concretos

1. **Decidir el encaje del Meta Business Manager de la organización** con el
   número personal del delegado. El usuario lo aplazó explícitamente en esta
   sesión ("luego vemos el tema del BM de la org"). Se decide antes de abrir
   el paquete de Fase 5.
2. **Alta de Kindly como Tech Provider / Solution Partner de Meta** — trámite
   bloqueante, camino crítico real de la Fase 5, trabajo manual del usuario.
3. Elegir el alcance de `PKG-005`. Si fuese WhatsApp, ojo: está bloqueado por
   el punto 2, no por la arquitectura.

### Deuda técnica identificada (no ejecutada en esta sesión)

Cuatro cambios sobre código ya escrito que la decisión de coexistence obliga
a hacer cuando se abra la Fase 5, detallados en `docs/DECISIONS.md`:

1. `NormalizedInboundEvent` (`src/modules/messaging/adapter.ts`) necesita un
   tercer tipo: saliente que Kindly no originó (`smb_message_echoes`).
2. El `after()` de `src/app/api/webhooks/[channel]/[accountId]/route.ts` no
   sirve para la sincronización de historial (plazo duro de 24 h): primer
   caso de uso concreto que justifica pg-boss/Inngest.
3. El botón "Desconectar" de `src/app/(app)/channels/page.tsx` no puede
   funcionar para WhatsApp (no hay Deregister API en coexistence).
4. La UI de composición debe explicar que un mensaje enviado desde el móvil
   del delegado no abre ni extiende la ventana de 24 h de Cloud API.

---

## Registro: PKG-004 — Unified Inbox (cerrado 2026-09-18)

Confirmado por el usuario el 2026-09-18: alcance completo — listado/filtros/
composición de respuesta, marcado explícito de `Contact → Unassigned`, y UI
de conexión de canal (ver pregunta explícita hecha al usuario y su
respuesta "Unified Inbox completo").

La Fase 0 (PoC manual de WhatsApp/Telegram) sigue pendiente y sin fecha, sin
relación con esto — no bloquea este paquete (se sigue construyendo contra
`MessagingAdapter`, sin proveedor real).

### Objective

Construir la Unified Inbox: pantalla de listado de `Conversation` con
filtros y no leídos, vista de conversación con composición/envío de
respuesta, marcado de un `Contact` recién creado automáticamente (remitente
desconocido) como identificado o su reasignación a un Contact existente, y
una pantalla mínima de conexión/desconexión de `MessagingAccount`. Todo
sigue construido contra la interfaz `MessagingAdapter` — sin ningún
adapter de proveedor real (Telegram/WhatsApp son Fase 4/5).

### Scope

- **Esquema — dos columnas nuevas** (migración Drizzle):
  - `contacts.is_unassigned` (boolean, `NOT NULL DEFAULT false`). Se pone a
    `true` únicamente en la creación automática de Contact desde un mensaje
    entrante de remitente desconocido (`findOrCreateConversation`); un
    Contact creado manualmente por la UI de PKG-002 nunca lo tiene a `true`.
  - `conversations.last_read_at` (timestamp, nullable). No hay "no leído"
    por usuario en este MVP (un solo estado compartido por organización,
    igual de simple que el resto del modelo de permisos) — se actualiza a
    `now()` cuando se abre la conversación.
- **Inbox — listado** (`/inbox`): `Conversation` + nombre de Contact (con
  badge "Sin identificar" si `is_unassigned`) + canal + delegado + último
  mensaje (snippet + hora) + indicador de no leído. Filtros por query string:
  canal (`?channel=`) y solo no leídos (`?unread=1`). Sin selección manual
  de canal al responder (`docs/PRODUCT.md` sección 6) — el canal ya lo
  determina la Conversation.
- **Inbox — detalle** (`/inbox/[id]`): historial de mensajes (INBOUND a la
  izquierda, OUTBOUND a la derecha, con `deliveryStatus`), composición y
  envío de respuesta (`sendOutboundMessage`, ya existente desde PKG-003).
  Abrir la conversación marca `last_read_at = now()`. Si el Contact es
  `is_unassigned`: banner con dos acciones — "Marcar como identificado"
  (pone `is_unassigned = false`, tras editar sus datos si hace falta desde
  `/contacts/[id]`) y "Reasignar a un Contact existente" (mueve la
  Conversation a otro Contact de la misma organización, sin fusionar ni
  eliminar el Contact mínimo original — fusión/eliminación reales siguen
  fuera de alcance, ver Non-goals).
- **Canales** (`/channels`): lista los canales realmente registrados en
  `src/modules/messaging/registry.ts` (vacío en producción) para conectar
  una cuenta nueva (canal + delegado de la organización) y lista las
  `MessagingAccount` ya conectadas con botón de desconectar. Si no hay
  ningún canal registrado, mensaje explícito de que no hay proveedores
  disponibles todavía — nunca se inventa un flujo de "Connect" que no puede
  completarse contra un proveedor real (`CLAUDE.md` sección 3).
- **Activity**: nuevos tipos `CONTACT_IDENTIFIED` y `CONVERSATION_REASSIGNED`.
- **Endurecimiento encontrado al construir `/channels`** (primer llamador
  real de `connectMessagingAccount` fuera de tests): se añade una
  comprobación `isOrganizationMember` sobre `delegateId` dentro del propio
  servicio (`src/modules/messaging/service.ts`), mismo patrón de defensa en
  profundidad que `cases/service.ts` — sin esto, un `delegateId` de un
  usuario fuera de la organización se aceptaba sin validar.
- **Canal de pruebas E2E controlado por variable de entorno**: para poder
  probar el flujo completo `Webhook → Conversation → Inbox` con Playwright
  contra un build de producción real (`next build && next start`, sin
  acceso al proceso de Vitest), se añade `src/instrumentation.ts` que
  registra `FakeMessagingAdapter`
  (movido a `src/modules/messaging/testing/fake-adapter.ts`, antes en
  `tests/fakes/`) **solo si** `process.env.E2E_FAKE_MESSAGING_CHANNEL ===
  "true"`. Esa variable la fija únicamente `playwright.config.ts` en
  `webServer.env` — no aparece en `.env.example` ni en ninguna
  configuración de despliegue real. Ver `docs/DECISIONS.md` para la
  justificación completa y el análisis de riesgo.

### Non-goals (explícitamente fuera de PKG-004)

- `WhatsAppAdapter`/`TelegramAdapter` reales — Fase 4/5.
- Fusión/eliminación real de Contacts duplicados (la "reasignación" solo
  mueve la Conversation a otro Contact existente; el Contact mínimo
  original queda huérfano, sin fusionar ni eliminar).
- Detección automática de posibles duplicados.
- UI para vincular `Conversation` ↔ `Case` vía `conversation_cases` — Fase 6
  (`project/TASKS.md`).
- Cambiar la pantalla de aterrizaje tras login (`/dashboard`) por `/inbox`
  como pantalla inicial real, aunque `docs/ARCHITECTURE.md` sección 11 lo
  describa como objetivo final — cambiar el flujo de login/redirect
  rompería los E2E existentes de PKG-001/PKG-002 y es un cambio de UX más
  amplio que este paquete. Se añade "Inbox" como link de navegación, sin
  tocar el destino post-login. Anotado aquí explícitamente, no en silencio.
- No leídos por usuario individual (un `DELEGATE` no ve su propio contador
  distinto del de otro) — un solo estado compartido por organización.
- Plantillas de respuesta, ventana de 24h de WhatsApp, reintentos de envío
  fallido — Fase 5.
- Campos específicos de proveedor en el formulario de conexión de canal
  (Embedded Signup real, deep link real) — no hay proveedor real que los
  necesite todavía; el formulario de `/channels` solo pide canal + delegado.

### Acceptance criteria

1. `/inbox` lista las `Conversation` de la organización actual con nombre de
   Contact, canal, delegado, último mensaje y hora; nunca una de otra
   organización.
2. Filtro por canal y filtro "solo no leídos" en `/inbox` funcionan sobre
   query string.
3. Abrir `/inbox/[id]` marca la conversación como leída (`last_read_at`) y
   deja de aparecer en el filtro de no leídos.
4. Desde `/inbox/[id]` se puede enviar una respuesta que persiste un
   `Message` `OUTBOUND` (reutilizando `sendOutboundMessage` de PKG-003) y
   aparece en el historial sin recargar manualmente el canal.
5. Un Contact `is_unassigned` se ve con badge en el listado y detalle;
   "Marcar como identificado" lo quita; "Reasignar" mueve la Conversation a
   otro Contact de la misma organización y registra `CONVERSATION_REASSIGNED`.
6. `/channels` conecta y desconecta una `MessagingAccount` contra cualquier
   adapter registrado (verificado con el canal falso, gated por
   `E2E_FAKE_MESSAGING_CHANNEL`, nunca alcanzable en un build de producción
   real sin esa variable) y muestra un mensaje claro cuando no hay ningún
   canal registrado.
7. Ningún query de este paquete devuelve ni permite modificar filas de otra
   `Organization` — test explícito con dos organizaciones (listado, detalle,
   marcar leído, reasignar Contact, conectar canal).
8. `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` en
   verde; al menos un E2E nuevo cubre el camino feliz completo (conectar
   canal falso vía UI → simular webhook entrante → verlo en Inbox → marcar
   identificado → responder) sin depender de ningún proveedor real.
9. `docs/DATABASE.md` refleja las columnas nuevas; `docs/DECISIONS.md`
   registra el endurecimiento de `connectMessagingAccount` y la variable de
   entorno de canal falso para E2E.

### Tests

- Unit: `isConversationUnread` (dominio puro, sin DB).
- Integration (PostgreSQL real): `is_unassigned` en la creación automática
  de Contact; `markContactIdentified`; `reassignConversationContact`
  (incluyendo rechazo cross-organización); `listConversationsWithPreview`
  (filtros de canal/no-leídos, orden por último mensaje);
  `markConversationRead`; aislamiento multi-tenant explícito para todo lo
  anterior.
- E2E (Playwright, contra build de producción con
  `E2E_FAKE_MESSAGING_CHANNEL=true`): conectar el canal falso desde
  `/channels` → simular un webhook entrante real (`POST
  /api/webhooks/fake/[accountId]`, misma firma que usan los tests de
  integración) → verlo en `/inbox` con badge "Sin identificar" y no leído →
  abrir la conversación → marcar como identificado → responder → verificar
  que una segunda organización no ve nada de esto.

### Exit criteria — verificación final (2026-09-18)

- [x] Acceptance criteria 1-9: verificados con la suite automatizada (58
      unit/integration en verde) y manualmente contra `next build && next
      start` real (curl + consultas SQL directas para confirmar el registro
      de adapters y el pool de conexiones).
- [x] `npm run lint` — sin errores ni warnings.
- [x] `npm run typecheck` — sin errores.
- [x] `npm test` — 58 tests (7 archivos unit, 6 archivos integration) en
      verde, contra PostgreSQL real (`kindly_test`).
- [x] `npm run test:e2e` — 5 tests Playwright en verde (los 3 de
      PKG-001/002/003 sin cambios + 2 nuevos de Inbox), verificado estable en
      3 ejecuciones completas consecutivas tras los fixes de la sección de
      abajo.
- [x] `npm run build` — build de producción sin errores ni warnings.
- [x] `project/TASKS.md` actualizado.
- [x] `project/PROGRESS.md` actualizado con fecha.
- [x] Decisiones no triviales registradas en `docs/DECISIONS.md` (entradas
      del 2026-09-18, bloque "PKG-004").
- [x] Commit Git — ver `## Estado` al final de este archivo.

### Tres bugs pre-existentes encontrados y corregidos (ninguno introducido por este paquete)

Al intentar probar el flujo completo de Inbox contra un build de producción
real (`next build && next start`, lo que Playwright siempre usó desde
PKG-001) aparecieron tres bugs reales que nunca se habían manifestado
porque nada anterior había ejercitado esas condiciones a fondo. Detalle
completo, evidencia y reproducción en `docs/DECISIONS.md` (bloque
"PKG-004", puntos 4-6):

1. `src/modules/messaging/registry.ts` (PKG-003) usaba un `Map` a nivel de
   módulo como "singleton", pero Turbopack en producción da a
   `instrumentation.ts` y a cada ruta/página instancias de módulo
   *separadas* — corregido guardándolo en `globalThis`.
2. `src/db/client.ts` (PKG-001) solo cacheaba el pool de conexiones de
   PostgreSQL en `globalThis` fuera de producción (`NODE_ENV !==
   "production"`) — exactamente al revés de lo que hacía falta bajo
   Turbopack, donde cada chunk sin ese cache abría su propio pool de hasta
   10 conexiones. Corregido cacheándolo siempre.
3. El rate limiting por defecto de Better Auth (3 peticiones/10s por IP en
   `/sign-up`, `/sign-in`...) solo está activo en producción, nunca en
   `next dev` — por eso nunca se vio en PKG-001/002/003. La suite de E2E de
   PKG-004 fue la primera en acumular suficientes registros como para
   chocar con él de forma consistente. Corregido con
   `rateLimit: { enabled: process.env.DISABLE_AUTH_RATE_LIMIT !== "true" }`
   en `src/modules/auth/auth.ts`, variable fijada solo por
   `playwright.config.ts`.

Los tres se verificaron con reproducción directa (logging temporal +
scripts HTTP ad-hoc), no se asumieron — ver el registro completo en
`docs/DECISIONS.md` antes de tocar `db/client.ts` o `registry.ts` de nuevo.

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
- [x] Commit Git — `2dadb0d`.

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

**No forma parte de ningún paquete de código.** Es trabajo manual que ejecuta
el usuario con sus propias cuentas de Telegram/WhatsApp y dispositivos reales.
El agente no debe intentar ejecutarla, simularla, ni adelantar la
implementación de `WhatsAppAdapter`/`TelegramAdapter` reales mientras esté
pendiente.

**Matiz añadido el 2026-09-19:** construir dominio y UI **contra un stub**
(como hace `PKG-005`) sí está permitido y siempre lo estuvo — es la razón de
ser de la interfaz `MessagingAdapter`. Lo que sigue prohibido es un adapter
real, simular una conexión real ante un usuario, o cualquier mecanismo no
oficial (`CLAUDE.md` sección 3).

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

**Último commit:** `1c985f5` — "feat(PKG-004): Unified Inbox (UI) —
listado, detalle, canales".

**Sesión anterior (misma fecha, 2026-09-18):** implementado `PKG-003 —
Messaging core (backend)` completo (`2dadb0d`).

**Esta sesión:** implementado `PKG-004 — Unified Inbox (UI)` completo (ver
registro arriba): `/inbox` (listado + filtros + no leídos), `/inbox/[id]`
(detalle + respuesta + marcar identificado/reasignar Contact Unassigned),
`/channels` (conectar/desconectar `MessagingAccount`). Migración
`drizzle/migrations/0004_inbox_unassigned_unread.sql` aplicada contra
PostgreSQL de desarrollo. Además, tres bugs pre-existentes encontrados y
corregidos (ver sección dedicada arriba y `docs/DECISIONS.md`): singleton de
`registry.ts` roto bajo Turbopack en producción, pool de conexiones de
`db/client.ts` no cacheado en producción, y rate limiting de Better Auth
(solo activo en producción) chocando con la suite de E2E ampliada.

**Tests:** 58 unit/integration (Vitest, 13 archivos) + 5 E2E (Playwright, 3
sin cambios + 2 nuevos de Inbox), todos en verde — suite E2E verificada
estable en 3 ejecuciones completas consecutivas. Requieren PostgreSQL local
corriendo (`docker compose up -d`) — sin eso, `npm test` y `npm run
test:e2e` fallan al no poder conectar, lo cual es esperado, no un bug.

**Sesión 2026-09-19 (solo documentación, commits `80a7ebf`, `411818d` y
`3b78f69`):**
decisión de adoptar WhatsApp coexistence y definición de `PKG-005` (ver
arriba). Sin cambios de código todavía.

**Sesión 2026-09-20 (commits `961efda`, `da98e2f`, `2941815`, `41e9291`, `6306760` y `82e6655`):** implementado el primer bloque de
`PKG-005`, el eco de salientes (ver Progreso arriba). Migración
`drizzle/migrations/0005_echo_sent_from_device.sql` aplicada contra
PostgreSQL de desarrollo. 62 unit/integration (Vitest) + 6 E2E (Playwright) en verde.

**Aviso para la próxima sesión:** si los E2E fallan con "no existe el
selector Canal" o con vueltas inesperadas a `/login`, mira primero si hay un
`next-server` ocupando el puerto 3000 —
`playwright.config.ts` usa `reuseExistingServer: !process.env.CI` y se
engancha a él sin las variables de entorno que la suite necesita. Detalle en
`docs/DECISIONS.md`, entrada del 2026-09-20.

**Próxima acción concreta: la lista de seis pasos del usuario, arriba.** No
hay trabajo de código pendiente en el camino de WhatsApp. Si el usuario quiere
seguir programando mientras corre el reloj de Meta, los candidatos son la Fase
4 (Telegram, que ya reutiliza `MessagingAdapter` y toda la UI de canales), la
Fase 6 (Cases lifecycle avanzado) o la Fase 7 (Knowledge). No empezar ninguno
sin que el usuario lo confirme.

**En paralelo, fuera del código y del camino del agente:** el usuario arranca
el alta ante Meta (dominio + landing + política de privacidad pública →
verificación de negocio Partner-Led o Meta Verified → app → App Review). Son
2-5 días laborables de espera que corren solos mientras se programa
`PKG-005`, y es lo único del camino crítico que no depende del código. Ver
`project/TASKS.md`, Fase 0.
