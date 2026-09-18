import { requireCurrentOrganizationMember } from "@/modules/organizations/service";

export default async function DashboardPage() {
  const member = await requireCurrentOrganizationMember();

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Hola, {member.userName}</h1>
      <p className="text-sm text-zinc-600">
        {member.userEmail} — {member.organizationName} ({member.role})
      </p>
      <p className="mt-4 text-sm text-zinc-400">
        El Inbox real llega en un paquete posterior (ver project/TASKS.md).
        Mientras tanto: Contacts, Cases y Tasks en la barra de arriba.
      </p>
    </div>
  );
}
