"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/modules/auth/auth-client";

/**
 * Sign-up for an invited address (PKG-006). The email is fixed by the
 * invitation and not editable: it is what links the new account to the
 * invitation in the user-creation hook
 * (src/modules/organizations/bootstrap.ts). Let the reader change it and
 * they would silently end up as ADMIN of a brand-new empty organization
 * instead of joining the one that invited them.
 */
export function InvitationSignUpForm({ email }: { email: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: authError } = await authClient.signUp.email({ name, email, password });

    setIsSubmitting(false);

    if (authError) {
      setError(authError.message ?? "No se pudo completar el registro.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        className="rounded border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-500"
        type="email"
        value={email}
        aria-label="Email"
        readOnly
      />
      <input
        className="rounded border border-zinc-300 px-3 py-2 text-sm"
        type="text"
        placeholder="Nombre"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <input
        className="rounded border border-zinc-300 px-3 py-2 text-sm"
        type="password"
        placeholder="Contraseña"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        minLength={8}
        required
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Aceptar invitación
      </button>
    </form>
  );
}
