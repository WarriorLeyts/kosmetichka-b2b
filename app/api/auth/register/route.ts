import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";

function normalizePhone(value: string | null | undefined) {
  if (!value) return "";

  const digits = String(value).replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("7")) {
    return "8" + digits.slice(1);
  }

  return digits;
}

export async function POST(request: Request) {
  const { name, phone, email, password } = await request.json();

  const cleanPhone = normalizePhone(phone);
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (!name || !cleanPhone || !cleanEmail || !password) {
    return NextResponse.json(
      {
        error: "Заполните имя, телефон, email и пароль",
      },
      {
        status: 400,
      }
    );
  }

  const exists = await prisma.customer.findFirst({
    where: {
      OR: [
        { email: cleanEmail },
        { phone: cleanPhone },
      ],
    },
  });

  if (exists) {
    return NextResponse.json(
      {
        error: "Такой клиент уже зарегистрирован",
      },
      {
        status: 400,
      }
    );
  }

  const oneCCustomer = await prisma.oneCCustomer.findFirst({
    where: {
      OR: [
        {
          phone: cleanPhone,
        },
        {
          name: {
            contains: cleanPhone,
          },
        },
      ],
    },
  });

  const hashedPassword = await bcrypt.hash(password, 10);

  const customer = await prisma.customer.create({
    data: {
      name,
      phone: cleanPhone,
      email: cleanEmail,
      password: hashedPassword,

      oneCId: oneCCustomer?.oneCId || null,

      isApproved: Boolean(oneCCustomer),
      isActive: true,

     manager: oneCCustomer?.manager || null,
     role: "customer",
     priceType: oneCCustomer?.priceType || "wholesale",
    },
  });

  if (oneCCustomer) {
    const token = await createToken({
      id: customer.id,
      email: customer.email || "",
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
  }

  return NextResponse.json({
    success: true,
    autoLogin: Boolean(oneCCustomer),
    oneCLinked: Boolean(oneCCustomer),

    message: oneCCustomer
      ? "Регистрация успешно завершена."
      : "Заявка отправлена. Ожидайте подтверждения администратора.",
  });
}