import fs from "fs/promises";
import path from "path";
import { DATA_ROOT } from "@/lib/dataDir";

/**
 * Uncaught server errors (Next `onRequestError`) → one JSON line each in DATA_DIR/server-errors.log.
 * ~/ops/monitor.mjs (cron, every 5 min) reads the new lines and sends them to the monitoring Telegram
 * chat — audit ARCH-07. Only the path (no query string: it may carry a phone or a search) and the
 * error's first line, so no customer data ends up in the log or the chat.
 */
export const SERVER_ERRORS_FILE = path.join(DATA_ROOT, "server-errors.log");
const MAX_BYTES = 5 * 1024 * 1024;

export function serverErrorLine(err: unknown, req: { path?: string; method?: string }, ctx: { routePath?: string; routeType?: string }, at = new Date()) {
  const message = (err instanceof Error ? err.message : String(err)).split("\n")[0].slice(0, 300);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest).slice(0, 40) : undefined;
  return JSON.stringify({
    at: at.toISOString(),
    method: req.method,
    path: (req.path ?? "").split("?")[0].slice(0, 200),
    route: ctx.routePath,
    type: ctx.routeType,
    message,
    ...(digest ? { digest } : {}),
  });
}

export async function recordServerError(line: string) {
  try {
    const st = await fs.stat(SERVER_ERRORS_FILE).catch(() => null);
    // a runaway loop must not fill the disk: past 5 MB start over (the monitor follows the size)
    if (st && st.size > MAX_BYTES) await fs.writeFile(SERVER_ERRORS_FILE, "");
    await fs.appendFile(SERVER_ERRORS_FILE, line + "\n");
  } catch {
    // the log is a convenience — never let it break a request
  }
}
