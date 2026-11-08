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
