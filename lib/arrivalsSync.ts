import { exec } from "child_process";
import path from "path";
import { appRoot } from "@/lib/syncRunner";

/** «Новые поступления» from 1С every 30 minutes (scripts/import-arrivals.js); also after each exchange (sync-all.js). */
let running = false;
let started = false;

export function runArrivalsSync(): void {
  if (running) return;
  running = true;
  exec(`node "${path.join(appRoot(), "scripts", "import-arrivals.js")}"`, { cwd: process.cwd(), maxBuffer: 8 * 1024 * 1024, timeout: 10 * 60_000 }, (err, stdout, stderr) => {
    running = false;
    if (err) console.error("[arrivals-sync] error:", err.message, stderr);
    else console.log("[arrivals-sync]", stdout.trim().split("\n").slice(-1)[0]);
  });
}

export function startArrivalsSync(): void {
  if (started) return;
  started = true;
  if (!(process.env.ODATA_BASE_URL && process.env.ODATA_USER && process.env.ODATA_PASSWORD) || process.env.ARRIVALS_SYNC === "off") return;
  setTimeout(runArrivalsSync, 90_000);
  setInterval(runArrivalsSync, 30 * 60_000).unref?.();
  console.log("[arrivals-sync] новые поступления из 1С каждые 30 мин");
}
