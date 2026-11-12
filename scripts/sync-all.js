import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Counterparties come from 1С over OData on their own schedule (lib/customersSync.ts) when ODATA_* is set;
// otherwise from customers.xml with every 1С exchange, as before.
const odata = Boolean(process.env.ODATA_BASE_URL && process.env.ODATA_USER && process.env.ODATA_PASSWORD);
const scripts = [
  "import-catalog.js",
  "import-prices.js",
  ...(odata ? [] : ["import-customers.js"]),
  "import-images.js",
  // all barcodes of the products of this exchange, from 1С over OData (the exchange carries one)
  ...(odata ? ["import-barcodes.js"] : []),
];

console.log("=== 1C Sync started:", new Date().toLocaleString("ru-RU"), "===");

for (const script of scripts) {
  const full = path.join(__dirname, script);
  console.log("--- Running:", script);
  try {
    execSync("node " + full, { stdio: "inherit" });
    console.log("OK:", script);
  } catch (err) {
    console.error("FAILED:", script, err.message);
    // Продолжаем остальные скрипты даже при ошибке
  }
}

console.log("=== 1C Sync done:", new Date().toLocaleString("ru-RU"), "===");
