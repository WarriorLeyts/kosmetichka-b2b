"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, ImagePlus, Lock, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cmsApi, fmtDate } from "@/lib/cms/client";
import { PRICE_LABELS } from "@/lib/cms/productSchema";
import { Badge, Btn, Card, Field, Input, Textarea, Toggle, useConfirm } from "@/components/cms/ui";
import { ProductPicker } from "@/components/cms/Pickers";

type Img = { id: number; path: string; url: string; full: string; fromAdmin: boolean; usedByVariants: number };
type Product = {
  id: number;
  guid: string;
  article: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  descriptionManual: boolean;
  specs: { name: string; value: string }[];
  seoTitle: string | null;
  seoDescription: string | null;
  hidden: boolean;
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

type Form = { description: string; specs: { name: string; value: string }[]; seoTitle: string; seoDescription: string; hidden: boolean; relatedIds: number[] };
const toForm = (p: Product): Form => ({
  description: p.description ?? "",
  specs: p.specs,
  seoTitle: p.seoTitle ?? "",
  seoDescription: p.seoDescription ?? "",
  hidden: p.hidden,
  relatedIds: p.related.map((r) => r.id),
});

export function ProductEditor({ id }: { id: number }) {
  const [p, setP] = useState<Product | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [base, setBase] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragImg, setDragImg] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
    if (form.description !== b.description) patch.description = form.description || null;
    if (JSON.stringify(form.specs) !== JSON.stringify(b.specs)) patch.specs = form.specs.filter((s) => s.name.trim() || s.value.trim());
    if (form.seoTitle !== b.seoTitle) patch.seoTitle = form.seoTitle || null;
    if (form.seoDescription !== b.seoDescription) patch.seoDescription = form.seoDescription || null;
    if (form.hidden !== b.hidden) patch.hidden = form.hidden;
    if (JSON.stringify(form.relatedIds) !== JSON.stringify(b.relatedIds)) patch.relatedIds = form.relatedIds;
    if (patch.hidden === true && !(await confirm("Скрыть товар с сайта? Покупатели перестанут его видеть в каталоге и поиске."))) return;
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

  const backTo1C = async () => {
    if (!p || !(await confirm("Вернуть описание из 1С? Ваше описание заменится при следующем обмене с 1С."))) return;
    await cmsApi(`/api/cms/products/${p.id}`, { method: "PATCH", body: { descriptionFrom1C: true } }).catch((e) => toast.error(e.message));
    toast.success("Описание снова приходит из 1С");
    load();
  };

  const upload = async (files: FileList | File[] | null) => {
    if (!p || !files || !files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      const r = await cmsApi<{ added: number }>(`/api/cms/products/${p.id}/photos`, { form: fd });
      toast.success(`Добавлено фото: ${r.added}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
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

  if (!p || !form) return <div className="text-sm text-neutral-500">Загрузка…</div>;
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const seoTitle = form.seoTitle || p.name;
  const seoDesc = form.seoDescription || (form.description || `Купить ${p.name} оптом в магазине Косметичка. Выгодные цены.`).replace(/[*_`#>~]+/g, "").replace(/\s+/g, " ").slice(0, 160);

  return (
    <div className="max-w-6xl pb-20">
      {dialog}
      <Link href="/products" className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-[#8E1B47]">
        <ArrowLeft className="size-4" /> Все товары
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{p.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
            <span>Арт. {p.article ?? "—"}</span>
            {p.brand ? <span>· {p.brand}</span> : null}
            {p.category ? <span>· {p.category}</span> : null}
            {p.hidden ? <Badge tone="red">Скрыт с сайта</Badge> : null}
          </div>
        </div>
        <a href={`https://kosmetichka-opt.ru/product/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-[#8E1B47] hover:underline">
          Открыть на сайте <ExternalLink className="size-3.5" />
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium">Фотографии</span>
              <Btn size="sm" variant="outline" onClick={() => fileRef.current?.click()} loading={uploading}>
                <ImagePlus className="size-4" /> Добавить
              </Btn>
              <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files)} />
            </div>
            <div
              className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                if (e.dataTransfer.files?.length) {
                  e.preventDefault();
                  upload(e.dataTransfer.files);
                }
              }}
            >
              {p.images.map((img, i) => (
                <div
                  key={img.id}
                  draggable
                  onDragStart={() => setDragImg(img.id)}
                  onDragEnd={() => setDragImg(null)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragImg == null || dragImg === img.id) return;
                    const from = p.images.findIndex((x) => x.id === dragImg);
                    const next = [...p.images];
                    const [x] = next.splice(from, 1);
                    next.splice(i, 0, x);
                    setP({ ...p, images: next });
                  }}
                  onDrop={(e) => {
                    if (dragImg != null) {
                      e.preventDefault();
                      e.stopPropagation();
                      saveOrder(p.images);
                    }
                  }}
                  className={`group relative aspect-square cursor-grab overflow-hidden rounded-lg border bg-white ${i === 0 ? "border-[#8E1B47]" : "border-neutral-200"} ${dragImg === img.id ? "opacity-40" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="h-full w-full object-contain" />
                  {i === 0 ? <span className="absolute left-1 top-1 rounded bg-[#8E1B47] px-1 text-[10px] text-white">Главное</span> : null}
                  <span className="absolute bottom-1 left-1 rounded bg-white/90 px-1 text-[10px] text-neutral-600">{img.fromAdmin ? "панель" : "1С"}</span>
                  <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                    {i > 0 ? (
                      <button onClick={() => saveOrder([img, ...p.images.filter((x) => x.id !== img.id)])} className="rounded bg-white/90 p-1 shadow" title="Сделать главным">
                        <Star className="size-3.5" />
                      </button>
                    ) : null}
                    {img.usedByVariants === 0 ? (
                      <button onClick={() => removeImg(img)} className="rounded bg-white/90 p-1 text-red-600 shadow" title="Убрать">
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              {p.images.length === 0 ? (
                <button onClick={() => fileRef.current?.click()} className="col-span-full rounded-lg border border-dashed border-neutral-300 py-10 text-sm text-neutral-500">
                  Фото нет. Нажмите или перетащите сюда файлы (JPG, PNG, WebP)
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-neutral-500">Перетаскивайте фото, чтобы поменять порядок. Первое — главное (в каталоге). Фото из панели обмен с 1С не стирает.</p>
          </Card>

          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">Описание</span>
              {p.descriptionManual ? (
                <button onClick={backTo1C} className="text-xs text-neutral-500 hover:text-[#8E1B47]">
                  Изменено в панели — 1С его не перезаписывает. Вернуть из 1С
                </button>
              ) : (
                <span className="text-xs text-neutral-500">Из 1С. После правки здесь 1С перестанет его менять</span>
              )}
            </div>
            <Textarea rows={10} value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={20000} placeholder="Описание товара. Можно **жирный** текст и списки через «- »." />
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

          <Card className="p-5">
            <div className="mb-3 font-medium">SEO</div>
            <div className="space-y-3">
              <Field label="Заголовок страницы (title)" hint={`${form.seoTitle.length}/120. Пусто — название товара.`}>
                <Input value={form.seoTitle} onChange={(e) => set({ seoTitle: e.target.value })} maxLength={120} placeholder={p.name} />
              </Field>
              <Field label="Описание для поисковиков (description)" hint={`${form.seoDescription.length}/300. Пусто — начало описания товара.`}>
                <Textarea rows={3} value={form.seoDescription} onChange={(e) => set({ seoDescription: e.target.value })} maxLength={300} />
              </Field>
              <div className="rounded-lg border border-neutral-200 p-3">
                <div className="text-xs text-emerald-700">kosmetichka-opt.ru › product › {p.id}</div>
                <div className="truncate text-[17px] text-[#1a0dab]">{seoTitle} | Косметичка</div>
                <div className="line-clamp-2 text-[13px] text-neutral-600">{seoDesc}</div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 font-medium">Видимость</div>
            <Toggle checked={!form.hidden} onChange={(v) => set({ hidden: !v })} label={form.hidden ? "Скрыт с сайта" : "Показывается на сайте"} />
            <p className="mt-2 text-xs text-neutral-500">Скрытый товар не виден в каталоге, поиске, подборках и по прямой ссылке. В 1С и в заказах ничего не меняется.</p>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-1.5 font-medium">
              <Lock className="size-4 text-neutral-400" /> Из 1С (только просмотр)
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
              <div className="flex justify-between border-t border-neutral-100 pt-1.5 text-xs">
                <dt className="text-neutral-500">Штрихкод</dt>
                <dd>{p.barcode || "—"}</dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-neutral-500">Продано за 90 дней</dt>
                <dd>{p.salesCount}</dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-neutral-500">Обновлён</dt>
                <dd>{fmtDate(p.updatedAt)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-neutral-500">Цены и остатки меняются только в 1С и приходят с обменом.</p>
          </Card>
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
