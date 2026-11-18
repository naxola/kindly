/**
 * Pure argv parsing for `scripts/ingest-knowledge.ts` (no fs, no network, no DB), so it unit-tests
 * directly. The script loads GLOBAL knowledge only: what an organization uploads goes through the
 * app (an administrator, as a background job).
 */
export type IngestInput =
  | { type: 'PDF'; location: string } // a local path or an http(s) URL
  | { type: 'URL'; url: string }
  | { type: 'TEXT_FILE'; path: string }

export interface IngestArgs {
  /** Add a version to this existing GLOBAL document instead of creating one. */
  documentId: string | null
  /** Required when `documentId` is null. */
  title: string | null
  version: string
  status: 'CURRENT' | 'DRAFT'
  /** 'YYYY-MM-DD'. */
  effectiveFrom: string
  /** 'YYYY-MM-DD' or null (open-ended). */
  effectiveUntil: string | null
  /** Citation / provenance (e.g. "BOE núm. 5, de 2024-01-10"). */
  sourceNote: string | null
  jurisdiction: string | null
  territory: string | null
  scope: string | null
  input: IngestInput
  provider: 'openai' | 'fake'
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const VALUE_FLAGS = new Set([
  '--document-id',
  '--title',
  '--version',
  '--status',
  '--effective-from',
  '--effective-until',
  '--source-note',
  '--jurisdiction',
  '--territory',
  '--scope',
  '--pdf',
  '--url',
  '--text-file',
  '--provider',
])

function parseFlags(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>()
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!
    if (!VALUE_FLAGS.has(flag)) throw new Error(`Unknown flag: ${flag}`)
    if (flags.has(flag)) throw new Error(`Flag ${flag} was passed more than once.`)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--'))
      throw new Error(`Flag ${flag} requires a value.`)
    flags.set(flag, value)
    i++
  }
  return flags
}

/** Parses and validates the CLI arguments. Throws a descriptive `Error` on anything invalid. */
export function parseIngestArgs(argv: string[]): IngestArgs {
  const flags = parseFlags(argv)
  const documentId = flags.get('--document-id') ?? null
  const title = flags.get('--title') ?? null
  if (documentId !== null && title !== null) {
    throw new Error(
      "--document-id adds a version to an existing document; don't combine it with --title.",
    )
  }
  if (documentId === null && !title) {
    throw new Error(
      'Missing --title (or pass --document-id to add a version to an existing document).',
    )
  }

  const version = flags.get('--version')
  if (!version) throw new Error('Missing --version.')

  const status = flags.get('--status') ?? 'CURRENT'
  if (status !== 'CURRENT' && status !== 'DRAFT') {
    throw new Error(`Invalid --status "${status}"; must be CURRENT or DRAFT.`)
  }

  const effectiveFrom = flags.get('--effective-from')
  if (!effectiveFrom) throw new Error('Missing --effective-from (YYYY-MM-DD).')
  if (!DATE_PATTERN.test(effectiveFrom)) {
    throw new Error(`Invalid --effective-from "${effectiveFrom}"; expected YYYY-MM-DD.`)
  }
  const effectiveUntil = flags.get('--effective-until') ?? null
  if (effectiveUntil !== null && !DATE_PATTERN.test(effectiveUntil)) {
    throw new Error(`Invalid --effective-until "${effectiveUntil}"; expected YYYY-MM-DD.`)
  }

  const sources = [
    { type: 'PDF', flag: '--pdf' },
    { type: 'URL', flag: '--url' },
    { type: 'TEXT_FILE', flag: '--text-file' },
  ] as const
  const given = sources.filter((s) => flags.has(s.flag))
  if (given.length !== 1) {
    throw new Error(
      given.length === 0
        ? 'Exactly one of --pdf, --url or --text-file is required.'
        : `Exactly one of --pdf, --url or --text-file is required, got ${given.map((s) => s.flag).join(', ')}.`,
    )
  }
  const chosen = given[0]!
  const value = flags.get(chosen.flag)!
  const input: IngestInput =
    chosen.type === 'PDF'
      ? { type: 'PDF', location: value }
      : chosen.type === 'URL'
        ? { type: 'URL', url: value }
        : { type: 'TEXT_FILE', path: value }

  const provider = flags.get('--provider') ?? 'openai'
  if (provider !== 'openai' && provider !== 'fake') {
    throw new Error(`Invalid --provider "${provider}"; must be "openai" or "fake".`)
  }

  return {
    documentId,
    title,
    version,
    status,
    effectiveFrom,
    effectiveUntil,
    sourceNote: flags.get('--source-note') ?? null,
    jurisdiction: flags.get('--jurisdiction') ?? null,
    territory: flags.get('--territory') ?? null,
    scope: flags.get('--scope') ?? null,
    input,
    provider,
  }
}
