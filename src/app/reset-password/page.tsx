import Link from "next/link";
import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";

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
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-xl font-semibold">Kindly</h1>
        <p className="text-sm text-zinc-500">Elige una contraseña nueva</p>
      </div>

      {error || !token ? (
        <>
          <p className="text-sm text-zinc-600">
            Este enlace ya no sirve: caduca a la hora y solo se puede usar una vez. Pide uno nuevo.
          </p>
          <Link href="/forgot-password" className="text-sm underline">
            Pedir otro enlace
          </Link>
        </>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </main>
  );
}
