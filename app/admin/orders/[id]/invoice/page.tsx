import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      items: true,
    },
  });

  if (!order) notFound();

  const date = new Date(order.createdAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const customerName = order.customer.companyName || order.customer.name || "—";
  const inn = order.customer.inn || "";
  const phone = order.customer.phone || "";

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #000; background: #fff; }
        .page { max-width: 800px; margin: 0 auto; padding: 30px 40px; }
        h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
        .subtitle { font-size: 13px; color: #444; margin-bottom: 24px; }
        .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
        .section-label { font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; margin-bottom: 4px; }
        .section-value { font-size: 13px; font-weight: 600; }
        .section-sub { font-size: 12px; color: #555; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        thead tr { background: #f5f5f5; }
        th { padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; border-bottom: 2px solid #ddd; }
        td { padding: 8px 10px; font-size: 12px; border-bottom: 1px solid #eee; vertical-align: top; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        tfoot td { font-weight: bold; border-top: 2px solid #ddd; border-bottom: none; }
        .total-row td { font-size: 14px; }
        .footer { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .sign-line { border-top: 1px solid #000; margin-top: 40px; padding-top: 4px; font-size: 11px; color: #555; }
        .no-print { display: block; }
        @media print {
          .no-print { display: none !important; }
          body { padding: 0; }
          .page { padding: 20px; }
        }
        .print-btn {
          display: inline-block;
          margin-bottom: 20px;
          padding: 10px 24px;
          background: #1e40af;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .print-btn:hover { background: #1d3faa; }
      `}</style>

      <div className="page">
        {/* Print button */}
        <div className="no-print" style={{ marginBottom: 20 }}>
          <button className="print-btn" onClick={() => window.print()}>
            🖨️ Печать / Сохранить PDF
          </button>
          <span style={{ marginLeft: 16, fontSize: 13, color: "#666" }}>
            В браузере выберите «Сохранить как PDF» вместо принтера
          </span>
        </div>

        {/* Header */}
        <h1>Счёт на оплату №{order.id}</h1>
        <div className="subtitle">от {date}</div>

        {/* Parties */}
        <div className="header-grid">
          <div>
            <div className="section-label">Поставщик</div>
            <div className="section-value">ИП Косметичка</div>
            <div className="section-sub">kosmetichka-opt.ru</div>
          </div>
          <div>
            <div className="section-label">Покупатель</div>
            <div className="section-value">{customerName}</div>
            {inn && <div className="section-sub">ИНН: {inn}</div>}
            {phone && <div className="section-sub">Тел: {phone}</div>}
          </div>
        </div>

        {/* Items table */}
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}>№</th>
              <th>Наименование товара</th>
              <th className="text-center" style={{ width: 60 }}>Кол-во</th>
              <th className="text-right" style={{ width: 80 }}>Цена, ₽</th>
              <th className="text-right" style={{ width: 90 }}>Сумма, ₽</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, idx) => (
              <tr key={item.id}>
                <td>{idx + 1}</td>
                <td>
                  {item.productName}
                  {item.barcode && (
                    <div style={{ fontSize: 10, color: "#888" }}>
                      Арт: {item.barcode}
                    </div>
                  )}
                </td>
                <td className="text-center">{item.quantity} шт.</td>
                <td className="text-right">{item.price.toLocaleString("ru-RU")}</td>
                <td className="text-right">{item.total.toLocaleString("ru-RU")}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td colSpan={4} className="text-right">Итого к оплате:</td>
              <td className="text-right">{order.total.toLocaleString("ru-RU")} ₽</td>
            </tr>
          </tfoot>
        </table>

        {/* Comment */}
        {order.comment && (
          <div style={{ marginBottom: 20, fontSize: 12, color: "#555" }}>
            <strong>Комментарий:</strong> {order.comment}
          </div>
        )}

        {/* NDS note */}
        <div style={{ fontSize: 11, color: "#888", marginBottom: 24 }}>
          НДС не облагается. Оплата в течение 3 рабочих дней.
        </div>

        {/* Signatures */}
        <div className="footer">
          <div>
            <div style={{ marginBottom: 8, fontSize: 12 }}>Поставщик:</div>
            <div className="sign-line">Подпись / дата</div>
          </div>
          <div>
            <div style={{ marginBottom: 8, fontSize: 12 }}>Покупатель:</div>
            <div className="sign-line">Подпись / дата</div>
          </div>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.querySelector('.print-btn')?.addEventListener('click', function() {
              window.print();
            });
          `,
        }}
      />
    </>
  );
}
