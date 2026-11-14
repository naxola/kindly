# Plan para cerrar la plantilla (v1.1.0)

Revisión del estado a 2026-11-14, tras la sesión de robustez. Este archivo ordena **lo que falta
para dar la plantilla por terminada** y etiquetar `v1.1.0`. El detalle de cada bloque `R…` sigue
en [`plan-robustez.md`](plan-robustez.md); las fases anteriores, en [`roadmap.md`](roadmap.md).

## Dónde estamos

**Hecho y verificado** (integración con Postgres, E2E con Chromium, y el CI de GitHub en verde
para tests y E2E con Node 24 y Postgres 18):

- Fases 0 a 4c: acceso, organizaciones, cola y worker, web con sesión, web pública.
- Robustez: R1.1–R1.6, R2.1–R2.3, R3.1, R4.1, R4.2, R4.4, R4.6 y R5.3.
- El worker ya vacía un atasco a la velocidad del manejador (lotes de 5 con ráfaga).

**Hecho pero sin validar fuera de aquí:**

| Qué                              | Qué falta                                                                  |
| -------------------------------- | -------------------------------------------------------------------------- |
| Cobros con Paddle (B3, B5, R1.4) | Probar contra el **sandbox**: nunca se ha ejecutado contra Paddle          |
| CSP (R2.1)                       | Está en **modo informe**; pasar a bloqueante tras probar el checkout       |
| Observabilidad (fase 5)          | Validar en staging con GlitchTip, ntfy y Uptime Kuma                       |
| Despliegue en staging (fase 6)   | Aplicar las migraciones nuevas (`CHECK`, índice de invitaciones) con datos |
| Imágenes en CI (R5.2)            | Excepción de `gosu` caduca el 2026-12-14: subir Postgres a 18.7 antes      |
| Renovate (R5.1)                  | Instalar la app en el repositorio; sin validar con Renovate real           |

**Sin hacer:** R2.4, R2.5, R3.2, R3.3, R3.4, R3.5, R4.5, R5.4, R5.5 y el cambio de email (R4.3).

## Etapas

Cada etapa termina en `staging` con el CI en verde. El orden busca cerrar primero lo que puede
esconder fallos y dejar para el final lo que depende de decisiones externas.

### Etapa 0 — Estabilizar (antes de escribir nada nuevo)

1. **CI en verde.** Confirmar que el arreglo del job de imágenes funciona (disco del runner y un
   solo volcado por imagen). Mientras esté en rojo **no se publican imágenes** y staging no recibe
   nada de lo hecho desde R2.1.
2. **Desplegar en staging y comprobarlo:** ejecutar antes las consultas de la cabecera de la
   migración `20261114150000` (restricciones `CHECK`); revisar la `20261114140000` (revoca
   invitaciones duplicadas); comprobar el arranque, `/api/ready`, el worker y una invitación real.
3. **SBOM como artefacto:** fijar por hash `actions/upload-artifact` (necesita el hash).
4. **Renovate:** instalar la app y ajustar la configuración con lo que diga su primer PR.

_Necesita del usuario:_ el hash de la acción (o permiso para consultarlo), instalar Renovate y
confirmar que el despliegue de staging es el homelab con Coolify de `docs/deploy.md`.

### Etapa 1 — Validar las decisiones abiertas

Cinco ADR están en **Propuesto**, cada uno con sus preguntas al final. Sin validarlos no se
implementa nada de la etapa 2 que dependa de ellos (regla 1 de `CLAUDE.md`).

| ADR  | Bloque | Lo que hay que decidir                                                            |
| ---- | ------ | --------------------------------------------------------------------------------- |
| 0015 | R2.4   | Cifras por defecto y política de fallo del limitador                              |
| 0016 | R2.5   | Umbral de contraseñas filtradas, fallo abierto de HIBP, clave de cifrado del TOTP |
| 0017 | R3.4   | Supresiones solo por script; Resend como proveedor                                |
| 0018 | R3.5   | Solo ADMIN lee la actividad; plazo fijo en la función SQL                         |
| 0019 | R4.5   | Organizaciones unipersonales, id del actor en la auditoría, plazo con pago        |

Faltan por redactar dos enmiendas: la del **ADR 0012** para los contadores de uso (R3.3) y la del
**ADR 0008** para las métricas (R5.4, D10 ya decidida).

### Etapa 2 — Completar la funcionalidad

Orden propuesto, de menor a mayor riesgo y respetando dependencias:

| Orden | Bloque       | Contenido                                               | Depende de     | Tamaño  |
| ----- | ------------ | ------------------------------------------------------- | -------------- | ------- |
| 1     | R3.2         | Correos de impago a los administradores                 | —              | Pequeño |
| 2     | R2.4         | Límites de peticiones en Postgres; tope de invitaciones | ADR 0015       | Medio   |
| 3     | R3.5         | Lectura y retención de la auditoría                     | ADR 0018       | Medio   |
| 4     | R3.4         | Rebotes, quejas y supresión de correo                   | ADR 0017       | Medio   |
| 5     | R5.4         | Endpoint `/metrics` en web y worker                     | Enmienda 0008  | Medio   |
| 6     | R4.3 (resto) | Cambio de email de acceso                               | —              | Medio   |
| 7     | R2.5         | MFA TOTP, contraseñas filtradas, sesiones               | ADR 0016, R2.4 | Grande  |
| 8     | R4.5         | Borrado de cuenta y exportación de datos                | ADR 0019       | Grande  |
| 9     | R3.3         | Contadores de uso por periodo                           | Enmienda 0012  | Medio   |

Notas:

- R2.5 va después de R2.4 porque los intentos de código del segundo factor necesitan el
  limitador persistente.
- R3.3 va al final: es una optimización (hoy `recordUsage` suma los eventos en cada escritura) y
  solo importa con métricas de mucho volumen. Puede salir de `v1.1.0` si no hay tiempo.
- Cada bloque mantiene la regla: test que falla primero, integración y E2E, y axe en las pantallas
  nuevas.

### Etapa 3 — Validación externa (lo que solo se prueba con servicios reales)

1. **Paddle sandbox** (`docs/deploy.md`): alta de suscripción, renovación, impago, cancelación,
   cobro de excedente y el estado `CHARGING`. Quedan tres supuestos sin confirmar de R1.4
   (comprador sin cliente previo, `custom_data` en los eventos, `open` con `transactionId`).
2. **CSP bloqueante:** con el checkout probado, cambiar `CSP_HEADER` en los dos `proxy.ts` y pasar
   la suite. Hasta entonces la CSP solo informa.
3. **Observabilidad en staging:** un error real en GlitchTip (servidor y navegador), una alerta
   crítica en ntfy y el latido del worker en Uptime Kuma.
4. **Correo real:** verificación, recuperación e invitación enviados por Resend en staging.

_Necesita del usuario:_ credenciales del sandbox de Paddle y acceso al staging.

### Etapa 4 — Producción

Bloqueada por **D5** (dónde vive producción; ADR 0006 pendiente). Cuando se decida:

1. ADR de producción: ubicación, red, secretos, dominio y coste.
2. **R5.5:** copias cifradas fuera del sitio, **restauración probada** y anotada en el runbook,
   objetivos de pérdida y de recuperación. La retención de copias debe encajar con el borrado de
   cuentas (ADR 0019).
3. Compose o equivalente de producción y despliegue.

### Etapa 5 — Cierre y versión

1. Repasar los `SUPUESTO` del código y confirmarlos o cambiarlos: caducidad de invitaciones
   (7 días), gracia de impago (7 días), gracia del cierre de periodo (1 h), longitud de
   contraseña (12–128) y límites de acceso por IP.
2. Rellenar los `TODO` legales de `apps/site/src/site.config.ts` es cosa de **cada producto**, no de
   la plantilla: comprobar que el aviso «sin revisar» sigue saliendo mientras estén vacíos.
3. Actualizar `CLAUDE.md`, `README.md` y `docs/deploy.md` con lo añadido (variables nuevas, pantallas
   de ajustes, Renovate, métricas).
4. Revisión final del usuario, fusión en `main` (**solo el usuario**) y etiqueta `v1.1.0`.

## Defectos y cabos sueltos conocidos

Pequeños, sin bloque propio; se resuelven dentro de la etapa indicada.

| Qué                                                                                  | Etapa |
| ------------------------------------------------------------------------------------ | ----- |
| `site` decide Plausible al compilar: en la imagen sin `PLAUSIBLE_DOMAIN` nunca carga | 2     |
| `site`: una dirección sin idioma (`/xyz`) muestra el 404 por defecto de Next         | 2     |
| Archivar una organización no cancela su suscripción de pago (solo avisa)             | 3     |
| Quien sale de una organización no puede ser reinvitado, solo reactivado              | 2     |
| Archivar y salir no emiten evento de negocio (el CRM no se entera)                   | 2     |
| Un error del navegador anterior a la carga del SDK no se reporta                     | —     |
| Cambio de plan de una suscripción existente y créditos manuales (pendiente de B3–B5) | 3     |

## Fuera de `v1.1.0`

- **Sin Next.js (ADR 0013):** pospuesto por el usuario.
- **Prometheus y Grafana:** D10 los deja para un ADR propio; `v1.1.0` solo expone `/metrics`.
- **MFA obligatorio por organización y passkeys:** evolución del ADR 0016.
- **Particionado de la auditoría:** cuando el volumen lo pida (D7).
- **Centralizar logs** (Loki o Better Stack): con producción.

## Lo que necesito del usuario, en orden

1. Ver el CI y confirmar el despliegue de staging (etapa 0).
2. Validar los ADR 0015 a 0019 (etapa 1): es lo que más trabajo desbloquea.
3. Instalar Renovate y dar el hash de `actions/upload-artifact`.
4. Credenciales del sandbox de Paddle (etapa 3).
5. Decidir producción, D5 (etapa 4).
