import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  const customer = await prisma.customer.findFirst({
  where: {
    OR: [
      { email },
      { phone: email },
    ],
  },
});
 
  if (!customer) {
    return NextResponse.json(
      { error: "Неверный email или пароль" },
      { status: 401 }
    );
  }
  if (!customer.email) {
  return NextResponse.json(
    { error: "У клиента отсутствует email" },
    { status: 400 }
  );
}
  

  const isValid = await bcrypt.compare(password, customer.password);

  if (!isValid) {
    return NextResponse.json(
      { error: "Неверный email или пароль" },
      { status: 401 }
    );
  }

  if (!customer.isApproved) {
    return NextResponse.json(
      { error: "Ваш аккаунт ещё не подтверждён" },
      { status: 403 }
    );
  }

    if (!customer.isActive) {
  return NextResponse.json(
    { error: "Ваш аккаунт заблокирован" },
    { status: 403 }
  );
} 
if (!customer.email) {
  return NextResponse.json(
    { error: "У клиента не указан email" },
    { status: 400 }
  );
}

const token = await createToken({
  id: customer.id,
  email: customer.email,
  role: customer.role || "customer",
});

  const cookieStore = await cookies();

  cookieStore.set("auth_token", token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({
    success: true,
  });
}