import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUS_TRANSITIONS as TRANSITIONS } from "@/lib/orderStatus";

function xml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function buildXml() {
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["approved", "payment"] },
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      customer: true,
      items: true,
    },
  });

  const today = new Date().toISOString().slice(0, 10);

  const documents = orders
    .map((order) => {
      const createdAt = new Date(order.createdAt);
      const orderDate = createdAt.toISOString().slice(0, 10);
      const orderTime = createdAt.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const customerName =
        order.customer.companyName ||
        order.customer.name ||
        order.customer.phone ||
        `Клиент ${order.customer.id}`;

      const customerOneCId =
        order.customer.oneCId || `customer-${order.customer.id}`;

      const customerManager = order.customer.manager || "";
      const customerPriceType = order.customer.priceType || "";

      const itemsXml = order.items
        .map((item) => {
          return `
      <Товар>
        <Ид>${xml(item.productId)}</Ид>
        <Артикул>${xml(item.barcode)}</Артикул>
        <Наименование>${xml(item.productName)}</Наименование>
        <БазоваяЕдиница Код="796" НаименованиеПолное="Штука">шт</БазоваяЕдиница>
        <ЦенаЗаЕдиницу>${item.price}</ЦенаЗаЕдиницу>
        <Количество>${item.quantity}</Количество>
        <Сумма>${item.total}</Сумма>
      </Товар>`;
        })
        .join("");

      return `
  <Документ>
    <Ид>${order.id}</Ид>
    <Номер>${order.id}</Номер>
    <Дата>${orderDate}</Дата>
    <Время>${orderTime}</Время>
    <ХозОперация>Заказ товара</ХозОперация>
    <Роль>Продавец</Роль>
    <Валюта>руб</Валюта>
    <Курс>1</Курс>
    <Сумма>${order.total}</Сумма>

    <Контрагенты>
      <Контрагент>
        <Ид>${xml(customerOneCId)}</Ид>
        <Наименование>${xml(customerName)}</Наименование>
        <ПолноеНаименование>${xml(customerName)}</ПолноеНаименование>
        <Телефон>${xml(order.customer.phone)}</Телефон>
        <Роль>Покупатель</Роль>
      </Контрагент>
    </Контрагенты>

    <Товары>${itemsXml}
    </Товары>

    <ЗначенияРеквизитов>
      <ЗначениеРеквизита>
        <Наименование>Статус заказа</Наименование>
        <Значение>Новый</Значение>
      </ЗначениеРеквизита>

      <ЗначениеРеквизита>
        <Наименование>Комментарий</Наименование>
        <Значение>${xml(order.comment)}</Значение>
      </ЗначениеРеквизита>

      <ЗначениеРеквизита>
        <Наименование>Ответственный</Наименование>
        <Значение>${xml(customerManager)}</Значение>
      </ЗначениеРеквизита>

      <ЗначениеРеквизита>
        <Наименование>ВидЦен</Наименование>
        <Значение>${xml(customerPriceType)}</Значение>
      </ЗначениеРеквизита>
    </ЗначенияРеквизитов>
  </Документ>`;
    })
    .join("");

  return {
    xmlFile: `<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация ВерсияСхемы="2.05" ДатаФормирования="${today}">
${documents}
</КоммерческаяИнформация>`,
    orderIds: orders.map((o) => o.id),
  };
}

/** GET — preview XML only, does NOT change any statuses */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { xmlFile } = await buildXml();

  return new NextResponse(xmlFile, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="Orders.xml"',
    },
  });
}

/** POST — generate XML, mark orders as "exported", return the file */
export async function POST() {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { xmlFile, orderIds } = await buildXml();

  if (orderIds.length > 0) {
    // Build per-order fromStatus map so the audit log reflects the actual
    // pre-export status (either "approved" or "payment"), not a hardcoded value.
    const preExportOrders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, status: true },
    });
    const statusByOrderId = new Map(preExportOrders.map((o) => [o.id, o.status]));

    await prisma.$transaction([
      prisma.order.updateMany({
        where: { id: { in: orderIds } },
        data: { status: "exported", oneCExportedAt: new Date() },
      }),
      ...orderIds.map((orderId) =>
        prisma.orderStatusLog.create({
          data: {
            orderId,
            fromStatus: statusByOrderId.get(orderId) ?? "approved",
            toStatus: "exported",
            userId: user.id as number,
          },
        })
      ),
    ]);
  }

  return new NextResponse(xmlFile, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="Orders.xml"',
    },
  });
}
