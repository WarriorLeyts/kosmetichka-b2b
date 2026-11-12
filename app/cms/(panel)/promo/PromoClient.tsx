"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cmsApi, fmtDate } from "@/lib/cms/client";
import { cn } from "@/lib/utils";
import { PROMO_COLORS, promoActive, promoSchema, type PromoSettings } from "@/lib/promoSchema";
import { Badge, Btn, Card, Field, Input, PageHeader, Toggle } from "@/components/cms/ui";

type Banner = { id: number; title: string; active: boolean; image: string | null; imageMobile: string | null; hasDesktop: boolean; hasMobile: boolean; link: string | null };
type Data = { settings: PromoSettings; updatedAt: string | null; updatedBy: string | null; banners: Banner[] };

/** «2026-11-13» (a Moscow day) ↔ the stored moments: the start at 00:00 of the first day, the end at 00:00 after the last day */
const dayToStart = (d: string) => (d ? `${d}T00:00:00+03:00` : null);
const dayToEnd = (d: string) => {
  if (!d) return null;
  const t = new Date(`${d}T00:00:00+03:00`).getTime() + 86400_000;
  return new Date(t).toISOString();
};
const moscowDay = (iso: string | null, minus = 0) =>
  iso ? new Date(Date.parse(iso) - minus).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" }) : "";

const LINKS = [
  ["/catalog?quick=sale", "Товары со скидкой"],
  ["/catalog", "Весь каталог"],
  ["", "Без ссылки"],
] as const;

export function PromoClient({ canEdit }: { canEdit: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [p, setP] = useState<PromoSettings | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    cmsApi<Data>("/api/cms/settings/promo")
      .then((r) => {
        if (!alive) return;
        setData(r);
        setP(r.settings);
        setSaved(JSON.stringify(r.settings));
      })
      .catch((e) => toast.error(e.message));
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!data || !p) return <div className="text-sm text-neutral-500">Загрузка…</div>;
  const dirty = JSON.stringify(p) !== saved;
  const set = (patch: Partial<PromoSettings>) => setP({ ...p, ...patch });
  const running = promoActive(p, now);
  const status = !p.enabled
    ? { tone: "neutral" as const, text: "Выключена" }
    : running
      ? { tone: "green" as const, text: `Идёт${p.endsAt ? ` до ${new Date(Date.parse(p.endsAt) - 1000).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` : ""}` }
      : p.endsAt && now >= Date.parse(p.endsAt)
        ? { tone: "neutral" as const, text: "Закончилась — сайт в обычном виде" }
        : { tone: "amber" as const, text: `Начнётся ${p.startsAt ? new Date(p.startsAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : ""}` };

  const save = async (next = p) => {
    const v = promoSchema.safeParse(next);
    if (!v.success) return toast.error(v.error.issues[0]?.message ?? "Проверьте поля");
    if (next.enabled && !next.endsAt) {
      // an open end is allowed, but say it
      toast.info("Без даты окончания акция будет идти, пока её не выключат");
    }
    setBusy(true);
    try {
      await cmsApi("/api/cms/settings/promo", { method: "PUT", body: next });
      setP(next);
      setSaved(JSON.stringify(next));
      toast.success("Сохранено. Сайт и приложения подхватят в течение пары минут");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const chosen = p.bannerIds.map((id) => data.banners.find((b) => b.id === id)).filter((b): b is Banner => !!b);
  const toggleBanner = (id: number) => set({ bannerIds: p.bannerIds.includes(id) ? p.bannerIds.filter((x) => x !== id) : [...p.bannerIds, id] });

  return (
    <div className="max-w-5xl pb-16">
      <PageHeader
        title="Акция"
        subtitle="Оформление сайта и приложения на время акции. Включается и выключается само по датам (время московское). Цены и скидки — из 1С, здесь только вид."
        actions={
          <>
            <Badge tone={status.tone}>{status.text}</Badge>
            {canEdit ? (
              <Btn onClick={() => save()} loading={busy} disabled={!dirty}>
                Сохранить
              </Btn>
            ) : null}
          </>
        }
      />
      {!canEdit ? <p className="mb-3 text-xs text-amber-700">Менять акцию может администратор.</p> : null}
      {data.updatedAt ? (
        <p className="-mt-2 mb-3 text-xs text-neutral-500">
          Изменено {fmtDate(data.updatedAt)}
          {data.updatedBy ? `, ${data.updatedBy}` : ""}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            <Toggle checked={p.enabled} onChange={(v) => set({ enabled: v })} label="Акция включена" />
            <Field label="Название (для себя)">
              <Input value={p.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="Светлая пятница" disabled={!canEdit} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Первый день" hint="С 00:00 по Москве">
                <Input type="date" value={moscowDay(p.startsAt)} onChange={(e) => set({ startsAt: dayToStart(e.target.value) })} disabled={!canEdit} />
              </Field>
              <Field label="Последний день" hint="До 23:59 по Москве, потом всё вернётся само">
                <Input type="date" value={moscowDay(p.endsAt, 1000)} onChange={(e) => set({ endsAt: dayToEnd(e.target.value) })} disabled={!canEdit} />
              </Field>
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <div className="font-medium">Цвет</div>
            <p className="text-xs text-neutral-500">Заменяет фиолетовый акцент: кнопки, вкладки, выделенные пункты, ссылки. Логотип и расположение не меняются.</p>
            <div className="flex flex-wrap items-center gap-2">
              {PROMO_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => set({ accent: c.hex })}
                  className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm", p.accent.toLowerCase() === c.hex ? "border-neutral-900" : "border-neutral-200")}
                >
                  <span className="size-4 rounded-full" style={{ background: c.hex }} />
                  {c.name}
                </button>
              ))}
              <label className="flex items-center gap-2 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm">
                <input type="color" value={p.accent} disabled={!canEdit} onChange={(e) => set({ accent: e.target.value })} className="size-5 cursor-pointer border-0 bg-transparent p-0" />
                Свой
              </label>
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <Toggle checked={p.strip.enabled} onChange={(v) => set({ strip: { ...p.strip, enabled: v } })} label="Полоска над шапкой на всех страницах" />
            {p.strip.enabled ? (
              <>
                <Field label="Текст" hint={`${p.strip.text.length} / 120`}>
                  <Input value={p.strip.text} maxLength={120} onChange={(e) => set({ strip: { ...p.strip, text: e.target.value } })} placeholder="Светлая пятница · скидки до −70% · до 30 ноября" disabled={!canEdit} />
                </Field>
                <Field label="По нажатию открывать">
                  <div className="flex flex-wrap gap-2">
                    {LINKS.map(([v, l]) => (
                      <button
                        key={l}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => set({ strip: { ...p.strip, link: v } })}
                        className={cn("rounded-lg border px-2.5 py-1.5 text-sm", p.strip.link === v ? "border-neutral-900" : "border-neutral-200")}
                      >
                        {l}
                      </button>
                    ))}
                    <Input
                      className="min-w-56 flex-1"
                      value={p.strip.link}
                      maxLength={300}
                      onChange={(e) => set({ strip: { ...p.strip, link: e.target.value } })}
                      placeholder="или своя ссылка: /catalog?q=…"
                      disabled={!canEdit}
                    />
                  </div>
                </Field>
                <Toggle checked={p.strip.countdown} onChange={(v) => set({ strip: { ...p.strip, countdown: v } })} label="Обратный отсчёт до конца акции" />
              </>
            ) : null}
          </Card>

          <Card className="space-y-3 p-5">
            <div className="font-medium">Баннеры на главной</div>
            <p className="text-xs text-neutral-500">
              На время акции встают первыми на главной (на компьютере — широкая картинка, на телефоне — вертикальная). Загрузить новые —{" "}
              <Link href="/banners" className="text-[#8E1B47] hover:underline">
                раздел «Баннеры»
              </Link>
              .
            </p>
            {!data.banners.length ? <p className="text-sm text-neutral-500">Баннеров пока нет.</p> : null}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.banners.map((b) => {
                const on = p.bannerIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => toggleBanner(b.id)}
                    className={cn("overflow-hidden rounded-lg border text-left text-xs", on ? "border-[#8E1B47] ring-2 ring-[#8E1B47]/30" : "border-neutral-200")}
                  >
                    {b.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.image} alt="" className="aspect-[8/3] w-full bg-neutral-100 object-cover" />
                    ) : (
                      <div className="aspect-[8/3] w-full bg-neutral-100" />
                    )}
                    <div className="p-2">
                      <div className="truncate font-medium">
                        {on ? `${p.bannerIds.indexOf(b.id) + 1}. ` : ""}
                        {b.title}
                      </div>
                      <div className="text-neutral-500">
                        {b.hasDesktop ? "ПК" : "нет ПК"} · {b.hasMobile ? "телефон" : "нет телефона"}
                        {b.active ? "" : " · выключен"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {chosen.some((b) => !b.active) ? <p className="text-xs text-amber-700">Выключенный в «Баннерах» баннер показан не будет — включите его там.</p> : null}
          </Card>

          <Card className="p-5">
            <Toggle checked={p.saleFirst} onChange={(v) => set({ saleFirst: v })} label="Кнопка «Со скидкой» первой и выделена (главная и каталог)" />
          </Card>
        </div>

        <Card className="h-fit overflow-hidden lg:sticky lg:top-4">
          <div className="px-4 pt-3 text-xs text-neutral-500">Как будет выглядеть</div>
          <div className="m-4 overflow-hidden rounded-xl border border-neutral-200 bg-[#f6f7fb]">
            {p.strip.enabled && p.strip.text ? (
              <div className="px-3 py-2 text-center text-[13px] font-semibold text-white" style={{ background: p.accent }}>
                {p.strip.text}
                {p.strip.countdown && p.endsAt ? <span className="ml-2 opacity-90">· ещё {Math.max(0, Math.ceil((Date.parse(p.endsAt) - now) / 86400_000))} дн.</span> : null}
              </div>
            ) : null}
            <div className="p-3">
              {chosen[0]?.imageMobile ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={chosen[0].imageMobile} alt="" className="mb-3 aspect-[4/5] w-full rounded-xl object-cover" />
              ) : (
                <div className="mb-3 flex aspect-[4/5] w-full items-center justify-center rounded-xl bg-white text-xs text-neutral-400">баннер не выбран</div>
              )}
              <div className="mb-3 flex gap-2">
                {(p.saleFirst ? ["Со скидкой", "Новинки"] : ["Новинки", "Со скидкой"]).map((l) => (
                  <span
                    key={l}
                    className="rounded-full border px-3 py-1 text-xs font-medium"
                    style={l === "Со скидкой" && p.saleFirst ? { background: p.accent, borderColor: p.accent, color: "#fff" } : { background: "#fff", borderColor: "#e8eaf0" }}
                  >
                    {l}
                  </span>
                ))}
              </div>
              <div className="rounded-xl py-2 text-center text-sm font-semibold text-white" style={{ background: p.accent }}>
                В корзину
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
