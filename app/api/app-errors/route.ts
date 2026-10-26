import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { currentCustomerId } from "../mobile/_auth";

// Errors / crashes from the apps. Open endpoint: rate-limited per IP, sizes capped,
// phones and e-mails masked; the same error (app + message + top of the stack) is one row with a counter.
const limiter = new RateLimiter({ windowMs: 10 * 60 * 1000, max: 20 });

const mask = (s: string) =>
  s
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>")
    .replace(/(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g, "<phone>");
const str = (v: unknown, max: number) => mask(String(v ?? "").slice(0, max));

export async function POST(request: Request) {
  if (!limiter.check(`apperr:${getClientIp(request)}`).ok) return NextResponse.json({ ok: true });
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return NextResponse.json({ ok: false }, { status: 400 });

  const app = b.app === "team" ? "team" : "customer";
  const platform = b.platform === "ios" ? "ios" : b.platform === "android" ? "android" : "other";
  const message = str(b.message, 1000) || "Неизвестная ошибка";
  const stack = str(b.stack, 6000) || null;
  const screen = str(b.screen, 200) || null;
  const version = str(b.version, 100) || null;
  const fatal = b.fatal === true;
  // group by the first meaningful stack lines (numbers in messages vary, e.g. ids)
  const top = (stack ?? "").split("\n").slice(0, 4).join("\n");
  const hash = createHash("sha1").update([app, platform, message.replace(/\d+/g, "#"), top].join("|")).digest("hex");
  const customerId = await currentCustomerId().catch(() => null);

  try {
    const row = await prisma.appError.upsert({
      where: { hash },
      create: { hash, app, platform, version, message, stack, screen, fatal, customers: customerId ? [customerId] : [] },
      update: { count: { increment: 1 }, lastAt: new Date(), version, screen, ...(fatal ? { fatal: true } : {}) },
      select: { id: true, customers: true },
    });
    if (customerId && !row.customers.includes(customerId) && row.customers.length < 200) {
      await prisma.appError.update({ where: { id: row.id }, data: { customers: { push: customerId } } });
    }
  } catch (e) {
    console.error("[app-errors] save failed:", e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ok: true });
}
