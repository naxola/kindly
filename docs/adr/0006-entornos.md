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

## Pendiente (ADR de producción)

Ubicación, copias cifradas fuera del sitio con restauración probada, y
monitorización que no dependa del homelab.
