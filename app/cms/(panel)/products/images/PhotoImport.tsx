"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileArchive, FileSpreadsheet, ImageIcon, RotateCcw, Square, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cmsApi, fmtDate } from "@/lib/cms/client";
import { Badge, Btn, Card, PageHeader, useConfirm } from "@/components/cms/ui";

type PlanFile = { key: string; label: string; index: number; how: "exact" | "normalized" | "excel" };
type PlanItem = { productId: number; article: string | null; name: string; current: number; files: PlanFile[] };
type Analysis = {
  images: number;
  plan: PlanItem[];
  unmatched: string[];
  ambiguous: { file: string; articles: string[] }[];
  excel: { rows: number; missingFiles: string[]; unknownArticles: string[] } | null;
  bad: string[];
};
type Job = {
  id: number;
  status: string;
  title: string;
  total: number;
  done: number;
  failed: number;
  attempts: number;
  createdBy: string;
  createdAt: string;
  finishedAt: string | null;
  counts?: Record<string, number>;
  errors?: { article: string | null; file?: string; error: string }[];
};
type Pending = { file: File; progress: number; error?: string; done?: boolean };

const STATUS: Record<string, [string, "neutral" | "green" | "red" | "amber" | "accent"]> = {
  queued: ["В очереди", "neutral"],
  running: ["Идёт", "accent"],
  done: ["Готово", "green"],
  failed: ["Ошибка", "red"],
  cancelled: ["Остановлено", "amber"],
};
const HOW: Record<PlanFile["how"], string> = { exact: "", normalized: "артикул без дефиса/нулей", excel: "из Excel" };
const MODES = [
  ["skip", "Пропустить", "товары, у которых уже есть фото, не трогать"],
  ["add", "Добавить", "новые фото — в конец галереи"],
  ["replace", "Заменить", "текущие фото товара убрать, поставить новые"],
] as const;

/** one file → PUT /api/cms/photos/session/:sid?name= with upload progress */
function putFile(sid: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/cms/photos/session/${sid}?name=${encodeURIComponent(file.name)}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      try {
        reject(new Error(JSON.parse(xhr.responseText).error || `Ошибка ${xhr.status}`));
      } catch {
        reject(new Error(xhr.status === 413 ? "Файл слишком большой для сервера" : `Ошибка ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Связь прервалась"));
    xhr.send(file);
  });
}

export function PhotoImport() {
  const pickRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [phase, setPhase] = useState<"" | "upload" | "analyze" | "start">("");
  const [sid, setSid] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mode, setMode] = useState<"skip" | "add" | "replace">("skip");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [active, setActive] = useState<Job | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const { confirm, dialog } = useConfirm();

  const loadJobs = useCallback(() => cmsApi<{ jobs: Job[] }>("/api/cms/jobs").then((r) => setJobs(r.jobs.filter((j) => j.status !== undefined))), []);
  useEffect(() => {
    loadJobs().catch(() => {});
  }, [loadJobs]);

  // ход выбранной задачи — раз в 2 секунды, пока она идёт
  useEffect(() => {
    if (!activeId) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await cmsApi<{ job: Job }>(`/api/cms/jobs/${activeId}`);
        if (stop) return;
        setActive(r.job);
        if (["queued", "running"].includes(r.job.status)) setTimeout(tick, 2000);
        else loadJobs();
      } catch {
        if (!stop) setTimeout(tick, 4000);
      }
    };
    tick();
    return () => {
      stop = true;
    };
  }, [activeId, loadJobs]);

  const add = (list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list).filter((f) => /\.(zip|xlsx|jpe?g|png|webp)$/i.test(f.name));
    const skipped = Array.from(list).length - files.length;
    if (skipped) toast.warning(`Пропущено файлов другого типа: ${skipped}`);
    setPending((p) => [...p, ...files.map((file) => ({ file, progress: 0 }))]);
    setAnalysis(null);
    setSid(null);
  };

  const uploadAndAnalyze = async () => {
    if (!pending.length) return;
    setPhase("upload");
    try {
      const { sid: s } = await cmsApi<{ sid: string }>("/api/cms/photos/session", { body: {} });
      // по 3 файла одновременно
      const queue = pending.map((_, i) => i);
      const worker = async () => {
        for (;;) {
          const i = queue.shift();
          if (i === undefined) return;
          try {
            await putFile(s, pending[i].file, (pr) => setPending((cur) => cur.map((x, k) => (k === i ? { ...x, progress: pr } : x))));
            setPending((cur) => cur.map((x, k) => (k === i ? { ...x, progress: 1, done: true } : x)));
          } catch (e) {
            setPending((cur) => cur.map((x, k) => (k === i ? { ...x, error: e instanceof Error ? e.message : "ошибка" } : x)));
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      setSid(s);
      setPhase("analyze");
      setAnalysis(await cmsApi<Analysis>(`/api/cms/photos/session/${s}/analyze`, { body: {} }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPhase("");
    }
  };

  const start = async () => {
    if (!sid || !analysis) return;
    const photos = analysis.plan.reduce((s, p) => s + p.files.length, 0);
    const withPhotos = analysis.plan.filter((p) => p.current > 0).length;
    const text =
      mode === "replace"
        ? `Заменить фото у ${analysis.plan.length} товаров?\nУ ${withPhotos} из них текущие фото уберутся из карточек.`
        : mode === "add"
          ? `Добавить ${photos} фото к ${analysis.plan.length} товарам?`
          : `Загрузить фото товарам без фото (${analysis.plan.length - withPhotos} из ${analysis.plan.length})? Товары с фото пропустим.`;
    if (!(await confirm(text, mode === "replace"))) return;
    setPhase("start");
    try {
      const r = await cmsApi<{ jobId: number }>(`/api/cms/photos/session/${sid}/start`, { body: { mode } });
      toast.success("Загрузка поставлена в очередь — можно закрыть страницу, она продолжится на сервере");
      setActiveId(r.jobId);
      setPending([]);
      setAnalysis(null);
      setSid(null);
      loadJobs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPhase("");
    }
  };

  const jobAction = async (id: number, action: "cancel" | "retry") => {
    if (action === "cancel" && !(await confirm("Остановить загрузку? Уже загруженные фото останутся."))) return;
    try {
      await cmsApi(`/api/cms/jobs/${id}`, { body: { action } });
      setActiveId(null);
      setTimeout(() => setActiveId(id), 50);
      loadJobs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const totalSize = pending.reduce((s, p) => s + p.file.size, 0);
  const photosInPlan = analysis?.plan.reduce((s, p) => s + p.files.length, 0) ?? 0;

  return (
    <div className="max-w-6xl">
      {dialog}
      <PageHeader
        title="Загрузка фото товаров"
        subtitle={
          <>
            Имя файла — артикул товара: <code>ГБ-00000370.jpg</code> — главное фото, <code>ГБ-00000370_2.jpg</code>, <code>ГБ-00000370_3.jpg</code> — дополнительные. Или Excel «артикул → файлы».
          </>
        }
        actions={
          <a href="/api/cms/photos/template">
            <Btn variant="outline">
              <FileSpreadsheet className="size-4" /> Образец Excel
            </Btn>
          </a>
        }
      />

      <Card className="p-5">
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-neutral-300 py-8 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            add(e.dataTransfer.files);
          }}
        >
          <div className="flex gap-3 text-[#8E1B47]">
            <ImageIcon className="size-7" />
            <FileArchive className="size-7" />
            <FileSpreadsheet className="size-7" />
          </div>
          <div className="text-sm text-neutral-600">Перетащите сюда фото (одно или много), ZIP-архивы и/или Excel</div>
          <Btn variant="outline" onClick={() => pickRef.current?.click()}>
            Выбрать файлы
          </Btn>
          <div className="text-xs text-neutral-500">JPG, PNG, WebP, ZIP (до 2 ГБ, тысячи фото), XLSX. Всего до 4 ГБ за раз.</div>
          <input ref={pickRef} type="file" multiple accept=".zip,.xlsx,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
        </div>

        {pending.length ? (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>
                Файлов: {pending.length} · {(totalSize / 1024 / 1024).toFixed(1)} МБ
              </span>
              <span className="flex gap-2">
                <Btn variant="ghost" size="sm" onClick={() => (setPending([]), setAnalysis(null), setSid(null))} disabled={!!phase}>
                  Очистить
                </Btn>
                <Btn size="sm" onClick={uploadAndAnalyze} loading={phase === "upload" || phase === "analyze"} disabled={!!analysis}>
                  <Upload className="size-4" /> {phase === "analyze" ? "Разбираю…" : "Загрузить и разобрать"}
                </Btn>
              </span>
            </div>
            <ul className="max-h-48 space-y-1 overflow-auto text-xs">
              {pending.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-64 truncate">{p.file.name}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded bg-neutral-100">
                    <span className={`block h-full ${p.error ? "bg-red-500" : "bg-[#8E1B47]"}`} style={{ width: `${Math.round(p.progress * 100)}%` }} />
                  </span>
                  <span className="w-40 text-right text-neutral-500">{p.error ? <span className="text-red-600">{p.error}</span> : p.done ? "загружен" : `${Math.round(p.progress * 100)}%`}</span>
                  {!phase && !analysis ? (
                    <button onClick={() => setPending((cur) => cur.filter((_, k) => k !== i))} aria-label="Убрать">
                      <X className="size-3.5 text-neutral-400" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {analysis ? (
        <Card className="mt-4 p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-medium">Фото найдено: {analysis.images}</span>
            <Badge tone="green">
              Товаров: {analysis.plan.length} ({photosInPlan} фото)
            </Badge>
            <Badge>Из них уже с фото: {analysis.plan.filter((p) => p.current > 0).length}</Badge>
            {analysis.unmatched.length ? <Badge tone="amber">Артикул не найден: {analysis.unmatched.length}</Badge> : null}
            {analysis.ambiguous.length ? <Badge tone="red">Неоднозначно: {analysis.ambiguous.length}</Badge> : null}
          </div>
          {analysis.bad.map((b) => (
            <div key={b} className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {b}
            </div>
          ))}
          {analysis.excel ? (
            <div className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
              Excel: строк {analysis.excel.rows}
              {analysis.excel.missingFiles.length ? <span className="text-amber-700"> · нет файлов из таблицы: {analysis.excel.missingFiles.length}</span> : null}
              {analysis.excel.unknownArticles.length ? <span className="text-amber-700"> · неизвестных артикулов: {analysis.excel.unknownArticles.slice(0, 10).join(", ")}</span> : null}
            </div>
          ) : null}

          {analysis.plan.length ? (
            <>
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                {MODES.map(([k, label, hint]) => (
                  <label key={k} className={`cursor-pointer rounded-lg border p-3 text-sm ${mode === k ? "border-[#8E1B47] bg-[#FBEFF3]" : "border-neutral-200"}`}>
                    <input type="radio" className="mr-2" checked={mode === k} onChange={() => setMode(k)} />
                    <b>{label}</b>
                    <div className="mt-1 text-xs text-neutral-500">{hint}</div>
                  </label>
                ))}
              </div>
              <div className="mb-3 flex justify-end">
                <Btn onClick={start} loading={phase === "start"}>
                  Запустить загрузку
                </Btn>
              </div>
              <div className="max-h-[28rem] overflow-auto rounded-lg border border-neutral-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-50 text-left text-xs text-neutral-600">
                    <tr>
                      <th className="px-3 py-2">Артикул</th>
                      <th className="px-3 py-2">Товар</th>
                      <th className="px-3 py-2">Файлы (по порядку)</th>
                      <th className="px-3 py-2 text-right">Сейчас фото</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {analysis.plan.slice(0, 500).map((p) => (
                      <tr key={p.productId} className="align-top">
                        <td className="whitespace-nowrap px-3 py-1.5">{p.article}</td>
                        <td className="px-3 py-1.5">
                          <Link href={`/products/${p.productId}`} target="_blank" className="hover:text-[#8E1B47]">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-neutral-600">
                          {p.files.map((f) => (
                            <div key={f.key}>
                              {f.index}. {f.label.split("/").pop()} {HOW[f.how] ? <span className="text-amber-700">({HOW[f.how]})</span> : null}
                            </div>
                          ))}
                        </td>
                        <td className="px-3 py-1.5 text-right">{p.current || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {analysis.plan.length > 500 ? <div className="p-2 text-center text-xs text-neutral-500">…и ещё {analysis.plan.length - 500} товаров (все будут в отчёте)</div> : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-neutral-600">Ни одно фото не подошло к артикулу товара. Проверьте названия файлов или Excel.</p>
          )}
          {analysis.unmatched.length ? (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-amber-800">Файлы без товара ({analysis.unmatched.length})</summary>
              <div className="mt-2 max-h-40 overflow-auto text-xs text-neutral-600">{analysis.unmatched.join(", ")}</div>
            </details>
          ) : null}
          {analysis.ambiguous.length ? (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-red-700">Подходят к нескольким товарам — пропущены ({analysis.ambiguous.length})</summary>
              <ul className="mt-2 max-h-40 overflow-auto text-xs text-neutral-600">
                {analysis.ambiguous.map((a) => (
                  <li key={a.file}>
                    {a.file}: {a.articles.join(", ")}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}

      {active ? (
        <Card className="mt-4 p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-medium">#{active.id} {active.title}</span>
            <Badge tone={STATUS[active.status]?.[1] ?? "neutral"}>{STATUS[active.status]?.[0] ?? active.status}</Badge>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full bg-[#8E1B47] transition-all" style={{ width: `${active.total ? Math.round(((active.done + active.failed) / active.total) * 100) : 0}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-neutral-600">
            <span>
              Обработано {active.done + active.failed} из {active.total}
            </span>
            {active.counts?.ok ? <span className="text-emerald-700">загружено: {active.counts.ok}</span> : null}
            {active.counts?.partial ? <span className="text-amber-700">частично: {active.counts.partial}</span> : null}
            {active.counts?.skipped ? <span>пропущено (уже с фото): {active.counts.skipped}</span> : null}
            {active.counts?.error ? <span className="text-red-700">ошибок: {active.counts.error}</span> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {["queued", "running"].includes(active.status) ? (
              <Btn size="sm" variant="danger" onClick={() => jobAction(active.id, "cancel")}>
                <Square className="size-3.5" /> Остановить
              </Btn>
            ) : null}
            {!["queued", "running"].includes(active.status) && (active.counts?.error || active.status === "failed" || active.status === "cancelled") ? (
              <Btn size="sm" variant="outline" onClick={() => jobAction(active.id, "retry")}>
                <RotateCcw className="size-3.5" /> {active.status === "cancelled" ? "Продолжить" : "Повторить ошибки"}
              </Btn>
            ) : null}
            <a href={`/api/cms/jobs/${active.id}/report`}>
              <Btn size="sm" variant="outline">
                <Download className="size-3.5" /> Отчёт Excel
              </Btn>
            </a>
          </div>
          {active.errors?.length ? (
            <details className="mt-3 text-sm" open={active.errors.length < 10}>
              <summary className="cursor-pointer text-red-700">Журнал ошибок ({active.errors.length})</summary>
              <ul className="mt-2 max-h-48 overflow-auto text-xs text-neutral-600">
                {active.errors.map((e, i) => (
                  <li key={i}>
                    {e.article ?? "—"} {e.file ? `· ${e.file.split("/").pop()}` : ""}: {e.error}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}

      <Card className="mt-4 p-5">
        <div className="mb-3 font-medium">Последние загрузки</div>
        {jobs.length === 0 ? <div className="text-sm text-neutral-500">Ещё не было</div> : null}
        <ul className="divide-y divide-neutral-100 text-sm">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-2 py-2">
              <button className="min-w-0 flex-1 truncate text-left hover:text-[#8E1B47]" onClick={() => setActiveId(j.id)}>
                #{j.id} {j.title}
              </button>
              <Badge tone={STATUS[j.status]?.[1] ?? "neutral"}>{STATUS[j.status]?.[0] ?? j.status}</Badge>
              <span className="text-xs text-neutral-500">
                {j.done + j.failed}/{j.total} · {fmtDate(j.createdAt)} · {j.createdBy}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-neutral-500">Загрузка идёт на сервере: страницу можно закрыть. Если сервер перезапустится, загрузка продолжится с места остановки.</p>
      </Card>
    </div>
  );
}
