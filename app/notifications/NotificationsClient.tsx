"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, Gift, MessageCircle, Package, Sparkles, Tags } from "lucide-react";
import { useNotifStore, siteLink } from "@/store/notifStore";

type Item = { id: number; kind: string; title: string; body: string; link: string | null; read: boolean; createdAt: string };

const ICON: Record<string, { Icon: typeof Bell; color: string }> = {
  order: { Icon: Package, color: "text-violet-600" },
  chat: { Icon: MessageCircle, color: "text-pink-600" },
  restock: { Icon: CheckCircle2, color: "text-green-700" },
  bonus: { Icon: Gift, color: "text-pink-600" },
  role: { Icon: Tags, color: "text-violet-600" },
  promo: { Icon: Sparkles, color: "text-pink-600" },
};

function when(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (day(now) - day(d)) / 86400000;
  if (diff === 0) return `сегодня, ${time}`;
  if (diff === 1) return `вчера, ${time}`;
  return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "")}, ${time}`;
}

export function NotificationsClient() {
  const router = useRouter();
  const setUnread = useNotifStore((s) => s.set);
  const [items, setItems] = useState<Item[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/mobile/notifications", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Не удалось загрузить");
      setItems(d.items);
      setHasMore(d.hasMore);
      setUnread(d.unread);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить");
    }
  }, [setUnread]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    if (!items?.length || more) return;
    setMore(true);
    try {
      const res = await fetch(`/api/mobile/notifications?before=${items[items.length - 1].id}`, { cache: "no-store" });
      const d = await res.json();
      if (res.ok) {
        setItems((p) => [...(p ?? []), ...d.items]);
        setHasMore(d.hasMore);
      }
    } finally {
      setMore(false);
    }
  }

  async function markRead(ids?: number[]) {
    const res = await fetch("/api/mobile/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids ? { ids } : {}),
    }).catch(() => null);
    const d = res && res.ok ? await res.json().catch(() => null) : null;
    if (d) setUnread(d.unread);
  }

  function open(n: Item) {
    if (!n.read) {
      setItems((p) => (p ?? []).map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      markRead([n.id]);
    }
    const href = siteLink(n.link);
    if (href) router.push(href);
  }

  function readAll() {
    setItems((p) => (p ?? []).map((x) => ({ ...x, read: true })));
    setUnread(0);
    markRead();
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-2xl font-black text-slate-900">Уведомления</h1>
        {items?.some((x) => !x.read) ? (
          <button type="button" onClick={readAll} className="ml-auto text-sm font-bold text-violet-600">
            Прочитать все
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-slate-600">
          {error}{" "}
          <button type="button" onClick={load} className="font-bold text-violet-600 underline">Повторить</button>
        </div>
      ) : !items ? (
        <div className="py-16 text-center text-sm text-slate-400">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
          <Bell className="mx-auto mb-3 h-9 w-9 text-violet-500" />
          <p className="text-base font-bold text-slate-700">Уведомлений пока нет</p>
          <p className="mt-1 text-sm text-slate-500">Здесь появятся статусы заказов, ответы менеджера, начисленные бонусы и товары из листа ожидания</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((n) => {
            const k = ICON[n.kind] ?? ICON.order;
            const clickable = !!siteLink(n.link) || !n.read;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n)}
                disabled={!clickable}
                className="flex w-full items-start gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-violet-200 disabled:cursor-default"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50">
                  <k.Icon size={20} className={k.color} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[15px] text-slate-900 ${n.read ? "font-medium" : "font-black"}`}>{n.title}</span>
                  <span className="mt-0.5 block text-sm text-slate-500">{n.body}</span>
                  <span className="mt-1.5 block text-xs text-slate-400">{when(n.createdAt)}</span>
                </span>
                {!n.read ? <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-pink-600" aria-label="Новое" /> : null}
              </button>
            );
          })}
          {hasMore ? (
            <button type="button" onClick={loadMore} disabled={more} className="mx-auto mt-2 rounded-xl border bg-white px-5 py-2 text-sm font-bold">
              {more ? "Загрузка…" : "Показать ещё"}
            </button>
          ) : null}
        </div>
      )}
    </>
  );
}
