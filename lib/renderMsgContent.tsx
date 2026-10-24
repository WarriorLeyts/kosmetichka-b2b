"use client";

/**
 * Shared chat message renderer.
 * Used in: OrderChat, OrdersPageClient (inline chat), AdminOrderClient, PickerOrderClient.
 */

import { formatFileSize } from "@/lib/chatAttachments";

const IMAGES_BASE = process.env.NEXT_PUBLIC_IMAGES_BASE_URL ?? "https://kosmetichka-opt.ru";

export function getProductImageUrl(imagePath: string | null, width?: number): string | null {
  if (!imagePath) return null;
  if (imagePath.startsWith("http")) return imagePath;
  return `${IMAGES_BASE}/api/1c/${imagePath}${width ? `?w=${width}` : ""}`;
}

/** Рендерит текст сообщения: обычный текст или структурированные JSON-карточки */
export function renderMsgContent(text: string): React.ReactNode {
  try {
    const obj = JSON.parse(text) as Record<string, unknown>;

    // Photo attachment
    if (obj._t === "img" && typeof obj.url === "string") {
      return (
        <a href={obj.url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={obj.url}
            alt="фото"
            className="max-w-[200px] max-h-[200px] rounded-xl object-cover cursor-pointer hover:opacity-90"
          />
        </a>
      );
    }

    // Video attachment
    if (obj._t === "video" && typeof obj.url === "string") {
      return (
        <video
          src={obj.url}
          controls
          playsInline
          preload="metadata"
          className="max-w-[240px] max-h-[320px] rounded-xl bg-black"
        />
      );
    }

    // File attachment (PDF, documents, archives)
    if (obj._t === "file" && typeof obj.url === "string") {
      const name = typeof obj.name === "string" ? obj.name : "Файл";
      const size = typeof obj.size === "number" ? formatFileSize(obj.size) : "";
      const ext = (name.split(".").pop() || "").toUpperCase().slice(0, 4);
      return (
        <a
          href={obj.url}
          download={name}
          className="flex items-center gap-3 rounded-xl border bg-white text-slate-800 px-3 py-2 w-60 shadow-sm hover:bg-slate-50 no-underline"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-[10px] font-bold text-violet-700">
            {ext || "FILE"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="block text-xs text-slate-500">{size ? `${size} · ` : ""}Скачать</span>
          </span>
        </a>
      );
    }

    // Product card (manager added from catalog)
    if (obj._t === "product" && typeof obj.name === "string") {
      const imgUrl = getProductImageUrl((obj.imagePath as string | null) ?? null, 160);
      const price = typeof obj.price === "number" ? obj.price : 0;
      return (
        <div className="rounded-xl border bg-white text-slate-800 overflow-hidden w-52 shadow-sm">
          {imgUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgUrl}
              alt={obj.name}
              className="w-full h-24 object-contain bg-slate-50 p-1"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div className="p-2">
            <p className="font-semibold text-sm leading-snug">{obj.name}</p>
            {price > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">
                {Number(price).toLocaleString("ru-RU")} ₽
              </p>
            )}
          </div>
        </div>
      );
    }

    // Problem product card (from picker)
    if (obj._t === "product-problem" && typeof obj.name === "string") {
      const imgUrl = getProductImageUrl((obj.imagePath as string | null) ?? null, 160);
      const price = typeof obj.price === "number" ? obj.price : 0;
      return (
        <div className="rounded-xl border bg-white text-slate-800 overflow-hidden w-56 shadow-sm">
          {imgUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgUrl}
              alt={obj.name}
              className="w-full h-28 object-contain bg-slate-50 p-1"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div className="p-2">
            <p className="font-semibold text-sm leading-snug mb-1">{obj.name}</p>
            {price > 0 && (
              <p className="text-xs text-slate-500 mb-2">
                {Number(price).toLocaleString("ru-RU")} ₽
              </p>
            )}
            <div className="rounded-lg bg-orange-50 border border-orange-200 px-2 py-1.5">
              <p className="text-xs font-semibold text-orange-700">
                ⚠️ {String(obj.problem ?? "")}
              </p>
            </div>
          </div>
        </div>
      );
    }
  } catch {
    // Not JSON — render as plain text
  }

  return <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>;
}
