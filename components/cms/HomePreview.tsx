"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResolvedBlock } from "@/lib/cms/home";

/**
 * Preview of the storefront home (kosmetichka-opt.ru, the «native» app) drawn from the blocks.
 * Close to the app's look: pink → violet accents, rounded cards. Click a block to edit it;
 * titles and texts are editable right here.
 */

const PINK = "#E82C87";
const VIOLET = "#7C3AED";

type Props = {
  blocks: ResolvedBlock[];
  device: "desktop" | "mobile";
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string, field: "title" | "text", value: string) => void;
  hiddenIds: Set<string>;
};

function Editable({ value, onChange, className, placeholder, multiline }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; multiline?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current && ref.current.innerText !== value) ref.current.innerText = value;
  }, [value]);
  const Tag = (multiline ? "div" : "span") as "div";
  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
      }}
      onBlur={(e) => {
        const v = (e.target as HTMLElement).innerText.replace(/ /g, " ").trim();
        if (v !== value) onChange(v);
      }}
      title="Нажмите, чтобы изменить текст"
      className={cn(
        "cursor-text rounded outline-none ring-[#8E1B47]/40 hover:ring-2 focus:ring-2 empty:before:text-neutral-400 empty:before:content-[attr(data-placeholder)]",
        multiline && "whitespace-pre-line",
        className
      )}
    />
  );
}

function Hero({ b, device }: { b: Extract<ResolvedBlock, { type: "hero" }>; device: Props["device"] }) {
  const [i, setI] = useState(0);
  const n = b.banners.length;
  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), b.intervalSec * 1000);
    return () => clearInterval(t);
  }, [n, b.intervalSec]);
  const cur = b.banners[Math.min(i, n - 1)];
  if (!cur)
    return (
      <div className={cn("flex items-center justify-center rounded-2xl border-2 border-dashed border-neutral-300 text-sm text-neutral-400", device === "mobile" ? "aspect-[4/5]" : "aspect-[8/3]")}>
        Баннеры не выбраны (или выключены / вне дат показа) — на сайте блока не будет
      </div>
    );
  const img = device === "mobile" ? cur.imageMobile : cur.imageDesktop;
  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-neutral-200", device === "mobile" ? "aspect-[4/5]" : "aspect-[8/3]")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : null}
      {cur.subtitle || cur.buttonText ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-4 text-white">
          {cur.subtitle ? <div className={device === "mobile" ? "text-sm" : "text-lg"}>{cur.subtitle}</div> : null}
          {cur.buttonText ? <span className="mt-2 inline-block rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-neutral-900">{cur.buttonText}</span> : null}
        </div>
      ) : null}
      {n > 1 ? (
        <>
          <button type="button" onClick={(e) => (e.stopPropagation(), setI((i - 1 + n) % n))} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={(e) => (e.stopPropagation(), setI((i + 1) % n))} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1">
            <ChevronRight className="size-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {b.banners.map((x, k) => (
              <span key={x.id} className={cn("h-1.5 rounded-full bg-white transition-all", k === i ? "w-4" : "w-1.5 opacity-60")} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function HomePreview({ blocks, device, selectedId, onSelect, onEdit, hiddenIds }: Props) {
  const mobile = device === "mobile";
  return (
    <div className={cn("mx-auto bg-[#FBF8FD] text-[#2A1A3A] shadow-sm", mobile ? "w-[390px] rounded-[28px] border-[10px] border-neutral-900" : "w-full max-w-[1200px] rounded-xl border border-neutral-200")}>
      {/* шапка приложения — не редактируется, для ориентира */}
      <div className={cn("px-4 pt-4", mobile ? "pb-2" : "flex items-center gap-6 pb-4")}>
        <div className="text-center text-lg font-extrabold tracking-wide" style={{ color: VIOLET }}>
          <span style={{ color: PINK }}>♥</span> КОСМЕТИЧКА
        </div>
        <div className={cn("flex items-center gap-2 rounded-2xl border border-[#E9DDF5] bg-white px-3 py-2.5 text-sm text-[#8A7CA6]", mobile ? "mt-3" : "flex-1")}>
          <Search className="size-4" /> Название, бренд, артикул
        </div>
      </div>

      <div className={cn("space-y-5 px-4 pb-6", mobile ? "" : "px-6")}>
        {blocks.length === 0 ? <div className="py-16 text-center text-sm text-neutral-400">Нет видимых блоков</div> : null}
        {blocks.map((b) => (
          <section
            key={b.id}
            onClick={() => onSelect(b.id)}
            className={cn(
              "relative cursor-pointer rounded-2xl outline-offset-4 transition-[outline]",
              selectedId === b.id ? "outline outline-2 outline-[#8E1B47]" : "hover:outline hover:outline-1 hover:outline-[#8E1B47]/40",
              hiddenIds.has(b.id) && "opacity-40"
            )}
          >
            {b.type === "hero" ? <Hero b={b} device={device} /> : null}

            {b.type === "categories" ? (
              <div>
                <Editable value={b.title} onChange={(v) => onEdit(b.id, "title", v)} placeholder="Заголовок" className="mb-2 block text-base font-bold" />
                <div className={cn("grid gap-2", mobile ? "grid-cols-3" : "grid-cols-6")}>
                  {(b.categories ?? Array.from({ length: Math.min(b.limit, mobile ? 6 : 12) }, (_, k) => ({ guid: String(k), name: "Категория" }))).map((c) => (
                    <div key={c.guid} className="flex aspect-square flex-col items-center justify-end rounded-2xl bg-white p-2 text-center text-[11px] font-medium shadow-sm">
                      <div className="mb-1 size-8 rounded-xl" style={{ background: `linear-gradient(135deg, ${PINK}33, ${VIOLET}33)` }} />
                      <span className="line-clamp-2">{c.name}</span>
                    </div>
                  ))}
                </div>
                {!b.categories ? <div className="mt-1 text-[11px] text-neutral-400">Основные категории каталога — автоматически</div> : null}
              </div>
            ) : null}

            {b.type === "products" ? (
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <Editable value={b.title} onChange={(v) => onEdit(b.id, "title", v)} placeholder="Заголовок подборки" className="text-base font-bold" />
                  {b.moreLink ? <span className="text-sm font-semibold" style={{ color: PINK }}>{b.moreText || "Все"} →</span> : null}
                </div>
                <div className={cn("grid gap-2", mobile ? "grid-cols-2" : "grid-cols-5")}>
                  {(b.preview ?? []).slice(0, mobile ? 4 : 10).map((p) => (
                    <div key={p.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                      <div className="aspect-square bg-neutral-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {p.image ? <img src={p.image} alt="" className="h-full w-full object-contain" /> : null}
                      </div>
                      <div className="p-2">
                        <div className="line-clamp-2 text-[11px] leading-tight">{p.name}</div>
                        <div className="mt-1 text-sm font-bold">{p.price != null ? `${p.price.toLocaleString("ru-RU")} ₽` : "—"}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {b.preview && b.preview.length === 0 ? <div className="py-4 text-center text-xs text-neutral-400">Сейчас нет подходящих товаров в наличии</div> : null}
              </div>
            ) : null}

            {b.type === "info" ? (
              <div
                className={cn("flex gap-4 overflow-hidden rounded-2xl p-5", mobile ? "flex-col" : "items-center", b.tone === "accent" ? "text-white" : "bg-white shadow-sm")}
                style={b.tone === "accent" ? { background: `linear-gradient(135deg, ${PINK}, ${VIOLET})` } : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.imageUrl ? <img src={b.imageUrl} alt="" className={cn("rounded-xl object-cover", mobile ? "aspect-[16/9] w-full" : "h-40 w-64")} /> : null}
                <div className="min-w-0 flex-1">
                  <Editable value={b.title} onChange={(v) => onEdit(b.id, "title", v)} placeholder="Заголовок" className="block text-lg font-bold" />
                  <Editable value={b.text} onChange={(v) => onEdit(b.id, "text", v)} placeholder="Текст блока" multiline className="mt-1 block text-sm opacity-90" />
                  {b.buttonText ? (
                    <span className={cn("mt-3 inline-block rounded-full px-4 py-1.5 text-sm font-semibold", b.tone === "accent" ? "bg-white text-[#7C3AED]" : "text-white")} style={b.tone === "accent" ? undefined : { background: PINK }}>
                      {b.buttonText}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {b.type === "buttons" ? (
              <div>
                {b.title || selectedId === b.id ? <Editable value={b.title} onChange={(v) => onEdit(b.id, "title", v)} placeholder="Заголовок (необязательно)" className="mb-2 block text-base font-bold" /> : null}
                <div className="flex flex-wrap gap-2">
                  {b.items.map((it, k) => (
                    <span key={k} className="rounded-full border border-[#E9DDF5] bg-white px-4 py-2 text-sm font-semibold" style={{ color: VIOLET }}>
                      {it.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
