"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/modules/auth/auth-client";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setIsSubmitting(true);
    const { error: authError } = await authClient.resetPassword({ newPassword: password, token });
    setIsSubmitting(false);

    if (authError) {
      setError(
        authError.code === "INVALID_TOKEN"
          ? "Este enlace ya no sirve: caduca a la hora y solo se puede usar una vez. Pide uno nuevo."
          : (authError.message ?? "No se pudo cambiar la contraseña."),
      );
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <>
        <p className="text-sm text-zinc-600">
          Contraseña cambiada. Por seguridad se han cerrado todas las sesiones abiertas con la anterior.
        </p>
        <Link href="/login" className="text-sm underline">
          Iniciar sesión
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        className="rounded border border-zinc-300 px-3 py-2 text-sm"
        type="password"
        placeholder="Contraseña nueva"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        minLength={8}
        autoComplete="new-password"
        required
      />
      <input
        className="rounded border border-zinc-300 px-3 py-2 text-sm"
        type="password"
        placeholder="Repite la contraseña"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        minLength={8}
        autoComplete="new-password"
        required
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Cambiar contraseña
      </button>
    </form>
  );
}
