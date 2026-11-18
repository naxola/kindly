# 0016 — Refuerzo del acceso: segundo factor, contraseñas filtradas y sesiones

**Estado:** Aceptado (2026-11-14, ajustado el 2026-11-15). El usuario validó el diseño: una
contraseña se rechaza si aparece **en cualquier brecha**; si Have I Been Pwned no responde **se
acepta** y se registra un aviso. **Ajuste del 2026-11-15, aceptado por el usuario:** el plugin de MFA
de Better Auth no admite una clave de cifrado propia (`MFA_ENCRYPTION_KEY`): cifra con el secreto de
la aplicación. En su lugar se usan los **secretos versionados** de Better Auth (`BETTER_AUTH_SECRETS`,
`2:nuevo,1:anterior`): el primero cifra y firma, los demás solo descifran, y así rotar el secreto no
invalida los segundos factores ya dados de alta. Amplía el ADR 0003. Implementado en R2.5.

## Problema

El acceso es solo email y contraseña. Una contraseña robada o reutilizada da acceso completo, no se
rechazan contraseñas ya filtradas en brechas públicas y la persona no puede ver ni cerrar sus
sesiones abiertas.

## Decisión propuesta

1. **Segundo factor TOTP, opcional por persona**, con el plugin de MFA de Better Auth:
   - El alta del factor se hace desde Ajustes → Cuenta: se muestra el secreto (QR y texto), se
     verifica con un primer código y solo entonces queda activo.
   - **10 códigos de recuperación**, de un solo uso, mostrados **una vez** al activarlo.
   - Con el factor activo, el inicio de sesión pide el código tras la contraseña. Desactivarlo
     exige contraseña y un código.
   - Los intentos de código tienen límite propio (comparte almacén con el ADR 0015 cuando exista).
2. **Tablas de acceso nuevas:** una para el secreto y los códigos de recuperación (cifrados) y una
   columna de «factor activo» en `auth_users`. Siguen la regla del ADR 0003: **solo las toca
   `packages/adapters/src/auth`**; el negocio no sabe si una persona tiene MFA.
3. **Rechazo de contraseñas filtradas** con k-anonimato de Have I Been Pwned: se envían a
   `api.pwnedpasswords.com` solo los **5 primeros caracteres del SHA-1** de la contraseña y la
   comparación se hace aquí; la contraseña y su hash completo no salen del servidor. Se aplica al
   registro, al cambio y a la recuperación de contraseña.
4. **Sesiones activas:** lista (dispositivo, fecha, la actual marcada) y cierre individual o de
   todas las demás, con los puntos de acceso que ya ofrece Better Auth; sin tabla nueva.

## Alternativas

- **Obligar a MFA en todas las cuentas:** más seguro, pero rompe el alta de quien aún no tiene
  autenticador y es una decisión de producto; D4 la deja para más adelante, por organización.
- **SMS o correo como segundo factor:** más débiles (SIM swapping, buzón comprometido) y un coste
  de envío; descartados.
- **Passkeys (WebAuthn):** mejor a largo plazo, pero un cambio mayor de flujo; queda como evolución.
- **Lista local de contraseñas comunes en vez de HIBP:** sin llamada saliente, pero cubre mucho menos.
- **Rechazar contraseñas filtradas con un umbral alto** (solo si aparecen muchas veces): deja pasar
  contraseñas ya comprometidas.

## Impacto

- **Una dependencia saliente nueva:** HTTPS a `api.pwnedpasswords.com` desde la web. En staging la
  red debe permitir ese host; **política de fallo:** si no responde, **se acepta la contraseña** y
  se registra un aviso (un fallo de un servicio externo no debe impedir registrarse).
- Migración aditiva en `auth_*`; un cambio en `packages/adapters/src/auth`; pantallas en Ajustes →
  Cuenta; `docs/operations.md` explica qué hacer si alguien pierde el autenticador y los códigos
  (recuperación asistida por una persona, fuera de la aplicación).
- **Clave de cifrado:** la de la aplicación, **versionada** (`BETTER_AUTH_SECRETS`, opcional; vacío
  = `BETTER_AUTH_SECRET` es la versión 1). Rotar = poner el nuevo delante y **dejar el anterior
  detrás mientras exista algo cifrado con él**; quitarlo antes rompe esos factores (hay un test).
  Rotar cierra además las sesiones (la cookie se firma con el primero). Sin `MFA_ENCRYPTION_KEY`.

## Decisiones tomadas (2026-11-14)

- ¿Rechazar la contraseña si aparece **en cualquier brecha** (recomendado) o a partir de un umbral?
- ¿**Fallo abierto** si HIBP no responde (recomendado)?
- ¿Te vale reutilizar `BETTER_AUTH_SECRET` para cifrar los secretos TOTP, o prefieres una variable
  propia (`MFA_ENCRYPTION_KEY`)? Una variable propia permite rotar una sin la otra, a costa de un
  secreto más que gestionar.
