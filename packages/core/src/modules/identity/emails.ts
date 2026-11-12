import { renderActionEmail, type ActionEmail, type RenderedEmail } from '../../email.ts'
import type { Locale } from '../../i18n.ts'

type Template = ActionEmail
type Rendered = RenderedEmail
const render = renderActionEmail

const hello = (locale: Locale, name: string) =>
  locale === 'es' ? `Hola, ${name}:` : `Hello ${name},`

const VERIFY: Record<Locale, Template> = {
  es: {
    subject: 'Confirma tu dirección de correo',
    intro: 'Confirma tu correo para empezar a usar tu cuenta.',
    action: 'Confirmar correo',
    outro: 'El enlace caduca en 1 hora. Si no has creado una cuenta, ignora este mensaje.',
  },
  en: {
    subject: 'Confirm your email address',
    intro: 'Confirm your email to start using your account.',
    action: 'Confirm email',
    outro: 'The link expires in 1 hour. If you did not create an account, ignore this message.',
  },
}

const RESET: Record<Locale, Template> = {
  es: {
    subject: 'Restablece tu contraseña',
    intro: 'Hemos recibido una solicitud para restablecer tu contraseña.',
    action: 'Elegir una contraseña nueva',
    outro:
      'El enlace caduca en 1 hora y solo se puede usar una vez. Si no lo has pedido tú, ignora este mensaje.',
  },
  en: {
    subject: 'Reset your password',
    intro: 'We received a request to reset your password.',
    action: 'Choose a new password',
    outro:
      'The link expires in 1 hour and can only be used once. If you did not request it, ignore this message.',
  },
}

export const verificationEmail = (locale: Locale, name: string, url: string) =>
  render(VERIFY[locale], url, hello(locale, name))

export const passwordResetEmail = (locale: Locale, name: string, url: string) =>
  render(RESET[locale], url, hello(locale, name))

export function invitationEmail(
  locale: Locale,
  organizationName: string,
  inviterName: string,
  url: string,
  expiresInDays: number,
): Rendered {
  const t: Template =
    locale === 'es'
      ? {
          subject: `Invitación a ${organizationName}`,
          intro: `${inviterName} te ha invitado a unirte a ${organizationName}.`,
          action: 'Aceptar la invitación',
          outro: `La invitación caduca en ${expiresInDays} días. Si no esperabas este mensaje, ignóralo.`,
        }
      : {
          subject: `Invitation to ${organizationName}`,
          intro: `${inviterName} has invited you to join ${organizationName}.`,
          action: 'Accept the invitation',
          outro: `The invitation expires in ${expiresInDays} days. If you were not expecting it, ignore this message.`,
        }
  return render(t, url, locale === 'es' ? 'Hola:' : 'Hello,')
}
