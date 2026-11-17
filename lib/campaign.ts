/** Serializable pricing policy shared by the server, CMS preview and apps. */
export type Campaign = {
  enabled: boolean;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  usePromoPrices: boolean;
  wholesaleMin: number;
  bigWholesaleMin: number;
  discountSteps: { from: number; percent: number }[];
};
/** Compatibility only: preserves the already running promotion until the first publication. */
export const LEGACY_CAMPAIGN: Campaign = {
  enabled: true, name: "Светлая пятница + ОПТ", startsAt: "2026-11-13T00:00:00+03:00", endsAt: "2026-12-01T00:00:00+03:00",
  usePromoPrices: true, wholesaleMin: 5000, bigWholesaleMin: 25000,
  discountSteps: [{ from: 40000, percent: 2 }, { from: 100000, percent: 3 }, { from: 300000, percent: 5 }],
};
export function campaignActive(c: Campaign, now = Date.now()) {
  return c.enabled && (!c.startsAt || now >= Date.parse(c.startsAt)) && (!c.endsAt || now < Date.parse(c.endsAt));
}
export function campaignPercent(c: Campaign, subtotal: number, now = Date.now()) {
  return campaignActive(c, now) ? Math.max(0, ...c.discountSteps.filter(s => subtotal >= s.from).map(s => s.percent)) : 0;
}
