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

### 2.2 Limitación real y crítica — leer antes de construir nada

El requisito de producto (sección 5/6 del encargo, y `docs/PRODUCT.md`
sección 5) es: el `DELEGATE` sigue usando su WhatsApp personal/profesional
habitual en el móvil, tal cual, y Kindly sincroniza esa misma conversación
por detrás, sin que el delegado note nada distinto en su app.

Esto **no es compatible sin matices** con cómo funciona la Cloud API:

- Un número registrado en WhatsApp Business Platform (Cloud API) **deja de
  poder usarse como un número normal de WhatsApp/WhatsApp Business App en un
  teléfono**, salvo en el escenario descrito abajo (coexistence). Migrar un
  número a la Cloud API es, por defecto, una migración excluyente: registrar
  el número en la API lo desconecta de cualquier cliente móvil app que
  estuviera usándolo.
- Meta ha lanzado progresivamente una capacidad llamada **coexistence**
  (a veces "WhatsApp Business App + Cloud API coexistence"), pensada
  exactamente para este caso: permite que un número siga usándose en la
  WhatsApp Business App del móvil **a la vez** que una empresa opera sobre él
  vía Cloud API, con sincronización de historial e hilos entre ambos. Esta
  capacidad:
  - solo aplica a números que usan la **WhatsApp Business App** (no la app
    de WhatsApp normal de consumo, "WhatsApp Messenger"), no cualquier
    WhatsApp personal;
  - se activa vía un flujo de Embedded Signup específico para coexistencia,
    no un QR;
  - ha ido desplegándose de forma gradual por mercado/BSP y con límites de
    disponibilidad — **su alcance exacto (países, límites de historial
    sincronizado, límites de mensajes) debe verificarse en el momento de
    construir, no darse por asumido**, porque las plataformas de mensajería
    cambian esto con frecuencia.
- Si el `DELEGATE` usa la app de WhatsApp normal de consumo (no Business App)
  con su número personal, **no existe hoy un mecanismo oficial** para que ese
  mismo número opere simultáneamente vía Cloud API manteniendo la app normal
  operativa tal cual. La alternativa oficial en ese caso es migrar el número
  a Cloud API (perdiendo el uso normal del número en el móvil) o usar un
  número de Cloud API dedicado (rompiendo el requisito de "su número
  habitual").

**Conclusión que no se debe cambiar en silencio:** el requisito "el delegado
sigue usando su WhatsApp habitual sin cambios y Kindly sincroniza por
detrás" solo es alcanzable oficialmente, y con matices, si:

1. el número usa WhatsApp **Business App** (no la app de consumo), y
2. la funcionalidad de coexistence está disponible para esa organización,
   mercado y BSP en el momento de implementar, verificado mediante PoC (ver
   sección 3 de este documento).

Si la PoC confirma que coexistence no está disponible para el caso de uso
real, las alternativas oficiales son (en orden de menor a mayor cambio de
requisito):

- **A. Coexistence limitado**: sí disponible pero con restricciones (ej. solo
  ciertos países/BSP, ventana de sincronización de historial limitada) → se
  documenta la restricción exacta y se decide si es aceptable.
- **B. Número dedicado de Cloud API por delegado**: el delegado obtiene un
  número solo para Kindly (no su número personal), rompiendo parcialmente el
  requisito de "número habitual" pero manteniendo "un número por delegado" y
  toda la sincronización bidireccional vía Cloud API sin restricciones de
  coexistence.
- **C. Número centralizado de la organización**: la alternativa que el
  encargo original prohíbe adoptar en silencio (sección 74.1) — solo se
  adoptaría con decisión explícita del usuario, documentada en
  `docs/DECISIONS.md`, si A y B no son viables para el caso de uso.

Esta decisión **no se toma en este documento**: se toma tras ejecutar la PoC
de la sección 3 y se registra el resultado en `docs/DECISIONS.md`.

### 2.3 Limitación real: no hay QR para conectar Cloud API

Igual que en Telegram, no existe un flujo oficial de "escanear un QR" para
conectar una WABA a Kindly. El mecanismo oficial es **Embedded Signup**: un
flujo de Facebook Login/OAuth embebido que el ADMIN o el DELEGATE completa
para autorizar la WABA y el número. La UX se adapta a
"Connect → Autorización oficial (Embedded Signup) → Connected", no a un QR.

### 2.4 Ventanas de mensajería (24h) y plantillas

WhatsApp Business Platform restringe el envío de mensajes de formato libre a
una ventana de 24 horas desde el último mensaje del Contact. Fuera de esa
ventana solo se pueden enviar plantillas (`message templates`) pre-aprobadas
por Meta. Esto afecta directamente a cualquier flujo donde el profesional
quiera reabrir una conversación fría — debe modelarse en el producto
(aviso en la UI cuando la ventana esté cerrada, gestión de plantillas) antes
de asumir que "responder" siempre funciona igual.

### 2.5 Qué NO se hace

WhatsApp Web automatizado, Puppeteer/Playwright sobre WhatsApp Web,
librerías que emulan el protocolo del cliente (tipo Baileys u otras no
oficiales), sesiones de navegador no oficiales, ingeniería inversa,
almacenamiento de sesiones no oficiales. Ninguna de estas se usa ni como
solución temporal.

## 3. PoC obligatoria antes de construir el resto del sistema alrededor de WhatsApp

Ver también `project/TASKS.md` Fase 0 y `project/CURRENT_TASK.md`.

1. Crear una cuenta/número de prueba apropiado (idealmente ya en WhatsApp
   Business App, para poder probar coexistence).
2. Conectar mediante el mecanismo oficial (Embedded Signup).
3. Enviar un mensaje desde el móvil → comprobar
   `Mobile → Provider → Webhook → Kindly`.
4. Comprobar que Kindly identifica correctamente: Organization, DELEGATE,
   MessagingAccount, Contact, Conversation, Message.
5. Responder desde Kindly → comprobar `Kindly → Provider → Mobile`.
6. Responder desde el móvil → comprobar que aparece en Kindly.
7. Comprobar que no se duplica el mensaje en ningún sentido.
8. Comprobar: delivery status, read status, errores, reintentos, reconexión,
   desconexión, historial, conversaciones existentes.
9. Comprobar el comportamiento real de la ventana de 24h y plantillas.
10. Comprobar qué ocurre al desconectar la cuenta.
11. Comprobar qué ocurre al reconectar.
12. Comprobar qué identificadores permanecen estables entre desconexión y
    reconexión.
13. Documentar cualquier limitación encontrada en `docs/DECISIONS.md`.
14. Si el requisito fundamental (sección 2.2) no es posible tal cual: no
    cambiar el requisito en silencio. Explicar qué parte no es posible, por
    qué, qué alternativa oficial existe (A/B/C de la sección 2.2), y qué
    parte de la experiencia de producto cambiaría.

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
