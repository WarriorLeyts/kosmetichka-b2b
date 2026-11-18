import { createHash } from "crypto";

/** Only pending requests are shared. Never cache stock, prices or authentication results. */
const pending = new Map<string, Promise<Response>>();
export function catalogFlightKey(request: Request, customerToken = "", staffToken = ""): string {
  // Keep customer/staff sessions and pricing clients separate; credentials never become log keys.
  return createHash("sha256").update(JSON.stringify([
    request.url, customerToken, staffToken, request.headers.get("x-kosmetichka-client"),
  ])).digest("hex");
}

export async function shareCatalogRequest(key: string, run: () => Promise<Response>): Promise<Response> {
  const existing = pending.get(key);
  if (existing) return (await existing).clone();
  // Bound memory even when many distinct searches arrive at once.
  if (pending.size >= 100) return run();
  const task = Promise.resolve().then(run);
  pending.set(key, task);
  try {
    // Every HTTP caller gets its own readable body and headers.
    return (await task).clone();
  } finally {
    pending.delete(key);
  }
}
