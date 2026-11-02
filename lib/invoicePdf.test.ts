import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import type { InvoiceData } from "./invoice";
import { deliveryLine } from "./invoice";

// pdfkit may be missing on a machine without the npm registry; CI always has it
const pdf = await import("./invoicePdf").catch(() => null);

const base: InvoiceData = {
  id: 180,
  issueDate: "02 ноября 2026 г.",
  statusLabel: "Заказ оформлен",
  supplier: { name: "ООО «Косметичка»", lines: ["kosmetichka-opt.ru"] },
  buyer: { name: "Зейнди", lines: ["89899314288", "client@example.com", "Нью Йорк", "Грозный"], manager: "Отдел Продаж" },
  delivery: deliveryLine("pickup", null),
  items: [
    { name: 'Краб для волос "Кимберли" прямой, 8x4 см, микс 10960032', variant: null, code: "6900109600320", quantity: 1, price: 86, total: 86 },
    { name: "Tea-Trica Противовоспалительный тонер с чайным деревом 210мл, SKIN1004", variant: null, code: "8809576261660", quantity: 6, price: 1175, total: 7050 },
  ],
  totals: [{ label: "ИТОГО:", value: "7 136 ₽", strong: true }],
  comment: null,
};

describe("invoice: how the order is received", () => {
  it("pickup → the shop's address; delivery → the customer's address or «уточняется»", () => {
    expect(deliveryLine("pickup", "ул. Ленина 1")).toEqual({ title: "Самовывоз", text: "Грозный, ул. Назарбаева, 94, корп. 4" });
    expect(deliveryLine("delivery", " Грозный, ул. Мира 5 ")).toEqual({ title: "Доставка", text: "Грозный, ул. Мира 5" });
    expect(deliveryLine("delivery", null)).toEqual({ title: "Доставка", text: "адрес уточняется" });
    expect(deliveryLine(null, null)).toBeNull();
  });
});

describe.skipIf(!pdf)("invoice PDF", () => {
  const out = process.env.INVOICE_PDF_OUT;
  const save = (name: string, b: Buffer) => {
    if (!out) return;
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, name), b);
  };

  it("a short order: one A4 page with Cyrillic text", async () => {
    const b = await pdf!.invoicePdf(base);
    expect(b.subarray(0, 5).toString()).toBe("%PDF-");
    expect(b.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBe(1);
    save("invoice-pickup.pdf", b);
  });

  it("a long order with delivery, discount, bonuses and a comment continues on the next pages", async () => {
    const items = Array.from({ length: 45 }, (_, i) => ({
      name: `Товар номер ${i + 1} с очень длинным названием, которое не помещается в одну строку таблицы счёта`,
      variant: i % 5 === 0 ? "Оттенок 02" : null,
      code: i % 2 ? `46000000${i}` : null,
      quantity: i + 1,
      price: 1000 + i,
      total: (1000 + i) * (i + 1),
    }));
    const b = await pdf!.invoicePdf({
      ...base,
      id: 181,
      delivery: deliveryLine("delivery", "Грозный, проспект Путина, 1, офис 12"),
      items,
      totals: [
        { label: "Сумма без скидки:", value: "1 100 000 ₽" },
        { label: "Промокод SALE10:", value: "−10 000 ₽" },
        { label: "ИТОГО:", value: "1 090 000 ₽", strong: true },
      ],
      comment: "Позвонить за час до доставки",
    });
    expect(b.toString("latin1").match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
    save("invoice-delivery-long.pdf", b);
  });
});
