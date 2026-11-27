import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import path from "path";
import { STORIES_DIR, storyMediaType } from "@/lib/storyMedia";

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params, type = storyMediaType(name);
  if (!type) return new NextResponse(null, { status: 404 });
  const file = path.join(STORIES_DIR, name);
  let size: number;
  try { const s = await stat(file); if (!s.isFile()) return new NextResponse(null, { status: 404 }); size = s.size; } catch { return new NextResponse(null, { status: 404 }); }
  const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" };
  const range = request.headers.get("range"); let start = 0, end = size - 1;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || !(m[1] || m[2])) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2])); end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
  return new NextResponse(stream, { status: range ? 206 : 200, headers: { ...headers, "Content-Length": String(end - start + 1), ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) } });
}
