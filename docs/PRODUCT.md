# PRODUCT.md — Qué es Kindly

## 1. Visión

Kindly es una plataforma SaaS multi-tenant que combina CRM, gestión de
contactos, bandeja de entrada unificada, gestión de conversaciones, gestión de
casos, tareas y seguimiento, canales de comunicación externos, base de
conocimiento, AI Copilot y RAG sobre normativa, documentación y conocimiento
interno, con historial y auditoría completos.

Está pensado para profesionales que gestionan relaciones con personas,
conversaciones y casos (por ejemplo, gestorías, despachos, consultorías).

No es "CRM + chatbot". El núcleo del producto es esta cadena:

```
Canal de comunicación → Contact → Conversation → Case → Contexto relevante
→ AI Copilot → respuesta revisada por una persona → envío → seguimiento → historial
```

La plataforma ayuda al profesional a gestionar mejor su relación con el
Contact, **pero no lo sustituye como interlocutor**.

## 2. Principio fundamental

El profesional mantiene la relación con el Contact. La AI:

- analiza la conversación;
- identifica el problema;
- recupera información relevante;
- consulta normativa y documentación;
- propone respuestas;
- cita las fuentes;
- identifica información que falta;
- advierte de posibles riesgos;
- ayuda a crear tareas o siguientes pasos.

**La AI nunca envía automáticamente una respuesta al Contact en el MVP.** El
usuario siempre puede: revisar la sugerencia, editarla, aceptarla,
descartarla, escribir su propia respuesta, y enviar manualmente. Ver
[[kindly-ai-copilot-no-autosend]] en memoria y sección 2 de
`docs/DECISIONS.md`.

## 3. Roles

- **ADMIN**: gestiona la organización, miembros, canales, contactos,
  conversaciones, casos, conocimiento, configuración; reasigna conversaciones
  y canales.
- **DELEGATE**: profesional que gestiona directamente contactos,
  conversaciones y casos. Puede tener uno o varios `MessagingAccount` propios.

Un `User` puede iniciar sesión en Kindly. Un `OrganizationMember` conecta un
`User` con una `Organization` y le asigna uno de estos dos roles. No hay más
roles en el MVP.

## 4. Contacts

Un `Contact` representa a una persona con la que la organización tiene una
relación. **No es un usuario de Kindly** (no tiene login).

- Un `Contact` puede tener varias `Conversation`, en distintos canales
  (WhatsApp, Telegram, y en el futuro email, SMS).
- Un `Contact` puede tener múltiples `Case`.
- Un `Contact` puede ser atendido por distintos `DELEGATE`.
- Los teléfonos se almacenan en formato E.164 (`+34600111222`), pero **el
  teléfono nunca es el identificador técnico de la integración** — eso lo dan
  los identificadores externos de cada proveedor (ver `docs/DATABASE.md` y
  `docs/INTEGRATIONS.md`).
- No se asume `one Contact = one phone number = one Conversation`. Un mismo
  Contact puede tener conversaciones en paralelo por distintos canales.
- El sistema debe minimizar duplicados, pero no debe fusionar automáticamente
  dos identificadores externos distintos asumiendo que son la misma persona.
  Debe existir (fase posterior al MVP core) detección de posibles duplicados
  y fusión manual/asistida.
- Un mensaje de un Contact desconocido no se pierde: entra como
  `Contact → Unassigned` y aparece igualmente en el Inbox. Un profesional
  puede después identificarlo, crear un Contact nuevo, fusionarlo o asignarlo.

## 5. Delegates y canales propios (requisito central del producto)

Cada `DELEGATE` usa **su propia identidad de comunicación** (su número de
WhatsApp, su cuenta de Telegram). Kindly actúa como capa de gestión y
sincronización detrás de esas identidades, no como un canal centralizado de
empresa.

Objetivo de experiencia:

1. el profesional recibe mensajes en su app móvil habitual;
2. los recibe también en Kindly;
3. puede responder desde el móvil;
4. puede responder desde Kindly;
5. existe una única conversación canónica (no se duplica por venir de un
   lado u otro);
6. ambas direcciones quedan sincronizadas.

Este es uno de los tres principios de producto que no se rompen (ver
`docs/DECISIONS.md`, sección "Identidad de comunicación"). Cuando una
plataforma no permite exactamente esto, se documenta la limitación y se
decide la alternativa explícitamente — nunca se sustituye en silencio por un
número/cuenta centralizado de la organización.

## 6. Unified Inbox

Pantalla principal del producto. Muestra por cada fila: Contact, Conversation,
canal, último mensaje, timestamp, estado, DELEGATE asignado, Case relacionado,
prioridad (si se implementa) e indicadores de no leídos.

Cuando el profesional responde, **no elige el canal manualmente**. El sistema
lo determina automáticamente:

```
Conversation → MessagingAccount → MessagingAdapter → envío
```

## 7. Conversation vs. Case

Son conceptos distintos:

- **Conversation**: el canal de comunicación concreto (WhatsApp, Telegram...)
  entre un Contact y una identidad de comunicación (MessagingAccount).
- **Case**: un asunto que necesita gestión.

Relación N:M vía tabla intermedia `conversation_cases`: un Contact puede tener
varios Cases, y un Case puede estar relacionado con varias Conversations. La
conversación original se mantiene intacta cuando se abre un Case a partir de
ella.

Estados de Case (MVP, sin workflow complejo): `OPEN`, `IN_PROGRESS`,
`WAITING`, `RESOLVED`, `CLOSED`.

## 8. Tasks

Seguimiento relacionable con Contact, Conversation, Case o User. Ejemplos:
llamar al Contact, pedir un documento, revisar normativa, hacer seguimiento,
enviar información. La AI puede sugerir tareas, pero **no las ejecuta
automáticamente** en el MVP.

## 9. Activity history

Historial de actividad para poder reconstruir qué ocurrió en una relación:
mensajes recibidos/enviados, creación/asignación de casos, tareas creadas y
completadas, sugerencias de AI generadas/aceptadas/editadas/rechazadas,
conexión/desconexión de canales, etc. Ver lista completa en
`docs/DATABASE.md`.

## 10. AI Copilot

Cuando un profesional abre una conversación, puede preguntar "¿Cómo debería
responder?". La AI analiza: mensajes recientes, contexto de la Conversation,
Contact, Case, tareas, documentación y normativa relevante, y conocimiento
interno de la organización.

La respuesta siempre incluye:

- **Issue**: qué problema se ha identificado.
- **Suggested response**: propuesta de respuesta.
- **Evidence level**: `SUFFICIENT`, `PARTIAL` o `INSUFFICIENT` (nunca un
  porcentaje de confianza — sección 29 del encargo original y
  `docs/DECISIONS.md`).
- **Sources**: citas trazables a documentos/versiones reales.
- **Warnings**: riesgos detectados.
- **Missing information**: qué falta para dar una respuesta más segura.

La AI nunca inventa fuentes, artículos, fechas o jurisprudencia. Las citas
siempre proceden de objetos reales de la base de conocimiento.

## 11. Base de conocimiento

Dos ámbitos, estrictamente separados y nunca cruzados entre organizaciones:

- **Public/global knowledge**: leyes, reglamentos, convenios, guías
  oficiales, procedimientos oficiales — visible para todas las
  organizaciones.
- **Organization knowledge**: manuales, protocolos, procedimientos internos,
  plantillas — privado de cada `Organization`.

La información normativa está versionada (`DocumentVersion` con
`effective_from`/`effective_until`/`status`), porque el documento vigente hoy
no es necesariamente el aplicable a una fecha pasada relevante para el caso.

## 12. Flujo principal del producto

```
Contact envía mensaje → Messaging Provider → Webhook → Kindly
→ MessagingAccount → Contact → Conversation → Message → Inbox
→ Profesional abre la conversación → AI Copilot
→ Recuperación de conocimiento relevante → Sugerencia + citas
→ Profesional revisa → Profesional envía → Messaging Provider → Contact
```

## 13. Flujo de Case

```
Conversation → Create Case → Assign DELEGATE → Research → AI Copilot
→ Knowledge/Regulation → Response → Task/Follow-up → Resolved
```

## 14. Tres principios de producto que no se rompen

1. **Identidad de comunicación del profesional** (sección 5 de este
   documento).
2. **AI como copiloto**, nunca sustituye al profesional, nunca autoenvía en
   el MVP.
3. **Información normativa verificable**: toda respuesta sobre normativa
   incluye fuente + versión + contexto aplicable + evidence level.

Cualquier cambio a estos tres principios requiere decisión explícita del
usuario, registrada en `docs/DECISIONS.md`.
