import { renderActionEmail, type RenderedEmail } from '../../email.ts'
import type { Locale } from '../../i18n.ts'

export interface QuotaAlert {
  organizationName: string
  metric: string
  unit: string
  threshold: number
  used: string
  included: string
  hardLimit: boolean
  url: string
}

export function quotaAlertEmail(locale: Locale, a: QuotaAlert): RenderedEmail {
  const reached = a.threshold >= 100
  if (locale === 'es') {
    const consequence = !reached
      ? 'Revisa el consumo para evitar sorpresas.'
      : a.hardLimit
        ? 'Las acciones que consumen esta cuota se rechazarán hasta el próximo periodo o hasta que cambies de plan.'
        : 'El consumo adicional se cobrará como excedente según tu plan.'
    return renderActionEmail(
      {
        subject: `${a.organizationName}: ${a.threshold} % de la cuota de ${a.metric}`,
        intro: `${a.organizationName} ha consumido ${a.used} de ${a.included} ${a.unit} (${a.metric}) en este periodo. ${consequence}`,
        action: 'Ver el plan y el consumo',
        outro: 'Recibes este aviso porque eres administrador de la organización.',
      },
      a.url,
      'Hola:',
    )
  }
  const consequence = !reached
    ? 'Review your usage to avoid surprises.'
    : a.hardLimit
      ? 'Actions that consume this quota will be rejected until the next period or a plan change.'
      : 'Additional usage will be charged as overage according to your plan.'
  return renderActionEmail(
    {
      subject: `${a.organizationName}: ${a.threshold}% of the ${a.metric} quota`,
      intro: `${a.organizationName} has used ${a.used} of ${a.included} ${a.unit} (${a.metric}) this period. ${consequence}`,
      action: 'See plan and usage',
      outro: 'You receive this notice because you are an administrator of the organization.',
    },
    a.url,
    'Hello,',
  )
}

export interface DunningNotice {
  kind: 'PAST_DUE' | 'REMINDER' | 'RESTRICTED'
  organizationName: string
  /** Day the default plan starts (or started) to apply. */
  restrictsOn: Date
  url: string
}

const longDate = (locale: Locale, date: Date) =>
  new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)

/** Failed payment: told when it happens, before the plan is restricted and when it is. */
export function dunningEmail(locale: Locale, n: DunningNotice): RenderedEmail {
  const date = longDate(locale, n.restrictsOn)
  if (locale === 'es') {
    const text = {
      PAST_DUE: {
        subject: `${n.organizationName}: no hemos podido cobrar tu suscripción`,
        intro: `El último pago de ${n.organizationName} ha fallado. El plan se mantiene hasta el ${date}; si para entonces no se ha pagado, se aplicará el plan gratuito. Revisa el método de pago.`,
      },
      REMINDER: {
        subject: `${n.organizationName}: el plan se restringe el ${date}`,
        intro: `El pago de ${n.organizationName} sigue pendiente. El ${date} se aplicará el plan gratuito si no se ha resuelto. Revisa el método de pago.`,
      },
      RESTRICTED: {
        subject: `${n.organizationName}: se ha aplicado el plan gratuito`,
        intro: `El pago de ${n.organizationName} sigue pendiente y desde el ${date} se aplica el plan gratuito. Tus datos se conservan: no se ha borrado nada. Al pagar se recupera el plan.`,
      },
    }[n.kind]
    return renderActionEmail(
      {
        ...text,
        action: 'Revisar el pago',
        outro: 'Recibes este aviso porque eres administrador de la organización.',
      },
      n.url,
      'Hola:',
    )
  }
  const text = {
    PAST_DUE: {
      subject: `${n.organizationName}: we could not charge your subscription`,
      intro: `The latest payment of ${n.organizationName} failed. The plan stays until ${date}; if it has not been paid by then, the free plan will apply. Please check the payment method.`,
    },
    REMINDER: {
      subject: `${n.organizationName}: the plan is restricted on ${date}`,
      intro: `The payment of ${n.organizationName} is still pending. On ${date} the free plan will apply unless it is solved. Please check the payment method.`,
    },
    RESTRICTED: {
      subject: `${n.organizationName}: the free plan now applies`,
      intro: `The payment of ${n.organizationName} is still pending and the free plan applies since ${date}. Your data is kept: nothing has been deleted. Paying restores the plan.`,
    },
  }[n.kind]
  return renderActionEmail(
    {
      ...text,
      action: 'Review the payment',
      outro: 'You receive this notice because you are an administrator of the organization.',
    },
    n.url,
    'Hello,',
  )
}
