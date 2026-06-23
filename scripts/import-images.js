import { PrismaClient } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import * as ftp from "basic-ftp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const prisma = new PrismaClient();

const FTP_HOST = process.env.FTP_HOST ?? "server74.hosting.reg.ru";
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;
const FTP_DIR  = process.env.FTP_IMAGES_DIR ?? "/www/kosmetichka-opt.ru/image/catalog";
const BASE_URL = process.env.IMAGES_PUBLIC_URL ?? "https://kosmetichka-opt.ru/image/catalog";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
const xml = fs.readFileSync(path.join(ROOT, "data", "1c", "import.xml"), "utf8");
const data = parser.parse(xml);
const raw = data["КоммерческаяИнформация"]?.["Каталог"]?.["Товары"]?.["Товар"] ?? [];
const products = Array.isArray(raw) ? raw : [raw];

async function main() {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  await client.access({ host: FTP_HOST, user: FTP_USER, password: FTP_PASS, secure: false });
  await client.ensureDir(FTP_DIR);

  const existing = new Set();
  try {
    const list = await client.list(FTP_DIR);
    for (const f of list) existing.add(f.name);
  } catch {}

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

  console.log("На сервере: " + existing.size + " | Нужно загрузить: " + toUpload.length);

  let uploaded = 0;
  for (const { fileName, localPath } of toUpload) {
    await client.uploadFrom(localPath, FTP_DIR + "/" + fileName);
    existing.add(fileName);
    uploaded++;
    process.stdout.write("\r Загружено: " + uploaded + "/" + toUpload.length + " — " + fileName.slice(0, 36) + "...");
  }

  if (toUpload.length > 0) console.log("");
  console.log("Загрузка завершена. Сохраняю URL в базу...");

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
      await prisma.productImage.create({ data: { productId: product.id, path: BASE_URL + "/" + fileName } });
      saved++;
    }
  }

  try { client.close(); } catch {}
  console.log("URL сохранено в базу: " + saved);
}

main().catch(console.error).finally(() => prisma.$disconnect());
