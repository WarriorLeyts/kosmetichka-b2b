import { exec } from "child_process";
import path from "path";
import { appRoot } from "@/lib/syncRunner";

/**
 * Counterparties from 1С over OData (scripts/import-customers.js → scripts/onec-odata.js) every 15 minutes,
 * instead of the 1С extension «Выгрузка контрагентов сайт» + customers.xml. Only when ODATA_* is set.
 * CUSTOMERS_SYNC=off disables it; CUSTOMERS_SYNC_MINUTES changes the period.
 */
let running = false;

export function customersSyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ODATA_BASE_URL && env.ODATA_USER && env.ODATA_PASSWORD) && env.CUSTOMERS_SYNC !== "off";
}

export function runCustomersSync(): void {
  if (running) return;
  running = true;
  const script = path.join(appRoot(), "scripts", "import-customers.js");
  exec(`node "${script}"`, { cwd: process.cwd(), maxBuffer: 16 * 1024 * 1024, timeout: 10 * 60_000 }, (err, stdout, stderr) => {
    running = false;
    if (err) console.error("[customers-sync] error:", err.message, stderr);
    else console.log("[customers-sync] done:", stdout.trim().split("\n").slice(-8).join(" | "));
  });
}

export function startCustomersSync(): void {
  if (!customersSyncEnabled()) return;
  const minutes = Math.max(5, Number(process.env.CUSTOMERS_SYNC_MINUTES) || 15);
  setTimeout(runCustomersSync, 60_000);
  setInterval(runCustomersSync, minutes * 60_000).unref?.();
  console.log(`[customers-sync] контрагенты из 1С (OData) каждые ${minutes} мин`);
}
