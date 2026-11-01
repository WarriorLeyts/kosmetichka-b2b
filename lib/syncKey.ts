import { timingSafeEqual } from "crypto";

/**
 * The 1C exchange key check (SYNC_API_KEY). Compared in constant time — a plain `===` stops at the
 * first wrong character, so the time of the answer told how much of a guess was right. No key on
 * the server → nobody passes.
 */
export function syncKeyOk(given: string | null | undefined): boolean {
  const expected = process.env.SYNC_API_KEY;
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `child` (an absolute path) lies inside directory `dir` — not just starts with the same letters. */
export function insideDir(dir: string, child: string): boolean {
  const base = dir.endsWith("/") ? dir : dir + "/";
  return child.startsWith(base);
}
