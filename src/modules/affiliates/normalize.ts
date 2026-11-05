/**
 * Pure normalization of an "alta" payload as produced by the n8n email
 * extraction (no I/O). The payload is untrusted: every field is validated
 * and coerced here, and anything that cannot be read becomes an error for
 * that item instead of an exception.
 */

export interface AffiliateAddress {
  streetType: string | null;
  street: string | null;
  number: string | null;
  staircase: string | null;
  floor: string | null;
  door: string | null;
  other: string | null;
  country: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
}

export interface NormalizedAffiliate {
  firstName: string;
  lastName: string;
  /** Upper-case, no spaces or dashes. */
  dni: string;
  /** ISO `YYYY-MM-DD`, or null when absent. */
  birthDate: string | null;
  gender: string | null;
  phoneE164: string | null;
  email: string | null;
  address: AffiliateAddress;
  province: string | null;
  sector: string | null;
  employmentStatus: string | null;
  monthlyFeeCents: number | null;
  workplace: string | null;
  workplaceProvince: string | null;
}

export type NormalizeResult = { ok: true; value: NormalizedAffiliate } | { ok: false; errors: string[] };

const MAX_TEXT = 200;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, MAX_TEXT) : null;
}

/** "MARÍA VICTORIA" → "María Victoria". Mixed-case input is left as written. */
export function toDisplayCase(value: string): string {
  if (value !== value.toUpperCase() || value === value.toLowerCase()) return value;
  return value
    .toLocaleLowerCase("es-ES")
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toLocaleUpperCase("es-ES"));
}

export function normalizeDni(value: unknown): string | null {
  const raw = text(value)?.replace(/[\s.-]/g, "").toUpperCase();
  return raw ?? null;
}

/** DNI (8 digits + letter) or NIE (X/Y/Z + 7 digits + letter). Format only, no checksum: the source email is the authority. */
export function isDniShape(dni: string): boolean {
  return /^(\d{8}|[XYZ]\d{7})[A-Z]$/.test(dni);
}

/** Spanish numbers (9 digits starting 6-9, optionally +34/0034/34) to E.164; null when not recognizable. */
export function normalizeSpanishPhone(value: unknown): string | null {
  const digits = text(value)?.replace(/[^\d+]/g, "");
  if (!digits) return null;
  const national = digits.replace(/^(\+34|0034|34)(?=\d{9}$)/, "");
  return /^[6-9]\d{8}$/.test(national) ? `+34${national}` : null;
}

/** `DD-MM-YYYY` / `DD/MM/YYYY` / `YYYY-MM-DD` to ISO; null when not a real date. */
export function parseBirthDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/) ?? raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const iso = match[1].length === 4;
  const [year, month, day] = iso ? [match[1], match[2], match[3]] : [match[3], match[2], match[1]];
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900 || date.getTime() > Date.now()) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "11.5 €" / "11,50" → 1150 cents; null when unreadable. */
export function parseFeeCents(value: unknown): number | null {
  const raw = typeof value === "number" ? String(value) : text(value);
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads one item of the intake array. Only a valid "alta" becomes a value. */
export function normalizeAffiliatePayload(item: unknown): NormalizeResult {
  if (!isRecord(item)) return { ok: false, errors: ["El elemento no es un objeto."] };

  const errors: string[] = [];
  if (item.tipoSolicitud !== "alta") errors.push("Solo se admiten solicitudes de tipo «alta».");
  if (item.validoParaProcesar !== true) errors.push("La solicitud no está marcada como válida para procesar.");
  if (Array.isArray(item.errores) && item.errores.length > 0) errors.push("La solicitud trae errores de extracción.");

  const a = isRecord(item.afiliado) ? item.afiliado : null;
  if (!a) {
    return { ok: false, errors: [...errors, "Falta el objeto «afiliado»."] };
  }

  const firstNameRaw = text(a.nombre);
  const lastNameRaw = text(a.apellidos);
  const dni = normalizeDni(a.dni);
  if (!firstNameRaw) errors.push("Falta el nombre.");
  if (!lastNameRaw) errors.push("Faltan los apellidos.");
  if (!dni) errors.push("Falta el DNI/NIE.");
  else if (!isDniShape(dni)) errors.push("El DNI/NIE no tiene un formato válido.");

  const birthRaw = text(a.fechaNacimiento);
  const birthDate = parseBirthDate(birthRaw);
  if (birthRaw && !birthDate) errors.push("La fecha de nacimiento no es válida.");

  const phoneRaw = text(a.telefono);
  const phoneE164 = normalizeSpanishPhone(phoneRaw);
  if (phoneRaw && !phoneE164) errors.push("El teléfono no es un número español válido.");

  const emailRaw = text(a.email)?.toLowerCase() ?? null;
  const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
  if (emailRaw && !email) errors.push("El email no es válido.");

  const feeRaw = isRecord(a.afiliacion) ? a.afiliacion.cuotaMensual : null;
  const monthlyFeeCents = parseFeeCents(feeRaw);
  if (text(feeRaw) && monthlyFeeCents === null) errors.push("La cuota mensual no es válida.");

  if (errors.length > 0 || !firstNameRaw || !lastNameRaw || !dni) return { ok: false, errors };

  const d = isRecord(a.domicilio) ? a.domicilio : {};
  const f = isRecord(a.afiliacion) ? a.afiliacion : {};
  return {
    ok: true,
    value: {
      firstName: toDisplayCase(firstNameRaw),
      lastName: toDisplayCase(lastNameRaw),
      dni,
      birthDate,
      gender: text(a.genero),
      phoneE164,
      email,
      address: {
        streetType: text(d.tipoVia),
        street: text(d.direccion),
        number: text(d.numero),
        staircase: text(d.escalera),
        floor: text(d.piso),
        door: text(d.puerta),
        other: text(d.otros),
        country: text(d.pais),
        postalCode: text(d.codigoPostal),
        city: text(d.poblacion),
        province: text(d.provincia),
      },
      province: text(f.provincia),
      sector: text(f.sector),
      employmentStatus: text(f.situacionLaboral),
      monthlyFeeCents,
      workplace: text(f.centroTrabajo),
      workplaceProvince: text(f.provinciaTrabajo),
    },
  };
}
