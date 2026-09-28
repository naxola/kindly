import { redirect } from "next/navigation";

/** Moved under `/organization/channels/connect/[channel]/coexistence` in UI-7 (`docs/ui/ORGANIZATION.md`). */
export default async function CoexistencePreflightRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ channel: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { channel } = await params;
  const { error } = await searchParams;
  redirect(`/organization/channels/connect/${channel}/coexistence${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}
