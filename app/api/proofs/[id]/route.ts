import { NextResponse } from "next/server";
import { open, stat } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { PROOF_DIR, verifyProofView } from "@/lib/proofs";

/**
 * GET /api/proofs/:id?t=… — a wholesale proof file for staff. The 1-hour link comes from the
 * staff customer card (/api/team/customers/:id); Range requests work, so videos play on iPhone.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const t = new URL(request.url).searchParams.get("t") || "";
  if (!Number.isInteger(id) || id <= 0 || !(await verifyProofView(t, id))) {
    return NextResponse.json({ error: "Ссылка устарела — откройте карточку клиента ещё раз" }, { status: 403 });
  }
  const proof = await prisma.customerProof.findUnique({ where: { id } });
  if (!proof) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  const full = path.join(PROOF_DIR, path.basename(proof.file));
  const size = (await stat(full).catch(() => null))?.size;
  if (!size) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": proof.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  };
  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = size - 1;
  if (range) {
    if (range[1]) start = Number(range[1]);
    if (range[2]) end = Math.min(Number(range[2]), size - 1);
    if (!range[1] && range[2]) start = Math.max(0, size - Number(range[2]));
    if (start > end || start >= size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const fh = await open(full, "r");
  const len = end - start + 1;
  const buf = Buffer.alloc(len);
  await fh.read(buf, 0, len, start);
  await fh.close();
  if (range) {
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    return new NextResponse(new Uint8Array(buf), { status: 206, headers: { ...headers, "Content-Length": String(len) } });
  }
  return new NextResponse(new Uint8Array(buf), { headers: { ...headers, "Content-Length": String(size) } });
}
