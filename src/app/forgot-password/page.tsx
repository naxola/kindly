"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/modules/auth/auth-client";

/**
 * PKG-012: ask for a reset link. The confirmation is the same whether or
 * not the address has an account — Better Auth answers identically, and so
 * does this page, so it can't be used to find out who is registered.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const { error: authError } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setIsSubmitting(false);

    if (authError) {
      setError(
        authError.status === 429
          ? "Demasiados intentos. Espera un minuto y vuelve a probar."
          : (authError.message ?? "No se pudo enviar la solicitud."),
      );
      return;
    }
    setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-xl font-semibold">Kindly</h1>
        <p className="text-sm text-zinc-500">Recuperar la contraseña</p>
      </div>

      {sent ? (
        <p className="text-sm text-zinc-600">
          Si <strong>{email}</strong> tiene una cuenta en Kindly, te acabamos de enviar un enlace para elegir una
          contraseña nueva. Caduca en una hora. Revisa también la carpeta de spam.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            type="email"
            placeholder="Email de tu cuenta"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Enviar enlace
          </button>
        </form>
      )}

      <Link href="/login" className="text-sm text-zinc-500 underline">
        Volver a iniciar sesión
      </Link>
    </main>
  );
}
