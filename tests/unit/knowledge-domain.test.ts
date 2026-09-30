import { describe, expect, it } from "vitest";
import { selectApplicableVersion } from "@/modules/knowledge/domain";
import type { VersionForSelection } from "@/modules/knowledge/domain";

/**
 * Unit tests for version-aware selection (Fase 7a, `docs/DATABASE.md` §15):
 * the version applicable at a relevant date, which is not necessarily the
 * current one.
 */

const v = (
  status: VersionForSelection["status"],
  effectiveFrom: string,
  effectiveUntil: string | null,
): VersionForSelection & { version: string } => ({
  version: `${status}:${effectiveFrom}..${effectiveUntil ?? "∞"}`,
  status,
  effectiveFrom,
  effectiveUntil,
});

describe("selectApplicableVersion", () => {
  it("returns the open-ended CURRENT version for a present date", () => {
    const current = v("CURRENT", "2024-01-01", null);
    expect(selectApplicableVersion([current], "2026-09-30")).toBe(current);
  });

  it("returns the past SUPERSEDED version for a date inside its window", () => {
    const old = v("SUPERSEDED", "2018-01-01", "2023-12-31");
    const current = v("CURRENT", "2024-01-01", null);
    expect(selectApplicableVersion([old, current], "2020-06-15")).toBe(old);
    expect(selectApplicableVersion([old, current], "2025-06-15")).toBe(current);
  });

  it("treats the window as inclusive on both ends", () => {
    const period = v("HISTORICAL", "2020-01-01", "2020-12-31");
    expect(selectApplicableVersion([period], "2020-01-01")).toBe(period);
    expect(selectApplicableVersion([period], "2020-12-31")).toBe(period);
    expect(selectApplicableVersion([period], "2021-01-01")).toBeNull();
    expect(selectApplicableVersion([period], "2019-12-31")).toBeNull();
  });

  it("never returns DRAFT or REPEALED even when the date is in range", () => {
    expect(selectApplicableVersion([v("DRAFT", "2024-01-01", null)], "2026-01-01")).toBeNull();
    expect(
      selectApplicableVersion([v("REPEALED", "2020-01-01", "2030-01-01")], "2025-01-01"),
    ).toBeNull();
  });

  it("returns null when no version covers the date", () => {
    const future = v("CURRENT", "2030-01-01", null);
    expect(selectApplicableVersion([future], "2025-01-01")).toBeNull();
    expect(selectApplicableVersion([], "2025-01-01")).toBeNull();
  });

  it("prefers the version with the latest effectiveFrom when periods overlap", () => {
    const older = v("SUPERSEDED", "2020-01-01", "2026-12-31");
    const newer = v("CURRENT", "2024-01-01", null);
    expect(selectApplicableVersion([older, newer], "2025-06-01")).toBe(newer);
  });

  it("accepts a Date as well as a 'YYYY-MM-DD' string", () => {
    const current = v("CURRENT", "2024-01-01", null);
    expect(selectApplicableVersion([current], new Date("2025-03-03T12:00:00Z"))).toBe(current);
  });
});
