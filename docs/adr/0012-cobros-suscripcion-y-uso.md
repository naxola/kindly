# 0012 — Cobros: suscripción, uso medido y proveedor de pago

**Estado:** Aceptado (2026-11-08, el usuario pidió implementarlo).

## Contexto

Los productos del portafolio venden a empresas y particulares, en España y fuera. Cada producto
puede cobrar de una de estas formas, o combinarlas:

- **Solo suscripción**: cuota fija por periodo (mensual o anual).
- **Solo uso**: se paga lo que se consume.
- **Mixto** (modelo tipo Supabase): cuota fija que incluye unas cuotas de uso y, por encima,
  se cobra el excedente por unidad, con tope de gasto opcional.

Restricciones: un solo desarrollador, impuestos de muchos países (IVA de la UE con OSS e
inversión del sujeto pasivo, sales tax de EE. UU., etc.), facturación española (Verifactu,
fecha de obligación por confirmar con la gestoría), dinero sin coma flotante, sin efectos
económicos duplicados y aislamiento por organización (ADR 0002). Mover dinero exige una entidad
con licencia: el cobro siempre será un servicio externo (excepción del ADR 0011).

## Decisión propuesta

### 1. Tres piezas separadas

| Pieza                   | Qué hace                                                           | Dónde vive                                 |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| **Catálogo y derechos** | Planes, qué incluye cada uno y qué puede hacer una organización ya | Base de datos + configuración del producto |
| **Medición del uso**    | Contar el consumo por organización y métrica                       | Base de datos propia: **fuente de verdad** |
| **Cobro**               | Cobrar cuota y excedente, impuestos, facturas al cliente           | Proveedor, detrás de `PaymentProvider`     |

El uso lo cuenta la aplicación, no el proveedor: el cliente lo ve en tiempo real, los límites y
topes se aplican al momento y cambiar de proveedor no afecta a la medición. Al proveedor solo
se le envía el resumen de cada periodo cerrado.

### 2. Modelo de datos (todas las tablas con `organization_id` y RLS, salvo el catálogo)

- **`billing_metrics`** (catálogo, global): clave (`api_calls`, `storage_gb`…), unidad y forma
  de agregar: `sum` (llamadas), `max` o media por tiempo (almacenamiento), `unique` (usuarios
  activos). Las define cada producto.
- **`plans` / `plan_versions`** (catálogo, global): versión inmutable con precio fijo por
  periodo (puede ser 0), moneda, intervalo y, por métrica, cuota incluida, precio del excedente
  (vacío = sin excedente) y tipo de límite (`hard`: se bloquea al llegar; `soft`: se cobra el
  excedente). Subir precios = versión nueva; los clientes existentes conservan la suya.
- **`subscriptions`**: organización, versión del plan, estado (`trialing`, `active`, `past_due`,
  `canceled`), inicio y fin del periodo actual, tope de gasto opcional y la referencia externa
  del proveedor. Es el estado propio; los webhooks del proveedor lo actualizan.
- **`usage_events`**: solo se añaden. Organización, métrica, cantidad (decimal), instante y
  **clave de idempotencia única**. Se registran con `recordUsage(ctx, tx, …)` dentro de la
  transacción del efecto de negocio, como los eventos (ADR 0010).
- **`usage_daily`**: agregados por día, organización y métrica, calculados por un job.
- **`billing_periods`**: foto **inmutable** del cierre: por métrica incluido, usado, excedente,
  precio unitario e importe, más el total. Es lo que se envía al proveedor y lo que se audita.
- **Créditos y ajustes**: líneas manuales con actor, motivo y auditoría; nunca se edita un
  periodo cerrado.

Dinero: `Decimal` y una moneda por organización. Instantes en UTC; los periodos se anclan a la
fecha de inicio de la suscripción y tienen un corte fijo para eventos que llegan tarde.

### 3. Derechos, separados de los permisos

El rol dice qué puede hacer una persona; el plan, qué puede hacer la organización. Junto a
`authorize(actor, permiso)` se añade `checkEntitlement(ctx, función | métrica)`, que lee la
suscripción y el uso agregado. Un plan no concede permisos ni un permiso concede funciones.

### 4. Topes y avisos

Avisos al 80 % y al 100 % de cada cuota y del tope de gasto (correo y evento de negocio). Con
límite `hard` la acción se rechaza con un error de dominio claro; con `soft` se permite y se
cobra. El tope de gasto, si existe, convierte el excedente en `hard` al alcanzarlo.

### 5. Jobs (worker, idempotentes)

- Agregación diaria de `usage_events` → `usage_daily`.
- Cierre de periodo: calcula y guarda `billing_periods` una sola vez (clave: suscripción + periodo).
- Envío del excedente al proveedor con la misma clave de idempotencia.
- Cuadre mensual: lo calculado frente a lo cobrado por el proveedor; una diferencia es una alerta.
- Impagos: `past_due` → periodo de gracia (configurable) → restricción del servicio, nunca
  borrado de datos.

### 6. Proveedor

`PaymentProvider` en `packages/adapters`: crear el pago o la suscripción, abrir el portal del
cliente, registrar un cargo por excedente y traducir los webhooks (verificados por firma y
procesados en el worker) a cambios de `subscriptions`.

- **Primer adaptador propuesto: Paddle** (vendedor registrado: calcula, cobra y declara los
  impuestos de cada país y factura al cliente; el producto factura una vez al mes a Paddle).
  Coste ~5 % + 0,50 $ por transacción. El uso se cobra como cargo añadido al cerrar el periodo,
  calculado por la aplicación.
- **Stripe** como segundo adaptador si un producto lo necesita (empresas que exigen factura
  española, transferencia o domiciliación SEPA). Con Stripe el vendedor es el producto: IVA,
  facturas y Verifactu pasan a ser responsabilidad propia.
- **Comprobar antes de elegir:** cómo registra Paddle hoy los cargos por uso en una suscripción,
  y si el servicio de vendedor registrado de Stripe está disponible para la cuenta y admite uso.
- **Lago** (autoalojable, medición y tarificación por uso) queda como alternativa si la
  tarificación se vuelve compleja; el puerto lo permite sin rehacer los productos.

### 7. Qué es plantilla y qué es producto

- **Plantilla**: el motor genérico (tablas, `recordUsage`, agregación, `checkEntitlement`,
  cierre de periodo, topes, puerto y adaptadores, pantalla de plan y uso, webhooks).
- **Producto**: sus métricas, sus planes y sus precios. La plantilla no trae precios inventados
  (regla de `CLAUDE.md`).

## Fases propuestas

Cada una se valida por separado y es útil por sí misma.

| Fase | Contenido                                                                                      | Cobra |
| ---- | ---------------------------------------------------------------------------------------------- | ----- |
| B1   | Catálogo, versiones de plan, `subscriptions` en plan gratuito, `checkEntitlement`, límites     | No    |
| B2   | `recordUsage`, agregación diaria, panel de uso del cliente, avisos de cuota                    | No    |
| B3   | `PaymentProvider` + Paddle: pago, portal, webhooks → estado de la suscripción, cambios de plan | Sí    |
| B4   | Cierre de periodo, cobro del excedente, tope de gasto                                          | Sí    |
| B5   | Cuadre, impagos y gracia, créditos y ajustes manuales con auditoría                            | Sí    |

Cambios de plan: subir de plan se aplica al momento con prorrateo del proveedor; bajar, al final
del periodo.

## Alternativas consideradas

- **Medir y tarificar en el proveedor** (contadores de Stripe): menos código, pero el uso queda
  fuera de la base de datos propia, ata al proveedor y no sirve con Paddle.
- **Solo Stripe desde el inicio**: comisiones menores, pero carga fiscal internacional propia.
- **Lago desde el inicio**: resuelve la tarificación compleja, pero añade un servicio pesado
  (Rails, Redis, ClickHouse opcional) sin necesidad actual.

## Impacto

- Tablas nuevas con RLS y migraciones, jobs nuevos en el worker, pantallas de plan y uso.
- Un evento de uso por acción facturable: volumen a vigilar; la agregación diaria lo mantiene
  acotado y los eventos antiguos se pueden archivar tras cerrar el periodo.
- Riesgo principal: errores de cálculo con efecto económico. Se mitiga con la foto inmutable
  del cierre, la idempotencia y el cuadre mensual.

## Implementación

### B1 + B2 (2026-11-08)

Diferencias con la propuesta, por simplicidad:

- **El catálogo vive en código** (`core/billing/catalog.ts`, `defineCatalog`), no en tablas: no
  hay pantalla para editar planes y los precios se revisan en git. `defineCatalog` valida al
  arrancar que cada plan define la cuota de cada métrica, que los límites flexibles tienen
  precio de excedente y que el plan por defecto es gratuito. Las versiones publicadas no se
  editan; la foto del cierre (B4) guarda además los precios aplicados.
- **Sin tabla de agregados diarios todavía**: el consumo del periodo se calcula con una consulta
  agregada sobre `usage_events` (índice por organización, métrica e instante). La tabla diaria
  se añadirá cuando el volumen lo pida (regla de no añadir infraestructura sin necesidad).
- Sin suscripción guardada, la organización está en el plan por defecto y su periodo es el mes
  natural (UTC).
- `recordUsage` serializa por organización y métrica (bloqueo de transacción), es idempotente
  por clave y, con límite estricto, rechaza el efecto (`QUOTA_EXCEEDED`, HTTP 402) para que la
  transacción del llamador se deshaga entera.
- Avisos al 80 % y al 100 %: evento `usage.threshold_reached` y correo a los ADMIN activos, una
  vez por periodo, métrica y umbral.
- Permisos nuevos `billing.read` y `billing.manage` (solo ADMIN). Pantalla _Ajustes → Plan y
  consumo_.

### B4 (2026-11-08)

- **Cierre**: un job programado cada hora (`billing.close-due-periods`, minuto 7, UTC) obtiene
  las organizaciones con suscripción mediante `app.organizations_with_subscription()` (función
  `SECURITY DEFINER` que solo devuelve ids; las tablas mantienen su RLS) y encola un cierre por
  organización, que se ejecuta en su contexto de tenant.
- Un periodo se cierra cuando ha terminado y ha pasado **1 hora de margen** para el uso que
  llega tarde (SUPUESTO). Se cierra una sola vez (única por suscripción y periodo) y guarda una
  **foto inmutable**: plan y versión, precio fijo de referencia, una línea por métrica (usado,
  incluido, unidades de excedente, precio unitario e importe redondeado a céntimos, mitad hacia
  arriba), total de excedente, tope y **importe a cobrar**. La aplicación solo puede cambiar el
  estado de cobro (`status`, `provider_charge_ref`, `charged_at`); el resto está protegido con
  permisos por columna.
- Estados: `NO_CHARGE`, `PENDING_CHARGE` (lo cobrará el proveedor, B3), `CHARGED`,
  `CHARGE_FAILED`. Auditoría y evento `billing.period_closed`.
- **Tope de gasto** por suscripción (ADMIN, `billing.manage`): limita el importe a cobrar y
  `recordUsage` rechaza el uso que lo superaría (`SPEND_CAP_REACHED`).
- Si el plan cambia a mitad de periodo, el cierre aplica el plan vigente al cerrar. Si el worker
  estuviera caído más de un periodo entero, solo se cierra el último (anotado).

### B3 + B5 (2026-11-08)

Basado en la documentación de Paddle Billing consultada el 2026-11-08 (endpoints, firma y
eventos). **No está probado contra el sandbox de Paddle**: no se declara operativo hasta
hacerlo (`docs/deploy.md`).

- **Puerto `PaymentProvider`** en core y adaptador Paddle en `@saas/adapters/payments`:
  - **Pago:** con Paddle.js en el navegador. El servidor devuelve el precio, el token público
    y `customData.organizationId`, que Paddle copia a la suscripción.
  - **Portal del cliente:** `POST /customers/{id}/portal-sessions`.
  - **Cargo del excedente:** `POST /subscriptions/{id}/charge` con
    `effective_from: immediately` y un precio fuera de catálogo en céntimos, asociado al
    producto `PADDLE_OVERAGE_PRODUCT_ID`.
  - **Webhooks:** firma `Paddle-Signature` (HMAC-SHA256 de `ts:cuerpo`, rotación de secreto,
    5 s de tolerancia).
- **Webhook** `POST /api/webhooks/payments`: fuera de `/v1`, sin sesión. Solo verifica la
  firma y encola el evento normalizado (`billing.provider-event`, idempotente por id de
  evento). El worker lo aplica a `subscriptions`: plan por `providerPriceId`, estado, periodo
  y cancelación programada. Ignora eventos más antiguos que el último aplicado, porque llegan
  desordenados y al menos una vez. Un precio desconocido hace fallar el job, y con ello salta
  la alerta.
- **Cobro del excedente** (`billing.charge-period`) tras cada cierre con importe pendiente.
  **Sin reintentos automáticos**, porque Paddle no documenta idempotencia: si falla queda
  `CHARGE_FAILED` con alerta de fallo definitivo, y se reintenta a mano tras revisar Paddle.
  Un periodo ya `CHARGED` no se vuelve a cobrar.
- **Impagos (B5)**:
  - `PAST_DUE` guarda desde cuándo.
  - Durante 7 días de gracia (SUPUESTO, `PAYMENT_GRACE_DAYS`) se mantiene el plan.
  - Después se aplica el plan por defecto (`restricted`) hasta que el proveedor confirme el
    pago, sin borrar datos, con un aviso en la pantalla.
  - `paused` se trata como cancelado.
- **Pantalla**: contratar un plan de pago (si no hay suscripción), «Gestionar suscripción»
  (portal) y aviso de pago pendiente.

**Pendiente:**

- Cambiar de plan una suscripción existente (API de actualización de Paddle, sin estudiar
  todavía). Hoy se gestiona en el portal o en Paddle.
- Créditos y ajustes manuales: necesitan un operador de plataforma, que la plantilla no tiene.
- Cuadre automático contra las transacciones de Paddle. Hoy lo cubren la alerta de cobro
  fallido y `pnpm ops:queue`.

### SUPUESTOS (configurables, a confirmar)

- Proveedor del primer adaptador: **Paddle**.
- Periodo de gracia por impago: **7 días**.
- Planes **mensuales y anuales** desde la primera versión (el catálogo admite ambos).

## Pendiente de decidir por el usuario

- Confirmar o cambiar los SUPUESTOS de arriba.
