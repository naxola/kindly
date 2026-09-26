/**
 * First focusable element in the shell (docs/ui/ACCESSIBILITY.md §2). Off
 * screen until focused via Tab, then slides into view so a keyboard user
 * can jump past the header and sidebar straight to `<main id="main">`.
 */
export function SkipToContent() {
  return (
    <a
      href="#main"
      className="fixed top-2 left-2 z-(--z-skip-link) -translate-y-16 rounded-control bg-primary px-3 py-2 type-label text-primary-foreground transition-transform duration-(--duration-base) ease-standard focus:translate-y-0 focus-ring"
    >
      Saltar al contenido
    </a>
  );
}
