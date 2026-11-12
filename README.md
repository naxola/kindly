# Kindly

SaaS multi-tenant (CRM + bandeja unificada + casos + base de conocimiento +
AI Copilot) para profesionales que atienden a sus afiliados por WhatsApp y
Telegram. Producto descrito en [`docs/PRODUCT.md`](docs/PRODUCT.md).

**Base:** parte de [`naxola/saas-template`](https://github.com/naxola/saas-template)
**`v1.0.0`** (monorepo pnpm: `apps/web`, `apps/site`, `apps/worker`, `packages/*`).
Kindly añade solo su negocio sobre esa fontanería; las versiones nuevas de la
plantilla se traen con `git merge` desde el remoto `template`.

> **Migración en curso** (`migration/saas-template`): la app anterior (Next.js +
> Drizzle) vive en [`legacy/`](legacy/README.md) y se va portando por fases.
> Plan y estado: [`project/MIGRATION.md`](project/MIGRATION.md).

- Reglas de trabajo: [`CLAUDE.md`](CLAUDE.md)
- Qué toca ahora: [`project/CURRENT_TASK.md`](project/CURRENT_TASK.md)
- Decisiones de producto: [`docs/DECISIONS.md`](docs/DECISIONS.md); de la plantilla: [`docs/adr/`](docs/adr/README.md)
- Operación: [`docs/operations.md`](docs/operations.md). Despliegue: [`docs/deploy.md`](docs/deploy.md).

## Puesta en marcha en local

### Requisitos (una vez)

- **Node 24.21.0** (fijado en `.node-version`; `fnm` o `nvm` lo eligen solos).
- **Docker** en marcha (Postgres).
- **pnpm 10.34.6** vía corepack:

```bash
corepack enable
```

### 1. Código y dependencias

```bash
git checkout migration/saas-template
```

```bash
git pull origin migration/saas-template
```

```bash
pnpm install
```

### 2. Variables de entorno

Primera vez:

```bash
cp .env.example .env
```

Si ya tenías un `.env`, comprueba qué le falta y cópialo de `.env.example` (los valores del
ejemplo valen en local):

```bash
pnpm env:check
```

### 3. Base de datos

Postgres en el puerto 5441, con los roles y las bases `saas`, `saas_test` y `saas_shadow`:

```bash
pnpm infra:up
```

```bash
pnpm db:generate
```

```bash
pnpm db:deploy
```

Tablas de la cola (siempre después de `db:deploy`):

```bash
pnpm queue:install
```

Cliente tipado de la API (la web lo necesita para compilar; no está en git):

```bash
pnpm api:generate
```

### 4. Arrancar

```bash
pnpm dev
```

- App: http://localhost:3000
- Web pública: http://localhost:3001
- Worker: en la misma terminal; salud en http://localhost:3002/health

### 5. Probarlo a mano

1. Regístrate en http://localhost:3000/sign-up.
2. En local los correos no se envían: el worker los imprime en la terminal
   (`EMAIL_PROVIDER=log`). Copia de ahí el enlace de verificación.
3. Crea una organización e invita a alguien desde _Ajustes → Miembros_ (el enlace también
   sale en la terminal).
4. _Ajustes → Plan y consumo_ muestra el plan gratuito.
5. Estado de las colas y fallos (`docs/operations.md`):

```bash
pnpm ops:queue
```

### 6. Comprobaciones (las mismas que el CI)

```bash
pnpm lint
```

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm test:integration
```

Los E2E necesitan Chromium la primera vez:

```bash
pnpm exec playwright install chromium
```

```bash
pnpm test:e2e
```

### Opcional en local

- **Errores y alertas** (ADR 0008 y 0011): `SENTRY_DSN` (GlitchTip), `ALERT_PROVIDER=ntfy` y
  `NTFY_URL` en `.env`, y reiniciar `pnpm dev`.
- **Pagos** (ADR 0012): `PAYMENT_PROVIDER=paddle` y las variables `PADDLE_*` de
  `.env.example`, siempre con el sandbox. Paddle necesita una URL pública para avisar del
  pago, así que es más cómodo probarlo en staging.

## Staging en el homelab

Guía completa en [`docs/deploy.md`](docs/deploy.md). En resumen:

1. GitHub → _Settings → Secrets and variables → Actions → Variables_: `STAGING_SITE_URL` y
   `STAGING_APP_URL`. Sin ellas el CI construye y prueba las imágenes, pero no las publica.
2. Un push a `staging` (o relanzar el CI) publica las imágenes en
   `ghcr.io/naxola/saas-template/*` con las etiquetas `staging` y `sha-<commit>`.
3. En el servidor de Coolify, una vez, con un token de GitHub de solo lectura de paquetes
   (`read:packages`):

   ```bash
   docker login ghcr.io -u <usuario-github>
   ```

4. Coolify:
   - Recurso Docker Compose con `infra/staging/compose.yml`.
   - Variables de `infra/staging/.env.example`. Contraseñas con `openssl rand -hex 24` y
     `BETTER_AUTH_SECRET` con `openssl rand -base64 48`.
   - Dominios: `web` → puerto 3000, `site` → puerto 3001.
5. Desplegar: `migrate` termina con «✔ database ready»; `web` y `worker` quedan `healthy`.
6. Cloudflare Tunnel: los dos dominios hacia el proxy de Coolify.
7. Uptime Kuma: un monitor HTTP a `https://app…/api/ready` y otro a `https://www…/es`, y un
   monitor _Push_ para el worker cuya URL va en `HEARTBEAT_URL`.
8. Observabilidad: GlitchTip y ntfy como recursos de Coolify, y sus datos en `SENTRY_DSN`,
   `ALERT_PROVIDER` y `NTFY_URL`.
9. Pagos: sección «Pagos con Paddle» de `docs/deploy.md`, siempre en sandbox.
