# ORGANIZATION.md — La organización en la interfaz

## 1. Modelo mental

La `Organization` es el tenant: todo lo que el usuario ve pertenece a una
(y un usuario pertenece a una sola, PKG-006). En Supabase, la organización
es el nivel superior de la navegación (migas `Org / Proyecto`) y tiene su
propio espacio con menú contextual (General, Seguridad, Apps, Auditoría…).
En Kindly se adopta igual, sin proyectos: la organización es el **primer
nivel de las migas** y tiene un **módulo propio** en la sidebar.

No es "una página de ajustes": es el lugar donde se ve *quién* trabaja,
*con qué canales* y *con qué permisos*.

## 2. Presencia en la navegación

- Header: miga `Nombre de la organización ▾` siempre visible; su menú lleva
  a General / Miembros / Canales.
- Sidebar: ítem **Organización** (icono `Building2`), separado de los
  módulos de trabajo.
- Título del navegador termina en `· <Organización> · Kindly`.

## 3. Módulo `/organization`

`ContextNav` con:

| Ruta | Contenido | Quién |
|---|---|---|
| `/organization` (General) | Nombre, fecha de creación, tu rol, resumen (nº miembros, canales conectados y con incidencias, invitaciones pendientes) con enlaces | Todos ven; editar nombre solo ADMIN |
| `/organization/members` | Tabla de miembros (avatar, nombre, email, rol, "tú"), invitaciones pendientes, invitar | Todos ven miembros; invitaciones y acciones solo ADMIN |
| `/organization/channels` | "Mis canales" (conectar/desconectar los propios) + "Canales del resto de la organización" (solo ADMIN, lectura) | Todos (DELEGATE solo los suyos: `docs/DECISIONS.md` PKG-007) |
| (futuro) `/organization/roles` | Matriz de permisos ADMIN/DELEGATE, solo lectura | Cuando haya permisos configurables (hoy fuera de alcance, `CLAUDE.md` §8) |
| (futuro) `/organization/activity` | Registro de actividad (`activities`) filtrable | ADMIN |

## 4. Flujos y diálogos

| Acción | Componente | Detalle |
|---|---|---|
| Invitar miembro | `Dialog` (2 campos) desde el aside de Miembros | Email + rol (`NativeSelect`). Tras crear: el diálogo muestra el **enlace** con botón "Copiar enlace" (Kindly no envía emails de invitación todavía; la UI lo dice, `docs/DECISIONS.md` PKG-006). Cuando existan invitaciones por email, el mismo diálogo cambia el paso final |
| Revocar invitación | `ConfirmDialog` `danger` | "¿Revocar la invitación a x@y? El enlace dejará de funcionar." → "Revocar invitación" |
| Cambiar rol | `ConfirmDialog` | Solo ADMIN; no puede dejar la organización sin ADMIN (regla de dominio, el servidor la valida). *Requiere acción de servidor nueva — no existe hoy* |
| Quitar miembro | `ConfirmDialog` con `confirmText` (email) | *No existe en dominio hoy*; se diseña pero no se implementa hasta que el dominio lo soporte |
| Desconectar canal | `ConfirmDialog` `danger` | Consecuencia: "Dejarán de sincronizarse los mensajes de este número." Solo si el canal lo permite (`canDisconnect`); si no, texto explicativo en la tarjeta |
| Conectar canal | Flujo existente `/channels/connect/[channel]` (PKG-008), movido bajo `/organization/channels/connect/…` | Mantiene sus pasos y textos (E2E) |

Acciones no disponibles por rol: el botón se muestra deshabilitado con
`disabledReason` ("Solo un ADMIN puede invitar miembros.") cuando el
DELEGATE necesita saber que la acción existe; se oculta cuando no aporta
(p. ej. acciones de fila sobre otros miembros).

## 5. Qué no cambia

- Reglas de permisos y aislamiento: viven en `src/modules/organizations`
  y se validan en servidor; la UI solo refleja.
- Textos de los E2E de miembros y canales (`tests/e2e/members.spec.ts`,
  `channels.spec.ts`, `whatsapp-onboarding.spec.ts`) salvo actualización
  explícita en el mismo commit.
