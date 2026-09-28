# CONVERSATION_WORKSPACE.md — Espacio de respuesta (Fase UI-10)

Conversación + ficha del afiliado + copiloto, en un único panel. Fase
**planificada, sin código todavía** (encargo del usuario del 2026-09-28:
"crea una fase con todo lo comentado para desarrollarlo a posteriori").

- **Mockup visual (datos ficticios):**
  `docs/ui/mockups/conversation-workspace.html` — publicado también como
  artifact privado del usuario: https://claude.ai/artifact/2bPa1bdSSay75RmSnmNbTU.
  Es una referencia visual, no código de producto: valores copiados de
  `src/styles/tokens.css`, sin componentes reales.
- Depende de `CHAT.md` (el panel actual) e `INBOX.md` (la lista), que
  siguen siendo la fuente de verdad de lo que no se redefine aquí.

## 1. Decisiones ya tomadas por el usuario (2026-09-28)

1. **Un único panel con dos columnas**, no dos paneles independientes: al
   hacer clic en una conversación (en **toda la fila**, no solo en el
   texto del último mensaje) se desliza desde la derecha **un** panel con
   el chat a la izquierda y la **ficha del afiliado** a la derecha. Un solo
   cierre, un solo `Esc`, una sola animación de entrada. La lista sigue
   visible (más estrecha) para saltar de un afiliado a otro.
2. **Ficha de solo lectura** en la primera versión: primero se valida el
   aspecto; la edición (notas, crear tarea/caso) es un paquete posterior.
3. **Contenido de la ficha**: lo que ya existe en el sistema (contacto,
   delegado, identificación, notas, casos, tareas, otras conversaciones)
   **más**: estado de la **afiliación** (activa o no, y desde cuándo —
   importante para promover la afiliación), **número de afiliado**,
   **documentación aportada** (llegada por WhatsApp o email, y también la
   enviada por el delegado) y un **resumen contextual** de las
   conversaciones previas.
4. **(Respuestas del usuario, 2026-09-28, segunda ronda)**
   - **Afiliación**: de momento **alta manual** en Kindly (más adelante se
     verá cómo agilizarlo). Además de activa/baja, puede estar **activa
     con la cuota actual sin pagar**. A veces el afiliado pide las
     **facturas de la cuota mensual**.
   - **Trámites en la base de conocimiento**: junto a normativa, webs y
     PDFs, el knowledge base contiene **trámites** (p. ej. "Baja por IT":
     qué documentos hacen falta y qué pasos se siguen). Es lo que permite
     saber qué documentación **falta**.
   - **Kindly no guarda archivos de los afiliados, ninguno.** Solo guarda
     trámites (definiciones y su estado). Si un afiliado manda un archivo
     por WhatsApp, el delegado puede descargarlo a su equipo, pero la
     plataforma **no lo almacena en el servidor**. El afiliado debe recibir
     un aviso de que la información enviada no se conserva en la
     plataforma (§5.2).
   - **Quién ve la documentación y la ficha**: el delegado y los ADMIN.
   - **(Tercera ronda, 2026-09-28)** Aviso al afiliado: opción (a) + (c)
     de §7 — texto que el delegado inserta con un clic y envía él, más la
     política de privacidad. **Asignación**: un afiliado tiene **un solo
     delegado a la vez** (con histórico de delegados anteriores); un
     DELEGATE ve **sus** afiliados; un ADMIN ve todos y puede
     **reasignarlos**. Es un cambio de dominio y de permisos previo a
     esta fase: paquete **PKG-014** (`project/TASKS.md`).
5. **Copiloto dinámico** dentro de la conversación: ayuda que se actualiza
   según fluye la conversación. No tiene por qué copiar la tarjeta del
   sitio público (`src/app/(public)/page.tsx`); el mockup propone una
   versión.

## 2. Layout

```text
┌ Sidebar ┬ Lista (estrecha) ┬─────────── Panel (slide-in-right) ────────────┐
│         │ ● Marta Ruiz     │ Chat                        │ Ficha      [⇥]  │
│         │   Javier López   │  historial…                 │ Afiliación      │
│         │   …              │ ┌ Copiloto ───────────────┐ │ Contacto        │
│         │                  │ │ detectado · borrador …  │ │ Situación (IA)  │
│         │                  │ └─────────────────────────┘ │ Documentación   │
│         │                  │ [Escribe una respuesta…]    │ Casos · Tareas  │
└─────────┴──────────────────┴─────────────────────────────┴─────────────────┘
```

- **Anchuras** (tokens nuevos, a crear en `tokens.css` y `TOKENS.md`):
  `--workspace-context-w` ≈ 340 px para la ficha. El chat mantiene su
  regla actual (`--sheet-w-sm` en `xl`, `--sheet-w-md` en `2xl+`, ver
  `CHAT.md` §4); el panel completo = chat + ficha.
- **Responsive**:
  - `2xl+` (≥ 1536 px): chat + ficha abiertos por defecto, lista al lado.
  - `xl` (1280–1535 px): no cabe todo holgado → ficha **plegable** con un
    botón en el header del panel (icono de panel lateral,
    `aria-pressed`); la preferencia se recuerda (cookie, como la de la
    sidebar: `sidebar-cookie.ts`), nunca se pliega sola la sidebar global
    (decisión del 2026-09-28 en `docs/DECISIONS.md`).
  - `< xl` (Sheet modal / pantalla completa): la ficha pasa a una
    **pestaña** "Chat" / "Ficha" dentro del panel (`Tabs`, no cambia la URL).
- **Accesibilidad**: la ficha es `<aside aria-label="Ficha del afiliado">`
  dentro del panel; `F6` recorre lista → chat → ficha (extiende el
  `F6`/`Ctrl+F6` actual de `CHAT.md` §4). El copiloto es su propia región
  con encabezado; los cambios de sugerencia se anuncian con
  `aria-live="polite"` sin robar el foco del compositor.

## 3. Ficha del afiliado — secciones y de dónde sale cada dato

| Sección | Contenido | Fuente | ¿Existe hoy? |
|---|---|---|---|
| **Afiliación** | Estado: **activa y al corriente**, **activa con la cuota actual pendiente** o **baja**; número de afiliado; desde cuándo (y hasta cuándo si causó baja); cuota pagada hasta (mes). Baja → aviso ámbar "buen momento para proponer la afiliación"; cuota pendiente → aviso ámbar "cuota de <mes> pendiente". Ambos son **reglas fijas**, no sugerencias de IA | Entidad nueva, alta manual (§5.1) | ❌ |
| Contacto | Teléfono, email, canal, delegado, notas | `contacts`, `messaging_accounts` | ✅ |
| Identificación | "Sin identificar" + "Marcar como identificado" / "Reasignar" (hoy en un `Alert` sobre el chat; se mueve aquí) | `contacts.is_unassigned` | ✅ (acciones ya existen; se mueven) |
| **Situación (resumen IA)** | 3-5 líneas sobre la situación actual a partir de las conversaciones previas, con etiqueta "IA", fecha de generación, nº de conversaciones/mensajes y enlace "ver en qué mensajes se basa" | Paquete UI-10d (§5.3) | ❌ |
| **Trámite y documentación** | El trámite en curso (definido en el knowledge base) con su **lista de documentos requeridos**, cada uno marcado como *recibido* (canal + fecha, **sin guardar el archivo**) o *falta*. Nunca una lista de archivos almacenados: no los hay | Paquetes UI-10c + trámites (§5.2) | ❌ |
| Casos abiertos | Título, estado, responsable | `cases` | ✅ |
| Tareas pendientes | Título, vencimiento | `tasks` | ✅ |
| Otras conversaciones | Del mismo Contact en otros canales (email en el futuro) | `conversations` | ✅ |

"Falta" sale de la lista de documentos requeridos del **trámite**
(knowledge base), no de archivos guardados. "Recibido" lo marca el
delegado (o lo propone el copiloto y el delegado lo confirma) cuando el
documento le llega por WhatsApp/email y lo ha descargado.

## 4. Copiloto dinámico

Implementa el AI Copilot de `docs/PRODUCT.md` §10 y la Fase 8 de
`project/TASKS.md` en esta superficie.

- **Posición**: tarjeta entre el historial y el compositor (lo previsto en
  `CHAT.md` §2), no en la ficha — la sugerencia está donde se escribe.
  Plegable (queda una línea: "Copiloto · Actualizado 10:42 · Evidencia
  parcial"); con altura máxima y scroll propio para no tapar el historial.
- **Dinámico**: se recalcula en segundo plano (job, `pg-boss`) cuando
  entra un mensaje del Contact, no en cada tecla; la tarjeta muestra
  "Actualizado con el mensaje de las HH:MM". Si llega un mensaje nuevo
  mientras el delegado lee la sugerencia, **no** se sustituye bajo sus
  ojos: aviso "Hay una sugerencia nueva — Ver" (mismo criterio que la
  lista, `INBOX.md` §6).
- **Contenido** (`AISuggestion`, `docs/DATABASE.md`): qué ha detectado
  (`issue`), respuesta propuesta (`suggestedReply`, en `font-document`),
  en qué se apoya (`sources`: documento, versión, artículo, **vigencia**),
  `EvidenceLevel` (`SUFFICIENT`/`PARTIAL`/`INSUFFICIENT`, nunca un
  porcentaje), avisos (`warnings`), falta por saber
  (`missingInformation`).
- **Acciones**: **"Usar como borrador"** solo rellena el compositor (el
  delegado edita y pulsa Enviar); "Descartar". **Nunca** un botón que
  envíe la sugerencia (`CLAUDE.md` §2). Nota fija: "Nada se envía sin que
  lo revises tú". La tarjeta pública dice "Editar y enviar"; aquí se usa
  "Usar como borrador" por ser más exacto.
- **Estados**: generando (skeleton + "Analizando la conversación…"), sin
  sugerencia (mensaje trivial: "Nada que sugerir para este mensaje"),
  evidencia insuficiente (se muestra igualmente, con el nivel en rojo y sin
  borrador si no hay base), error (una línea, "Reintentar"), ventana de
  servicio cerrada (la sugerencia se muestra, pero "Usar como borrador"
  explica por qué no se puede enviar ahora).
- **Normativa verificable** (`CLAUDE.md` §2.3): sin fuente recuperada real,
  no hay cita; nunca se inventa artículo, fecha ni versión.
- **Auditoría**: qué recibió, qué recuperó, qué generó y qué hizo el
  delegado (usó, editó, descartó), con retención explícita (Fase 8).

## 5. Dominio nuevo que requiere (por paquete)

### 5.1 Afiliación (UI-10b)

Entidad `Membership` ligada a `Contact` (no columnas sueltas en
`contacts`: una persona puede darse de baja y volver, y el histórico
importa para "desde cuándo"). Campos mínimos: `organization_id`,
`contact_id`, `member_number`, `status` (`ACTIVE`/`INACTIVE`),
`started_at`, `ended_at` (nullable), `fee_paid_until` (mes hasta el que
está pagada la cuota; "cuota pendiente" = `ACTIVE` con `fee_paid_until`
anterior al mes en curso — se deriva, no se guarda como tercer estado).
Única activa por Contact. Tests de aislamiento por `organization_id`.

- **Alta y edición manual** (decisión del usuario): formulario en la
  página del Contact (`/contacts/[id]`), no en la ficha de la conversación
  (que sigue siendo de solo lectura). Pueden editarla los ADMIN y los
  delegados que atienden a ese Contact (mismo criterio de visibilidad que
  la ficha). Cada cambio queda en el historial de actividad (`audit`).
- **Facturas de la cuota**: Kindly no genera ni guarda facturas (no hay
  archivos de afiliados; tampoco es el "billing" de Kindly de
  `docs/ARCHITECTURE.md`). Pedir una factura es un **trámite** más
  ("Solicitud de factura de cuota") que el delegado gestiona con el
  sistema de cobro de la organización.

### 5.2 Trámites y documentación, sin guardar archivos (UI-10c)

**Principio (usuario, 2026-09-28): Kindly no almacena archivos de
afiliados.** Sustituye el diseño anterior de `MessageAttachment` con
storage en R2, y el pendiente "imágenes entrantes" de
`project/CURRENT_TASK.md` queda redefinido así:

- **Trámites** (knowledge base, Fase 7): entidad `Procedure` por
  Organization, versionada como el resto del conocimiento — nombre,
  pasos, **documentos requeridos**. Un Caso (o la conversación) puede
  vincularse a un trámite; su estado por documento
  (`required`/`received`, canal y fecha) es lo único que se guarda.
- **Archivo recibido por WhatsApp**: el mensaje guarda solo metadatos
  (tipo, nombre, tamaño, fecha) — ya son parte del `Message`. En la
  burbuja: "Archivo no guardado en Kindly · Descargar". "Descargar" hace
  de **proxy en streaming** hacia la Graph API de Meta con el `media_id`:
  el contenido pasa del proveedor al navegador del delegado sin escribirse
  en disco, en storage, en logs ni en caché. Sin miniatura persistente.
  Solo delegado y ADMIN (control en servidor, no solo en UI); rate limit.
- **A confirmar con la documentación actual de Meta antes de construir**
  (`CLAUDE.md` §3): cuánto tiempo el `media_id` sigue siendo descargable
  (pasado ese plazo, "Descargar" debe decir que ya no está disponible) y
  cuánto conserva Meta el medio en sus servidores.
- **Aviso al afiliado** — tiene que ser **veraz**: Kindly no guarda el
  archivo, pero con coexistence el archivo **sigue en el WhatsApp del
  móvil del delegado**, y Meta lo conserva un tiempo en sus servidores.
  El texto no puede prometer "se borrará" de sitios que Kindly no
  controla. Propuesta: "Kindly no guarda los documentos que envías: tu
  delegado los descarga para tramitarlos y no quedan almacenados en la
  plataforma." Revisión jurídica y reflejo en la política de privacidad
  (`src/app/(public)/privacidad`) antes de producción. Cómo se muestra
  (§7.1).
- **Datos de salud** (un parte de baja, art. 9 RGPD): no guardarlos
  reduce mucho el riesgo, pero Kindly **sí los trata en tránsito** — sigue
  haciendo falta base jurídica y registro de actividades de tratamiento.
- **Email**: cuando exista el email entrante, mismo principio: no se
  guardan adjuntos.

### 5.3 Resumen de situación (UI-10d)

Necesita `LLMProvider` (Fase 8). Se genera en segundo plano al cerrar un
intercambio o al abrir la conversación si está desactualizado; se guarda
con fecha y los ids de los mensajes usados (para "ver en qué mensajes se
basa"). No contiene afirmaciones normativas (eso es del copiloto, con
fuentes). Los datos del cliente no se usan para entrenar modelos
(`CLAUDE.md` §5).

### 5.4 Copiloto (UI-10e)

Necesita Fase 7 (Knowledge: documentos versionados, recuperación con
filtros de tenancy/vigencia) y Fase 8 (AI). Sin conocimiento cargado, el
copiloto puede funcionar solo con contexto de la conversación y la ficha,
pero **sin citar** — y con `EvidenceLevel` acorde.

## 6. Paquetes

| Paquete | Alcance | Depende de |
|---|---|---|
| **PKG-014** (previo) | Un delegado actual por afiliado + histórico; visibilidad por rol en Inbox, Contactos, ficha y descargas; reasignación por ADMIN | Decisión pendiente sobre las conversaciones al reasignar |
| **UI-10a** | Panel de dos columnas + ficha de solo lectura con los datos que ya existen (contacto, identificación movida del `Alert`, notas, casos, tareas, otras conversaciones); plegar ficha con preferencia recordada; pestañas por debajo de `xl`; tokens nuevos; E2E camino feliz | Nada — se puede empezar ya |
| **UI-10b** | `Membership` (dominio, migración, servicio, tests) + alta/edición manual en `/contacts/[id]` + sección Afiliación con avisos de baja y de cuota pendiente | PKG-014 (quién puede editar = delegado asignado + ADMIN) |
| **UI-10c** | Metadatos de adjunto en `Message` + descarga por proxy en streaming sin almacenar + aviso al afiliado + sección "Trámite y documentación" | Trámites (`Procedure`, Fase 7) para la lista de requeridos; confirmar plazos de medios de Meta; texto del aviso revisado |
| **UI-10d** | Resumen de situación | Fase 8 (`LLMProvider`) |
| **UI-10e** | Copiloto dinámico en la conversación | Fases 7 y 8 |
| **UI-10f** | Ficha editable (notas, crear tarea/caso desde la conversación) | Validación visual de UI-10a por el usuario |

Cada paquete cumple la Definition of Done de `CLAUDE.md` §6.

## 7. Preguntas abiertas

Resueltas el 2026-09-28: origen de la afiliación (alta manual), lista de
documentos (trámites en el knowledge base), visibilidad (delegado
asignado y ADMIN, ver PKG-014), entrega del aviso (el delegado lo inserta
y envía; además, política de privacidad).

Queda una, de PKG-014 y no de esta fase: **qué pasa con las
conversaciones al reasignar un afiliado** (ver `docs/DECISIONS.md`,
entrada "Asignación de afiliados", y `project/TASKS.md` PKG-014).

## 8. Criterios de aceptación de la fase

- Abrir una conversación abre chat + ficha en una sola animación; la
  sidebar global nunca cambia; cerrar lo cierra todo.
- Ninguna acción del copiloto envía nada; E2E que lo comprueba (el único
  camino a enviar es el botón Enviar del compositor).
- Toda cita del copiloto enlaza a un `DocumentVersion` real con vigencia.
- Aislamiento multi-tenant probado para `Membership`, trámites y
  resúmenes; test de que la descarga de un adjunto no escribe nada en
  disco/storage y de que un DELEGATE sin relación con el Contact recibe 403.
- Captura visual real a 1280, 1536 y 1920 px y en móvil, comparada con el
  mockup.
