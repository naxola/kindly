/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { SITE_URL } from '../playwright.config.ts'
import { expectNoSeriousViolations } from './axe-helpers.ts'
import {
  adminWithOrganization,
  closeDb,
  deliverFakeMessage,
  fakeAccount,
  ingestPendingKnowledge,
} from './helpers.ts'

test.afterAll(closeDb)

/**
 * axe (WCAG 2.x AA) over the screens that matter, in light and dark; and no horizontal scroll at
 * 320 px. Serious and critical findings fail the test.
 */

async function seed(page: Page) {
  await adminWithOrganization(page, 'Accesible')
  const account = await fakeAccount(page)
  await deliverFakeMessage(page, account, {
    from: 'Marta Gil',
    text: 'Necesito ayuda con mi cuota',
  })
  const first = (
    (await (await page.request.get('/api/v1/conversations?view=all')).json()) as {
      items: { id: string; contactId: string }[]
    }
  ).items[0]!
  await page.request.post(`/api/v1/contacts/${first.contactId}/affiliation`, {
    data: { memberNumber: 'A-1', startedAt: '2026-01-10', feePaidUntil: '2026-02' },
  })
  await page.request.post('/api/v1/tasks', {
    data: { title: 'Llamar', contactId: first.contactId },
  })
  await page.request.post('/api/v1/procedures', {
    data: { name: 'Baja', steps: ['Uno'], requiredDocuments: ['DNI'] },
  })
  await page.request.post('/api/v1/knowledge/documents', {
    multipart: {
      title: 'Convenio',
      origin: 'TEXT',
      version: '1',
      effectiveFrom: '2024-01-01',
      file: {
        name: 'a.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Artículo 1\nLa baja se tramita.'),
      },
    },
  })
  await ingestPendingKnowledge(page)
  return first
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme })
    // The app starts dark whatever the system says: the theme is the person's choice, kept in
    // this browser (next-themes). The public site follows the system.
    test.beforeEach(({ page }) =>
      page.addInitScript((theme) => localStorage.setItem('theme', theme), scheme),
    )

    test('the app screens have no serious accessibility violations', async ({ page }) => {
      const first = await seed(page)
      const screens: [string, string][] = [
        ['/', 'home'],
        [`/inbox?conversation=${first.id}&view=all`, 'inbox with a conversation'],
        ['/contacts', 'contacts'],
        [`/contacts/${first.contactId}`, 'contact'],
        ['/tasks', 'tasks'],
        ['/knowledge?q=baja', 'knowledge with results'],
        ['/knowledge/procedures', 'procedures'],
        ['/settings/channels', 'channels'],
        ['/settings/members', 'members'],
        ['/settings/positions', 'positions'],
      ]
      for (const [path, name] of screens) {
        await page.goto(path)
        await expect(page.locator('main')).toBeVisible()
        // Let the data load before auditing (a skeleton hides most violations).
        await page.waitForLoadState('networkidle')
        await expectNoSeriousViolations(page, `${name} (${scheme})`)
      }
    })

    test('the public site has no serious accessibility violations', async ({ page }) => {
      for (const path of [
        '/es',
        '/es/pricing',
        '/es/legal/privacy',
        '/es/legal/data-deletion',
        '/en',
      ]) {
        await page.goto(`${SITE_URL}${path}`)
        await page.waitForLoadState('networkidle')
        await expectNoSeriousViolations(page, `${path} (${scheme})`)
      }
    })
  })
}

test.describe('320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } })

  test('nothing makes the page scroll sideways', async ({ page }) => {
    const first = await seed(page)
    const screens = [
      `/inbox?conversation=${first.id}&view=all`,
      '/inbox',
      '/contacts',
      `/contacts/${first.contactId}`,
      '/tasks',
      '/knowledge',
      '/knowledge/procedures',
      '/settings/channels',
      '/settings/members',
    ]
    for (const path of screens) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => {
        const main = document.querySelector('main')
        return {
          page: document.documentElement.scrollWidth - window.innerWidth,
          main: main ? main.scrollWidth - main.clientWidth : 0,
        }
      })
      const wide = overflow.page
        ? await page.evaluate(() =>
            [...document.querySelectorAll('body *')]
              .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
              .slice(0, 5)
              .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`),
          )
        : []
      expect({ ...overflow, wide }, `horizontal overflow at 320 px in ${path}`).toEqual({
        page: 0,
        main: 0,
        wide: [],
      })
    }
  })
})
