"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/modules/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
        <p className="type-body text-foreground-light">
          Contraseña cambiada. Por seguridad se han cerrado todas las sesiones abiertas con la anterior.
        </p>
        <Link href="/login" className="w-fit type-body underline focus-ring rounded-sm">
          Iniciar sesión
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <Label htmlFor="password" className="sr-only">
          Contraseña nueva
        </Label>
        <Input
          id="password"
          type="password"
          placeholder="Contraseña nueva"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          autoComplete="new-password"
          required
        />
      </div>
      <div>
        <Label htmlFor="confirmation" className="sr-only">
          Repite la contraseña
        </Label>
        <Input
          id="confirmation"
          type="password"
          placeholder="Repite la contraseña"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          minLength={8}
          autoComplete="new-password"
          required
        />
      </div>
      {error && (
        <p role="alert" className="type-body text-destructive-soft-foreground">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" loading={isSubmitting}>
        Cambiar contraseña
      </Button>
    </form>
  );
}
