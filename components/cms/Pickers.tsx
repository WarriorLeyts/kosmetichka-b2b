"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { cmsApi } from "@/lib/cms/client";
import { Input, Select } from "@/components/cms/ui";

/** Ordered list with up / down / remove — shared by the pickers */
function OrderedList<T>({ items, render, onChange }: { items: T[]; render: (x: T) => React.ReactNode; onChange: (v: T[]) => void }) {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  if (!items.length) return null;
  return (
    <ul className="mb-2 divide-y divide-neutral-100 rounded-lg border border-neutral-200">
      {items.map((x, i) => (
        <li key={i} className="flex items-center gap-2 px-2 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate">{render(x)}</span>
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 text-neutral-500 disabled:opacity-30" aria-label="Выше">
            <ArrowUp className="size-3.5" />
          </button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="p-0.5 text-neutral-500 disabled:opacity-30" aria-label="Ниже">
            <ArrowDown className="size-3.5" />
          </button>
          <button type="button" onClick={() => onChange(items.filter((_, k) => k !== i))} className="p-0.5 text-red-600" aria-label="Убрать">
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

type BannerRow = { id: number; title: string; imageDesktop: string | null; imageMobile: string | null; active: boolean };

export function BannerPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [all, setAll] = useState<BannerRow[]>([]);
  useEffect(() => {
    cmsApi<{ banners: BannerRow[] }>("/api/cms/banners").then((r) => setAll(r.banners)).catch(() => {});
  }, []);
  const byId = new Map(all.map((b) => [b.id, b]));
  const rest = all.filter((b) => !value.includes(b.id));
  return (
    <div>
      <OrderedList
        items={value}
        onChange={onChange}
        render={(id) => {
          const b = byId.get(id);
          return b ? (
            <span className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b.imageDesktop || b.imageMobile ? <img src={`/1c/${b.imageDesktop ?? b.imageMobile}`} alt="" className="h-6 w-12 rounded object-cover" /> : null}
              {b.title}
              {!b.active ? <span className="text-xs text-amber-700">(выключен)</span> : null}
            </span>
          ) : (
            <span className="text-neutral-400">Баннер #{id} удалён</span>
          );
        }}
      />
      <Select value="" onChange={(e) => e.target.value && onChange([...value, Number(e.target.value)])}>
        <option value="">{rest.length ? "+ Добавить баннер…" : all.length ? "Все баннеры уже добавлены" : "Баннеров нет — создайте в разделе «Баннеры»"}</option>
        {rest.map((b) => (
          <option key={b.id} value={b.id}>
            {b.title}
            {b.active ? "" : " (выключен)"}
          </option>
        ))}
      </Select>
    </div>
  );
}

type Cat = { guid: string; name: string; parentGuid: string | null };
let catCache: Promise<Cat[]> | null = null;
export function useCategories() {
  const [cats, setCats] = useState<Cat[]>([]);
  useEffect(() => {
    catCache ??= fetch("/api/categories").then((r) => r.json());
    catCache.then(setCats).catch(() => {});
  }, []);
  return cats;
}

/** categories as an indented list: main ones, then their subcategories */
function useCategoryOptions(cats: Cat[]) {
  return useMemo(() => {
    const root = cats.find((c) => c.name.toLowerCase() === "каталог");
    const top = cats.filter((c) => c !== root && (root ? c.parentGuid === root.guid : !c.parentGuid)).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const out: { guid: string; label: string }[] = [];
    for (const t of top) {
      out.push({ guid: t.guid, label: t.name });
      for (const c of cats.filter((x) => x.parentGuid === t.guid).sort((a, b) => a.name.localeCompare(b.name, "ru"))) out.push({ guid: c.guid, label: "   — " + c.name });
    }
    return out;
  }, [cats]);
}

export function CategoryPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const cats = useCategories();
  const opts = useCategoryOptions(cats);
  const name = new Map(cats.map((c) => [c.guid, c.name]));
  return (
    <div>
      <OrderedList items={value} onChange={onChange} render={(g) => name.get(g) ?? "Категория удалена"} />
      <Select value="" onChange={(e) => e.target.value && !value.includes(e.target.value) && onChange([...value, e.target.value])}>
        <option value="">+ Добавить категорию…</option>
        {opts
          .filter((o) => !value.includes(o.guid))
          .map((o) => (
            <option key={o.guid} value={o.guid}>
              {o.label}
            </option>
          ))}
      </Select>
    </div>
  );
}

export function CategorySelect({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  const opts = useCategoryOptions(useCategories());
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Выберите категорию…</option>
      {opts.map((o) => (
        <option key={o.guid} value={o.guid}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

type Prod = { id: number; name: string; article: string | null; image: string | null; hidden: boolean; stock: number | null };

export function ProductPicker({ value, onChange, max = 40, exclude }: { value: number[]; onChange: (v: number[]) => void; max?: number; exclude?: number }) {
  const [known, setKnown] = useState<Map<number, Prod>>(new Map());
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Prod[]>([]);

  const missing = value.filter((id) => !known.has(id));
  const missingKey = missing.join(",");
  useEffect(() => {
    if (!missingKey) return;
    cmsApi<{ items: Prod[] }>(`/api/cms/products?ids=${missingKey}&limit=100`)
      .then((r) => setKnown((m) => new Map([...m, ...r.items.map((p) => [p.id, p] as const)])))
      .catch(() => {});
  }, [missingKey]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      cmsApi<{ items: Prod[] }>(`/api/cms/products?search=${encodeURIComponent(q.trim())}&limit=8&sort=sales`)
        .then((r) => {
          setFound(r.items);
          setKnown((m) => new Map([...m, ...r.items.map((p) => [p.id, p] as const)]));
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <OrderedList
        items={value}
        onChange={onChange}
        render={(id) => {
          const p = known.get(id);
          return p ? (
            <span className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.image ? <img src={p.image} alt="" className="size-6 rounded object-cover" /> : <span className="size-6 rounded bg-neutral-100" />}
              <span className="truncate">{p.name}</span>
              {p.hidden ? <span className="text-xs text-amber-700">скрыт</span> : (p.stock ?? 0) <= 0 ? <span className="text-xs text-neutral-400">нет в наличии</span> : null}
            </span>
          ) : (
            `Товар #${id}`
          );
        }}
      />
      {value.length < max ? (
        <div className="relative">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти товар: название, бренд, артикул…" />
          {found.length && q.trim().length >= 2 ? (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
              {found
                .filter((p) => p.id !== exclude)
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={value.includes(p.id)}
                      onClick={() => {
                        onChange([...value, p.id]);
                        setQ("");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 disabled:opacity-40"
                    >
                      <Plus className="size-3.5 shrink-0 text-[#8E1B47]" />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="shrink-0 text-xs text-neutral-400">{p.article}</span>
                    </button>
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="text-xs text-neutral-500">Не больше {max} товаров</div>
      )}
    </div>
  );
}
