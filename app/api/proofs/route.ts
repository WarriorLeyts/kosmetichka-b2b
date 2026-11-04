import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { randomBytes } from "crypto";
import path from "path";
import { prisma } from "@/lib/prisma";
import { currentCustomerId } from "../mobile/_auth";
import { PROOF_DIR, PROOF_LIMITS, PROOF_MAX_FILES, proofType, verifyProofToken } from "@/lib/proofs";

const MB = 1024 * 1024;

/**
 * POST /api/proofs (multipart: file) — one photo / video for a wholesale application.
 * Who: an applicant right after registration (Authorization: Bearer <proofToken>, 3 days — he can't
 * sign in until approved) or a signed-in customer asking for wholesale prices. Up to 10 files.
 */
export async function POST(request: Request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const customerId = bearer ? await verifyProofToken(bearer) : await currentCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: bearer ? "Время загрузки истекло — напишите менеджеру" : "Нужно войти" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
  const t = proofType(file.name || "");
  if (!t) return NextResponse.json({ error: "Можно только фото или видео" }, { status: 400 });
  if (file.size > PROOF_LIMITS[t.kind]) {
    return NextResponse.json({ error: `Файл слишком большой (${t.kind === "video" ? "видео" : "фото"} — до ${PROOF_LIMITS[t.kind] / MB} МБ)` }, { status: 400 });
  }
  if ((await prisma.customerProof.count({ where: { customerId } })) >= PROOF_MAX_FILES) {
    return NextResponse.json({ error: `Можно отправить не больше ${PROOF_MAX_FILES} файлов` }, { status: 400 });
  }

  await mkdir(PROOF_DIR, { recursive: true });
  const name = `c${customerId}-${Date.now()}-${randomBytes(8).toString("hex")}.${t.ext}`;
  await writeFile(path.join(PROOF_DIR, name), Buffer.from(await file.arrayBuffer()));
  const row = await prisma.customerProof.create({ data: { customerId, kind: t.kind, file: name, mime: t.mime, size: file.size } });
  return NextResponse.json({ id: row.id, kind: t.kind });
}
