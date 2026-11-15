import { escapeHtml, renderActionEmail, type ActionEmail, type RenderedEmail } from '../../email.ts'
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

export function changeEmailConfirmationEmail(
  locale: Locale,
  name: string,
  newEmail: string,
  url: string,
): Rendered {
  const t: Template =
    locale === 'es'
      ? {
          subject: 'Confirma el cambio de tu correo de acceso',
          intro: `Has pedido cambiar tu correo de acceso a ${newEmail}. Confirma que has sido tú; después te enviaremos un enlace a la nueva dirección para terminar.`,
          action: 'Confirmar el cambio',
          outro:
            'El enlace caduca en 1 hora. Si no lo has pedido tú, ignora este mensaje y cambia tu contraseña: alguien podría tener acceso a tu cuenta.',
        }
      : {
          subject: 'Confirm the change of your sign-in email',
          intro: `You asked to change your sign-in email to ${newEmail}. Confirm it was you; we will then send a link to the new address to finish.`,
          action: 'Confirm the change',
          outro:
            'The link expires in 1 hour. If you did not request it, ignore this message and change your password: someone may have access to your account.',
        }
  return render(t, url, hello(locale, name))
}

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

const longDate = (locale: Locale, date: Date) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date)

export interface AccountDeletionNotice {
  kind: 'REQUESTED' | 'CANCELLED' | 'COMPLETED' | 'BLOCKED'
  scheduledFor?: Date
  url: string
}

/** Notices of the account deletion (ADR 0019). The completed one has no link: the access is gone. */
export function accountDeletionEmail(
  locale: Locale,
  name: string,
  n: AccountDeletionNotice,
): Rendered {
  const date = n.scheduledFor ? longDate(locale, n.scheduledFor) : ''
  const es = locale === 'es'
  if (n.kind === 'COMPLETED') {
    const text = es
      ? {
          subject: 'Tu cuenta se ha eliminado',
          body: 'Hemos eliminado tu cuenta y anonimizado tus datos personales. Las organizaciones donde eras el único miembro se han archivado. Gracias por haber usado el producto.',
        }
      : {
          subject: 'Your account has been deleted',
          body: 'We have deleted your account and anonymized your personal data. Organizations where you were the only member have been archived. Thank you for using the product.',
        }
    const greeting = hello(locale, name)
    return {
      subject: text.subject,
      text: `${greeting}\n\n${text.body}\n`,
      html: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(text.body)}</p>`,
    }
  }
  const t: Template = {
    REQUESTED: es
      ? {
          subject: 'Hemos recibido tu solicitud de borrado de cuenta',
          intro: `Tu cuenta se eliminará el ${date}. Hasta entonces puedes seguir usándola y cancelar el borrado cuando quieras.`,
          action: 'Cancelar el borrado',
          outro: 'Si no has sido tú, cancela el borrado y cambia tu contraseña ahora mismo.',
        }
      : {
          subject: 'We received your account deletion request',
          intro: `Your account will be deleted on ${date}. Until then you can keep using it and cancel the deletion at any time.`,
          action: 'Cancel the deletion',
          outro: 'If it was not you, cancel the deletion and change your password right now.',
        },
    CANCELLED: es
      ? {
          subject: 'Borrado de cuenta cancelado',
          intro: 'Hemos cancelado el borrado de tu cuenta. Todo sigue como estaba.',
          action: 'Abrir ajustes de la cuenta',
          outro: 'Si no has sido tú, cambia tu contraseña.',
        }
      : {
          subject: 'Account deletion cancelled',
          intro: 'We have cancelled the deletion of your account. Everything stays as it was.',
          action: 'Open account settings',
          outro: 'If it was not you, change your password.',
        },
    BLOCKED: es
      ? {
          subject: 'No hemos podido borrar tu cuenta',
          intro:
            'Al vencer el plazo, tu cuenta no se podía borrar: eres el último administrador de una organización con más miembros o hay una suscripción de pago activa. Hemos cancelado la solicitud.',
          action: 'Revisar la cuenta',
          outro: 'Resuelve la organización afectada y vuelve a solicitar el borrado.',
        }
      : {
          subject: 'We could not delete your account',
          intro:
            'When the period ended, your account could not be deleted: you are the last administrator of an organization with other members, or there is an active paid subscription. We cancelled the request.',
          action: 'Review the account',
          outro: 'Fix the organization concerned and request the deletion again.',
        },
  }[n.kind]
  return render(t, n.url, hello(locale, name))
}
