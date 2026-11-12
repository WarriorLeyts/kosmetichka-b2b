import ExcelJS from "exceljs";
import { cmsGuard, isGuardError } from "@/lib/cms/auth";

// GET /api/cms/photos/template — образец Excel для загрузки фото по таблице «артикул → файлы»
export async function GET(request: Request) {
  const g = await cmsGuard(request, "products.photos");
  if (isGuardError(g)) return g;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Фото");
  ws.columns = [
    { header: "Артикул", key: "a", width: 18 },
    { header: "Файлы (через запятую, первый — главное фото)", key: "f", width: 60 },
    { header: "Название (для себя, необязательно)", key: "n", width: 40 },
  ];
  ws.addRow({ a: "ГБ-00000370", f: "IMG_1201.jpg, IMG_1202.jpg", n: "Пример: два фото к одному товару" });
  ws.addRow({ a: "НФ-00000907", f: "photo-907.png", n: "" });
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="photos-template.xlsx"' },
  });
}
