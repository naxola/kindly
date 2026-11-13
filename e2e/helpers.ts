import { expect, type Browser, type Locator, type Page } from '@playwright/test'
import {
  createMessagingRegistry,
  FakeEmbeddingProvider,
  FakeMessagingAdapter,
  ingestVersion,
  processWebhookEvent,
} from '@saas/core'
import { createDb, type Db } from '@saas/database'
import pg from 'pg'

export const PASSWORD = 'una frase bastante larga'

let pool: pg.Pool | undefined
const db = () => (pool ??= new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 }))

let coreDb: Db | undefined
const appDb = () => (coreDb ??= createDb({ connectionString: process.env.TEST_DATABASE_URL! }))

export async function closeDb() {
  await pool?.end()
  pool = undefined
  await coreDb?.$disconnect()
  coreDb = undefined
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

/**
 * Billing fixture: puts the organization on a stored subscription of the default plan with
 * one closed period, as the hourly close would leave it. Runs as app_user within the tenant.
 */
export async function closedBillingPeriod(page: Page) {
  const orgId = (await page.context().cookies()).find((c) => c.name === 'active_org')?.value
  if (!orgId) throw new Error('no active organization cookie')
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT set_config('app.org_id', $1, true)`, [orgId])
    const sub = await client.query<{ id: string }>(
      `INSERT INTO subscriptions (id, organization_id, plan_key, plan_version, status,
         current_period_start, current_period_end, updated_at)
       VALUES (gen_random_uuid(), $1, 'free', 1, 'ACTIVE', '2026-10-01', '2026-11-01', now())
       RETURNING id`,
      [orgId],
    )
    await client.query(
      `INSERT INTO billing_periods (id, organization_id, subscription_id, plan_key, plan_version,
         currency, period_start, period_end, fixed_price, overage_total, amount_due, status,
         closed_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'free', 1, 'EUR', '2026-09-01', '2026-10-01', 0, 0, 0,
         'NO_CHARGE', now(), now())`,
      [orgId, sub.rows[0]!.id],
    )
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** The admin invites a delegate (a plain MEMBER); returns their page, signed in and inside. */
export async function inviteDelegate(adminPage: Page, browser: Browser, firstName: string) {
  const email = uniqueEmail('delegate')
  await adminPage.goto('/settings/members')
  await press(adminPage.getByRole('button', { name: 'Invitar' }))
  await adminPage.getByLabel('Email').fill(email)
  await adminPage.getByLabel('Nombre').fill(firstName)
  await press(adminPage.getByRole('button', { name: 'Enviar invitación' }))
  await expect(adminPage.getByRole('cell', { name: email })).toBeVisible()
  const page = await (await browser.newContext()).newPage()
  await page.goto(await emailUrl('identity.invitation-email', email))
  await page.getByLabel('Nombre').fill(`Cuenta de ${firstName}`)
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Repite la contraseña').fill(PASSWORD)
  await press(page.getByRole('button', { name: 'Crear cuenta y unirme' }))
  // Creating the account, accepting the invitation and loading the home are several server steps.
  await expect(page.getByText('Estás en')).toBeVisible({ timeout: 20_000 })
  return page
}

/** Same secret as the web server's fake channel (playwright.config.ts); not a real secret. */
const FAKE_SECRET = 'e2e-fake-secret'

/**
 * A connected account on the fake channel for the signed-in person, as the channels screen will
 * create it. Returns its id (the webhook URL carries it).
 */
export async function fakeAccount(page: Page): Promise<string> {
  const organizationId = (await page.context().cookies()).find(
    (c) => c.name === 'active_org',
  )?.value
  if (!organizationId) throw new Error('no active organization cookie')
  const me = (await (await page.request.get('/api/v1/organization')).json()) as {
    member: { id: string }
  }
  const { withTenant } = await import('@saas/database')
  const account = await withTenant(appDb(), organizationId, (tx) =>
    tx.messagingAccount.create({
      data: {
        organizationId,
        delegateId: me.member.id,
        channel: 'fake',
        externalAccountId: `e2e-${crypto.randomUUID()}`,
        status: 'CONNECTED',
      },
    }),
  )
  return account.id
}

/**
 * A message from a contact through the real public webhook (signed), then processed exactly as the
 * worker would (same use case): the E2E environment runs no worker.
 */
export async function deliverFakeMessage(
  page: Page,
  accountId: string,
  { from, text }: { from: string; text: string },
) {
  const res = await page.request.post(`/api/webhooks/messaging/fake/${accountId}`, {
    headers: { 'x-fake-signature': FAKE_SECRET, 'content-type': 'application/json' },
    data: JSON.stringify({
      kind: 'MESSAGE',
      externalConversationId: `chat-${from}`,
      externalMessageId: `m-${crypto.randomUUID()}`,
      externalContactId: from,
      contactDisplayName: from,
      text,
    }),
  })
  if (res.status() !== 200) throw new Error(`webhook answered ${res.status()}`)
  const { withTenant } = await import('@saas/database')
  const organizationId = (await page.context().cookies()).find(
    (c) => c.name === 'active_org',
  )!.value
  const event = await withTenant(appDb(), organizationId, (tx) =>
    tx.webhookEvent.findFirstOrThrow({ where: { processedAt: null }, orderBy: { id: 'desc' } }),
  )
  await processWebhookEvent(
    { db: appDb(), registry: createMessagingRegistry([new FakeMessagingAdapter(FAKE_SECRET)]) },
    organizationId,
    event.id,
  )
}

/**
 * Processes the knowledge uploads still pending, exactly as the worker would (same use case): the
 * E2E environment runs no worker. Embeddings are the deterministic fake.
 */
export async function ingestPendingKnowledge(page: Page) {
  const organizationId = (await page.context().cookies()).find(
    (c) => c.name === 'active_org',
  )!.value
  const { withTenant } = await import('@saas/database')
  const pending = await withTenant(appDb(), organizationId, (tx) =>
    tx.knowledgeDocumentVersion.findMany({
      where: { ingestionStatus: 'PENDING' },
      select: { id: true },
    }),
  )
  const noExtractor = {
    extractPdf: () => Promise.reject(new Error('no PDF extraction in E2E')),
    fetchWebText: () => Promise.reject(new Error('no network in E2E')),
  }
  for (const { id } of pending) {
    await ingestVersion(
      { db: appDb(), embeddings: new FakeEmbeddingProvider(), extractor: noExtractor },
      organizationId,
      id,
      { number: 3, limit: 3 },
    )
  }
  return pending.length
}
