"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { cmsApi, fmtDate } from "@/lib/cms/client";
import { Badge, Btn, Card, Input, PageHeader, Select, useConfirm } from "@/components/cms/ui";
import { useCategories } from "@/components/cms/Pickers";

type Row = {
  id: number;
  article: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  stock: number | null;
  hidden: boolean;
  salesCount: number;
  updatedAt: string;
  hasDescription: boolean;
  photos: number;
  image: string | null;
  retail: number | null;
};

type FilterKey = "search" | "category" | "stock" | "photo" | "desc" | "hidden" | "sort" | "dir" | "page";

export function ProductsTable() {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: FilterKey) => sp.get(k) ?? "";
  const [search, setSearch] = useState(get("search"));
  const [data, setData] = useState<{ items: Row[]; total: number; page: number; limit: number } | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const cats = useCategories();
  const { confirm, dialog } = useConfirm();

  const setParam = useCallback(
    (patch: Partial<Record<FilterKey, string>>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in patch)) next.delete("page");
      setSel(new Set());
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
  const sortIcon = (k: string) => (get("sort") === k || (!get("sort") && k === "updated") ? get("dir") === "asc" ? <ArrowUp className="inline size-3" /> : <ArrowDown className="inline size-3" /> : null);

  const bulk = async (action: "hide" | "show") => {
    const ids = [...sel];
    if (!(await confirm(`${action === "hide" ? "Скрыть с сайта" : "Показать на сайте"} товаров: ${ids.length}?`, action === "hide"))) return;
    setBusy(true);
    try {
      const r = await cmsApi<{ changed: number }>("/api/cms/products/bulk", { body: { ids, action } });
      toast.success(`Готово: ${r.changed}`);
      load();
      setSel(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const root = cats.find((c) => c.name.toLowerCase() === "каталог");
  const top = cats.filter((c) => c !== root && (root ? c.parentGuid === root.guid : !c.parentGuid)).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const page = data?.page ?? 1;
  const allOnPage = !!data?.items.length && data.items.every((r) => sel.has(r.id));

  return (
    <div className="max-w-[1400px]">
      {dialog}
      <PageHeader
        title="Товары"
        subtitle="Название, артикул, цены и остатки приходят из 1С и здесь не меняются. В панели — описание, фото, характеристики, SEO, видимость."
        actions={
          <Link href="/products/photos">
            <Btn variant="outline">Загрузить фото из ZIP</Btn>
          </Link>
        }
      />

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-56 flex-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск: название, бренд, артикул, штрихкод" />
          <Select className="w-auto" value={get("category")} onChange={(e) => setParam({ category: e.target.value })}>
            <option value="">Все категории</option>
            {top.map((c) => (
              <option key={c.guid} value={c.guid}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select className="w-auto" value={get("stock")} onChange={(e) => setParam({ stock: e.target.value })}>
            <option value="">Любой остаток</option>
            <option value="in">В наличии</option>
            <option value="out">Нет в наличии</option>
          </Select>
          <Select className="w-auto" value={get("photo")} onChange={(e) => setParam({ photo: e.target.value })}>
            <option value="">С фото и без</option>
            <option value="none">Без фото</option>
            <option value="has">С фото</option>
          </Select>
          <Select className="w-auto" value={get("desc")} onChange={(e) => setParam({ desc: e.target.value })}>
            <option value="">С описанием и без</option>
            <option value="none">Без описания</option>
          </Select>
          <Select className="w-auto" value={get("hidden")} onChange={(e) => setParam({ hidden: e.target.value })}>
            <option value="">Видимые и скрытые</option>
            <option value="0">Видимые</option>
            <option value="1">Скрытые</option>
          </Select>
        </div>
      </Card>

      {sel.size ? (
        <div className="sticky top-0 z-10 mb-3 flex items-center gap-2 rounded-lg border border-[#8E1B47]/30 bg-[#FBEFF3] px-3 py-2 text-sm">
          Выбрано: {sel.size}
          <Btn size="sm" variant="outline" onClick={() => bulk("hide")} loading={busy}>
            <EyeOff className="size-4" /> Скрыть с сайта
          </Btn>
          <Btn size="sm" variant="outline" onClick={() => bulk("show")} loading={busy}>
            <Eye className="size-4" /> Показать
          </Btn>
          <button className="ml-auto text-neutral-600" onClick={() => setSel(new Set())}>
            Снять выбор
          </button>
        </div>
      ) : null}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-600">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={() => setSel(allOnPage ? new Set() : new Set(data?.items.map((r) => r.id)))}
                  aria-label="Выбрать все на странице"
                />
              </th>
              <th className="w-14 px-2 py-2">Фото</th>
              <th className="cursor-pointer px-2 py-2" onClick={() => sortBy("name")}>
                Товар {sortIcon("name")}
              </th>
              <th className="cursor-pointer px-2 py-2" onClick={() => sortBy("article")}>
                Артикул {sortIcon("article")}
              </th>
              <th className="px-2 py-2">Категория</th>
              <th className="cursor-pointer px-2 py-2 text-right" onClick={() => sortBy("stock")}>
                Остаток {sortIcon("stock")}
              </th>
              <th className="px-2 py-2 text-right">Розница</th>
              <th className="cursor-pointer px-2 py-2 text-right" onClick={() => sortBy("sales")}>
                Продажи 90 дн. {sortIcon("sales")}
              </th>
              <th className="px-2 py-2">Статус</th>
              <th className="cursor-pointer px-2 py-2" onClick={() => sortBy("updated")}>
                Изменён {sortIcon("updated")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {!data ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-neutral-500">
                  Загрузка…
                </td>
              </tr>
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-neutral-500">
                  Ничего не найдено
                </td>
              </tr>
            ) : (
              data.items.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={sel.has(r.id)}
                      onChange={() => {
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
                      <span className="flex size-10 items-center justify-center rounded-md bg-neutral-100">
                        <ImageOff className="size-4 text-neutral-400" />
                      </span>
                    )}
                  </td>
                  <td className="max-w-md px-2 py-2">
                    <Link href={`/products/${r.id}`} className="line-clamp-2 font-medium text-neutral-900 hover:text-[#8E1B47]">
                      {r.name}
                    </Link>
                    {r.brand ? <div className="text-xs text-neutral-500">{r.brand}</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-neutral-600">{r.article ?? "—"}</td>
                  <td className="max-w-40 truncate px-2 py-2 text-neutral-600">{r.category ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.stock ?? 0}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{r.retail != null ? `${r.retail.toLocaleString("ru-RU")} ₽` : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-neutral-600">{r.salesCount}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.hidden ? <Badge tone="red">Скрыт</Badge> : null}
                      {r.photos === 0 ? <Badge tone="amber">Нет фото</Badge> : null}
                      {!r.hasDescription ? <Badge>Нет описания</Badge> : null}
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
        <div className="mt-3 flex items-center justify-between text-sm text-neutral-600">
          <span>
            Найдено: {data.total.toLocaleString("ru-RU")} · страница {page} из {pages}
          </span>
          <span className="flex gap-2">
            <Btn variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
              Назад
            </Btn>
            <Btn variant="outline" size="sm" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>
              Дальше
            </Btn>
          </span>
        </div>
      ) : null}
    </div>
  );
}
