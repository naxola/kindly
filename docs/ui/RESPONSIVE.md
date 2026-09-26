# RESPONSIVE.md — Estrategia responsive

Breakpoints (tokens, `TOKENS.md`): `xs 480 · sm 640 · md 768 · lg 1024 ·
xl 1280 · 2xl 1536`. Diseño *mobile-first* en CSS, pero la app es
**escritorio-primero en prioridad**: el uso principal es en el despacho;
el móvil es consulta rápida y respuesta puntual. Nada puede romperse a
320 px.

## Por superficie

| Superficie | `< md` (móvil) | `md–lg` (tablet) | `lg+` (escritorio) |
|---|---|---|---|
| Header | Botón menú + título del nivel actual + volver; usuario en icono | Migas abreviadas | Migas completas + ⌘K |
| Sidebar | Oculta; Sheet izquierdo desde el header | Contraída a iconos | Expandida (contraíble, cookie) |
| ContextNav | Fila horizontal con scroll bajo el título | Fila horizontal | Columna vertical `w-context-nav` |
| Page gutter | 16 px | 24 px | 24 → 32 px (`xl`) |
| Listas / tablas | Tablas → lista de tarjetas-fila (columnas secundarias ocultas); acciones en menú `⋯` | Columnas secundarias ocultas | Completas |
| Formularios | Una columna, botones `block` | Una/dos columnas | `Field layout="horizontal"` en ajustes |
| Dialog | Casi pantalla completa (margen 16 px), acciones apiladas | Centrado | Centrado |
| Sheet (general) | `w-full` | `max-w-sheet-md` | `max-w-sheet-md/lg` |
| Conversación | Pantalla completa, "← Volver", compositor fijo abajo con `safe-area` | Sheet `w-full` hasta `md`, luego `sheet-md` | Sheet `md` (`lg` en `2xl`) |
| Inbox | Lista a ancho completo, filtros tras botón "Filtros" | Vistas en `SegmentedControl` | ContextNav de vistas + lista |

## Reglas

- Nada de scroll horizontal de página; solo dentro de contenedores
  explícitos (ContextNav horizontal, tablas anchas con `overflow-x-auto`
  y cabecera visible).
- Alturas con `dvh` en overlays a pantalla completa (teclado virtual).
- Objetivos táctiles ≥ 44 px en filas y navegación en `pointer: coarse`.
- Los textos no se truncan hasta el punto de perder el dato clave: el
  nombre del contacto siempre visible, la preview se trunca.
- Cada fase verifica 320, 768, 1024 y 1440 px (capturas en la PR/sesión).
