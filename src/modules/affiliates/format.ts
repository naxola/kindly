/** Display helpers for an alta (pure, safe on server and client). */

/** "1982-09-03" → "03/09/1982"; fixed format so server and client render the same. */
export function formatIsoDate(iso: string | null): string {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

/** 1150 → "11,50 €". */
export function formatFee(cents: number | null): string {
  return cents === null ? "—" : `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

/** One-line postal address from whatever parts the alta carried. */
export function formatAddress(address: {
  streetType: string | null;
  street: string | null;
  number: string | null;
  staircase: string | null;
  floor: string | null;
  door: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
}): string {
  const street = [address.streetType, address.street, address.number].filter(Boolean).join(" ");
  const unit = [
    address.staircase && `esc. ${address.staircase}`,
    address.floor && `${address.floor}º`,
    address.door,
  ]
    .filter(Boolean)
    .join(" ");
  const place = [address.postalCode, address.city].filter(Boolean).join(" ");
  const parts = [[street, unit].filter(Boolean).join(", "), place, address.province].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}
