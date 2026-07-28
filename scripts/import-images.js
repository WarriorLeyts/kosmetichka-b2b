import { PrismaClient } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const prisma = new PrismaClient();

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
const xml = fs.readFileSync(path.join(ROOT, "data", "1c", "import.xml"), "utf8");
const data = parser.parse(xml);
const raw = data["КоммерческаяИнформация"]?.["Каталог"]?.["Товары"]?.["Товар"] ?? [];
const products = Array.isArray(raw) ? raw : [raw];

// Determine MIME type from extension
function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

// Сжать изображение на месте (если стало меньше)
async function compressInPlace(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return;
    const input = fs.readFileSync(filePath);
    const MAX_PX = 1200;
    const pipeline = sharp(input).resize(MAX_PX, MAX_PX, {
      fit: "inside",
      withoutEnlargement: true,
    });
    let output;
    if (ext === ".png") {
      output = await pipeline.png({ compressionLevel: 9, quality: 80 }).toBuffer();
    } else if (ext === ".webp") {
      output = await pipeline.webp({ quality: 75 }).toBuffer();
    } else {
      output = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    }
    if (output.length < input.length) {
      fs.writeFileSync(filePath, output);
    }
  } catch {
    // не критично, оставляем оригинал
  }
}

// Преобразует hex-строку без дефисов в UUID формат
function hexToGuid(hex) {
  if (!hex || hex.length !== 32) return null;
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

async function main() {
  let saved = 0;
  let skipped = 0;

  // ── Проход 1: из XML-тегов <Картинка> ──────────────────────────────────────
  for (const item of products) {
    const guid = item["Ид"];
    if (!guid) continue;

    const imgs = item["Картинка"]
      ? Array.isArray(item["Картинка"]) ? item["Картинка"] : [item["Картинка"]]
      : [];
    if (!imgs.length) continue;

    // Check at least one image file exists locally before touching the DB
    const validImgs = imgs.filter((imgPath) => {
      const rel = String(imgPath).replace(/\\/g, "/");
      return fs.existsSync(path.join(ROOT, "data", "1c", rel));
    });

    if (!validImgs.length) {
      skipped++;
      continue;
    }

    const product = await prisma.product.findUnique({ where: { guid: String(guid) } });
    if (!product) continue;

    await prisma.productImage.deleteMany({ where: { productId: product.id } });

    for (const imgPath of validImgs) {
      const rel = String(imgPath).replace(/\\/g, "/");
      await compressInPlace(path.join(ROOT, "data", "1c", rel));

      await prisma.productImage.create({
        data: { productId: product.id, path: rel },
      });
      saved++;
    }
  }

  console.log("Проход 1 (XML): путей сохранено: " + saved + " | Без картинок: " + skipped);

  // ── Проход 2: матчинг по GUID-префиксу имени файла ────────────────────────
  // Имена файлов: {ГУИДтовара}_{ГУИДкартинки}.jpg (без дефисов, нижний регистр)
  // Первая часть до "_" — это GUID товара из 1С → совпадает с Product.guid
  console.log("\nПроход 2 (GUID-матчинг по файлам)...");

  const importFilesDir = path.join(ROOT, "data", "1c", "import_files");
  if (!fs.existsSync(importFilesDir)) {
    console.log("Папка import_files не найдена, пропускаем.");
    return;
  }

  // Собираем все файлы изображений из import_files/**
  const allImageFiles = [];
  const subdirs = fs.readdirSync(importFilesDir);
  for (const subdir of subdirs) {
    const subdirPath = path.join(importFilesDir, subdir);
    if (!fs.statSync(subdirPath).isDirectory()) continue;
    const files = fs.readdirSync(subdirPath);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
        allImageFiles.push(path.join("import_files", subdir, file));
      }
    }
  }

  console.log("Файлов найдено в import_files:", allImageFiles.length);

  // Группируем файлы по GUID товара (первая часть имени до "_")
  const byProductGuid = new Map();
  for (const relPath of allImageFiles) {
    const filename = path.basename(relPath, path.extname(relPath));
    const underscoreIdx = filename.indexOf("_");
    if (underscoreIdx === -1) continue;
    const guidHex = filename.slice(0, underscoreIdx).toLowerCase();
    if (guidHex.length !== 32) continue;
    const guid = hexToGuid(guidHex);
    if (!guid) continue;
    if (!byProductGuid.has(guid)) byProductGuid.set(guid, []);
    byProductGuid.get(guid).push(relPath);
  }

  console.log("Уникальных GUID товаров в файлах:", byProductGuid.size);

  let linked = 0;
  let alreadyHas = 0;

  for (const [guid, filePaths] of byProductGuid) {
    const product = await prisma.product.findUnique({ where: { guid } });
    if (!product) continue;

    // Если у товара уже есть картинки (привязанные на проходе 1 или ранее) — не трогаем
    const existingCount = await prisma.productImage.count({
      where: { productId: product.id },
    });
    if (existingCount > 0) {
      alreadyHas++;
      continue;
    }

    // Берём только существующие файлы, сортируем для стабильного порядка
    const validPaths = filePaths
      .filter((p) => fs.existsSync(path.join(ROOT, "data", "1c", p)))
      .sort();

    if (!validPaths.length) continue;

    for (const relPath of validPaths) {
      const normalizedRel = relPath.replace(/\\/g, "/");
      await compressInPlace(path.join(ROOT, "data", "1c", normalizedRel));
      await prisma.productImage.create({
        data: { productId: product.id, path: normalizedRel },
      });
      linked++;
    }
  }

  console.log("Проход 2: новых картинок привязано: " + linked);
  console.log("Проход 2: товаров с уже имевшимися картинками: " + alreadyHas);
}

main().catch(console.error).finally(() => prisma.$disconnect());
