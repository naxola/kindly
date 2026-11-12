import { describe, expect, it } from "vitest";
import {
  ONBOARDING_PATHS,
  PREFLIGHT_CHECKS,
  checkCountrySupport,
  getOnboardingPath,
} from "@/modules/messaging/whatsapp-onboarding";

describe("WhatsApp coexistence onboarding (unit, no database)", () => {
  describe("paths", () => {
    it("offers the three mutually exclusive ways in", () => {
      expect(ONBOARDING_PATHS.map((path) => path.id)).toEqual(["COEXISTENCE", "NEW_ACCOUNT", "MIGRATE_BSP"]);
    });

    it("marks only coexistence available, since it is the only decided path", () => {
      const available = ONBOARDING_PATHS.filter((path) => path.available);
      expect(available.map((path) => path.id)).toEqual(["COEXISTENCE"]);
    });

    it("always explains why an unavailable path is unavailable", () => {
      for (const path of ONBOARDING_PATHS.filter((p) => !p.available)) {
        expect(path.unavailableReason?.length ?? 0).toBeGreaterThan(0);
      }
    });

    it("returns null for an id that is not one of the three", () => {
      expect(getOnboardingPath("COEXISTENCE")?.id).toBe("COEXISTENCE");
      expect(getOnboardingPath("SOMETHING_ELSE")).toBeNull();
    });
  });

  describe("preflight checks", () => {
    it("has stable, unique ids — they are what the server re-validates", () => {
      const ids = PREFLIGHT_CHECKS.map((check) => check.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("covers the consequences a delegate cannot undo from Kindly", () => {
      const ids = PREFLIGHT_CHECKS.map((check) => check.id);
      expect(ids).toEqual(
        expect.arrayContaining(["business-app", "business-manager", "history", "disabled-features", "cost"]),
      );
    });
  });

  describe("country support", () => {
    it("reports UNKNOWN when no list is configured, rather than guessing", () => {
      // The official list of excluded regions is unconfirmed
      // (docs/DECISIONS.md): a guessed list would block real users with
      // false confidence, which is worse than admitting we cannot check.
      expect(checkCountrySupport("ES", [])).toBe("UNKNOWN");
    });

    it("matches the configured codes case-insensitively", () => {
      expect(checkCountrySupport("cu", ["CU", "KP"])).toBe("UNSUPPORTED");
      expect(checkCountrySupport(" es ", ["CU", "KP"])).toBe("SUPPORTED");
    });
  });
});
