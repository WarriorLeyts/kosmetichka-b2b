import path from "path";
import PDFDocument from "pdfkit";
import type { InvoiceData } from "@/lib/invoice";

/**
 * The invoice as an A4 PDF (same content as the invoice page). Inter is embedded for Cyrillic; the
 * files live in assets/fonts and are traced into the standalone build (next.config.ts).
 */
const FONTS = path.join(process.cwd(), "assets", "fonts");
const F = { r: path.join(FONTS, "Inter-Regular.otf"), s: path.join(FONTS, "Inter-SemiBold.otf"), b: path.join(FONTS, "Inter-Bold.otf") };

const INK = "#0f172a";
const TEXT = "#334155";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const LINE = "#e2e8f0";
const VIOLET = "#6d28d9";

const num = (n: number) => n.toLocaleString("ru-RU").replace(/ /g, " ");

export function invoicePdf(inv: InvoiceData): Promise<Buffer> {
  // font: our Inter from the start — pdfkit then never loads its built-in Helvetica files
  const doc = new PDFDocument({ size: "A4", margin: 48, font: F.r, info: { Title: `Счёт №${inv.id}`, Author: inv.supplier.name } });
  doc.registerFont("r", F.r);
  doc.registerFont("s", F.s);
  doc.registerFont("b", F.b);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  // ── header ──
  const top = doc.y;
  doc.font("b").fontSize(26).fillColor(INK).text("СЧЁТ", L, top);
  doc.font("s").fontSize(13).fillColor(MUTED).text(`№${inv.id} от ${inv.issueDate}`, L, doc.y + 2);
  const afterTitle = doc.y;
  doc.font("s").fontSize(9.5).fillColor(TEXT).text("Статус заказа", L, top + 4, { width: W, align: "right" });
  doc.font("r").fontSize(10).fillColor(MUTED).text(inv.statusLabel, L, doc.y + 1, { width: W, align: "right" });
  doc.y = Math.max(afterTitle, doc.y) + 14;
  rule();

  // ── supplier / buyer ──
  const colW = (W - 24) / 2;
  const partiesTop = doc.y + 14;
  const leftEnd = party(L, partiesTop, colW, "ПОСТАВЩИК", inv.supplier.name, inv.supplier.lines, null);
  const rightEnd = party(L + colW + 24, partiesTop, colW, "ПОКУПАТЕЛЬ", inv.buyer.name, inv.buyer.lines, inv.buyer.manager);
  doc.y = Math.max(leftEnd, rightEnd) + 12;

  // ── how the order is received ──
  if (inv.delivery) {
    const y = doc.y;
    const text = inv.delivery.text ? `${inv.delivery.title}: ${inv.delivery.text}` : inv.delivery.title;
    doc.font("s").fontSize(8).fillColor(FAINT).text("СПОСОБ ПОЛУЧЕНИЯ", L + 12, y + 9, { characterSpacing: 0.6 });
    doc.font("s").fontSize(10.5).fillColor(INK).text(text, L + 12, doc.y + 2, { width: W - 24 });
    const h = doc.y - y + 9;
    doc.save().roundedRect(L, y, W, h, 8).lineWidth(0.8).strokeColor(LINE).stroke().restore();
    doc.y = y + h + 16;
  } else doc.y += 6;

  // ── items ──
  const cols = { n: 22, qty: 46, price: 70, sum: 78 };
  const nameW = W - cols.n - cols.qty - cols.price - cols.sum - 12;
  const x = { n: L, name: L + cols.n, qty: L + cols.n + nameW + 12, price: L + cols.n + nameW + 12 + cols.qty, sum: L + W - cols.sum };
  const head = () => {
    const y = doc.y;
    doc.font("s").fontSize(9).fillColor(MUTED);
    doc.text("№", x.n, y);
    doc.text("Наименование", x.name, y);
    doc.text("Кол-во", x.qty, y, { width: cols.qty, align: "center" });
    doc.text("Цена, ₽", x.price, y, { width: cols.price, align: "right" });
    doc.text("Сумма, ₽", x.sum, y, { width: cols.sum, align: "right" });
    doc.y = y + 16;
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(1.2).strokeColor(LINE).stroke();
    doc.y += 8;
  };
  head();
  inv.items.forEach((it, i) => {
    doc.font("s").fontSize(10);
    const name = it.variant ? `${it.name} — ${it.variant}` : it.name;
    const nameH = doc.heightOfString(name, { width: nameW });
    const codeH = it.code ? 12 : 0;
    const rowH = Math.max(nameH + codeH, 14);
    if (doc.y + rowH + 10 > bottom()) {
      doc.addPage();
      head();
    }
    const y = doc.y;
    doc.font("r").fontSize(10).fillColor(FAINT).text(String(i + 1), x.n, y);
    doc.font("s").fontSize(10).fillColor(INK).text(name, x.name, y, { width: nameW });
    if (it.code) doc.font("r").fontSize(8).fillColor(FAINT).text(it.code, x.name, doc.y + 1, { width: nameW });
    const mid = y + (rowH - 12) / 2;
    doc.font("r").fontSize(10).fillColor(TEXT).text(String(it.quantity), x.qty, mid, { width: cols.qty, align: "center" });
    doc.text(num(it.price), x.price, mid, { width: cols.price, align: "right" });
    doc.font("b").fillColor(INK).text(num(it.total), x.sum, mid, { width: cols.sum, align: "right" });
    doc.y = y + rowH + 8;
    doc.moveTo(L, doc.y - 4).lineTo(L + W, doc.y - 4).lineWidth(0.6).strokeColor("#f1f5f9").stroke();
  });

  // ── totals ──
  const tW = 230;
  const tx = L + W - tW;
  if (doc.y + 30 + inv.totals.length * 20 > bottom()) doc.addPage();
  doc.y += 10;
  for (const t of inv.totals) {
    const y = doc.y;
    if (t.strong) {
      doc.moveTo(tx, y).lineTo(L + W, y).lineWidth(1.6).strokeColor(INK).stroke();
      doc.font("b").fontSize(14).fillColor(INK);
      doc.text(t.label, tx, y + 8);
      doc.text(t.value, tx, y + 8, { width: tW, align: "right" });
      doc.y = y + 32;
    } else {
      doc.font("r").fontSize(10).fillColor(MUTED);
      doc.text(t.label, tx, y);
      doc.text(t.value, tx, y, { width: tW, align: "right" });
      doc.y = y + 18;
    }
  }

  // ── comment ──
  if (inv.comment) {
    doc.y += 8;
    if (doc.y + 50 > bottom()) doc.addPage();
    const y = doc.y;
    doc.font("s").fontSize(9.5).fillColor(TEXT).text("Комментарий к заказу: ", L + 12, y + 9, { width: W - 24, continued: true });
    doc.font("r").text(inv.comment);
    const h = doc.y - y + 9;
    doc.save().roundedRect(L, y, W, h, 8).lineWidth(0.8).strokeColor(LINE).stroke().restore();
    doc.y = y + h;
  }

  // ── footer ──
  doc.y += 24;
  if (doc.y + 30 > bottom()) doc.addPage();
  rule();
  doc.font("r").fontSize(8.5).fillColor(FAINT).text("Счёт сформирован автоматически системой управления заказами kosmetichka-opt.ru", L, doc.y + 10, { width: W, align: "center" });

  doc.end();
  return done;

  function rule() {
    doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.8).strokeColor(LINE).stroke();
  }

  /** a «Поставщик» / «Покупатель» column; returns where it ends */
  function party(px: number, py: number, w: number, label: string, name: string, lines: string[], manager: string | null) {
    doc.font("s").fontSize(8).fillColor(FAINT).text(label, px, py, { width: w, characterSpacing: 0.6 });
    doc.font("b").fontSize(12).fillColor(INK).text(name, px, doc.y + 3, { width: w });
    doc.font("r").fontSize(9.5).fillColor(MUTED);
    for (const l of lines) doc.text(l, px, doc.y + 2, { width: w });
    if (manager) doc.font("s").fontSize(9).fillColor(VIOLET).text(`Менеджер: ${manager}`, px, doc.y + 3, { width: w });
    return doc.y;
  }
}
