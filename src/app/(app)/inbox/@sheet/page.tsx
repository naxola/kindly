/**
 * A *real* (non-intercepted) match for the bare `/inbox` segment — not
 * just `default.tsx`. Next.js only falls back to `default.tsx` on an
 * initial/hard load; a soft navigation (e.g. clicking the sidebar's
 * "Inbox" link while a conversation is open) to a URL with no matching
 * page in this slot leaves the slot showing whatever it last rendered
 * (documented in Next's parallel-routes guide, "Modals" section) — this
 * file is what actually closes the panel in that case.
 */
export default function Page() {
  return null;
}
