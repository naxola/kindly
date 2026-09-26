# SUPABASE_REFERENCE.md — Qué estudiamos de Supabase y qué tomamos

Estudio hecho el 2026-09-26 sobre el repositorio oficial
`github.com/supabase/supabase` (rama por defecto, clon superficial). Fuentes
leídas:

- `apps/design-system/content/docs/*.mdx` — color-usage, theming,
  typography, tailwind-classes, accessibility, copywriting, icons.
- `apps/design-system/content/docs/ui-patterns/*.mdx` — layout, navigation,
  modality, forms, tables, empty-states.
- `apps/design-system/content/docs/fragments/*.mdx` — page-header,
  page-container, page-section, confirmation-modal, text-confirm-dialog,
  inner-side-menu, skip-to-content, filter-bar.
- `packages/ui/build/css/**`, `packages/config/tailwind.config.css`,
  `packages/config/css/*` — pipeline de tokens.
- `packages/ui/src/components/Button/Button.tsx`, `lib/constants.ts`,
  `components/shadcn/ui/{sheet,sidebar}.tsx`.
- `apps/studio/components/layouts/**` — `LayoutHeader`, `OrganizationLayout`,
  `OrganizationSettingsLayout`, `LayoutSidebar`, menús móviles.

**No se copia código ni aspecto visual.** Se extraen decisiones y se
reinterpretan para nuestro dominio. Si en el futuro hay que volver a
consultar, estas son las rutas.

## 1. Decisiones de Supabase y qué hacemos con cada una

| # | Decisión en Supabase | Por qué la toman | En Kindly |
|---|---|---|---|
| 1 | **Tokens en tres niveles**: primitivas → semánticos (`foreground`, `background`, `border`, `surface-100/200/300`, `overlay`, `control`) → utilidades Tailwind (`text-foreground-light`, `bg-surface-200`) | Cambiar el tema desde un sitio; soportar temas futuros | **Adoptado.** Misma estructura, nombres casi iguales (ver `TOKENS.md`) para que la gramática sea reconocible. Valores propios |
| 2 | Tokens exportados de **Figma** a JSON y transformados a CSS | Diseño y código comparten nombres | **Adaptado.** CSS es la fuente hoy; nombres compatibles con DTCG/Figma Variables; exportador en Fase 9 |
| 3 | Neutros y primario derivados de pocos *inputs* (hue, surface, contrast) en OKLCH | Temas y contraste ajustables globalmente | **Aplazado.** Demasiado sofisticado para un tema; usamos primitivas hex (lo que Figma Variables maneja). La capa semántica lo permitiría más tarde |
| 4 | Separan **primary** (acento funcional: botones, selección, foco) de **brand** (identidad fija) | El acento puede cambiar sin tocar la marca | **Adoptado.** `primary` = verde sello; `brand-*` reservado al sitio público |
| 5 | Primary "ink" oscurecido en light para cumplir AA; `primary-bright` para anillo de foco | Contraste de texto sin perder viveza del foco | **Adoptado** en espíritu: el verde de texto cumple AA; el anillo de foco tiene token propio (`ring`) |
| 6 | **Un único anillo de foco** compartido (`focus-ring`, `focus-inset` para filas) con `:focus-visible` | Reconocible, no se reinventa por componente | **Adoptado tal cual** como utilidades `focus-ring` / `focus-inset` |
| 7 | `focusableWhenDisabled` (`aria-disabled`) + tooltip con el motivo | Acciones no disponibles descubribles por teclado | **Adoptado** en `Button` (motivo obligatorio cuando no es obvio, p. ej. permisos DELEGATE) |
| 8 | Alturas de control por tamaño (`tiny` 26, `small` 34, `medium` 38…) compartidas por Button/Input/Select | Controles alineados en una fila | **Adoptado** como tokens `--control-h-*` (sm/md/lg) |
| 9 | Botón con variantes `primary`, `default`, `outline`, `dashed`, `text`, `link`, `danger`, `warning` | Jerarquía de acciones clara | **Adaptado**: `primary`, `default`, `outline`, `ghost`, `link`, `danger`. Sin `warning`/`dashed` hasta que haya caso |
| 10 | Iconos Lucide, siempre acompañando texto; nunca tintar de rojo el icono de una acción destructiva (el diálogo lo hace) | Iconos poco obvios por sí solos | **Adoptado** |
| 11 | **Anatomía de página**: `PageContainer` (anchura por contenido: small/default/full) → breadcrumbs → sub-nav → `PageHeader` (título, descripción, *aside*) → `PageSection` | Páginas consistentes sin decidir espaciados cada vez | **Adoptado** (ver `LAYOUT_NAVIGATION.md`) |
| 12 | Las acciones van "donde el usuario ya mira": en la fila de filtros si hay tabla filtrable; si no, en el *aside* del header | Menos viaje visual | **Adoptado** |
| 13 | Header con contexto encadenado `Org / Proyecto / Rama` como migas con desplegables | Siempre sabes en qué contexto estás | **Adaptado**: `Organización / Módulo / Página`. Sin conmutador de organización (una persona pertenece a una sola, `docs/DECISIONS.md` PKG-006) |
| 14 | Sidebar global contraíble a iconos (13 rem / 3 rem), hoja lateral en móvil | Espacio para contenido denso | **Adoptado** con nuestros anchos en tokens |
| 15 | Menú de producto (segundo nivel) por sección, y menú de ajustes de organización con secciones | Navegación contextual por módulo | **Adoptado** como `ContextNav` (ver `LAYOUT_NAVIGATION.md`) |
| 16 | Título del navegador del más específico al más general: `Entidad | Sección | Proyecto | Org | Supabase`, con un único formateador | Pestañas e historial legibles | **Adoptado**: `Entidad · Módulo · Organización · Kindly` vía helper único |
| 17 | *Skip to content* como primer foco, `<main>` sin la sidebar dentro | Teclado salta el chrome | **Adoptado** |
| 18 | Modalidad: **Dialog para tareas cortas, Sheet para formularios largos o vistas detalladas**; Sheet a la derecha por defecto | Interrumpir lo mínimo | **Adoptado**. La conversación es un Sheet (`CHAT.md`) |
| 19 | Familia de confirmaciones: `AlertDialog` (un párrafo), `ConfirmationModal` (más contexto), `TextConfirmDialog` (escribir el nombre para irreversibles) | Fricción proporcional al riesgo | **Adoptado** como un solo `ConfirmDialog` parametrizado con `confirmText` opcional (ver `COMPONENTS.md`) |
| 20 | Formularios en diálogo/sheet: si están sucios, cerrar pide "Descartar cambios" | No perder trabajo | **Adoptado** (el borrador de respuesta en el chat se conserva además por conversación, `CHAT.md`) |
| 21 | Errores de formulario en su ámbito: campo → junto al campo; envío → junto a las acciones; **toast solo para feedback no bloqueante** | El error aparece donde se actúa | **Adoptado** |
| 22 | Tablas: `Table` presentacional; `DataTable` (TanStack) solo con orden/filtro/paginación reales | No meter una librería para una lista | **Adoptado**. Sin TanStack hasta que un listado lo necesite |
| 23 | Empty states: *presentacional* (onboarding, con acción) vs *informativo* (misma forma que la lista), y "sin resultados" distinto de "sin datos" | Menos saltos de layout | **Adoptado** |
| 24 | Copywriting: verbos, consecuencias, sin disculpas, *sentence case* | Tareas rápidas | **Adoptado** y traducido (`PRINCIPLES.md` §5) |
| 25 | Dark mode por defecto en Studio | Público desarrollador | **Adaptado.** Tema oscuro aprobado para la Fase 8 con selector Claro / Oscuro / Sistema (por defecto Sistema), no oscuro por defecto. La capa semántica lo reduce a un bloque de CSS |
| 26 | Shadcn/Radix como primitivas | Accesibilidad resuelta (foco, ARIA, portales) | **Adoptado**: ya estaba en el stack de `docs/ARCHITECTURE.md` §13 |

## 2. Lo que conscientemente no tomamos

- La complejidad de su navegación multi-proyecto/rama: Kindly tiene un solo
  nivel de tenant (Organización).
- `Data Grid` y el editor de tablas: no hay caso de uso.
- El asistente AI lateral que *actúa* sobre el proyecto: contradice la regla
  "la AI no autoenvía". Nuestro copiloto vive dentro de la conversación como
  borrador revisable.
- El oscuro como tema *por defecto* y la estética "developer tool" (monoespaciado
  prominente, verde neón).
