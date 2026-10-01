"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/modules/auth/auth-client";
import { AuthShell } from "@/components/patterns/auth-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Login/register (PKG-001). Placeholders double as the visible design —
 * kept exactly as before — but each field now has a real (visually hidden)
 * `<label>` too: previously there was none at all, just a placeholder
 * standing in for it (docs/ui/AUDIT.md, the exact anti-pattern `Field`
 * exists to avoid elsewhere). Kept as plain `Label`+`Input`, not `Field`:
 * this form has one shared error message, not a per-field one.
 */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: authError } =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ name, email, password });

    setIsSubmitting(false);

    if (authError) {
      setError(authError.message ?? "No se pudo completar la operación.");
      return;
    }

    router.push("/inbox");
    router.refresh();
  }

  return (
    <AuthShell subtitle={mode === "sign-in" ? "Inicia sesión" : "Crea una cuenta"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {mode === "sign-up" && (
          <div>
            <Label htmlFor="name" className="sr-only">
              Nombre
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Nombre"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
        )}
        <div>
          <Label htmlFor="email" className="sr-only">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="password" className="sr-only">
            Contraseña
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </div>

        {mode === "sign-in" && (
          <Link href="/forgot-password" className="self-end type-caption text-foreground-lighter underline focus-ring rounded-sm">
            ¿Has olvidado tu contraseña?
          </Link>
        )}

        {error && (
          <p role="alert" className="type-body text-destructive-soft-foreground">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" loading={isSubmitting}>
          {mode === "sign-in" ? "Entrar" : "Crear cuenta"}
        </Button>
      </form>

      <Button
        type="button"
        variant="link"
        className="w-fit"
        onClick={() => {
          setError(null);
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
        }}
      >
        {mode === "sign-in" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
      </Button>
    </AuthShell>
  );
}
