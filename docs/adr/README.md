# Registro de decisiones (ADR)

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-monorepo-tres-apps.md) | Monolito modular en monorepo con `web`, `site` y `worker` | Aceptado |
| [0002](0002-multi-tenancy-rls.md) | Multi-tenancy: esquema compartido + RLS | Propuesto |
| [0003](0003-acceso-separado-de-negocio.md) | Acceso (`auth_*`) separado de los usuarios de negocio | Aceptado |
| [0004](0004-cola-y-worker.md) | Cola pg-boss con encolado transaccional y worker | Propuesto |
| [0005](0005-web-publica-y-contenidos.md) | Web pública separada; blog en MDX, CMS más adelante | Aceptado |
| [0006](0006-entornos.md) | Entornos: local, staging en homelab, producción en Hetzner | Aceptado |
| [0007](0007-stack-base.md) | Stack base: ORM, API, auth y UI | Propuesto |
| [0008](0008-observabilidad.md) | Observabilidad y alertas | Propuesto |

**Aceptado**: validado por el usuario. **Propuesto**: pendiente de validar; no se implementa hasta entonces.
Una decisión nunca se borra: se marca como *Sustituida por NNNN*.
