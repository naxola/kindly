import { redirect } from "next/navigation";

/** Moved under `/organization/channels/connect/[channel]` in UI-7 (`docs/ui/ORGANIZATION.md`). */
export default async function ConnectChannelRedirectPage({ params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  redirect(`/organization/channels/connect/${channel}`);
}
