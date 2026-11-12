import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveImageUrl } from "@/lib/image";
import { PROMO_SETTINGS_KEY, promoActive, readPromo } from "@/lib/promoSchema";

export const dynamic = "force-dynamic";

/**
 * GET /api/site/promo — the promotion's look for the site and the apps (admin panel → Акция).
 * `promo: null` — nothing switched on or it is over. Otherwise its dates come too: the app switches the look
 * on and off itself at the start and the end (`active` = whether it runs right now, by the server's clock).
 */
export async function GET() {
  let raw: unknown = null;
  try {
    raw = (await prisma.cmsSetting.findUnique({ where: { key: PROMO_SETTINGS_KEY } }))?.value ?? null;
  } catch {
    raw = null;
  }
  const p = readPromo(raw);
  const now = new Date();
  if (!p.enabled || (p.endsAt && now >= new Date(p.endsAt))) {
    return NextResponse.json({ promo: null }, { headers: { "Cache-Control": "public, max-age=60" } });
  }
  const found = p.bannerIds.length
    ? await prisma.banner.findMany({ where: { id: { in: p.bannerIds }, active: true, deletedAt: null } }).catch(() => [])
    : [];
  const byId = new Map(found.map((b) => [b.id, b]));
  const banners = p.bannerIds
    .map((id) => byId.get(id))
    .filter((b): b is NonNullable<typeof b> => !!b && !!(b.imageDesktop || b.imageMobile))
    .map((b) => ({
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      buttonText: b.buttonText,
      link: b.link,
      imageDesktop: resolveImageUrl(b.imageDesktop ?? b.imageMobile),
      imageMobile: resolveImageUrl(b.imageMobile ?? b.imageDesktop),
    }));
  return NextResponse.json(
    {
      promo: {
        name: p.name,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        active: promoActive(p, now.getTime()),
        accent: p.accent,
        strip: p.strip.enabled && p.strip.text ? { text: p.strip.text, link: p.strip.link || null, countdown: p.strip.countdown } : null,
        banners,
        saleFirst: p.saleFirst,
      },
    },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
