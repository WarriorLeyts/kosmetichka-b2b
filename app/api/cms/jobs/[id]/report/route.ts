import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";
import { readAnalysis } from "@/lib/cms/photoImport";

// GET /api/cms/jobs/:id/report — отчёт загрузки фото в Excel: по каждому товару итог и ошибки
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await cmsGuard(request, "products.photos");
  if (isGuardError(g)) return g;
  const id = Number((await params).id);
  const job = Number.isInteger(id) ? await prisma.cmsJob.findUnique({ where: { id } }) : null;
  if (!job || job.type !== "photos") return new Response("Не найдено", { status: 404 });
  const { sid } = job.payload as { sid: string };
  const a = readAnalysis(sid);
  const items = (job.result as { items?: Record<string, { s: string; n: number; e?: string }> } | null)?.items ?? {};
  const S: Record<string, string> = { ok: "Загружено", partial: "Загружено частично", skipped: "Пропущено", error: "Ошибка" };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Отчёт");
  ws.columns = [
    { header: "Артикул", key: "a", width: 16 },
    { header: "Товар", key: "n", width: 60 },
    { header: "Результат", key: "s", width: 20 },
    { header: "Добавлено фото", key: "c", width: 15 },
    { header: "Файлы", key: "f", width: 50 },
    { header: "Ошибка", key: "e", width: 50 },
  ];
  for (const p of a?.plan ?? []) {
    const r = items[p.productId];
    ws.addRow({ a: p.article, n: p.name, s: r ? S[r.s] ?? r.s : "Не обработано", c: r?.n ?? 0, f: p.files.map((f) => f.label).join(", "), e: r?.e ?? "" });
  }
  if (a?.unmatched.length) {
    const u = wb.addWorksheet("Без товара");
    u.columns = [{ header: "Файл (артикул не найден)", key: "f", width: 80 }];
    a.unmatched.forEach((f) => u.addRow({ f }));
  }
  if (a?.ambiguous.length) {
    const u = wb.addWorksheet("Неоднозначно");
    u.columns = [{ header: "Файл", key: "f", width: 60 }, { header: "Подходит к артикулам", key: "a", width: 40 }];
    a.ambiguous.forEach((x) => u.addRow({ f: x.file, a: x.articles.join(", ") }));
  }
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="photos-report-${job.id}.xlsx"`,
    },
  });
}
