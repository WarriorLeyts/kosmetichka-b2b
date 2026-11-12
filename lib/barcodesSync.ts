import { exec } from "child_process";
import path from "path";
import { appRoot } from "@/lib/syncRunner";

/**
 * All barcodes from 1С, the full check every hour (scripts/import-barcodes.js --all): adds what the exchanges
 * missed (a barcode added in 1С without the product changing) and removes what was deleted in 1С.
 * After each exchange only the products of the exchange are checked (scripts/sync-all.js).
 */
let running = false;

export function runBarcodesSync(): void {
  if (running) return;
  running = true;
  const script = path.join(appRoot(), "scripts", "import-barcodes.js");
  exec(`node "${script}" --all`, { cwd: process.cwd(), maxBuffer: 8 * 1024 * 1024, timeout: 10 * 60_000 }, (err, stdout, stderr) => {
    running = false;
    if (err) console.error("[barcodes-sync] error:", err.message, stderr);
    else console.log("[barcodes-sync]", stdout.trim().split("\n").slice(-3).join(" | "));
  });
}

export function startBarcodesSync(): void {
  if (!(process.env.ODATA_BASE_URL && process.env.ODATA_USER && process.env.ODATA_PASSWORD) || process.env.BARCODES_SYNC === "off") return;
  setTimeout(runBarcodesSync, 3 * 60_000);
  setInterval(runBarcodesSync, 60 * 60_000).unref?.();
  console.log("[barcodes-sync] все штрихкоды из 1С: после обмена — товары обмена, раз в час — полная сверка");
}
