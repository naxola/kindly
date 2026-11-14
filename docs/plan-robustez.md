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
| R1.4   | `fix/billing-checkout-binding` | Checkout ligado a la organización en servidor             | enmienda 0012  | D1         | ✅     |
| R1.5   | `fix/billing-charge-state`     | Estado `CHARGING`; cobro y registro separados             | enmienda 0012  | D1         | ✅     |
| R1.6   | `fix/billing-period-close`     | Cierre de todos los periodos vencidos, con su plan        | enmienda 0012  | D1, D2     | ✅     |
| R2.1   | `feat/security-headers`        | CSP, HSTS y resto de cabeceras en `web` y `site`          | —              | —          | ✅     |
| R2.2   | `chore/db-timeouts`            | Tiempos límite de sentencia, bloqueo y transacción        | —              | —          | ✅     |
| R2.3   | `fix/invitation-integrity`     | Invitación única por email; registro atómico              | —              | —          | ✅     |
| R2.4   | `feat/rate-limit-store`        | Límites en Postgres; límites por usuario y organización   | nuevo (0015)   | R1.2       | ✅     |
| R2.5   | `feat/auth-hardening`          | MFA TOTP, contraseñas filtradas, sesiones                 | nuevo (0016)   | R4.3       | 🟡     |
| R3.1   | `chore/db-check-constraints`   | Restricciones `CHECK` de cobros                           | —              | —          | ✅     |
| R3.2   | `feat/billing-dunning-emails`  | Avisos de impago a los administradores                    | —              | —          | ⬜     |
| R3.3   | `feat/usage-counters`          | Contadores de uso por periodo                             | enmienda 0012  | R1.6       | ⬜     |
| R3.4   | `feat/email-suppression`       | Rebotes, quejas y lista de supresión                      | nuevo (0017)   | —          | ✅     |
| R3.5   | `feat/audit-log-read`          | Lectura de la auditoría y retención                       | nuevo (0018)   | —          | ⬜     |
| R4.1   | `feat/ui-states`               | Páginas de error y carga; estados de las tablas           | —              | —          | ✅     |
| R4.2   | `feat/ui-feedback`             | Confirmaciones y sesión caducada                          | —              | —          | ✅     |
| R4.3   | `feat/account-settings`        | Ajustes de la cuenta: perfil, contraseña, sesiones        | —              | R4.2       | ⬜     |
| R4.4   | `feat/organization-settings`   | Ajustes de la organización, salir, reenviar invitación    | —              | R1.1, R4.2 | ✅     |
| R4.5   | `feat/account-deletion`        | Borrado de la cuenta (RGPD)                               | nuevo (0019)   | R4.3       | ⬜     |
| R4.6   | `feat/browser-errors-a11y`     | Errores del navegador; accesibilidad en los E2E           | enmienda 0008  | R2.1       | ✅     |
| R5.1   | `chore/renovate`               | Actualización automática de dependencias                  | enmienda 0009  | —          | 🟡     |
| R5.2   | `chore/ci-images`              | Caché de capas, escaneo de imágenes y SBOM                | —              | —          | 🟡     |
| R5.3   | `fix/graceful-shutdown`        | Parada limpia de la web; errores no capturados del worker | —              | —          | ✅     |
| R5.4   | `feat/metrics`                 | Métricas de latencia, errores y cola                      | enmienda 0008  | —          | ⬜     |
| R5.5   | `docs/backups`                 | Copias de seguridad y restauración probada                | ADR producción | D5         | 🔒     |

Orden recomendado: R4.1 → R4.2 → R3.1 → R5.3 → R5.2 (sin decisiones pendientes), R5.1 y R4.6
(decididas, sin ADR nuevo) y, con su ADR validado, R2.4, R3.4 y R3.5. R4.3 desbloquea R2.5 y R4.5.
R5.4 espera D10 y R5.5 espera D5.
Los tres bloques de cobros (R1.4–R1.6) van **antes de que ningún producto cobre** con la plantilla.

## Decisiones del usuario

> D1 y D2 (y la regla para el uso tardío) están en
> [`adr/0014-enmienda-cobros-robustez.md`](adr/0014-enmienda-cobros-robustez.md), **Aceptado**.

### Resoluciones (2026-11-14)

El usuario resolvió así. Lo marcado «ADR por redactar» sigue exigiendo ADR en **Propuesto** y su
validación antes de implementar (regla 1 de `CLAUDE.md`).

| Id  | Resolución                                                                                                   | Estado           |
| --- | ------------------------------------------------------------------------------------------------------------ | ---------------- |
| D1  | Sí: enmienda única con los tres cambios (ADR 0014)                                                           | ✅ Aceptado      |
| D2  | Tabla `subscription_periods`; el uso tardío se **rechaza** (ADR 0014)                                        | ✅ Aceptado      |
| D3  | Postgres, tabla global `rate_limits`, sin Redis. ADR 0015 por redactar                                       | ✅ Decidido      |
| D4  | MFA opcional por persona con códigos de recuperación; obligación por organización, más adelante. ADR 0016    | ✅ Decidido      |
| D5  | Producción (ubicación y copias)                                                                              | ⏳ Sin decidir   |
| D6  | Borrado con plazo de 14 días; bloqueado si es el último ADMIN de una organización con más miembros. ADR 0019 | ✅ Decidido      |
| D7  | Auditoría: 24 meses, particionado mensual cuando el volumen lo pida. ADR 0018 por redactar                   | ✅ Decidido      |
| D8  | Sí a `@sentry/browser` y `@axe-core/playwright` (dev)                                                        | ✅ Decidido      |
| D9  | Renovate, semanal, agrupando parches y menores; mayores una a una                                            | ✅ Decidido      |
| D10 | Métricas: ver recomendación en la tabla de abajo                                                             | ⏳ Por confirmar |
| D11 | Supresión de correo: solo el hash SHA-256 del email normalizado. ADR 0017 por redactar                       | ✅ Decidido      |

**Los cinco ADR nuevos están Aceptados (2026-11-14):** 0015 y 0017 ya implementados (R2.4, R3.4);
0016, 0018 y 0019 validados y pendientes de implementar (R2.5, R3.5, R4.5).

**Numeración de ADR nuevos** (por orden de bloque; las enmiendas a 0008, 0009 y 0012 no consumen
número): R2.4 → 0015 · R2.5 → 0016 · R3.4 → 0017 · R3.5 → 0018 · R4.5 → 0019.

**D10 (decidida):** endpoint `/metrics` en `web` y `worker` (red interna), sin desplegar Prometheus y
Grafana todavía: añaden dos servicios al homelab (regla 7) y solo compensan con un producto con
tráfico. Mientras, las colas ya alertan por ntfy. Se instalan después, en un ADR propio.

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

### R1.4 · Checkout ligado a la organización — `fix/billing-checkout-binding` ✅ (2026-11-14, ADR 0014)

- **Entregado:** `PaymentProvider.checkout` es asíncrono y el adaptador crea la transacción en
  Paddle (`POST /transactions`: `items`, `custom_data.organizationId`, `collection_mode:
automatic`, sin cliente) para la organización del actor; el navegador recibe solo
  `transactionId` y abre `Paddle.Checkout.open({ transactionId })` (el contrato de la API deja de
  llevar `priceId`, `customData` y `customerEmail`; `api:generate` hecho). `applyProviderEvent`
  rechaza y audita (`billing.provider_event_rejected`) el evento de una suscripción que no es la
  viva de la organización; acepta una nueva si no hay ninguna o la actual está `CANCELED`, o si la
  actual nunca estuvo en un proveedor. El webhook confirma (200 sin encolar) que la organización
  existe y que `custom_data` es un id válido, para que Paddle no reintente eternamente.
- **Documentación de Paddle leída el 2026-11-14** (crear transacción, pasar una transacción al
  checkout, custom data). **Sin confirmar** y anotado en `docs/deploy.md` para el sandbox: que el
  comprador pueda escribir su email sin cliente previo, que `custom_data` llegue a los eventos
  de la suscripción y que `open` con `transactionId` no necesite más opciones. Se pierde el email
  precargado en el checkout. **Sigue sin probarse contra el sandbox.**
- **Tests:** unitarios del adaptador (petición de la transacción, respuesta sin id); integración
  (evento ajeno rechazado y auditado sin cambiar nada, suscripción nueva tras una cancelada,
  checkout para la organización del actor, webhook de organización desconocida o con id
  inválido). Verificado: format, lint, typecheck, 90 unitarias, 96 de integración.

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

### R1.5 · Estado del cobro de excedentes — `fix/billing-charge-state` ✅ (2026-11-14, ADR 0014)

- **Entregado:** `CHARGING` en `BillingPeriodStatus` (migración aditiva `20261114120000`),
  confirmado antes de llamar al proveedor y con transición exclusiva (`updateMany` desde
  `PENDING_CHARGE`/`CHARGE_FAILED`). Solo un error del proveedor marca `CHARGE_FAILED`; si el
  cargo sale bien y falla el registro, el periodo se queda en `CHARGING` y el job lanza
  `ChargeOutcomeUnknownError`; un job relanzado con el periodo en `CHARGING` se niega a cobrar.
  La alerta crítica del worker añade «comprobar el proveedor». `ops:queue retry` rechaza un
  `CHARGING` sin `--force` (que lo devuelve a `PENDING_CHARGE`). Estado visible en la pantalla
  de cobros (es/en) y en el contrato de la API. Runbook en `docs/operations.md`.
- **Tests:** integración (cargo correcto + registro que falla → `CHARGING` y el relanzado no
  vuelve a cobrar; `CHARGING` visible durante la llamada; fallo de configuración antes de enviar)
  y unitario de la decisión de `ops:queue`. El glue del script con la base de datos no tiene test.

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

### R1.6 · Cierre de periodos — `fix/billing-period-close` ✅ (2026-11-14, ADR 0014)

- **Entregado:** tabla `subscription_periods` (tenant, RLS, sin borrado; migración
  `20261114130000`, que rellena el periodo actual de las suscripciones existentes). La escribe
  `applyProviderEvent` en cada evento (alta, renovación o cambio de plan dentro del periodo: gana
  el último plan). `duePeriods` recorre todos los periodos no cerrados cuyo fin más la hora de
  gracia ya pasó, del más antiguo al más nuevo, cada uno con su plan; extrapola con el último plan
  conocido los que ningún evento anunció; una suscripción cancelada no extrapola; una suscripción
  antigua sin historial ni cierres recupera también el periodo anterior al guardado. La gracia se
  aplica al fin de cada periodo, también cuando la renovación llega antes del escaneo.
  `recordUsage` rechaza el uso de un periodo ya cerrado (`CONFLICT` / `PERIOD_CLOSED`); un evento
  repetido y ya registrado sigue siendo un no-op, y sin suscripción viva no aplica.
- **Tests:** unitarios de `duePeriods` (periodo recién vencido, legado, varios periodos sin
  cerrar, renovación temprana, cambio de plan, cancelada) e integración (historial por evento,
  tres periodos cerrados a la vez con su plan y precio, gracia con renovación ya llegada, uso
  tardío rechazado). Verificado: format, lint, typecheck, 88 unitarias, 93 de integración, `db:check`.
- **Límites conocidos:** el cuadre de cuota (`billingStateOf`) sigue calculando el periodo de un
  uso retroactivo desde el periodo guardado, no el de su fecha; el cierre sí cuenta por fecha.
  Una suscripción antigua con varios periodos sin cerrar antes de esta migración solo recupera el
  anterior al guardado.

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

### R2.1 · Cabeceras de seguridad — `feat/security-headers` ✅ (2026-11-14)

- **Entregado:** `packages/config/src/security-headers.ts` (funciones puras: cabeceras estáticas,
  `buildCsp`, nonce, fuentes de Paddle) y un `proxy.ts` en `apps/web` y en `apps/site`. Van en el
  proxy y no en `next.config.ts` porque este se evalúa al compilar y las imágenes no llevan
  variables (ADR 0006): HSTS, Paddle y Plausible se deciden al arrancar. `web`: CSP con nonce y
  `strict-dynamic` (el nonce llega a `next-themes` vía `x-nonce`); Paddle (sandbox o producción
  según `PADDLE_ENVIRONMENT`) solo con `PAYMENT_PROVIDER=paddle`. `site`: CSP estática con
  `'unsafe-inline'` en scripts (páginas prerenderizadas, sin nonce posible) y Plausible si hay
  `PLAUSIBLE_DOMAIN`. Estilos con `'unsafe-inline'` (Tailwind, Radix, next-themes).
- **Estado de la CSP: `Content-Security-Policy-Report-Only`** (constante `CSP_HEADER` en cada
  `proxy.ts`). Pasar a bloqueante cuando `pnpm test:e2e` salga limpio y se haya probado un
  checkout de Paddle en sandbox.
- **Tests:** unitarios de `security-headers` (HSTS solo en https, nonce, eval solo en desarrollo,
  Paddle solo si se pide) y `e2e/security-headers.spec.ts`. Verificado: format, lint, typecheck,
  unitarias de `config`; `next build` de `web` y `site` y cabeceras reales con `next start`;
  Chromium sin avisos de CSP en `/sign-in`, `/sign-up` de `web` y portada del `site` sin Plausible.
  **E2E ejecutado después (2026-11-14):** `pnpm test:e2e` pasa completo (17 de 17), incluido
  `security-headers.spec.ts`, sin avisos de CSP. **Sigue sin verificar** el checkout de Paddle con
  CSP y los hosts de Paddle (tomados de su documentación, sin probar).
- **Hallazgo aparte:** `apps/site` decide si pinta el script de Plausible al compilar
  (`site.config.ts` lee `env()` en el prerenderizado), lo que contradice el ADR 0006: en la imagen
  construida sin `PLAUSIBLE_DOMAIN`, Plausible nunca carga. Pendiente de un bloque propio.

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

### R2.2 · Tiempos límite de Postgres — `chore/db-timeouts` ✅ (2026-11-14)

- **Entregado:** `packages/config/src/db-timeouts.ts` (valores, parámetro `options` de la conexión
  y `isDbTimeoutError`). `createDb` aplica 30 s / 5 s / 60 s (sentencia / bloqueo / transacción
  inactiva) y acepta `timeouts` parciales; `createBoss` usa los mismos para `producer` y los del
  worker para `worker`; el worker pasa `WORKER_DB_TIMEOUTS` (120 s / 30 s / 120 s) a `createDb`.
  Se fijan en la conexión (`-c …`), no con `ALTER ROLE`; `app_migrator` no cambia. `handleError`
  responde `503 SERVICE_UNAVAILABLE` (sin detalles; se reporta con `correlationId`) cuando el error
  trae SQLSTATE 57014, 55P03 o 25P03. Textos `errors.SERVICE_UNAVAILABLE` en es/en.
  Se pueden sobrescribir con `DB_STATEMENT_TIMEOUT_MS`, `DB_LOCK_TIMEOUT_MS` y
  `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` (opcionales, enteros positivos; vacío = valor por defecto del
  proceso), declaradas en `.env.example`, `infra/staging/compose.yml` y `infra/staging/.env.example`.
  En staging web y worker comparten el valor si se define (sin distinguir por proceso).
- **Tests:** unitarios de `db-timeouts` y de `handleError`; integración
  (`packages/database/test/timeouts.int.test.ts`): los valores llegan a la conexión, `pg_sleep`
  sobre el límite falla con 57014 y el pool se recupera. Verificado con Postgres 16 local:
  format, lint, fronteras, typecheck de todos los paquetes, 104 unitarias.

- **Problema:** `app_user` no tiene `statement_timeout`, `lock_timeout` ni
  `idle_in_transaction_session_timeout`: una consulta colgada retiene conexiones del pool.
- **Cambio:** opciones de conexión en `createDb` (`packages/database/src/client.ts`) y en
  `createBoss`, con valores por defecto (propuesta: 30 s, 5 s, 60 s) y sobrescribibles por
  proceso; el worker necesita más margen para el cierre de periodos. `app_migrator` no cambia.
  (Con `ALTER ROLE` no vale: `app_migrator` no tiene `CREATEROLE`.)
- **Test:** integración: `pg_sleep` por encima del límite falla con el error esperado, y
  `handleError` lo devuelve como `SERVICE_UNAVAILABLE` sin filtrar detalles.

### R2.3 · Integridad de las invitaciones — `fix/invitation-integrity` ✅ (2026-11-14)

- **Entregado:** migración `20261114140000_invitation_unique_pending`: índice único parcial
  `(organization_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL`. Antes de crearlo,
  revoca los duplicados pendientes que dejó la carrera (se queda la más nueva); para eso levanta
  y restaura `FORCE ROW LEVEL SECURITY` en `invitations` dentro de la misma migración (sin
  contexto de tenant no vería filas). Prisma no expresa índices parciales: vive solo en el SQL
  y `migrate diff` no detecta deriva. `createInvitation`: cierra (revoca) las caducadas del mismo
  email, rechaza con `ALREADY_MEMBER` si el email ya es miembro **en cualquier estado** (uno
  deshabilitado se reactiva, no se invita) y traduce el `P2002` del índice a
  `PENDING_INVITATION`. `POST /invitations/register`: si falla cualquier paso posterior a crear la
  cuenta, responde `409 ACCOUNT_CREATED_JOIN_FAILED` (error inesperado reportado, sin detalles) y
  la pantalla muestra el aviso con «Iniciar sesión y unirme». No hay transacción posible entre
  Better Auth y las tablas de negocio: la compensación es esa, no deshacer la cuenta.
- **Textos:** `errors.ACCOUNT_CREATED_JOIN_FAILED` en es/en (`errors.ALREADY_MEMBER` ya existía).
- **Tests:** integración de `core` (cinco invitaciones concurrentes → una; invitar a un miembro y
  al propietario; reinvitar tras caducar) y de la API (fallo tras crear la cuenta; después, iniciar
  sesión y aceptar funciona). Los tres primeros fallaban antes del cambio.

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

### R2.4 · Almacén de límites — `feat/rate-limit-store` ✅ (2026-11-14, ADR 0015)

- **Entregado:** tabla global `rate_limits` (migración `20261114160000`, declarada en
  `GLOBAL_TABLES`) y `@saas/adapters/rate-limit`: `consumeRateLimit` (ventana fija, **una sentencia
  atómica** `INSERT … ON CONFLICT`), claves `SHA-256(ámbito:identificador)` (la tabla nunca guarda
  una IP, un email ni un id en claro), `purgeRateLimits` y el almacén para Better Auth (su API
  actual es `consume`, atómica; ya no acepta `get`/`set`). El limitador de `/api/v1` usa el
  almacén; **límites nuevos:** 300 peticiones por minuto por persona con sesión en `/api/v1` y 50
  invitaciones al día por organización (nuevas y reenviadas cuentan igual). Fallo abierto en
  `/api/v1` (se registra y se reporta); el acceso falla cerrado. Job diario
  `platform.purge-rate-limits` (módulo nuevo `core/platform`, solo definiciones) con su consumidor
  en el worker.
- **Tests:** integración del almacén (límite, 20 peticiones simultáneas con tope 5, otro pool de
  conexiones, ventana nueva, solo hashes, purga, Better Auth) y de la API (tope diario de
  invitaciones también al reenviar, límite por sesión sin afectar a otra persona). Verificado:
  135 de integración, 121 unitarias, 26 de 26 E2E, tipos, lint, fronteras, `migrate diff` sin deriva.
- **Límites conocidos:** sin IP de confianza, las peticiones anónimas comparten un solo cubo
  (como antes, R1.2). El fallo abierto no tiene test: exigiría tirar Postgres a mitad de petición.
  Las cifras son `SUPUESTO` en `apps/web/src/server/api/rate-limit.ts`.

- **Problema:** el limitador propio (`apps/web/src/server/api/rate-limit.ts`) y el de Better Auth
  viven en memoria: se pierden al reiniciar y no valen con dos réplicas. No hay límites por
  usuario ni por organización; `POST /invitations` permite enviar correo a direcciones arbitrarias
  sin tope.
- **Cambio (ADR 0015):** tabla global `rate_limits` (declarada en `GLOBAL_TABLES`), ventana fija
  con `INSERT … ON CONFLICT … DO UPDATE`, limpieza por job programado; Better Auth con
  almacenamiento propio sobre la misma tabla; límite general por sesión en `/api/v1` y tope diario
  de invitaciones por organización.
- **Test:** integración: el límite sobrevive a recrear la app; tope de invitaciones.

### R2.5 · Refuerzo del acceso — `feat/auth-hardening` ⬜ (D4 decidida)

- **Contenido (ADR 0016, amplía el 0003):** MFA TOTP con códigos de recuperación (plugin de Better
  Auth: tablas `auth_*` nuevas, solo tocadas por `adapters/auth`), rechazo de contraseñas
  filtradas (k-anonimato de Have I Been Pwned: llamada saliente, justificar en el ADR), y lista y
  cierre de sesiones activas.
- **Pantallas:** en Ajustes → Cuenta (R4.3).
- **Test:** integración del alta y verificación del segundo factor; E2E del inicio de sesión con
  código.

## R3 — Backend y datos

### R3.1 · Restricciones de cobros — `chore/db-check-constraints` ✅ (2026-11-14)

- **Entregado:** migración aditiva `20261114150000_billing_check_constraints`: `usage_events.quantity
  > 0`; fin posterior al inicio en `subscriptions`, `subscription_periods`y`billing_periods`;
importes de `billing_periods`y cantidades e importes de`billing_period_lines` `>= 0`;
`spend_cap >= 0`(nulo permitido) en`subscriptions`y`billing_periods`. Se añadió
`subscription_periods`(tabla posterior al plan). Las consultas para comprobar que un entorno
con datos no las incumple están en la cabecera del SQL: **ejecútalas en staging antes de
aplicar**; si hay filas fuera de regla la migración se detiene y nombra la restricción.`RecordUsageInput`rechaza ahora la cantidad`"0"` en texto (el regex la dejaba pasar y la BD
  > habría respondido con un 500).
- **Tests:** `packages/database/test/check-constraints.int.test.ts` (un caso por restricción, más
  valores válidos; las tablas de cobros son de solo inserción para `app_user`, por eso los
  periodos se prueban insertando) y unitario de `RecordUsageInput`. `migrate diff`: sin deriva.
  Las fechas del fixture son del futuro lejano para que el barrido horario del worker no lo cierre.
- **Hallazgo (resuelto en R5.3, ver allí):** `apps/worker/test/worker.int.test.ts › sends the invitation email and delivers
the business events` era **inestable** en la suite completa de integración (4 núcleos): falla
  por «timed out waiting for the worker» en torno a la mitad de las ejecuciones, **también sin
  los cambios de este bloque** (comprobado con `git stash`); suelto pasa siempre. Pendiente de
  investigar, probablemente en R5.3 (worker).

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

### R3.3 · Contadores de uso — `feat/usage-counters` ⬜ (D1, D2 aceptadas; enmienda al 0012 por redactar)

- **Problema:** `recordUsage` agrega todos los `usage_events` del periodo en cada escritura, con un
  bloqueo por organización y métrica. Con métricas de mucho volumen es lineal por evento.
- **Cambio (enmienda 0012):** tabla `usage_counters` (tenant, RLS) por organización, métrica y
  periodo, actualizada en la misma transacción; `usage_events` sigue siendo la evidencia y el
  cierre compara contador y suma (si difieren: alerta, gana la suma).
- **Test:** los de cobros existentes más concurrencia y la comparación en el cierre.

### R3.4 · Supresión de correo — `feat/email-suppression` ✅ (2026-11-14, ADR 0017)

- **Entregado:** tabla global `email_suppressions` (migración `20261114170000`, en
  `GLOBAL_TABLES`): solo el SHA-256 del email normalizado y el motivo (`BOUNCE_PERMANENT` o
  `COMPLAINT`). `POST /api/webhooks/email` verifica la firma de Resend (Svix) con `node:crypto`,
  con tolerancia de 5 minutos y comparación en tiempo constante; un rebote **permanente** o una
  queja suprimen a cada destinatario; lo demás se ignora con 200. Sin `EMAIL_WEBHOOK_SECRET`
  responde 404. `SuppressingEmailSender` envuelve al remitente del worker: no escribe a una
  dirección suprimida y lo registra **con el hash, nunca con la dirección**; los correos de acceso
  (`category: 'access'`: verificación y recuperación) solo se detienen por rebote permanente.
  Script `pnpm ops:email status|unsuppress <email>`. Variable nueva en `.env.example`,
  `compose.yml` e `infra/staging/.env.example`.
- **Tests:** unitarios de la firma y de la lectura de eventos (rebote permanente y temporal,
  queja, varias firmas, secreto distinto, cuerpo alterado, sello de tiempo viejo o futuro);
  integración del almacén y del remitente (solo hash, acceso frente a queja y rebote, quitar la
  supresión) y de la ruta (apagada sin secreto, reintento idempotente, firma falsa).
- **Sin verificar:** el webhook contra Resend real (se hará en la etapa de validación externa).
  El formato se tomó de su documentación el 2026-11-14, no de un evento recibido.

- **Problema:** no se procesan rebotes ni quejas; se sigue enviando a direcciones que el proveedor
  ya marcó, lo que daña la reputación del dominio.
- **Cambio (ADR 0017):** webhook firmado del proveedor de correo (`/api/webhooks/email`, mismo
  patrón que pagos), tabla global `email_suppressions` y comprobación en el `EmailSender` antes de
  enviar. Los correos de acceso (verificación, recuperación) solo se suprimen por rebote
  permanente, nunca por queja.
- **Test:** firma válida y falsa; correo suprimido que no se envía y queda en el log sin la
  dirección.

### R3.5 · Lectura de la auditoría — `feat/audit-log-read` ⬜ (D7 decidida)

- **Contenido (ADR 0018):** permiso `audit.read` (ADMIN), `GET /api/v1/audit-logs` con paginación
  por cursor y filtros (acción, actor, fechas), pantalla Ajustes → Actividad, y job programado de
  retención ejecutado con una función `SECURITY DEFINER` (la tabla es de solo inserción para
  `app_user`).
- **Test:** integración de permisos, aislamiento y paginación; E2E de la pantalla.

## R4 — UX y pantallas

### R4.1 · Estados de error y carga — `feat/ui-states` ✅ (2026-11-14)

- **Entregado:** `Skeleton` en `packages/ui`. `web`: `error.tsx` (con la referencia `digest` de
  Next), `global-error.tsx` (bilingüe y fijo: no hay proveedores si falla el layout raíz),
  `not-found.tsx` y `(app)/loading.tsx`. `QueryError` (motivo traducido, `correlationId` de la
  API y «Reintentar») y `TableSkeleton` para miembros, invitaciones y cobros; estados vacíos en
  miembros e invitaciones. `ApiError.correlationId`. `site`: `[locale]/error.tsx`,
  `[locale]/not-found.tsx` y un catch-all `[locale]/[...rest]` que llama a `notFound()` para que
  cualquier ruta desconocida bajo un idioma muestre el 404 con cabecera y pie. Textos
  `states.*` en `web` y `site` (es/en).
- **Límite conocido:** una dirección sin idioma (`/xyz`) en `site` sigue con el 404 por defecto
  de Next: la app no tiene layout raíz.
- **Tests:** `e2e/states.spec.ts` (404 en las dos apps y en los dos idiomas; fallo simulado de
  `/api/v1/members` con referencia visible, sin tabla vacía y recuperación al reintentar).
  Verificado con Postgres 16 y Chromium locales: suite E2E completa, 17 de 17.

- **Problema:** no existen `error.tsx`, `global-error.tsx`, `not-found.tsx` ni `loading.tsx` en
  ninguna app; las tablas de miembros e invitaciones no muestran carga ni error (aparecen vacías).
- **Cambio:** esas páginas en `web` y `site`, con el `correlationId` visible en la de error;
  componente `Skeleton` en `packages/ui`; estados de carga, error con «Reintentar» y vacío
  (`EmptyState`) en miembros, invitaciones y cobros.
- **Test:** E2E: ruta inexistente en las dos apps; fallo simulado de `/api/v1/members`.

### R4.2 · Confirmaciones y sesión caducada — `feat/ui-feedback` ✅ (2026-11-14)

- **Entregado:** `toast` tras invitar, revocar, cambiar rol, activar/desactivar un miembro y
  guardar el tope de gasto (`toasts.*`, es/en). `Providers` instala un `QueryCache` y un
  `MutationCache` con `onError` que, vía `sessionRedirect` (función pura), lleva
  `UNAUTHENTICATED` a `/sign-in?next=<pantalla actual>` y `NO_ACTIVE_ORGANIZATION` a
  `/onboarding`; no actúa en las pantallas públicas (`/sign-in`, `/invite`…) que ya lo gestionan.
  `NO_ACTIVE_ORGANIZATION` llega como detalle de un `FORBIDDEN`, por eso se lee `reason`.
- **Tests:** unitarios de `sessionRedirect`; `e2e/feedback.spec.ts` (la confirmación al invitar y
  revocar; con la cookie borrada, actuar lleva a inicio de sesión con `next` y, tras entrar,
  vuelve a Miembros). Verificado con Postgres 16 y Chromium locales.
- **Pendiente de otro bloque:** confirmaciones en los ajustes de cuenta y de organización
  (R4.3, R4.4) y en el checkout de cobros, que redirige fuera de la app.

- **Problema:** el `Toaster` está montado pero nada llama a `toast`: las acciones con éxito no
  confirman. Una respuesta 401 con la sesión caducada muestra un error genérico.
- **Cambio:** confirmación tras cada mutación (invitar, revocar, cambiar rol, activar o desactivar,
  tope de gasto); en `Providers`, gestión global de `UNAUTHENTICATED` → `/sign-in?next=…`; y de
  `NO_ACTIVE_ORGANIZATION` → `/onboarding`.
- **Test:** E2E: invitar muestra la confirmación; borrar la cookie de sesión y actuar lleva al
  inicio de sesión y vuelve a la misma pantalla.

### R4.3 · Ajustes de la cuenta — `feat/account-settings` 🟡 (2026-11-14, falta el cambio de email)

- **Entregado:** `updateProfile` (`core/identity`, nombre visible e idioma preferido; personal, sin
  permisos de organización, auditado sin organización como `user.profile_updated` con antes y
  después), `PATCH /api/v1/me` y la pantalla **Ajustes → Cuenta**: perfil (el email de acceso se
  muestra, no se edita) y cambio de contraseña con la ruta de Better Auth (exige la actual y cierra
  las demás sesiones). Al guardar el idioma se actualiza también la cookie de este navegador,
  que tiene prioridad sobre la preferencia. `writeAudit` pasa a `createMany`: una fila sin
  organización se puede insertar pero no leer con RLS, y `create` la leía al devolverla.
- **Pendiente:** **cambio de email de acceso.** Exige activar `changeEmail` en Better Auth,
  verificar el nuevo correo, plantillas de correo nuevas (es/en) y decidir qué pasa con las
  invitaciones por email. Va aparte para no mezclarlo con esta entrega. Lista y cierre de sesiones
  activas son de R2.5.
- **Tests:** integración de `updateProfile` (nombre, idioma, vuelta a `null`, validaciones, usuario
  inexistente, auditoría leída con el rol de plataforma) y de la ruta (propio, anónimo, sin haber
  entrado al producto); `e2e/account.spec.ts` (nombre, idioma, contraseña errónea y correcta, y
  entrar con la nueva y no con la antigua) y axe sobre la pantalla.

- **Contenido:** `PATCH /api/v1/me` (nombre visible e idioma, caso de uso en `core/identity`,
  auditado); cambio de contraseña y de email con las rutas de Better Auth (el email exige
  verificar el nuevo); pantalla Ajustes → Cuenta. Es personal: usa `accessCtx`/`userCtx`, no
  permisos de organización.
- **Test:** integración de `PATCH /me`; E2E de cambio de nombre, idioma y contraseña.

### R4.4 · Ajustes de la organización — `feat/organization-settings` ✅ (2026-11-14)

- **Entregado:** `updateOrganization` (nombre e idioma, permiso `organization.update`, el
  identificador no cambia), `archiveOrganization` (escribiendo el nombre exacto; nadie puede
  entrar y sale de las listas; los datos se conservan), `leaveOrganization` (la membresía queda
  `DISABLED` y un ADMIN puede reactivarla; último ADMIN bloqueado con el bloqueo de R1.1, también
  con dos a la vez) y `resendInvitation` (token nuevo, el anterior deja de valer, caducidad
  renovada, un correo por enlace). Rutas `PATCH /organization`, `POST /organization/archive`,
  `POST /me/organization/leave` y `POST /invitations/{id}/resend` (`api:generate` hecho);
  `GET /organization` devuelve también el idioma. Pantalla **Ajustes → Organización** y botón
  «Reenviar» en las invitaciones.
- **Defectos reales que salieron al probar, corregidos:** el botón destructivo sólido daba 3,05:1
  de contraste en oscuro (ahora un fondo propio `--destructive-solid`, ≥ 4,5:1); al fallar «Salir»
  el diálogo seguía abierto y tapaba el mensaje (ahora se cierra al fallar).
- **Límites conocidos:** archivar **no cancela** la suscripción de pago (la pantalla avisa de
  cancelarla antes); quien sale no puede ser reinvitado, solo reactivado por un ADMIN (la
  invitación responde `ALREADY_MEMBER`); archivar y salir no emiten evento de negocio (el CRM no se
  entera; se añadiría con tipos nuevos en `BUSINESS_EVENT_TYPES`).
- **Tests:** integración de `core` (permisos, validación, archivar con nombre exacto, salir, último
  ADMIN y dos a la vez, token anterior inválido, MEMBER sin permiso) y de la API; `e2e/organization-settings.spec.ts`
  y axe. Verificado con Postgres 16 y Chromium locales: **26 de 26 E2E**, 126 de integración,
  121 unitarias, tipos, lint, fronteras y formato.

- **Contenido:** `PATCH /api/v1/organization` (nombre e idioma; el permiso `organization.update`
  ya existe sin caso de uso), `POST /organization/archive` con confirmación escribiendo el nombre,
  `POST /me/organization/leave` (regla del último ADMIN, con el bloqueo de R1.1) y
  `POST /invitations/{id}/resend` (token nuevo, invalida el anterior). El identificador (`slug`)
  no se cambia: decisión aparte si algún producto lo pide.
- **Test:** integración de cada caso de uso (permisos, último ADMIN, token anterior inválido); E2E.

### R4.5 · Borrado de la cuenta — `feat/account-deletion` ⬜ (D6 decidida)

- **Contenido (ADR 0019):** el esquema ya lo prevé (`users.anonymized_at`, `auth_user_id` nulo al
  borrar el acceso). Falta el flujo: solicitud con contraseña, plazo de gracia, job que borra el
  acceso, anonimiza `users.display_name` y desactiva las membresías; regla del último ADMIN;
  evento de negocio `user.deleted` para el CRM; exportación de los datos personales.
- **Test:** integración del job y de las reglas; E2E de la solicitud y su cancelación.

### R4.6 · Errores del navegador y accesibilidad — `feat/browser-errors-a11y` ✅ (2026-11-14)

- **Entregado:** `@sentry/browser` 11.9.0 (igual que `@sentry/node`) y `@axe-core/playwright` 4.14.0
  (solo desarrollo), ambas con más de 14 días (D8). `apps/web/src/client/browser-errors.ts`: SDK
  cargado de forma diferida solo si hay DSN, solo captura de errores (sin breadcrumbs, rendimiento
  ni grabación), recogida de datos desactivada y `scrubBrowserEvent` (quita cookies, cabeceras,
  cuerpos, usuario, extra y **query y fragmento de toda URL**: el token de invitación va en el
  fragmento). `SENTRY_BROWSER_DSN` (opcional, público por diseño) se lee en el layout raíz en cada
  petición, en `.env.example`, `compose.yml` y `infra/staging/.env.example`; el proxy añade su
  origen a `connect-src` (ADR 0008 enmendado, `docs/operations.md`). `error.tsx` reporta con el
  `digest`. Axe (WCAG 2.1 A y AA, falla con `serious` y `critical`) en `e2e/a11y.spec.ts`: pantallas
  públicas y de la aplicación (inicio, miembros, panel de invitar, cobros, 404) y todo el `site`.
- **Defectos reales que encontró axe, corregidos (sin relajar la regla):** el texto secundario
  `--foreground-lighter` daba 4,42:1 sobre `#f7f7f7` (ahora `#6b6b6b`, ≥ 4,5:1); los menús de
  organización y de cuenta tenían un nombre accesible que no contenía su texto visible
  (WCAG 2.5.3), ahora «Organización: <nombre>» y «Cuenta: <nombre>».
- **Tests:** unitarios de `scrubBrowserEvent` y `urlOrigin`; `e2e/browser-errors.spec.ts` (un
  error real llega al DSN sin el fragmento de la URL, sin lo escrito en el formulario, sin
  breadcrumbs ni cookies; la CSP deja llegar al DSN) y `e2e/a11y.spec.ts`. Verificado con
  Postgres 16 y Chromium locales: **24 de 24 E2E**, 121 unitarias, tipos, lint y formato;
  `pnpm audit --audit-level high` sin hallazgos altos (1 bajo y 6 moderados).
- **Límites conocidos:** un error que ocurra antes de que cargue el SDK (diferido tras la
  hidratación) no se reporta; el mensaje de una excepción puede contener texto que no controlamos;
  axe solo ve lo que renderiza cada recorrido, no sustituye una revisión manual.

- **Contenido (enmienda 0008):** errores del cliente a Sentry/GlitchTip con las mismas reglas de
  privacidad que el servidor (sin breadcrumbs, sin datos de formularios), DSN público servido en
  tiempo de ejecución (la imagen no lleva variables); comprobación con axe en los E2E de cada
  pantalla, que falla con infracciones graves.
- **Depende de R2.1:** la CSP debe permitir el envío al DSN.

## R5 — Operación y CI

### R5.1 · Actualización de dependencias — `chore/renovate` 🟡 (2026-11-14, falta activarlo)

- **Entregado:** `.github/renovate.json5` y la enmienda del ADR 0009 (política D9, límites y
  motivos). Cubre npm, acciones de GitHub (siguen fijadas por hash), imágenes de `Dockerfile` y
  `docker-compose`, la imagen de Trivy del CI (gestor `regex`) y la versión de pnpm del
  `Dockerfile`; la expresión de ambos gestores se probó contra los ficheros reales.
- **Verificado:** el fichero se lee como JSON5 (Prettier) y las dos expresiones extraen
  `ghcr.io/aquasecurity/trivy` `0.76.2` con su digest y `pnpm` `10.34.6`. **No verificado:** el
  validador oficial (`renovate-config-validator`) **no se pudo ejecutar** (descargar y ejecutar
  Renovate sin versión fijada fue denegado), y nada se ha probado contra Renovate real.
- **Para que funcione, falta una acción tuya:** instalar la app de GitHub de Renovate en el
  repositorio. El primer PR («Configure Renovate») o el panel de dependencias dirán si algún
  nombre de propiedad de la configuración necesita ajuste.

- **Problema:** todas las versiones están fijadas (ADR 0009) y nada las mueve.
- **Contenido (enmienda 0009):** configuración de Renovate según D9, incluidas las acciones de
  GitHub fijadas por hash y las imágenes base del `Dockerfile`.

### R5.2 · Imágenes en CI — `chore/ci-images` 🟡 (2026-11-14, sin ejecutar en CI)

- **Entregado en `.github/workflows/ci.yml`:**
  1. **Caché de capas entre ejecuciones:** `docker buildx` (driver `docker-container`) con
     `type=local` guardado con la `actions/cache` ya fijada por hash. Se exporta primero la
     etapa compartida `build` (imagen base, `pnpm fetch`, instalación), que reutilizan las cinco
     imágenes, y la caché se **reemplaza** en cada ejecución para que no crezca. Se descartó
     `type=gha` porque necesita otra acción. Aclaración sobre el plan: dentro de una misma
     ejecución las cinco imágenes ya compartían capas; lo que se perdía era la caché **entre**
     ejecuciones (runner nuevo cada vez).
  2. **Escaneo con Trivy 0.76.2** ejecutado desde su imagen **fijada por digest**
     (`sha256:8f6bb9…`, comprobado contra ghcr.io), falla con CRITICAL con arreglo disponible
     (`--ignore-unfixed`) en las cinco imágenes; base de datos de vulnerabilidades en caché.
     Una vulnerabilidad crítica con arreglo en una imagen base ajena (Node, Postgres) también
     rompe la CI hasta subir la base: es el comportamiento pedido.
  3. **SBOM CycloneDX** de cada imagen generado en `sbom/` y resumido en el resumen del job.
- **Primeras ejecuciones reales (2026-11-14):** el job se quedaba sin disco (se libera espacio
  del runner, se borra el constructor y cada imagen se vuelca una sola vez: primero el SBOM y el
  escaneo lee el SBOM). Ya ejecuta entero y encontró una crítica real en la imagen base de
  Postgres (`gosu`, CVE-2025-68121), aceptada por el usuario con caducidad en
  `.trivyignore.yaml` (ADR 0009). Las cuatro imágenes propias salen limpias.
- **Segundo fallo real (2026-11-14):** con la caché de capas restaurada, la capa de `pnpm fetch`
  no se ejecuta y el almacén de pnpm (un montaje de caché, que no viaja con las capas) llega
  vacío; la instalación `--offline` de la imagen del worker fallaba. Ahora usa
  `--prefer-offline`: descarga lo que falte, con el lockfile congelado fijando y verificando.
- **Pendiente:** publicarlo como **artefacto** necesita `actions/upload-artifact` fijada por
  hash; no la añadí porque resolver ese hash exige leer otro repositorio de GitHub (fuera del
  alcance de esta sesión) y no voy a inventarlo. Pásame el hash (o autoriza la consulta) y es un
  paso más.
- **No verificado:** **ningún cambio se ha ejecutado en GitHub Actions** (aquí no hay Docker ni
  Actions). Comprobado: el YAML es válido y pasa Prettier; el digest de Trivy existe en ghcr.io.
  El primer CI real puede pedir ajustes (permisos del socket de Docker, nombre de la caché, un
  hallazgo crítico real). Está en la rama sin fusionar en `staging`, así que no afecta a nadie
  hasta que se abra un PR o se fusione.

- **Cambio:** `docker buildx` con caché de capas de GitHub Actions (hoy cinco builds en frío),
  escaneo de las imágenes (Trivy, falla con críticas con arreglo disponible) y SBOM como artefacto.
  Acciones nuevas fijadas por hash, como las actuales.

### R5.3 · Parada limpia — `fix/graceful-shutdown` ✅ (2026-11-14)

- **Entregado (worker):** `installFatalHandlers` (`@saas/adapters/errors`, núcleo puro e
  inyectable en `errors/fatal.ts`): ante `uncaughtException` o `unhandledRejection` registra
  `fatal`, reporta con `captureError`, vacía con `flushErrors` y sale con 1 (Docker lo reinicia);
  solo atiende el primer fallo y la salida no depende de que el reporte funcione.
  `initErrorTracking({ manualProcessErrors })` quita las integraciones por defecto del SDK de
  Sentry para esos dos eventos en el worker, para no duplicar el reporte. La parada del worker
  captura el error de `worker.stop()`, lo registra y sale con 1, siempre tras vaciar los
  reportes. `/ready` comprueba también la conexión de pg-boss, no solo la de Prisma.
- **Descartado (web), comprobado a mano:** la web no necesita cierre propio. El `server.js`
  de Next ya atiende `SIGTERM`: cierra el servidor HTTP, deja terminar lo que está en vuelo y
  sale con 143. Prueba con la web compilada (standalone): una petición en vuelo al recibir
  `SIGTERM` terminó con 200, la parada tardó 0,28 s, salió con 143 y no quedó ninguna conexión
  en `pg_stat_activity`. Cerrar pg-boss o el pool desde un manejador propio cortaría las
  peticiones en vuelo que encolan trabajos, así que no se hace. Next ya instala sus manejadores
  de errores de proceso y el SDK de Sentry captura los suyos en la web.
- **Tests:** unitarios de `installFatalHandlers` (excepción, rechazo, no-Error, fallo del
  reporte, un solo fallo); a mano, un proceso con un rechazo sin atender: log `fatal` y código 1.
- **Hallazgo, resuelto (2026-11-14): el test inestable del worker era un límite real de
  rendimiento.** `registerWorker` pedía **un** trabajo por consulta y esperaba el intervalo de
  sondeo (2 s) tras cada uno: una cola movía como mucho `WORKER_CONCURRENCY / 2` trabajos por
  segundo (~1/s con el valor por defecto) por rápido que fuese el manejador. Una ráfaga de eventos
  o correos tardaba minutos en vaciarse; en la suite, los ~60 trabajos que dejaba
  `organizations.int.test.ts` retrasaban los del test del worker más de los 20 s de su espera
  (por eso fallaba ~50 % de las veces, también sin los cambios de R3.1, y suelto nunca). Se
  comprobó con los registros del worker: 2 trabajos cada 2 s. **Arreglo:** cada consulta toma
  hasta 5 trabajos que se ejecutan uno tras otro (como antes dentro de cada trabajador) y,
  mientras los lotes salgan llenos, se vuelve a consultar sin esperar (`burstWhenBatchFull`); cada
  trabajo se resuelve por separado (`perJobResults`), así que un fallo no reintenta a sus
  vecinos y los reintentos, la alerta de fallo definitivo y el estado `failed` funcionan igual.
  Tests nuevos en `packages/adapters/test/queue.int.test.ts` (40 trabajos vaciados en menos de
  8 s, que antes eran 10 de 40; y un fallo dentro de un lote). Suite de integración: 5 ejecuciones
  seguidas en verde (110 de 110) y 28 s en lugar de 53 s.

### R5.4 · Métricas — `feat/metrics` ⬜ (D10 decidida)

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
