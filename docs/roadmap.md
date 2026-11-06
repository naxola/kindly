# Roadmap de la plantilla

**Fase actual: 0, decisiones (validada el 2026-11-06).** Siguiente: fase 1.

`main` no existe todavía: se crea cuando el usuario valide la plantilla completa, con la etiqueta `v1.0.0`.

| Fase | Contenido | Estado |
|---|---|---|
| 0. Decisiones | `CLAUDE.md`, ADR 0001–0008 | ✅ Validada (2026-11-06) |
| 1. Esqueleto | Monorepo, `config`, `database`, script de fronteras, CI (lint, typecheck, tests) | ⚪ |
| 2. Acceso y organizaciones | `auth_*`, `users`, `organization_members`, invitaciones, RLS | ⚪ |
| 3. Worker | `JobQueue`, worker, correo asíncrono, eventos de negocio | ⚪ |
| 4. UI y web pública | `packages/ui`, shell de `web`, `site` con portada, blog MDX y legales | ⚪ |
| 5. Observabilidad | Errores, logs, health/ready, alertas | ⚪ |
| 6. Despliegue | Imágenes, compose local y staging, Coolify en el homelab (producción: ADR aparte) | ⚪ |
| 7. v1.0.0 | Validación del usuario, creación de `main` y etiqueta `v1.0.0` | ⚪ |
