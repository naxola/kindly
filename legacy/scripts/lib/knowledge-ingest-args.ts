/**
 * Pure argv parsing/validation for `scripts/ingest-knowledge.ts` — no fs,
 * no network, no DB, so it unit-tests directly (same split as
 * `scripts/lib/tokens-dtcg.ts`).
 */
import type { DocumentVersionStatus, KnowledgeVisibility } from "@/modules/knowledge/schema";

export type IngestInput =
  | { type: "PDF"; location: string } // a local path or an http(s) URL
  | { type: "URL"; url: string }
  | { type: "TEXT_FILE"; path: string };

export interface IngestArgs {
  /** Add a version to this existing document instead of creating one. */
  documentId: string | null;
  /** Required when `documentId` is null (a new document is being created). */
  title: string | null;
  visibility: KnowledgeVisibility | null;
  organizationId: string | null;
  version: string;
  status: DocumentVersionStatus;
  /** 'YYYY-MM-DD'. */
  effectiveFrom: string;
  /** 'YYYY-MM-DD' or null (open-ended). */
  effectiveUntil: string | null;
  /** Citation/provenance text (e.g. "BOE núm. 5, de 2024-01-10") — `document_versions.source`. */
  sourceNote: string | null;
  jurisdiction: string | null;
  territory: string | null;
  scope: string | null;
  input: IngestInput;
  provider: "openai" | "fake";
}

const VALID_STATUSES: DocumentVersionStatus[] = ["DRAFT", "CURRENT", "SUPERSEDED", "REPEALED", "HISTORICAL"];
const VALID_VISIBILITIES: KnowledgeVisibility[] = ["GLOBAL", "ORGANIZATION"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const VALUE_FLAGS = new Set([
  "--document-id",
  "--title",
  "--visibility",
  "--org",
  "--version",
  "--status",
  "--effective-from",
  "--effective-until",
  "--source-note",
  "--jurisdiction",
  "--territory",
  "--scope",
  "--pdf",
  "--url",
  "--text-file",
  "--provider",
]);

function parseFlags(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!VALUE_FLAGS.has(flag)) {
      throw new Error(`Unknown flag: ${flag}`);
    }
    if (flags.has(flag)) {
      throw new Error(`Flag ${flag} was passed more than once.`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Flag ${flag} requires a value.`);
    }
    flags.set(flag, value);
    i++;
  }
  return flags;
}

/** Parses and validates `scripts/ingest-knowledge.ts`'s CLI arguments. Throws a descriptive `Error` on anything invalid. */
export function parseIngestArgs(argv: string[]): IngestArgs {
  const flags = parseFlags(argv);

  const documentId = flags.get("--document-id") ?? null;
  const title = flags.get("--title") ?? null;
  const visibilityRaw = flags.get("--visibility") ?? null;
  const organizationId = flags.get("--org") ?? null;

  if (documentId !== null) {
    if (title !== null || visibilityRaw !== null || organizationId !== null) {
      throw new Error(
        "--document-id adds a version to an existing document; don't combine it with --title/--visibility/--org.",
      );
    }
  } else {
    if (!title) {
      throw new Error("Missing --title (or pass --document-id to add a version to an existing document).");
    }
    if (!visibilityRaw) {
      throw new Error("Missing --visibility (GLOBAL or ORGANIZATION).");
    }
  }

  let visibility: KnowledgeVisibility | null = null;
  if (visibilityRaw !== null) {
    if (!VALID_VISIBILITIES.includes(visibilityRaw as KnowledgeVisibility)) {
      throw new Error(`Invalid --visibility "${visibilityRaw}"; must be one of ${VALID_VISIBILITIES.join(", ")}.`);
    }
    visibility = visibilityRaw as KnowledgeVisibility;
    if (visibility === "GLOBAL" && organizationId !== null) {
      throw new Error("--org must not be passed with --visibility GLOBAL (GLOBAL knowledge has no organization).");
    }
    if (visibility === "ORGANIZATION" && organizationId === null) {
      throw new Error("--org is required with --visibility ORGANIZATION.");
    }
  }

  const version = flags.get("--version");
  if (!version) {
    throw new Error("Missing --version.");
  }

  const statusRaw = flags.get("--status") ?? "CURRENT";
  if (!VALID_STATUSES.includes(statusRaw as DocumentVersionStatus)) {
    throw new Error(`Invalid --status "${statusRaw}"; must be one of ${VALID_STATUSES.join(", ")}.`);
  }
  const status = statusRaw as DocumentVersionStatus;

  const effectiveFrom = flags.get("--effective-from");
  if (!effectiveFrom) {
    throw new Error("Missing --effective-from (YYYY-MM-DD).");
  }
  if (!DATE_PATTERN.test(effectiveFrom)) {
    throw new Error(`Invalid --effective-from "${effectiveFrom}"; expected YYYY-MM-DD.`);
  }

  const effectiveUntil = flags.get("--effective-until") ?? null;
  if (effectiveUntil !== null && !DATE_PATTERN.test(effectiveUntil)) {
    throw new Error(`Invalid --effective-until "${effectiveUntil}"; expected YYYY-MM-DD.`);
  }

  const sources: { type: IngestInput["type"]; flag: string }[] = [
    { type: "PDF", flag: "--pdf" },
    { type: "URL", flag: "--url" },
    { type: "TEXT_FILE", flag: "--text-file" },
  ];
  const givenSources = sources.filter((s) => flags.has(s.flag));
  if (givenSources.length === 0) {
    throw new Error("Exactly one of --pdf, --url or --text-file is required.");
  }
  if (givenSources.length > 1) {
    throw new Error(
      `Exactly one of --pdf, --url or --text-file is required, got ${givenSources.map((s) => s.flag).join(", ")}.`,
    );
  }
  const chosen = givenSources[0];
  const value = flags.get(chosen.flag)!;
  const input: IngestInput =
    chosen.type === "PDF"
      ? { type: "PDF", location: value }
      : chosen.type === "URL"
        ? { type: "URL", url: value }
        : { type: "TEXT_FILE", path: value };

  const providerRaw = flags.get("--provider") ?? "openai";
  if (providerRaw !== "openai" && providerRaw !== "fake") {
    throw new Error(`Invalid --provider "${providerRaw}"; must be "openai" or "fake".`);
  }

  return {
    documentId,
    title,
    visibility,
    organizationId,
    version,
    status,
    effectiveFrom,
    effectiveUntil,
    sourceNote: flags.get("--source-note") ?? null,
    jurisdiction: flags.get("--jurisdiction") ?? null,
    territory: flags.get("--territory") ?? null,
    scope: flags.get("--scope") ?? null,
    input,
    provider: providerRaw,
  };
}
