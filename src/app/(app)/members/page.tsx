import { redirect } from "next/navigation";

/** Moved under `/organization/members` in UI-7 (`docs/ui/ORGANIZATION.md`). */
export default function MembersRedirectPage() {
  redirect("/organization/members");
}
