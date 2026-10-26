import { getCurrentOrganizationMember } from "@/modules/organizations/service";
import { countOpenRequests } from "@/modules/affiliates/requests";

/** Altas waiting for the admin — polled by the notifier so a new one shows up without reloading. ADMIN only. */
export async function GET() {
  const member = await getCurrentOrganizationMember();
  if (!member || member.role !== "ADMIN") {
    return new Response(null, { status: 404 });
  }
  return Response.json({ count: await countOpenRequests(member.organizationId) }, { headers: { "Cache-Control": "no-store" } });
}
