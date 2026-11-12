# Despliegue — staging en el homelab

Staging corre en el homelab con Coolify (ADR 0006). Producción está por decidir: cuando se
decida, desplegará **las mismas imágenes** ya probadas en staging.

## Cómo llega una versión a staging

1. Merge en `staging` → el CI pasa las pruebas y construye cinco imágenes con el `Dockerfile`:

   | Imagen     | Qué es                                                                 |
   | ---------- | ---------------------------------------------------------------------- |
   | `postgres` | Postgres 18.6 con los roles `app_migrator`, `app_user`, `app_platform` |
   | `migrate`  | Paso único de cada despliegue: migraciones + tablas de la cola         |
   | `web`      | La aplicación (Next standalone), puerto 3000                           |
   | `worker`   | Cola, correos, eventos y alertas; salud en el puerto 3002              |
   | `site`     | La web pública, puerto 3001. Sus URLs van dentro de la imagen          |

2. El CI las arranca con `infra/staging/compose.yml` (prueba de humo: `/api/ready`, `/ready`
   del worker, la portada) y, si todo responde, las publica en
   `ghcr.io/naxola/kindly/<imagen>` con dos etiquetas: `staging` y `sha-<commit>`.
3. Coolify vuelve a desplegar el compose: arranca Postgres, ejecuta `migrate` y, solo si termina
   bien, arranca la web y el worker.

> La web pública está prerenderizada: sus URLs se fijan al construirla. Para publicar imágenes,
> el repositorio necesita las variables (GitHub → Settings → Secrets and variables → Actions →
> Variables) `STAGING_SITE_URL`, `STAGING_APP_URL` y, opcionalmente, `STAGING_PLAUSIBLE_DOMAIN`.
> Sin ellas el CI construye y prueba, pero no publica (deja un aviso).

## Primera puesta en marcha

### 1. Acceso a las imágenes

Las imágenes de un repositorio privado son privadas. En el servidor donde corre Coolify, inicia
sesión una vez con un token de GitHub de **solo lectura de paquetes** (`read:packages`):

```bash
docker login ghcr.io -u <usuario-github>
```

(Si tu versión de Coolify permite configurar el registro desde su interfaz, sirve igual.)

### 2. El recurso en Coolify

1. Nuevo recurso → **Docker Compose** desde el repositorio (o pegando el contenido de
   `infra/staging/compose.yml`).
2. Variables de entorno: las de `infra/staging/.env.example`. Contraseñas con
   `openssl rand -hex 24` (solo hexadecimal: van dentro de URLs de conexión) y
   `BETTER_AUTH_SECRET` con `openssl rand -base64 48`. Nunca en el repositorio.
3. Dominios: `web` → `app.staging.<dominio>` (puerto 3000), `site` → `www.staging.<dominio>`
   (puerto 3001). `APP_URL` debe coincidir con el dominio de `web`.
4. Desplegar. `migrate` debe terminar con «✔ database ready»; la web y el worker quedan
   `healthy`.

### 3. Exposición con Cloudflare Tunnel

Sin abrir puertos: el túnel de Cloudflare apunta al proxy de Coolify y Coolify enruta por
dominio. Sigue la guía de Coolify para Cloudflare Tunnel de tu versión; los dos dominios del
paso anterior deben resolver por el túnel. `postgres` y el puerto 3002 del worker **no** se
exponen.

### 4. Espejo en Forgejo

GitHub sigue siendo el origen (el CI vive allí). En Forgejo: _Nueva migración → GitHub_, marca
**espejo**, con un token de solo lectura. Forgejo sincroniza solo; nunca se hace push a él.

## Observabilidad autoalojada (ADR 0011)

Los tres servicios corren en el homelab como recursos propios de Coolify, fuera de este
compose (sirven a todos los productos):

| Servicio        | Para qué                                 | Qué configurar en el producto                                                             |
| --------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| **GlitchTip**   | Errores (protocolo Sentry)               | Un proyecto por producto → su DSN en `SENTRY_DSN`                                         |
| **ntfy**        | Alertas al móvil                         | `ALERT_PROVIDER=ntfy`, `NTFY_URL` (tema secreto) y `NTFY_TOKEN` si el tema está protegido |
| **Uptime Kuma** | ¿Responde? (monitor externo al producto) | Monitores de abajo; notificaciones por ntfy                                               |

Monitores de Uptime Kuma para cada producto:

- **HTTP** `https://app.staging.<dominio>/api/ready` (la web y su base de datos).
- **HTTP** `https://www.staging.<dominio>/es` (la web pública).
- **Push** para el worker: copia su URL en `HEARTBEAT_URL`. El worker la llama cada minuto
  mientras puede hablar con la base de datos; si deja de llamarla, Kuma avisa.

Las alertas de Kuma y las del worker llegan por el mismo tema de ntfy.

> Si el homelab se cae, se caen a la vez staging y quien vigila. Para staging es aceptable.
> Para producción hará falta al menos un vigilante fuera del homelab (ADR de producción).

## Pagos con Paddle (ADR 0012)

Staging usa **siempre el sandbox** de Paddle (claves `pdl_sdbx_…`). El adaptador sigue la
documentación de Paddle, pero no está probado contra Paddle hasta que hagas este recorrido:

1. En el panel de Paddle (sandbox):
   - Crea los productos y precios de los planes. Copia cada `pri_…` en el `providerPriceId`
     de su versión en `CATALOG`.
   - Crea un producto para el excedente (`pro_…` → `PADDLE_OVERAGE_PRODUCT_ID`).
2. Copia la clave de API (`PADDLE_API_KEY`) y el token de cliente (`PADDLE_CLIENT_TOKEN`).
3. Crea un destino de notificaciones hacia `https://app.staging.<dominio>/api/webhooks/payments`
   con los eventos `subscription.*`. Su secreto va en `PADDLE_WEBHOOK_SECRET`.
4. `PAYMENT_PROVIDER=paddle` y `PADDLE_ENVIRONMENT=sandbox` en Coolify (web y worker).
5. Comprueba, con una tarjeta de prueba de Paddle:
   - Contratar un plan desde _Ajustes → Plan y consumo_ deja la organización en ese plan.
   - El portal abre.
   - Un periodo cerrado con excedente aparece cobrado en Paddle.
   - Una firma inválida se rechaza (401 en los logs).

## Operación diaria

- **Fijar o volver a una versión:** `IMAGE_TAG=sha-<commit>` en Coolify y volver a desplegar.
  Las migraciones solo añaden (ADR 0006), así que volver atrás una imagen es seguro mientras no
  se haya borrado nada.
- **Estado de la cola y reintentos:** `pnpm ops:queue` desde un equipo con acceso a la base de
  datos (`docs/operations.md`).
- **Copias de seguridad:** los datos de staging son sintéticos y no se respaldan. Las copias de
  producción se definen en su ADR.
