# 0018 — Lectura y retención de la auditoría

**Estado:** Aceptado (2026-11-14). El usuario validó el diseño: **solo ADMIN** lee la actividad
(permiso `audit.read`) y el plazo de 24 meses queda **fijo en la función SQL**, no en una variable.
Pendiente de implementar (R3.5).

## Problema

`audit_logs` solo se escribe: nadie puede leerla desde el producto, y la tabla crece sin límite.
Es de solo inserción para `app_user` (ni `UPDATE` ni `DELETE`), por diseño del ADR 0002.

## Decisión propuesta

1. **Lectura:** permiso nuevo `audit.read` (solo `ADMIN`), `GET /api/v1/audit-logs` con
   **paginación por cursor** (`createdAt` + `id`) y filtros de acción, actor y fechas, siempre
   dentro de la organización activa (RLS + filtro explícito). Pantalla **Ajustes → Actividad**.
   No se muestran IP ni datos de `before/after` que el actor no deba ver (se define en la
   implementación y se prueba).
2. **Retención de 24 meses (D7)** con un job programado diario que llama a una **función SQL
   `SECURITY DEFINER`** (`audit_purge_older_than_24_months()`), propiedad de `app_migrator`, con
   `EXECUTE` solo para `app_user`. La función **no recibe el plazo**: está fijado dentro, de modo que
   un fallo o un abuso de la aplicación no puede borrar más de lo debido. Borra por lotes.
   `audit_logs` sigue sin permiso de `DELETE` para `app_user`.
3. **Particionado mensual:** no ahora. Se hará cuando el volumen lo pida (D7); entonces la
   retención pasa a eliminar particiones enteras. Se deja anotado el umbral orientativo
   (decenas de millones de filas) en `docs/operations.md`.
4. **La propia purga se audita** (una fila con el recuento borrado, sin tenant).

## Alternativas

- **Dar `DELETE` a `app_user`:** rompe la garantía de solo inserción. Descartada.
- **Borrar con el rol `app_platform`** (BYPASSRLS): obliga a que el worker tenga otra conexión con
  privilegios altos. Descartada: la función acotada es más segura y más simple.
- **Particionar ya:** más complejidad (migración y gestión de particiones) sin volumen que lo justifique.
- **Conservar para siempre:** coste creciente y datos personales retenidos sin necesidad (RGPD).

## Impacto

- Una migración con la función y sus permisos (aditiva); un permiso nuevo; una ruta (`api:generate`),
  una pantalla y un job (con su consumidor, como exige el test de jobs).
- El plazo de 24 meses queda en el SQL: cambiarlo es una migración nueva, a propósito.

## Decisiones tomadas (2026-11-14)

- ¿Confirmas que **solo ADMIN** puede leer la actividad (sin acceso para MEMBER)?
- ¿Te vale que el plazo esté **fijo en la función SQL** (recomendado) y no en una variable de entorno?
