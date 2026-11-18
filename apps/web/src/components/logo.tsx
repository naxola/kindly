import { AppLink } from './link.tsx'

/** Product mark: the initial of the product name on the brand colour (brand.css). */
export function Logo({ name }: { name: string }) {
  return (
    <AppLink href="/" className="flex items-center gap-2 rounded-md px-1 text-sm text-foreground">
      <span
        aria-hidden
        className="flex size-6 items-center justify-center rounded-md bg-brand font-mono text-xs font-semibold text-brand-foreground"
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="hidden sm:inline">{name}</span>
    </AppLink>
  )
}
