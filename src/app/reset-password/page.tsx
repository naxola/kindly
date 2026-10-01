import Link from "next/link";
import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";
import { AuthShell } from "@/components/patterns/auth-shell";

/**
 * PKG-012: where the emailed link lands. Better Auth checks the token first
 * (`/api/auth/reset-password/:token`) and redirects here with either
 * `?token=…` or `?error=INVALID_TOKEN` (expired, already used or mangled).
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <AuthShell subtitle="Elige una contraseña nueva">
      {error || !token ? (
        <>
          <p className="type-body text-foreground-light">
            Este enlace ya no sirve: caduca a la hora y solo se puede usar una vez. Pide uno nuevo.
          </p>
          <Link href="/forgot-password" className="w-fit type-body underline focus-ring rounded-sm">
            Pedir otro enlace
          </Link>
        </>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </AuthShell>
  );
}
