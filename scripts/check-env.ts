/**
 * Compares the local .env with .env.example and lists the variables it lacks. Each phase of
 * the template may add variables: this catches an old .env before an app fails to start.
 * Commented-out examples (`# NAME=`) are optional and not required.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const declaredKeys = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line.trim())?.[1])
    .filter((k): k is string => !!k)

export function missingKeys(example: string, actual: string): string[] {
  const present = new Set(declaredKeys(actual))
  return declaredKeys(example).filter((k) => !present.has(k))
}

if (import.meta.main) {
  const root = resolve(import.meta.dirname, '..')
  const envPath = resolve(root, '.env')
  if (!existsSync(envPath)) {
    console.error('✖ No .env: create it with `cp .env.example .env`')
    process.exit(1)
  }
  const missing = missingKeys(
    readFileSync(resolve(root, '.env.example'), 'utf8'),
    readFileSync(envPath, 'utf8'),
  )
  if (missing.length > 0) {
    console.error(
      `✖ .env lacks ${missing.length} variable(s) from .env.example:\n${missing.map((k) => `  - ${k}`).join('\n')}\n  Copy them from .env.example (local defaults) and run again.`,
    )
    process.exit(1)
  }
  console.log('✔ .env has every variable of .env.example')
}
