# legacy/ — Kindly anterior a la migración

Copia mecánica (`git mv`, sin cambios de contenido) de la app de `master` en
`d03543e`, movida aquí en la fase M1a de `project/MIGRATION.md`.

- Sirve de **referencia para portar** cada módulo a la plantilla y de medida de
  lo que falta: cada fase borra de aquí lo que ya ha portado.
- Está **fuera** del workspace pnpm, de ESLint, Prettier, `tsc` y Vitest de la
  raíz, y su CI (`.github/workflows/ci.yml`) está inerte.
- No se modifica salvo para borrar lo portado. Se elimina entera en M13.
- Para ejecutarla de forma aislada: `cd legacy && npm ci && npm test`.
