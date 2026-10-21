import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../_auth";

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
  const city = s("city");
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = { name, companyName, phone, email, city, address };

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
