# 0014 — Enmienda al ADR 0012: cobros robustos (checkout en servidor, cobro en dos pasos, cierre completo)

**Estado:** Propuesto (2026-11-14). Pendiente de que el usuario valide D1, D2 y el uso tardío. La
implementación de R1.4–R1.6 ya existe en las ramas de trabajo (sin fusionar en `staging`) y se rehará si se
rechaza o cambia algo. Sale de la revisión técnica de `v1.0.0` (`docs/plan-robustez.md`, bloques
R1.4–R1.6). Si se acepta, el ADR 0012 pasa a remitir a este.

> Nota de numeración: el plan reserva 0014 para el almacén de límites (R2.4). Al aceptar este
> documento se renumerará el que llegue después; no hay referencias a 0014 en el código.

## Problema

Tres defectos del flujo de cobros, todos con efecto económico o de seguridad, y ninguno visible
hasta que un producto cobre de verdad:

1. **Checkout falsificable (R1.4).** `organizationId` viaja como `customData` desde el
   navegador. El token de cliente de Paddle es público: con él y un `priceId`, cualquiera puede
   abrir un checkout a nombre de otra organización, y `applyProviderEvent` sobrescribe la
   suscripción de esa organización sin comprobar que el evento es de la suscripción guardada.
2. **Doble cobro posible (R1.5).** `billingChargeHandler` envuelve en el mismo `try` el cargo al
   proveedor y la escritura de `CHARGED`. Si el cargo sale bien y la escritura falla, el periodo
   queda `CHARGE_FAILED`; el reintento manual que indica el runbook cobra otra vez.
3. **Periodos sin cerrar o mal cerrados (R1.6).** `duePeriods` solo devuelve el periodo
   anterior: con el worker parado más de un periodo, los intermedios no se cierran nunca. El
   cierre usa el plan actual, no el que regía en el periodo. Si la renovación llega antes del
   escaneo, el periodo anterior se cierra sin respetar la hora de gracia. El uso con
   `occurredAt` en un periodo ya cerrado se registra y no se factura jamás.

## Decisión propuesta

### 1. Checkout creado en el servidor (R1.4)

- `PaymentProvider.checkout` pasa a ser asíncrono: el servidor crea la transacción en Paddle con
  `custom_data.organizationId` y el navegador solo recibe el id de la transacción y abre el
  checkout con él. El navegador deja de enviar `organizationId` a Paddle.
- `applyProviderEvent` solo acepta un evento si su suscripción externa es la viva de la
  organización; una suscripción nueva solo se acepta si no hay ninguna o la actual está
  `CANCELED`. Lo demás se rechaza y queda auditado.
- El webhook comprueba que la organización existe antes de encolar.

### 2. Estado `CHARGING` (R1.5)

- Nuevo valor `CHARGING` en `BillingPeriodStatus` (migración aditiva), escrito y confirmado
  **antes** de llamar al proveedor. Solo un error del proveedor marca `CHARGE_FAILED`.
- Un periodo que se queda en `CHARGING` (cargo hecho o no, escritura final perdida) genera una
  alerta «comprobar en Paddle antes de reintentar», y `ops:queue retry` se niega a reintentarlo
  sin `--force`. El runbook (`docs/operations.md`) dice qué hacer con `CHARGING` y `CHARGE_FAILED`.

### 3. Periodos con su plan y cierre de todos los vencidos (R1.6, decisión D2)

- Nueva tabla `subscription_periods` (tenant, RLS): suscripción, inicio, fin, plan y versión que
  regían. Se escribe al empezar cada periodo (alta y cada renovación), no se deduce al cerrar.
- `duePeriods` recorre desde el último periodo cerrado hasta el corte (`now − 1 h`) y el cierre
  usa el plan guardado de cada periodo. Se corrige el caso de la renovación recién llegada.
- Uso en un periodo ya cerrado: **`recordUsage` lo rechaza** con un error de dominio claro
  (opción recomendada, ver alternativas).

## Alternativas

- **Checkout:** mantener `customData` del navegador y validar solo en el webhook. Evita cambiar
  el adaptador, pero deja que cualquiera dispare checkouts a nombre de otro y depende de
  rechazar después. Descartada por débil.
- **Cobro:** marcar `CHARGED` antes del cargo y revertir si falla. Peor: un fallo entre medias
  deja un periodo «cobrado» sin cargo. `CHARGING` hace visible la duda en vez de esconderla.
- **Plan por periodo:** deducirlo del historial de eventos del proveedor. Frágil con eventos
  desordenados; la tabla propia es la fuente de verdad, como el uso (ADR 0012 §1).
- **Uso tardío:** imputarlo al periodo abierto en vez de rechazarlo. No pierde el uso, pero
  factura en el periodo equivocado y oculta el problema de reloj o de cola. Si el usuario
  prefiere no perder nunca un evento de uso, se elige esta y el cierre lo marca en la línea.

## Impacto

- Migraciones aditivas: un valor de enum y una tabla con RLS (`rls.int.test.ts` la exige).
- Cambia el contrato del puerto `PaymentProvider` y la ruta de checkout: `pnpm api:generate`.
- Sigue **sin probarse contra el sandbox de Paddle**; el nuevo flujo de transacciones hay que
  contrastarlo con la documentación vigente antes de escribirlo.
- Antes de que ningún producto cobre con la plantilla.

## Decisiones que necesito de ti

- **D1:** ¿aceptas esta enmienda (los tres cambios juntos)?
- **D2:** ¿plan y versión guardados en `subscription_periods`, como se propone?
- Uso tardío: ¿rechazar (recomendado) o imputar al periodo abierto?
