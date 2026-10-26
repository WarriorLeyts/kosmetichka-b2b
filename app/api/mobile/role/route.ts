import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../_auth";
import { sendMail } from "@/lib/mail";
import { roleChangeLimiter } from "@/lib/rateLimit";
import { ROLE_LABELS, isSwitchTarget, roleInfo, switchDecision } from "@/lib/roles";

const SELECT = {
  id: true,
  name: true,
  companyName: true,
  phone: true,
  inn: true,
  priceType: true,
  wholesaleAccess: true,
  roleRequest: true,
  roleRequestStatus: true,
} as const;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// GET /api/mobile/role — current price type, what the customer can switch to, request state
export async function GET() {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const c = await prisma.customer.findUnique({ where: { id }, select: SELECT });
  if (!c) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  return NextResponse.json(roleInfo(c));
}

/**
 * POST /api/mobile/role { priceType: "retail" | "wholesale" | "big_wholesale", companyName?, inn? }
 * Switches at once when allowed (retail ↔ granted wholesale level); otherwise saves a request
 * for an admin (same as a wholesale registration). Response: role info + { switched | requested }.
 */
export async function POST(request: Request) {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const target = body?.priceType;
  if (!isSwitchTarget(target)) return NextResponse.json({ error: "Неизвестный тип цен" }, { status: 400 });

  if (!roleChangeLimiter.check(`role:${id}`).ok) {
    return NextResponse.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
  }

  const c = await prisma.customer.findUnique({ where: { id }, select: SELECT });
  if (!c) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const decision = switchDecision(c, target);

  if (decision === "same") return NextResponse.json({ ...roleInfo(c), switched: false });
  if (decision === "forbidden") {
    return NextResponse.json({ error: "Этот тип цен недоступен" }, { status: 403 });
  }

  if (decision === "switch") {
    // A request is kept only while it asks for more than the customer already has
    const keepRequest = isSwitchTarget(c.roleRequest) && switchDecision(c, c.roleRequest) === "request";
    const updated = await prisma.customer.update({
      where: { id },
      data: {
        priceType: target,
        // fix the granted level so switching to retail doesn't lose it
        wholesaleAccess: roleInfo(c).wholesaleAccess,
        ...(keepRequest ? {} : { roleRequest: null, roleRequestStatus: null, roleRequestedAt: null }),
      },
      select: SELECT,
    });
    console.log(`[role] customer ${id}: ${c.priceType} → ${target}`);
    return NextResponse.json({ ...roleInfo(updated), switched: true });
  }

  // decision === "request"
  if (c.roleRequestStatus === "pending" && c.roleRequest === target) {
    return NextResponse.json({ ...roleInfo(c), requested: true });
  }

  const companyName = String(body?.companyName ?? "").trim().slice(0, 200);
  const inn = String(body?.inn ?? "").trim().replace(/\s+/g, "").slice(0, 20);
  if (inn && !/^\d{10}(\d{2})?$/.test(inn)) {
    return NextResponse.json({ error: "ИНН — 10 или 12 цифр" }, { status: 400 });
  }

  const updated = await prisma.customer.update({
    where: { id },
    data: {
      roleRequest: target,
      roleRequestStatus: "pending",
      roleRequestedAt: new Date(),
      ...(companyName ? { companyName } : {}),
      ...(inn ? { inn } : {}),
    },
    select: SELECT,
  });
  console.log(`[role] customer ${id}: request ${c.priceType} → ${target}`);

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const base = process.env.NEXT_PUBLIC_BASE_URL || "https://kosmetichka-opt.ru";
    const who = esc(updated.companyName || updated.name || updated.phone || `#${id}`);
    sendMail({
      to: adminEmail,
      subject: `Заявка на «${ROLE_LABELS[target]}» — ${who}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;">
          <h2 style="margin:0 0 16px;font-size:20px;color:#1e293b;">Заявка на тип цен «${ROLE_LABELS[target]}»</h2>
          <p style="margin:0 0 8px;color:#475569;"><b>Клиент:</b> ${who}</p>
          ${updated.phone ? `<p style="margin:0 0 8px;color:#475569;"><b>Телефон:</b> ${esc(updated.phone)}</p>` : ""}
          ${updated.inn ? `<p style="margin:0 0 8px;color:#475569;"><b>ИНН:</b> ${esc(updated.inn)}</p>` : ""}
          <p style="margin:0 0 24px;color:#475569;"><b>Сейчас:</b> ${ROLE_LABELS[c.priceType] ?? esc(c.priceType)}</p>
          <a href="${base}/admin/customers/${id}"
             style="display:inline-block;padding:12px 28px;background:#6366f1;color:#fff;font-weight:700;text-decoration:none;border-radius:12px;">
            Открыть клиента
          </a>
        </div>`,
    }).catch(console.error);
  }

  return NextResponse.json({ ...roleInfo(updated), requested: true });
}

// DELETE /api/mobile/role — withdraw a pending request (or hide a rejected one)
export async function DELETE() {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const updated = await prisma.customer.update({
    where: { id },
    data: { roleRequest: null, roleRequestStatus: null, roleRequestedAt: null },
    select: SELECT,
  });
  return NextResponse.json(roleInfo(updated));
}
