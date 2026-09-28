import { redirect } from "next/navigation";

/** Moved under `/organization/channels` in UI-7 (`docs/ui/ORGANIZATION.md`). */
export default function ChannelsRedirectPage() {
  redirect("/organization/channels");
}
