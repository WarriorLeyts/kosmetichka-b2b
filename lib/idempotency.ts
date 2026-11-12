/**
 * «The same request again» guard for actions that must not run twice (audit BUG-07). The app sends a
 * random `requestId` with an order; when the answer is lost on a bad connection and the customer taps
 * again, the same id comes back and gets the first answer instead of a second order.
 *
 * In memory of this one process (a restart forgets — the window is 10 minutes anyway).
 */
type Entry = { at: number; body?: unknown };

const TTL = 10 * 60 * 1000;
const seen = new Map<string, Entry>();

export type Once =
  | { kind: "run"; done: (status: number, body: unknown) => void }
  | { kind: "repeat"; body: unknown }
  | { kind: "busy" };

/** A valid client id: 8–64 letters, digits, «-» or «_» */
export function requestIdOf(body: unknown): string | null {
  const id = (body as { requestId?: unknown } | null)?.requestId;
  return typeof id === "string" && /^[\w-]{8,64}$/.test(id) ? id : null;
}

/**
 * `run` — first time: do the work, then call `done(status, body)` (only a 2xx answer is remembered; an
 * error lets the next try run again). `repeat` — already done: answer with `body`. `busy` — the first
 * request is still running.
 */
export function once(key: string, now = Date.now()): Once {
  for (const [k, e] of seen) if (now - e.at > TTL) seen.delete(k);
  const hit = seen.get(key);
  if (hit) return hit.body !== undefined ? { kind: "repeat", body: hit.body } : { kind: "busy" };
  seen.set(key, { at: now });
  return {
    kind: "run",
    done: (status, body) => {
      if (status >= 200 && status < 300 && body !== undefined) seen.set(key, { at: now, body });
      else seen.delete(key);
    },
  };
}

/** tests only */
export function _resetOnce() {
  seen.clear();
}
