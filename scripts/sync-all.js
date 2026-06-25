import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const scripts = [
  "import-catalog.js",
  "import-prices.js",
  "import-customers.js",
  "import-images.js",
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
