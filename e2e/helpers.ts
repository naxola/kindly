import { expect, type Locator, type Page } from '@playwright/test'
import pg from 'pg'

export const PASSWORD = 'una frase bastante larga'

let pool: pg.Pool | undefined
const db = () => (pool ??= new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 }))

export async function closeDb() {
  await pool?.end()
  pool = undefined
}

/**
 * URL of the latest email enqueued for `to`. Emails do not leave in tests: they are read
 * from the pg-boss job, which is what the worker would send.
 */
export async function emailUrl(job: string, to: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const { rows } = await db().query<{ url: string }>(
      `SELECT data->'payload'->>'url' AS url FROM pgboss.job
       WHERE name = $1 AND data->'payload'->>'to' = $2 ORDER BY created_on DESC LIMIT 1`,
      [job, to],
    )
    if (rows[0]) return rows[0].url
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`No ${job} for ${to}`)
}

/** Some buttons sit under floating indicators; the event is sent to the element. */
export const press = (locator: Locator) => locator.dispatchEvent('click')

export const uniqueEmail = (label: string) => `${label}-${crypto.randomUUID()}@example.test`

/** Sign-up + verification through the emailed link. Ends signed in. */
export async function signUp(page: Page, { name, email }: { name: string; email: string }) {
  // If already on sign-up (e.g. coming from an invitation), keep its `?next=`.
  if (!new URL(page.url(), 'http://x').pathname.startsWith('/sign-up')) await page.goto('/sign-up')
  await page.getByLabel('Nombre').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Repite la contraseña').fill(PASSWORD)
  await press(page.getByRole('button', { name: 'Crear cuenta' }))
  await expect(page.getByText('Hemos enviado un enlace')).toBeVisible()
  await page.goto(await emailUrl('identity.verification-email', email))
}

/** Optional screenshot for manual review (E2E_SHOTS=/path). */
export async function shot(page: Page, name: string) {
  const dir = process.env.E2E_SHOTS
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, caret: 'initial' })
}

/** Full sign-up of an administrator with their organization (ends signed in, inside it). */
export async function adminWithOrganization(page: Page, orgName: string) {
  const email = uniqueEmail('admin')
  await signUp(page, { name: 'Ana Admin', email })
  await expect(page).toHaveURL(/\/onboarding/)
  await createOrganization(page, orgName)
  await expect(page.getByRole('heading', { name: 'Hola, Ana Admin' })).toBeVisible()
  return email
}

/** Fills the onboarding form. The slug must be unique across runs of the suite. */
export async function createOrganization(page: Page, name: string) {
  await page.getByLabel('Nombre').fill(name)
  await page
    .getByLabel('Identificador')
    .fill(`${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`)
  await press(page.getByRole('button', { name: 'Crear organización' }))
}
