import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { proofOwner } from "../_owner";
import { notifyStaffLater } from "@/lib/staffNotify";

export async function POST(request: Request) {
  const customerId = await proofOwner(request);
  if (!customerId) return NextResponse.json({ error: "Войдите в аккаунт или возобновите загрузку после регистрации" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
    const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { isActive: true, isApproved: true, roleRequest: true, proofUploadExpected: true, proofUploadCompletedAt: true } });
    if (!customer?.isActive) return null;
    const count = await tx.customerProof.count({ where: { customerId } });
    if (!count || (body?.discardFailed !== true && count < customer.proofUploadExpected)) return { error: "Загрузите хотя бы одно фото или видео и дождитесь завершения отправки выбранных файлов.", count };
    const first = !customer.proofUploadCompletedAt;
    await tx.customer.update({ where: { id: customerId }, data: { proofUploadExpected: count, proofUploadCompletedAt: new Date() } });
    return { count, notify: first && (!customer.isApproved || customer.roleRequest === "big_wholesale"), big: customer.roleRequest === "big_wholesale" };
  });
  if (!result) return NextResponse.json({ error: "Аккаунт недоступен" }, { status: 401 });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  if (result.notify) notifyStaffLater({ kind: "customer-request", customerId, request: result.big ? "big_wholesale" : "wholesale", signup: true });
  return NextResponse.json({ ok: true, count: result.count });
}
