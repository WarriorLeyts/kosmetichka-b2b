import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/orders/[id]/export
 * Returns the order as an Excel-compatible XML Spreadsheet (.xls).
 * Opens natively in Excel, LibreOffice, and Google Sheets — no npm library required.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload?.id) return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      items: { orderBy: { id: "asc" } },
    },
  });

  if (!order || order.customerId !== Number(payload.id)) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  const esc = (s: string | null | undefined) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const issueDate = new Date(order.createdAt).toLocaleDateString("ru-RU");
  const clientName = order.customer.companyName || order.customer.name || "";

  const rows = order.items
    .map(
      (item, idx) => `
    <Row>
      <Cell><Data ss:Type="Number">${idx + 1}</Data></Cell>
      <Cell><Data ss:Type="String">${esc(item.productName)}${item.variantName ? ` (${esc(item.variantName)})` : ""}</Data></Cell>
      <Cell><Data ss:Type="String">${esc(item.barcode)}</Data></Cell>
      <Cell><Data ss:Type="Number">${item.quantity}</Data></Cell>
      <Cell><Data ss:Type="Number">${item.price}</Data></Cell>
      <Cell><Data ss:Type="Number">${item.total}</Data></Cell>
    </Row>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="H">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#F0F0F0" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="B"><Font ss:Bold="1"/></Style>
  </Styles>
  <Worksheet ss:Name="Заказ №${order.id}">
    <Table>
      <Row>
        <Cell ss:MergeAcross="5" ss:StyleID="B">
          <Data ss:Type="String">Заказ №${order.id} от ${issueDate} — ${esc(clientName)}</Data>
        </Cell>
      </Row>
      <Row/>
      <Row ss:StyleID="H">
        <Cell><Data ss:Type="String">№</Data></Cell>
        <Cell><Data ss:Type="String">Наименование</Data></Cell>
        <Cell><Data ss:Type="String">Штрихкод</Data></Cell>
        <Cell><Data ss:Type="String">Кол-во</Data></Cell>
        <Cell><Data ss:Type="String">Цена, ₽</Data></Cell>
        <Cell><Data ss:Type="String">Сумма, ₽</Data></Cell>
      </Row>
      ${rows}
      <Row/>
      <Row>
        <Cell ss:MergeAcross="4" ss:StyleID="B"><Data ss:Type="String">ИТОГО:</Data></Cell>
        <Cell ss:StyleID="B"><Data ss:Type="Number">${order.total}</Data></Cell>
      </Row>
    </Table>
  </Worksheet>
</Workbook>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="order-${order.id}.xls"`,
    },
  });
}
