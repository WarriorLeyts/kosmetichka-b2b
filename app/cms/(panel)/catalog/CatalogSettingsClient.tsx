"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { cmsApi, fmtDate } from "@/lib/cms/client";
import { catalogSettingsSchema, QUICK_DEFAULTS, type CatalogSettings } from "@/lib/catalogSettingsSchema";
import { Badge, Btn, Card, Field, Input, PageHeader, Select, Textarea, Toggle } from "@/components/cms/ui";
import { ImageUpload } from "@/components/cms/ImageUpload";
import { useSortable } from "@/components/cms/useSortable";

type Cat = { guid: string; name: string; parentGuid: string | null; sortOrder: number; slug: string; products: number };
type Data = { settings: CatalogSettings; imageUrls: Record<string, string>; categories: Cat[]; updatedAt: string | null; updatedBy: string | null };

const SEO_MAX = { title: 70, description: 160 };

export function CatalogSettingsClient({ tab }: { tab: "filters" | "categories" | "seo" }) {
  const [data, setData] = useState<Data | null>(null);
  const [s, setS] = useState<CatalogSettings | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    cmsApi<Data>("/api/cms/settings/catalog")
      .then((r) => {
        if (!alive) return;
        setData(r);
        setS(r.settings);
        setSaved(JSON.stringify(r.settings));
      })
      .catch((e) => toast.error(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const dirty = !!s && JSON.stringify(s) !== saved;
  const save = async () => {
    if (!s) return;
    const v = catalogSettingsSchema.safeParse(s);
    if (!v.success) return toast.error(v.error.issues[0]?.message ?? "Проверьте поля");
    setBusy(true);
    try {
      await cmsApi("/api/cms/settings/catalog", { method: "PUT", body: s });
      setSaved(JSON.stringify(s));
      toast.success("Сохранено. Сайт и приложения покажут изменения в течение 5 минут");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  if (!data || !s) return <div className="text-sm text-neutral-500">Загрузка…</div>;
  const header = (
    <PageHeader
      title={tab === "filters" ? "Быстрые фильтры" : tab === "categories" ? "Категории каталога" : "SEO каталога и категорий"}
      subtitle={data.updatedAt ? `Изменено ${fmtDate(data.updatedAt)}${data.updatedBy ? `, ${data.updatedBy}` : ""}` : undefined}
      actions={
        <>
          {dirty ? (
            <Btn variant="ghost" onClick={() => setS(JSON.parse(saved))}>
              Отменить
            </Btn>
          ) : null}
          <Btn onClick={save} loading={busy} disabled={!dirty}>
            Сохранить
          </Btn>
        </>
      }
    />
  );

  return (
    <div className="max-w-5xl">
      {header}
      {tab === "filters" ? <Filters s={s} setS={setS} /> : tab === "categories" ? <Categories s={s} setS={setS} data={data} /> : <Seo s={s} setS={setS} cats={data.categories} />}
    </div>
  );
}

type P = { s: CatalogSettings; setS: (s: CatalogSettings) => void };

function Filters({ s, setS }: P) {
  const move = (i: number, d: number) => {
    const q = [...s.quick];
    const j = i + d;
    if (j < 0 || j >= q.length) return;
    [q[i], q[j]] = [q[j], q[i]];
    setS({ ...s, quick: q });
  };
  return (
    <Card className="p-5">
      <p className="mb-4 text-sm text-neutral-500">
        Кнопки-фильтры каталога: в приложении и на сайте — над товарами, на стандартной главной и в окне «Фильтры». Порядок, названия и какие показывать.
      </p>
      <ul className="space-y-2">
        {s.quick.map((q, i) => (
          <li key={q.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2">
            <div className="flex flex-col">
              <button className="text-neutral-400 hover:text-neutral-700 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
                <ArrowUp className="size-4" />
              </button>
              <button className="text-neutral-400 hover:text-neutral-700 disabled:opacity-30" disabled={i === s.quick.length - 1} onClick={() => move(i, 1)} aria-label="Ниже">
                <ArrowDown className="size-4" />
              </button>
            </div>
            <Input
              className="min-w-48 flex-1"
              value={q.label}
              maxLength={40}
              onChange={(e) => setS({ ...s, quick: s.quick.map((x) => (x.key === q.key ? { ...x, label: e.target.value } : x)) })}
            />
            <span className="w-56 text-xs text-neutral-500">
              {q.key === "new" ? "товары, впервые пришедшие в компанию" : q.key === "sale" ? "товары со скидкой" : "подарочные наборы"}
              {q.label !== QUICK_DEFAULTS[q.key] ? (
                <button className="ml-1 text-[#8E1B47] hover:underline" onClick={() => setS({ ...s, quick: s.quick.map((x) => (x.key === q.key ? { ...x, label: QUICK_DEFAULTS[q.key] } : x)) })}>
                  <RotateCcw className="inline size-3" /> «{QUICK_DEFAULTS[q.key]}»
                </button>
              ) : null}
            </span>
            <Toggle checked={q.visible} onChange={(v) => setS({ ...s, quick: s.quick.map((x) => (x.key === q.key ? { ...x, visible: v } : x)) })} label={q.visible ? "Показывать" : "Скрыт"} />
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <Toggle checked={s.quickChips} onChange={(v) => setS({ ...s, quickChips: v })} label="Показывать фильтры кнопками над товарами в каталоге" />
      </div>
    </Card>
  );
}

function Categories({ s, setS, data }: P & { data: Data }) {
  const root = data.categories.find((c) => c.name.toLowerCase() === "каталог");
  const tops = data.categories.filter((c) => c !== root && (root ? c.parentGuid === root.guid : !c.parentGuid));
  const hidden = new Set(s.categories.hidden);
  const setOrder = (list: Cat[]) => setS({ ...s, categories: { ...s.categories, order: list.map((c) => c.guid) } });
  const ordered = useMemo(() => {
    const pos = new Map(s.categories.order.map((g, i) => [g, i]));
    return [...tops].sort((a, b) => (pos.get(a.guid) ?? 1e6 + tops.indexOf(a)) - (pos.get(b.guid) ?? 1e6 + tops.indexOf(b)));
  }, [s.categories.order, tops]);
  const sortable = useSortable((from, to) => {
    const list = [...ordered];
    const [x] = list.splice(from, 1);
    list.splice(to, 0, x);
    setOrder(list);
  });
  const setImage = (guid: string, path: string | null) => {
    const images = { ...s.categories.images };
    if (path) images[guid] = path;
    else delete images[guid];
    setS({ ...s, categories: { ...s.categories, images } });
  };
  const toggleHidden = (guid: string) =>
    setS({ ...s, categories: { ...s.categories, hidden: hidden.has(guid) ? s.categories.hidden.filter((g) => g !== guid) : [...s.categories.hidden, guid] } });

  return (
    <Card className="p-5">
      <p className="mb-4 text-sm text-neutral-500">
        Главные категории в меню каталога и на главной: порядок (перетащите), картинка и показывать ли. Состав категорий и товары в них приходят из 1С. Скрытая
        категория пропадает только из меню — товары остаются в поиске и подборках.
      </p>
      <ul className="space-y-2">
        {ordered.map((c, i) => (
          <li
            key={c.guid}
            ref={sortable.itemRef(i)}
            className={cn("flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2", sortable.dragging === i && "opacity-60 shadow-md", hidden.has(c.guid) && "bg-neutral-50")}
          >
            <span {...sortable.handleProps(i)} className="cursor-grab touch-none text-neutral-400" title="Перетащите, чтобы поменять порядок">
              <GripVertical className="size-4" />
            </span>
            <span className="w-6 text-right text-xs tabular-nums text-neutral-400">{i + 1}</span>
            <div className="w-28">
              <ImageUpload label="" folder="pages" aspect="aspect-square" value={s.categories.images[c.guid] ?? null} onChange={(v) => setImage(c.guid, v)} />
            </div>
            <div className="min-w-40 flex-1">
              <div className={cn("font-medium", hidden.has(c.guid) && "text-neutral-400 line-through")}>{c.name}</div>
              <div className="text-xs text-neutral-500">
                {s.categories.images[c.guid] ? "своя картинка" : "стандартная иконка"} · /catalog/{c.slug}
              </div>
            </div>
            <Btn variant="ghost" size="sm" onClick={() => toggleHidden(c.guid)}>
              {hidden.has(c.guid) ? (
                <>
                  <EyeOff className="size-4" /> Скрыта
                </>
              ) : (
                <>
                  <Eye className="size-4" /> В меню
                </>
              )}
            </Btn>
          </li>
        ))}
      </ul>
      {s.categories.order.length ? (
        <button className="mt-3 text-sm text-neutral-500 hover:text-[#8E1B47]" onClick={() => setS({ ...s, categories: { ...s.categories, order: [] } })}>
          <RotateCcw className="inline size-3.5" /> Порядок как в 1С
        </button>
      ) : null}
    </Card>
  );
}

function Seo({ s, setS, cats }: P & { cats: Cat[] }) {
  const [guid, setGuid] = useState("");
  const byGuid = new Map(cats.map((c) => [c.guid, c]));
  const root = cats.find((c) => c.name.toLowerCase() === "каталог");
  // the tree for the picker: top categories and their children, indented
  const opts: { guid: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const c of cats.filter((x) => x !== root && (x.parentGuid ?? null) === parent)) {
      opts.push({ guid: c.guid, label: `${"— ".repeat(depth)}${c.name}${s.seo.categories[c.guid] ? " ✓" : ""}` });
      if (depth < 3) walk(c.guid, depth + 1);
    }
  };
  walk(root ? root.guid : null, 0);
  const cur = guid ? (s.seo.categories[guid] ?? { title: "", description: "", text: "" }) : s.seo.catalog;
  const set = (patch: Partial<typeof cur>) => {
    const next = { ...cur, ...patch };
    if (!guid) setS({ ...s, seo: { ...s.seo, catalog: next } });
    else setS({ ...s, seo: { ...s.seo, categories: { ...s.seo.categories, [guid]: next } } });
  };
  const c = guid ? byGuid.get(guid) : null;
  const url = c ? `/catalog/${c.slug}` : "/catalog";
  const fallbackTitle = c ? `${c.name} — купить оптом` : "Каталог косметики и парфюмерии оптом";
  const title = cur.title || fallbackTitle;
  const desc = cur.description || (c ? `${c.name} оптом и в розницу в «Косметичке»: актуальные цены и остатки.` : "Каталог оптового магазина «Косметичка».");

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <Card className="p-5">
        <Field label="Страница">
          <Select value={guid} onChange={(e) => setGuid(e.target.value)}>
            <option value="">Весь каталог (/catalog){s.seo.catalog.title || s.seo.catalog.description ? " ✓" : ""}</option>
            {opts.map((o) => (
              <option key={o.guid} value={o.guid}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="mt-3 space-y-3">
          <Field label="SEO Title" hint={`${cur.title.length} / до ${SEO_MAX.title}. Пусто — «${fallbackTitle}»`}>
            <Input value={cur.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Meta Description" hint={`${cur.description.length} / до ${SEO_MAX.description}`}>
            <Textarea rows={3} value={cur.description} maxLength={300} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label="Текст на странице" hint="Под списком товаров, для поисковиков и покупателей. **жирный**, «- » список, «## » подзаголовок.">
            <Textarea rows={8} value={cur.text} maxLength={6000} onChange={(e) => set({ text: e.target.value })} />
          </Field>
        </div>
      </Card>
      <Card className="h-fit p-5">
        <div className="mb-2 text-sm font-medium">Как будет в поиске</div>
        <div className="text-xs text-neutral-500">kosmetichka-opt.ru{url}</div>
        <div className="truncate text-[17px] text-[#1a0dab]">{title.includes("Косметичка") ? title : `${title} | Косметичка`}</div>
        <div className="line-clamp-2 text-[13px] text-neutral-600">{desc}</div>
        {cur.title.length > SEO_MAX.title ? <Badge tone="amber">Title длиннее {SEO_MAX.title} — поисковик обрежет</Badge> : null}
        {c ? (
          <p className="mt-3 text-xs text-neutral-500">
            Страница категории для поисковиков: {url} (товаров на сайте: {c.products}). Покупателя она открывает в каталоге с этой категорией.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
