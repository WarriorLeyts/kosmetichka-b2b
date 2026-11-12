"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, GripVertical, ImagePlus, Lock, Plus, RefreshCw, RotateCcw, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cmsApi, fmtDate } from "@/lib/cms/client";
import { LABELS, PRICE_LABELS, SECTIONS } from "@/lib/cms/productSchema";
import { SEO_LIMITS, lengthIssue } from "@/lib/cms/seoTemplate";
import { Badge, Btn, Card, Field, Input, Select, Textarea, Toggle, useConfirm } from "@/components/cms/ui";
import { CategorySelect, ProductPicker } from "@/components/cms/Pickers";
import { useBrands } from "@/components/cms/BulkDialog";
import { useSortable } from "@/components/cms/useSortable";

type Img = { id: number; path: string; url: string; full: string; alt: string | null; original: string | null; fromAdmin: boolean; usedByVariants: number };
type Product = {
  id: number;
  guid: string;
  article: string | null;
  barcode: string | null;
  barcodes: { barcode: string; unitName: string | null }[];
  name: string;
  brand: { name: string; guid: string } | null;
  category: { name: string; guid: string } | null;
  categoryManual: boolean;
  brandManual: boolean;
  category1C: string | null;
  brand1C: string | null;
  description: string | null;
  descriptionManual: boolean;
  shortDescription: string | null;
  features: string | null;
  usage: string | null;
  composition: string | null;
  skinType: string | null;
  country: string | null;
  specs: { name: string; value: string }[];
  seoTitle: string | null;
  seoDescription: string | null;
  seoSource: string | null;
  slug: string | null;
  suggestedSlug: string;
  canonicalUrl: string | null;
  path: string;
  hidden: boolean;
  labels: string[];
  arrivals: {
    kind: "new" | "back" | null;
    shownOnSite: boolean;
    why: string[];
    firstReceiptAt: string | null;
    newUntil: string | null;
    until: string | null;
    newDays: number;
    backDays: number;
    rows: { place: string; docNumber: string; docDate: string; qty: number }[];
  };
  stock: number | null;
  wholesaleStock: number;
  salesCount: number;
  createdAt: string;
  updatedAt: string;
  prices: { priceType: string; price: number; updatedAt: string }[];
  warehouses: { name: string; qty: number }[];
  images: Img[];
  related: { id: number; name: string }[];
};

type Form = {
  description: string;
  shortDescription: string;
  features: string;
  usage: string;
  composition: string;
  skinType: string;
  country: string;
  specs: { name: string; value: string }[];
  seoTitle: string;
  seoDescription: string;
  slug: string;
  canonicalUrl: string;
  hidden: boolean;
  labels: string[];
  relatedIds: number[];
  categoryGuid: string;
  brandGuid: string;
  alts: Record<number, string>;
};
const toForm = (p: Product): Form => ({
  description: p.description ?? "",
  shortDescription: p.shortDescription ?? "",
  features: p.features ?? "",
  usage: p.usage ?? "",
  composition: p.composition ?? "",
  skinType: p.skinType ?? "",
  country: p.country ?? "",
  specs: p.specs,
  seoTitle: p.seoTitle ?? "",
  seoDescription: p.seoDescription ?? "",
  slug: p.slug ?? "",
  canonicalUrl: p.canonicalUrl ?? "",
  hidden: p.hidden,
  labels: p.labels,
  relatedIds: p.related.map((r) => r.id),
  categoryGuid: p.category?.guid ?? "",
  brandGuid: p.brand?.guid ?? "",
  alts: Object.fromEntries(p.images.map((i) => [i.id, i.alt ?? ""])),
});

const SKIN = ["Для всех типов кожи", "Сухая", "Нормальная", "Жирная", "Комбинированная", "Чувствительная", "Для всех типов волос", "Сухие волосы", "Жирные волосы", "Окрашенные волосы", "Повреждённые волосы"];

const ARRIVAL_LABELS = { new: "Новинка", back: "Снова в наличии" } as const;
const PLACE: Record<string, string> = { stock: "Склад", shop: "Магазин" };
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("ru-RU") : "—");

/** «Поступления из 1С»: the automatic «Новинка» / «Снова в наличии» of the site (lib/arrivals.ts) for this product */
function ArrivalsCard({ a }: { a: Product["arrivals"] }) {
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center gap-1.5 font-medium">
        <Lock className="size-4 text-neutral-400" /> Поступления из 1С
      </div>
      {a.kind ? (
        <div className="mb-2 text-sm">
          <Badge tone={a.shownOnSite ? "green" : "neutral"}>{ARRIVAL_LABELS[a.kind]}</Badge>{" "}
          {a.shownOnSite ? (
            <span className="text-neutral-600">на сайте до {day(a.kind === "new" ? a.newUntil : a.until)}</span>
          ) : (
            <span className="text-amber-700">на сайте не показана: {a.why.join(", ")}</span>
          )}
          {a.kind === "new" && a.until && a.newUntil && a.until > a.newUntil ? (
            <div className="mt-1 text-xs text-neutral-500">Потом — «Снова в наличии» до {day(a.until)}</div>
          ) : null}
        </div>
      ) : (
        <p className="mb-2 text-sm text-neutral-500">Недавно не приходил — меток «Новинка» / «Снова в наличии» нет.</p>
      )}
      {a.rows.length ? (
        <ul className="space-y-1 text-xs">
          {a.rows.slice(0, 8).map((r, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="text-neutral-600">
                {day(r.docDate)} · {PLACE[r.place] ?? r.place} · {r.docNumber}
              </span>
              <span className="tabular-nums">{r.qty} шт.</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-xs text-neutral-500">
        Первое поступление: {day(a.firstReceiptAt)}. «Новинка» — {a.newDays} дн. после первого прихода в компанию, «Снова в наличии» — {a.backDays} дн. после повторного (меняется в «Настройках»).
        Розница видит пришедшее в магазин, опт — на склад и в магазин.
      </p>
    </Card>
  );
}

export function ProductEditor({ id }: { id: number }) {
  const [p, setP] = useState<Product | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [base, setBase] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceId = useRef<number | null>(null);
  const brands = useBrands();
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    try {
      const r = await cmsApi<{ product: Product }>(`/api/cms/products/${id}`);
      setP(r.product);
      const f = toForm(r.product);
      setForm(f);
      setBase(JSON.stringify(f));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const dirty = !!form && JSON.stringify(form) !== base;
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = async () => {
    if (!form || !p) return;
    const b = JSON.parse(base) as Form;
    const patch: Record<string, unknown> = {};
    for (const k of ["description", "shortDescription", "features", "usage", "composition", "skinType", "country", "seoTitle", "seoDescription", "slug", "canonicalUrl"] as const)
      if (form[k] !== b[k]) patch[k] = form[k] || null;
    if (JSON.stringify(form.specs) !== JSON.stringify(b.specs)) patch.specs = form.specs.filter((s) => s.name.trim() && s.value.trim());
    if (form.hidden !== b.hidden) patch.hidden = form.hidden;
    if (JSON.stringify(form.labels) !== JSON.stringify(b.labels)) patch.labels = form.labels;
    if (JSON.stringify(form.relatedIds) !== JSON.stringify(b.relatedIds)) patch.relatedIds = form.relatedIds;
    if (form.categoryGuid !== b.categoryGuid && form.categoryGuid) patch.categoryGuid = form.categoryGuid;
    if (form.brandGuid !== b.brandGuid) patch.brandGuid = form.brandGuid || null;
    const alts = Object.entries(form.alts)
      .filter(([k, v]) => b.alts[Number(k)] !== v)
      .map(([k, v]) => ({ id: Number(k), alt: v }));
    if (alts.length) patch.imageAlts = alts;
    if (patch.hidden === true && !(await confirm("Скрыть товар с сайта? Покупатели перестанут его видеть в каталоге и поиске."))) return;
    if ((patch.categoryGuid || "brandGuid" in patch) && !(await confirm("Категория/бренд станут «изменёнными на сайте»: обмен с 1С перестанет их менять у этого товара. Продолжить?", false))) return;
    setSaving(true);
    try {
      await cmsApi(`/api/cms/products/${p.id}`, { method: "PATCH", body: patch });
      toast.success("Сохранено");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const from1C = async (what: "descriptionFrom1C" | "categoryFrom1C" | "brandFrom1C", text: string) => {
    if (!p || !(await confirm(text))) return;
    await cmsApi(`/api/cms/products/${p.id}`, { method: "PATCH", body: { [what]: true } }).catch((e) => toast.error(e.message));
    toast.success("Готово");
    load();
  };

  const upload = async (files: FileList | File[] | null, replace?: number) => {
    if (!p || !files || !files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files).slice(0, replace ? 1 : 20)) fd.append("files", f);
      if (replace) fd.append("replaceId", String(replace));
      const r = await cmsApi<{ added?: number }>(`/api/cms/products/${p.id}/photos`, { form: fd });
      toast.success(replace ? "Фото заменено" : `Добавлено фото: ${r.added}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (replaceRef.current) replaceRef.current.value = "";
    }
  };

  const saveOrder = async (imgs: Img[]) => {
    if (!p) return;
    setP({ ...p, images: imgs });
    try {
      await cmsApi(`/api/cms/products/${p.id}/photos`, { method: "PUT", body: { order: imgs.map((i) => i.id) } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
      load();
    }
  };

  const removeImg = async (img: Img) => {
    if (!p) return;
    if (!(await confirm(img.fromAdmin ? "Убрать фото из карточки?" : "Это фото из 1С: при следующей выгрузке фото из 1С оно может вернуться.\nУбрать?"))) return;
    try {
      await cmsApi(`/api/cms/products/${p.id}/photos?imageId=${img.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  // порядок фото перетаскиванием (мышью и пальцем); сохраняется, когда фото отпущено
  const imgsRef = useRef<Img[]>([]);
  useEffect(() => {
    imgsRef.current = p?.images ?? [];
  }, [p]);
  const photoSort = useSortable(
    (from, to) =>
      setP((cur) => {
        if (!cur) return cur;
        const next = [...cur.images];
        const [x] = next.splice(from, 1);
        next.splice(to, 0, x);
        return { ...cur, images: next };
      }),
    () => saveOrder(imgsRef.current)
  );

  if (!p || !form) return <div className="text-sm text-neutral-500">Загрузка…</div>;
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const seoTitle = form.seoTitle || p.name;
  const seoDesc = (form.seoDescription || form.shortDescription || form.description || `Купить ${p.name} оптом в магазине Косметичка. Выгодные цены.`)
    .replace(/[*_`#>~]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 160);
  const shownPath = form.slug ? `/product/${p.id}-${form.slug}` : `/product/${p.id}`;
  const tIssue = form.seoTitle ? lengthIssue("title", form.seoTitle) : null;
  const dIssue = form.seoDescription ? lengthIssue("description", form.seoDescription) : null;

  return (
    <div className="max-w-6xl pb-24">
      {dialog}
      <Link href="/products" className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-[#8E1B47]">
        <ArrowLeft className="size-4" /> Все товары
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{p.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
            <span>Арт. {p.article ?? "—"}</span>
            {form.hidden ? <Badge tone="red">Скрыт с сайта</Badge> : <Badge tone="green">На сайте</Badge>}
            {form.labels.map((l) => (
              <Badge key={l} tone="accent">
                {LABELS[l]}
              </Badge>
            ))}
            {p.arrivals.kind ? (
              <Badge tone={p.arrivals.shownOnSite ? "green" : "neutral"}>
                {ARRIVAL_LABELS[p.arrivals.kind]} · из 1С{p.arrivals.shownOnSite ? "" : " (не показана)"}
              </Badge>
            ) : null}
          </div>
        </div>
        <a href={`https://kosmetichka-opt.ru${p.path}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-[#8E1B47] hover:underline">
          Открыть на сайте <ExternalLink className="size-3.5" />
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* ── Основная информация ── */}
          <Card className="p-5">
            <div className="mb-3 font-medium">Основная информация</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Название (из 1С)">
                <Input value={p.name} disabled />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Артикул 1С">
                  <Input value={p.article ?? ""} disabled />
                </Field>
                <Field label="Штрихкод">
                  <Input value={p.barcode || p.barcodes[0]?.barcode || ""} disabled title={p.barcodes.map((b) => b.barcode).join(", ")} />
                </Field>
              </div>
              <Field
                label="Категория"
                hint={
                  p.categoryManual ? (
                    <span>
                      Изменена на сайте (в 1С: {p.category1C ?? "—"}).{" "}
                      <button className="text-[#8E1B47] underline" onClick={() => from1C("categoryFrom1C", `Вернуть категорию из 1С («${p.category1C ?? "—"}»)?`)}>
                        Вернуть из 1С
                      </button>
                    </span>
                  ) : (
                    "Из 1С. Если поменять, обмен с 1С перестанет её менять"
                  )
                }
              >
                <CategorySelect value={form.categoryGuid} onChange={(v) => set({ categoryGuid: v })} />
              </Field>
              <Field
                label="Бренд"
                hint={
                  p.brandManual ? (
                    <span>
                      Изменён на сайте (в 1С: {p.brand1C ?? "—"}).{" "}
                      <button className="text-[#8E1B47] underline" onClick={() => from1C("brandFrom1C", `Вернуть бренд из 1С («${p.brand1C ?? "—"}»)?`)}>
                        Вернуть из 1С
                      </button>
                    </span>
                  ) : (
                    "Из 1С. Если поменять, обмен с 1С перестанет его менять"
                  )
                }
              >
                <Select value={form.brandGuid} onChange={(e) => set({ brandGuid: e.target.value })}>
                  <option value="">— Без бренда —</option>
                  {brands.map((b) => (
                    <option key={b.guid} value={b.guid}>
                      {b.name}
                    </option>
                  ))}
                  {p.brand && !brands.some((b) => b.guid === p.brand!.guid) ? <option value={p.brand.guid}>{p.brand.name}</option> : null}
                </Select>
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-5">
              <Toggle checked={!form.hidden} onChange={(v) => set({ hidden: !v })} label={form.hidden ? "Скрыт с сайта" : "Опубликован на сайте"} />
              {(["new", "hit"] as const).map((l) => (
                <label key={l} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.labels.includes(l)} onChange={(e) => set({ labels: e.target.checked ? [...form.labels, l] : form.labels.filter((x) => x !== l) })} />
                  Метка «{LABELS[l]}»
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              «Новинка» и «Снова в наличии» ставятся сами по приходам из 1С (см. «Поступления из 1С» справа). Ручная метка — дополнительно, держится, пока её не
              снимут.
            </p>
          </Card>

          {/* ── Фотографии ── */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium">Фотографии</span>
              <Btn size="sm" variant="outline" onClick={() => fileRef.current?.click()} loading={uploading}>
                <ImagePlus className="size-4" /> Добавить
              </Btn>
              <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files)} />
              <input ref={replaceRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files, replaceId.current ?? undefined)} />
            </div>
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                if (e.dataTransfer.files?.length) {
                  e.preventDefault();
                  upload(e.dataTransfer.files);
                }
              }}
            >
              {p.images.map((img, i) => (
                <div key={img.id} ref={photoSort.itemRef(i)} className={photoSort.dragging === i ? "opacity-60" : ""}>
                  <div className={`group relative aspect-square overflow-hidden rounded-lg border bg-white ${i === 0 ? "border-[#8E1B47]" : "border-neutral-200"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={form.alts[img.id] || p.name} className="h-full w-full object-contain" />
                    {i === 0 ? <span className="absolute left-1 top-1 rounded bg-[#8E1B47] px-1 text-[10px] text-white">Главное</span> : null}
                    <span className="absolute bottom-1 left-1 rounded bg-white/90 px-1 text-[10px] text-neutral-600">{img.fromAdmin ? "панель" : "1С"}</span>
                    {p.images.length > 1 ? (
                      <span {...photoSort.handleProps(i)} className="absolute bottom-1 right-1 rounded bg-white/90 p-1 shadow" title="Перетащите, чтобы поменять порядок" aria-label="Перетащить">
                        <GripVertical className="size-3.5 text-neutral-600" />
                      </span>
                    ) : null}
                    <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                      {i > 0 ? (
                        <button onClick={() => saveOrder([img, ...p.images.filter((x) => x.id !== img.id)])} className="rounded bg-white/90 p-1 shadow" title="Сделать главным">
                          <Star className="size-3.5" />
                        </button>
                      ) : null}
                      <button
                        onClick={() => {
                          replaceId.current = img.id;
                          replaceRef.current?.click();
                        }}
                        className="rounded bg-white/90 p-1 shadow"
                        title="Заменить файл"
                      >
                        <RefreshCw className="size-3.5" />
                      </button>
                      {img.usedByVariants === 0 ? (
                        <button onClick={() => removeImg(img)} className="rounded bg-white/90 p-1 text-red-600 shadow" title="Убрать">
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <input
                    className="mt-1 w-full rounded border border-neutral-200 px-1.5 py-1 text-xs focus:border-[#8E1B47] focus:outline-none"
                    placeholder={`Alt: ${p.name.slice(0, 40)}…`}
                    value={form.alts[img.id] ?? ""}
                    maxLength={200}
                    onChange={(e) => set({ alts: { ...form.alts, [img.id]: e.target.value } })}
                    aria-label="Alt-текст фото"
                  />
                  {img.original ? (
                    <a href={img.original} target="_blank" rel="noreferrer" className="text-[10px] text-neutral-400 hover:text-[#8E1B47]">
                      исходник
                    </a>
                  ) : null}
                </div>
              ))}
              {p.images.length === 0 ? (
                <button onClick={() => fileRef.current?.click()} className="col-span-full rounded-lg border border-dashed border-neutral-300 py-10 text-sm text-neutral-500">
                  Фото нет. Нажмите или перетащите сюда файлы (JPG, PNG, WebP)
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Перетаскивайте за значок в углу, первое фото — главное. Фото автоматически сжимаются в WebP, исходники сохраняются. Alt-текст — для поисковиков и незрячих (пусто — название товара).
            </p>
          </Card>

          {/* ── Описание ── */}
          <Card className="p-5">
            <div className="mb-3 font-medium">Описание</div>
            <div className="space-y-4">
              <Field label="Краткое описание" hint="1–2 предложения: под названием и в сниппете поиска">
                <Textarea rows={2} value={form.shortDescription} onChange={(e) => set({ shortDescription: e.target.value })} maxLength={1000} />
              </Field>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[13px] font-medium text-neutral-700">Полное описание</span>
                  {p.descriptionManual ? (
                    <button onClick={() => from1C("descriptionFrom1C", "Вернуть описание из 1С? Ваше описание заменится при следующем обмене с 1С.")} className="text-xs text-neutral-500 hover:text-[#8E1B47]">
                      Изменено в панели — 1С не перезаписывает. Вернуть из 1С
                    </button>
                  ) : (
                    <span className="text-xs text-neutral-500">Из 1С. После правки здесь 1С перестанет его менять</span>
                  )}
                </div>
                <Textarea rows={8} value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={20000} placeholder="Можно **жирный** текст и списки через «- »." />
              </div>
              {SECTIONS.filter(([k]) => k !== "shortDescription").map(([k, label, max]) => (
                <Field key={k} label={label}>
                  <Textarea rows={3} value={form[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<Form>)} maxLength={max} />
                </Field>
              ))}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Тип кожи или волос">
                  <Input list="skin-types" value={form.skinType} onChange={(e) => set({ skinType: e.target.value })} maxLength={200} />
                  <datalist id="skin-types">
                    {SKIN.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Страна производства">
                  <Input value={form.country} onChange={(e) => set({ country: e.target.value })} maxLength={100} placeholder="Корея" />
                </Field>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 font-medium">Характеристики</div>
            <div className="space-y-2">
              {form.specs.map((s, k) => (
                <div key={k} className="flex gap-2">
                  <Input className="w-2/5" value={s.name} placeholder="Объём" maxLength={80} onChange={(e) => set({ specs: form.specs.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} />
                  <Input value={s.value} placeholder="250 мл" maxLength={300} onChange={(e) => set({ specs: form.specs.map((x, j) => (j === k ? { ...x, value: e.target.value } : x)) })} />
                  <Btn variant="ghost" size="sm" onClick={() => set({ specs: form.specs.filter((_, j) => j !== k) })} aria-label="Убрать">
                    <Trash2 className="size-4" />
                  </Btn>
                </div>
              ))}
              {form.specs.length < 40 ? (
                <Btn variant="outline" size="sm" onClick={() => set({ specs: [...form.specs, { name: "", value: "" }] })}>
                  <Plus className="size-4" /> Характеристика
                </Btn>
              ) : null}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-1 font-medium">Сопутствующие товары</div>
            <p className="mb-3 text-xs text-neutral-500">Показываются первыми в полосе «С этим берут» под товаром (только в наличии).</p>
            <ProductPicker value={form.relatedIds} onChange={(v) => set({ relatedIds: v })} max={24} exclude={p.id} />
          </Card>

          {/* ── SEO ── */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2 font-medium">
              SEO {p.seoSource === "template" ? <Badge tone="accent">заполнено шаблоном</Badge> : p.seoSource === "manual" ? <Badge>вручную</Badge> : null}
            </div>
            <div className="space-y-3">
              <Field
                label="SEO Title"
                hint={<span className={tIssue ? "text-amber-700" : ""}>{`${form.seoTitle.length}/${SEO_LIMITS.title.max}${tIssue ? ` — ${tIssue}` : ""}. Пусто — название товара.`}</span>}
              >
                <Input value={form.seoTitle} onChange={(e) => set({ seoTitle: e.target.value })} maxLength={120} placeholder={p.name} />
              </Field>
              <Field
                label="Meta Description"
                hint={<span className={dIssue ? "text-amber-700" : ""}>{`${form.seoDescription.length}/${SEO_LIMITS.description.max}${dIssue ? ` — ${dIssue}` : ""}. Пусто — краткое или полное описание.`}</span>}
              >
                <Textarea rows={3} value={form.seoDescription} onChange={(e) => set({ seoDescription: e.target.value })} maxLength={300} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="ЧПУ (адрес страницы)"
                  hint={
                    <span>
                      {shownPath}
                      {!form.slug ? (
                        <>
                          {" "}
                          ·{" "}
                          <button className="text-[#8E1B47] underline" onClick={() => set({ slug: p.suggestedSlug })}>
                            подставить «{p.suggestedSlug.slice(0, 30)}…»
                          </button>
                        </>
                      ) : null}
                    </span>
                  }
                >
                  <Input value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-") })} maxLength={80} placeholder={p.suggestedSlug} />
                </Field>
                <Field label="Canonical URL" hint="Пусто — собственный адрес товара. Укажите, если это дубль другой страницы.">
                  <Input value={form.canonicalUrl} onChange={(e) => set({ canonicalUrl: e.target.value })} maxLength={300} placeholder={`https://kosmetichka-opt.ru${shownPath}`} />
                </Field>
              </div>
              <div className="rounded-lg border border-neutral-200 p-3">
                <div className="mb-1 text-[11px] text-neutral-400">Так страница может выглядеть в поиске</div>
                <div className="text-xs text-emerald-700">kosmetichka-opt.ru › product › {shownPath.split("/").pop()}</div>
                <div className="truncate text-[17px] text-[#1a0dab]">{seoTitle.includes("Косметичка") ? seoTitle : `${seoTitle} | Косметичка`}</div>
                <div className="line-clamp-2 text-[13px] text-neutral-600">{seoDesc}</div>
              </div>
              {form.hidden ? <p className="text-xs text-amber-700">Товар скрыт: страница не открывается и не попадает в карту сайта для поисковиков.</p> : null}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-1.5 font-medium">
              <Lock className="size-4 text-neutral-400" /> Цены и остатки (из 1С)
            </div>
            <dl className="space-y-1.5 text-sm">
              {p.prices.map((pr) => (
                <div key={pr.priceType} className="flex justify-between">
                  <dt className="text-neutral-500">{PRICE_LABELS[pr.priceType] ?? pr.priceType}</dt>
                  <dd className="font-medium tabular-nums">{pr.price.toLocaleString("ru-RU")} ₽</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-neutral-100 pt-1.5">
                <dt className="text-neutral-500">Остаток (сайт)</dt>
                <dd className="tabular-nums">{p.stock ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Доступно оптовикам</dt>
                <dd className="tabular-nums">{p.wholesaleStock}</dd>
              </div>
              {p.warehouses.map((w) => (
                <div key={w.name} className="flex justify-between text-xs">
                  <dt className="text-neutral-500">{w.name}</dt>
                  <dd className="tabular-nums">{w.qty}</dd>
                </div>
              ))}
              {p.barcodes.length > 1 ? (
                <div className="border-t border-neutral-100 pt-1.5 text-xs">
                  <dt className="text-neutral-500">Все штрихкоды</dt>
                  <dd>{p.barcodes.map((b) => b.barcode + (b.unitName ? ` (${b.unitName})` : "")).join(", ")}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-neutral-100 pt-1.5 text-xs">
                <dt className="text-neutral-500">Продано за 90 дней</dt>
                <dd>{p.salesCount}</dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-neutral-500">Обновлён</dt>
                <dd>{fmtDate(p.updatedAt)}</dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-neutral-500">GUID 1С</dt>
                <dd className="max-w-40 truncate" title={p.guid}>
                  {p.guid}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-neutral-500">Название, артикул, штрихкод, цены и остатки меняются только в 1С и приходят с обменом.</p>
          </Card>
          <ArrivalsCard a={p.arrivals} />
          {p.categoryManual || p.brandManual || p.descriptionManual ? (
            <Card className="p-5 text-sm">
              <div className="mb-2 flex items-center gap-1.5 font-medium">
                <RotateCcw className="size-4 text-neutral-400" /> Изменено на сайте
              </div>
              <ul className="list-inside list-disc text-neutral-600">
                {p.categoryManual ? <li>категория</li> : null}
                {p.brandManual ? <li>бренд</li> : null}
                {p.descriptionManual ? <li>полное описание</li> : null}
              </ul>
              <p className="mt-2 text-xs text-neutral-500">Эти поля обмен с 1С не перезаписывает.</p>
            </Card>
          ) : null}
        </div>
      </div>

      <div className={`fixed bottom-0 left-0 right-0 z-20 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur md:left-60 ${dirty ? "" : "hidden"}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2">
          <span className="mr-auto text-sm text-amber-700">Есть несохранённые изменения</span>
          <Btn variant="outline" onClick={() => setForm(JSON.parse(base))} disabled={saving}>
            Отменить
          </Btn>
          <Btn onClick={save} loading={saving}>
            Сохранить
          </Btn>
        </div>
      </div>
    </div>
  );
}
