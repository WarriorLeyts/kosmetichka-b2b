import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../_auth";
import { normalizePhone } from "@/lib/phone";

const SELECT = {
  id: true,
  name: true,
  companyName: true,
  phone: true,
  email: true,
  inn: true,
  city: true,
  address: true,
  priceType: true,
  pushPromo: true,
  wholesaleAccess: true,
  roleRequest: true,
  roleRequestStatus: true,
  manager: true,
} as const;

// GET /api/mobile/profile
export async function GET() {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const customer = await prisma.customer.findUnique({ where: { id }, select: SELECT });
  if (!customer) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  return NextResponse.json({ customer });
}

const ERRORS: Record<string, string> = {
  password_mismatch: "Пароли не совпадают",
  password_too_short: "Пароль должен быть не короче 6 символов",
  email_taken: "Этот email уже используется другим аккаунтом",
  current_password_required: "Введите текущий пароль для смены пароля",
  current_password_wrong: "Текущий пароль введён неверно",
};
const fail = (code: string) => NextResponse.json({ error: ERRORS[code], code }, { status: 400 });

// PATCH /api/mobile/profile — same rules as the site's profile form
export async function PATCH(request: Request) {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const s = (k: string) => String(body?.[k] ?? "");
  const name = s("name");
  const companyName = s("companyName");
  const phone = s("phone");
  const email = s("email");
  const address = s("address");
  const currentPassword = s("currentPassword");
  const password = s("password");
  const passwordConfirm = s("passwordConfirm");

  if (email) {
    const current = await prisma.customer.findUnique({ where: { id }, select: { email: true } });
    if (email !== current?.email) {
      const taken = await prisma.customer.findFirst({ where: { email, NOT: { id } } });
      if (taken) return fail("email_taken");
    }
  }

  // Another customer's phone can't be taken over (phone is used as a login)
  if (phone.trim()) {
    const current = await prisma.customer.findUnique({ where: { id }, select: { phone: true } });
    if (phone !== current?.phone) {
      const variants = Array.from(new Set([phone, phone.trim(), normalizePhone(phone)].filter(Boolean)));
      const taken = await prisma.customer.findFirst({
        where: { phone: { in: variants }, NOT: { id } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json(
          { error: "Этот телефон уже используется другим аккаунтом", code: "phone_taken" },
          { status: 409 }
        );
      }
    }
  }

  // «Акции и новости» toggle alone: { pushPromo: true|false } without the rest of the form
  if (typeof body?.pushPromo === "boolean" && Object.keys(body).length === 1) {
    const customer = await prisma.customer.update({ where: { id }, data: { pushPromo: body.pushPromo }, select: SELECT });
    return NextResponse.json({ success: true, customer });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { name, companyName, phone, email, address }; // «Город» is no longer asked (the address has it)

  if (password.trim()) {
    if (!currentPassword.trim()) return fail("current_password_required");
    const stored = await prisma.customer.findUnique({ where: { id }, select: { password: true } });
    const ok = stored ? await bcrypt.compare(currentPassword, stored.password) : false;
    if (!ok) return fail("current_password_wrong");
    if (password !== passwordConfirm) return fail("password_mismatch");
    if (password.length < 6) return fail("password_too_short");
    data.password = await bcrypt.hash(password, 10);
  }

  const customer = await prisma.customer.update({ where: { id }, data, select: SELECT });
  return NextResponse.json({ success: true, customer });
}

/**
 * DELETE /api/mobile/profile { password } — the customer deletes their account (App Store /
 * Google Play requirement, 152-ФЗ). Personal data is erased; orders stay (accounting) but no
 * longer point to a person; the account is blocked, so every session ends at once.
 */
export async function DELETE(request: Request) {
  const id = await currentCustomerId();
  if (!id) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const password = String(body?.password ?? "");
  const stored = await prisma.customer.findUnique({ where: { id }, select: { password: true, email: true } });
  const ok = stored && password ? await bcrypt.compare(password, stored.password) : false;
  if (!ok) return NextResponse.json({ error: "Неверный пароль", code: "current_password_wrong" }, { status: 400 });

  const random = await bcrypt.hash(crypto.randomUUID(), 10);
  await prisma.$transaction([
    prisma.wishlistItem.deleteMany({ where: { customerId: id } }),
    prisma.pushToken.deleteMany({ where: { customerId: id } }),
    prisma.webPushSubscription.deleteMany({ where: { customerId: id } }),
    prisma.notification.deleteMany({ where: { customerId: id } }),
    ...(stored?.email ? [prisma.passwordResetToken.deleteMany({ where: { email: stored.email } })] : []),
    prisma.customer.update({
      where: { id },
      data: {
        name: "Удалённый аккаунт",
        companyName: null,
        phone: null,
        email: null,
        inn: null,
        city: null,
        address: null,
        loyaltyCard: null,
        oneCId: null,
        password: random,
        isActive: false,
        roleRequest: null,
        roleRequestStatus: null,
        roleRequestedAt: null,
      },
    }),
  ]);
  console.log(`[account] customer ${id} deleted their account`);

  const res = NextResponse.json({ success: true });
  res.cookies.delete("auth_token");
  return res;
}
