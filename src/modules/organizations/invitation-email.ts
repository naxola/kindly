import type { EmailMessage } from "@/modules/email/sender";
import { button, paragraph, renderEmailLayout, escapeHtml } from "@/modules/email/layout";
import type { OrganizationRole } from "@/modules/organizations/schema";

const ROLE_LABEL: Record<OrganizationRole, string> = {
  ADMIN: "administrador",
  DELEGATE: "delegado",
};

export interface InvitationEmailInput {
  to: string;
  organizationName: string;
  /** Name of the ADMIN who sent the invitation. */
  invitedByName: string;
  role: OrganizationRole;
  /** Absolute `/invite/<token>` URL. */
  url: string;
  expiresAt: Date;
}

/** Pure: the email that invites a team member to create their account. */
export function buildInvitationEmail(input: InvitationEmailInput): EmailMessage {
  const role = ROLE_LABEL[input.role];
  const expires = input.expiresAt.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  const intro = `${input.invitedByName} te ha invitado a unirte a ${input.organizationName} en Kindly como ${role}.`;
  const how = "Para activar tu cuenta, crea tu contraseña desde el siguiente enlace. Usa este mismo correo al registrarte.";
  const expiry = `La invitación caduca el ${expires}.`;
  const ignore = "Si no esperabas este mensaje, puedes ignorarlo: no se creará ninguna cuenta.";

  const text = [
    "Hola:",
    "",
    intro,
    how,
    "",
    input.url,
    "",
    expiry,
    ignore,
    "",
    "— El equipo de Kindly",
  ].join("\n");

  const html = renderEmailLayout({
    preheader: `${input.invitedByName} te invita a ${input.organizationName}`,
    brandName: "Kindly",
    heading: `Te han invitado a ${input.organizationName}`,
    bodyHtml: [
      paragraph("Hola:"),
      paragraph(`<strong>${escapeHtml(input.invitedByName)}</strong> te ha invitado a unirte a <strong>${escapeHtml(input.organizationName)}</strong> en Kindly como ${role}.`),
      paragraph(escapeHtml(how)),
      button("Crear mi cuenta", input.url),
      paragraph(`<span style="color:#6b7280;font-size:13px;">Si el botón no funciona, copia este enlace en tu navegador:<br>${escapeHtml(input.url)}</span>`),
      paragraph(escapeHtml(expiry)),
    ].join("\n"),
    footerNote: ignore,
  });

  return { to: input.to, subject: `Invitación a ${input.organizationName} en Kindly`, text, html };
}
