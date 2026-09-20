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

- [ ] Dominio público + landing con **política de privacidad y aviso legal**
      accesibles. No hace falta el producto desplegado, pero sí una URL real:
      la verificación de negocio pide web, y la app de Meta pide URL de
      política de privacidad.
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
