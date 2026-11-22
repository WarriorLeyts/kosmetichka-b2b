import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { randomBytes } from "crypto";
import path from "path";
import { prisma } from "@/lib/prisma";
import { PROOF_DIR, PROOF_LIMITS, PROOF_MAX_FILES, proofType } from "@/lib/proofs";
import { processProofImage } from "@/lib/proofImage";
import { proofOwner } from "./_owner";

export async function GET(request: Request) {
  const customerId = await proofOwner(request);
  if (!customerId) return NextResponse.json({ error: "Нужно войти или возобновить загрузку после регистрации" }, { status: 401 });
  const [files, customer] = await Promise.all([
    prisma.customerProof.findMany({ where: { customerId }, orderBy: { id: "asc" }, select: { id: true, uploadId: true, kind: true, size: true } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { proofUploadExpected: true, proofUploadCompletedAt: true } }),
  ]);
  return NextResponse.json({ files, expected: customer?.proofUploadExpected ?? 0, completed: Boolean(customer?.proofUploadCompletedAt) }, { headers: { "Cache-Control": "no-store" } });
}

/** A durable upload ID makes retries safe even when the first response was lost. */
export async function POST(request: Request) {
  const customerId = await proofOwner(request);
  if (!customerId) return NextResponse.json({ error: "Время загрузки истекло или аккаунт недоступен. Войдите в аккаунт или напишите в поддержку." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Файл не найден или пуст" }, { status: 400 });
  const uploadId = typeof form?.get("uploadId") === "string" ? String(form.get("uploadId")) : null;
  if (uploadId && !/^[a-zA-Z0-9-]{8,80}$/.test(uploadId)) return NextResponse.json({ error: "Некорректный идентификатор загрузки" }, { status: 400 });
  const t = proofType(file.name || "");
  if (!t) return NextResponse.json({ error: "Можно только фото или видео" }, { status: 400 });
  if (file.size > PROOF_LIMITS[t.kind]) return NextResponse.json({ error: `Файл слишком большой: ${t.kind === "img" ? "фото — до 15 МБ" : "видео — до 50 МБ"}` }, { status: 400 });
  if (uploadId) {
    const existing = await prisma.customerProof.findUnique({ where: { customerId_uploadId: { customerId, uploadId } }, select: { id: true, kind: true, size: true } });
    if (existing) return NextResponse.json(existing);
  }
  let bytes: Buffer = Buffer.from(await file.arrayBuffer());
  if (t.kind === "img") {
    try { bytes = await processProofImage(bytes); }
    catch { return NextResponse.json({ error: "Не удалось обработать фото. Выберите другой снимок или отправьте его в формате JPG/PNG." }, { status: 400 }); }
  }
  await mkdir(PROOF_DIR, { recursive: true });
  const name = `c${customerId}-${Date.now()}-${randomBytes(8).toString("hex")}.${t.kind === "img" ? "jpg" : t.ext}`;
  const target = path.join(PROOF_DIR, name);
  await writeFile(target, bytes);
  try {
    const row = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
      const active = await tx.customer.findUnique({ where: { id: customerId }, select: { isActive: true } });
      if (!active?.isActive) throw new Error("Аккаунт недоступен");
      if (uploadId) {
        const existing = await tx.customerProof.findUnique({ where: { customerId_uploadId: { customerId, uploadId } }, select: { id: true, kind: true, size: true, file: true } });
        if (existing) return existing;
      }
      if (await tx.customerProof.count({ where: { customerId } }) >= PROOF_MAX_FILES) throw new Error(`Можно отправить не больше ${PROOF_MAX_FILES} файлов`);
      return tx.customerProof.create({ data: { customerId, uploadId, kind: t.kind, file: name, mime: t.kind === "img" ? "image/jpeg" : t.mime, size: bytes.length } });
    });
    if (row.file !== name) await unlink(target).catch(() => {});
    return NextResponse.json({ id: row.id, kind: row.kind, size: row.size });
  } catch (e) {
    await unlink(target).catch(() => {});
    const message = e instanceof Error ? e.message : "";
    const known = message === "Аккаунт недоступен" || message === `Можно отправить не больше ${PROOF_MAX_FILES} файлов`;
    if (!known) console.warn("[proofs] Could not commit uploaded file");
    return NextResponse.json({ error: known ? message : "Не удалось сохранить файл. Повторите загрузку." }, { status: known ? 400 : 503 });
  }
}
