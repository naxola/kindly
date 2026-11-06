# 0006 — Entornos: local, staging en homelab, producción en Hetzner

**Estado:** Aceptado (2026-11-06)

## Decisión
| Entorno | Dónde | Datos | Correo | Notas |
|---|---|---|---|---|
| Local | Docker Compose en el equipo | BD de pruebas creada por los tests | Consola o sandbox | |
| Staging | Homelab con Coolify | Sintéticos | Resend en pruebas | Expuesto con Cloudflare Tunnel, sin abrir puertos |
| Producción | Hetzner con Coolify | Reales | Resend con dominio verificado | Copias cifradas fuera de Hetzner + PITR |

- **Misma imagen** en staging y producción: CI la construye una vez; producción
  despliega la imagen ya probada en staging, nunca la reconstruye.
- Migraciones compatibles hacia atrás (añadir antes de borrar), probadas en staging.
- Simulacro de restauración periódico. Una copia no restaurada no cuenta.
- La monitorización y las alertas de producción no dependen del homelab.
- Secretos fuera del repo y distintos por entorno.
- `Forgejo` del homelab como espejo del repositorio; GitHub sigue siendo el origen (CI).
