"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/modules/auth/auth-client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      Cerrar sesión
    </button>
  );
}
