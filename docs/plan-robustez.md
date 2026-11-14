# Plan de robustez (R1–R5)

Plan de trabajo salido de la revisión técnica del 2026-11-13 sobre `v1.0.0`. Cada bloque cabe en
una sesión y termina en una rama propia fusionada en `staging`. **Este archivo es el estado**: se
actualiza en la misma rama que entrega el bloque.

La revisión fue por lectura de código. Antes de corregir un fallo, **reprodúcelo con un test que
falle**; si no se reproduce, anótalo aquí y márcalo como descartado.

## Cómo continuar en una sesión nueva

1. Lee este archivo y elige el primer bloque `⬜` cuyo «Depende de» esté `✅` y que no esté en
   `🔒` (esperando una decisión del usuario).
2. Rama desde `staging` con el nombre indicado.
3. Si el bloque pide ADR: escribe el ADR en **Propuesto**, enséñaselo al usuario y **no
   implementes** hasta que lo valide (regla 1 de `CLAUDE.md`).
4. Test que falla → corrección → `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
   `pnpm test:integration` y, si toca pantallas, `pnpm test:e2e`. Si cambia una ruta,
   `pnpm api:generate`. Si cambia el esquema, `pnpm db:check`.
5. Actualiza aquí el estado del bloque (con lo verificado y lo no verificado) y añade su entrada
   en `docs/roadmap.md`.
6. Push de la rama, merge `--no-ff` en `staging` y push de `staging`.

Estados: `⬜` pendiente · `🟡` en curso · `✅` entregado · `🔒` espera decisión · `✖` descartado.

## Resumen

| Bloque | Rama                           | Contenido                                                 | ADR            | Depende de | Estado |
| ------ | ------------------------------ | --------------------------------------------------------- | -------------- | ---------- | ------ |
| R1.1   | `fix/last-admin-race`          | Carrera del último ADMIN                                  | —              | —          | ✅     |
| R1.2   | `fix/client-ip`                | IP del cliente de confianza para límites y auditoría      | —              | —          | ✅     |
| R1.3   | `fix/queue-final-failure`      | Fallos definitivos sin alerta; colas que no se actualizan | —              | —          | ✅     |
| R1.4   | `fix/billing-checkout-binding` | Checkout ligado a la organización en servidor             | enmienda 0012  | D1         | 🔒     |
| R1.5   | `fix/billing-charge-state`     | Estado `CHARGING`; cobro y registro separados             | enmienda 0012  | D1         | 🔒     |
| R1.6   | `fix/billing-period-close`     | Cierre de todos los periodos vencidos, con su plan        | enmienda 0012  | D1, D2     | 🔒     |
| R2.1   | `feat/security-headers`        | CSP, HSTS y resto de cabeceras en `web` y `site`          | —              | —          | ⬜     |
| R2.2   | `chore/db-timeouts`            | Tiempos límite de sentencia, bloqueo y transacción        | —              | —          | ⬜     |
| R2.3   | `fix/invitation-integrity`     | Invitación única por email; registro atómico              | —              | —          | ⬜     |
| R2.4   | `feat/rate-limit-store`        | Límites en Postgres; límites por usuario y organización   | nuevo (0014)   | R1.2       | 🔒     |
| R2.5   | `feat/auth-hardening`          | MFA TOTP, contraseñas filtradas, sesiones                 | nuevo (0015)   | R4.3       | 🔒     |
| R3.1   | `chore/db-check-constraints`   | Restricciones `CHECK` de cobros                           | —              | —          | ⬜     |
| R3.2   | `feat/billing-dunning-emails`  | Avisos de impago a los administradores                    | —              | —          | ⬜     |
| R3.3   | `feat/usage-counters`          | Contadores de uso por periodo                             | enmienda 0012  | R1.6       | 🔒     |
| R3.4   | `feat/email-suppression`       | Rebotes, quejas y lista de supresión                      | nuevo (0016)   | —          | 🔒     |
| R3.5   | `feat/audit-log-read`          | Lectura de la auditoría y retención                       | nuevo (0017)   | —          | 🔒     |
| R4.1   | `feat/ui-states`               | Páginas de error y carga; estados de las tablas           | —              | —          | ⬜     |
| R4.2   | `feat/ui-feedback`             | Confirmaciones y sesión caducada                          | —              | —          | ⬜     |
| R4.3   | `feat/account-settings`        | Ajustes de la cuenta: perfil, contraseña, sesiones        | —              | R4.2       | ⬜     |
| R4.4   | `feat/organization-settings`   | Ajustes de la organización, salir, reenviar invitación    | —              | R1.1, R4.2 | ⬜     |
| R4.5   | `feat/account-deletion`        | Borrado de la cuenta (RGPD)                               | nuevo (0018)   | R4.3       | 🔒     |
| R4.6   | `feat/browser-errors-a11y`     | Errores del navegador; accesibilidad en los E2E           | enmienda 0008  | R2.1       | 🔒     |
| R5.1   | `chore/renovate`               | Actualización automática de dependencias                  | enmienda 0009  | —          | 🔒     |
| R5.2   | `chore/ci-images`              | Caché de capas, escaneo de imágenes y SBOM                | —              | —          | ⬜     |
| R5.3   | `fix/graceful-shutdown`        | Parada limpia de la web; errores no capturados del worker | —              | —          | ⬜     |
| R5.4   | `feat/metrics`                 | Métricas de latencia, errores y cola                      | enmienda 0008  | —          | 🔒     |
| R5.5   | `docs/backups`                 | Copias de seguridad y restauración probada                | ADR producción | D5         | 🔒     |

Orden recomendado: R1.1 → R1.2 → R1.3 → R2.1 → R2.2 → R2.3 → R4.1 → R4.2 → R3.1 → R5.3 → R5.2
(ninguno necesita decisión), y en paralelo ir resolviendo las decisiones para desbloquear el resto.
Los tres bloques de cobros (R1.4–R1.6) van **antes de que ningún producto cobre** con la plantilla.

## Decisiones del usuario

> D1 y D2 (y la regla para el uso tardío) tienen su propuesta redactada en
> [`adr/0014-enmienda-cobros-robustez.md`](adr/0014-enmienda-cobros-robustez.md), **Propuesto**.

Cada una desbloquea los bloques indicados. La recomendación es la opción por defecto si no hay
otra preferencia.

| Id  | Decisión                                                                                   | Recomendación                                                                                           | Desbloquea       |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------- |
| D1  | ¿Se enmienda el ADR 0012 para R1.4–R1.6 (checkout en servidor, estado `CHARGING`, cierre)? | Sí, una sola enmienda con los tres cambios                                                              | R1.4, R1.5, R1.6 |
| D2  | ¿Cómo se sabe qué plan regía en un periodo ya vencido?                                     | Guardar plan y versión al inicio de cada periodo (tabla `subscription_periods`), no deducirlo al cerrar | R1.6, R3.3       |
| D3  | ¿Dónde viven los contadores de límites de peticiones?                                      | Postgres (tabla global, sin Redis: ADR 0007)                                                            | R2.4             |
| D4  | MFA: ¿opcional por persona u obligatorio por organización? ¿Códigos de recuperación?       | Opcional por persona con códigos de recuperación; la obligación por organización, más adelante          | R2.5             |
| D5  | Producción (ADR 0006, pendiente): ubicación y copias                                       | —                                                                                                       | R5.5             |
| D6  | Borrado de cuenta: ¿inmediato o con plazo de gracia? ¿Qué pasa si es el único ADMIN?       | Plazo de 14 días; bloquear si es el último ADMIN de una organización con más miembros                   | R4.5             |
| D7  | Retención de la auditoría                                                                  | 24 meses, particionado mensual cuando el volumen lo pida                                                | R3.5             |
| D8  | Dependencias nuevas: `@sentry/browser` y `@axe-core/playwright` (dev)                      | Sí a las dos                                                                                            | R4.6             |
| D9  | Renovate frente a Dependabot, y política (agrupar parches, PR semanal contra `staging`)    | Renovate, semanal, agrupando parches y menores; mayores una a una                                       | R5.1             |
| D10 | Métricas: ¿endpoint Prometheus o derivarlas de los logs?                                   | Endpoint `/metrics` en web y worker; Prometheus y Grafana autoalojados entran en el ADR 0011            | R5.4             |
| D11 | Supresión de correo: ¿guardar el email o solo su hash?                                     | Solo el hash (SHA-256 del email normalizado)                                                            | R3.4             |

---

## R1 — Correcciones críticas

### R1.1 · Carrera del último ADMIN — `fix/last-admin-race` ✅ (2026-11-14)

- **Entregado:** `lockOrganizationMembers` (`members.ts`, `pg_advisory_xact_lock` con clave
  `members:{organizationId}`) al inicio de `changeMemberRole` y `disableMember`. Quien añada un
  caso de uso que quite un ADMIN (salir de la organización, borrar cuenta) debe llamarla primero.
- **Reproducido antes de corregir:** sin el bloqueo, los dos tests nuevos fallan (dos ADMIN que
  se degradan o desactivan a la vez dejan la organización sin ninguno); con él pasan.
- **Verificado:** format, lint, typecheck, 76 unitarias y 82 de integración (Postgres 16 local,
  Node 24). E2E, `api:generate` y `db:check` no aplican (sin cambios de pantallas, rutas ni esquema).

- **Problema:** `assertAnotherActiveAdmin` (`packages/core/src/modules/identity/members.ts`) cuenta
  y después actualiza sin bloqueo. Dos peticiones simultáneas que degradan o desactivan a dos
  ADMIN distintos pasan ambas la comprobación y la organización queda sin administradores.
- **Cambio:** `pg_advisory_xact_lock` por organización (clave `members:{organizationId}`, igual que
  `recordUsage`) al inicio de `changeMemberRole`, `disableMember` y de cualquier caso de uso futuro
  que quite un ADMIN (salir de la organización, borrar cuenta).
- **Test:** integración en `packages/core/test/identity.int.test.ts`: dos ADMIN, dos degradaciones
  concurrentes cruzadas → exactamente una falla con `LAST_ADMIN`.

### R1.2 · IP del cliente de confianza — `fix/client-ip` ✅ (2026-11-14)

- **Entregado:** `clientIp`/`clientKey` en `packages/config/src/client-ip.ts`; `TRUSTED_IP_HEADER`
  (opcional, en `authEnv`); usadas en `baseCtx` (auditoría), en los límites de
  `/invitations/preview` y `/register` y en `advanced.ipAddress.ipAddressHeaders` de Better Auth
  (lista vacía sin cabecera: Better Auth ya agrupa las peticiones sin IP en un cubo compartido por
  ruta). Sin IP conocida, el limitador propio usa la clave común `unknown-ip` en vez de saltarse.
  Variable añadida a `.env.example`, `infra/staging/compose.yml` (por defecto `cf-connecting-ip`),
  `infra/staging/.env.example` y `docs/deploy.md`.
- **Reproducido:** con la lectura antigua de `x-forwarded-for`, el test de integración nuevo falla
  (31 peticiones con una IP falsa distinta cada una no llegan a 429); con la nueva, sí.
- **Efecto en los tests:** `test/integration-env.ts` fija `TRUSTED_IP_HEADER=x-test-ip` y el
  `Browser` de los tests manda una IP distinta por instancia.
- **No verificado:** el comportamiento real detrás de Cloudflare Tunnel y Coolify (staging).

- **Problema:** se usa el primer valor de `x-forwarded-for` (`apps/web/src/server/api/session.ts`,
  `routes/invitations.ts`, `packages/adapters/src/auth/index.ts`). Detrás de Cloudflare Tunnel ese
  valor lo escribe el cliente: los límites por IP se evitan y la IP de la auditoría se falsifica.
  Sin cabecera, el limitador propio se salta la petición.
- **Cambio:** una sola función `clientIp(headers)` y la variable `TRUSTED_IP_HEADER`
  (por defecto `cf-connecting-ip` en staging; vacía en local → IP desconocida). Usarla en
  `baseCtx`, en `rateLimit` y en `advanced.ipAddress.ipAddressHeaders` de Better Auth. Sin IP
  conocida, el límite se aplica a una clave común en lugar de saltarse.
- **Variables:** `.env.example`, `infra/staging/compose.yml`, `infra/staging/.env.example`,
  `packages/config/src/env.ts`. Anotar en `docs/deploy.md`.
- **Test:** unitario de `clientIp`; integración: con `x-forwarded-for` falsificado el límite de
  `/invitations/preview` sigue saltando.

### R1.3 · Fallos definitivos de la cola — `fix/queue-final-failure` ✅ (2026-11-14)

- **Entregado:** (a) `failedJobsSince` (`adapters/queue`) y un barrido en `checkQueues` del worker
  que avisa (alerta `job-failed:{cola}`, `captureError` con `source=sweep`, log `error`) de los
  jobs `failed` de sus colas aparecidos desde la comprobación anterior (reloj de la BD, margen de
  60 s y conjunto de ids ya notificados, compartido con el aviso del `catch`, sin duplicados);
  (b) `updateQueue` de pg-boss 12 cuando la configuración almacenada difiere de `defineJob`, al
  registrar el consumidor (`registerWorker`) y en `pnpm queue:install` (`syncQueues` sobre
  `ALL_JOBS`; el paquete raíz pasa a depender de `@saas/core`). El productor (web) sigue solo
  creando las colas que faltan.
- **Reproducido:** sin el barrido y sin `update`, los dos tests nuevos fallan.
- **Verificado:** format, lint, typecheck, 83 unitarias, 86 de integración, `db:check`,
  `pnpm queue:install`. No probado: una expiración real de pg-boss (el test simula su efecto con
  un `UPDATE` a `failed`) ni el comportamiento con varias réplicas del worker.
- **Límite conocido:** un fallo ocurrido con el worker parado no se notifica al arrancar.

- **Problema (a):** `registerWorker` (`packages/adapters/src/queue/index.ts`) solo avisa del fallo
  definitivo dentro del `catch` del handler. Un job que agota los reintentos por expiración o por
  caída del worker pasa a `failed` sin alerta ni Sentry.
- **Problema (b):** `ensureQueue` no toca una cola existente: cambiar `retryLimit`,
  `retryDelaySeconds` o `expireInSeconds` en `defineJob` no llega a pg-boss, y el cálculo
  `final = attempt >= job.retryLimit` deja de coincidir con la realidad.
- **Cambio:** (a) en `checkQueues` del worker, avisar de los jobs en `failed` aparecidos desde la
  última comprobación (marca de tiempo en memoria, primera pasada desde el arranque), con la misma
  clave de alerta `job-failed:{cola}`; (b) `updateQueue` cuando la configuración difiere, al
  registrar el consumidor y en `scripts/install-queue.ts`.
- **Test:** integración en `packages/adapters/test/queue.int.test.ts`: job que expira hasta agotar
  reintentos → alerta; cola creada con `retryLimit: 1` y redefinida con 3 → pg-boss la refleja.
- **Comprobar antes:** la API exacta de pg-boss 12 para actualizar colas (versión fijada, ADR 0009).

### R1.4 · Checkout ligado a la organización — `fix/billing-checkout-binding` 🔒 D1

- **Problema:** `organizationId` viaja como `customData` desde el navegador
  (`apps/web/src/client/paddle.ts`) y `applyProviderEvent`
  (`packages/core/src/modules/billing/subscriptions.ts`) sobrescribe la suscripción de esa
  organización sin comprobar que el evento es de la suscripción guardada. Con el token de cliente
  (público) y un `priceId`, cualquiera puede abrir un checkout a nombre de otra organización y
  cambiarle el plan.
- **Cambio:**
  1. `PaymentProvider.checkout` pasa a ser asíncrono y crea la transacción en Paddle desde el
     servidor con `custom_data.organizationId`; el navegador solo recibe el id de la transacción.
  2. `applyProviderEvent` rechaza (y registra) un evento cuya suscripción no es la viva de la
     organización; solo acepta una nueva si no hay ninguna o la actual está `CANCELED`.
  3. El webhook comprueba que la organización existe antes de encolar.
- **Test:** unitarios del adaptador (petición de transacción); integración: evento de otra
  suscripción para una organización con suscripción activa → no cambia nada y queda auditado.
- **Comprobar antes:** documentación vigente de Paddle para crear transacciones y abrir el checkout
  con su id. Sigue **sin probar contra el sandbox** hasta que el usuario lo haga.

### R1.5 · Estado del cobro de excedentes — `fix/billing-charge-state` 🔒 D1

- **Problema:** en `billingChargeHandler` (`packages/core/src/modules/billing/jobs.ts`) el `try`
  envuelve la llamada al proveedor y la escritura de `CHARGED`. Si el cargo sale bien y la
  escritura falla, queda `CHARGE_FAILED`; el reintento manual que indica el runbook cobra dos veces.
- **Cambio:** nuevo valor `CHARGING` en `BillingPeriodStatus` (migración aditiva), escrito y
  confirmado **antes** de llamar al proveedor. Solo un error del proveedor marca `CHARGE_FAILED`.
  Un periodo que se queda en `CHARGING` genera una alerta «comprobar en Paddle antes de
  reintentar», y `ops:queue retry` se niega a reintentarlo sin `--force`.
- **Docs:** `docs/operations.md` (qué hacer con `CHARGING` y `CHARGE_FAILED`).
- **Test:** integración: proveedor que cobra y base de datos que falla al registrar → estado
  `CHARGING`, nunca `CHARGE_FAILED`; el job relanzado no vuelve a cobrar.

### R1.6 · Cierre de periodos — `fix/billing-period-close` 🔒 D1, D2

- **Problemas** (`packages/core/src/modules/billing/close.ts`):
  1. `duePeriods` solo devuelve el periodo anterior: con el worker parado más de un periodo, los
     intermedios no se cierran nunca y su excedente no se cobra.
  2. El cierre usa el plan actual de la suscripción, no el que regía en el periodo.
  3. Si el webhook de renovación llega antes del escaneo, `periodContaining` devuelve el periodo
     nuevo aunque el corte (`now − 1 h`) sea anterior a su inicio, y el periodo anterior se cierra
     sin respetar la hora de gracia.
  4. Uso con `occurredAt` en un periodo ya cerrado se registra y no se factura nunca.
- **Cambio:** según D2, registrar plan y versión al empezar cada periodo; `duePeriods` recorre
  desde el último periodo cerrado hasta el corte; corregir el caso 3; `recordUsage` rechaza (o
  imputa al periodo abierto, a decidir en la enmienda) el uso de un periodo cerrado.
- **Test:** unitarios de `duePeriods` (tres periodos sin cerrar, renovación recién llegada, cambio
  de plan a mitad) e integración del cierre con cambio de plan.

## R2 — Seguridad

### R2.1 · Cabeceras de seguridad — `feat/security-headers`

- **Problema:** ni `apps/web` ni `apps/site` envían CSP, HSTS, `frame-ancestors`,
  `X-Content-Type-Options`, `Referrer-Policy` ni `Permissions-Policy`.
- **Cambio:** cabeceras estáticas en `next.config.ts` de las dos apps; CSP con nonce por petición
  en `web` (proxy de Next) que permita solo lo necesario: Paddle.js y sus iframes cuando
  `PAYMENT_PROVIDER=paddle`, el DSN de errores cuando llegue R4.6. En `site`, CSP estática con
  Plausible si está configurado. HSTS solo cuando `APP_URL` es `https`.
- **Riesgo:** una CSP estricta puede romper estilos en línea de `next-themes` o las imágenes Open
  Graph; empezar en `Content-Security-Policy-Report-Only` en staging y pasar a bloqueante en el
  mismo bloque solo si los E2E pasan limpios.
- **Test:** E2E que comprueba las cabeceras en una página de cada app y que no hay violaciones de
  CSP en consola durante los recorridos existentes.

### R2.2 · Tiempos límite de Postgres — `chore/db-timeouts`

- **Problema:** `app_user` no tiene `statement_timeout`, `lock_timeout` ni
  `idle_in_transaction_session_timeout`: una consulta colgada retiene conexiones del pool.
- **Cambio:** opciones de conexión en `createDb` (`packages/database/src/client.ts`) y en
  `createBoss`, con valores por defecto (propuesta: 30 s, 5 s, 60 s) y sobrescribibles por
  proceso; el worker necesita más margen para el cierre de periodos. `app_migrator` no cambia.
  (Con `ALTER ROLE` no vale: `app_migrator` no tiene `CREATEROLE`.)
- **Test:** integración: `pg_sleep` por encima del límite falla con el error esperado, y
  `handleError` lo devuelve como `SERVICE_UNAVAILABLE` sin filtrar detalles.

### R2.3 · Integridad de las invitaciones — `fix/invitation-integrity`

- **Problemas:** la comprobación de «ya hay una pendiente» en `createInvitation` es una carrera;
  no se comprueba si el email ya es miembro; `createInvitedAccount` y `POST /invitations/register`
  hacen cuatro pasos sin transacción (cuenta, credencial, usuario de negocio, aceptación).
- **Cambio:** índice único parcial `(organization_id, email) WHERE accepted_at IS NULL AND
revoked_at IS NULL` (migración aditiva; antes de crear, marcar como revocadas las caducadas del
  mismo email); error `ALREADY_MEMBER` al invitar a un miembro activo; en el registro, si la
  aceptación falla después de crear la cuenta, la respuesta lo dice y la pantalla ofrece «Iniciar
  sesión y unirme» en lugar de dejar la cuenta huérfana.
- **Textos:** `errors.ALREADY_MEMBER` en `apps/web/messages/{es,en}.json`.
- **Test:** integración: dos invitaciones concurrentes al mismo email → una; invitar a un miembro.

### R2.4 · Almacén de límites — `feat/rate-limit-store` 🔒 D3

- **Problema:** el limitador propio (`apps/web/src/server/api/rate-limit.ts`) y el de Better Auth
  viven en memoria: se pierden al reiniciar y no valen con dos réplicas. No hay límites por
  usuario ni por organización; `POST /invitations` permite enviar correo a direcciones arbitrarias
  sin tope.
- **Cambio (ADR 0014):** tabla global `rate_limits` (declarada en `GLOBAL_TABLES`), ventana fija
  con `INSERT … ON CONFLICT … DO UPDATE`, limpieza por job programado; Better Auth con
  almacenamiento propio sobre la misma tabla; límite general por sesión en `/api/v1` y tope diario
  de invitaciones por organización.
- **Test:** integración: el límite sobrevive a recrear la app; tope de invitaciones.

### R2.5 · Refuerzo del acceso — `feat/auth-hardening` 🔒 D4

- **Contenido (ADR 0015, amplía el 0003):** MFA TOTP con códigos de recuperación (plugin de Better
  Auth: tablas `auth_*` nuevas, solo tocadas por `adapters/auth`), rechazo de contraseñas
  filtradas (k-anonimato de Have I Been Pwned: llamada saliente, justificar en el ADR), y lista y
  cierre de sesiones activas.
- **Pantallas:** en Ajustes → Cuenta (R4.3).
- **Test:** integración del alta y verificación del segundo factor; E2E del inicio de sesión con
  código.

## R3 — Backend y datos

### R3.1 · Restricciones de cobros — `chore/db-check-constraints`

- **Cambio:** migración aditiva con `CHECK`: `usage_events.quantity > 0`;
  `period_end > period_start` en `subscriptions` y `billing_periods`; importes y cantidades
  `>= 0` en `billing_periods` y `billing_period_lines`; `spend_cap >= 0`.
- **Antes de aplicar:** consulta que confirme que staging no tiene filas que las incumplan.
- **Test:** `db:check` y un caso por restricción en `packages/database/test`.

### R3.2 · Avisos de impago — `feat/billing-dunning-emails`

- **Problema:** al pasar a `PAST_DUE` solo cambia un aviso en pantalla; nadie recibe correo y a los
  7 días la organización cae al plan por defecto sin haber sido avisada.
- **Cambio:** correo a los ADMIN al entrar en `PAST_DUE` (encolado en `applyProviderEvent`, clave
  por suscripción y fecha de impago), recordatorio 2 días antes de la restricción y aviso al
  restringir (job programado diario). Plantillas en `core/billing/emails.ts`, es/en.
- **Test:** unitarios de las plantillas; integración: una sola vez por impago.

### R3.3 · Contadores de uso — `feat/usage-counters` 🔒 D1, D2

- **Problema:** `recordUsage` agrega todos los `usage_events` del periodo en cada escritura, con un
  bloqueo por organización y métrica. Con métricas de mucho volumen es lineal por evento.
- **Cambio (enmienda 0012):** tabla `usage_counters` (tenant, RLS) por organización, métrica y
  periodo, actualizada en la misma transacción; `usage_events` sigue siendo la evidencia y el
  cierre compara contador y suma (si difieren: alerta, gana la suma).
- **Test:** los de cobros existentes más concurrencia y la comparación en el cierre.

### R3.4 · Supresión de correo — `feat/email-suppression` 🔒 D11

- **Problema:** no se procesan rebotes ni quejas; se sigue enviando a direcciones que el proveedor
  ya marcó, lo que daña la reputación del dominio.
- **Cambio (ADR 0016):** webhook firmado del proveedor de correo (`/api/webhooks/email`, mismo
  patrón que pagos), tabla global `email_suppressions` y comprobación en el `EmailSender` antes de
  enviar. Los correos de acceso (verificación, recuperación) solo se suprimen por rebote
  permanente, nunca por queja.
- **Test:** firma válida y falsa; correo suprimido que no se envía y queda en el log sin la
  dirección.

### R3.5 · Lectura de la auditoría — `feat/audit-log-read` 🔒 D7

- **Contenido (ADR 0017):** permiso `audit.read` (ADMIN), `GET /api/v1/audit-logs` con paginación
  por cursor y filtros (acción, actor, fechas), pantalla Ajustes → Actividad, y job programado de
  retención ejecutado con una función `SECURITY DEFINER` (la tabla es de solo inserción para
  `app_user`).
- **Test:** integración de permisos, aislamiento y paginación; E2E de la pantalla.

## R4 — UX y pantallas

### R4.1 · Estados de error y carga — `feat/ui-states`

- **Problema:** no existen `error.tsx`, `global-error.tsx`, `not-found.tsx` ni `loading.tsx` en
  ninguna app; las tablas de miembros e invitaciones no muestran carga ni error (aparecen vacías).
- **Cambio:** esas páginas en `web` y `site`, con el `correlationId` visible en la de error;
  componente `Skeleton` en `packages/ui`; estados de carga, error con «Reintentar» y vacío
  (`EmptyState`) en miembros, invitaciones y cobros.
- **Test:** E2E: ruta inexistente en las dos apps; fallo simulado de `/api/v1/members`.

### R4.2 · Confirmaciones y sesión caducada — `feat/ui-feedback`

- **Problema:** el `Toaster` está montado pero nada llama a `toast`: las acciones con éxito no
  confirman. Una respuesta 401 con la sesión caducada muestra un error genérico.
- **Cambio:** confirmación tras cada mutación (invitar, revocar, cambiar rol, activar o desactivar,
  tope de gasto); en `Providers`, gestión global de `UNAUTHENTICATED` → `/sign-in?next=…`; y de
  `NO_ACTIVE_ORGANIZATION` → `/onboarding`.
- **Test:** E2E: invitar muestra la confirmación; borrar la cookie de sesión y actuar lleva al
  inicio de sesión y vuelve a la misma pantalla.

### R4.3 · Ajustes de la cuenta — `feat/account-settings`

- **Contenido:** `PATCH /api/v1/me` (nombre visible e idioma, caso de uso en `core/identity`,
  auditado); cambio de contraseña y de email con las rutas de Better Auth (el email exige
  verificar el nuevo); pantalla Ajustes → Cuenta. Es personal: usa `accessCtx`/`userCtx`, no
  permisos de organización.
- **Test:** integración de `PATCH /me`; E2E de cambio de nombre, idioma y contraseña.

### R4.4 · Ajustes de la organización — `feat/organization-settings`

- **Contenido:** `PATCH /api/v1/organization` (nombre e idioma; el permiso `organization.update`
  ya existe sin caso de uso), `POST /organization/archive` con confirmación escribiendo el nombre,
  `POST /me/organization/leave` (regla del último ADMIN, con el bloqueo de R1.1) y
  `POST /invitations/{id}/resend` (token nuevo, invalida el anterior). El identificador (`slug`)
  no se cambia: decisión aparte si algún producto lo pide.
- **Test:** integración de cada caso de uso (permisos, último ADMIN, token anterior inválido); E2E.

### R4.5 · Borrado de la cuenta — `feat/account-deletion` 🔒 D6

- **Contenido (ADR 0018):** el esquema ya lo prevé (`users.anonymized_at`, `auth_user_id` nulo al
  borrar el acceso). Falta el flujo: solicitud con contraseña, plazo de gracia, job que borra el
  acceso, anonimiza `users.display_name` y desactiva las membresías; regla del último ADMIN;
  evento de negocio `user.deleted` para el CRM; exportación de los datos personales.
- **Test:** integración del job y de las reglas; E2E de la solicitud y su cancelación.

### R4.6 · Errores del navegador y accesibilidad — `feat/browser-errors-a11y` 🔒 D8

- **Contenido (enmienda 0008):** errores del cliente a Sentry/GlitchTip con las mismas reglas de
  privacidad que el servidor (sin breadcrumbs, sin datos de formularios), DSN público servido en
  tiempo de ejecución (la imagen no lleva variables); comprobación con axe en los E2E de cada
  pantalla, que falla con infracciones graves.
- **Depende de R2.1:** la CSP debe permitir el envío al DSN.

## R5 — Operación y CI

### R5.1 · Actualización de dependencias — `chore/renovate` 🔒 D9

- **Problema:** todas las versiones están fijadas (ADR 0009) y nada las mueve.
- **Contenido (enmienda 0009):** configuración de Renovate según D9, incluidas las acciones de
  GitHub fijadas por hash y las imágenes base del `Dockerfile`.

### R5.2 · Imágenes en CI — `chore/ci-images`

- **Cambio:** `docker buildx` con caché de capas de GitHub Actions (hoy cinco builds en frío),
  escaneo de las imágenes (Trivy, falla con críticas con arreglo disponible) y SBOM como artefacto.
  Acciones nuevas fijadas por hash, como las actuales.

### R5.3 · Parada limpia — `fix/graceful-shutdown`

- **Problema:** la web no cierra pg-boss ni el pool al recibir `SIGTERM`; el worker no registra
  `unhandledRejection` ni `uncaughtException`, y un fallo en `shutdown` queda sin capturar.
- **Cambio:** manejadores en `apps/web/src/instrumentation.ts` y `apps/worker/src/main.ts`
  (log `fatal`, `captureError`, `flushErrors`, salida con código 1); `/ready` del worker comprueba
  también pg-boss.
- **Test:** unitario del manejador; a mano, `SIGTERM` a la web compilada (anotar el resultado).

### R5.4 · Métricas — `feat/metrics` 🔒 D10

- **Contenido (enmienda 0008):** latencia y tasa de error por ruta, duración y resultado por job,
  profundidad y espera de cada cola. Expuestas solo en la red interna.

### R5.5 · Copias de seguridad — `docs/backups` 🔒 D5

- Depende del ADR de producción (ADR 0006, pendiente): copias cifradas fuera del sitio,
  restauración probada y anotada en el runbook, y objetivo de pérdida y de recuperación.

## Ya anotado en el roadmap (no se duplica aquí)

- Probar Paddle contra el sandbox y validar la observabilidad en staging.
- Centralizar los logs y el monitor externo.
- Adelgazar la imagen del worker.
- Formulario de alta en la newsletter.
- Cambio de plan de una suscripción existente, créditos manuales y cuadre contra Paddle.
