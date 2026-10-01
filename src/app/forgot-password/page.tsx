"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/modules/auth/auth-client";
import { AuthShell } from "@/components/patterns/auth-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
    <AuthShell subtitle="Recuperar la contraseña">
      {sent ? (
        <p className="type-body text-foreground-light">
          Si <strong className="text-foreground">{email}</strong> tiene una cuenta en Kindly, te acabamos de enviar
          un enlace para elegir una contraseña nueva. Caduca en una hora. Revisa también la carpeta de spam.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="email" className="sr-only">
              Email de tu cuenta
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="Email de tu cuenta"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          {error && (
            <p role="alert" className="type-body text-destructive-soft-foreground">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={isSubmitting}>
            Enviar enlace
          </Button>
        </form>
      )}

      <Link href="/login" className="type-body text-foreground-lighter underline focus-ring rounded-sm w-fit">
        Volver a iniciar sesión
      </Link>
    </AuthShell>
  );
}
