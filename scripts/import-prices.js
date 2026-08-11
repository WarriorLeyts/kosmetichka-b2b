import { PrismaClient } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import nodemailer from "nodemailer";
import fs from "fs";

const prisma = new PrismaClient();

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizePriceType(name) {
  const value = String(name || "").toLowerCase();

  if (value.includes("круп")) return "big_wholesale";
  if (value.includes("опт")) return "wholesale";
  if (value.includes("скид")) return "discount";
  if (value.includes("роз")) return "retail";

  return value;
}

async function sendWishlistNotifications(productIds) {
  if (!productIds.length) return;

  const items = await prisma.wishlistItem.findMany({
    where: { productId: { in: productIds }, notified: false },
    include: {
      customer: { select: { id: true, email: true, name: true } },
      product:  { select: { id: true, name: true } },
    },
  });

  if (!items.length) return;

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.yandex.ru",
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: Number(process.env.EMAIL_PORT) !== 587,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER || "noreply@kosmetichka-opt.ru";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://kosmetichka-opt.ru";

  const notifiedIds = [];

  for (const item of items) {
    if (!item.customer.email) continue;

    const productUrl = `${siteUrl}/product/${item.product.id}`;
    const customerName = item.customer.name || "Покупатель";

    try {
      await transporter.sendMail({
        from,
        to: item.customer.email,
        subject: `Товар «${item.product.name}» снова в наличии`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
            <h2 style="color:#6d28d9">🔔 Товар появился в наличии!</h2>
            <p>Здравствуйте, ${customerName}!</p>
            <p>Вы подписались на уведомление о появлении товара, который снова доступен:</p>
            <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:16px 0">
              <b style="font-size:15px">${item.product.name}</b>
            </div>
            <a href="${productUrl}"
               style="display:inline-block;background:linear-gradient(to right,#ec4899,#a855f7,#3b82f6);color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:900;font-size:14px">
              Перейти к товару →
            </a>
            <p style="margin-top:24px;color:#94a3b8;font-size:12px">
              Kosmetichka B2B · ${siteUrl}
            </p>
          </div>
        `,
      });
      notifiedIds.push(item.id);
      console.log(`Уведомление отправлено: ${item.customer.email} — ${item.product.name}`);
    } catch (err) {
      console.error(`Ошибка отправки на ${item.customer.email}:`, err.message);
    }
  }

  if (notifiedIds.length) {
    await prisma.wishlistItem.updateMany({
      where: { id: { in: notifiedIds } },
      data: { notified: true },
    });
    console.log(`Помечено уведомлённых: ${notifiedIds.length}`);
  }
}

async function main() {
  const xml = fs.readFileSync("./data/1c/offers.xml", "utf8");
  const data = parser.parse(xml);

  const packageData = data.КоммерческаяИнформация.ПакетПредложений;

  const priceTypes = toArray(packageData.ТипыЦен?.ТипЦены);
  const offers = toArray(packageData.Предложения?.Предложение);

  const priceTypeMap = new Map();

  for (const type of priceTypes) {
    priceTypeMap.set(type.Ид, normalizePriceType(type.Наименование));
  }

  console.log("Предложений найдено:", offers.length);

  // Загружаем текущие остатки товаров, у которых есть подписчики в листе ожидания
  const watchedProductIds = await prisma.wishlistItem.findMany({
    where: { notified: false },
    select: { productId: true },
    distinct: ["productId"],
  });
  const watchedIds = new Set(watchedProductIds.map((w) => w.productId));

  const prevStocks = new Map();
  if (watchedIds.size > 0) {
    const products = await prisma.product.findMany({
      where: { id: { in: [...watchedIds] } },
      select: { id: true, stock: true },
    });
    for (const p of products) {
      prevStocks.set(p.id, p.stock ?? 0);
    }
  }

  // Обрабатываем предложения
  const cameIntoStock = [];

  for (const offer of offers) {
    const productGuid = offer.Ид;

    const product = await prisma.product.findUnique({
      where: { guid: productGuid },
    });

    if (!product) continue;

    const prices = toArray(offer.Цены?.Цена);

    for (const item of prices) {
      const priceType = priceTypeMap.get(item.ИдТипаЦены);
      if (!priceType) continue;

      await prisma.productPrice.upsert({
        where: {
          productGuid_priceType: {
            productGuid,
            priceType,
          },
        },
        update: {
          price: Number(item.ЦенаЗаЕдиницу || 0),
        },
        create: {
          productGuid,
          priceType,
          price: Number(item.ЦенаЗаЕдиницу || 0),
        },
      });
    }

    const newStock = Number(offer.Количество || 0);

    await prisma.product.update({
      where: { guid: productGuid },
      data: { stock: newStock },
    });

    // Проверяем появился ли товар в наличии
    if (watchedIds.has(product.id)) {
      const prevStock = prevStocks.get(product.id) ?? 0;
      if (prevStock <= 0 && newStock > 0) {
        cameIntoStock.push(product.id);
      }
    }
  }

  console.log("Импорт цен и остатков завершен");

  // Отправляем уведомления
  if (cameIntoStock.length > 0) {
    console.log(`Товаров появилось в наличии: ${cameIntoStock.length}, отправляем уведомления...`);
    await sendWishlistNotifications(cameIntoStock);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
