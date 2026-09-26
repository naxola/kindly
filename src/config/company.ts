/**
 * Legal and company identity, in one place.
 *
 * Meta's business verification compares these values against the documents
 * you upload and against your domain, and rejects on mismatches as small as
 * an abbreviation ("C/" vs "Calle"). So this is not copy — it is the data
 * that has to match your registry entry exactly, character for character.
 *
 * Every `REVISAR:` value below is a placeholder that must be replaced before
 * the site is published. They are deliberately visible rather than
 * plausible-looking: a made-up address on a legal notice is worse than an
 * obvious gap, and nobody can accidentally ship one of these.
 */
export const company = {
  /** Commercial name. */
  productName: "Kindly",

  /** Legal entity name, exactly as registered. Meta matches this literally. */
  legalName: "Hayat Iberia S.L.",

  /** NIF/CIF. */
  taxId: "B53487885",

  /** Full registered address, no abbreviations — Meta rejects abbreviated forms. */
  address: "Rambla baja 97, 1i",

  /** Registry details. Required by Spanish LSSI-CE for a company; leave empty for an autónomo. */
  registryDetails:
    "REVISAR: datos registrales (Registro Mercantil, tomo, folio, hoja)",

  /**
   * Contact email on your own domain. Meta rejects free providers
   * (gmail.com, hotmail.com...) for business verification.
   */
  email: "REVISAR: contacto@tudominio.com",

  /** Address for data-protection requests. May be the same as `email`. */
  privacyEmail: "REVISAR: privacidad@tudominio.com",

  /** Verifiable business phone, international format. */
  phone: "REVISAR: +34 675349979",

  /** Canonical origin, no trailing slash. Must match the domain you verify with Meta. */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://REVISAR-tu-dominio.com",

  /** Date the legal documents last changed, shown to readers. */
  legalUpdatedAt: "20 de septiembre de 2026",
} as const;

/** True when the legal identity still holds placeholders — drives the visible warning banner. */
export function hasPlaceholderCompanyData(): boolean {
  return Object.values(company).some(
    (value) => typeof value === "string" && value.startsWith("REVISAR:"),
  );
}

/**
 * Third parties that process personal data on Kindly's behalf. Naming them
 * is a GDPR requirement (art. 13.1.e) and it is also what a Meta reviewer
 * looks for: they want to see WhatsApp named as a source of data and to
 * understand what you do with it.
 *
 * Keep this list truthful. A sub-processor that is not yet in use does not
 * belong here, and one that is in use and missing is a compliance gap.
 */
export const subProcessors = [
  {
    name: "Meta Platforms Ireland Ltd.",
    purpose:
      "Sincronización de mensajes de WhatsApp Business a través de la WhatsApp Business Platform.",
    location: "Unión Europea, con transferencias a Estados Unidos.",
  },
  {
    name: "Telegram FZ-LLC",
    purpose:
      "Sincronización de mensajes de Telegram cuando el profesional conecta ese canal.",
    location: "Emiratos Árabes Unidos.",
  },
  {
    name: "REVISAR: proveedor de alojamiento",
    purpose: "Alojamiento de la aplicación y de la base de datos.",
    location: "REVISAR: región del alojamiento.",
  },
  {
    name: "REVISAR: proveedor de modelos de lenguaje",
    purpose:
      "Generación de sugerencias de respuesta cuando el profesional usa el copiloto. No se usan los datos para entrenar modelos.",
    location: "REVISAR: región de procesamiento.",
  },
] as const;
