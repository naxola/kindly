# INTEGRATIONS.md — WhatsApp, Telegram, LLM, embeddings, storage

Regla general (ver `CLAUDE.md` sección 3): antes de construir sobre una
capacidad de un proveedor externo, se verifica que esa capacidad existe
**hoy**, oficialmente, y se documenta aquí con su limitación real. No se usan
APIs no oficiales para simular una capacidad que la plataforma no ofrece.

## 1. Telegram

### 1.1 Mecanismo oficial a usar

**Telegram Business — Connected Business Bots.** Un usuario con Telegram
Business (Premium) puede conectar un bot a su cuenta desde
`Ajustes → Telegram Business → Chatbots`. Una vez conectado, Telegram envía al
bot actualizaciones `business_connection` y `business_message` /
`edited_business_message` / `deleted_business_messages`, y el bot puede
enviar mensajes en nombre del usuario dentro de esa conexión
(`business_connection_id`). Los mensajes enviados así aparecen también en la
app normal de Telegram del propio usuario — que es exactamente la propiedad
de sincronización que pide el producto.

Conceptos técnicos a modelar:

```
business_connection_id
telegram_user_id
external_connection_id
permissions            -- lo que el usuario autorizó al bot (leer, escribir, etc.)
```

y los eventos: `business_connection` (alta/baja/cambio de permisos),
`business_message`, `edited_business_message`, `deleted_business_messages`.

### 1.2 Limitación real: no hay QR ni OAuth iniciado por Kindly

El flujo de conexión **no lo controla Kindly**. No existe un mecanismo
oficial de "Kindly muestra un QR y el usuario lo escanea con Telegram" para
conectar un Connected Business Bot, ni un OAuth redirect. El flujo real es:

```
1. Kindly (o el ADMIN) crea/gestiona un bot vía BotFather (uno por
   organización, o uno compartido — a decidir, ver docs/DECISIONS.md).
2. El DELEGATE, dentro de SU PROPIA app de Telegram, va a
   Settings → Telegram Business → Chatbots y añade el username del bot.
3. Telegram envía a Kindly (webhook del bot) el evento `business_connection`
   con el business_connection_id recién creado.
4. Kindly asocia ese business_connection_id al DELEGATE y crea/activa su
   MessagingAccount.
```

Kindly puede facilitar el paso 2 con instrucciones claras y un deep link
(`https://t.me/<bot_username>`) que abre el chat con el bot, pero **la
conexión final ocurre dentro de la app de Telegram del usuario, no en una
pantalla de Kindly con QR**. La UX "Connect → Scan QR → Connected" descrita
en el encargo original no aplica tal cual aquí: se sustituye por
"Connect → Abrir Telegram y añadir el bot → Kindly detecta la conexión". Esto
se documenta como decisión en `docs/DECISIONS.md`, no como incumplimiento
silencioso.

### 1.3 Requisito de Telegram Premium

Connected Business Bots requiere que el usuario de Telegram tenga Telegram
Business, lo cual requiere Telegram Premium (o una cuenta Business asociada).
Esto es una restricción real que afecta a la adopción: cada `DELEGATE` que
quiera conectar Telegram necesita esa suscripción. Se documenta como
limitación de producto, no se oculta.

### 1.4 Qué NO se hace

Telegram Web automatizado, sesiones MTProto de usuario no oficiales
(librerías tipo user-bot con `api_id`/`api_hash` actuando como si fueran el
propio usuario), scraping, o cualquier mecanismo que no sea la Bot API oficial
con Business Bots.

## 2. WhatsApp

### 2.1 Mecanismo oficial a usar

WhatsApp Business Platform (Cloud API) de Meta, vía Embedded Signup (OAuth de
Facebook Login para autorizar la WABA — WhatsApp Business Account) y
webhooks oficiales.

### 2.2 Coexistence — mecanismo adoptado, y sus límites reales

> **Estado: decidido el 2026-09-19** (ver `docs/DECISIONS.md`). Este apartado
> describía antes un riesgo sin resolver; ahora describe el mecanismo elegido.
> Las alternativas B y C del final se conservan como plan de repliegue, no
> como opciones abiertas.

El requisito de producto (`docs/PRODUCT.md` sección 5) es: el `DELEGATE` sigue
usando su WhatsApp habitual en el móvil, tal cual, y Kindly sincroniza esa
misma conversación por detrás. Eso **es alcanzable oficialmente** mediante
**coexistence**, disponible en producción desde mayo de 2025.

Registrar un número en Cloud API es, por defecto, una migración excluyente: lo
desconecta del móvil. Coexistence es la excepción diseñada exactamente para
este caso — el número sigue operativo en la **WhatsApp Business App** del
delegado **a la vez** que Kindly opera sobre él vía Cloud API, con historial e
hilos sincronizados en ambos sentidos.

#### Condiciones de entrada (no negociables, son de Meta)

- El número debe estar en **WhatsApp Business App** 2.24.17 o superior. **No
  vale la app de WhatsApp normal de consumo** ("WhatsApp Messenger"): si el
  delegado usa esa, no hay coexistence posible para su número.
- El número **no puede estar ya registrado solo en Cloud API**.
- El número debe añadirse al **Meta Business Manager de la organización**.
- **Kindly debe ser Tech Provider o Solution Partner de Meta**, estar ya usando
  Cloud API e implementar Embedded Signup **con session logging**. Esto es un
  alta nuestra ante Meta, no trabajo de código, y es el camino crítico real de
  la Fase 5.
- Para coexistence **no sirve la verificación de negocio clásica**: solo
  Partner-Led Business Verification o Meta Verified. **No hay cuenta oficial
  (badge azul)** para estos números.

#### Qué implica técnicamente

El alta se hace con Embedded Signup emitiendo el evento
`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, y **saltándose el registro del
número** (por eso sigue vivo en el móvil). Hay que suscribirse a **tres**
webhooks, no a uno:

```
history              -- mensajes pasados (sincronización inicial)
smb_app_state_sync   -- contactos: alta inicial y altas/ediciones/bajas
smb_message_echoes   -- mensajes que el delegado envía desde SU móvil
```

Cuatro consecuencias que afectan al diseño del dominio, no solo a la UI:

1. **Eco de salientes.** Todo mensaje enviado desde la Business App vuelve
   como `smb_message_echoes`. El dominio necesita un tipo de evento
   "saliente que Kindly no originó" (hoy `NormalizedInboundEvent` en
   `src/modules/messaging/adapter.ts` solo tiene `MESSAGE` y
   `DELIVERY_UPDATE`), y es el principal riesgo de duplicación.
2. **Plazo duro de 24 h.** Tras el onboarding hay 24 horas para sincronizar el
   historial o el cliente debe ser dado de baja. Requiere trabajo en background
   reintentable, no el `after()` que usa hoy la ruta de webhooks.
3. **Historial acotado.** 180 días, solo chats 1:1 (sin grupos), en tres fases
   (día 0-1, 1-90, 90-180). Adjuntos solo de los últimos 14 días.
4. **Desconexión no controlada por nosotros.** Para números en coexistence
   **no se puede usar la Deregister API**: el delegado se desconecta a mano
   desde su móvil y nos enteramos por `account_update` con `PARTNER_REMOVED`.
   El `disconnectAccount` del adapter no tiene equivalente real en este canal.

#### Qué pierde el delegado en su móvil

Debe advertirse **antes** de conectar, no después: se desactivan mensajes
temporales, "ver una vez", ubicación en directo y listas de difusión; y
WhatsApp para Windows y WearOS **se desvinculan** durante el onboarding.

#### Coste

Los mensajes enviados desde la Business App del móvil siguen siendo gratis.
Los enviados vía Cloud API — los que salgan del Inbox de Kindly — se facturan
a tarifa Cloud API normal. El flujo de activación debe advertirlo.

#### Sin verificar todavía (no asumir al implementar)

- **Lista de países/regiones no soportados.** Existen restricciones
  regionales, pero no se localizó la lista oficial enumerada. Se consulta la
  fuente oficial al implementar; **no se copia de un blog ni se hardcodea**.
- **Throughput.** Meta documenta 20 mensajes/segundo fijos para números en
  coexistence; un BSP documenta 5. Discrepancia sin resolver.

#### Plan de repliegue (solo si el alta como Tech Provider resultara inviable)

- **B. Número dedicado de Cloud API por delegado**: rompe parcialmente el
  requisito de "número habitual", mantiene "un número por delegado".
- **C. Número centralizado de la organización**: prohibido adoptarlo en
  silencio (sección 74.1 del encargo). Requiere decisión explícita del usuario
  registrada en `docs/DECISIONS.md`.

### 2.3 Limitación real: no hay QR para conectar Cloud API

Igual que en Telegram, no existe un flujo oficial de "escanear un QR" para
conectar una WABA a Kindly. El mecanismo oficial es **Embedded Signup**: un
flujo de Facebook Login/OAuth embebido que el ADMIN o el DELEGATE completa
para autorizar la WABA y el número. La UX se adapta a
"Connect → Autorización oficial (Embedded Signup) → Connected", no a un QR.

Desde abril de 2026 Embedded Signup es además la vía **por defecto** para
altas nuevas. **Embedded Signup v2 se depreca el 8 de octubre de 2026**:
Kindly no tiene implementación previa, así que se implementa **v4
directamente** — cuidado con tutoriales y ejemplos desactualizados.

### 2.4 Ventanas de mensajería (24h) y plantillas

WhatsApp Business Platform restringe el envío de mensajes de formato libre a
una ventana de 24 horas desde el último mensaje del Contact. Fuera de esa
ventana solo se pueden enviar plantillas (`message templates`) pre-aprobadas
por Meta. Esto afecta directamente a cualquier flujo feliz donde el profesional
quiera reabrir una conversación fría — debe modelarse en el producto
(aviso en la UI cuando la ventana esté cerrada, gestión de plantillas) antes
de asumir que "responder" siempre funciona igual.

**Con coexistence hay un matiz contraintuitivo que empeora esto:** los
mensajes que el delegado envía **desde su propio móvil no abren ni extienden**
la ventana de servicio de Cloud API. Solo la abre un mensaje entrante del
usuario a la cuenta ya onboardeada. Es decir: el delegado puede estar viendo
un hilo perfectamente vivo en su teléfono mientras el Inbox de Kindly le dice
que no puede responder en texto libre. La UI de composición debe explicar esa
situación concreta, no limitarse a deshabilitar el campo.

### 2.5 Qué NO se hace

WhatsApp Web automatizado, Puppeteer/Playwright sobre WhatsApp Web,
librerías que emulan el protocolo del cliente (tipo Baileys u otras no
oficiales), sesiones de navegador no oficiales, ingeniería inversa,
almacenamiento de sesiones no oficiales. Ninguna de estas se usa ni como
solución temporal.

## 3. PoC obligatoria antes de construir el resto del sistema alrededor de WhatsApp

Ver también `project/TASKS.md` Fase 0 y `project/CURRENT_TASK.md`.

> **Reenfocada el 2026-09-19** (ver `docs/DECISIONS.md`). La pregunta original
> era "¿existe coexistence?" — ya está respondida: sí, y se adopta (sección
> 2.2). La PoC ya no decide *si* el requisito es posible, sino que verifica
> que funciona para nuestro caso concreto antes de construir el adapter.

**Paso 0, bloqueante y no técnico:** conseguir el alta de Kindly como **Tech
Provider o Solution Partner de Meta**, con Cloud API activo y la verificación
de negocio válida para coexistence (Partner-Led o Meta Verified, nunca la
clásica). Sin esto no hay nada que probar. Es el camino crítico de la Fase 5.

1. Preparar un número de prueba **ya en WhatsApp Business App** (2.24.17+), no
   registrado previamente en Cloud API, y añadido al Business Manager.
2. Conectar mediante **Embedded Signup v4** con el evento
   `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, saltando el registro del número.
3. Comprobar que las tres suscripciones de webhook llegan de verdad:
   `history`, `smb_app_state_sync`, `smb_message_echoes`.
4. Sincronizar el historial **dentro del plazo de 24 h** y comprobar las tres
   fases (día 0-1, 1-90, 90-180), qué llega y qué no (grupos excluidos,
   adjuntos solo de 14 días).
5. Enviar un mensaje desde el móvil → comprobar
   `Mobile → Provider → Webhook → Kindly` vía `smb_message_echoes`.
6. Comprobar que Kindly identifica correctamente: Organization, DELEGATE,
   MessagingAccount, Contact, Conversation, Message.
7. Responder desde Kindly → comprobar `Kindly → Provider → Mobile`.
8. **Comprobar que un mensaje enviado desde Kindly no vuelve duplicado como
   eco** — el riesgo de duplicación principal de este canal.
9. Comprobar el comportamiento real de la ventana de 24 h, y específicamente
   que un mensaje enviado desde el móvil **no** la abre ni la extiende.
10. Comprobar delivery status, read status, errores, reintentos.
11. Comprobar la desconexión: hacerla **desde el móvil** (no hay Deregister
    API) y verificar que llega `account_update` con `PARTNER_REMOVED`.
12. Comprobar la reconexión y qué identificadores permanecen estables entre
    desconexión y reconexión.
13. Verificar la lista real de países/regiones no soportados en la fuente
    oficial, y el throughput real (Meta documenta 20 mps; un BSP dice 5).
14. Documentar cualquier limitación encontrada en `docs/DECISIONS.md`.

Si algo de lo anterior resulta no ser viable, aplica la misma regla de
siempre: no se cambia el requisito en silencio. Se explica qué parte falla,
por qué, y se evalúa el plan de repliegue (B/C de la sección 2.2).

La misma disciplina de PoC aplica a Telegram (Fase 0), aunque el riesgo ahí es
menor porque Connected Business Bots ya está diseñado exactamente para este
caso de uso.

## 4. LLM y Embeddings

Abstracciones `LLMProvider` y `EmbeddingProvider` (ver `docs/ARCHITECTURE.md`
sección 10). Proveedor inicial: OpenAI. El código no debe acoplarse a
detalles específicos de OpenAI en el dominio — el módulo `ai/` habla contra la
interfaz, no contra el SDK del proveedor directamente.

Reglas de producto que estas abstracciones deben respetar (ver
`docs/PRODUCT.md` sección 10):

- Salida siempre estructurada (`AISuggestion`), nunca texto libre a parsear.
- `EvidenceLevel` con tres valores (`SUFFICIENT`/`PARTIAL`/`INSUFFICIENT`),
  nunca un porcentaje de confianza.
- Ninguna fuente citada que no exista como objeto real en la base de
  conocimiento (`AISource` trazable a `Document`/`DocumentVersion`).
- El RAG aplica los hard filters de tenancy y vigencia antes de la búsqueda
  semántica (ver `docs/DATABASE.md` sección 15).

## 5. Object storage

S3-compatible, por ejemplo Cloudflare R2. Usado para documentos de la base de
conocimiento y adjuntos de conversación. Control de acceso a documentos
obligatorio (nunca URLs públicas permanentes sin control para contenido
privado de una organización).

## 6. Verificación de webhooks

Todo webhook (WhatsApp, Telegram) se valida por firma/secreto antes de
procesar, según el mecanismo oficial de cada proveedor (X-Hub-Signature para
Meta, secret token de Telegram). Ver `docs/ARCHITECTURE.md` sección 7 para el
pipeline completo.
