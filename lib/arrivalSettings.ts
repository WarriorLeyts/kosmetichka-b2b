import { prisma } from "@/lib/prisma";

/**
 * How long «Новинка» and «Снова в наличии» last (days), set in the admin panel (Настройки → Поступления),
 * stored in CmsSetting «arrivals». «Новинка» — the product's first arrival in the company is within newDays;
 * «Снова в наличии» — it came again within backDays. The 1С import keeps a bit more than the longer one
 * (scripts/import-arrivals.js reads the same setting).
 */
export const ARRIVAL_SETTINGS_KEY = "arrivals";
export const ARRIVAL_DEFAULTS = { newDays: 10, backDays: 10 };
export const ARRIVAL_LIMITS = { min: 1, max: 60 };
export type ArrivalSettings = typeof ARRIVAL_DEFAULTS;

const clamp = (v: unknown, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(ARRIVAL_LIMITS.max, Math.max(ARRIVAL_LIMITS.min, n)) : d;
};

export function readArrivalSettings(raw: unknown): ArrivalSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { newDays: clamp(v.newDays, ARRIVAL_DEFAULTS.newDays), backDays: clamp(v.backDays, ARRIVAL_DEFAULTS.backDays) };
}

let cache: { at: number; v: ArrivalSettings } | null = null;

/** cached a minute: the catalog asks on every request */
export async function getArrivalSettings(): Promise<ArrivalSettings> {
  if (cache && Date.now() - cache.at < 60_000) return cache.v;
  let row: { value: unknown } | null = null;
  try {
    row = await prisma.cmsSetting.findUnique({ where: { key: ARRIVAL_SETTINGS_KEY } });
  } catch {
    row = null; // no setting / DB hiccup — the defaults
  }
  const v = readArrivalSettings(row?.value);
  cache = { at: Date.now(), v };
  return v;
}

export function resetArrivalSettingsCache() {
  cache = null;
}

/** The two periods as dates. A row counts for «Новинка» if both its date and the first arrival are after newSince. */
export function arrivalWindows(s: ArrivalSettings, now = Date.now()) {
  const newSince = new Date(now - s.newDays * 86400_000);
  const backSince = new Date(now - s.backDays * 86400_000);
  return { newSince, backSince, since: newSince < backSince ? newSince : backSince };
}

/** «new» / «back» / null (too old) for one arrival row */
export function arrivalKindOf(r: { docDate: Date; firstReceiptAt: Date | null }, w: ReturnType<typeof arrivalWindows>): "new" | "back" | null {
  if (r.firstReceiptAt && r.firstReceiptAt >= w.newSince && r.docDate >= w.newSince) return "new";
  if (r.docDate >= w.backSince) return "back";
  return null;
}
