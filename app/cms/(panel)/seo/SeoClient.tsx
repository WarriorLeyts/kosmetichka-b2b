"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cmsApi, fmtDate } from "@/lib/cms/client";
import { DEFAULT_TEMPLATES, SEO_LIMITS } from "@/lib/cms/seoTemplate";
import { Badge, Btn, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/cms/ui";
import { BulkDialog, OperationsDrawer, VarsHint, type BulkTarget } from "@/components/cms/BulkDialog";

type Report = {
  total: number;
  empty: number;
  template: number;
  manual: number;
  longTitle: number;
  longDesc: number;
  shortTitle: number;
  shortDesc: number;
  duplicates: { title: string; n: number }[];
  sameNameProducts: number;
};
type Example = { id: number; name: string; title: string; description: string; titleIssue: string | null; descIssue: string | null };

const SCOPES = [
  ["status=visible&seo=none", "Опубликованные товары без SEO"],
  ["status=visible&seo=none&stock=in", "Опубликованные в наличии без SEO"],
  ["status=visible", "Все опубликованные товары"],
  ["status=visible&seo=template", "Заполненные шаблоном раньше (обновить)"],
] as const;

export function SeoClient() {
  const [tpl, setTpl] = useState(DEFAULT_TEMPLATES);
  const [saved, setSaved] = useState("");
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedBy: string | null }>({ updatedAt: null, updatedBy: null });
  const [report, setReport] = useState<Report | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [scope, setScope] = useState<string>(SCOPES[0][0]);
  const [bulk, setBulk] = useState<BulkTarget | null>(null);
  const [opsOpen, setOpsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadReport = () => cmsApi<Report>("/api/cms/seo/report").then(setReport).catch(() => {});
  useEffect(() => {
    cmsApi<{ templates: typeof DEFAULT_TEMPLATES; updatedAt: string | null; updatedBy: string | null }>("/api/cms/settings/seo").then((r) => {
      setTpl(r.templates);
      setSaved(JSON.stringify(r.templates));
      setMeta(r);
    });
    loadReport();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      cmsApi<{ examples: Example[] }>("/api/cms/seo/preview", { body: { title: tpl.title, description: tpl.description } })
        .then((r) => setExamples(r.examples))
        .catch((e) => toast.error(e.message));
    }, 400);
    return () => clearTimeout(t);
  }, [tpl.title, tpl.description]);

  const dirty = JSON.stringify(tpl) !== saved;
  const save = async () => {
    setBusy(true);
    try {
      await cmsApi("/api/cms/settings/seo", { method: "PUT", body: tpl });
      setSaved(JSON.stringify(tpl));
      toast.success("Шаблоны сохранены");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (dirty && !(await save())) return;
    const r = await cmsApi<{ total: number }>(`/api/cms/products?${scope}&limit=5`);
    if (!r.total) return toast.info("Под выбранное условие товаров нет");
    setBulk({ filter: scope, count: r.total });
  };

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Массовое SEO"
        subtitle="Шаблоны заголовков и описаний для страниц товаров. Заполненное вручную без вашего подтверждения не перезаписывается."
        actions={
          <Btn variant="outline" onClick={() => setOpsOpen(true)}>
            История операций
          </Btn>
        }
      />

      {report ? (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Опубликованных товаров", report.total, "/products?status=visible"],
            ["Без SEO", report.empty, "/products?status=visible&seo=none"],
            ["SEO по шаблону", report.template, "/products?seo=template"],
            ["SEO вручную", report.manual, "/products?seo=manual"],
          ].map(([l, v, href]) => (
            <Link key={l as string} href={href as string} className="rounded-xl border border-neutral-200 bg-white p-4 hover:border-[#8E1B47]/40">
              <div className="text-xs text-neutral-500">{l}</div>
              <div className="mt-1 text-2xl font-semibold">{(v as number).toLocaleString("ru-RU")}</div>
            </Link>
          ))}
        </div>
      ) : null}
      {report && (report.duplicates.length || report.longTitle || report.longDesc || report.shortTitle || report.shortDesc) ? (
        <Card className="mb-4 p-4 text-sm">
          <div className="mb-1 font-medium">Что поправить</div>
          <ul className="list-inside list-disc text-neutral-700">
            {report.longTitle ? <li>Title длиннее {SEO_LIMITS.title.max} символов: {report.longTitle}</li> : null}
            {report.shortTitle ? <li>Title короче {SEO_LIMITS.title.min} символов: {report.shortTitle}</li> : null}
            {report.longDesc ? <li>Description длиннее {SEO_LIMITS.description.max}: {report.longDesc}</li> : null}
            {report.shortDesc ? <li>Description короче {SEO_LIMITS.description.min}: {report.shortDesc}</li> : null}
            {report.duplicates.length ? (
              <li>
                Одинаковый Title у нескольких товаров: {report.duplicates.length} заголовков (например, «{report.duplicates[0].title}» — {report.duplicates[0].n} шт.)
              </li>
            ) : null}
          </ul>
          {report.sameNameProducts ? (
            <p className="mt-2 text-xs text-neutral-500">
              В 1С есть {report.sameNameProducts} товаров с одинаковыми названиями — для них добавьте в шаблон {"{article}"}, иначе Title совпадут.
            </p>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-medium">Шаблоны</span>
            {meta.updatedAt ? (
              <span className="text-xs text-neutral-500">
                {fmtDate(meta.updatedAt)}, {meta.updatedBy}
              </span>
            ) : null}
          </div>
          <div className="space-y-3">
            <Field label="SEO Title" hint={`Рекомендуется ${SEO_LIMITS.title.min}–${SEO_LIMITS.title.max} символов`}>
              <Input value={tpl.title} onChange={(e) => setTpl({ ...tpl, title: e.target.value })} maxLength={200} />
            </Field>
            <Field label="Meta Description" hint={`Рекомендуется ${SEO_LIMITS.description.min}–${SEO_LIMITS.description.max} символов`}>
              <Textarea rows={3} value={tpl.description} onChange={(e) => setTpl({ ...tpl, description: e.target.value })} maxLength={400} />
            </Field>
            <Field label="Краткое описание (для массового «описание по шаблону»)">
              <Textarea rows={2} value={tpl.shortDescription} onChange={(e) => setTpl({ ...tpl, shortDescription: e.target.value })} maxLength={1000} />
            </Field>
            <VarsHint />
            <div className="flex gap-2">
              <Btn variant="outline" onClick={save} loading={busy} disabled={!dirty}>
                Сохранить шаблоны
              </Btn>
              <Btn variant="ghost" onClick={() => setTpl(DEFAULT_TEMPLATES)}>
                Шаблоны по умолчанию
              </Btn>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 font-medium">Как получится (популярные товары)</div>
          <ul className="space-y-3">
            {examples.map((x) => (
              <li key={x.id} className="text-sm">
                <div className="truncate text-[15px] text-[#1a0dab]">{x.title}</div>
                <div className="line-clamp-2 text-xs text-neutral-600">{x.description}</div>
                <div className="mt-0.5 flex gap-1">
                  {x.titleIssue ? <Badge tone="amber">Title: {x.titleIssue}</Badge> : null}
                  {x.descIssue ? <Badge tone="amber">Description: {x.descIssue}</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <div className="mb-3 font-medium">Применить к товарам</div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Каким товарам" className="min-w-80 flex-1">
            <Select value={scope} onChange={(e) => setScope(e.target.value)}>
              {SCOPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Btn onClick={apply}>Предпросмотр и применение…</Btn>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Перед записью покажем, сколько товаров изменится, примеры и предупреждения (дубли, длина). Ручные SEO-поля перезаписываются только если выбрать это отдельно и подтвердить. Любую
          операцию можно отменить в «Истории операций». Выбрать конкретные товары можно в разделе «Товары» → «Изменить выбранные».
        </p>
      </Card>

      {bulk ? (
        <BulkDialog
          target={bulk}
          initial="seo"
          onClose={() => setBulk(null)}
          onDone={() => {
            setBulk(null);
            loadReport();
          }}
        />
      ) : null}
      {opsOpen ? <OperationsDrawer onClose={() => setOpsOpen(false)} onUndone={loadReport} /> : null}
    </div>
  );
}
