/**
 * Utilities for parsing OrderItemCheck.status values.
 *
 * The status field stores one of three formats:
 *   - plain string:    "ok"
 *   - JSON str array:  ["expired","bad_condition"]
 *   - JSON rich array: [{"s":"expired","q":2},"bad_condition"]
 */

/**
 * Returns the individual status code strings from a raw check status value.
 * Always returns at least one element when the input is non-empty.
 */
export function parseCheckStatuses(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((e) => (typeof e === "string" ? e : (e as { s: string }).s))
        .filter(Boolean);
    }
  } catch {
    // not JSON — treat as a plain status string
  }
  return [raw];
}

/** Returns true when any status code in the check is not "ok" */
export function hasCheckIssues(raw: string | null | undefined): boolean {
  return parseCheckStatuses(raw).some((s) => s !== "ok");
}
