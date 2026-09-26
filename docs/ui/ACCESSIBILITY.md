# ACCESSIBILITY.md — Requisitos de accesibilidad

Objetivo: **WCAG 2.2 AA**. La accesibilidad es parte de la API de cada
componente; una fase no está terminada si su checklist falla.

## 1. Checklist por cambio (adaptado de Supabase)

- ¿Todo lo interactivo se alcanza y activa con teclado, en orden lógico?
- ¿El foco se ve (`focus-ring` / `focus-inset`) y nunca se pierde (se
  devuelve al cerrar overlays)?
- ¿Las acciones no disponibles son descubribles y explican por qué?
- ¿Todo tiene nombre accesible (labels, `aria-label` en botones de icono)?
- ¿Los cambios dinámicos importantes se anuncian (live regions)?
- ¿El texto cumple contraste (tokens, `tests/unit/ui-tokens.test.ts`)?
- ¿Funciona a 320 px de ancho y con zoom al 200%?

## 2. Foco

- Un solo indicador: utilidades `focus-ring` (controles, contorno exterior)
  y `focus-inset` (filas y superficies densas). Son `outline`, no
  `box-shadow`, para sobrevivir al modo de colores forzados de Windows.
  Solo `:focus-visible`. Nunca `outline-none` sin sustituto. Nunca se anima.
- `SkipToContent` es el primer elemento enfocable del shell y apunta a
  `<main id="main" tabIndex={-1}>`, que **no** contiene la sidebar.
- Dialog/Sheet modales: focus trap (Radix), foco inicial explícito (campo
  principal o título), `Esc` cierra, foco devuelto al disparador.
- Navegación entre rutas: el foco va al `h1` de la página nueva (o al
  `main`), para que el lector anuncie el cambio.
- Listas largas (`DataList`): roving tabindex — una sola parada de Tab para
  la lista, flechas/`J`/`K` dentro.

## 3. Deshabilitado con motivo

`Button disabled disabledReason="…"`: mantiene el botón en el orden de
tabulación con `aria-disabled`, bloquea la activación y enlaza el motivo
por `aria-describedby`. Para restricciones importantes, además un `Alert`
visible en la página (el tooltip no basta). Botones deshabilitados sin
motivo solo cuando la causa es evidente (formulario vacío).

## 4. Semántica y ARIA

- Landmarks: `header`, `nav aria-label="Principal"`, `nav` contextual con
  el nombre del módulo, `main`. Un `h1` por página.
- Estado activo de navegación: `aria-current="page"`.
- Formularios: siempre `Field` (label asociado, descripción y error por
  `aria-describedby`, `aria-invalid`). Placeholder nunca sustituye a label.
- Iconos decorativos `aria-hidden`; botones solo-icono con `aria-label`.
- Badges y colores: el color nunca es la única señal (texto o icono).
- Contadores: `CountBadge` lleva el significado ("3 mensajes sin leer").
- Tablas: `th` con `scope`, columna de acciones con cabecera `sr-only`.
- Live regions: errores de envío `role="alert"`; confirmaciones y nuevos
  mensajes `aria-live="polite"`; `Alert live` solo tras acción del usuario.
- Carga: contenedor con `aria-busy` y texto `sr-only` que dice qué carga.
- Idioma: `<html lang="es">` (ya presente).

## 5. Tamaños de interacción

- Mínimo 24×24 px (WCAG 2.2 2.5.8, token `--touch-target-min`). Los
  controles `sm` (28 px) cumplen; los iconos sueltos se envuelven en
  `Button size="icon-sm"`.
- En pantallas táctiles, las filas de lista miden ≥ 44 px.

## 6. Movimiento

`prefers-reduced-motion: reduce` anula animaciones y transiciones
(`globals.css`). Ninguna información depende de una animación.

## 7. Verificación

- Automática: contraste de tokens (unit). Fase 8 añade `@axe-core/playwright`
  a los E2E de los flujos principales (Inbox, conversación, organización).
- Manual por fase: recorrido solo con teclado, lector de pantalla (NVDA /
  VoiceOver) en Inbox y conversación, zoom 200%, 320 px.
