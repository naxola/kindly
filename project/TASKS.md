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
- [x] PoC WhatsApp: verificar disponibilidad real de "coexistence" con
      WhatsApp Business App. **Confirmada el 2026-09-19** contra documentación
      oficial de Meta (disponible desde mayo 2025; Embedded Signup por defecto
      desde abril 2026). Ver `docs/DECISIONS.md`.
- [x] Decisión entre alternativas A/B/C (`docs/INTEGRATIONS.md` sección 2.2):
      **adoptada la A (coexistence)** el 2026-09-19. B y C quedan como plan de
      repliegue.
### Alta de Kindly como Tech Provider de Meta (bloqueante, no técnico)

Camino crítico real de la Fase 5 — sin esto no hay PoC. **En orden**, porque
cada bloque bloquea al siguiente. Nivel elegido: **Tech Provider**, no
Solution Partner (Tech Provider no tiene línea de crédito: cada organización
cliente pone su método de pago y Meta le factura a ella; Solution Partner
factura el consumo al cliente, que es lo que hace GoHighLevel). Se sube de
nivel más adelante si se quiere ese modelo.

- [~] Dominio público + landing con **política de privacidad y aviso legal**.
      **El sitio está construido** (`PKG-010`, 2026-09-20): `/`, `/privacidad`,
      `/terminos`, `/aviso-legal` y `/eliminacion-de-datos`, públicas y sin
      login. Falta lo que no puede hacer el agente:
      - [ ] Rellenar los datos legales reales en `src/config/company.ts`
            (mientras haya `REVISAR:`, el sitio muestra una banda roja).
      - [ ] **Revisión jurídica** de los textos antes de publicarlos.
      - [ ] Contratar dominio y desplegar con HTTPS válido.
      - [ ] Correo en el dominio propio (Meta rechaza gmail.com y similares).
      - [ ] Fijar `NEXT_PUBLIC_SITE_URL` y `FACEBOOK_DOMAIN_VERIFICATION`.
- [ ] Business portfolio (Business Manager) con datos completos y
      **coincidentes** con el registro mercantil y la web — nombre legal,
      dirección, teléfono, email. La causa habitual de rechazo es que no
      cuadren entre sí.
- [ ] Activar **2FA** en la cuenta (requisito, no recomendación).
- [ ] Lanzar la **verificación de negocio**: 2-5 días laborables. Para
      coexistence debe ser **Partner-Led Business Verification o Meta
      Verified** — la clásica no sirve. Si falla, se resubmite con el
      feedback de Meta.
- [ ] Alta como Meta Developer, crear **app** con caso de uso WhatsApp, y en
      el App Dashboard ir a **Use cases → Customize → "Tech Provider
      onboarding"**.
- [ ] Rellenar lo básico de la app: icono, categoría y URL de política de
      privacidad.
- [ ] **App Review** (~24 h de respuesta): Advanced Access a
      `whatsapp_business_management` y `whatsapp_business_messaging`. Para
      cada permiso **por separado**: explicación escrita + **grabación de
      pantalla** (no valen capturas, ni varios permisos en un mismo vídeo).
      **No hace falta el producto terminado:** Meta acepta grabaciones del
      API Setup con cURL o del WhatsApp Manager.
- [ ] Preguntar a soporte de Meta si el Embedded Signup **de coexistence**
      requiere habilitación adicional una vez eres Tech Provider. No
      confirmado en la documentación; no darlo por resuelto.
- [ ] Decidir el encaje del **Meta Business Manager de la organización** con
      el número personal del delegado (control administrativo sobre un número
      personal: lectura legal/laboral). Aplazado por el usuario el 2026-09-19;
      se decide antes de abrir el paquete de Fase 5.
- [ ] PoC WhatsApp — pasos 1-14 completos según `docs/INTEGRATIONS.md`
      sección 3, ya reenfocados a coexistence (Embedded Signup v4 con
      `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, las tres suscripciones de
      webhook, sincronización de historial dentro del plazo de 24 h, no
      duplicación de ecos, ventana de 24 h, desconexión desde el móvil con
      `PARTNER_REMOVED`, países no soportados y throughput real).
- [ ] Registrar resultado de la PoC de Telegram en `docs/DECISIONS.md` (lo
      hace el usuario, o el agente a partir de lo que el usuario reporte).

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

## PKG-004 — Unified Inbox, UI (cerrado el 2026-09-18)

Alcance elegido por el usuario: completo. Definición completa en
`project/CURRENT_TASK.md`. Resumen:

- [x] Unified Inbox (UI): listado (`/inbox`), filtros por canal y no
      leídos, sin selección manual de canal al responder.
- [x] Vista de conversación (`/inbox/[id]`): historial de mensajes,
      composición y envío de respuesta.
- [x] Marcado explícito de `Contact → Unassigned` en UI ("Marcar como
      identificado") y reasignación de la Conversation a un Contact
      existente (fusión/eliminación real del Contact original sigue fuera
      de alcance).
- [x] UI de conexión/desconexión de canal (`/channels`) contra cualquier
      adapter realmente registrado — sin campos específicos de proveedor
      todavía (no hay ninguno real).
- [x] Corregidos tres bugs pre-existentes encontrados al construirlo:
      singleton de `messaging/registry.ts` roto bajo Turbopack en
      producción, pool de conexiones de `db/client.ts` no cacheado en
      producción, rate limiting de Better Auth (solo activo en producción)
      chocando con la suite de E2E ampliada.

Ver `docs/DECISIONS.md` (entradas del 2026-09-18, bloque "PKG-004") para el
detalle completo.

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

## Fase 5 — WhatsApp coexistence (Alternativa A, decidida el 2026-09-19)

Bloqueada por el alta como Tech Provider de Meta (Fase 0), no por la decisión
de arquitectura, que ya está tomada. Ver `docs/DECISIONS.md` y
`docs/INTEGRATIONS.md` sección 2.2.

- [ ] `WhatsAppAdapter` implementando `MessagingAdapter` sobre Cloud API en
      modo coexistence.
- [ ] Embedded Signup **v4** (v2 se depreca el 2026-10-08) con
      `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, saltando el registro del
      número, y con session logging.
- [ ] UI de conexión: pantalla previa de advertencias (país, número en el
      Business Manager, requisito de WhatsApp Business App, historial de 180
      días, funciones que se desactivan en el móvil, coste de Cloud API).
- [ ] Tercer tipo de evento en `NormalizedInboundEvent`: saliente que Kindly
      no originó (`smb_message_echoes`), con idempotencia frente a los
      mensajes enviados desde el propio Inbox.
- [ ] Sincronización inicial de historial (`history`) dentro del plazo duro de
      24 h → primer caso de uso concreto que justifica un job en background
      reintentable (pg-boss/Inngest) en vez de `after()`.
- [ ] Sincronización de contactos (`smb_app_state_sync`) contra el modelo
      `Contact`.
- [ ] Manejo de ventana de 24h y plantillas en la UI de composición,
      incluyendo el caso contraintuitivo: un mensaje enviado desde el móvil
      del delegado no abre ni extiende la ventana de Cloud API.
- [ ] Rediseñar la desconexión en `/channels`: no hay Deregister API para
      coexistence — la inicia el delegado desde su móvil y llega como
      `account_update` / `PARTNER_REMOVED`.
- [ ] Manejo de delivery/read status vía webhooks de estado.
- [ ] Acceptance test completo (sección "WhatsApp acceptance test" del
      encargo), incluyendo verificación explícita del comportamiento de
      identidad de comunicación decidido en Fase 0.

## Desglose en paquetes: conexión de WhatsApp desde los ajustes del delegado

Propuesto el 2026-09-20 a petición del usuario ("que el administrador o el
delegado sean capaces de integrar su número con Kindly y Meta"). Sustituye al
listado plano de la Fase 5 de arriba, que no distinguía lo construible hoy de
lo bloqueado por Meta. Nada de esto se empieza sin confirmación explícita.

### Bloqueo previo detectado: hoy no existen organizaciones con varios miembros

`bootstrapOrganizationForUser` crea una Organization por usuario y le asigna
rol `ADMIN` — **no hay ningún flujo de invitación**. Es decir: hoy toda
organización tiene exactamente un miembro, que es ADMIN. La distinción
"el administrador o el delegado" no se puede ejercer ni testear, y el selector
de Delegate de `/channels` siempre tiene una sola opción: uno mismo.

Esto no impide conectar un número (el ADMIN es también su propio delegado),
pero sí hace imposible el escenario real del producto: un despacho donde el
ADMIN gestiona varios DELEGATE. Por eso `PKG-006` va antes.

### PKG-006 — Miembros de la organización (invitar delegados) — CERRADO 2026-09-20

- [x] Invitar a un miembro a la Organization y asignarle rol ADMIN/DELEGATE.
- [x] Aceptación de invitación enlazada con el registro de Better Auth
      (emparejada por email en el hook de creación de usuario, no por token
      arrastrado por el flujo — ver `docs/DECISIONS.md`).
- [x] Pantalla de miembros (`/members`): listado, rol, invitaciones
      pendientes con su enlace, revocar.
- [x] Página pública `/invite/<token>` que distingue los cinco estados de una
      invitación en vez de agruparlos en "enlace inválido".
- [x] Helper `requireOrganizationAdmin` como defensa en profundidad.
- [x] Bootstrap revisado: `ensureOrganizationForUser` es ahora el único punto
      de entrada, usado por el hook de registro y por la autorreparación.

Límite conocido y mostrado en la UI: una persona pertenece a una sola
Organization (`organization_members_user_unique`), así que una invitación solo
la puede aceptar un email que todavía no tenga cuenta. Y Kindly no envía
emails: el ADMIN copia el enlace.

### PKG-007 — Ajustes del delegado y estado del canal — CERRADO 2026-09-20

- [x] Vista por delegado en `/channels`: un DELEGATE ve y gestiona solo sus
      propias `MessagingAccount`; un ADMIN ve además las del resto.
- [x] Máquina de estados expuesta de verdad vía `describeAccountStatus`
      (tono, si requiere atención, si los mensajes fluyen) más explicación en
      castellano por estado.
- [x] `lastError`, `lastSyncAt` y `connectedAt` visibles.
- [x] Alta por canal en vez del formulario genérico canal+delegado.
- [x] **Retirado el "conectar en nombre de"**: ningún proveedor real lo
      permite, la conexión es siempre para uno mismo, y el servicio lo
      rechaza además de la UI. Ver `docs/DECISIONS.md`.

### PKG-008 — Alta de WhatsApp: elección y comprobaciones previas — CERRADO 2026-09-20

- [x] Pantalla de elección con las tres vías excluyentes. Solo coexistence
      disponible; las otras dos se muestran deshabilitadas **con su motivo**.
- [x] Pantalla de comprobaciones previas con los seis puntos (Business App,
      número no registrado ya en Cloud API, Business Manager, historial de 180
      días, funciones que se pierden en el móvil, coste de Cloud API),
      revalidados en el servidor y no solo en el cliente.
- [x] Comprobación de país como dato configurable
      (`WHATSAPP_UNSUPPORTED_COUNTRY_CODES`), vacía por defecto: la UI dice
      que no puede comprobarlo en vez de usar una lista no oficial.
- [x] Aviso de redirección a Facebook y botón final. Sin adapter registrado
      el flujo es inalcanzable, que es la verdad actual — nunca simula una
      conexión real.
- [x] Camino de error real: el proveedor rechaza y no queda ninguna
      `MessagingAccount` a medias.
- [ ] **No hecho a propósito:** `PENDING → CONNECTING → CONNECTED`. Con un
      stub síncrono no hay ningún instante en que esos estados sean ciertos;
      inventar la asincronía sería escribir la máquina de estados alrededor de
      una suposición. Pasa a `PKG-009`, donde el flujo sale de verdad a
      Facebook y vuelve por un callback. Ver `docs/DECISIONS.md`.

El onboarding lo declara el adapter (`onboarding: "WHATSAPP_COEXISTENCE"`), así
que cuando llegue `PKG-009` el `WhatsAppAdapter` real usará esta misma UI sin
tocarla.

### PKG-010 — Sitio público y documentos legales — CERRADO 2026-09-20

Prerrequisito del alta ante Meta, no del producto.

- [x] Landing pública en `/` con el producto real: bandeja, copiloto con
      citas, y los tres principios que no se negocian.
- [x] `/privacidad`, `/terminos`, `/aviso-legal` y `/eliminacion-de-datos`
      (esta última la exige Meta como *Data Deletion Instructions URL*).
- [x] Todas accesibles **sin sesión**, con test E2E que lo comprueba en un
      contexto sin cookies — es el requisito que Meta verifica periódicamente.
- [x] Identidad legal centralizada en `src/config/company.ts` con huecos
      visibles y banda de aviso mientras queden sin rellenar.
- [x] Metaetiqueta de verificación de dominio vía
      `FACEBOOK_DOMAIN_VERIFICATION`.

### PKG-009 — Embedded Signup real (BLOQUEADO)

No se empieza hasta tener las dos cosas de abajo. Es el único paquete que
toca Meta de verdad.

**Bloqueado por:**
1. El alta de Kindly como **Tech Provider de Meta** (Fase 0 arriba).
2. La **decisión del Business Manager de la organización**, aplazada por el
   usuario el 2026-09-19. No es solo legal: determina quién se autentica
   contra Facebook y en qué Business Manager acaba el número, que es
   precisamente lo que configura este paquete.

- [ ] Embedded Signup **v4** con session logging (v2 se depreca el
      2026-10-08).
- [ ] Evento `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, saltando el registro
      del número, e intercambio del código por token.
- [ ] Alta de las tres suscripciones de webhook (`history`,
      `smb_app_state_sync`, `smb_message_echoes`).
- [ ] Disparar la sincronización de historial dentro del plazo duro de 24 h
      (aquí sí se introduce la cola de jobs, ver `docs/DECISIONS.md`).
- [ ] `WhatsAppAdapter` real implementando `MessagingAdapter`, declarando
      `onboarding: "WHATSAPP_COEXISTENCE"` para reutilizar la UI de PKG-008.
- [ ] Estados `PENDING → CONNECTING → CONNECTED` reales, aplazados desde
      PKG-008: aquí el flujo sale a Facebook y vuelve por callback, que es el
      primer momento en que esos estados significan algo.
- [ ] Credenciales en almacén seguro vía `credentials_reference` — nunca en
      la fila de la base de datos, el código o los logs (`CLAUDE.md` 5).

### PKG-011 — WhatsApp Cloud API, número de prueba de Meta (validación de la tubería real) — CERRADO 2026-09-25

- [x] `WhatsAppTestAdapter` (`src/modules/messaging/testing/whatsapp-test-adapter.ts`):
      envío de texto libre, firma HMAC real, parseo de `messages`/`statuses`,
      filtrado por `phone_number_id`.
- [x] `connectAccount` valida credenciales contra Meta y suscribe la WABA
      (`subscribed_apps`) si hay `WHATSAPP_TEST_WABA_ID`.
- [x] `verifyWebhookChallenge` opcional en `MessagingAdapter` + `GET` en la
      ruta del webhook (`verifyWebhookSubscription`).
- [x] Registro condicional en `src/instrumentation.ts` (flag + todas las
      credenciales, nunca con `VERCEL_ENV=production`).
- [x] Tests unit + integración.
- [x] **Prueba manual real** con el móvil en staging (usuario): recibir y
      responder funcionan (2026-09-25).

**No bloqueado.** No depende del alta como Tech Provider ni de la
verificación de negocio — usa el número de prueba gratuito que Meta da al
crear la app (sin App Review), el mismo que el usuario ya validó a mano con
`curl` el 2026-09-23. Corre en paralelo a `PKG-009`, no lo sustituye ni lo
adelanta.

**Objetivo:** probar la tubería `Webhook de Meta → Conversation → Inbox` con
payloads y firma reales de Meta, en vez del adapter falso. Retira riesgo del
código (parseo real, verificación de firma real) mientras el trámite largo de
Meta corre por su cuenta.

**Distinción crítica con `PKG-009`, que no se difumina:**

- Este **no es coexistence**. El número de prueba es un número dedicado de
  Cloud API sin ningún teléfono físico detrás — no hay `smb_message_echoes`,
  no hay historial de 180 días, no hay `PARTNER_REMOVED`. `canDisconnect:
  true` (Cloud API sí tiene Deregister API para un número dedicado, a
  diferencia de coexistence).
- **Nunca se ofrece como opción real de conexión a un delegado.** Viola el
  principio de identidad de `CLAUDE.md` sección 2 punto 1 (un número
  compartido de pruebas, no el WhatsApp personal del delegado) si se ofreciera
  así. Es una herramienta de validación de ingeniería, con el mismo espíritu
  que `FakeMessagingAdapter` pero contra Meta de verdad — nunca en producción.
- Canal registrado como `"whatsapp-test"`, nunca `"whatsapp"` — ese nombre lo
  reserva `PKG-009` para el adapter real, para que no puedan colisionar ni
  confundirse en `messaging_accounts`.

**Scope:**

- **`WhatsAppTestAdapter`** (`src/modules/messaging/testing/` o similar,
  mismo criterio que `fake-adapter.ts`: vive bajo `src/`, no bajo `tests/`,
  porque `src/instrumentation.ts` necesita registrarlo condicionalmente).
  Capacidades: `serviceWindowHours: 24`, `canDisconnect: true`, `onboarding:
  "DIRECT"`.
  - `sendMessage`: `POST` real a `https://graph.facebook.com/v25.0/{phone_number_id}/messages`
    con Bearer token. Solo texto libre dentro de la ventana de 24 h — sin
    gestión de plantillas (sigue fuera de alcance, igual que en `PKG-005`).
  - `verifyWebhookSignature`: HMAC-SHA256 real sobre el body crudo con el
    **App Secret**, comparado contra `X-Hub-Signature-256`. Primera
    verificación de firma real del proyecto (la del canal falso es un secreto
    compartido literal).
  - `parseWebhookEvents`: parsea el JSON real de Meta
    (`entry[].changes[].value.messages[]` → `MESSAGE`,
    `entry[].changes[].value.statuses[]` → `DELIVERY_UPDATE`).
  - `connectAccount`: sin OAuth — usa credenciales ya obtenidas a mano
    (`WHATSAPP_TEST_PHONE_NUMBER_ID`, `WHATSAPP_TEST_ACCESS_TOKEN`,
    `WHATSAPP_TEST_APP_SECRET` como variables de entorno), consistente con
    `onboarding: "DIRECT"` — un clic en `/channels`, sin pantalla de
    Facebook.
- **Registro condicional**, mismo patrón que el canal falso
  (`E2E_FAKE_MESSAGING_CHANNEL`): una variable explícita
  (`WHATSAPP_TEST_ADAPTER_ENABLED=true`), **además** de que existan las
  credenciales — nunca solo por la presencia de las credenciales, para que
  copiar variables de staging a producción por error no baste para
  activarlo. Se fija únicamente en las variables de entorno de Preview/rama
  `staging` en Vercel, nunca en Production.
- **Extensión de la interfaz `MessagingAdapter`**: método opcional
  `verifyWebhookChallenge(query: URLSearchParams): string | null`, y el
  route handler (`src/app/api/webhooks/[channel]/[accountId]/route.ts`)
  gana un `GET` que lo invoca si el adapter lo implementa. Es el *handshake*
  `hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` que Meta exige
  antes de aceptar la URL del webhook — ningún canal existente lo necesitaba
  hasta ahora.

**Non-goals (explícitamente fuera):**

- Gestión de plantillas, reintentos de envío fallido — igual que `PKG-005`.
- Cualquier UI que ofrezca este canal como opción real de conexión fuera de
  un entorno de prueba.
- Tocar `PKG-009`, `WhatsAppAdapter` real, o el registro del canal
  `"whatsapp"`.

**Prerrequisitos manuales del usuario, antes de programar:**

1. **Token permanente**: System User en Meta Business Settings (el token
   temporal de `API Setup` caduca en ~24 h).
2. **App Secret**: Configuración de la app → Básica.
3. Ambos, más `WHATSAPP_TEST_PHONE_NUMBER_ID`, como variables de entorno en
   Vercel con scope Preview/rama `staging` — nunca en `.env.example` con
   valores reales, nunca en Production.
4. Tras el primer deploy con el adapter conectado (para tener el `accountId`
   real en la URL), registrar la Callback URL
   (`https://kindly-peach.vercel.app/api/webhooks/whatsapp-test/<accountId>`)
   y un Verify Token propio en Meta → WhatsApp → Configuration.

**Tests:** unit (verificación de firma real con un secreto conocido, parseo
del JSON real de Meta con un payload de ejemplo capturado); integration
(webhook con firma inválida/válida contra el endpoint genérico, igual que el
resto de canales); manual, no automatizable (envío/recepción real contra el
número de prueba de Meta, verificado a ojo en el Inbox).

### PKG-012 — Email (Resend) y recuperación de contraseña — CERRADO 2026-09-25

- [x] `EmailSender` + `ResendEmailSender` (`src/modules/email/`), consola en
      desarrollo, sin sustituto en producción.
- [x] `sendResetPassword` en Better Auth: token de 1 h, un solo uso, revoca
      sesiones.
- [x] `/forgot-password`, `/reset-password` y enlace desde `/login`.
- [x] `npm run auth:reset-password` (herramienta de operador).
- [x] Tests unit, integración (flujo completo con el token real) y E2E.
- [ ] (Siguiente, aditivo) Enviar también por email las invitaciones de
      `/members`, manteniendo el enlace copiable como alternativa.
- [ ] (Usuario) Verificar el dominio propio en Resend y fijar `EMAIL_FROM`.

### PKG-013 — Conversación en vivo — CERRADO 2026-09-25

- [x] Envío optimista con reintento; Intro envía.
- [x] Checks ✓ / ✓✓ / ✓✓ azul; estados de entrega que nunca retroceden.
- [x] Sondeo de la conversación abierta (3 s) y de `/inbox` (5 s).
- [x] "Escribiendo…" hacia el contacto (marca como leído, aceptado); el
      contacto escribiendo **no** se puede mostrar (Meta no lo notifica).
- [x] Tests unit, integración y E2E.
- [ ] (Usuario) Probarlo en staging con el móvil.

## Rediseño UI/UX (paquetes UI-0 … UI-9) — fuente de verdad: `docs/ui/`

Detalle de cada fase (objetivo, alcance, criterios, qué no tocar) en
`docs/ui/ROADMAP.md`. Aquí solo el seguimiento.

### UI-0 — Auditoría — CERRADO 2026-09-26

- [x] Auditoría del estado actual (`docs/ui/AUDIT.md`).
- [x] Estudio del repositorio de Supabase (`docs/ui/SUPABASE_REFERENCE.md`).
- [x] Documentación completa de `docs/ui/` y decisión en `docs/DECISIONS.md`.

### UI-1 — Design system: tokens y componentes base — CERRADO 2026-09-26

- [x] `src/styles/tokens.css` (tres capas) y `globals.css` sobre tokens.
- [x] `src/lib/cn.ts` y componentes base en `src/components/ui/`.
- [x] `/ui-kit` como catálogo vivo.
- [x] Tests de contraste y de "solo tokens" (`tests/unit/ui-tokens.test.ts`).

### UI-2 — Shell de aplicación — CERRADO 2026-09-26

- [x] `AppShell`, `AppHeader` (texto de organización — el menú llega en
      UI-7, ver `docs/ui/ROADMAP.md`), `AppSidebar` contraíble (cookie),
      `SkipToContent`, menú móvil (`MobileNav`), `UserMenu`.
- [x] `radix-ui`: DropdownMenu, Tooltip, Sheet base.
- [x] Post-login a `/inbox`; `/dashboard` redirige.
- [x] Contador de no leídas en la sidebar (`countUnreadConversations`).
- [x] E2E del shell (`tests/e2e/shell.spec.ts`); E2E existentes en verde
      (8 specs necesitaron `exact: true` en "Canales", ver `docs/ui/ROADMAP.md`).

### UI-3 — Componentes avanzados

- [ ] Dialog, ConfirmDialog, DiscardChangesDialog, Sheet completo, Tabs, Popover, Toaster, Table, DataList, SearchInput, FilterBar, SegmentedControl, RelativeTime, (CommandMenu).
- [ ] Entorno de tests de componentes (jsdom + Testing Library) — registrar decisión.

### UI-4 — Arquitectura de páginas

- [ ] PageContainer/PageHeader/PageSection y migración de todas las páginas de `(app)` y auth.
- [ ] Textos en español (Contactos, Casos, Tareas) con E2E actualizados.
- [ ] `src/app/(app)` añadido al test de tokens.

### UI-5 — Inbox

- [ ] Vistas con contadores, búsqueda y filtros por URL, fila densa, teclado.
- [ ] Consulta de servidor eficiente (último mensaje, búsqueda, contadores) con tests de aislamiento.

### UI-6 — Conversación en Sheet

- [ ] Rutas paralelas/interceptadas, `ConversationSheet` y todos sus estados.
- [ ] Modo anclado sin velo en `xl+`; modal por debajo; pantalla completa en móvil.

### UI-7 — Organización

- [ ] `/organization` (General, Miembros, Canales) con redirecciones y diálogos.
- [ ] Acción de dominio "cambiar rol" con reglas en servidor y tests (aprobada 2026-09-26).

### UI-8 — Accesibilidad y responsive

- [ ] axe en E2E, auditoría manual, 320–1440 px.
- [ ] Tema oscuro con selector Claro / Oscuro / Sistema (aprobado 2026-09-26).

### UI-9 — Consolidación

- [ ] Retirar paleta por defecto de Tailwind, componentes obsoletos, exportador de tokens a DTCG/Figma.

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
