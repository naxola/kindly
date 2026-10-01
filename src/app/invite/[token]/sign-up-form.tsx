"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/modules/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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

    router.push("/inbox");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <Label htmlFor="email" className="sr-only">
          Email
        </Label>
        <Input id="email" type="email" value={email} readOnly />
      </div>
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

      {error && (
        <p role="alert" className="type-body text-destructive-soft-foreground">
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" loading={isSubmitting}>
        Aceptar invitación
      </Button>
    </form>
  );
}
