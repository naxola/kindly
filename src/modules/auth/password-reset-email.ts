import type { EmailMessage } from "@/modules/email/sender";

/** Kept in sync with `resetPasswordTokenExpiresIn` in `auth.ts`, so the email never promises more than the token gives. */
export const PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 60;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Pure: the email Better Auth's `sendResetPassword` hands to the `EmailSender`. */
export function buildPasswordResetEmail(input: { to: string; name: string; url: string }): EmailMessage {
  const minutes = PASSWORD_RESET_TOKEN_TTL_SECONDS / 60;
  const greeting = input.name ? `Hola, ${input.name}:` : "Hola:";
  const text = [
    greeting,
    "",
    "Alguien ha pedido restablecer la contraseña de tu cuenta de Kindly.",
    "Para elegir una nueva, abre este enlace:",
    "",
    input.url,
    "",
    `El enlace caduca en ${minutes} minutos y solo se puede usar una vez.`,
    "Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.",
  ].join("\n");

  const html = `<p>${escapeHtml(greeting)}</p>
<p>Alguien ha pedido restablecer la contraseña de tu cuenta de Kindly.</p>
<p><a href="${escapeHtml(input.url)}">Elegir una contraseña nueva</a></p>
<p>El enlace caduca en ${minutes} minutos y solo se puede usar una vez.
Si no lo has pedido tú, ignora este correo: tu contraseña no cambia.</p>`;

  return { to: input.to, subject: "Restablece tu contraseña de Kindly", text, html };
}
