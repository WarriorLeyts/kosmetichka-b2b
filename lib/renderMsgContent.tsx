"use client";

/**
 * Shared chat message renderer.
 * Used in: OrderChat, OrdersPageClient (inline chat), AdminOrderClient, PickerOrderClient.
 */

const IMAGES_BASE = process.env.NEXT_PUBLIC_IMAGES_BASE_URL ?? "https://kosmetichka-opt.ru";

export function getProductImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  if (imagePath.startsWith("http")) return imagePath;
  return `${IMAGES_BASE}/api/1c/${imagePath}`;
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

    // Product card (manager added from catalog)
    if (obj._t === "product" && typeof obj.name === "string") {
      const imgUrl = getProductImageUrl((obj.imagePath as string | null) ?? null);
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
      const imgUrl = getProductImageUrl((obj.imagePath as string | null) ?? null);
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
