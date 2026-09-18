import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/modules/auth/auth";
import { SignOutButton } from "@/app/dashboard/sign-out-button";

/**
 * Protected route used to prove the auth flow works end-to-end
 * (acceptance criterion 10 de PKG-001). Not product UI — the real Inbox
 * lands in a future package.
 */
export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold">Sesión activa</h1>
      <p className="text-sm text-zinc-600">
        {session.user.name} — {session.user.email}
      </p>
      <p className="text-xs text-zinc-400">
        Esta pantalla es solo la prueba de que el login funciona. El Inbox real
        llega en un paquete posterior (ver project/TASKS.md).
      </p>
      <div>
        <SignOutButton />
      </div>
    </main>
  );
}
