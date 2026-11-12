import Link from "next/link";
import { getInvitationByToken } from "@/modules/organizations/invitations";
import { InvitationSignUpForm } from "@/app/invite/[token]/sign-up-form";
import { AuthShell } from "@/components/patterns/auth-shell";

/**
 * Public invitation page (PKG-006). Outside the `(app)` group on purpose:
 * whoever opens it has no session yet, by definition.
 *
 * Every non-usable state is explained rather than collapsed into "invalid
 * link" — an expired invitation, a revoked one and an address that already
 * has an account need three different things from the reader.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    return (
      <AuthShell subtitle="Esta invitación no existe">
        <p className="type-body text-foreground-light">
          El enlace no corresponde a ninguna invitación. Puede que se haya copiado incompleto — pide a quien te
          invitó que te lo mande otra vez.
        </p>
      </AuthShell>
    );
  }

  if (invitation.usability !== "USABLE") {
    return (
      <AuthShell subtitle={`Invitación a ${invitation.organizationName}`}>
        <p className="type-body text-foreground-light">{EXPLANATIONS[invitation.usability]}</p>
        <Link href="/login" className="w-fit type-body underline focus-ring rounded-sm">
          Ir a Kindly
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle={`Te han invitado a ${invitation.organizationName}`}>
      <p className="type-body text-foreground-light">
        Vas a entrar como <strong className="text-foreground">{invitation.role}</strong> con el email{" "}
        <strong className="text-foreground">{invitation.email}</strong>. Crea tu contraseña para aceptar.
      </p>
      <InvitationSignUpForm email={invitation.email} />
    </AuthShell>
  );
}

const EXPLANATIONS: Record<string, string> = {
  EXPIRED: "Esta invitación ha caducado. Pide a quien te invitó que genere una nueva.",
  REVOKED: "Esta invitación se ha revocado. Si crees que es un error, habla con quien te invitó.",
  ALREADY_ACCEPTED: "Esta invitación ya se ha usado. Si la cuenta es tuya, inicia sesión con tu email y contraseña.",
  EMAIL_ALREADY_REGISTERED:
    "Ese email ya tiene una cuenta en Kindly, y de momento cada persona pertenece a una sola organización. Para unirte a esta, hace falta invitar a una dirección distinta.",
};
