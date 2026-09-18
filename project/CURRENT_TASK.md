# CURRENT_TASK.md — Paquete activo

> Este es el archivo más importante para retomar el trabajo entre sesiones o
> con otro modelo. Se actualiza al terminar cada sesión, haya terminado o no
> el paquete.

## Paquete activo: ninguno — PKG-001 cerrado, PKG-002 por definir

`PKG-001 — Foundation` se completó y se verificó el 2026-09-18 (detalle más
abajo). Siguiendo las reglas de `CLAUDE.md` ("no empezar el siguiente paquete
sin definirlo primero"), **no hay ningún paquete de código en marcha ahora
mismo**. El siguiente paso es que el usuario decida qué entra en `PKG-002`
(candidatos naturales según `project/TASKS.md`: CRM básico —Contacts/Cases/
Tasks— o adelantar algo de Messaging core, ver Fases 2 y 3) y se defina ahí
mismo con Objective/Scope/Non-goals/Acceptance criteria/Tests/Exit criteria,
igual que se hizo aquí para PKG-001.

La Fase 0 (PoC manual de WhatsApp/Telegram) sigue pendiente y sin fecha, sin
relación con esto — ver sección propia más abajo.

---

## Registro: PKG-001 — Foundation (cerrado 2026-09-18)

### Objective

Poner en marcha la base técnica del proyecto (repositorio de código,
proyecto Next.js, base de datos, testing, lint/typecheck, CI) para que los
paquetes siguientes (CRM, Messaging, Knowledge, AI) tengan sobre qué
construir. No se implementa ninguna funcionalidad de producto todavía.

### Scope

- Inicializar/configurar Next.js + TypeScript (App Router) si todavía no
  existe en el repositorio.
- Configurar la estructura de carpetas del modular monolith descrita en
  `docs/ARCHITECTURE.md` sección 2 (`src/modules/{auth,organizations,
  contacts,conversations,messaging,cases,tasks,knowledge,ai,audit}`), como
  esqueleto de carpetas — no como módulos con lógica de negocio implementada
  salvo `organizations` (ver más abajo).
- Configurar PostgreSQL + Drizzle ORM: conexión, configuración de
  migraciones, Docker Compose para desarrollo local.
- Configurar infraestructura de testing (Vitest como mínimo para unit tests;
  Playwright puede quedar configurado pero sin suites todavía si no hay UI
  que probar en este paquete).
- Configurar lint (ESLint) y typecheck (`tsc --noEmit`) con scripts de npm.
- Configurar estructura inicial de `src/` acorde a lo anterior.
- Preparar configuración de desarrollo local: `.env.example`, instrucciones
  mínimas de arranque.
- Configurar GitHub Actions (lint + typecheck + test) si el repositorio va a
  vivir en GitHub — verificar remoto antes de asumirlo.
- Crear únicamente las tablas/modelos estrictamente necesarios para
  Foundation, según `docs/DATABASE.md` sección 3: `users`, `organizations`,
  `organization_members` (con su rol `ADMIN`/`DELEGATE` como columna/enum).
  Sin datos semilla de negocio, sin lógica de permisos más allá del propio
  esquema.
- **Better Auth configurado y funcional**: login/registro con email y
  contraseña, sesión persistida en PostgreSQL vía el adaptador de Drizzle, el
  modelo de usuario de Better Auth mapeado a la tabla `users` documentada (no
  una tabla `user` paralela). Una página mínima de login/registro sin diseño
  elaborado (eso es trabajo de un paquete de UI posterior) y una ruta
  protegida de prueba que confirme que la sesión funciona end-to-end.

### Non-goals (explícitamente fuera de PKG-001)

- UI real de producto (layout, navegación, Inbox, etc.) — solo lo mínimo
  para poder probar el login.
- Middleware o políticas de aislamiento multi-tenant en tiempo de ejecución
  (RLS, helpers de query) — PKG-001 solo deja las tablas con `organization_id`
  donde corresponde; la política de acceso se implementa cuando exista algo
  que proteger.
- Entidades de CRM (`Contact`, `Conversation`, `Case`, `Task`, `Activity`).
- Entidades de Messaging (`MessagingAccount`, `Message`, `WebhookEvent`) y
  cualquier `MessagingAdapter`.
- Cualquier código relacionado con WhatsApp o Telegram (la PoC de Fase 0 es
  manual y no forma parte de este paquete, ver `project/TASKS.md`).
- Knowledge (`Document`, `DocumentVersion`, `KnowledgeChunk`) y AI
  (`AISuggestion`, `LLMProvider`, `EmbeddingProvider`).
- Sentry / OpenTelemetry (se añaden cuando haya algo real que observar).
- Rate limiting.

### Acceptance criteria

1. El proyecto Next.js arranca en local (`npm run dev`) sin errores.
2. `npm run typecheck` pasa sin errores con TypeScript en modo estricto.
3. `npm run lint` pasa sin errores.
4. `npm test` ejecuta la suite de Vitest y pasa en verde.
5. Existe una migración de Drizzle que crea `users`, `organizations` y
   `organization_members`, aplicable contra una PostgreSQL local (vía Docker
   Compose) sin errores.
6. La estructura de carpetas de `src/modules/*` existe para los diez módulos
   documentados, cada uno como carpeta real en el repositorio (con al menos
   un archivo, p. ej. `README.md` o `index.ts`, para que Git la trackee),
   marcando claramente cuáles están vacíos/pendientes.
7. `organization_members.role` solo admite `ADMIN` o `DELEGATE` (constraint o
   enum a nivel de base de datos, no solo en TypeScript).
8. No existe ningún secreto en claro en el repositorio (`.env.example` con
   placeholders, `.env` real ignorado por Git).
9. `docs/DATABASE.md` sigue describiendo fielmente el esquema tras esta
   implementación (se actualiza si algo se ajusta respecto a lo ya escrito).
10. Un usuario puede registrarse (email + contraseña) y ver una cookie/sesión
    creada; puede cerrar sesión; una ruta protegida devuelve 401/redirect si
    no hay sesión y contenido si la hay.
11. La tabla de usuarios de Better Auth es la misma `users` documentada (con
    los campos adicionales que Better Auth requiera), no una tabla `user`
    duplicada.

### Tests

- Unit: validación de esquema/tipos de Drizzle para `users`, `organizations`,
  `organization_members` (p. ej. que el enum de rol rechace un valor
  inválido).
- Integration: al menos un test que levante la migración contra una
  PostgreSQL de test (o contenedor efímero) y verifique que las tablas
  existen con las columnas esperadas y que la relación
  `organization_members → users`/`organizations` tiene sus foreign keys.
- Integration: registro + login + acceso a ruta protegida contra la
  instancia real de Better Auth y una PostgreSQL de test (sin mockear
  Better Auth, ya que es infraestructura propia, no un proveedor externo).
- E2E (Playwright): un único flujo feliz, registro → login → ruta protegida
  → logout, porque ya existe una UI mínima que lo permite.

### Exit criteria — verificación final (2026-09-18)

- [x] Acceptance criteria 1-11: verificados manualmente (build, `next dev`,
      curl contra `/api/auth/*`, consultas SQL directas) y con la suite
      automatizada.
- [x] `npm run lint` — sin errores ni warnings.
- [x] `npm run typecheck` — sin errores.
- [x] `npm test` — 14 tests (2 archivos unit, 2 archivos integration) en
      verde, contra PostgreSQL real (`kindly_test`).
- [x] `npm run test:e2e` — 1 test Playwright en verde (registro → dashboard →
      logout → dashboard vuelve a pedir login).
- [x] `npm run build` — build de producción sin errores.
- [x] `project/TASKS.md` — puntos de PKG-001 marcados `[x]`.
- [x] `project/PROGRESS.md` — actualizado, PKG-001 completo, siguiente paso
      anotado.
- [x] Decisiones técnicas no triviales registradas en `docs/DECISIONS.md`
      (entradas del 2026-09-18): por qué no se usa el plugin `organization`
      de Better Auth, por qué no se usa `@better-auth/cli`, base de datos de
      test separada, vulnerabilidad moderada aceptada, bloque de Next.js en
      `CLAUDE.md`.
- [ ] Commit Git — pendiente, se hace a continuación de este mismo mensaje.

## Fase 0 — Validación técnica (PoC WhatsApp/Telegram) — estado aparte

**No forma parte de PKG-001 ni de ningún paquete de código.** Es trabajo
manual que ejecuta el usuario con sus propias cuentas de Telegram/WhatsApp y
dispositivos reales. El agente no debe intentar ejecutarla, simularla, ni
adelantar la implementación de `WhatsAppAdapter`/`TelegramAdapter` mientras
esté pendiente.

- **Estado:** pendiente, sin fecha.
- **Responsable:** el usuario.
- **Qué hacer cuando esté completa:** reportar el resultado (a mano o
  pidiéndole al agente que lo transcriba) para añadir la entrada
  correspondiente en `docs/DECISIONS.md`, según lo previsto en
  `docs/INTEGRATIONS.md` sección 3.
- **Bloquea:** solo el futuro paquete de integración de WhatsApp real (no
  bloquea PKG-001 ni previsiblemente los paquetes de CRM/Messaging core, que
  pueden construirse contra la interfaz `MessagingAdapter` sin una
  implementación concreta de proveedor).

## Estado

**Último commit antes de esta sesión:** `0f300a5` — "Añadir documentación
inicial de producto y arquitectura de Kindly" (solo documentación, sin
código).

**Esta sesión:** implementado `PKG-001 — Foundation` completo (ver registro
arriba) y se va a commitear a continuación. Actualiza este archivo con el
hash real en la próxima sesión si hace falta (`git log --oneline -1`).

**Tests:** 14 unit/integration (Vitest) + 1 E2E (Playwright), todos en verde.
Requieren PostgreSQL local corriendo (`docker compose up -d`) — sin eso,
`npm test` y `npm run test:e2e` fallan al no poder conectar, lo cual es
esperado, no un bug.

**Próxima acción concreta:** el usuario decide el alcance de `PKG-002` (ver
sección de arriba) y se documenta aquí siguiendo la misma plantilla que
`PKG-001`. No empezar a programar nada de CRM/Messaging/Knowledge/AI antes de
esa definición explícita.
