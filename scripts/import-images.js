import { PrismaClient } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const prisma = new PrismaClient();

// Папка где nginx раздаёт картинки (/var/www/images)
const DEST_DIR = process.env.IMAGES_DIR ?? "/var/www/images";
const BASE_URL = process.env.IMAGES_PUBLIC_URL ?? "https://kosmetichka-opt.ru/image/catalog";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

async function main() {
  const importPath = path.join(ROOT, "data", "1c", "import.xml");
  if (!fs.existsSync(importPath)) {
    console.log("import.xml не найден, пропускаем импорт картинок");
    return;
  }

  const xml = fs.readFileSync(importPath, "utf8");
  const data = parser.parse(xml);
  const raw = data["КоммерческаяИнформация"]?.["Каталог"]?.["Товары"]?.["Товар"] ?? [];
  const products = Array.isArray(raw) ? raw : [raw];

  // Список уже существующих картинок в /var/www/images/
  fs.mkdirSync(DEST_DIR, { recursive: true });
  const existing = new Set(fs.readdirSync(DEST_DIR));

  // Найти новые картинки которых ещё нет на сервере
  const toUpload = [];
  for (const item of products) {
    const imgs = item["Картинка"]
      ? Array.isArray(item["Картинка"]) ? item["Картинка"] : [item["Картинка"]]
      : [];
    for (const imgPath of imgs) {
      const rel = String(imgPath).replace(/\\/g, "/");
      const fileName = path.basename(rel);
      const localPath = path.join(ROOT, "data", "1c", rel);
      if (!existing.has(fileName) && fs.existsSync(localPath)) {
        toUpload.push({ fileName, localPath });
      }
    }
  }

  console.log("На сервере: " + existing.size + " | Нужно скопировать: " + toUpload.length);

  // Копировать новые файлы локально в /var/www/images/
  let copied = 0;
  for (const { fileName, localPath } of toUpload) {
    fs.copyFileSync(localPath, path.join(DEST_DIR, fileName));
    existing.add(fileName);
    copied++;
    if (copied % 100 === 0) {
      process.stdout.write("\r Скопировано: " + copied + "/" + toUpload.length + "...");
    }
  }
  if (toUpload.length > 0) console.log("\nКопирование завершено.");
  console.log("Сохраняю URL в базу...");

  let saved = 0;
  for (const item of products) {
    const guid = item["Ид"];
    if (!guid) continue;
    const product = await prisma.product.findUnique({ where: { guid: String(guid) } });
    if (!product) continue;

    const imgs = item["Картинка"]
      ? Array.isArray(item["Картинка"]) ? item["Картинка"] : [item["Картинка"]]
      : [];
    if (!imgs.length) continue;

    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    for (const imgPath of imgs) {
      const fileName = path.basename(String(imgPath).replace(/\\/g, "/"));
      if (existing.has(fileName)) {
        await prisma.productImage.create({
          data: { productId: product.id, path: BASE_URL + "/" + fileName },
        });
        saved++;
      }
    }
  }
  console.log("URL сохранено в базу: " + saved);
}

main().catch(console.error).finally(() => prisma.$disconnect());
