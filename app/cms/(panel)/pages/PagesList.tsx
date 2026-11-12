"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { cmsApi, fmtDate } from "@/lib/cms/client";
import { slugify } from "@/lib/productSlug";
import { Badge, Btn, Card, Field, Input, PageHeader } from "@/components/cms/ui";

type Row = {
  slug: string;
  title: string;
  path: string;
  builtin: boolean;
  published: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  draftUpdatedAt: string;
  changed: boolean;
  showInMenu: boolean;
};

export function PagesList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    cmsApi<{ pages: Row[] }>("/api/cms/pages")
      .then((r) => alive && setRows(r.pages))
      .catch((e) => toast.error(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const r = await cmsApi<{ slug: string }>("/api/cms/pages", { body: { title, slug } });
      router.push(`/pages/${r.slug}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Страницы"
        subtitle="Тексты страниц сайта: контакты и реквизиты, документы и свои страницы (доставка, оплата, о нас…). Изменения видны после публикации."
        actions={
          <Btn onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Новая страница
          </Btn>
        }
      />
      {adding ? (
        <Card className="mb-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Заголовок">
              <Input
                value={title}
                autoFocus
                maxLength={150}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value).slice(0, 60));
                }}
                placeholder="Доставка и оплата"
              />
            </Field>
            <Field label="Адрес" hint={`kosmetichka-opt.ru/info/${slug || "…"}`}>
              <Input
                value={slug}
                maxLength={60}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                placeholder="dostavka-i-oplata"
              />
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <Btn onClick={create} loading={busy} disabled={!title.trim() || !slug}>
              Создать
            </Btn>
            <Btn variant="ghost" onClick={() => setAdding(false)}>
              Отмена
            </Btn>
          </div>
        </Card>
      ) : null}
      <Card className="divide-y divide-neutral-100">
        {!rows ? (
          <div className="p-6 text-sm text-neutral-500">Загрузка…</div>
        ) : (
          rows.map((r) => (
            <div key={r.slug} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-56 flex-1">
                <Link href={`/pages/${r.slug}`} className="font-medium text-neutral-900 hover:text-[#8E1B47]">
                  {r.title}
                </Link>
                <div className="text-xs text-neutral-500">
                  {r.path}
                  {r.builtin ? " · страница сайта" : ""}
                  {r.showInMenu ? " · в меню" : ""}
                </div>
              </div>
              {r.published ? (
                r.changed ? <Badge tone="amber">Есть неопубликованные правки</Badge> : <Badge tone="green">Опубликована</Badge>
              ) : r.builtin ? (
                <Badge tone="neutral">На сайте прежний текст</Badge>
              ) : (
                <Badge tone="neutral">Черновик</Badge>
              )}
              <span className="w-40 text-xs text-neutral-500">{r.publishedAt ? `${fmtDate(r.publishedAt)}, ${r.publishedBy}` : ""}</span>
              {r.published || r.builtin ? (
                <a href={`https://kosmetichka-opt.ru${r.path}`} target="_blank" rel="noreferrer" className="text-neutral-400 hover:text-[#8E1B47]" title="Открыть на сайте">
                  <ExternalLink className="size-4" />
                </a>
              ) : null}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
