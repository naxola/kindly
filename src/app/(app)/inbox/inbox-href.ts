import type { InboxFilters } from "@/app/(app)/inbox/inbox-data";

/**
 * Builds an Inbox URL from its filters. Used from both a Server Component
 * (`[id]/page.tsx`'s `closeHref`, on a direct load) and the client
 * (`InboxList`'s navigation) — a plain function with neither `"use
 * client"` nor `"use server"`, so it stays callable from both without the
 * RSC-boundary trap `buttonVariants` hit in UI-4 (a function exported from
 * a `"use client"` file becomes client-only for the whole file, breaking
 * when a Server Component calls it directly instead of just rendering it).
 */
export function buildHref(pathname: string, filters: InboxFilters): string {
  const params = new URLSearchParams();
  if (filters.view !== "all") params.set("view", filters.view);
  if (filters.search) params.set("search", filters.search);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.delegateId) params.set("delegateId", filters.delegateId);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
