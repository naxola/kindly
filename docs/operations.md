# Operación — runbook

Qué hacer cuando algo falla. Decisiones de fondo en el ADR 0008.

## Señales

| Señal                         | De dónde sale                                                | Dónde llega                                   |
| ----------------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| Error no controlado de la web | API (`handleError`), Better Auth, páginas (`onRequestError`) | Sentry/GlitchTip (`SENTRY_DSN`) y log `error` |
| Error del navegador           | Excepciones no capturadas y páginas de error del cliente     | Sentry/GlitchTip (`SENTRY_BROWSER_DSN`)       |
| Job en fallo definitivo       | worker: al agotar reintentos y, cada 5 min, los que expiran  | alerta **crítica** al móvil, Sentry y log     |
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
# Errores del navegador (opcional; público por diseño; vacío: no se recogen). Puede ser el mismo
# proyecto o uno aparte; sin cookies, formularios ni fragmentos de URL (ADR 0008, enmienda)
SENTRY_BROWSER_DSN=https://<clave>@<host>/<proyecto>

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
   **Excepción: los cobros** (`billing.charge-period`), que no son idempotentes en el proveedor.
   Ver la sección siguiente.

## Un cobro ha fallado o está en `CHARGING` (ADR 0014)

El cobro del excedente de un periodo cerrado pasa por `PENDING_CHARGE` → `CHARGING` → `CHARGED`.
`CHARGING` se guarda **antes** de llamar al proveedor. Nunca se reintenta solo.

| Estado          | Qué significa                                                              | Qué hacer                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHARGE_FAILED` | El proveedor devolvió un error (o faltaba configuración): **no se cobró**. | Corrige la causa (p. ej. suscripción impagada) y `pnpm ops:queue retry billing.charge-period <id>`.                                                 |
| `CHARGING`      | **Resultado desconocido**: puede haberse cobrado y no haberse anotado.     | Mira el cargo en el panel del proveedor. Si **no** está: `pnpm ops:queue retry billing.charge-period <id> --force`. Si **sí** está: anótalo a mano. |

Sin `--force`, el reintento de un periodo en `CHARGING` se rechaza. Para anotar a mano un cobro que
sí se hizo, con el rol de plataforma: `UPDATE billing_periods SET status = 'CHARGED',
provider_charge_ref = '<ref del proveedor>', charged_at = now() WHERE id = '<periodId>'`.

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

Ese mismo comando aplica a las colas existentes los reintentos y la caducidad de `defineJob`
(pg-boss no los cambia solo), y el worker los comprueba al registrar cada consumidor. Un job que
expira o pierde su worker hasta agotar los reintentos no pasa por el `catch` del manejador: el
worker lo detecta en la comprobación de colas (cada 5 min), con la misma alerta crítica y Sentry
(`source=sweep`). Solo se informa de fallos posteriores al arranque del worker.

## Una dirección no recibe correos (lista de supresión, ADR 0017)

Un rebote permanente o una queja de spam que llega por el webhook de Resend
(`POST /api/webhooks/email`, firmado; secreto en `EMAIL_WEBHOOK_SECRET`) deja la dirección en la
lista de supresión. El worker no vuelve a escribirle y lo registra como `email not sent: suppressed
address`, con el hash de la dirección. Los correos de acceso (verificación y recuperación de
contraseña) solo se detienen por rebote permanente.

```bash
pnpm ops:email status persona@ejemplo.com       # por qué está suprimida, si lo está
pnpm ops:email unsuppress persona@ejemplo.com   # se le puede volver a escribir
```

La tabla solo guarda hashes: no se puede listar a quién afecta, solo consultar una dirección
concreta. Quitar la supresión aquí **no** la quita de la lista del propio Resend.

En Resend, el webhook se da de alta apuntando a `https://<app>/api/webhooks/email` con los eventos
`email.bounced` y `email.complained`; su secreto de firma (`whsec_…`) es `EMAIL_WEBHOOK_SECRET`.

## Auditoría: lectura y retención (ADR 0018)

Los administradores la ven en Ajustes → Actividad. Cada noche el worker ejecuta
`platform.purge-audit-logs`, que borra las entradas de más de **24 meses** llamando a
`app.purge_expired_audit_logs()`; el plazo está fijo en esa función (cambiarlo es una migración).
Cada purga deja una entrada `audit.purged` con el recuento. Si la tabla llega a decenas de millones
de filas, es el momento de particionarla por mes (ADR 0018) para borrar particiones enteras.

## Métricas (ADR 0008, enmienda)

`web` publica `GET /api/metrics` y el worker `GET /metrics` (en su puerto de salud, 3002), ambos con
`Authorization: Bearer <METRICS_TOKEN>`. Sin `METRICS_TOKEN` responden 404; con un token erróneo, 401. **El proxy no debe enrutar `/api/metrics` hacia Internet:** el token es la segunda barrera, no la
primera (en Cloudflare Tunnel, no publiques esa ruta).

| Métrica                                                   | Qué dice                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `http_requests_total`, `http_request_duration_seconds`    | peticiones de la API por método, ruta con plantilla y clase de estado        |
| `worker_jobs_total`, `worker_job_duration_seconds`        | intentos por cola y resultado (`completed`, `retry`, `failed`) y su duración |
| `worker_queue_jobs`, `worker_queue_oldest_wait_seconds`   | trabajos por cola y estado, y espera del más antiguo                         |
| `process_uptime_seconds`, `process_resident_memory_bytes` | el proceso                                                                   |

Viven en memoria y se reinician con el proceso: quien las raspa calcula las tasas. Para verlas sin
instalar nada: `curl -H "Authorization: Bearer $METRICS_TOKEN" http://worker:3002/metrics`.
Prometheus y Grafana no están desplegados (D10); cuando lo estén, su configuración de raspado apunta
a estas dos rutas.

## Acceso: segundo factor, secretos y contraseñas (ADR 0016)

**He perdido el autenticador y los códigos de recuperación.** No hay recuperación automática
(sería la puerta de atrás). Tras comprobar por otro medio que es la misma persona, un operador
desactiva su factor y la persona vuelve a darlo de alta:

```sql
-- como app_migrator o app_platform, con el email del acceso
UPDATE auth_users SET two_factor_enabled = false WHERE email = 'persona@ejemplo.com';
DELETE FROM auth_two_factors WHERE user_id = (SELECT id FROM auth_users WHERE email = 'persona@ejemplo.com');
```

**Rotar `BETTER_AUTH_SECRET`.** No lo cambies sin más: cifra los secretos del segundo factor. Pon el
nuevo **delante** y deja el anterior detrás: `BETTER_AUTH_SECRETS=2:<nuevo>,1:<anterior>`. Las
sesiones abiertas se cierran (la cookie se firma con el primero) y los factores siguen valiendo.
Quita una versión antigua solo cuando ya nada esté cifrado con ella; hoy no hay forma de saberlo sin
mirar la tabla, así que en la práctica se deja.

**Contraseñas filtradas.** La web consulta `api.pwnedpasswords.com` (solo 5 caracteres de un hash).
Si el servicio no responde en 3 s la contraseña se **acepta** y se registra `password breach check
unavailable`; si lo ves a menudo, comprueba que la red de staging permite ese host. Para apagarlo:
`PASSWORD_BREACH_CHECK=false`.

## Borrado de cuentas (ADR 0019)

El job `identity.process-account-deletions` corre cada día a las 04:11 UTC y ejecuta las solicitudes
cuyo plazo (14 días) ha vencido. Es idempotente: si falla a medias, la siguiente ejecución sigue donde
quedó (las membresías ya desactivadas se saltan). Ver pendientes y ejecutados:

```sql
-- solicitudes en curso (como app_platform)
SELECT id, deletion_requested_at, deletion_scheduled_for FROM users WHERE deletion_scheduled_for IS NOT NULL ORDER BY 3;
-- ejecutados: acciones user.deleted en la auditoría (sin organización)
SELECT actor_id, created_at FROM audit_logs WHERE action = 'user.deleted' ORDER BY created_at DESC LIMIT 20;
```

Si una solicitud deja de ser posible durante el plazo (la persona se quedó como último ADMIN, o su
organización unipersonal contrató un plan de pago) el job la **cancela** y le escribe
(`user.deletion_blocked`). La anonimización no se deshace: antes de activarlo en producción pruébalo
en staging con una cuenta real. **Las copias de seguridad** conservan los datos hasta caducar: la
retención de R5.5 debe encajar con lo que se responda a una petición RGPD.

## Pendiente

- Centralizar los logs (Loki o Better Stack) y el monitor externo: con el despliegue (fase 6).
