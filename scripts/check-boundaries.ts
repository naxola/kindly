/**
 * Verifies the architecture boundaries (ADR 0001):
 *  1. Dependency graph between workspace packages (package.json).
 *  2. Inside packages/core/src/modules, a module imports another only through its index.ts.
 *  3. Nobody imports the inside of a package (`@saas/x/src/...`).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

/** Allowed workspace dependencies per package. A package not listed here is an error. */
export const ALLOWED: Record<string, string[]> = {
  '@saas/config': [],
  '@saas/database': ['@saas/config'],
  '@saas/core': ['@saas/config', '@saas/database'],
  '@saas/adapters': ['@saas/config', '@saas/database', '@saas/core'],
  '@saas/ui': ['@saas/config'],
  '@saas/content': ['@saas/config'],
  '@saas/web': ['@saas/config', '@saas/database', '@saas/core', '@saas/adapters', '@saas/ui'],
  '@saas/site': ['@saas/config', '@saas/ui', '@saas/content'],
  '@saas/worker': ['@saas/config', '@saas/database', '@saas/core', '@saas/adapters'],
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'generated' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const importRe =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
const importsOf = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(importRe)].map((m) => (m[1] ?? m[2])!)

export function checkBoundaries(root: string): string[] {
  const errors: string[] = []

  // 1. Package graph and 3. deep imports
  for (const group of ['apps', 'packages']) {
    let names: string[]
    try {
      names = readdirSync(join(root, group))
    } catch {
      continue
    }
    for (const name of names) {
      let pkg: { name: string; dependencies?: object; devDependencies?: object }
      try {
        pkg = JSON.parse(
          readFileSync(join(root, group, name, 'package.json'), 'utf8'),
        ) as typeof pkg
      } catch {
        continue
      }
      const allowed = ALLOWED[pkg.name]
      if (!allowed) {
        errors.push(`${pkg.name}: paquete no declarado en scripts/check-boundaries.ts`)
        continue
      }
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) =>
        d.startsWith('@saas/'),
      )
      for (const dep of deps) {
        if (!allowed.includes(dep)) errors.push(`${pkg.name} no puede depender de ${dep}`)
      }
      for (const file of walk(join(root, group, name))) {
        for (const spec of importsOf(file)) {
          if (/^@saas\/[^/]+\/src\//.test(spec)) {
            errors.push(`${relative(root, file)}: import profundo prohibido '${spec}'`)
          }
        }
      }
    }
  }

  // 2. Core modules talk to each other only through their index.ts
  const modulesDir = join(root, 'packages/core/src/modules')
  let modules: string[] = []
  try {
    modules = readdirSync(modulesDir).filter((m) => statSync(join(modulesDir, m)).isDirectory())
  } catch {
    // No modules yet.
  }
  for (const mod of modules) {
    for (const file of walk(join(modulesDir, mod))) {
      for (const spec of importsOf(file)) {
        if (!spec.startsWith('.')) continue
        const rel = relative(modulesDir, resolve(dirname(file), spec))
        if (rel.startsWith('..')) continue
        const [targetModule, ...rest] = rel.split(sep)
        if (targetModule === mod) continue
        const isEntry =
          rest.length === 0 || (rest.length === 1 && /^index(\.tsx?)?$/.test(rest[0]!))
        if (!isEntry) {
          errors.push(
            `${relative(root, file)}: el módulo '${mod}' importa el interior de '${targetModule}' (usa su index.ts)`,
          )
        }
      }
    }
  }

  return errors
}

if (import.meta.main) {
  const errors = checkBoundaries(resolve(import.meta.dirname, '..'))
  if (errors.length > 0) {
    console.error(
      `✖ ${errors.length} violación(es) de fronteras:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    )
    process.exit(1)
  }
  console.log('✔ Fronteras de arquitectura correctas')
}
