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

  /** Owner of the site, shown in the legal pages (LSSI art. 10). */
  legal: {
    companyName: 'TODO: razón social',
    taxId: 'TODO: NIF',
    address: 'TODO: domicilio',
    email: 'TODO: email de contacto',
    /** Set to true only after a legal adviser has reviewed the texts in content/legal. */
    reviewed: false,
  },

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
