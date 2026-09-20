/**
 * Pure onboarding rules for WhatsApp coexistence (PKG-008): the paths a
 * delegate can take, what they must acknowledge before connecting, and the
 * country check. No I/O and no `server-only` guard, so it is unit-testable
 * (same pattern as conversations/domain.ts).
 *
 * Every fact here comes from docs/INTEGRATIONS.md sección 2.2, which in
 * turn comes from Meta's own documentation. Nothing is invented: a
 * requirement that cannot be sourced does not belong on a screen that tells
 * someone what will happen to their phone.
 */

export type OnboardingPathId = "COEXISTENCE" | "NEW_ACCOUNT" | "MIGRATE_BSP";

export interface OnboardingPath {
  id: OnboardingPathId;
  title: string;
  description: string;
  /**
   * False when Kindly has not decided or built that path. Shown as
   * unavailable rather than hidden: the delegate should know the option
   * exists and simply is not ready, not wonder whether they missed it.
   */
  available: boolean;
  unavailableReason?: string;
}

/**
 * The three mutually exclusive ways into WhatsApp. Only coexistence is a
 * decided path (docs/DECISIONS.md, 2026-09-19); the other two are real
 * Meta flows that Kindly has not adopted, so they are listed and disabled
 * instead of pretending to work.
 */
export const ONBOARDING_PATHS: OnboardingPath[] = [
  {
    id: "COEXISTENCE",
    title: "Conectar mi número actual de WhatsApp Business",
    description:
      "Sigues usando tu número en la app de WhatsApp Business del móvil, y Kindly sincroniza esas conversaciones por detrás.",
    available: true,
  },
  {
    id: "NEW_ACCOUNT",
    title: "Crear una cuenta de WhatsApp Business nueva",
    description: "Un número nuevo, dedicado a Kindly, sin relación con el que usas hoy en el móvil.",
    available: false,
    unavailableReason:
      "Todavía no está disponible. Kindly ha adoptado de momento solo la vía de coexistence; esta requiere una decisión de producto que aún no se ha tomado.",
  },
  {
    id: "MIGRATE_BSP",
    title: "Migrar desde otro proveedor (BSP)",
    description: "Traer a Kindly un número que ya opera con otro proveedor de la API de WhatsApp.",
    available: false,
    unavailableReason:
      "Todavía no está disponible. La migración entre proveedores tiene reglas propias de Meta que hay que verificar antes de ofrecerla.",
  },
];

export function getOnboardingPath(id: string): OnboardingPath | null {
  return ONBOARDING_PATHS.find((path) => path.id === id) ?? null;
}

export interface PreflightCheck {
  id: string;
  title: string;
  detail: string;
}

/**
 * What the delegate has to acknowledge before the connection starts. These
 * are not Kindly's terms and conditions — each one is a Meta requirement or
 * a real consequence for the phone in their pocket, and getting one wrong
 * means the onboarding fails or the delegate loses something they used.
 */
export const PREFLIGHT_CHECKS: PreflightCheck[] = [
  {
    id: "business-app",
    title: "El número está en la app de WhatsApp Business",
    detail:
      "Tiene que ser WhatsApp Business (versión 2.24.17 o superior), no la app de WhatsApp normal. Si usas la app de consumo, esta vía no es posible con ese número.",
  },
  {
    id: "not-on-cloud-api",
    title: "El número no está ya registrado en la Cloud API",
    detail: "Un número que ya se registró en la API de WhatsApp por su cuenta no puede entrar por coexistence.",
  },
  {
    id: "business-manager",
    title: "El número está añadido al Business Manager de la organización",
    detail: "Meta exige que el número forme parte del Business Manager desde el que se autoriza la conexión.",
  },
  {
    id: "history",
    title: "Se sincronizarán hasta 180 días de historial",
    detail:
      "Solo conversaciones individuales, nunca grupos. Los archivos adjuntos solo llegan para los mensajes de los últimos 14 días.",
  },
  {
    id: "disabled-features",
    title: "Perderás algunas funciones en el móvil",
    detail:
      "Se desactivan los mensajes temporales, «ver una vez», la ubicación en directo y las listas de difusión. WhatsApp para Windows y para WearOS se desvinculan durante el proceso.",
  },
  {
    id: "cost",
    title: "Los mensajes enviados desde Kindly se facturan",
    detail:
      "Lo que envíes desde tu móvil sigue siendo gratis. Lo que se envíe desde Kindly va por la Cloud API y tiene el coste estándar de Meta.",
  },
];

export type CountryCheckStatus = "SUPPORTED" | "UNSUPPORTED" | "UNKNOWN";

/**
 * Checks the number's country against the configured list of regions where
 * coexistence is not offered.
 *
 * Returns `UNKNOWN` when no list is configured, and that is the default.
 * The official enumeration of unsupported regions could not be confirmed
 * (docs/DECISIONS.md, 2026-09-19), and a list copied from a blog post would
 * be worse than no list: it would block real users with false confidence.
 * So Kindly says it cannot check rather than guessing, and the deployment
 * fills `WHATSAPP_UNSUPPORTED_COUNTRY_CODES` once the official source is at
 * hand.
 */
export function checkCountrySupport(
  countryCode: string,
  unsupportedCodes: readonly string[],
): CountryCheckStatus {
  if (unsupportedCodes.length === 0) {
    return "UNKNOWN";
  }
  return unsupportedCodes.includes(countryCode.trim().toUpperCase()) ? "UNSUPPORTED" : "SUPPORTED";
}

/** Reads the configured list. Empty by default — see checkCountrySupport. */
export function getUnsupportedCountryCodes(): string[] {
  return (process.env.WHATSAPP_UNSUPPORTED_COUNTRY_CODES ?? "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}
