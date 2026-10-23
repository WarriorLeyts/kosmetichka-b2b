import { exec } from "child_process";
import path from "path";

// In production Next runs from .next/standalone (process.cwd()), where only
// traced files are copied — the import-*.js scripts are NOT there. So run the
// scripts from the project root, but keep cwd = process.cwd(), because the XML
// files from 1C are saved to process.cwd()/data/1c.
function appRoot(): string {
  if (process.env.APP_ROOT) return process.env.APP_ROOT;
  const cwd = process.cwd();
  return cwd.endsWith(path.join(".next", "standalone")) ? path.resolve(cwd, "..", "..") : cwd;
}

let running = false;
let pending = false;

// Runs scripts/sync-all.js; concurrent calls are coalesced into one extra run.
export function runSync(tag = "sync"): void {
  if (running) {
    pending = true;
    console.log(`[${tag}] sync already running, queued`);
    return;
  }
  running = true;
  const scriptPath = path.join(appRoot(), "scripts", "sync-all.js");
  exec(`node "${scriptPath}"`, { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) console.error(`[${tag}] sync error:`, err.message, stderr);
    else console.log(`[${tag}] sync done:`, stdout, stderr ? `\nstderr:\n${stderr}` : "");
    running = false;
    if (pending) {
      pending = false;
      runSync(tag);
    }
  });
}
