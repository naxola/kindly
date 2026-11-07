# Operación — runbook

Qué hacer cuando algo falla. Decisiones de fondo en el ADR 0008.

## Señales

| Señal                         | De dónde sale                                                | Dónde llega                                   |
| ----------------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| Error no controlado de la web | API (`handleError`), Better Auth, páginas (`onRequestError`) | Sentry/GlitchTip (`SENTRY_DSN`) y log `error` |
| Job en fallo definitivo       | worker, al agotar los reintentos                             | alerta **crítica** al móvil, Sentry y log     |
| Cola que no se vacía          | worker, cada 5 minutos (`QUEUE_MAX_WAIT_SECONDS`, 15 min)    | alerta de **aviso** al móvil                  |
| Web caída o sin base de datos | `GET /api/health` y `GET /api/ready` (BD y cola)             | monitor externo (fase 6)                      |
| Worker caído o sin BD         | `GET /health` y `GET /ready` en `WORKER_HEALTH_PORT` (3002)  | healthcheck del contenedor / monitor (fase 6) |

Cada alerta se envía como mucho **una vez cada 15 minutos por motivo** (por job o por cola), para
no saturar el móvil. Si el canal de alertas falla, queda un log `alert not delivered`.

Ningún evento ni alerta lleva datos personales: los errores llevan `correlationId`,
`organizationId` y el id de negocio del usuario (`users.id`), nunca emails, cookies, cabeceras ni
cuerpos de petición. **El `correlationId` es el hilo**: búscalo en los logs para ver la historia
completa (petición → job → correo/evento).

## Configurar

```bash
# Sentry (sentry.io) o GlitchTip autoalojado: el mismo DSN sirve para web y worker
SENTRY_DSN=https://<clave>@<host>/<proyecto>

# Alertas por ntfy (ntfy.sh o propio). El tema es secreto: quien lo conozca lee las alertas.
ALERT_PROVIDER=ntfy
NTFY_URL=https://ntfy.sh/<tema-largo-y-aleatorio>
NTFY_TOKEN=            # solo si el tema está protegido

# …o por Telegram (bot de @BotFather y el id del chat)
ALERT_PROVIDER=telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Sin `SENTRY_DSN` ni `ALERT_PROVIDER`, todo queda en los logs (nivel `error`/`warn`).

## Un job ha fallado

1. Mira el estado de la cola desde un equipo con acceso a la base de datos:

   ```bash
   pnpm ops:queue
   ```

   Muestra, por cola, los pendientes, activos, fallidos, completados y la espera más antigua, y
   los últimos fallos definitivos con su id, intentos, `correlationId` y mensaje.

2. Busca el `correlationId` en los logs del worker y en Sentry para entender la causa.
3. Corrige la causa (configuración del proveedor de correo, webhook caído, bug…).
4. Reintenta el job:

   ```bash
   pnpm ops:queue retry <cola> <id>
   ```

   Es seguro: los jobs son idempotentes (la clave de idempotencia evita efectos duplicados).

## Una cola no se vacía

La alerta «Queue not draining» significa que hay jobs listos que nadie consume.

1. ¿Está el worker arrancado? `curl http://<worker>:3002/ready` debe responder 200.
2. Si el worker usa `WORKER_QUEUES`, ¿incluye esa cola?
3. ¿Está cada job tardando más de la cuenta (jobs activos que no terminan)? `pnpm ops:queue`.
4. Si el worker reinicia en bucle, revisa sus logs al arrancar: valida la configuración y no
   arranca si falta una variable (el mensaje dice cuál, nunca el valor).

## La web responde 503 en `/api/ready`

La respuesta indica qué falla (`database` o `queue`). La cola de la web solo necesita la base de
datos y las tablas de pg-boss: si falla solo `queue`, comprueba que el despliegue ejecutó
`pnpm queue:install` junto a `pnpm db:deploy`.

## Pendiente

- Errores del navegador (cliente de la web): no se recogen todavía.
- Centralizar los logs (Loki o Better Stack) y el monitor externo: con el despliegue (fase 6).
