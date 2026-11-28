import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { foreignContactPhone, normalizePhone, registrationEmail, toSmsAeroPhone } from "@/lib/phone";

const PRICE_TYPES = ["retail", "wholesale", "big_wholesale", "franchise"];
class DuplicateCustomer extends Error {}

/** Admin-created accounts use the existing customer login; no customer session or messages are sent. */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (admin.role !== "admin") return NextResponse.json({ error: "Создавать клиентов может только администратор" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  if (["name", "phone", "email", "companyName", "address"].some(key => body[key] !== undefined && typeof body[key] !== "string")) return NextResponse.json({ error: "Проверьте контактные данные клиента" }, { status: 400 });
  const text = (key: string) => typeof body[key] === "string" ? body[key].trim() : "";
  const name = text("name"), rawPhone = text("phone"), rawEmail = text("email");
  const companyName = text("companyName"), address = text("address");
  const password = typeof body.password === "string" ? body.password : "";
  const priceType = body.priceType ?? "retail";
  const email = rawEmail ? registrationEmail(rawEmail) : null;
  const smsPhone = /^[+\d\s().-]+$/.test(rawPhone) ? toSmsAeroPhone(rawPhone) : null;
  const phone = smsPhone ? normalizePhone(smsPhone) : foreignContactPhone(rawPhone);
  if (!name || name.length > 160) return NextResponse.json({ error: "Укажите имя клиента (до 160 символов)" }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Укажите полный телефон с кодом страны" }, { status: 400 });
  if (rawEmail && (!email || email.length > 120)) return NextResponse.json({ error: "Проверьте email (до 120 символов)" }, { status: 400 });
  if (password.length < 6 || Buffer.byteLength(password, "utf8") > 72) return NextResponse.json({ error: "Пароль должен содержать не менее 6 символов и не быть слишком длинным" }, { status: 400 });
  if (!PRICE_TYPES.includes(priceType)) return NextResponse.json({ error: "Выберите тип цен" }, { status: 400 });
  if (body.isApproved !== undefined && typeof body.isApproved !== "boolean") return NextResponse.json({ error: "Неверный статус подтверждения" }, { status: 400 });
  if (companyName.length > 250 || address.length > 500) return NextResponse.json({ error: "Сократите название компании или адрес" }, { status: 400 });
  if (priceType !== "retail" && address.length < 5) return NextResponse.json({ error: "Для оптового клиента укажите адрес доставки" }, { status: 400 });

  const hashedPassword = await bcrypt.hash(password, 10);
  // Serializable retries also protect the optional email login from concurrent admin creations.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const customer = await prisma.$transaction(async (tx) => {
        const exists = await tx.customer.findFirst({ where: { OR: [{ phone }, ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : [])] }, select: { id: true } });
        if (exists) throw new DuplicateCustomer();
        const created = await tx.customer.create({ data: {
          name, phone, email, companyName: companyName || null, address: address || null,
          password: hashedPassword, role: "customer", priceType,
          wholesaleAccess: ["wholesale", "big_wholesale"].includes(priceType) ? priceType : null,
          isApproved: body.isApproved ?? true, isActive: true,
          // Manually entered contacts are not SMS ownership verification. Cards and counterparties
          // are explicitly linked later in the customer card, never guessed from this number.
          phoneUnverified: true,
        }, select: { id: true, phone: true, email: true, isApproved: true, priceType: true } });
        await tx.adminAuditLog.create({ data: {
          userId: Number(admin.id), userName: String(admin.email ?? "admin"), action: "create", entity: "customer", entityId: String(created.id),
          summary: `Создан аккаунт клиента №${created.id}`, after: { priceType: created.priceType, isApproved: created.isApproved },
        } });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return NextResponse.json({ success: true, customer }, { status: 201 });
    } catch (error) {
      if (error instanceof DuplicateCustomer || (error as { code?: string })?.code === "P2002") {
        return NextResponse.json({ error: "Клиент с таким телефоном или email уже существует. Найдите его в разделе «Клиенты»." }, { status: 409 });
      }
      if ((error as { code?: string })?.code === "P2034" && attempt < 2) continue;
      console.error("[admin/customer-create] Account transaction failed");
      return NextResponse.json({ error: "Не удалось создать аккаунт. Повторите попытку." }, { status: 503 });
    }
  }
  return NextResponse.json({ error: "Не удалось создать аккаунт. Повторите попытку." }, { status: 503 });
}
