# CURRENT_TASK.md — Paquete activo

> Este es el archivo más importante para retomar el trabajo entre sesiones o
> con otro modelo. Se actualiza al terminar cada sesión, haya terminado o no
> el paquete.

## Fase activa

**Fase 0 — Validación técnica (PoC de mensajería).**

## Por qué esto y no el CRM primero

El encargo original es explícito (sección 75, prioridad absoluta): validar
las integraciones de mensajería antes de construir el CRM alrededor de ellas,
porque el modelo de `MessagingAccount`/`Conversation` depende de lo que las
plataformas realmente permiten. En particular, WhatsApp tiene un riesgo real
identificado en `docs/DECISIONS.md` (identidad de comunicación del delegado)
que puede afectar al diseño del núcleo. Ver `docs/INTEGRATIONS.md`.

## Qué hacer ahora mismo

1. **PoC Telegram** (riesgo bajo, hacerla primero para tener un End-to-end
   completo pronto):
   - Crear un bot con BotFather.
   - Con una cuenta de Telegram Business real (o crear una de prueba con
     Premium), conectar el bot desde
     `Settings → Telegram Business → Chatbots`.
   - Montar un endpoint mínimo que reciba `getUpdates`/webhook y loguear los
     eventos `business_connection`, `business_message`.
   - Enviar un mensaje desde el móvil del usuario de prueba al propio
     usuario (simulando un Contact) y verificar que el bot lo ve.
   - Responder vía la API usando `business_connection_id` y verificar que
     aparece en la app de Telegram del usuario.
   - Responder desde la app de Telegram y verificar que el bot lo recibe.
   - Probar desconexión/reconexión del bot y anotar si
     `business_connection_id` se mantiene o cambia.
   - Documentar todo el resultado en `docs/DECISIONS.md` (nueva entrada).

2. **PoC WhatsApp** (riesgo alto — el resultado puede cambiar el diseño):
   - Seguir literalmente los pasos de `docs/INTEGRATIONS.md` sección 3.
   - Prestar especial atención al paso de "coexistence": confirmar si el
     número de prueba puede seguir usándose en WhatsApp Business App del
     móvil mientras Kindly opera vía Cloud API, y qué limitaciones reales
     tiene (país, historial sincronizado, mensajes).
   - Si coexistence no está disponible o tiene limitaciones serias: **no
     seguir construyendo** el `WhatsAppAdapter` en serio. Parar, documentar
     la limitación en `docs/DECISIONS.md` con las alternativas A/B/C de
     `docs/INTEGRATIONS.md` sección 2.2, y plantear la decisión al usuario
     antes de continuar.

3. Al completar ambas PoC (o si hay que parar por una limitación real):
   - Añadir entrada(s) en `docs/DECISIONS.md` con el resultado.
   - Actualizar `project/TASKS.md` (marcar checkboxes de Fase 0).
   - Actualizar `project/PROGRESS.md`.
   - Actualizar este archivo con la siguiente fase activa (normalmente
     Fase 1 — Foundation, que puede empezar en paralelo si se prefiere, ya
     que no depende del resultado de la PoC de WhatsApp).

## Nota

Fase 1 (Foundation: Next.js, auth, organizations, tenant isolation) **no
depende** del resultado de la PoC de WhatsApp y se puede empezar en paralelo
si el usuario prefiere no bloquear todo el proyecto en la validación de
mensajería. Si se decide así, hay que anotarlo aquí explícitamente y mantener
dos frentes de trabajo claros en las próximas sesiones.

## Estado

Nada implementado todavía. Repositorio recién creado con la estructura de
documentación (`CLAUDE.md`, `docs/`, `project/`, `tests/README.md`). Ningún
commit todavía en Git.
