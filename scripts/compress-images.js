/**
 * compress-images.js
 * Сжимает все изображения в data/1c/ на месте.
 * Запуск: node scripts/compress-images.js
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const IMG_DIR = path.join(ROOT, "data", "1c");

const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// Собрать все файлы изображений рекурсивно
function collectImages(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectImages(fullPath));
    } else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

async function compressImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const before = fs.statSync(filePath).size;

  // Читаем оригинал
  const input = fs.readFileSync(filePath);

  const MAX_PX = 1200; // максимум 1200px по длинной стороне

  let output;
  try {
    const pipeline = sharp(input).resize(MAX_PX, MAX_PX, {
      fit: "inside",          // пропорционально, не обрезает
      withoutEnlargement: true, // маленькие не увеличивать
    });

    if (ext === ".png") {
      output = await pipeline.png({ compressionLevel: 9, quality: 80 }).toBuffer();
    } else if (ext === ".webp") {
      output = await pipeline.webp({ quality: 75 }).toBuffer();
    } else {
      // jpg / jpeg
      output = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    }
  } catch (err) {
    console.warn(`  SKIP (cant decode): ${filePath} — ${err.message}`);
    return { before, after: before, saved: 0 };
  }

  const after = output.length;

  // Записываем только если стало меньше
  if (after < before) {
    fs.writeFileSync(filePath, output);
  }

  return { before, after: Math.min(before, after), saved: Math.max(0, before - after) };
}

async function main() {
  console.log(`Сканирование: ${IMG_DIR}`);
  const images = collectImages(IMG_DIR);
  console.log(`Найдено изображений: ${images.length}\n`);

  let totalBefore = 0;
  let totalAfter = 0;
  let processed = 0;

  for (const imgPath of images) {
    const rel = path.relative(ROOT, imgPath);
    const { before, after, saved } = await compressImage(imgPath);
    totalBefore += before;
    totalAfter += after;
    processed++;

    const pct = before > 0 ? Math.round((saved / before) * 100) : 0;
    if (pct > 0) {
      console.log(`✓ ${rel}: ${kb(before)} → ${kb(after)} (−${pct}%)`);
    }

    if (processed % 100 === 0) {
      console.log(`  ... обработано ${processed}/${images.length}`);
    }
  }

  const totalSaved = totalBefore - totalAfter;
  console.log(`\n=== Готово ===`);
  console.log(`Обработано:  ${processed} файлов`);
  console.log(`Было:        ${mb(totalBefore)}`);
  console.log(`Стало:       ${mb(totalAfter)}`);
  console.log(`Сэкономлено: ${mb(totalSaved)} (${Math.round((totalSaved / totalBefore) * 100)}%)`);
}

function kb(bytes) { return (bytes / 1024).toFixed(0) + " KB"; }
function mb(bytes) { return (bytes / 1024 / 1024).toFixed(1) + " MB"; }

main().catch(console.error);
