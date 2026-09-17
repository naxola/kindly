# CLAUDE.md — Reglas permanentes para Claude Code en Kindly

Este archivo se lee siempre, en cada sesión. Contiene las reglas que no cambian
de una tarea a otra. Todo lo que cambia con frecuencia (qué se está haciendo
ahora, qué queda pendiente) vive en `project/`, no aquí.

## 0. Qué es este repositorio

Kindly es un SaaS multi-tenant (CRM + bandeja unificada + casos + base de
conocimiento + AI Copilot) descrito completo en `docs/PRODUCT.md`,
`docs/ARCHITECTURE.md`, `docs/DATABASE.md` e `docs/INTEGRATIONS.md`.
`docs/DECISIONS.md` recoge por qué se decidió cada cosa importante y qué
riesgos/contradicciones se identificaron en el encargo original.

Antes de tocar código nuevo, lee (en este orden):

1. `project/CURRENT_TASK.md` — qué toca ahora mismo.
2. `docs/DECISIONS.md` — restricciones ya validadas, no las repitas ni las
   contradigas sin registrar una nueva decisión.
3. El doc de `docs/` relevante al módulo que vas a tocar.

## 1. Idioma

- Conversación con el usuario y documentación (`docs/`, `project/`): **español**.
- Código, nombres de variables/funciones/tablas, commits, comentarios en
  código: **inglés**. Es la convención estándar del ecosistema (Next.js,
  Drizzle, etc.) y evita mezclar idiomas dentro del propio código.

## 2. Principios de arquitectura que no se rompen

Estos tres son innegociables salvo decisión explícita del usuario registrada
en `docs/DECISIONS.md` (ver sección 74 del encargo original):

1. **Identidad de comunicación del profesional.** Cada `DELEGATE` usa su
   propia cuenta de WhatsApp/Telegram. Kindly sincroniza, no sustituye ni
   centraliza en un número/cuenta de la organización, salvo que una
   limitación real de la plataforma lo obligue y quede documentada en
   `docs/DECISIONS.md` con la alternativa aceptada explícitamente.
2. **La AI es copiloto, nunca autoenvía.** Ninguna funcionalidad debe permitir
   que una respuesta generada por AI llegue al Contact sin que un humano la
   revise, edite o acepte explícitamente. Esto aplica también a tareas y
   automatizaciones futuras.
3. **Conocimiento normativo verificable.** Toda sugerencia de la AI basada en
   normativa/documentación debe incluir fuente real, versión, vigencia y
   `EvidenceLevel`. Nunca se inventan citas ni se afirma algo que la fuente
   recuperada no dice.

Además:

- Aislamiento multi-tenant por `organization_id` desde el primer commit. Nunca
  un query que devuelva filas de otra `Organization` "por descuido" (sin
  filtro explícito o sin RLS).
- No introducir infraestructura (microservicios, Elasticsearch, vector DB
  externa, Kubernetes, colas complejas) sin una necesidad concreta y
  documentada. Ver `docs/ARCHITECTURE.md` sección "No construir todavía".
- No acoplar el dominio a un proveedor externo concreto (WhatsApp, Telegram,
  OpenAI). Siempre a través de las abstracciones `MessagingAdapter`,
  `LLMProvider`, `EmbeddingProvider`.

## 3. Antes de implementar una integración externa

Sigue siempre esta secuencia (ver `docs/DECISIONS.md` para lo ya validado):

1. Comprueba si la funcionalidad depende de una capacidad real y **actual**
   de la API del proveedor (no supongas, no extrapoles del prompt original).
2. Si la capacidad no está confirmada, dilo explícitamente y propara una PoC
   o pregunta al usuario antes de construir el resto del sistema alrededor de
   esa hipótesis.
3. Nunca sustituyas una limitación real por una solución no oficial
   (scraping, WhatsApp Web automatizado, sesiones no oficiales) para
   "aparentar" que el requisito se cumple.
4. Si una limitación obliga a cambiar un requisito de producto, no lo cambies
   en silencio: para, explica la limitación, propone alternativas oficiales, y
   registra la decisión final en `docs/DECISIONS.md`.

## 4. Cómo trabajar por paquetes (flujo de sesión)

Cada sesión de trabajo debe:

1. Leer `project/CURRENT_TASK.md`.
2. Trabajar únicamente ese paquete (no adelantar trabajo de otras fases salvo
   que sea trivial y esté claramente relacionado).
3. Al terminar (o al final de la sesión aunque no haya terminado):
   - Actualizar `project/CURRENT_TASK.md` con el estado real (qué se hizo, qué
     falta, próximos pasos concretos).
   - Actualizar `project/TASKS.md` marcando lo completado.
   - Actualizar `project/PROGRESS.md` si cambió el estado de una fase.
   - Si se tomó una decisión de arquitectura no trivial, añadir entrada nueva
     en `docs/DECISIONS.md` (nunca borrar entradas anteriores, solo
     superseder).
4. No dejar el repositorio con tests rotos ni con un estado a medias sin
   dejarlo explícitamente anotado en `CURRENT_TASK.md`.

## 5. Seguridad (no negociable)

- Nunca secretos en frontend, logs, respuestas de API, código fuente o Git.
  `credentials_reference` apunta a un almacén seguro, no contiene el secreto.
- Todo webhook entrante se valida por firma antes de procesar.
- Todo endpoint que toque datos de una `Organization` debe filtrar por
  `organization_id` explícitamente (defensa en profundidad, incluso con RLS).
- Rate limiting en endpoints públicos y en el envío de mensajes salientes.
- Validación de archivos subidos (tipo, tamaño, contenido).
- No se usan datos de clientes para entrenar modelos salvo configuración
  explícita y jurídicamente revisada.

## 6. Testing — Definition of Done

Ninguna funcionalidad se considera terminada sin (ver `tests/README.md` para
el detalle):

- Unit tests de la lógica de dominio afectada (servicios, permisos, filtros
  de RAG, idempotencia).
- Integration tests si toca PostgreSQL, un `MessagingAdapter` o el
  procesamiento de webhooks.
- Para flujos de usuario completos (Inbox, conexión de canal, AI Copilot):
  al menos un E2E que cubra el camino feliz.
- APIs externas simuladas con mocks/sandboxes, nunca tests que dependan de
  credenciales reales de WhatsApp/Telegram/OpenAI en CI.

## 7. Stack de referencia

Ver `docs/ARCHITECTURE.md` para el detalle completo. Resumen:

Next.js + TypeScript + React + Tailwind + shadcn/ui · PostgreSQL + pgvector ·
Drizzle ORM · Better Auth · pg-boss/Inngest para jobs · Redis (opcional,
introducir solo cuando haga falta) · S3-compatible storage (Cloudflare R2) ·
Sentry + OpenTelemetry · Vitest + Playwright · Docker + GitHub Actions.

## 8. Qué no construir todavía

Microservicios, Kubernetes, Elasticsearch/OpenSearch, vector DB externa, apps
móviles nativas, respuestas automáticas de la AI, motor de workflows
complejo, billing avanzado, analítica avanzada, sistemas de permisos
elaborados más allá de ADMIN/DELEGATE, decenas de proveedores de mensajería,
integraciones no oficiales de WhatsApp. Ver justificación en
`docs/ARCHITECTURE.md`.
