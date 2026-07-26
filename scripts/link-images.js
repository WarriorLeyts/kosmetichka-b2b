// link-images.js
// Scans all image files under data/1c/import_files/ recursively.
// Filename format: {productGuidNoDashes}_{imageGuidNoDashes}.jpg
// The first GUID (before "_") matches the product.guid in the DB (with dashes).
// Saves the relative path (from data/1c/) into ProductImage so that the
// /1c/[...path] route can serve it.

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const IMPORT_DIR = path.join(ROOT, "data", "1c", "import_files");
const prisma = new PrismaClient();

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

function addDashes(guid) {
  // "0acd7e2999e011f0805610ffe0cbb38c" → "0acd7e29-99e0-11f0-8056-10ffe0cbb38c"
  return (
    guid.slice(0, 8) +
    "-" +
    guid.slice(8, 12) +
    "-" +
    guid.slice(12, 16) +
    "-" +
    guid.slice(16, 20) +
    "-" +
    guid.slice(20)
  );
}

function scanFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanFiles(full, results);
    } else if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

async function main() {
  if (!fs.existsSync(IMPORT_DIR)) {
    console.error("Папка не найдена:", IMPORT_DIR);
    process.exit(1);
  }

  console.log("Сканирую", IMPORT_DIR, "...");
  const files = scanFiles(IMPORT_DIR);
  console.log("Файлов найдено:", files.length);

  // Build map: productGuid → [relative paths from data/1c/]
  const guidToImages = new Map();

  for (const full of files) {
    const name = path.basename(full, path.extname(full)); // e.g. "0acd7e2999e011f0..._835de..."
    const parts = name.split("_");
    if (parts.length < 2) continue;

    const rawGuid = parts[0];
    if (rawGuid.length !== 32) continue; // not a 32-char hex guid

    const guid = addDashes(rawGuid);

    // Relative path from data/1c/ — what the /1c/ route expects
    const relPath = path.relative(path.join(ROOT, "data", "1c"), full).replace(/\\/g, "/");

    if (!guidToImages.has(guid)) guidToImages.set(guid, []);
    guidToImages.get(guid).push(relPath);
  }

  console.log("Уникальных GUID товаров в файлах:", guidToImages.size);

  let linked = 0;
  let notFound = 0;
  let processed = 0;

  for (const [guid, imagePaths] of guidToImages) {
    const product = await prisma.product.findUnique({
      where: { guid },
      select: { id: true },
    });

    processed++;
    if (processed % 500 === 0) {
      process.stdout.write(`\r  Обработано: ${processed}/${guidToImages.size} | Связано: ${linked} | Не найдено: ${notFound}`);
    }

    if (!product) {
      notFound++;
      continue;
    }

    // Replace all existing images for this product
    await prisma.productImage.deleteMany({ where: { productId: product.id } });

    for (const relPath of imagePaths) {
      await prisma.productImage.create({
        data: { productId: product.id, path: relPath },
      });
    }

    linked++;
  }

  console.log(`\nГотово! Связано товаров: ${linked} | GUID не найден в БД: ${notFound}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
