/**
 * A long import (catalogue / customers from 1C) as a background job. It used to run inside the HTTP
 * request: nginx / the browser gave up after a minute or two and nobody knew whether it finished.
 * Now the request starts it and waits up to `waitMs`; a longer one keeps running and the page asks
 * GET for its state. One job per kind at a time (two taps → one import). Kept in this process's memory.
 */
export type ImportState<R> = {
  status: "idle" | "running" | "done" | "error";
  startedAt: number | null;
  finishedAt: number | null;
  /** seconds, e.g. «42.3 сек» */
  duration: string | null;
  result: R | null;
  error: string | null;
};

type Job<R> = { state: ImportState<R>; promise: Promise<void> | null };
const jobs = new Map<string, Job<unknown>>();

function job<R>(kind: string): Job<R> {
  let j = jobs.get(kind) as Job<R> | undefined;
  if (!j) {
    j = { state: { status: "idle", startedAt: null, finishedAt: null, duration: null, result: null, error: null }, promise: null };
    jobs.set(kind, j as Job<unknown>);
  }
  return j;
}

export function importState<R>(kind: string): ImportState<R> {
  return { ...job<R>(kind).state };
}

/** Starts `run` unless the same kind is already running; resolves when done or after `waitMs`. */
export async function startImport<R>(kind: string, run: () => Promise<R>, errorText: string, waitMs = 20_000): Promise<ImportState<R>> {
  const j = job<R>(kind);
  if (j.state.status !== "running") {
    const startedAt = Date.now();
    j.state = { status: "running", startedAt, finishedAt: null, duration: null, result: null, error: null };
    j.promise = run().then(
      (result) => {
        const now = Date.now();
        j.state = { status: "done", startedAt, finishedAt: now, duration: ((now - startedAt) / 1000).toFixed(1) + " сек", result, error: null };
      },
      (e) => {
        console.error(`[import:${kind}]`, e);
        const now = Date.now();
        j.state = { status: "error", startedAt, finishedAt: now, duration: ((now - startedAt) / 1000).toFixed(1) + " сек", result: null, error: errorText };
      }
    );
  }
  await Promise.race([j.promise, new Promise((r) => setTimeout(r, waitMs))]);
  return importState<R>(kind);
}
