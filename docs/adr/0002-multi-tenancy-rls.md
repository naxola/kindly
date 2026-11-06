# 0002 — Multi-tenancy: esquema compartido + RLS

**Estado:** Propuesto

## Contexto
Una fuga de datos entre organizaciones es el fallo más grave posible. Basta un
`where organization_id` olvidado.

## Decisión (propuesta, igual que procurement)
- Esquema compartido; `organization_id NOT NULL` en toda tabla del tenant.
- Filtro explícito en cada consulta **y además** RLS forzado con la política
  `organization_id = current_setting('app.org_id')::uuid`.
- `withTenant(orgId, fn)`: transacción + `set_config('app.org_id', …, true)`.
- Roles de Postgres separados: aplicación (sin `BYPASSRLS`), migraciones y plataforma.
- El worker reconstruye el contexto a partir del `organizationId` del job.
- Un test falla si una tabla con `organization_id` no tiene RLS.
- Las tablas `auth_*` y `users` son globales (sin RLS de tenant); su acceso se
  controla en `core/identity`.

## Alternativas
- Solo filtro en la aplicación: sin red de seguridad.
- Esquema o BD por tenant: coste operativo excesivo.

## Consecuencias
- Cada petición abre una transacción; compatible con poolers en modo transacción.
- Las políticas RLS se escriben a mano en SQL en las migraciones.
