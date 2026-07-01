import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

// Auth: any login + SYNC_API_KEY as password (set in .env)
const COOKIE_NAME = "1C_SESS";
const SESSION_TOKEN = "kosmetichka_1c_active";
const DATA_DIR = path.join(process.cwd(), "data", "1c");

function txt(body: string) {
  return new NextResponse(body + "\n", {
    headers: { "Content-Type": "text/plain; charset=windows-1251" },
  });
}

function checkAuth(request: NextRequest): boolean {
  // Cookie-based (after checkauth)
  const cookie = request.cookies.get(COOKIE_NAME);
  if (cookie?.value === SESSION_TOKEN) return true;

  // Basic auth (used for checkauth step)
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const colonIdx = decoded.indexOf(":");
    const password = decoded.slice(colonIdx + 1);
    return password === process.env.SYNC_API_KEY;
  }
  return false;
}

function runSync(): Promise<void> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), "scripts", "sync-all.js");
    exec(`node ${scriptPath}`, { cwd: process.cwd() }, (err, stdout, stderr) => {
      if (err) console.error("[exchange] sync error:", err.message, stderr);
      else console.log("[exchange] sync done:", stdout);
      resolve();
    });
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "";
  const mode = searchParams.get("mode") ?? "";

  // ── checkauth ────────────────────────────────────────────────────────────
  if (mode === "checkauth") {
    if (!checkAuth(request)) {
      return txt("failure\nНеверный логин или пароль");
    }
    const response = txt(`success\n${COOKIE_NAME}\n${SESSION_TOKEN}`);
    response.cookies.set(COOKIE_NAME, SESSION_TOKEN, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24, // 24h
    });
    return response;
  }

  if (!checkAuth(request)) return txt("failure\nНе авторизован");

  // ── init ─────────────────────────────────────────────────────────────────
  if (mode === "init") {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    return txt("zip=no\nfile_limit=104857600"); // 100 MB limit
  }

  // ── import (trigger sync after all files uploaded) ────────────────────
  if (mode === "import") {
    const filename = searchParams.get("filename") ?? "";
    console.log(`[exchange] import triggered for ${filename}`);

    // Run sync when any main XML file is imported
    const isMainXml = ["import.xml", "offers.xml", "customers.xml"].some(
      (f) => filename === f || filename.endsWith(f)
    );
    if (isMainXml) {
      // Run in background, return success immediately
      runSync().catch(console.error);
    }
    return txt("success");
  }

  // ── sale: query (download orders) ────────────────────────────────────
  if (type === "sale" && mode === "query") {
    // Reuse orders route logic inline
    const { prisma } = await import("@/lib/prisma");

    const PRICE_TYPE_LABELS: Record<string, string> = {
      wholesale: "Опт",
      big_wholesale: "Крупный опт",
      retail: "Розница",
      discount: "Скидка",
    };
    const priceTypeLabel = (t: string | null) =>
      PRICE_TYPE_LABELS[t ?? ""] ?? t ?? "Опт";

    function escapeXml(s: string) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const orders = await prisma.order.findMany({
      where: { status: "approved", oneCExportedAt: null },
      include: { customer: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const allProductIds = orders.flatMap((o) => o.items.map((i) => i.productId));
    const products = await prisma.product.findMany({
      where: { id: { in: allProductIds } },
      select: { id: true, guid: true },
    });
    const guidMap = new Map(products.map((p) => [p.id, p.guid]));

    const date = new Date().toISOString().slice(0, 10);
    const docs = orders
      .map((order) => {
        const c = order.customer;
        const time = order.createdAt.toLocaleTimeString("ru-RU", {
          timeZone: "Europe/Moscow",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
        const name = escapeXml(c.companyName || c.name || "");
        const itemsXml = order.items
          .map(
            (item) => `    <Товар>
      <Ид>${escapeXml(guidMap.get(item.productId) || String(item.productId))}</Ид>
      <Артикул>${escapeXml(item.barcode || "")}</Артикул>
      <Наименование>${escapeXml(item.productName)}</Наименование>
      <БазоваяЕдиница Код="796" НаименованиеПолное="Штука">шт</БазоваяЕдиница>
      <ЦенаЗаЕдиницу>${item.price}</ЦенаЗаЕдиницу>
      <Количество>${item.quantity}</Количество>
      <Сумма>${item.total}</Сумма>
    </Товар>`
          )
          .join("\n");

        return `  <Документ>
    <Ид>${order.id}</Ид>
    <Номер>${order.id}</Номер>
    <Дата>${order.createdAt.toISOString().slice(0, 10)}</Дата>
    <Время>${time}</Время>
    <ХозОперация>Заказ товара</ХозОперация>
    <Роль>Продавец</Роль>
    <Валюта>руб</Валюта>
    <Курс>1</Курс>
    <Сумма>${order.total}</Сумма>
    <Комментарий>${escapeXml(order.comment || "")}</Комментарий>
    <Контрагенты>
      <Контрагент>
        <Ид>${escapeXml(c.oneCId || `customer-${c.id}`)}</Ид>
        <Наименование>${name}</Наименование>
        <ПолноеНаименование>${name}</ПолноеНаименование>
        ${c.phone ? `<Телефон>${escapeXml(c.phone)}</Телефон>` : ""}
        <Роль>Покупатель</Роль>
      </Контрагент>
    </Контрагенты>
    <Товары>
${itemsXml}
    </Товары>
    <ЗначенияРеквизитов>
      <ЗначениеРеквизита>
        <Наименование>Статус заказа</Наименование>
        <Значение>Новый</Значение>
      </ЗначениеРеквизита>
      <ЗначениеРеквизита>
        <Наименование>ВидЦен</Наименование>
        <Значение>${priceTypeLabel(c.priceType)}</Значение>
      </ЗначениеРеквизита>
    </ЗначенияРеквизитов>
  </Документ>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация ВерсияСхемы="2.05" ДатаФормирования="${date}">
${docs}
</КоммерческаяИнформация>`;

    return new NextResponse(xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }

  return txt("success");
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "";
  const type = searchParams.get("type") ?? "";

  if (!checkAuth(request)) return txt("failure\nНе авторизован");

  // ── file upload ──────────────────────────────────────────────────────────
  if (mode === "file") {
    const filename = searchParams.get("filename") ?? "";
    if (!filename) return txt("failure\nfilename required");

    // Prevent path traversal
    const safeName = filename.replace(/\\/g, "/").replace(/^\/+/, "");
    const dest = path.join(DATA_DIR, safeName);
    if (!dest.startsWith(DATA_DIR)) return txt("failure\nInvalid path");

    fs.mkdirSync(path.dirname(dest), { recursive: true });

    const body = await request.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(body));
    console.log(`[exchange] saved: ${safeName} (${body.byteLength} bytes)`);

    return txt("success");
  }

  // ── sale: success (acknowledge orders) ───────────────────────────────────
  if (type === "sale" && mode === "success") {
    const body = await request.text();
    // Extract order IDs from XML: <Документ><Ид>123</Ид>...
    const ids: number[] = [];
    const regex = /<Ид>(\d+)<\/Ид>/g;
    let match;
    while ((match = regex.exec(body)) !== null) {
      ids.push(parseInt(match[1]));
    }

    if (ids.length > 0) {
      const { prisma } = await import("@/lib/prisma");
      await prisma.order.updateMany({
        where: { id: { in: ids } },
        data: { oneCExportedAt: new Date() },
      });
      console.log(`[exchange] acknowledged orders: ${ids.join(", ")}`);
    }

    return txt("success");
  }

  return txt("success");
}
