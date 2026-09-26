# TOKENS.md — Design tokens

**Fuente única:** `src/styles/tokens.css`, importado por `src/app/globals.css`.
**Guardas automáticas:** `tests/unit/ui-tokens.test.ts` (contraste WCAG de
cada par usado + prohibición de valores sueltos en los directorios migrados).
**Catálogo visual:** `/ui-kit` (autenticado, no enlazado en la navegación).

## 1. Arquitectura en tres capas

```text
Primitivas (--palette-*)      valores crudos, solo referenciados dentro de tokens.css
      │
      ▼
Semánticos (--foreground-light, --surface-200, --border-control, --primary…)
      │   qué significa el valor; esto es lo que cambia un tema (claro/oscuro)
      ▼
Utilidades Tailwind (@theme inline → text-foreground-light, bg-surface-200…)
      │   lo único que usan los componentes
      ▼
Componentes (Button, Field, Badge…) + tokens de componente (--control-h-md, --sheet-w-md, --z-modal)
```

Consecuencias:

- **Rebrand** = cambiar primitivas. **Tema oscuro** = redefinir la capa
  semántica bajo `[data-theme="dark"]` (aprobado, se implementa en la
  Fase 8; ver `ROADMAP.md`). **Densidad** = cambiar tokens de componente (`--control-h-*`).
  Ningún caso exige tocar componentes.
- Un componente **nunca** usa `--palette-*`, ni la paleta por defecto de
  Tailwind (`zinc-500`…), ni hex, ni `z-50`, ni `duration-150`, ni
  `h-[34px]`. El test lo impide en `src/components/` y `src/app/(app)/ui-kit`;
  cada fase añade al test los directorios que migra.

## 2. Inventario

### Color — superficies

| Token | Utilidad | Uso |
|---|---|---|
| `background` | `bg-background` | Fondo del contenido |
| `background-muted` | `bg-background-muted` | Sidebar, cabeceras de tabla, pies de Card, lienzo |
| `surface-100` | `bg-surface-100` | Cards al nivel de la página |
| `surface-200` | `bg-surface-200` | Lo que se superpone: dropdown, popover, dialog, sheet (se distingue por sombra) |
| `surface-300` | `bg-surface-300` | Apilado sobre 200; avatares, skeletons |
| `overlay` | `bg-overlay` | Velo detrás de Dialog/Sheet |
| `control` / `control-disabled` | `bg-control` | Fondo de inputs |
| `state-hover` / `state-selected` | `bg-state-hover` | Filas, ítems de menú, navegación |

### Color — texto y bordes

| Token | Contraste mínimo | Uso |
|---|---|---|
| `foreground` | AA | Texto principal, títulos |
| `foreground-light` | AA | Texto secundario, iconos de navegación |
| `foreground-lighter` | AA | Metadatos: fechas, canal, descripciones, placeholders |
| `foreground-muted` | **no AA (a propósito)** | Solo deshabilitado/decorativo |
| `foreground-inverse` | — | Sobre fondos sólidos oscuros |
| `border` | — | Divisores decorativos |
| `border-strong` | — | Hover, botón `default` |
| `border-control` | 3:1 | Borde de inputs (es su único límite visual, WCAG 1.4.11) |
| `ring` | 3:1 | Anillo de foco único |

### Color — acento y estados

Cada estado tiene la misma forma: sólido (`primary`, `destructive`,
`warning`, `success`, `info`), `-soft` (fondo), `-soft-foreground` (texto
sobre el soft, AA) y `-border`. `primary` y `destructive` añaden `-hover` y
`-foreground` (texto sobre sólido).

Tokens de dominio (no reutilizar para otra cosa aunque coincida el tono):
`evidence-sufficient|partial|insufficient`, `alert`, `bubble-inbound*`,
`bubble-outbound*`, `read-receipt`.

Alias heredados del sitio público (PKG-010): `ink`, `ink-soft`, `ink-faint`,
`paper`, `line`, `stamp`, `stamp-soft`. Ahora apuntan a primitivas. Único
cambio visual: `ink-faint` pasa de `#7a879e` (3,6:1, no cumplía AA) a
`#5b6880` (5,2:1 sobre `paper`).

### Tipografía

| Rol (`@utility`) | Tamaño / interlineado / peso | Figma |
|---|---|---|
| `type-page-title` | 20/28, 600, −0,012em | `type/page-title` |
| `type-section-title` | 15/22, 600 | `type/section-title` |
| `type-body` | 14/20, 400 | `type/body` |
| `type-label` | 13/20, 500 | `type/label` |
| `type-caption` | 12/16 | `type/caption` |
| `type-overline` | 11/16, 600, mayúsculas, +0,04em | `type/overline` |

Familias: `font-sans` (Inter, interfaz), `font-document` (Literata, solo
contenido documental: borradores del copiloto, citas, legales), `font-mono`
(Geist Mono: IDs, teléfonos, URLs técnicas). `text-2xs` (11px) solo para
`Kbd` y avatares pequeños.

### Radios, sombras

| Token | Valor | Uso |
|---|---|---|
| `radius-control` | 6px | Botones, inputs |
| `radius-card` | 8px | Cards, callouts |
| `radius-overlay` | 10px | Dialog, popover |
| `radius-bubble` | 12px | Burbujas de chat |
| `radius-xs…xl` | 2/4/6/8/12px | Escala base |
| `shadow-xs` | — | Botones, cards |
| `shadow-md` | — | Dropdown, popover |
| `shadow-lg` | — | Dialog, sheet |

Sombras teñidas de tinta (`--palette-shadow`), nunca negro puro.

### Dimensiones (tokens de componente)

| Token | Valor | Utilidad |
|---|---|---|
| `control-h-sm/md/lg` | 28/34/40px | `h-control-md`, `size-control-sm` |
| `touch-target-min` | 24px | `min-h-touch` (WCAG 2.2 2.5.8) |
| `header-h` | 48px | `h-header` |
| `sidebar-w` / `sidebar-w-collapsed` | 224/56px | `w-sidebar` |
| `context-nav-w` | 208px | `w-context-nav` |
| `inbox-list-w` | 384px | `w-inbox-list` |
| `sheet-w-sm/md/lg` | 384/560/720px | `max-w-sheet-md` |
| `dialog-w-sm/md/lg` | 400/512/640px | `max-w-dialog-sm` |
| `page-w-sm/md/lg` | 768/1024/1280px | `max-w-page-md` |
| `page-gutter` | 16 → 24 (md) → 32 (xl) | `px-gutter` (responsive por token) |

### Z-index (siempre `z-(--z-…)`)

`base 0 · sticky 10 · header 20 · sidebar 30 · overlay 40 · modal 50 ·
popover 60 · toast 70 · tooltip 80 · skip-link 90`. Un popover dentro de un
Sheet funciona porque popover > modal.

### Movimiento

`--duration-fast 100ms`, `--duration-base 150ms`, `--duration-slow 250ms`;
`ease-standard`, `ease-emphasized`. Animaciones con nombre: `fade-in/out`,
`slide-in/out-right|left`, `dialog-in/out`, `spin`, `pulse`.
`prefers-reduced-motion` las anula globalmente (`globals.css`). Regla: nada
espera a una animación; nunca se anima el foco.

### Breakpoints

`xs 480 · sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536` (los de Tailwind
más `xs`). Uso por superficie en `RESPONSIVE.md`.

## 3. Correspondencia con Figma

- Nombres de colecciones/variables en Figma = ruta del token con `/`:
  `color/foreground/light` ↔ `--foreground-light` ↔ `text-foreground-light`;
  `palette/ink/600` ↔ `--palette-ink-600`; `size/control/md` ↔
  `--control-h-md`; `radius/card`, `shadow/md`, `z/modal`.
- Dos colecciones: **Primitives** (un modo) y **Semantic** (modos `light`
  y, en el futuro, `dark`), con alias de Semantic → Primitives — la misma
  indirección que el CSS.
- Estilos de texto = roles `type/*` de la tabla de tipografía.
- Valores en hex (lo que Figma Variables maneja nativamente).
- **Pendiente (Fase 9):** script `scripts/export-tokens.ts` que genere un
  JSON en formato W3C DTCG desde `tokens.css`, importable con Tokens Studio
  o la API de Variables. Hasta entonces, el CSS es la fuente y Figma se
  sincroniza a mano con esta tabla.

## 4. Cómo añadir o cambiar un token

1. ¿Existe ya un semántico que exprese lo mismo? Úsalo.
2. Si no: primitiva (si hace falta un valor nuevo) → semántico → línea en
   `@theme inline` → fila en este documento.
3. Si es un par texto/fondo, añádelo a `PAIRS` en `tests/unit/ui-tokens.test.ts`.
4. Muéstralo en `/ui-kit`.
