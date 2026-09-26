/**
 * Canonical phone form for matching: digits only, US country code dropped.
 * "(360) 555-0142", "360.555.0142" and "+1 360 555 0142" all become "3605550142".
 * Returns null when there aren't enough digits to be a phone number.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length >= 7 ? digits : null;
}

/** "(360) 555-0142" for 10-digit US numbers; anything else is returned as digits. */
export function formatPhone(digits: string | null | undefined): string | null {
  if (!digits) return null;
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits;
}

export const looksLikeEmail = (value: string) => value.includes("@");
