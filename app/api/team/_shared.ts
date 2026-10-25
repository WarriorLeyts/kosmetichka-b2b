import { NextResponse } from "next/server";

/** Absolute URL for a ProductImage.path (same rule as PickerOrderClient / renderMsgContent). */
export function productImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const base = process.env.NEXT_PUBLIC_IMAGES_BASE_URL ?? "https://kosmetichka-opt.ru";
  return `${base}/api/1c/${path}`;
}

/** Parses a positive integer route id; null when invalid. */
export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** ?page=N → integer ≥ 1 (garbage → 1). */
export function parsePage(raw: string | null): number {
  const n = parseInt(raw || "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function badId() {
  return NextResponse.json({ error: "Неверный ID" }, { status: 400 });
}

export function notFound() {
  return NextResponse.json({ error: "Не найдено" }, { status: 404 });
}

export const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  picker: "Сборщик",
};

export const PRICE_TYPE_LABELS: Record<string, string> = {
  retail: "Розница",
  discount: "Скидка",
  wholesale: "Опт",
  big_wholesale: "Крупный опт",
};

/** Labels used on /admin/stats for item-check statuses */
export const CHECK_STATUS_LABELS: Record<string, string> = {
  ok: "ОК",
  out_of_stock: "Нет в наличии",
  expired: "Просрочен",
  bad_condition: "Плохой вид",
  insufficient_qty: "Не хватает",
};
