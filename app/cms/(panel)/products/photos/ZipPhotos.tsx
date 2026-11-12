"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { FileArchive } from "lucide-react";
import { toast } from "sonner";
import { cmsApi } from "@/lib/cms/client";
import { Badge, Btn, Card, PageHeader, useConfirm } from "@/components/cms/ui";

type Plan = { productId: number; name: string; article: string | null; files: string[]; current: number }[];
type Report = { token: string; files: number; plan: Plan; unmatched: string[]; ambiguous: { file: string; articles: string[] }[] };

export function ZipPhotos() {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"" | "read" | "apply">("");
  const [report, setReport] = useState<Report | null>(null);
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [done, setDone] = useState<{ products: number; photos: number; errors: string[] } | null>(null);
  const { confirm, dialog } = useConfirm();

  const read = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) return toast.error("Нужен ZIP-архив");
    setBusy("read");
    setReport(null);
    setDone(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      setReport(await cmsApi<Report>("/api/cms/products/photos-zip", { form: fd }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy("");
      if (ref.current) ref.current.value = "";
    }
  };

  const apply = async () => {
    if (!report) return;
    const photos = report.plan.reduce((s, p) => s + p.files.length, 0);
    const text =
      mode === "replace"
        ? `Заменить фото у ${report.plan.length} товаров на ${photos} новых?\nТекущие фото этих товаров уберутся из карточек.`
        : `Добавить ${photos} фото к ${report.plan.length} товарам?`;
    if (!(await confirm(text, mode === "replace"))) return;
    setBusy("apply");
    try {
      setDone(await cmsApi("/api/cms/products/photos-zip", { body: { token: report.token, mode } }));
      setReport(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="max-w-5xl">
      {dialog}
      <PageHeader
        title="Фото товаров из ZIP"
        subtitle="Назовите файлы по артикулу товара: ГБ-00000370.jpg — главное фото, ГБ-00000370_2.jpg, ГБ-00000370_3.jpg — следующие. Дефис и нули в артикуле можно писать как угодно."
      />
      <Card className="p-6">
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-neutral-300 py-10 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            read(e.dataTransfer.files?.[0]);
          }}
        >
          <FileArchive className="size-10 text-[#8E1B47]" />
          <div className="text-sm text-neutral-600">Перетащите архив сюда или</div>
          <Btn onClick={() => ref.current?.click()} loading={busy === "read"}>
            Выбрать ZIP
          </Btn>
          <div className="text-xs text-neutral-500">До 300 МБ, до 3000 фото (JPG, PNG, WebP). Сначала покажем, что к чему привяжется — без изменений на сайте.</div>
          <input ref={ref} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => read(e.target.files?.[0])} />
        </div>
      </Card>

      {report ? (
        <Card className="mt-4 p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-medium">В архиве фото: {report.files}</span>
            <Badge tone="green">Найдено товаров: {report.plan.length}</Badge>
            {report.unmatched.length ? <Badge tone="amber">Не найден артикул: {report.unmatched.length}</Badge> : null}
            {report.ambiguous.length ? <Badge tone="red">Неоднозначно: {report.ambiguous.length}</Badge> : null}
          </div>

          {report.plan.length ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg bg-neutral-50 p-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={mode === "add"} onChange={() => setMode("add")} /> Добавить к текущим фото
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> Заменить текущие фото
                </label>
                <Btn className="ml-auto" onClick={apply} loading={busy === "apply"}>
                  Привязать фото
                </Btn>
              </div>
              <div className="max-h-96 overflow-auto rounded-lg border border-neutral-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-50 text-left text-xs text-neutral-600">
                    <tr>
                      <th className="px-3 py-2">Артикул</th>
                      <th className="px-3 py-2">Товар</th>
                      <th className="px-3 py-2">Файлы</th>
                      <th className="px-3 py-2 text-right">Сейчас фото</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {report.plan.map((p) => (
                      <tr key={p.productId}>
                        <td className="whitespace-nowrap px-3 py-1.5">{p.article}</td>
                        <td className="px-3 py-1.5">
                          <Link href={`/products/${p.productId}`} target="_blank" className="hover:text-[#8E1B47]">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-neutral-600">{p.files.map((f) => f.split("/").pop()).join(", ")}</td>
                        <td className="px-3 py-1.5 text-right">{p.current}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-neutral-600">Ни один файл не подошёл к артикулу товара. Проверьте названия файлов.</p>
          )}

          {report.unmatched.length ? (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-amber-800">Файлы без товара ({report.unmatched.length})</summary>
              <div className="mt-2 max-h-40 overflow-auto text-xs text-neutral-600">{report.unmatched.join(", ")}</div>
            </details>
          ) : null}
          {report.ambiguous.length ? (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-red-700">Подходят к нескольким товарам — пропущены ({report.ambiguous.length})</summary>
              <ul className="mt-2 max-h-40 overflow-auto text-xs text-neutral-600">
                {report.ambiguous.map((a) => (
                  <li key={a.file}>
                    {a.file}: {a.articles.join(", ")}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}

      {done ? (
        <Card className="mt-4 p-5 text-sm">
          <div className="font-medium text-emerald-700">
            Готово: товаров {done.products}, фото {done.photos}
          </div>
          {done.errors.length ? <div className="mt-2 text-red-700">Ошибки: {done.errors.join("; ")}</div> : null}
        </Card>
      ) : null}
    </div>
  );
}
