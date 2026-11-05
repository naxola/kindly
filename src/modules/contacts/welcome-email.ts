import type { EmailMessage } from "@/modules/email/sender";
import { detailsCard, escapeHtml, paragraph, renderEmailLayout } from "@/modules/email/layout";

export interface WelcomeEmailInput {
  to: string;
  contactName: string;
  organizationName: string;
  delegate: {
    name: string;
    email: string;
    /** E.164; the row is omitted when the delegate has none. */
    phoneE164: string | null;
  };
}

/** Pure: the welcome email that introduces an affiliate's reference delegate. */
export function buildWelcomeEmail(input: WelcomeEmailInput): EmailMessage {
  const { delegate } = input;
  const greeting = `Hola, ${input.contactName}:`;
  const intro = `Te damos la bienvenida a ${input.organizationName}. A partir de ahora, ${delegate.name} será tu persona de referencia y te acompañará en cualquier gestión o duda que tengas.`;
  const reach = "Puedes escribirle o llamarle cuando lo necesites:";
  const close = "Estamos a tu disposición. Un cordial saludo.";

  const text = [
    greeting,
    "",
    intro,
    "",
    reach,
    `  Nombre:   ${delegate.name}`,
    `  Email:    ${delegate.email}`,
    ...(delegate.phoneE164 ? [`  Teléfono: ${delegate.phoneE164}`] : []),
    "",
    close,
    input.organizationName,
  ].join("\n");

  const rows = [
    { label: "Nombre", value: delegate.name },
    { label: "Email", value: delegate.email, href: `mailto:${delegate.email}` },
    ...(delegate.phoneE164 ? [{ label: "Teléfono", value: delegate.phoneE164, href: `tel:${delegate.phoneE164}` }] : []),
  ];

  const html = renderEmailLayout({
    preheader: `${delegate.name} es tu persona de referencia en ${input.organizationName}`,
    brandName: input.organizationName,
    heading: "Te damos la bienvenida",
    bodyHtml: [
      paragraph(escapeHtml(greeting)),
      paragraph(
        `Te damos la bienvenida a <strong>${escapeHtml(input.organizationName)}</strong>. A partir de ahora, <strong>${escapeHtml(delegate.name)}</strong> será tu persona de referencia y te acompañará en cualquier gestión o duda que tengas.`,
      ),
      paragraph(escapeHtml(reach)),
      detailsCard("Tu persona de referencia", rows),
      paragraph(escapeHtml(close)),
    ].join("\n"),
    footerNote: `Has recibido este correo porque ${input.organizationName} te ha dado de alta como afiliado. Si crees que es un error, escribe a ${delegate.email}.`,
  });

  return { to: input.to, subject: `Bienvenido/a a ${input.organizationName}`, text, html };
}
