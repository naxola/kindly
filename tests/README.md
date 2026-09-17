# tests/README.md — Estrategia de testing

## Herramientas

- **Unit / Integration:** Vitest.
- **E2E:** Playwright.
- **CI:** GitHub Actions, en cada PR y en `main`.

Las APIs externas (WhatsApp, Telegram, OpenAI) siempre se simulan con
mocks/sandboxes en los tests. Ningún test en CI depende de credenciales
reales de un proveedor externo. Las PoC descritas en `docs/INTEGRATIONS.md`
se ejecutan manualmente/exploratoriamente, no como parte de la suite de CI.

## Tipos de test y qué cubren

### Unit tests

- Lógica de dominio de cada módulo (`app/modules/*`).
- Servicios de aplicación.
- Filtros de RAG (hard filters de tenancy y vigencia, `docs/DATABASE.md`
  sección 15) — deben probarse exhaustivamente porque son la barrera contra
  fuga de datos entre organizaciones.
- Reglas de permisos (`ADMIN` vs `DELEGATE`).
- Lógica de idempotencia de mensajes (mismo `external_message_id` no genera
  dos `Message`).

### Integration tests

- Repositorios contra PostgreSQL real (test database, no mocks de SQL).
- `MessagingAdapter` (Telegram/WhatsApp) contra un servidor HTTP simulado que
  reproduce las respuestas y webhooks reales del proveedor.
- Procesamiento de webhooks end-to-end: firma inválida rechazada, evento
  duplicado no duplica `Message`, evento fuera de orden se maneja
  correctamente.
- Servicios de AI contra un `LLMProvider`/`EmbeddingProvider` fake
  determinista (no llamadas reales a OpenAI en CI).

### E2E tests

Como mínimo, estos dos flujos completos:

```
Login → Inbox → Conversation → AI suggestion → Edit → Send
```

```
External message → Webhook → Conversation → Inbox
```

Y, en cuanto exista un canal implementado, el acceptance test específico de
ese canal (ver `docs/INTEGRATIONS.md` y `project/TASKS.md` Fase 4/5):
conectar, recibir, mostrar en Inbox, responder desde Kindly y desde el
móvil, verificar no duplicación, desconexión y reconexión.

## Definition of Done

Una funcionalidad no se considera terminada sin:

1. Unit tests de la lógica de dominio que introduce o modifica.
2. Integration tests si toca PostgreSQL, un `MessagingAdapter` o
   procesamiento de webhooks.
3. Al menos un E2E de camino feliz si añade o cambia un flujo de usuario
   visible (Inbox, conexión de canal, AI Copilot).
4. Todos los tests existentes en verde. Si algo queda roto a propósito
   (por ejemplo, en medio de una migración grande), debe quedar anotado
   explícitamente en `project/CURRENT_TASK.md`, nunca en silencio.
5. Sin secretos ni credenciales reales en fixtures o tests.

## Multi-tenancy: caso de test obligatorio

Cualquier endpoint o query nuevo que toque datos con `organization_id` debe
tener al menos un test que verifique explícitamente que un usuario de la
`Organization` A no puede leer ni escribir datos de la `Organization` B —
incluyendo, cuando aplique, las consultas de RAG.
