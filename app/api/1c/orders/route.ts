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
    where: { status: { in: ["pending", "approved"] } },
    include: {
      customer: true,
      items: {
        include: { order: { include: { customer: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const now = new Date().toISOString().replace("Z", "");

  const docs = orders
    .map((order) => {
      const itemsXml = order.items
        .map((item) => {
          // Find product guid by joining through product
          return `    <Товар>
      <Наименование>${escapeXml(item.productName)}</Наименование>
      ${item.barcode ? `<Штрихкод>${escapeXml(item.barcode)}</Штрихкод>` : ""}
      <БазоваяЕдиница>шт</БазоваяЕдиница>
      <Количество>${item.quantity}</Количество>
      <ЦенаЗаЕдиницу>${item.price}</ЦенаЗаЕдиницу>
      <Сумма>${item.total}</Сумма>
    </Товар>`;
        })
        .join("\n");

      const customer = order.customer;
      const statusMap: Record<string, string> = {
        pending: "Принят",
        approved: "Подтверждён",
        cancelled: "Отменён",
      };

      return `  <Документ>
    <Ид>${order.id}</Ид>
    <Номер>${order.id}</Номер>
    <Дата>${order.createdAt.toISOString().slice(0, 10)}</Дата>
    <ХозяйственнаяОперация>Заказ товара</ХозяйственнаяОперация>
    <Роль>Покупатель</Роль>
    <Валюта>RUB</Валюта>
    <Сумма>${order.total}</Сумма>
    <Контрагенты>
      <Контрагент>
        <Ид>customer-${customer.id}</Ид>
        <Наименование>${escapeXml(customer.companyName || customer.name || "")}</Наименование>
        <Роль>Покупатель</Роль>
        ${customer.inn ? `<ИНН>${escapeXml(customer.inn)}</ИНН>` : ""}
        ${customer.phone ? `<КонтактнаяИнформация>
          <КонтактнаяИнформация Тип="Телефон">
            <Представление>${escapeXml(customer.phone)}</Представление>
          </КонтактнаяИнформация>
        </КонтактнаяИнформация>` : ""}
      </Контрагент>
    </Контрагенты>
    <Товары>
${itemsXml}
    </Товары>
    ${order.comment ? `<Комментарий>${escapeXml(order.comment)}</Комментарий>` : ""}
    <ЗначенияРеквизитов>
      <ЗначениеРеквизита>
        <Наименование>Статус заказа</Наименование>
        <Значение>${statusMap[order.status] ?? order.status}</Значение>
      </ЗначениеРеквизита>
      ${customer.oneCId ? `<ЗначениеРеквизита>
        <Наименование>Ид контрагента</Наименование>
        <Значение>${escapeXml(customer.oneCId)}</Значение>
      </ЗначениеРеквизита>` : ""}
    </ЗначенияРеквизитов>
  </Документ>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация ВерсияСхемы="2.05" ДатаФормирования="${now}">
${docs}
</КоммерческаяИнформация>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
