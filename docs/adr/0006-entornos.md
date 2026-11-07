# 0006 — Entornos: local y staging en homelab; producción por decidir

**Estado:** Aceptado (2026-11-06)

## Decisión

| Entorno    | Dónde                       | Datos                              | Correo            | Notas                                             |
| ---------- | --------------------------- | ---------------------------------- | ----------------- | ------------------------------------------------- |
| Local      | Docker Compose en el equipo | BD de pruebas creada por los tests | Consola o sandbox | Desarrollo y pruebas                              |
| Staging    | Homelab con Coolify         | Sintéticos                         | Resend en pruebas | Expuesto con Cloudflare Tunnel, sin abrir puertos |
| Producción | **Por decidir**             | —                                  | —                 | Se decidirá en un ADR propio                      |

- CI construye la imagen una vez; staging despliega esa imagen. Cuando exista
  producción, desplegará la misma imagen ya probada en staging, sin reconstruirla.
- Migraciones compatibles hacia atrás (añadir antes de borrar), probadas en staging.
- Secretos fuera del repo y distintos por entorno.
- Forgejo del homelab como espejo del repositorio; GitHub sigue siendo el origen (CI).

## Concreción (fase 6, 2026-11-07)

- Un `Dockerfile` con un destino por proceso: `web`, `site`, `worker`, `migrate` y `postgres`
  (con los roles del ADR 0002). Imágenes en `ghcr.io/naxola/saas-template/<imagen>`, etiquetas
  `staging` y `sha-<commit>`, publicadas por el CI tras pasar las pruebas y una prueba de humo con
  el compose de staging.
- `migrate` es un paso único de cada despliegue (migraciones + tablas de la cola); la web y el
  worker no arrancan hasta que termina bien.
- **Excepción a «la misma imagen»:** la web pública está prerenderizada y sus URLs van dentro de
  la imagen, así que `site` se construye por entorno. El resto de imágenes no lleva nada del
  entorno: todo se lee al arrancar.
- Staging: `infra/staging/compose.yml` como recurso Docker Compose de Coolify. Guía en
  `docs/deploy.md`.

## Pendiente (ADR de producción)

Ubicación, copias cifradas fuera del sitio con restauración probada, y
monitorización que no dependa del homelab.
