import { parseEnv, siteEnv } from '@saas/config/env'

/**
 * Everything a product edits to make the public site its own, besides the texts in
 * messages/ and the posts in content/. Values marked TODO must be filled before
 * publishing: the legal pages show a warning while `legal.reviewed` is false.
 */
const env = parseEnv(siteEnv)

export const site = {
  url: env.SITE_URL.replace(/\/$/, ''),
  appUrl: env.APP_URL.replace(/\/$/, ''),
  plausibleDomain: env.PLAUSIBLE_DOMAIN ?? null,

  /**
   * Owner of the site, shown in the legal pages (LSSI art. 10). Meta's business verification compares
   * these values literally with the registry and the documents uploaded, so they are written in full
   * (no "C/") and must match them exactly. `reviewed` stays false until a person has read the texts
   * in content/legal: while it is, the pages carry a warning and are not indexed.
   */
  legal: {
    companyName: 'Hayat Iberia S.L.',
    taxId: 'B42637348',
    address: 'Calle Rambla Baja, 97, 1.º I, 03360 Callosa de Segura (Alicante)',
    email: 'privacy@daedaluscognitio.com',
    /** Address for data-protection requests (the same mailbox as the contact one). */
    privacyEmail: 'privacy@daedaluscognitio.com',
    /** REVISAR: registry data (Registro Mercantil de Alicante, tomo, folio, hoja): not confirmed. */
    registryDetails:
      'REVISAR: datos registrales (Registro Mercantil de Alicante, tomo, folio, hoja)',
    reviewed: false,
  },

  /** Meta's domain verification token (a <meta> tag of the site). Empty: no tag. */
  facebookDomainVerification: env.FACEBOOK_DOMAIN_VERIFICATION ?? null,

  /**
   * Plans of the pricing page. Empty list: the page says prices are coming and offers
   * contact. Prices are strings so each product writes them with its currency and period.
   */
  plans: [] as Plan[],
} as const

export interface Plan {
  /** Stable key; its name and features live in messages (pricing.plans.<key>). */
  key: string
  price: string
  featured?: boolean
}
