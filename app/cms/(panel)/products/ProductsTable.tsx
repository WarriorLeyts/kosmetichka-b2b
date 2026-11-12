"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Download, History, ImageOff, Layers, Upload } from "lucide-react";
import { toast } from "sonner";
import { cmsApi, fmtDate } from "@/lib/cms/client";
import { Badge, Btn, Card, Input, PageHeader, Select } from "@/components/cms/ui";
import { useCategories } from "@/components/cms/Pickers";
import { BulkDialog, OperationsDrawer, useBrands, type BulkTarget } from "@/components/cms/BulkDialog";

type Row = {
  id: number;
  article: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  stock: number | null;
  hidden: boolean;
  labels: string[];
  salesCount: number;
  updatedAt: string;
  hasDescription: boolean;
  hasShort: boolean;
  seo: "full" | "template" | "partial" | "none";
  overridden: boolean;
  photos: number;
  image: string | null;
  retail: number | null;
};

type FilterKey = "search" | "category" | "brand" | "stock" | "photo" | "desc" | "seo" | "status" | "label" | "sort" | "dir" | "page" | "limit";
const FILTERS: FilterKey[] = ["search", "category", "brand", "stock", "photo", "desc", "seo", "status", "label"];

const SEO_BADGE: Record<Row["seo"], [string, "green" | "accent" | "amber" | "neutral"]> = {
  full: ["SEO ✓", "green"],
  template: ["SEO шаблон", "accent"],
  partial: ["SEO частично", "amber"],
  none: ["Нет SEO", "neutral"],
};

export function ProductsTable() {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: FilterKey) => sp.get(k) ?? "";
  const [search, setSearch] = useState(get("search"));
  const [data, setData] = useState<{ items: Row[]; total: number; page: number; limit: number } | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [allByFilter, setAllByFilter] = useState(false);
  const [bulk, setBulk] = useState<BulkTarget | null>(null);
  const [opsOpen, setOpsOpen] = useState(false);
  const cats = useCategories();
  const brands = useBrands();

  const filterQs = () => {
    const f = new URLSearchParams();
    for (const k of FILTERS) if (sp.get(k)) f.set(k, sp.get(k)!);
    return f.toString();
  };

  const setParam = useCallback(
    (patch: Partial<Record<FilterKey, string>>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in patch)) next.delete("page");
      if (Object.keys(patch).some((k) => FILTERS.includes(k as FilterKey))) {
        setSel(new Set());
        setAllByFilter(false);
      }
      router.replace("?" + next.toString(), { scroll: false });
    },
    [router, sp]
  );

  const qs = sp.toString();
  const load = useCallback(async () => {
    try {
      setData(await cmsApi(`/api/cms/products?${qs}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  }, [qs]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => search !== get("search") && setParam({ search }), 400);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortBy = (k: string) => setParam({ sort: k, dir: get("sort") === k && get("dir") !== "asc" ? "asc" : "desc" });
  const sortIcon = (k: string) =>
    get("sort") === k || (!get("sort") && k === "updated") ? get("dir") === "asc" ? <ArrowUp className="inline size-3" /> : <ArrowDown className="inline size-3" /> : null;

  const root = cats.find((c) => c.name.toLowerCase() === "каталог");
  const top = cats.filter((c) => c !== root && (root ? c.parentGuid === root.guid : !c.parentGuid)).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const page = data?.page ?? 1;
  const allOnPage = !!data?.items.length && data.items.every((r) => sel.has(r.id));
  const selCount = allByFilter ? data?.total ?? 0 : sel.size;
  const target = (): BulkTarget => (allByFilter ? { filter: filterQs(), count: data?.total ?? 0 } : { ids: [...sel] });
  const exportUrl = () => `/api/cms/products/export?${allByFilter || !sel.size ? filterQs() : "ids=" + [...sel].join(",")}`;
  const anyFilter = FILTERS.some((k) => sp.get(k));

  return (
    <div className="max-w-[1500px]">
      <PageHeader
        title="Товары"
        subtitle="Название, артикул, штрихкод, цены и остатки приходят из 1С и здесь не меняются. В панели — фото, описания, SEO, метки, видимость."
        actions={
          <>
            <Btn variant="outline" onClick={() => setOpsOpen(true)}>
              <History className="size-4" /> История операций
            </Btn>
            <a href={exportUrl()}>
              <Btn variant="outline">
                <Download className="size-4" /> Excel{sel.size || allByFilter ? ` (${selCount.toLocaleString("ru-RU")})` : anyFilter ? " (по фильтру)" : ""}
              </Btn>
            </a>
            <Link href="/products/images">
              <Btn variant="outline">
                <Upload className="size-4" /> Загрузка фото
              </Btn>
            </Link>
          </>
        }
      />

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-64 flex-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск: название, бренд, артикул, штрихкод" />
          <Select className="w-auto" value={get("category")} onChange={(e) => setParam({ category: e.target.value })}>
            <option value="">Все категории</option>
            {top.map((c) => (
              <option key={c.guid} value={c.guid}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select className="w-44" value={get("brand")} onChange={(e) => setParam({ brand: e.target.value })}>
            <option value="">Все бренды</option>
            <option value="none">— Без бренда —</option>
            {brands.map((b) => (
              <option key={b.guid} value={b.guid}>
                {b.name} ({b.count})
              </option>
            ))}
          </Select>
          <Select className="w-auto" value={get("status")} onChange={(e) => setParam({ status: e.target.value })}>
            <option value="">Опубликованные и скрытые</option>
            <option value="visible">Опубликованные</option>
            <option value="hidden">Скрытые</option>
          </Select>
          <Select className="w-auto" value={get("stock")} onChange={(e) => setParam({ stock: e.target.value })}>
            <option value="">Любой остаток</option>
            <option value="in">В наличии</option>
            <option value="out">Нет в наличии</option>
          </Select>
          <Select className="w-auto" value={get("photo")} onChange={(e) => setParam({ photo: e.target.value })}>
            <option value="">Фото: все</option>
            <option value="none">Без фото</option>
            <option value="has">С фото</option>
          </Select>
          <Select className="w-auto" value={get("desc")} onChange={(e) => setParam({ desc: e.target.value })}>
            <option value="">Описание: все</option>
            <option value="none">Без описания</option>
          </Select>
          <Select className="w-auto" value={get("seo")} onChange={(e) => setParam({ seo: e.target.value })}>
            <option value="">SEO: все</option>
            <option value="none">Без SEO</option>
            <option value="template">SEO по шаблону</option>
            <option value="manual">SEO вручную</option>
          </Select>
          <Select className="w-auto" value={get("label")} onChange={(e) => setParam({ label: e.target.value })}>
            <option value="">Метки: все</option>
            <option value="new">«Новинка»</option>
            <option value="hit">«Хит»</option>
          </Select>
          {anyFilter ? (
            <Btn
              variant="ghost"
              onClick={() => {
                setSearch("");
                setParam(Object.fromEntries(FILTERS.map((k) => [k, ""])));
              }}
            >
              Сбросить
            </Btn>
          ) : null}
        </div>
      </Card>

      {sel.size || allByFilter ? (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#8E1B47]/30 bg-[#FBEFF3] px-3 py-2 text-sm">
          <span>
            Выбрано: <b>{selCount.toLocaleString("ru-RU")}</b>
            {allByFilter ? " (все по фильтру)" : ""}
          </span>
          {!allByFilter && allOnPage && data && data.total > data.items.length ? (
            <button className="text-[#8E1B47] underline" onClick={() => setAllByFilter(true)}>
              Выбрать все {data.total.toLocaleString("ru-RU")} по фильтру
            </button>
          ) : null}
          <Btn size="sm" onClick={() => setBulk(target())}>
            <Layers className="size-4" /> Изменить выбранные…
          </Btn>
          <button
            className="ml-auto text-neutral-600"
            onClick={() => {
              setSel(new Set());
              setAllByFilter(false);
            }}
          >
            Снять выбор
          </button>
        </div>
      ) : null}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-600">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allOnPage || allByFilter}
                  onChange={() => {
                    setAllByFilter(false);
                    setSel(allOnPage ? new Set() : new Set(data?.items.map((r) => r.id)));
                  }}
                  aria-label="Выбрать все на странице"
                />
              </th>
              <th className="w-14 px-2 py-2">Фото</th>
              <th className="cursor-pointer px-2 py-2" onClick={() => sortBy("name")}>
                Наименование {sortIcon("name")}
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => sortBy("article")}>
                Артикул 1С {sortIcon("article")}
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => sortBy("barcode")}>
                Штрихкод {sortIcon("barcode")}
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => sortBy("brand")}>
                Бренд {sortIcon("brand")}
              </th>
              <th className="px-2 py-2">Категория</th>
              <th className="px-2 py-2 text-right">Цена</th>
              <th className="cursor-pointer px-2 py-2 text-right" onClick={() => sortBy("stock")}>
                Остаток {sortIcon("stock")}
              </th>
              <th className="px-2 py-2">Публикация</th>
              <th className="px-2 py-2">Описание и SEO</th>
              <th className="cursor-pointer px-2 py-2" onClick={() => sortBy("updated")}>
                Изменён {sortIcon("updated")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {!data ? (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-neutral-500">
                  Загрузка…
                </td>
              </tr>
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-neutral-500">
                  Ничего не найдено
                </td>
              </tr>
            ) : (
              data.items.map((r) => (
                <tr key={r.id} className={`hover:bg-neutral-50 ${sel.has(r.id) || allByFilter ? "bg-[#FBEFF3]/50" : ""}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allByFilter || sel.has(r.id)}
                      onChange={() => {
                        if (allByFilter) {
                          setAllByFilter(false);
                          setSel(new Set(data.items.map((x) => x.id).filter((x) => x !== r.id)));
                          return;
                        }
                        const n = new Set(sel);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        setSel(n);
                      }}
                      aria-label="Выбрать"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt="" className="size-10 rounded-md border border-neutral-100 object-contain" loading="lazy" />
                    ) : (
                      <span className="flex size-10 items-center justify-center rounded-md bg-neutral-100" title="Нет фото">
                        <ImageOff className="size-4 text-neutral-400" />
                      </span>
                    )}
                  </td>
                  <td className="max-w-sm px-2 py-2">
                    <Link href={`/products/${r.id}`} className="line-clamp-2 font-medium text-neutral-900 hover:text-[#8E1B47]">
                      {r.name}
                    </Link>
                    <div className="mt-0.5 flex gap-1">
                      {r.labels.includes("new") ? <Badge tone="accent">Новинка</Badge> : null}
                      {r.labels.includes("hit") ? <Badge tone="accent">Хит</Badge> : null}
                      {r.overridden ? <Badge tone="amber">изменено на сайте</Badge> : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-neutral-600">{r.article ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs text-neutral-500">{r.barcode ?? "—"}</td>
                  <td className="max-w-32 truncate px-2 py-2 text-neutral-600">{r.brand ?? "—"}</td>
                  <td className="max-w-40 truncate px-2 py-2 text-neutral-600">{r.category ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{r.retail != null ? `${r.retail.toLocaleString("ru-RU")} ₽` : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.stock ?? 0}</td>
                  <td className="px-2 py-2">{r.hidden ? <Badge tone="red">Скрыт</Badge> : <Badge tone="green">На сайте</Badge>}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.hasDescription ? <Badge tone="green">Описание</Badge> : <Badge>Нет описания</Badge>}
                      <Badge tone={SEO_BADGE[r.seo][1]}>{SEO_BADGE[r.seo][0]}</Badge>
                      {r.photos === 0 ? <Badge tone="amber">Нет фото</Badge> : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs text-neutral-500">{fmtDate(r.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {data && data.total > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-600">
          <span>
            Найдено: {data.total.toLocaleString("ru-RU")} · страница {page} из {pages}
          </span>
          <span className="flex items-center gap-2">
            <Select className="h-8 w-auto py-0 text-[13px]" value={String(data.limit)} onChange={(e) => setParam({ limit: e.target.value })}>
              {[50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  по {n}
                </option>
              ))}
            </Select>
            <Btn variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
              Назад
            </Btn>
            <Btn variant="outline" size="sm" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>
              Дальше
            </Btn>
          </span>
        </div>
      ) : null}

      {bulk ? (
        <BulkDialog
          target={bulk}
          onClose={() => setBulk(null)}
          onDone={() => {
            setBulk(null);
            setSel(new Set());
            setAllByFilter(false);
            load();
          }}
        />
      ) : null}
      {opsOpen ? <OperationsDrawer onClose={() => setOpsOpen(false)} onUndone={load} /> : null}
    </div>
  );
}
