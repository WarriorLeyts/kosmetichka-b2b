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

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

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
    // не критично
  }
}

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

    const validImgs = imgs.filter((imgPath) => {
      const rel = String(imgPath).replace(/\\/g, "/");
      return fs.existsSync(path.join(ROOT, "data", "1c", rel));
    });

    if (!validImgs.length) { skipped++; continue; }

    const product = await prisma.product.findUnique({ where: { guid: String(guid) } });
    if (!product) continue;

    await prisma.productImage.deleteMany({ where: { productId: product.id } });

    for (const imgPath of validImgs) {
      const rel = String(imgPath).replace(/\\/g, "/");
      await compressInPlace(path.join(ROOT, "data", "1c", rel));
      await prisma.productImage.create({ data: { productId: product.id, path: rel } });
      saved++;
    }
  }

  console.log("Проход 1 (XML): сохранено: " + saved + " | пропущено: " + skipped);

  // ── Проход 2: матчинг по GUID-префиксу имени файла ────────────────────────
  console.log("\nПроход 2 (GUID-матчинг)...");

  const importFilesDir = path.join(ROOT, "data", "1c", "import_files");
  if (!fs.existsSync(importFilesDir)) {
    console.log("Папка import_files не найдена, пропускаем.");
    return;
  }

  // 1. Собираем все файлы и группируем по GUID-префиксу
  const byProductGuid = new Map(); // guid → [relPath, ...]
  const subdirs = fs.readdirSync(importFilesDir);
  for (const subdir of subdirs) {
    const subdirPath = path.join(importFilesDir, subdir);
    if (!fs.statSync(subdirPath).isDirectory()) continue;
    for (const file of fs.readdirSync(subdirPath)) {
      const ext = path.extname(file).toLowerCase();
      if (![".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) continue;
      const baseName = path.basename(file, ext);
      const underscoreIdx = baseName.indexOf("_");
      if (underscoreIdx === -1) continue;
      const guidHex = baseName.slice(0, underscoreIdx).toLowerCase();
      if (guidHex.length !== 32) continue;
      const guid = hexToGuid(guidHex);
      if (!guid) continue;
      const relPath = "import_files/" + subdir + "/" + file;
      if (!byProductGuid.has(guid)) byProductGuid.set(guid, []);
      byProductGuid.get(guid).push(relPath);
    }
  }

  console.log("Файлов найдено: " + [...byProductGuid.values()].reduce((s, a) => s + a.length, 0));
  console.log("Уникальных GUID в файлах: " + byProductGuid.size);

  // 2. Загружаем ВСЕ продукты одним запросом: guid → id
  const allProducts = await prisma.product.findMany({ select: { id: true, guid: true } });
  const guidToId = new Map(allProducts.map((p) => [p.guid, p.id]));
  console.log("Товаров в базе: " + allProducts.length);

  // 3. Загружаем все productId у которых уже есть картинки
  const withImages = await prisma.productImage.findMany({ select: { productId: true } });
  const hasImageSet = new Set(withImages.map((r) => r.productId));
  console.log("Товаров с картинками уже: " + hasImageSet.size);

  // 4. Создаём записи только для тех у кого нет картинок
  let linked = 0;
  let notFound = 0;
  let alreadyHas = 0;

  for (const [guid, filePaths] of byProductGuid) {
    const productId = guidToId.get(guid);
    if (!productId) { notFound++; continue; }
    if (hasImageSet.has(productId)) { alreadyHas++; continue; }

    const validPaths = filePaths
      .filter((p) => fs.existsSync(path.join(ROOT, "data", "1c", p)))
      .sort();
    if (!validPaths.length) continue;

    // Берём только первую картинку (главную)
    const relPath = validPaths[0].replace(/\\/g, "/");
    await compressInPlace(path.join(ROOT, "data", "1c", relPath));
    await prisma.productImage.create({ data: { productId, path: relPath } });
    hasImageSet.add(productId); // чтобы не дублировать если несколько файлов на один GUID
    linked++;
  }

  console.log("\nРезультат прохода 2:");
  console.log("  Привязано новых картинок: " + linked);
  console.log("  Уже имели картинку: " + alreadyHas);
  console.log("  GUID не найден в базе: " + notFound);
}

main().catch(console.error).finally(() => prisma.$disconnect());
