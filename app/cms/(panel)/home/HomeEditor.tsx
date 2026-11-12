"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, GripVertical, History, Monitor, Plus, Rocket, Save, Smartphone, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { cmsApi, fmtDate } from "@/lib/cms/client";
import {
  BLOCK_LABELS,
  PRODUCT_SOURCES,
  newBlock,
  newBlockId,
  pageContentSchema,
  type BlockType,
  type HomeBlock,
  type PageContent,
} from "@/lib/cms/homeSchema";
import type { ResolvedBlock } from "@/lib/cms/home";
import { Badge, Btn, Field, Input, Select, Textarea, Toggle, useConfirm } from "@/components/cms/ui";
import { ImageUpload } from "@/components/cms/ImageUpload";
import { BannerPicker, CategoryPicker, CategorySelect, ProductPicker } from "@/components/cms/Pickers";
import { HomePreview } from "@/components/cms/HomePreview";
import { useSortable } from "@/components/cms/useSortable";

type Meta = { draftUpdatedAt: string; draftUpdatedBy: string | null; publishedAt: string | null; publishedBy: string | null; canPublish: boolean };
type Version = { id: number; note: string | null; createdBy: string; createdAt: string };

const blockTitle = (b: HomeBlock) => ("title" in b && b.title ? b.title : BLOCK_LABELS[b.type]);

export function HomeEditor({ page = "home" }: { page?: "home" | "catalog" }) {
  const q = page === "home" ? "" : `?page=${page}`;
  const isHome = page === "home";
  const [content, setContent] = useState<PageContent | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [published, setPublished] = useState<string>("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [preview, setPreview] = useState<ResolvedBlock[]>([]);
  const [busy, setBusy] = useState<"" | "save" | "publish">("");
  const [versions, setVersions] = useState<Version[] | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const r = await cmsApi<{ draft: PageContent; published: PageContent | null } & Meta>(`/api/cms/home${q}`);
    setContent(r.draft);
    setSaved(JSON.stringify(r.draft));
    setPublished(r.published ? JSON.stringify(r.published) : "");
    setMeta(r);
    setSelected((s) => s ?? r.draft.blocks[0]?.id ?? null);
  }, [q]);
  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load]);

  const json = content ? JSON.stringify(content) : "";
  const dirty = !!content && json !== saved;
  const unpublished = !!content && saved !== published;
  const validation = useMemo(() => (content ? pageContentSchema.safeParse(content) : null), [content]);

  // предпросмотр с реальными данными (баннеры, категории, товары) — через полсекунды после правки
  useEffect(() => {
    if (!content) return;
    const t = setTimeout(() => {
      cmsApi<{ blocks: ResolvedBlock[] }>(`/api/cms/home/preview${q}`, { body: { blocks: content.blocks.map((b) => ({ ...b, visible: true })) } })
        .then((r) => setPreview(r.blocks))
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [json]); // eslint-disable-line react-hooks/exhaustive-deps

  // не потерять правки при закрытии вкладки
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const update = (id: string, patch: Partial<HomeBlock>) =>
    setContent((c) => (c ? { ...c, blocks: c.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as HomeBlock) : b)) } : c));
  const setBlocks = (blocks: HomeBlock[]) => setContent((c) => (c ? { ...c, blocks } : c));

  const save = useCallback(async () => {
    if (!content) return false;
    const v = pageContentSchema.safeParse(content);
    if (!v.success) {
      toast.error(v.error.issues[0]?.message ?? "Проверьте блоки");
      return false;
    }
    setBusy("save");
    try {
      const r = await cmsApi<{ draftUpdatedAt: string; draftUpdatedBy: string }>(`/api/cms/home${q}`, { method: "PUT", body: { content, baseUpdatedAt: meta?.draftUpdatedAt } });
      setSaved(JSON.stringify(content));
      setMeta((m) => (m ? { ...m, draftUpdatedAt: r.draftUpdatedAt, draftUpdatedBy: r.draftUpdatedBy } : m));
      toast.success("Черновик сохранён. На сайте ничего не изменилось — нажмите «Опубликовать».");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
      return false;
    } finally {
      setBusy("");
    }
  }, [content, meta?.draftUpdatedAt]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [save]);

  const publish = async () => {
    if (dirty && !(await save())) return;
    if (!(await confirm(isHome ? "Опубликовать главную?\nСайт и приложения покажут её в течение минуты." : "Опубликовать блоки каталога?\nСайт и приложения покажут их в течение минуты.", false))) return;
    setBusy("publish");
    try {
      const r = await cmsApi<{ publishedAt: string; publishedBy: string }>(`/api/cms/home/publish${q}`, { body: {} });
      setPublished(JSON.stringify(content));
      setMeta((m) => (m ? { ...m, publishedAt: r.publishedAt, publishedBy: r.publishedBy } : m));
      toast.success(isHome ? "Главная опубликована" : "Блоки каталога опубликованы");
      if (versions) openHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy("");
    }
  };

  const openHistory = async () => {
    try {
      setVersions((await cmsApi<{ versions: Version[] }>(`/api/cms/home/versions${q}`)).versions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const applyVersion = async (v: Version, action: "draft" | "publish") => {
    const text =
      action === "publish"
        ? `Откатить сайт на версию от ${fmtDate(v.createdAt)}?\nОна сразу станет опубликованной.`
        : `Открыть версию от ${fmtDate(v.createdAt)} в черновике?${dirty ? "\nНесохранённые правки пропадут." : ""}`;
    if (!(await confirm(text, action === "publish"))) return;
    try {
      await cmsApi(`/api/cms/home/versions/${v.id}${q}`, { body: { action } });
      await load();
      toast.success(action === "publish" ? "Сайт откатили на выбранную версию" : "Версия открыта в черновике");
      openHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const discard = async () => {
    if (!(await confirm("Отменить несохранённые правки?"))) return;
    setContent(JSON.parse(saved));
  };

  const addBlock = (type: BlockType) => {
    if (!content) return;
    const b = newBlock(type);
    const i = selected ? content.blocks.findIndex((x) => x.id === selected) : -1;
    const blocks = [...content.blocks];
    blocks.splice(i >= 0 ? i + 1 : blocks.length, 0, b);
    setBlocks(blocks);
    setSelected(b.id);
  };

  const removeBlock = async (b: HomeBlock) => {
    if (!content || !(await confirm(`Удалить блок «${blockTitle(b)}»?\nДо сохранения черновика правку можно отменить.`))) return;
    setBlocks(content.blocks.filter((x) => x.id !== b.id));
    if (selected === b.id) setSelected(null);
  };

  const duplicate = (b: HomeBlock) => {
    if (!content) return;
    const copy = { ...structuredClone(b), id: newBlockId() } as HomeBlock;
    const i = content.blocks.findIndex((x) => x.id === b.id);
    const blocks = [...content.blocks];
    blocks.splice(i + 1, 0, copy);
    setBlocks(blocks);
    setSelected(copy.id);
  };

  const move = (id: string, to: number) => {
    if (!content) return;
    const from = content.blocks.findIndex((b) => b.id === id);
    if (from < 0 || to < 0 || to >= content.blocks.length || from === to) return;
    const blocks = [...content.blocks];
    const [x] = blocks.splice(from, 1);
    blocks.splice(to, 0, x);
    setBlocks(blocks);
  };

  const sortable = useSortable((from, to) => {
    if (!content) return;
    const id = content.blocks[from]?.id;
    if (id) move(id, to);
  });

  if (!content || !meta) return <div className="text-sm text-neutral-500">Загрузка…</div>;
  const cur = content.blocks.find((b) => b.id === selected) ?? null;
  const hiddenIds = new Set(content.blocks.filter((b) => !b.visible).map((b) => b.id));
  const order = new Map(content.blocks.map((b, i) => [b.id, i]));
  const shown = [...preview].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).filter((b) => order.has(b.id));

  return (
    <div className="-mx-4 -mb-5 -mt-16 flex h-[calc(100vh)] flex-col md:-mx-8 md:-my-7">
      {dialog}
      {/* панель действий */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-4 py-3 pl-14 md:pl-4">
        <h1 className="mr-2 text-lg font-semibold">{isHome ? "Главная страница" : "Каталог: блоки над товарами"}</h1>
        {dirty ? <Badge tone="amber">Есть несохранённые правки</Badge> : unpublished ? <Badge tone="accent">Черновик не опубликован</Badge> : <Badge tone="green">Опубликовано</Badge>}
        <span className="hidden text-xs text-neutral-500 lg:inline">
          На сайте: {meta.publishedAt ? `${fmtDate(meta.publishedAt)}, ${meta.publishedBy}` : isHome ? "прежняя главная (ещё не публиковали)" : "ничего (ещё не публиковали)"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-neutral-200 p-0.5">
            <button onClick={() => setDevice("desktop")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-sm", device === "desktop" ? "bg-[#FBEFF3] text-[#8E1B47]" : "text-neutral-600")}>
              <Monitor className="size-4" /> Компьютер
            </button>
            <button onClick={() => setDevice("mobile")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-sm", device === "mobile" ? "bg-[#FBEFF3] text-[#8E1B47]" : "text-neutral-600")}>
              <Smartphone className="size-4" /> Телефон
            </button>
          </div>
          <Btn variant="outline" size="sm" onClick={() => (versions ? setVersions(null) : openHistory())}>
            <History className="size-4" /> История
          </Btn>
          {dirty ? (
            <Btn variant="ghost" size="sm" onClick={discard}>
              Отменить правки
            </Btn>
          ) : null}
          <Btn variant="outline" size="sm" onClick={save} loading={busy === "save"} disabled={!dirty}>
            <Save className="size-4" /> Сохранить черновик
          </Btn>
          {meta.canPublish ? (
            <Btn size="sm" onClick={publish} loading={busy === "publish"} disabled={!dirty && !unpublished}>
              <Rocket className="size-4" /> Опубликовать
            </Btn>
          ) : (
            <span className="text-xs text-neutral-500">Публикует администратор</span>
          )}
        </div>
      </div>
      {validation && !validation.success ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{validation.error.issues[0]?.message}</div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-auto md:flex-row md:overflow-hidden">
        {/* слева: блоки и настройки выбранного */}
        <div className="w-full shrink-0 border-b border-neutral-200 bg-white md:w-[360px] md:overflow-auto md:border-b-0 md:border-r">
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-700">Блоки страницы</span>
              <Select className="h-8 w-auto py-0 text-[13px]" value="" onChange={(e) => e.target.value && addBlock(e.target.value as BlockType)}>
                <option value="">+ Добавить блок</option>
                {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => (
                  <option key={t} value={t}>
                    {BLOCK_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
            <ul className="space-y-1">
              {content.blocks.map((b, i) => (
                <li
                  key={b.id}
                  ref={sortable.itemRef(i)}
                  onClick={() => setSelected(b.id)}
                  className={cn(
                    "group flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-sm",
                    selected === b.id ? "border-[#8E1B47]/50 bg-[#FBEFF3]" : "border-transparent hover:bg-neutral-50",
                    sortable.dragging === i && "opacity-60 shadow-md"
                  )}
                >
                  <span {...sortable.handleProps(i)} className="-m-1 p-1" title="Перетащите, чтобы поменять порядок" aria-label="Перетащить">
                    <GripVertical className="size-4 shrink-0 text-neutral-400" />
                  </span>
                  <span className={cn("min-w-0 flex-1", !b.visible && "text-neutral-400 line-through")}>
                    <span className="block truncate font-medium">{blockTitle(b)}</span>
                    <span className="block truncate text-[11px] text-neutral-500">{BLOCK_LABELS[b.type]}</span>
                  </span>
                  <span className="flex opacity-60 group-hover:opacity-100">
                    <button onClick={(e) => (e.stopPropagation(), move(b.id, i - 1))} disabled={i === 0} className="p-1 disabled:opacity-30" aria-label="Выше">
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button onClick={(e) => (e.stopPropagation(), move(b.id, i + 1))} disabled={i === content.blocks.length - 1} className="p-1 disabled:opacity-30" aria-label="Ниже">
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button onClick={(e) => (e.stopPropagation(), update(b.id, { visible: !b.visible }))} className="p-1" aria-label={b.visible ? "Скрыть" : "Показать"} title={b.visible ? "Скрыть блок" : "Показать блок"}>
                      {b.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            {content.blocks.length === 0 ? <div className="py-6 text-center text-sm text-neutral-500">Добавьте первый блок</div> : null}
          </div>

          {cur ? (
            <div className="border-t border-neutral-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-medium">{BLOCK_LABELS[cur.type]}</span>
                <span className="flex gap-1">
                  <Btn variant="ghost" size="sm" onClick={() => duplicate(cur)} title="Копия блока">
                    <Copy className="size-4" />
                  </Btn>
                  <Btn variant="ghost" size="sm" onClick={() => removeBlock(cur)} title="Удалить блок">
                    <Trash2 className="size-4 text-red-600" />
                  </Btn>
                </span>
              </div>
              <BlockSettings b={cur} onChange={(p) => update(cur.id, p)} />
            </div>
          ) : null}
        </div>

        {/* по центру: предпросмотр */}
        <div className="min-w-0 flex-1 bg-neutral-100 p-4 md:overflow-auto md:p-6">
          <HomePreview
            blocks={shown}
            device={device}
            selectedId={selected}
            hiddenIds={hiddenIds}
            onSelect={setSelected}
            onEdit={(id, field, value) => update(id, { [field]: value } as Partial<HomeBlock>)}
          />
          <p className="mt-3 text-center text-xs text-neutral-500">
            Предпросмотр: тексты меняются по клику прямо здесь. Шапка и поиск сайта — для ориентира. Скрытые блоки — полупрозрачные.
          </p>
        </div>

        {versions ? (
          <div className="w-72 shrink-0 overflow-auto border-l border-neutral-200 bg-white p-4">
            <div className="mb-3 font-medium">История публикаций</div>
            {versions.length === 0 ? <div className="text-sm text-neutral-500">Ещё ничего не публиковали</div> : null}
            <ul className="space-y-2">
              {versions.map((v, k) => (
                <li key={v.id} className="rounded-lg border border-neutral-200 p-2.5 text-sm">
                  <div className="font-medium">
                    {fmtDate(v.createdAt)} {k === 0 ? <Badge tone="green">на сайте</Badge> : null}
                  </div>
                  <div className="text-xs text-neutral-500">{v.createdBy}</div>
                  {v.note ? <div className="mt-1 text-xs text-neutral-600">{v.note}</div> : null}
                  <div className="mt-2 flex gap-1.5">
                    <Btn variant="outline" size="sm" onClick={() => applyVersion(v, "draft")}>
                      В черновик
                    </Btn>
                    {meta.canPublish && k > 0 ? (
                      <Btn variant="danger" size="sm" onClick={() => applyVersion(v, "publish")}>
                        Откатить
                      </Btn>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BlockSettings({ b, onChange }: { b: HomeBlock; onChange: (p: Partial<HomeBlock>) => void }) {
  return (
    <div className="space-y-4" key={b.id}>
      <Toggle checked={b.visible} onChange={(v) => onChange({ visible: v })} label="Показывать на сайте" />

      {b.type === "hero" ? (
        <>
          <Field label="Баннеры слайдера" hint="Порядок — как в списке. Выключенные и вне дат показа на сайте не видны.">
            <BannerPicker value={b.bannerIds} onChange={(v) => onChange({ bannerIds: v })} />
          </Field>
          <Field label="Смена слайда, секунд">
            <Input type="number" min={2} max={30} value={b.intervalSec} onChange={(e) => onChange({ intervalSec: Math.min(30, Math.max(2, Number(e.target.value) || 6)) })} />
          </Field>
          <a href="/banners" className="inline-block text-sm text-[#8E1B47] hover:underline">
            Создать или изменить баннеры →
          </a>
        </>
      ) : null}

      {b.type === "categories" ? (
        <>
          <Field label="Заголовок">
            <Input value={b.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Категории" hint="Пусто — основные категории каталога автоматически.">
            <CategoryPicker value={b.categoryGuids} onChange={(v) => onChange({ categoryGuids: v })} />
          </Field>
          <Field label="Сколько показывать">
            <Input type="number" min={1} max={24} value={b.limit} onChange={(e) => onChange({ limit: Math.min(24, Math.max(1, Number(e.target.value) || 12)) })} />
          </Field>
        </>
      ) : null}

      {b.type === "products" ? (
        <>
          <Field label="Заголовок">
            <Input value={b.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Какие товары">
            <Select value={b.source} onChange={(e) => onChange({ source: e.target.value as typeof b.source })}>
              {(Object.keys(PRODUCT_SOURCES) as (keyof typeof PRODUCT_SOURCES)[]).map((k) => (
                <option key={k} value={k}>
                  {PRODUCT_SOURCES[k]}
                </option>
              ))}
            </Select>
          </Field>
          {b.source === "category" ? (
            <Field label="Категория">
              <CategorySelect value={b.categoryGuid} onChange={(v) => onChange({ categoryGuid: v || undefined })} />
            </Field>
          ) : null}
          {b.source === "manual" ? (
            <Field label="Товары" hint="Скрытые и закончившиеся на сайте не показываются.">
              <ProductPicker value={b.productIds} onChange={(v) => onChange({ productIds: v })} />
            </Field>
          ) : b.source === "new" || b.source === "back" ? (
            <p className="text-xs text-neutral-500">
              По приходам из 1С, свежие первыми; сколько дней держатся «Новинка» и «Снова в наличии» — в разделе «Настройки». Каждый покупатель видит то, что может купить: розница — пришедшее в магазин, опт — на склад и в
              магазин. Только с фото и в наличии, обновляются сами.
            </p>
          ) : (
            <p className="text-xs text-neutral-500">Только товары в наличии, обновляются сами.</p>
          )}
          <Field label="Сколько показывать">
            <Input type="number" min={2} max={24} value={b.limit} onChange={(e) => onChange({ limit: Math.min(24, Math.max(2, Number(e.target.value) || 12)) })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Текст ссылки «Все»">
              <Input value={b.moreText} onChange={(e) => onChange({ moreText: e.target.value })} maxLength={40} />
            </Field>
            <Field label="Куда ведёт">
              <Input value={b.moreLink} onChange={(e) => onChange({ moreLink: e.target.value })} placeholder="/catalog?quick=new" />
            </Field>
          </div>
        </>
      ) : null}

      {b.type === "info" ? (
        <>
          <Field label="Заголовок">
            <Input value={b.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Текст">
            <Textarea value={b.text} onChange={(e) => onChange({ text: e.target.value })} maxLength={2000} rows={5} />
          </Field>
          <ImageUpload label="Картинка (необязательно)" folder="pages" aspect="aspect-[16/9]" value={b.image || null} onChange={(v) => onChange({ image: v ?? "" })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Текст кнопки">
              <Input value={b.buttonText} onChange={(e) => onChange({ buttonText: e.target.value })} maxLength={40} />
            </Field>
            <Field label="Ссылка кнопки">
              <Input value={b.link} onChange={(e) => onChange({ link: e.target.value })} placeholder="/contacts" />
            </Field>
          </div>
          <Field label="Оформление">
            <Select value={b.tone} onChange={(e) => onChange({ tone: e.target.value as "light" | "accent" })}>
              <option value="light">Светлое</option>
              <option value="accent">Яркое (фирменный градиент)</option>
            </Select>
          </Field>
        </>
      ) : null}

      {b.type === "buttons" ? (
        <>
          <Field label="Заголовок (необязательно)">
            <Input value={b.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={120} />
          </Field>
          <div className="space-y-2">
            <div className="text-[13px] font-medium text-neutral-700">Кнопки</div>
            {b.items.map((it, k) => (
              <div key={k} className="flex gap-1.5">
                <Input value={it.label} placeholder="Текст" maxLength={60} onChange={(e) => onChange({ items: b.items.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)) })} />
                <Input value={it.link} placeholder="/catalog" onChange={(e) => onChange({ items: b.items.map((x, j) => (j === k ? { ...x, link: e.target.value } : x)) })} />
                <Btn variant="ghost" size="sm" disabled={b.items.length < 2} onClick={() => onChange({ items: b.items.filter((_, j) => j !== k) })} aria-label="Убрать">
                  <Trash2 className="size-4" />
                </Btn>
              </div>
            ))}
            {b.items.length < 8 ? (
              <Btn variant="outline" size="sm" onClick={() => onChange({ items: [...b.items, { label: "Кнопка", link: "/catalog" }] })}>
                <Plus className="size-4" /> Кнопка
              </Btn>
            ) : null}
          </div>
        </>
      ) : null}

      <p className="text-xs text-neutral-500">Ссылки: страница сайта начинается с «/» (например, /catalog?quick=sale или /product/123), внешний адрес — с https://</p>
    </div>
  );
}
