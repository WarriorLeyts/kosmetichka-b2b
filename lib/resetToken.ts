import { createHash } from "crypto";

/**
 * Password-reset links: the e-mail carries the token, the database keeps only its sha256 — a leaked
 * PasswordResetToken table (backup, log, SQL console) gives nobody a working reset link (audit SEC-08).
 */
export function resetTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
