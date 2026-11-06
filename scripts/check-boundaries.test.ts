import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkBoundaries } from './check-boundaries.ts'

let root: string

function file(path: string, content: string) {
  const full = join(root, path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}
const pkg = (dir: string, name: string, deps: string[] = []) =>
  file(
    `${dir}/package.json`,
    JSON.stringify({ name, dependencies: Object.fromEntries(deps.map((d) => [d, 'workspace:*'])) }),
  )

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('checkBoundaries', () => {
  it('accepts a valid layout', () => {
    root = mkdtempSync(join(tmpdir(), 'bounds-'))
    pkg('packages/database', '@saas/database', ['@saas/config'])
    pkg('packages/core', '@saas/core', ['@saas/database'])
    file('packages/core/src/modules/a/index.ts', "export * from './thing.ts'")
    file('packages/core/src/modules/b/index.ts', "import { x } from '../a/index.ts'\nexport { x }")
    expect(checkBoundaries(root)).toEqual([])
  })

  it('rejects a forbidden package dependency and an undeclared package', () => {
    root = mkdtempSync(join(tmpdir(), 'bounds-'))
    pkg('packages/core', '@saas/core', ['@saas/adapters'])
    pkg('packages/extra', '@saas/extra')
    expect(checkBoundaries(root)).toEqual([
      '@saas/core no puede depender de @saas/adapters',
      '@saas/extra: paquete no declarado en scripts/check-boundaries.ts',
    ])
  })

  it('rejects deep imports into a package', () => {
    root = mkdtempSync(join(tmpdir(), 'bounds-'))
    pkg('packages/core', '@saas/core', ['@saas/database'])
    file('packages/core/src/x.ts', "import { y } from '@saas/database/src/client.ts'")
    expect(checkBoundaries(root)).toEqual([
      "packages/core/src/x.ts: import profundo prohibido '@saas/database/src/client.ts'",
    ])
  })

  it("rejects importing another core module's internals", () => {
    root = mkdtempSync(join(tmpdir(), 'bounds-'))
    pkg('packages/core', '@saas/core', ['@saas/database'])
    file('packages/core/src/modules/a/secret.ts', 'export const s = 1')
    file('packages/core/src/modules/b/use.ts', "import { s } from '../a/secret.ts'")
    expect(checkBoundaries(root)).toEqual([
      "packages/core/src/modules/b/use.ts: el módulo 'b' importa el interior de 'a' (usa su index.ts)",
    ])
  })
})
