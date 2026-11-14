import { notFound } from 'next/navigation'

/** Any path under a locale that no page handles: renders the locale's own 404 (with header and footer). */
export default function CatchAll() {
  notFound()
}
