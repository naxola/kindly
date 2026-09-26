# docs/ui — Fuente de verdad de UI/UX de Kindly

Esta carpeta es **la fuente de verdad para cualquier decisión de interfaz**.
Si el código y estos documentos discrepan, uno de los dos está mal: o se
corrige el código, o se actualiza el documento registrando por qué (y, si es
una decisión no trivial, se añade entrada en `docs/DECISIONS.md`).

Amplía la estructura de contexto que ya usa el proyecto (`CLAUDE.md` →
`project/` → `docs/`): aquí vive el **qué y el porqué** de la interfaz; el
**estado** de cada fase vive en `ROADMAP.md` (resumen) y en
`project/CURRENT_TASK.md` / `project/TASKS.md` (detalle operativo), como el
resto de paquetes.

## Orden de lectura para una IA que retoma el trabajo de UI

1. `project/CURRENT_TASK.md` — qué fase/paquete de UI toca ahora.
2. `ROADMAP.md` — fases, estado, criterios de aceptación y qué no tocar.
3. `PRINCIPLES.md` — cómo se decide cuando nada está especificado.
4. `TOKENS.md` y `COMPONENTS.md` — antes de escribir **cualquier** JSX.
5. El documento del área concreta: `LAYOUT_NAVIGATION.md`,
   `ORGANIZATION.md`, `INBOX.md`, `CHAT.md`.
6. `ACCESSIBILITY.md` y `RESPONSIVE.md` — son requisitos de cada componente,
   no una fase posterior.
7. `AUDIT.md` — foto del punto de partida (Fase 0), útil para saber qué
   código es "legado" pendiente de migrar.
8. `SUPABASE_REFERENCE.md` — qué se estudió del repositorio de Supabase y
   qué se adoptó, adaptó o descartó.

## Índice

| Documento | Contenido |
|---|---|
| [`PRINCIPLES.md`](PRINCIPLES.md) | Principios de UI/UX, criterio de decisión, voz y copy |
| [`SUPABASE_REFERENCE.md`](SUPABASE_REFERENCE.md) | Análisis del design system de Supabase y qué tomamos |
| [`AUDIT.md`](AUDIT.md) | Fase 0: auditoría del estado actual |
| [`TOKENS.md`](TOKENS.md) | Design tokens: capas, nombres, valores, correspondencia con Figma |
| [`COMPONENTS.md`](COMPONENTS.md) | Catálogo de componentes, API, estados y reglas de uso |
| [`LAYOUT_NAVIGATION.md`](LAYOUT_NAVIGATION.md) | Shell (header + sidebar), anatomía de página, navegación contextual |
| [`ORGANIZATION.md`](ORGANIZATION.md) | La organización como eje de navegación: miembros, roles, ajustes |
| [`INBOX.md`](INBOX.md) | Diseño operativo de la bandeja |
| [`CHAT.md`](CHAT.md) | Conversación (WhatsApp/Telegram) en Sheet lateral |
| [`ACCESSIBILITY.md`](ACCESSIBILITY.md) | Requisitos de accesibilidad por componente y por página |
| [`RESPONSIVE.md`](RESPONSIVE.md) | Breakpoints y estrategia por superficie |
| [`ROADMAP.md`](ROADMAP.md) | Fases 0–9 con objetivo, alcance, criterios y estado |

## Reglas rápidas (lo mínimo si solo lees esto)

- **Nada de valores visuales sueltos** en componentes: colores, radios,
  sombras, alturas, z-index y duraciones salen de tokens
  (`src/styles/tokens.css`). Un test (`tests/unit/ui-tokens.test.ts`) lo
  comprueba en `src/components/`.
- **Antes de crear un componente, busca en `src/components/ui/`** y en
  `COMPONENTS.md`. Si existe algo que resuelve el caso, se usa o se extiende
  con una variante; no se crea un gemelo.
- **Las tres reglas del producto mandan sobre la estética** (`CLAUDE.md` §2):
  la AI nunca autoenvía (ninguna UI puede tener un "enviar sugerencia" de un
  clic sin revisión), la identidad del canal es del delegado, y lo normativo
  lleva fuente, versión, vigencia y `EvidenceLevel` visibles.
- **Copy en español en la UI**, nombres de componentes/props/tokens en
  inglés (`CLAUDE.md` §1).
- **Los textos visibles son contrato con los E2E** (`tests/e2e/`). Cambiar un
  texto, un rol ARIA o una URL obliga a actualizar el spec en el mismo
  commit. Ver "Qué no debe modificarse" en `ROADMAP.md`.
