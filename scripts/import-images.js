import { PrismaClient } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

async function main() {
  let saved = 0;
  let skipped = 0;

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
      // Store relative path: "import_files/e5/filename.jpg"
      // resolveImageUrl() will prepend "/1c/" → "/1c/import_files/e5/filename.jpg"
      // The /1c/[...path] route serves from data/1c/ on the server.
      const rel = String(imgPath).replace(/\\/g, "/");
      await prisma.productImage.create({
        data: { productId: product.id, path: rel },
      });
      saved++;
    }
  }

  console.log("Путей сохранено в базу: " + saved + " | Без картинок: " + skipped);
}

main().catch(console.error).finally(() => prisma.$disconnect());
