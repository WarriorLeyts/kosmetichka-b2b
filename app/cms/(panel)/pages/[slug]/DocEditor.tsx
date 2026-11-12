"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, History, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cmsApi, fmtDate } from "@/lib/cms/client";
import { docContentSchema, type DocContent } from "@/lib/cms/docSchema";
import { RichText } from "@/lib/richText";
import { Badge, Btn, Card, Field, Input, PageHeader, Textarea, Toggle, useConfirm } from "@/components/cms/ui";

type Data = {
  slug: string;
  path: string;
  builtin: boolean;
  draft: DocContent;
  published: DocContent | null;
  draftUpdatedAt: string;
  draftUpdatedBy: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  canPublish: boolean;
};
type Version = { id: number; createdBy: string; createdAt: string };

const HELP = "## Подзаголовок · - пункт списка · 1. нумерованный · **жирный** · [текст ссылки](https://…) · пустая строка — новый абзац";

export function DocEditor({ slug }: { slug: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [doc, setDoc] = useState<DocContent | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "publish">("");
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [err, setErr] = useState("");
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    try {
      const r = await cmsApi<Data>(`/api/cms/pages/${slug}`);
      setData(r);
      setDoc(r.draft);
      setSaved(JSON.stringify(r.draft));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }, [slug]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const dirty = !!doc && JSON.stringify(doc) !== saved;
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (err) return <div className="text-sm text-neutral-500">{err}</div>;
  if (!data || !doc) return <div className="text-sm text-neutral-500">Загрузка…</div>;
  const set = (patch: Partial<DocContent>) => setDoc({ ...doc, ...patch });
  const unpublished = !data.published || JSON.stringify(data.published) !== JSON.stringify(doc);

  const save = async () => {
    const v = docContentSchema.safeParse(doc);
    if (!v.success) {
      toast.error(v.error.issues[0]?.message ?? "Проверьте поля");
      return false;
    }
    setBusy("save");
    try {
      const r = await cmsApi<{ draftUpdatedAt: string; draftUpdatedBy: string }>(`/api/cms/pages/${slug}`, {
        method: "PUT",
        body: { content: v.data, baseUpdatedAt: data.draftUpdatedAt },
      });
      setSaved(JSON.stringify(doc));
      setData({ ...data, draftUpdatedAt: r.draftUpdatedAt, draftUpdatedBy: r.draftUpdatedBy });
      toast.success("Черновик сохранён. На сайте изменится после «Опубликовать».");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
      return false;
    } finally {
      setBusy("");
    }
  };

  const publish = async () => {
    if (dirty && !(await save())) return;
    if (!(await confirm(`Опубликовать «${doc.title}»?\nСтраница ${data.path} обновится на сайте и в приложении.`, false))) return;
    setBusy("publish");
    try {
      await cmsApi(`/api/cms/pages/${slug}/publish`, { body: { action: "publish" } });
      toast.success("Опубликовано");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy("");
    }
  };

  const unpublish = async () => {
    const text = data.builtin ? "Вернуть на сайт прежний текст страницы?\nВаш текст останется в черновике." : "Снять страницу с сайта?\nОна останется в черновиках.";
    if (!(await confirm(text))) return;
    try {
      await cmsApi(`/api/cms/pages/${slug}/publish`, { body: { action: "unpublish" } });
      toast.success("Снято с публикации");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const remove = async () => {
    if (!(await confirm(`Удалить страницу «${doc.title}»?\nОна пропадёт с сайта, вернуть нельзя.`))) return;
    try {
      await cmsApi(`/api/cms/pages/${slug}`, { method: "DELETE" });
      toast.success("Страница удалена");
      router.push("/pages");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const openHistory = async () => {
    try {
      setVersions((await cmsApi<{ versions: Version[] }>(`/api/cms/pages/${slug}/versions`)).versions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };
  const restore = async (v: Version) => {
    if (!(await confirm(`Открыть версию от ${fmtDate(v.createdAt)} в черновике?${dirty ? "\nНесохранённые правки пропадут." : ""}`))) return;
    try {
      await cmsApi(`/api/cms/pages/${slug}/versions`, { body: { id: v.id } });
      await load();
      toast.success("Версия в черновике — проверьте и опубликуйте");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const setGroup = (i: number, patch: Partial<DocContent["groups"][number]>) => set({ groups: doc.groups.map((g, k) => (k === i ? { ...g, ...patch } : g)) });
  const moveRow = (gi: number, ri: number, d: number) => {
    const rows = [...doc.groups[gi].rows];
    const j = ri + d;
    if (j < 0 || j >= rows.length) return;
    [rows[ri], rows[j]] = [rows[j], rows[ri]];
    setGroup(gi, { rows });
  };

  return (
    <div className="max-w-6xl pb-20">
      {dialog}
      <Link href="/pages" className="mb-2 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-[#8E1B47]">
        <ArrowLeft className="size-4" /> Страницы
      </Link>
      <PageHeader
        title={doc.title || "Без заголовка"}
        subtitle={
          <>
            kosmetichka-opt.ru{data.path} ·{" "}
            {data.publishedAt ? `опубликована ${fmtDate(data.publishedAt)}, ${data.publishedBy}` : data.builtin ? "на сайте прежний текст" : "ещё не опубликована"}
          </>
        }
        actions={
          <>
            <Btn variant="outline" onClick={openHistory}>
              <History className="size-4" /> Версии
            </Btn>
            {data.published || data.builtin ? (
              <a href={`https://kosmetichka-opt.ru${data.path}`} target="_blank" rel="noreferrer">
                <Btn variant="outline">
                  <ExternalLink className="size-4" /> На сайте
                </Btn>
              </a>
            ) : null}
            <Btn variant="outline" onClick={save} loading={busy === "save"} disabled={!dirty}>
              Сохранить
            </Btn>
            {data.canPublish ? (
              <Btn onClick={publish} loading={busy === "publish"} disabled={!unpublished && !dirty}>
                Опубликовать
              </Btn>
            ) : null}
          </>
        }
      />
      {!data.canPublish ? <p className="mb-3 text-xs text-amber-700">Опубликовать может администратор — сохраните черновик.</p> : null}
      {versions ? (
        <Card className="mb-4 p-4 text-sm">
          <div className="mb-2 flex justify-between font-medium">
            Опубликованные версии
            <button className="text-neutral-400" onClick={() => setVersions(null)}>
              ✕
            </button>
          </div>
          {!versions.length ? <p className="text-neutral-500">Ещё не публиковали</p> : null}
          <ul className="divide-y divide-neutral-100">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-1.5">
                <span>
                  {fmtDate(v.createdAt)} · {v.createdBy}
                </span>
                <Btn size="sm" variant="ghost" onClick={() => restore(v)}>
                  В черновик
                </Btn>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            <Field label="Заголовок">
              <Input value={doc.title} maxLength={150} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            {doc.groups.map((g, gi) => (
              <div key={gi} className="rounded-lg border border-neutral-200 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Input value={g.title} placeholder="Название таблицы (например, Реквизиты)" maxLength={120} onChange={(e) => setGroup(gi, { title: e.target.value })} />
                  <button className="text-neutral-400 hover:text-red-600" title="Удалить таблицу" onClick={() => set({ groups: doc.groups.filter((_, k) => k !== gi) })}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {g.rows.map((r, ri) => (
                  <div key={ri} className="mb-1.5 flex items-center gap-1.5">
                    <Input className="w-36" value={r.label} placeholder="ИНН" maxLength={80} onChange={(e) => setGroup(gi, { rows: g.rows.map((x, k) => (k === ri ? { ...x, label: e.target.value } : x)) })} />
                    <Input className="flex-1" value={r.value} maxLength={400} onChange={(e) => setGroup(gi, { rows: g.rows.map((x, k) => (k === ri ? { ...x, value: e.target.value } : x)) })} />
                    <button className="text-neutral-400 disabled:opacity-30" disabled={ri === 0} onClick={() => moveRow(gi, ri, -1)} aria-label="Выше">
                      <ArrowUp className="size-4" />
                    </button>
                    <button className="text-neutral-400 disabled:opacity-30" disabled={ri === g.rows.length - 1} onClick={() => moveRow(gi, ri, 1)} aria-label="Ниже">
                      <ArrowDown className="size-4" />
                    </button>
                    <button className="text-neutral-400 hover:text-red-600" onClick={() => setGroup(gi, { rows: g.rows.filter((_, k) => k !== ri) })} aria-label="Удалить строку">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <button className="text-sm text-[#8E1B47] hover:underline" onClick={() => setGroup(gi, { rows: [...g.rows, { label: "", value: "" }] })}>
                  <Plus className="inline size-3.5" /> строка
                </button>
              </div>
            ))}
            <button className="text-sm text-[#8E1B47] hover:underline" onClick={() => set({ groups: [...doc.groups, { title: "", rows: [{ label: "", value: "" }] }] })}>
              <Plus className="inline size-3.5" /> Таблица «название — значение» (реквизиты, телефоны, график)
            </button>
            {slug === "contacts" ? <p className="text-xs text-neutral-500">Первая таблица — реквизиты, их показывает и приложение в «О компании».</p> : null}
            <Field label="Текст" hint={HELP}>
              <Textarea rows={18} value={doc.body} maxLength={100000} onChange={(e) => set({ body: e.target.value })} className="font-mono text-[13px]" />
            </Field>
          </Card>
          <Card className="space-y-3 p-5">
            <div className="font-medium">Меню и поиск</div>
            <Toggle checked={doc.showInMenu} onChange={(v) => set({ showInMenu: v })} label="Ссылка в «О компании» приложения и внизу страниц сайта" />
            {doc.showInMenu ? (
              <Field label="Название ссылки" hint="Пусто — заголовок страницы">
                <Input value={doc.menuTitle} maxLength={60} onChange={(e) => set({ menuTitle: e.target.value })} />
              </Field>
            ) : null}
            <Field label="SEO Title" hint="Пусто — заголовок страницы">
              <Input value={doc.seoTitle} maxLength={120} onChange={(e) => set({ seoTitle: e.target.value })} />
            </Field>
            <Field label="Meta Description">
              <Textarea rows={2} value={doc.seoDescription} maxLength={300} onChange={(e) => set({ seoDescription: e.target.value })} />
            </Field>
          </Card>
          <div className="flex flex-wrap gap-2">
            {data.canPublish && data.published ? (
              <Btn variant="ghost" onClick={unpublish}>
                {data.builtin ? "Вернуть прежний текст на сайт" : "Снять с сайта"}
              </Btn>
            ) : null}
            {data.canPublish && !data.builtin ? (
              <Btn variant="ghost" onClick={remove} className="text-red-600">
                <Trash2 className="size-4" /> Удалить страницу
              </Btn>
            ) : null}
          </div>
        </div>
        <Card className="h-fit p-6 lg:sticky lg:top-4">
          <div className="mb-3 flex items-center justify-between text-xs text-neutral-500">
            Как будет на сайте {dirty ? <Badge tone="amber">не сохранено</Badge> : unpublished ? <Badge tone="amber">не опубликовано</Badge> : <Badge tone="green">как на сайте</Badge>}
          </div>
          <h1 className="mb-5 text-2xl font-black text-slate-800">{doc.title}</h1>
          {doc.groups.map((g, i) =>
            g.rows.length ? (
              <section key={i} className="mb-6">
                {g.title ? <h2 className="mb-2 text-base font-bold text-slate-700">{g.title}</h2> : null}
                <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {g.rows.map((r, k) => (
                    <div key={k} className="flex gap-2">
                      <span className="w-28 shrink-0 text-slate-400">{r.label}</span>
                      <span className="min-w-0 break-words">{r.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null
          )}
          <RichText text={doc.body} />
        </Card>
      </div>
    </div>
  );
}
