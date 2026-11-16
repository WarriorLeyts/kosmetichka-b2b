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
  if (String(value).trim().startsWith("+") && !String(value).trim().startsWith("+7")) return "+" + digits;
  if (digits.length === 11 && digits.startsWith("7")) return "8" + digits.slice(1);
  return digits;
}

/**
 * Convert any Russian phone number to the 7XXXXXXXXXX format required by
 * the SMS Aero API. Returns null when the input cannot be parsed.
 */
export function toSmsAeroPhone(value: string): string | null {
  if (String(value).trim().startsWith("+") && !String(value).trim().startsWith("+7")) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("7")) return digits;
  if (digits.length === 11 && digits.startsWith("8")) return "7" + digits.slice(1);
  if (digits.length === 10) return "7" + digits;
  return null;
}


/** Explicit international contact number. +7 uses the existing SMS registration flow. */
export function foreignContactPhone(value: unknown): string | null {
  if (typeof value !== "string" || !/^\+[\d\s().-]+$/.test(value.trim())) return null;
  const phone = "+" + value.replace(/\D/g, "");
  return /^\+[1-9]\d{6,14}$/.test(phone) && !phone.startsWith("+7") ? phone : null;
}
export function registrationEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
