import { z } from "zod";

/**
 * A promotion's look of the site and the apps (admin panel → Акция), switched on and off by its dates:
 * the accent colour, a strip above the header, the promo banners at the top of the home page, «Со скидкой»
 * first among the quick filters. Prices and discounts stay in 1С — this is only the look.
 * No database here: the panel's browser code uses it too. Stored in CmsSetting «promo».
 */
export const PROMO_SETTINGS_KEY = "promo";

/** colours a person picks from (the brand pink first) */
export const PROMO_COLORS = [
  { hex: "#e82c87", name: "Розовый" },
  { hex: "#d6246e", name: "Малиновый" },
  { hex: "#ef4444", name: "Красный" },
  { hex: "#f97316", name: "Оранжевый" },
  { hex: "#111827", name: "Чёрный" },
  { hex: "#8b3dff", name: "Фиолетовый (как обычно)" },
] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Цвет в формате #RRGGBB");
/** a link inside the site (/catalog?quick=sale) or https:// */
const link = z
  .string()
  .trim()
  .max(300)
  .refine((s) => s === "" || /^\/(?!\/)[^\s]*$/.test(s) || /^https:\/\/[^\s]+$/.test(s), "Ссылка: /catalog?quick=sale или https://…");

export const promoSchema = z
  .object({
    enabled: z.boolean().default(false),
    name: z.string().trim().max(80).default(""),
    /** ISO time; the panel sends Moscow midnights */
    startsAt: z.string().datetime({ offset: true }).nullable().default(null),
    endsAt: z.string().datetime({ offset: true }).nullable().default(null),
    accent: hex.default("#e82c87"),
    strip: z
      .object({
        enabled: z.boolean().default(true),
        text: z.string().trim().max(120).default(""),
        link: link.default(""),
        countdown: z.boolean().default(false),
      })
      .default({ enabled: true, text: "", link: "", countdown: false }),
    /** banners (admin panel → Баннеры) shown at the top of the home page while the promotion runs */
    bannerIds: z.array(z.number().int().positive()).max(10).default([]),
    saleFirst: z.boolean().default(true),
  })
  .refine((p) => !p.startsAt || !p.endsAt || p.startsAt < p.endsAt || new Date(p.startsAt) < new Date(p.endsAt), {
    message: "Дата окончания раньше начала",
    path: ["endsAt"],
  });
export type PromoSettings = z.infer<typeof promoSchema>;

export function readPromo(raw: unknown): PromoSettings {
  const r = promoSchema.safeParse(raw ?? {});
  return r.success ? r.data : promoSchema.parse({});
}

/** runs now: switched on and inside its dates (an open end = until switched off) */
export function promoActive(p: Pick<PromoSettings, "enabled" | "startsAt" | "endsAt">, now = Date.now()): boolean {
  if (!p.enabled) return false;
  if (p.startsAt && now < Date.parse(p.startsAt)) return false;
  if (p.endsAt && now >= Date.parse(p.endsAt)) return false;
  return true;
}
