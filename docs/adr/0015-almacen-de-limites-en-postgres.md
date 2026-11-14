# 0015 — Almacén de límites de peticiones en Postgres

**Estado:** Propuesto (2026-11-14). Decisión D3 (Postgres, sin Redis) ya tomada por el usuario; este
documento detalla el diseño y las cifras que hay que validar. **No se implementa (R2.4) hasta que
el usuario lo valide.**

## Problema

El limitador propio (`apps/web/src/server/api/rate-limit.ts`) y el de Better Auth viven **en
memoria del proceso**: se pierden al reiniciar y no valen con dos réplicas (cada una cuenta por
separado). Además faltan límites por **usuario** y por **organización**: `POST /invitations` permite
enviar correo a direcciones arbitrarias sin tope.

## Decisión propuesta

1. **Tabla global `rate_limits`** (sin RLS de tenant, declarada en `GLOBAL_TABLES` con este ADR):
   `key` (texto, clave primaria), `window_start`, `count`. Ventana fija con una sola sentencia
   atómica, `INSERT … ON CONFLICT (key) DO UPDATE`, que reinicia el contador si la ventana venció.
2. **Claves sin datos personales:** `SHA-256(ámbito + identificador)` (IP, id de usuario o de
   organización), nunca la IP o el email en claro.
3. **Limpieza** por job programado (borra las ventanas vencidas hace más de 1 día).
4. **Better Auth** usa el mismo almacén (su opción de almacenamiento propio) para los límites de
   `/api/auth/*`; el limitador de `/api/v1` pasa a usarlo también.
5. **Límites nuevos:** general por sesión en `/api/v1` y **tope diario de invitaciones por
   organización**.

## Alternativas

- **Redis:** descartada por el ADR 0007 (un servicio más que mantener, sin necesidad hoy).
- **Seguir en memoria:** barata, pero incumple lo anterior en cuanto haya dos réplicas o un reinicio.
- **Tabla `rateLimit` de Better Auth:** resuelve solo `/api/auth`; no sirve a `/api/v1` ni a los
  límites por organización, y duplicaría el mecanismo.
- **Ventana deslizante** (una fila por petición): más justa, mucho más coste; la ventana fija
  basta para frenar abuso.

## Impacto

- Una consulta extra a Postgres por petición limitada (índice por clave primaria). Tabla pequeña y
  con limpieza; sin migración destructiva.
- **Política de fallo (decisión tuya):** si Postgres no responde al consultar el límite, ¿se deja
  pasar la petición (_fail-open_) o se rechaza (_fail-closed_)? Recomendación: **fail-open** salvo
  en los endpoints de acceso (`/api/auth/*`), donde se rechaza: es donde un fallo del limitador
  facilita fuerza bruta.
- Cambia `apps/web/src/server/api/rate-limit.ts` y la configuración de Better Auth.

## Decisiones que necesito de ti

- **Cifras por defecto** (SUPUESTO, ajustables luego): sesión en `/api/v1`: **300 peticiones por
  minuto**; acceso (`/api/auth/*`) por IP: las actuales; **invitaciones por organización: 50 al
  día**. ¿Te valen?
- **Política de fallo** de arriba (_fail-open_ con excepción en acceso, recomendado).
