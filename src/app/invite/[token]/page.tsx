import Link from "next/link";
import { getInvitationByToken } from "@/modules/organizations/invitations";
import { InvitationSignUpForm } from "@/app/invite/[token]/sign-up-form";

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
      <Shell title="Esta invitación no existe">
        <p className="text-sm text-zinc-600">
          El enlace no corresponde a ninguna invitación. Puede que se haya copiado incompleto — pide a quien te
          invitó que te lo mande otra vez.
        </p>
      </Shell>
    );
  }

  if (invitation.usability !== "USABLE") {
    return (
      <Shell title={`Invitación a ${invitation.organizationName}`}>
        <p className="text-sm text-zinc-600">{EXPLANATIONS[invitation.usability]}</p>
        <Link href="/login" className="text-sm underline">
          Ir a Kindly
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title={`Te han invitado a ${invitation.organizationName}`}>
      <p className="text-sm text-zinc-600">
        Vas a entrar como <strong>{invitation.role}</strong> con el email <strong>{invitation.email}</strong>. Crea
        tu contraseña para aceptar.
      </p>
      <InvitationSignUpForm email={invitation.email} />
    </Shell>
  );
}

const EXPLANATIONS: Record<string, string> = {
  EXPIRED: "Esta invitación ha caducado. Pide a quien te invitó que genere una nueva.",
  REVOKED: "Esta invitación se ha revocado. Si crees que es un error, habla con quien te invitó.",
  ALREADY_ACCEPTED: "Esta invitación ya se ha usado. Si la cuenta es tuya, inicia sesión con tu email y contraseña.",
  EMAIL_ALREADY_REGISTERED:
    "Ese email ya tiene una cuenta en Kindly, y de momento cada persona pertenece a una sola organización. Para unirte a esta, hace falta invitar a una dirección distinta.",
};

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-xl font-semibold">Kindly</h1>
        <p className="text-sm text-zinc-500">{title}</p>
      </div>
      {children}
    </main>
  );
}
