/**
 * Phone number normalisation helpers used across auth routes.
 */

/**
 * Normalise a Russian phone number to the internal 8XXXXXXXXXX format
 * (11 digits, starts with 8) used in the database.
 * Returns an empty string for null / undefined / unparseable input.
 */
export function normalizePhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("7")) return "8" + digits.slice(1);
  return digits;
}

/**
 * Convert any Russian phone number to the 7XXXXXXXXXX format required by
 * the SMS Aero API. Returns null when the input cannot be parsed.
 */
export function toSmsAeroPhone(value: string): string | null {
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("7")) return digits;
  if (digits.length === 11 && digits.startsWith("8")) return "7" + digits.slice(1);
  if (digits.length === 10) return "7" + digits;
  return null;
}
