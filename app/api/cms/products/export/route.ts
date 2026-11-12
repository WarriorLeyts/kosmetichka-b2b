import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { logAction } from "@/lib/cms/audit";
import { productWhere } from "@/lib/cms/productFilter";
import { productPath } from "@/lib/productSlug";

export const maxDuration = 300;

// GET /api/cms/products/export?ids=1,2 | ?<фильтры таблицы> — товары в Excel (до 20 000)
export async function GET(request: Request) {
  const g = await cmsGuard(request, "products.edit");
  if (isGuardError(g)) return g;
  const sp = new URL(request.url).searchParams;
  const where = await productWhere(sp);
  const rows = await prisma.product.findMany({
    where,
    take: 20000,
    orderBy: { id: "asc" },
    include: { brand: { select: { name: true } }, category: { select: { name: true } }, prices: { select: { priceType: true, price: true } }, _count: { select: { images: true } } },
  });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Товары");
  ws.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "GUID 1С", key: "guid", width: 38 },
    { header: "Артикул", key: "article", width: 15 },
    { header: "Штрихкод", key: "barcode", width: 16 },
    { header: "Наименование", key: "name", width: 60 },
    { header: "Бренд", key: "brand", width: 20 },
    { header: "Категория", key: "category", width: 30 },
    { header: "Розница", key: "retail", width: 10 },
    { header: "Скидка", key: "discount", width: 10 },
    { header: "Опт", key: "wholesale", width: 10 },
    { header: "Крупный опт", key: "big", width: 12 },
    { header: "Остаток", key: "stock", width: 9 },
    { header: "На сайте", key: "visible", width: 9 },
    { header: "Метки", key: "labels", width: 14 },
    { header: "Фото", key: "photos", width: 6 },
    { header: "Краткое описание", key: "short", width: 40 },
    { header: "Описание", key: "description", width: 60 },
    { header: "SEO Title", key: "seoTitle", width: 50 },
    { header: "Meta Description", key: "seoDescription", width: 60 },
    { header: "Адрес", key: "url", width: 50 },
  ];
  for (const p of rows) {
    const price = (t: string) => p.prices.find((x) => x.priceType === t)?.price ?? null;
    ws.addRow({
      id: p.id,
      guid: p.guid,
      article: p.article,
      barcode: p.barcode,
      name: p.name,
      brand: p.brand?.name ?? "",
      category: p.category?.name ?? "",
      retail: price("retail"),
      discount: price("discount"),
      wholesale: price("wholesale"),
      big: price("big_wholesale"),
      stock: p.stock ?? 0,
      visible: p.hidden ? "нет" : "да",
      labels: p.labels.map((l) => ({ new: "Новинка", hit: "Хит" })[l] ?? l).join(", "),
      photos: p._count.images,
      short: p.shortDescription ?? "",
      description: p.description ?? "",
      seoTitle: p.seoTitle ?? "",
      seoDescription: p.seoDescription ?? "",
      url: "https://kosmetichka-opt.ru" + productPath(p),
    });
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "T1" };
  const buf = await wb.xlsx.writeBuffer();
  await logAction(g.user, g.ip, { action: "products.export", entity: "product", summary: `Выгрузка товаров в Excel: ${rows.length}` });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="products-${date}.xlsx"`,
    },
  });
}
