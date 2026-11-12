import { redirect } from "next/navigation";

/**
 * `/dashboard` is no longer the landing page (UI-2,
 * docs/ui/LAYOUT_NAVIGATION.md §7): Inbox is — communication is the
 * product's center (docs/ARCHITECTURE.md §11). Kept as a redirect so old
 * links and bookmarks still land somewhere real. Auth is enforced by the
 * `(app)` layout before this ever renders, so an unauthenticated request
 * never reaches this redirect.
 */
export default function DashboardPage() {
  redirect("/inbox");
}
