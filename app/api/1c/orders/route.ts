import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function checkApiKey(request: NextRequest) {
  const key = request.headers.get("x-1c-key");
  return key === process.env.SYNC_API_KEY;
}

function escapeXml(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(request: NextRequest) {
  if (!checkApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["pending", "approved"] },
      oneCExportedAt: null,
    },
    include: {
      customer: true,
      items: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const date = new Date().toISOString().slice(0, 10);
  const orderIds = orders.map((o) => o.id).join(",");

  const docs = orders
    .map((order) => {
      const customer = order.customer;
      const time = order.createdAt.toTimeString().slice(0, 8);
      const phone = customer.phone || "";
      const name = escapeXml(customer.companyName || customer.name || "");

      const itemsXml = order.items
        .map(
          (item) => `    <Товар>
      <Ид>${item.productId}</Ид>
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
    <Контрагенты>
      <Контрагент>
        <Ид>${escapeXml(customer.oneCId || `customer-${customer.id}`)}</Ид>
        <Наименование>${name}</Наименование>
        <ПолноеНаименование>${name}</ПолноеНаименование>
        ${phone ? `<Телефон>${escapeXml(phone)}</Телефон>` : ""}
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
        <Наименование>Комментарий</Наименование>
        <Значение>${escapeXml(order.comment || "")}</Значение>
      </ЗначениеРеквизита>
      <ЗначениеРеквизита>
        <Наименование>Ответственный</Наименование>
        <Значение></Значение>
      </ЗначениеРеквизита>
      <ЗначениеРеквизита>
        <Наименование>ВидЦен</Наименование>
        <Значение>${escapeXml(customer.priceType || "wholesale")}</Значение>
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
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "X-Order-Ids": orderIds,
    },
  });
}
