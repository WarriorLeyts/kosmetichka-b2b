"use client";

import { useState } from "react";

/**
 * «Скачать PDF» and «Поделиться» on the invoice pages. Sharing makes a 7-day link (`linkEndpoint`,
 * POST → { pdf }) that opens the PDF without signing in; where the browser can, the PDF file itself
 * is handed to the share sheet (WhatsApp, Telegram, mail…), otherwise the link is shared or copied.
 */
export default function InvoiceActions({ orderId, linkEndpoint, token, dark }: { orderId: number; linkEndpoint: string; token?: string; dark?: boolean }) {
  const [busy, setBusy] = useState<"" | "pdf" | "share">("");
  const [note, setNote] = useState("");
  const name = `Счёт №${orderId}.pdf`;
  const direct = `/api/orders/${orderId}/invoice-pdf${token ? `?t=${encodeURIComponent(token)}` : ""}`;

  const shareLink = async (): Promise<string> => {
    if (token) return new URL(direct, location.origin).href;
    const r = await fetch(linkEndpoint, { method: "POST", credentials: "include" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || typeof d?.pdf !== "string") throw new Error(d?.error || "Не удалось получить ссылку");
    return new URL(d.pdf, location.origin).href;
  };

  const download = () => {
    setBusy("pdf");
    location.href = direct + (direct.includes("?") ? "&" : "?") + "download=1";
    setTimeout(() => setBusy(""), 1500);
  };

  const share = async () => {
    setBusy("share");
    setNote("");
    try {
      const link = await shareLink();
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      // the file itself, where the browser allows it (phones)
      try {
        const blob = await (await fetch(link)).blob();
        const file = new File([blob], name, { type: "application/pdf" });
        if (nav.share && nav.canShare?.({ files: [file] })) {
          await nav.share({ files: [file], title: `Счёт №${orderId}` });
          return;
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
      if (nav.share) {
        try {
          await nav.share({ title: `Счёт №${orderId}`, url: link });
          return;
        } catch (e) {
          if ((e as Error)?.name === "AbortError") return;
        }
      }
      await navigator.clipboard.writeText(link);
      setNote("Ссылка на PDF скопирована — действует 7 дней");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Не получилось");
    } finally {
      setBusy("");
    }
  };

  const btn = dark
    ? "rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
    : "rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60";
  return (
    <>
      <button onClick={download} disabled={!!busy} className={btn}>
        {busy === "pdf" ? "Готовлю…" : "⬇ Скачать PDF"}
      </button>
      <button onClick={share} disabled={!!busy} className={btn}>
        {busy === "share" ? "Готовлю…" : "↗ Поделиться"}
      </button>
      {note ? <span className={`text-sm ${dark ? "text-slate-300" : "text-slate-500"}`}>{note}</span> : null}
    </>
  );
}
